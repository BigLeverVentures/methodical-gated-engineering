import { test } from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture, source } from './helpers.js';
import { validateBatch } from '../core/budget.js';
import { digest, type ProofEvent } from '../core/contracts.js';
import { publish } from '../core/checkpoint.js';
import { requiredSeats } from '../core/policy.js';
import { cells, report, type Cell, type RunRecord } from '../evaluation/report.js';
import { freezeOracle } from '../evaluation/oracle.js';
test('integrated report retains whole denominator and rejects incomplete or misleading success',()=>{
 const batch=validateBatch(JSON.parse(fs.readFileSync(path.join(source,'evaluation/proposed-batch.json'),'utf8')));
 const pending:RunRecord[]=batch.runs.map(p=>({id:p.id,caseId:'fixture',status:'pending',measurement:null,events:[],root:null,oracle:null,oracleEvidence:null,checkpoint:null,lesson:null}));
 a.equal(report(batch,[],pending,{}).decision,'limited-or-no-go');
 a.throws(()=>report(batch,[],pending.slice(1),{}),/denominator/);
 a.throws(()=>report(batch,[],[...pending.slice(1),pending[1]!],{}),/duplicate/);
 const f=fixture();const parent=fs.mkdtempSync(path.join(os.tmpdir(),'proof-report-'));
 try{
  fs.writeFileSync(path.join(f.root,'calc.py'),'def total(values):\n return sum(values)\ndef mean(values):\n if not values: raise ValueError("empty")\n return sum(values)/len(values)\n');
  const index=path.join(f.root,'docs/solutions/README.md');const initialIndexHash=digest(fs.readFileSync(index));
  const lessonPath='docs/solutions/batch.md';fs.writeFileSync(path.join(f.root,lessonPath),'Observed a single-pass batch. Materialize it before reuse.');
  fs.appendFileSync(index,'\n[batch](batch.md)\n');
  execFileSync('git',['-C',f.root,'add','.']);execFileSync('git',['-C',f.root,'commit','-qm','fix synthetic fixture']);
  const head=execFileSync('git',['-C',f.root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  publish(f.root,'codex',{...f.work,lessons:[lessonPath]});
  const oracle=freezeOracle(path.join(source,'evaluation/oracles'),path.join(parent,'oracle'));
  // Test-owned catalog stands in for operator verification; these are not live receipts.
  const ev={kind:'operator' as const,ref:'synthetic-operator',sha256:digest('synthetic verified evidence')};
  const oracleEvidence={kind:'operator' as const,ref:'synthetic-oracle',sha256:digest(JSON.stringify(oracle.hashes))};
  const catalog={[ev.ref]:ev,[oracleEvidence.ref]:oracleEvidence};
  const probe={first:[2,4,6],second:[]};
  const lesson={path:lessonPath,probe,initialIndexHash,assessment:{correct:true,lessonHash:digest(fs.readFileSync(path.join(f.root,lessonPath))),probeHash:digest(JSON.stringify(probe)),indexHash:digest(fs.readFileSync(index)),evidence:ev}};
  const runs:RunRecord[]=batch.runs.map(p=>{
   const events:ProofEvent[]=requiredSeats('full').flatMap((seat,i)=>{
    const base={schemaVersion:1 as const,eventId:p.id+':'+i,runId:p.id,caseId:'fixture',host:p.host,sessionId:'s',seatId:seat,sequence:i*2,at:'2026-10-15T00:00:00Z',planHash:f.work.planHash,candidate:head,evidence:ev};
    return [{...base,kind:'seat-invoked' as const,data:{seat}},{...base,eventId:base.eventId+':done',sequence:i*2+1,kind:'seat-completed' as const,data:{seat,material:false}}];
   });
   return {id:p.id,caseId:'fixture',status:'pass',events,root:f.root,oracle,oracleEvidence,checkpoint:'current',lesson,
    measurement:{runId:p.id,host:p.host,kind:p.kind,startedAt:'2026-10-15T00:00:00Z',endedAt:'2026-10-15T00:00:01Z',quality:true,findings:0,reopened:0,reviewCycles:1,reworkAttempts:0,checkpointMs:1,reconstructionMistakes:0,roles:p.seats.map(role=>({role,tokens:null,provenance:'unavailable' as const,basis:'synthetic unit test, no live usage',settings:[]}))}};
  });
  const rows:Cell[]=(['claude-code','codex'] as const).flatMap(host=>cells.map(id=>({host,id,status:'pass' as const,evidence:[ev],runIds:[host+'-routine-guidance']})));
  a.equal(report(batch,rows,runs,catalog).decision,'go');
  const bad=runs.map(r=>({...r}));bad[0]={...bad[0]!,measurement:{...bad[0]!.measurement!,roles:bad[0]!.measurement!.roles.slice(1)}};
  a.throws(()=>report(batch,rows,bad,catalog),/all-role/);
  bad[0]={...runs[0]!,measurement:{...runs[0]!.measurement!,quality:false}};
  a.throws(()=>report(batch,rows,bad,catalog),/quality/);
  bad[0]={...runs[0]!,events:[]};a.throws(()=>report(batch,rows,bad,catalog),/review/);
  fs.appendFileSync(path.join(f.root,'calc.py'),'# unreviewed');a.throws(()=>report(batch,rows,runs,catalog),/unreviewed/);
 }finally{f.cleanup();fs.rmSync(parent,{recursive:true,force:true});}
});
