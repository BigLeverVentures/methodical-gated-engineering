import { test } from 'node:test';
import * as a from 'node:assert/strict';
import { decide, headroom, seatSetting, type PolicyInput } from '../core/policy.js';
import { event, profile, validateStream, digest, type Host } from '../core/contracts.js';
import { baseline } from './helpers.js';
function input(host: Host): PolicyInput {
  const p=baseline(host);
  return {role:'worker',risk:'full',task:'demanding',policy:'adaptive',failure:'none',evidenceIds:[],
    attempts:0,reviewCycles:0,escalations:0,available:Object.values(p.choices),rejectedModels:[],remainingRequests:5};
}
for (const host of ['claude-code','codex'] as const) {
  test(`${host}: baseline, feedback escalation and risk floor`, () => {
    const p=baseline(host); const i=input(host); const first=decide(p,i);
    a.deepEqual(first.setting,p.choices.demanding);
    const next=decide(p,{...i,failure:'diligence',evidenceIds:['failed-check'],attempts:1});
    a.deepEqual(next.setting,p.choices.diligence); a.deepEqual(next.requiredSeats,first.requiredSeats);
    a.deepEqual(seatSetting(p,'rigor','full'),p.choices.backstop);
    a.equal(decide(p,{...i,task:'deterministic'}).action,'tool');
    a.equal(decide(p,{...i,failure:'environment'}).action,'stop');
    a.equal(decide(p,{...i,remainingRequests:0}).action,'stop');
    a.equal(decide(p,{...i,attempts:2}).action,'stop');
    a.equal(decide(p,{...i,failure:'recurring',evidenceIds:['f'],escalations:1}).action,'stop');
    a.throws(()=>decide(p,{...i,failure:'diligence'}),/evidence/);
    a.deepEqual(decide(p,{...i,policy:'guidance',failure:'diligence'}).setting,first.setting);
  });
  test(`${host}: rejected setting never clears a required review`,()=>{
    const p=baseline(host); const i=input(host);
    const d=decide(p,{...i,rejectedModels:Object.values(p.choices).map(s=>s.model)});
    a.equal(d.action,'stop'); a.ok(d.reviewDebt.includes('backstop'));
    const fallback=decide(p,{...i,available:[p.choices.worker!]});
    a.equal(fallback.action,'model'); a.ok(fallback.reviewDebt.length>0);
    const invalid=structuredClone(p); invalid.sources[0]!.url='https://example.invalid/models';
    a.throws(()=>profile(invalid),/unofficial/);
  });
}
test('usage totals and missing thresholds do not become context headroom',()=>{
  a.equal(headroom({used:100,window:1000,compactAt:800,source:'cumulative'}).remaining,null);
  a.equal(headroom({used:100,window:1000,compactAt:null,source:'observed'}).remaining,null);
  a.equal(headroom({used:100,window:1000,compactAt:800,source:'observed'}).remaining,700);
});
test('event validation rejects fabricated authority, duplicate events and stale approvals',()=>{
  const h=digest('plan');
  const raw={schemaVersion:1,eventId:'a',runId:'r',caseId:'c',host:'codex',sessionId:'s',seatId:'parent',sequence:1,
    at:'2026-10-15T00:00:00Z',kind:'decision-requested',planHash:h,candidate:'candidate',
    evidence:{kind:'operator',ref:'operator-record',sha256:digest('operator')},data:{requestId:'q',scope:'mean',action:'implement'}};
  const approved={...raw,eventId:'b',sequence:2,kind:'decision-granted'};
  a.equal(validateStream([raw,approved],'r','c').length,2);
  a.throws(()=>event({...approved,evidence:{...raw.evidence,kind:'helper'}}),/operator/);
  a.throws(()=>validateStream([raw,{...approved,planHash:digest('changed')}],'r','c'),/stale/);
  a.throws(()=>validateStream([raw,raw],'r','c'),/duplicate/);
  a.throws(()=>validateStream([raw],'r','another'),/wrong/);
  a.throws(()=>event({...raw,schemaVersion:2}),/schema/);
  a.throws(()=>event({...raw,kind:'made-up'}),/shape/);
});
