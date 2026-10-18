import { GuardSession } from '../guard/operator.js';
import { assert, digest, integer, object, text, hash, evidence, type Host, type Evidence } from './contracts.js';
type SourceCatalog = Record<string,{kind:Evidence['kind'];sha256:string}>;
function trustedEvidence(e:Evidence,catalog:SourceCatalog,native:boolean):void {
 const x=catalog[e.ref];assert(x&&x.kind===e.kind&&x.sha256===e.sha256,'untrusted budget evidence');
 if(native)assert(e.kind==='runtime'||e.kind==='operator','budget needs observed/operator evidence');
}
export type RunLimit = { id:string; host:Host; kind:'work'|'recovery'|'cancellation'; requests:number; inputTokens:number; outputTokens:number; seconds:number; seats:string[] };
export type Batch = { schemaVersion:1; id:string; profileHashes:Record<Host,string>; runs:RunLimit[]; status:'proposed' };
export type Capability = { host:Host; profileHash:string; isolationVerified:boolean; settingsVerified:boolean;
  limit:'native-tested'|'operator-qualified'|'unverified'; cancellationVerified:boolean;
  maximumOvershootTokens:number|null; evidence:Evidence[] };
export function validateBatch(value:unknown): Batch {
  const v=object(value);assert(v.schemaVersion===1&&v.status==='proposed','invalid batch schema/status');text(v.id);
  const p=object(v.profileHashes);
  for(const h of ['claude-code','codex'])assert(/^[a-f0-9]{64}$/.test(text(p[h])),'missing frozen profile hash');
  assert(Array.isArray(v.runs)&&v.runs.length>0,'batch has no runs');const ids=new Set<string>();
  for(const raw of v.runs){const r=object(raw);const id=text(r.id);assert(!ids.has(id),'duplicate run');ids.add(id);
    assert(['claude-code','codex'].includes(String(r.host)),'unknown run host');
    assert(['work','recovery','cancellation'].includes(String(r.kind)),'unknown budget run kind');
    for(const k of ['requests','inputTokens','outputTokens','seconds'])assert(integer(r[k])>0,'run limits must be positive');
    assert(Array.isArray(r.seats)&&r.seats.length>0&&r.seats.every(x=>typeof x==='string'),'missing all-seat coverage');
  }
  return v as Batch;
}
export function readyForOperator(batch:Batch, approval:unknown, caps:Capability[], catalog:SourceCatalog, guard?:GuardSession): { ready:true; runs:RunLimit[] } {
  validateBatch(batch);
  for(const raw of caps){const c=object(raw);
    assert(c.host==='claude-code'||c.host==='codex','invalid capability host');hash(c.profileHash);
    for(const k of ['isolationVerified','settingsVerified','cancellationVerified'])assert(typeof c[k]==='boolean','capability flags must be boolean');
    assert(['native-tested','operator-qualified','unverified'].includes(String(c.limit)),'invalid capability limit');
    if(c.maximumOvershootTokens!==null)integer(c.maximumOvershootTokens);
    assert(Array.isArray(c.evidence)&&c.evidence.length>0,'capabilities lack evidence');c.evidence.forEach(evidence);
  }
  assert(new Set(caps.map(c=>c.host)).size===caps.length,'duplicate capabilities');
  const a=object(approval);
  assert(a.origin==='human'&&a.batchId===batch.id&&a.manifestHash===digest(JSON.stringify(batch)),'missing or stale human batch approval');
  assert(a.capabilitiesHash===digest(JSON.stringify(caps)),'missing or stale capability approval');
  trustedEvidence(a.evidence as Evidence,catalog,true);
  for(const h of new Set(batch.runs.map(r=>r.host))){
    const c=caps.find(c=>c.host===h);
    assert(c&&c.profileHash===batch.profileHashes[h]&&c.isolationVerified===true&&c.settingsVerified===true,'native isolation/settings remain unverified');
    assert(c.limit!=='unverified'&&c.cancellationVerified===true&&c.maximumOvershootTokens!==null,'native limit/cancellation or finite exposure unverified');
    integer(c.maximumOvershootTokens);assert(c.evidence.length>0,'capabilities lack evidence');
    c.evidence.forEach(e=>trustedEvidence(e,catalog,true));
  }
  GuardSession.requireNative(guard,digest(JSON.stringify(batch)));
  return {ready:true,runs:batch.runs};
}
