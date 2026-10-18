import { test } from 'node:test';
import * as a from 'node:assert/strict';
import { readyForOperator, validateBatch, type Batch, type Capability } from '../core/budget.js';
import { digest } from '../core/contracts.js';
const ev={kind:'operator' as const,ref:'operator-confirmation',sha256:digest('human record')};
const b:Batch={schemaVersion:1,id:'batch',status:'proposed',profileHashes:{'claude-code':digest('c'),codex:digest('o')},
 runs:[{id:'work-1',host:'codex',kind:'work',requests:4,inputTokens:1000,outputTokens:1000,seconds:60,seats:['worker','rigor']}]};
const approvalBase={origin:'human',batchId:b.id,manifestHash:digest(JSON.stringify(b)),evidence:ev};
const cap:Capability={host:'codex',profileHash:b.profileHashes.codex,isolationVerified:true,settingsVerified:true,limit:'operator-qualified',cancellationVerified:true,maximumOvershootTokens:100,evidence:[ev]};
const approval={...approvalBase,capabilitiesHash:digest(JSON.stringify([cap]))};
test('live protocol stays closed without exact approval and qualified native controls',()=>{
 a.throws(()=>readyForOperator(b,{},[cap],{[ev.ref]:ev}),/approval/);
 a.throws(()=>readyForOperator(b,approval,[{...cap,isolationVerified:false}],{[ev.ref]:ev}),/unverified|capability approval/);
 a.throws(()=>readyForOperator(b,approval,[{...cap,limit:'unverified'}],{[ev.ref]:ev}),/unverified|capability approval/);
 a.throws(()=>readyForOperator(b,approval,[{...cap,maximumOvershootTokens:null}],{[ev.ref]:ev}),/unverified|capability approval/);
 a.throws(()=>readyForOperator(b,approval,[cap],{}),/untrusted/);
 a.throws(()=>readyForOperator(b,approval,[{...cap,maximumOvershootTokens:1000000000000}],{[ev.ref]:ev}),/capability approval/);
 a.throws(()=>readyForOperator(b,approval,[{...cap,isolationVerified:'false'}] as unknown as Capability[],{[ev.ref]:ev}),/boolean/);
 a.throws(()=>readyForOperator(b,{...approval,manifestHash:digest(JSON.stringify({...b,profileHashes:{...b.profileHashes,codex:digest('changed')}}))},[cap],{[ev.ref]:ev}),/approval/);
 a.throws(()=>readyForOperator(b,approval,[cap],{[ev.ref]:ev}),/runtime guard/);
 a.throws(()=>readyForOperator({...b,id:'changed'},approval,[cap],{[ev.ref]:ev}),/approval/);
 a.throws(()=>validateBatch({...b,runs:[b.runs[0],b.runs[0]]}),/duplicate/);
});
