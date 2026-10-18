import { test } from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { freezeOracle, scoreCode, newLesson, trustedEvidence, verifyFinalReview } from '../evaluation/oracle.js';
import { measurements, report } from '../evaluation/report.js';
import { validateStream, digest, type ProofEvent } from '../core/contracts.js';
import { execFileSync } from 'node:child_process';
import { validateBatch } from '../core/budget.js';
import { fixture, source } from './helpers.js';
test('editing public smoke checks cannot turn a bad candidate green; oracle integrity is checked',()=>{
  const f=fixture();const parent=fs.mkdtempSync(path.join(os.tmpdir(),'proof-oracle-'));
  try{
    const oracle=freezeOracle(path.join(source,'evaluation/oracles'),path.join(parent,'trusted'));
    const shipped=fs.readFileSync(path.join(f.root,'calc.py'),'utf8');
    a.equal(scoreCode(f.root,oracle).passed,false);
    fs.writeFileSync(path.join(f.root,'calc.py'),shipped.replace('return 0.0','raise ValueError("empty input")'));
    a.equal(scoreCode(f.root,oracle).passed,true);
    fs.writeFileSync(path.join(f.root,'calc.py'),shipped);
    fs.writeFileSync(path.join(f.root,'checks.py'),'print("pass")');a.equal(scoreCode(f.root,oracle).passed,false);
    fs.writeFileSync(path.join(f.root,'calc.py'),'def total(values):\n return sum(values)\ndef mean(values):\n if not values: raise ValueError("empty")\n return sum(values)/len(values)\n');
    a.equal(scoreCode(f.root,oracle).passed,true);
    a.throws(()=>scoreCode(f.root,{...oracle,hashes:{}}),/incomplete/);
    fs.writeFileSync(path.join(f.root,'calc.py'),"import os\nos.write(1, b'{\"passed\":true,\"problems\":[]}')\nos._exit(0)\n");
    a.equal(scoreCode(f.root,oracle).passed,false);
    fs.writeFileSync(path.join(f.root,'calc.py'),'def total(values, /):\n return sum(values)\ndef mean(values):\n if not values: raise ValueError("empty")\n return sum(values)/len(values)\n');
    a.equal(scoreCode(f.root,oracle).passed,false);
    fs.chmodSync(path.join(oracle.directory,'score.py'),0o600);fs.appendFileSync(path.join(oracle.directory,'score.py'),'# changed');
    a.throws(()=>scoreCode(f.root,oracle),/integrity/);
  }finally{f.cleanup();fs.rmSync(parent,{recursive:true,force:true});}
});
test('safe list and tuple materialization score equally without permitting unsafe calls',()=>{
  const f=fixture();const parent=fs.mkdtempSync(path.join(os.tmpdir(),'proof-materialization-'));
  try{
    const oracle=freezeOracle(path.join(source,'evaluation/oracles'),path.join(parent,'trusted'));
    const candidate=(body:string):string=>`def total(values):\n return sum(values)\ndef mean(values):\n${body}\n`;
    for(const constructor of ['list','tuple']){
      fs.writeFileSync(path.join(f.root,'calc.py'),candidate(
        ` items = ${constructor}(values)\n if not items: raise ValueError("empty")\n return sum(items)/len(items)`));
      a.deepEqual(scoreCode(f.root,oracle),{passed:true,problems:[]},constructor);
      fs.writeFileSync(path.join(f.root,'calc.py'),candidate(
        ` ${constructor} = list\n items = ${constructor}(values)\n if not items: raise ValueError("empty")\n return sum(items)/len(items)`));
      a.equal(scoreCode(f.root,oracle).passed,false,`${constructor} rebinding`);
    }
    for(const expression of ['eval("1")','__import__("os")','open("not-a-fixture-input")','values.__class__(values)']){
      fs.writeFileSync(path.join(f.root,'calc.py'),candidate(
        ` items = ${expression}\n if not items: raise ValueError("empty")\n return sum(items)/len(items)`));
      a.equal(scoreCode(f.root,oracle).passed,false,expression);
    }
    for(const definition of ['@list\ndef mean(values):','def mean(values=list()):']){
      fs.writeFileSync(path.join(f.root,'calc.py'),
        `def total(values):\n return sum(values)\n${definition}\n if not values: raise ValueError("empty")\n return sum(values)/len(values)\n`);
      a.equal(scoreCode(f.root,oracle).passed,false,definition);
    }
  }finally{f.cleanup();fs.rmSync(parent,{recursive:true,force:true});}
});
test('no-op, wrong, unindexed and evidence-free lessons cannot certify compound',()=>{
  const f=fixture();const parent=fs.mkdtempSync(path.join(os.tmpdir(),'proof-lesson-'));
  try{
    const oracle=freezeOracle(path.join(source,'evaluation/oracles'),path.join(parent,'trusted'));
    const index=path.join(f.root,'docs/solutions/README.md');const initial=digest(fs.readFileSync(index));
    const probe={first:[2,4,6],second:[]};const lesson='docs/solutions/batches.md';
    a.equal(newLesson(f.root,oracle,lesson,probe,initial),false);
    fs.writeFileSync(path.join(f.root,lesson),'single-pass-batch: single-pass; materialize. '+digest(JSON.stringify(probe)));
    a.equal(newLesson(f.root,oracle,lesson,probe,initial),false);
    fs.appendFileSync(index,'\n[batches](batches.md)\n');const ev={kind:'operator' as const,ref:'semantic-grade',sha256:digest('trusted correct assessment')};
    const grade={correct:true,lessonHash:digest(fs.readFileSync(path.join(f.root,lesson))),probeHash:digest(JSON.stringify(probe)),indexHash:digest(fs.readFileSync(index)),evidence:ev};
    a.equal(newLesson(f.root,oracle,lesson,probe,initial,grade,{[ev.ref]:ev}),true);
    fs.writeFileSync(path.join(f.root,lesson),'This is NOT single-pass. Never materialize; consume the same iterator twice.');
    a.equal(newLesson(f.root,oracle,lesson,probe,initial,grade,{[ev.ref]:ev}),false);
    a.equal(newLesson(f.root,oracle,lesson,probe,initial,{...grade,correct:false},{[ev.ref]:ev}),false);
    fs.writeFileSync(path.join(f.root,lesson),'Use lists.');a.equal(newLesson(f.root,oracle,lesson,probe,initial),false);
  }finally{f.cleanup();fs.rmSync(parent,{recursive:true,force:true});}
});
test('helper-generated and fabricated receipts cannot certify a native cell',()=>{
  const ev={kind:'helper' as const,ref:'a',sha256:digest('hook')};
  a.throws(()=>trustedEvidence(ev,{a:ev},true),/cannot certify/);
  a.throws(()=>trustedEvidence({...ev,kind:'runtime'},{a:ev},true),/mismatch/);
  const batch=validateBatch(JSON.parse(fs.readFileSync(path.join(source,'evaluation/proposed-batch.json'),'utf8')));
  a.throws(()=>report(batch,[],[],{}),/denominator/);
});
test('measurement records require timing, outcome, counts and explicit resource missingness',()=>{
  const m={runId:'r',host:'codex',kind:'work',startedAt:'2026-10-15T00:00:00Z',endedAt:'2026-10-15T00:00:02Z',
    quality:false,findings:1,reopened:0,reviewCycles:1,reworkAttempts:1,checkpointMs:0,reconstructionMistakes:0,
    roles:[{role:'worker',tokens:null,provenance:'unavailable',basis:'host did not report usage',settings:[]}]};
  a.equal(measurements(m).quality,false);
  a.throws(()=>measurements({...m,reviewCycles:undefined}),/integer/);
  a.throws(()=>measurements({...m,roles:[{...m.roles[0],tokens:0}]}),/not zero/);
  a.throws(()=>measurements({...m,endedAt:'invalid'}),/timing/);
});

test('final review rejects dirty work, relabeled seats and latest material review',()=>{
 const f=fixture();
 try{
  const head=execFileSync('git',['-C',f.root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const ev={kind:'operator' as const,ref:'review',sha256:digest('trusted review')};
  const base={schemaVersion:1 as const,runId:'r',caseId:'c',host:'codex' as const,sessionId:'s',seatId:'seat',at:'2026-10-15T00:00:00Z',planHash:f.work.planHash,candidate:head,evidence:ev};
  const events:ProofEvent[]=[{...base,eventId:'invoke',sequence:0,kind:'seat-invoked',data:{seat:'rigor'}},
   {...base,eventId:'complete',sequence:1,kind:'seat-completed',data:{seat:'rigor',material:false}}];
  verifyFinalReview(f.root,events,['rigor'],{[ev.ref]:ev});
  a.throws(()=>validateStream([events[0],{...events[1],data:{seat:'backstop',material:false}}],'r','c'),/invocation/);
  a.throws(()=>verifyFinalReview(f.root,[...events,{...events[1]!,eventId:'later',sequence:2,data:{seat:'rigor',material:true}}],['rigor'],{[ev.ref]:ev}),/missing current/);
  fs.appendFileSync(path.join(f.root,'calc.py'),'# unreviewed');
  a.throws(()=>verifyFinalReview(f.root,events,['rigor'],{[ev.ref]:ev}),/unreviewed/);
 }finally{f.cleanup();}
});
