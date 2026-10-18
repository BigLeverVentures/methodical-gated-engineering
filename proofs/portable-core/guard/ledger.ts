import { tariff, quote, actualCost, type Tariff } from './tariff.js';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import { assert, manifest, freeze, fingerprint, integer, positive, text, object, exact, usage, type GuardManifest, type Scope, type Quote, type Usage, type Cap } from './contracts.js';
export type Attempt = {id:string;scope:Scope;quote:Quote;state:'reserved'|'dispatched'|'settled'|'uncertain';cost:number;output:number;usage:Usage|null};
type Grant = {hash:string;scope:Scope};
type State = {schemaVersion:1;ledgerId:string;manifestHash:string;revision:number;lastAt:number;stopped:string|null;owner:string;grants:Grant[];attempts:Attempt[]};
const sameScope = (a:Scope,b:Scope) => a.stage===b.stage && a.host===b.host && a.run===b.run;
function validateState(value: unknown, m: GuardManifest,t:Tariff): State {
  const v=object(value);exact(v,['schemaVersion','ledgerId','manifestHash','revision','lastAt','stopped','owner','grants','attempts']);
  assert(v.schemaVersion===1 && v.manifestHash===fingerprint(m),'ledger manifest mismatch');integer(v.revision);integer(v.lastAt);text(v.owner);text(v.ledgerId);
  assert(v.stopped===null||typeof v.stopped==='string','corrupt stop latch');
  assert(Array.isArray(v.grants)&&Array.isArray(v.attempts),'corrupt ledger');
  const ids=new Set<string>();
  for(const g of v.grants){const x=object(g);exact(x,['hash','scope']);text(x.hash);const sc=object(x.scope);
    assert(m.allocations.some(a=>sameScope(a,sc as Scope)),'corrupt grant');}
  for(const raw of v.attempts){const a=object(raw);exact(a,['id','scope','quote','state','cost','output','usage']);
    const id=text(a.id);assert(!ids.has(id),'duplicate attempt');ids.add(id);
    assert(m.allocations.some(x=>sameScope(x,object(a.scope) as Scope)),'corrupt attempt scope');
    const q=object(a.quote);exact(q,['microUsd','inputTokens','generatedTokens','model','tariffHash','requestHash']);
    for(const k of ['microUsd','inputTokens','generatedTokens'])positive(q[k]);text(q.model);
    assert(q.tariffHash===m.tariffHash && /^[a-f0-9]{64}$/.test(text(q.requestHash)),'corrupt quote');
    const expected=quote(t,(object(a.scope) as Scope).host,text(q.model),{});
    assert(q.microUsd===expected.microUsd&&q.inputTokens===expected.inputTokens&&q.generatedTokens===expected.generatedTokens,'corrupt tariff reservation');
    assert(['reserved','dispatched','settled','uncertain'].includes(String(a.state)),'corrupt attempt state');
    integer(a.cost);integer(a.output);assert(Number(a.cost)<=Number(q.microUsd)&&Number(a.output)<=Number(q.generatedTokens),'corrupt accounting');
    if(a.state==='settled'){const u=usage(a.usage);assert(u.outputTokens===a.output&&u.inputTokens<=Number(q.inputTokens),'corrupt settlement');assert(a.cost===actualCost(t,q as Quote,u),'corrupt settled cost');}
    else assert(a.usage===null&&a.cost===q.microUsd&&a.output===q.generatedTokens,'unsettled reservation lost');
  }
  return v as State;
}
function total(attempts:Attempt[]):Cap {
  const sum=(pick:(a:Attempt)=>number)=>{const v=attempts.reduce((n,a)=>n+BigInt(pick(a)),0n);assert(v<=BigInt(Number.MAX_SAFE_INTEGER),'sum overflow');return Number(v);};
  return {microUsd:sum(a=>a.cost),requests:attempts.length,generatedTokens:sum(a=>a.output)};
}
function within(attempts:Attempt[],cap:Cap):void {const t=total(attempts);assert(t.microUsd<=cap.microUsd&&t.requests<=cap.requests&&t.generatedTokens<=cap.generatedTokens,'budget exhausted');}
type SettlementDecision='duplicate'|'conflict'|'exceeded'|'hold'|'apply'|'invalid';
function settlementDecision(a:Attempt,u:Usage):SettlementDecision {
  // Select a complete transition before mutating persistence. Terminal records never become
  // partial holds; every nonterminal state still observes evidence of a broken envelope.
  if(a.state==='settled')return fingerprint(a.usage)===fingerprint(u)?'duplicate':'conflict';
  if(u.inputTokens>a.quote.inputTokens||u.outputTokens>a.quote.generatedTokens)return 'exceeded';
  switch(a.state){case 'uncertain':return 'hold';case 'dispatched':return 'apply';case 'reserved':return 'invalid';}
}
export class Ledger {
  readonly manifest:GuardManifest;
  private readonly db:DatabaseSync;
  private readonly owner=randomUUID();
  private failed=false;
  private readonly tariff:Tariff;
  private constructor(readonly path:string, m:GuardManifest, t:Tariff, fresh:boolean, private readonly now:()=>number) {
    this.manifest=freeze(manifest(m));this.tariff=freeze(tariff(t));assert(fingerprint(this.tariff)===this.manifest.tariffHash,'tariff mismatch');this.db=new DatabaseSync(path,{open:true});
    try {this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; PRAGMA busy_timeout=0;');
    this.transact(s=>{if(!fresh){s.stopped=s.stopped??'restart requires operator reconciliation';for(const a of s.attempts)if(a.state==='reserved'||a.state==='dispatched')a.state='uncertain';}s.owner=this.owner;});}catch(e){this.db.close();throw e;}
  }
  static create(path:string,m:GuardManifest,t:Tariff,now=Date.now):{ledger:Ledger;tokens:Record<string,string>} {
    m=manifest(m);t=tariff(t);assert(fingerprint(t)===m.tariffHash,'tariff mismatch');const fd=fs.openSync(path,'wx',0o600);fs.closeSync(fd);
    const tokens:Record<string,string>={};const grants=m.allocations.map(a=>{const token=randomBytes(32).toString('hex');tokens[a.run]=token;return {hash:fingerprint(token),scope:{stage:a.stage,host:a.host,run:a.run}};});
    const db=new DatabaseSync(path);
    try {db.exec('PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON; CREATE TABLE ledger (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);');
      db.prepare('INSERT INTO ledger VALUES (1,?)').run(JSON.stringify({schemaVersion:1,ledgerId:randomUUID(),manifestHash:fingerprint(m),revision:0,lastAt:now(),stopped:null,owner:'initializing',grants,attempts:[]}));
    } finally {db.close();}
    return {ledger:new Ledger(path,m,t,true,now),tokens};
  }
  static open(path:string,m:GuardManifest,t:Tariff,now=Date.now):Ledger {assert(fs.existsSync(path),'missing ledger');return new Ledger(path,m,t,false,now);}
  private load():State {const row=this.db.prepare('SELECT body FROM ledger WHERE id=1').get();assert(row&&typeof row.body==='string','missing ledger state');return validateState(JSON.parse(row.body),this.manifest,this.tariff);}
  private transact<T>(fn:(s:State)=>T):T {
    assert(!this.failed,'ledger failed closed');
    try {this.db.exec('BEGIN IMMEDIATE');const s=this.load();const result=fn(s);s.revision++;this.db.prepare('UPDATE ledger SET body=? WHERE id=1').run(JSON.stringify(s));this.db.exec('COMMIT');return result;}
    catch(e){try{this.db.exec('ROLLBACK');}catch{/* A broken connection remains unusable. */}this.failed=true;throw e;}
  }
  private clock(s:State):void {const now=integer(this.now());if(now<s.lastAt)s.stopped=s.stopped??'wall-clock reset';if(now>=this.manifest.expiresAt)s.stopped=s.stopped??'stage expired';s.lastAt=Math.max(now,s.lastAt);}
  private owned(s:State):void {assert(s.owner===this.owner,'stale ledger owner');}
  reserve(token:string,model:string,body:unknown):Attempt {
    const result=this.transact(s=>{
      this.owned(s);this.clock(s);
      if(s.stopped)return {error:s.stopped};
      const hash=fingerprint(token);const grant=s.grants.find(g=>timingSafeEqual(Buffer.from(g.hash),Buffer.from(hash)));
      if(!grant)return {error:'invalid scoped token'};
      const q=quote(this.tariff,grant.scope.host,model,body);
      if(s.attempts.filter(a=>a.state!=='settled').length>=this.manifest.maxConcurrent)return {error:'concurrency exhausted'};
      const attempt:Attempt={id:randomUUID(),scope:{...grant.scope},quote:structuredClone(q),state:'reserved',cost:q.microUsd,output:q.generatedTokens,usage:null};
      const next=[...s.attempts,attempt];
      try {within(next,this.manifest.total);within(next.filter(a=>a.scope.stage===grant.scope.stage),this.manifest.stages[grant.scope.stage]!);
        within(next.filter(a=>a.scope.host===grant.scope.host),this.manifest.hosts[grant.scope.host]);
        within(next.filter(a=>a.scope.run===grant.scope.run),this.manifest.allocations.find(a=>sameScope(a,grant.scope))!.cap);
      }catch{return {error:'budget exhausted'};}
      s.attempts.push(attempt);return {attempt:structuredClone(attempt)};
    });
    if('error' in result)throw new Error(result.error);return result.attempt;
  }
  authenticate(token:string):Scope {const s=this.load();const h=fingerprint(token);const g=s.grants.find(g=>g.hash===h);assert(g,'invalid scoped token');return {...g.scope};}
  dispatch(id:string):void {this.transact(s=>{this.owned(s);this.clock(s);assert(!s.stopped,'admission closed before dispatch');const a=s.attempts.find(a=>a.id===id);assert(a?.state==='reserved','invalid dispatch');a.state='dispatched';});}
  uncertain(id:string):void {this.transact(s=>{this.owned(s);const a=s.attempts.find(a=>a.id===id);assert(a,'unknown attempt');if(a.state!=='settled')a.state='uncertain';});}
  settle(id:string,u:Usage):void {
    const result=this.transact(s=>{
      this.owned(s);const a=s.attempts.find(a=>a.id===id);assert(a,'unknown attempt');u=usage(u);
      const transition=settlementDecision(a,u);
      switch(transition){
        case 'duplicate':return {};
        case 'conflict':s.stopped='conflicting terminal usage';return {error:s.stopped};
        case 'exceeded':s.stopped='usage exceeds reservation envelope';a.state='uncertain';return {error:s.stopped};
        case 'hold':return {error:'uncertain hold is permanent'};
        case 'invalid':s.stopped='settlement before dispatch';return {error:s.stopped};
        case 'apply':{
          const microUsd=actualCost(this.tariff,a.quote,u);
          assert(microUsd<=a.quote.microUsd,'invalid tariff envelope');
          Object.assign(a,{state:'settled',usage:u,cost:microUsd,output:u.outputTokens});return {};
        }
      }
    });if(result.error)throw new Error(result.error);
  }

  stop(reason:string):void {this.transact(s=>{this.owned(s);s.stopped=s.stopped??text(reason);});}
  snapshot():{ledgerId:string;manifestHash:string;revision:number;stopped:string|null;totals:Cap;attempts:Attempt[]} {
    assert(!this.failed,'ledger failed closed');const s=this.load();this.owned(s);
    return {ledgerId:s.ledgerId,manifestHash:s.manifestHash,revision:s.revision,stopped:s.stopped,totals:total(s.attempts),attempts:structuredClone(s.attempts)};
  }
  close():void {this.db.close();this.failed=true;}
}
