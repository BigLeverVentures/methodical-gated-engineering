import { validateBatch, type Batch } from '../core/budget.js';
import { validateStream, digest, setting, effort, evidence, type Receipt } from '../core/contracts.js';
import { readCheckpoint } from '../core/checkpoint.js';
import { requiredSeats } from '../core/policy.js';
import { assert, integer, object, text, type Host, type Evidence } from '../core/contracts.js';
import { trustedEvidence, scoreCode, newLesson, verifyFinalReview, type Frozen, type LessonAssessment, type SourceCatalog } from './oracle.js';
export const cells=['F1','G1','G2','G3','A1','A2','A3','C1','C2','C3','C4','C5','C6','E1'] as const;
export type Cell = { host: Host; id: typeof cells[number]; status:'pass'|'fail'|'pending'|'unavailable'; evidence: Evidence[]; runIds:string[] };
export type Measurement = { runId:string; host:Host; kind:'work'|'recovery'|'cancellation';
  startedAt:string; endedAt:string; quality:boolean|null; findings:number; reopened:number; reviewCycles:number;
  reworkAttempts:number; checkpointMs:number; reconstructionMistakes:number;
  roles:{role:string;tokens:number|null;provenance:'observed'|'estimated'|'unavailable';basis:string; settings:Receipt[]}[] };
export function measurements(value: unknown): Measurement {
  const v=object(value);text(v.runId);
  assert(v.host==='claude-code'||v.host==='codex','unknown measurement host');
  assert(['work','recovery','cancellation'].includes(String(v.kind)),'unknown run kind');
  const start=Date.parse(text(v.startedAt)),end=Date.parse(text(v.endedAt));
  assert(Number.isFinite(start)&&Number.isFinite(end)&&end>=start,'invalid run timing');
  assert(v.quality===null||typeof v.quality==='boolean','missing quality outcome');
  for(const k of ['findings','reopened','reviewCycles','reworkAttempts','checkpointMs','reconstructionMistakes'])integer(v[k]);
  assert(Array.isArray(v.roles)&&v.roles.length>0,'missing all-role resource records');
  for(const raw of v.roles){const r=object(raw);text(r.role);text(r.basis);
    assert(['observed','estimated','unavailable'].includes(String(r.provenance)),'invalid usage provenance');
    assert(Array.isArray(r.settings),'missing requested/configured/observed setting records');
    for(const rawReceipt of r.settings){const q=object(rawReceipt);
      if(q.requested!==null)setting(q.requested);if(q.configured!==null)setting(q.configured);
      if(q.observedModel!==null)text(q.observedModel);if(q.observedEffort!==null)effort(q.observedEffort);
      assert(Array.isArray(q.evidence),'missing receipt provenance');q.evidence.forEach(evidence);
      if(q.observedModel!==null||q.observedEffort!==null)assert(q.evidence.some(e=>object(e).kind==='runtime'),'observed setting needs runtime evidence');
    }
    if(r.provenance==='unavailable')assert(r.tokens===null,'unavailable is not zero');else integer(r.tokens);
  }
  return v as Measurement;
}
export type RunRecord = { id:string; status:'pass'|'fail'|'stopped'|'pending'; measurement:Measurement|null;
  caseId:string; events:unknown[]; root:string|null; oracle:Frozen|null; oracleEvidence:Evidence|null;
  checkpoint:'current'|'stale'|'absent'|null;
  lesson:{path:string;probe:unknown;initialIndexHash:string;assessment:LessonAssessment}|null };
export function report(batch:Batch, records:Cell[], runs:RunRecord[], catalog:SourceCatalog): {
 decision:string; pending:string[]; runs:number; failures:number; measurements:(Measurement|null)[]; limits:string[] } {
  validateBatch(batch);const unique=new Set<string>();const runIds=new Set<string>();
  assert(runs.length===batch.runs.length,'incomplete batch denominator');
  for(const r of runs){
    assert(!runIds.has(r.id),'duplicate measured run');runIds.add(r.id);
    const planned=batch.runs.find(p=>p.id===r.id);assert(planned,'unplanned run');
    assert(['pass','fail','stopped','pending'].includes(r.status),'invalid run status');text(r.caseId);
    assert(Array.isArray(r.events),'missing event stream');
    const events=validateStream(r.events,r.id,r.caseId);
    events.forEach(e=>{assert(e.host===planned.host,'event host mismatch');trustedEvidence(e.evidence,catalog,true);});
    if(r.status==='pending'){assert(r.measurement===null,'pending run already measured');continue;}
    const m=measurements(r.measurement);
    assert(m.runId===r.id&&m.host===planned.host&&m.kind===planned.kind,'measurement identity mismatch');
    for(const role of m.roles)for(const receipt of role.settings)receipt.evidence.forEach(e=>trustedEvidence(e,catalog,e.kind==='runtime'));
    const roles=m.roles.map(x=>x.role);
    assert(new Set(roles).size===roles.length&&roles.length===planned.seats.length&&planned.seats.every(s=>roles.includes(s)),'incomplete all-role measurements');
    if(r.status!=='pass')continue;
    assert(m.quality===true,'successful run lacks independent quality outcome');
    if(planned.kind==='work'){
      assert(r.root&&r.oracle&&r.oracleEvidence,'work lacks independent candidate/oracle');
      trustedEvidence(r.oracleEvidence,catalog,true);
      assert(r.oracleEvidence.sha256===digest(JSON.stringify(r.oracle.hashes)),'unbound frozen oracle');
      assert(scoreCode(r.root,r.oracle).passed,'candidate fails independent scorer');
      verifyFinalReview(r.root,events,requiredSeats('full'),catalog);
    }
    if(r.checkpoint!==null){
      assert(r.root,'checkpoint run lacks repository');const c=readCheckpoint(r.root);
      const observed=c.current?'current':c.checkpoint?'stale':'absent';
      assert(observed===r.checkpoint,'checkpoint state mismatch');
    }
    if(r.lesson){
      assert(r.root&&r.oracle&&r.oracleEvidence,'lesson lacks independent oracle');
      trustedEvidence(r.oracleEvidence,catalog,true);
      assert(r.oracleEvidence.sha256===digest(JSON.stringify(r.oracle.hashes)),'unbound frozen oracle');
      assert(newLesson(r.root,r.oracle,r.lesson.path,r.lesson.probe,r.lesson.initialIndexHash,r.lesson.assessment,catalog),'lesson evidence/assessment failed');
    }
  }
  for(const c of records){
    assert(cells.includes(c.id)&&['claude-code','codex'].includes(c.host),'unknown acceptance cell');
    assert(['pass','fail','pending','unavailable'].includes(c.status),'unknown cell status');
    const key=c.host+':'+c.id;assert(!unique.has(key),'duplicate acceptance cell');unique.add(key);
    if(c.status==='pass'){
      assert(c.evidence.length>0,'pass without evidence');c.evidence.forEach(e=>trustedEvidence(e,catalog,true));
      assert(Array.isArray(c.runIds)&&c.runIds.length>0,'pass lacks measured run links');
      for(const id of c.runIds){const r=runs.find(r=>r.id===id);assert(r&&r.status==='pass'&&r.measurement?.host===c.host,'cell links unsuccessful or wrong-host run');}
      if(['C1','C2','C4','C5'].includes(c.id))assert(c.runIds.some(id=>{const r=runs.find(r=>r.id===id)!;return r.lesson&&r.checkpoint==='current';}),'recovery cell lacks current checkpoint/new lesson evidence');
    }
  }
  const pending:string[]=[];
  for(const h of ['claude-code','codex'])for(const id of cells){
    const row=records.find(c=>c.host===h&&c.id===id);if(!row||row.status!=='pass')pending.push(h+':'+id);
  }
  for(const r of runs)if(r.status!=='pass')pending.push('run:'+r.id);
  // A full decision must cover the approved pilot, not a diagnostic or a narrowed manifest.
  const expected:string[]=[];
  for(const h of ['claude-code','codex']){
    for(const c of ['routine','material'])for(const p of ['guidance','adaptive'])expected.push(`${h}-${c}-${p}`);
    for(const c of ['manual-compact','automatic-compact','fresh-session','cross-host-destination','stale-dirty','decline-interrupt','cancellation'])expected.push(`${h}-${c}`);
  }
  for(const id of expected)if(!runIds.has(id))pending.push('missing-pilot-run:'+id);
  return {decision:pending.length?'limited-or-no-go':'go',pending,runs:runs.length,failures:runs.filter(r=>r.status==='fail').length,
    measurements:runs.map(r=>r.measurement),limits:['Lifecycle semantics require trusted operator review of source evidence.','One frozen pilot batch does not establish savings or superiority.','Unknown executed effort and unavailable billing remain unknown.']};
}
