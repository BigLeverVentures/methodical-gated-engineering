import { test } from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { guardManifest,ledgerFixture,rates } from './guard-fixture.js';
import { Ledger } from '../guard/ledger.js';
import { fingerprint,manifest } from '../guard/contracts.js';
import { cost,quote,actualCost,tariff } from '../guard/tariff.js';
const q=()=>quote(rates,'codex','mock-codex',{input:'synthetic'});
const token=(f:ReturnType<typeof ledgerFixture>)=>{const t=f.tokens['codex-run'];a.ok(t);return t;};
test('reservations bind run identity, durably precede dispatch and bound concurrent exposure',async()=>{
 const m=guardManifest();m.total.microUsd=80_000;const f=ledgerFixture(m);
 try {
  const attempts=await Promise.allSettled(Array.from({length:5},()=>Promise.resolve().then(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}))));
  a.equal(attempts.filter(x=>x.status==='fulfilled').length,2);
  a.equal(f.ledger.snapshot().totals.microUsd,78_000);
  a.throws(()=>f.ledger.reserve('forged','mock-codex',{}),/token/);
  const x=f.ledger.snapshot().attempts[0];a.ok(x);a.equal(x.state,'reserved');a.equal(x.scope.run,'codex-run');
  const db=new DatabaseSync(f.file,{readOnly:true});try{a.match(String(db.prepare('SELECT body FROM ledger').get()?.body),new RegExp(x.id));}finally{db.close();}
  f.ledger.dispatch(x.id);a.equal(f.ledger.snapshot().attempts[0]?.state,'dispatched');
 }finally{f.cleanup();}
});
test('each cap dimension rejects the next reservation without enlarging authority',()=>{
 for(const dimension of ['total','stage','host','run','output','requests','concurrency'] as const){
  const m=guardManifest();
  if(dimension==='total')m.total.microUsd=39_000;
  if(dimension==='stage')m.stages.canary!.microUsd=39_000;
  if(dimension==='host')m.hosts.codex.microUsd=39_000;
  if(dimension==='run')m.allocations[1]!.cap.microUsd=39_000;
  if(dimension==='output')m.total.generatedTokens=4000;
  if(dimension==='requests')m.total.requests=1;
  if(dimension==='concurrency')m.maxConcurrent=1;
  const f=ledgerFixture(m);try{f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'});a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}),/exhausted/);a.equal(f.ledger.snapshot().attempts.length,1);}finally{f.cleanup();}
 }
});
test('settlement is idempotent, consumes attempt slots and never reclaims uncertain holds',()=>{
 const f=ledgerFixture();try{
  const x=f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'});f.ledger.dispatch(x.id);const u={inputTokens:10,outputTokens:10};const c=actualCost(rates,q(),u);
  f.ledger.settle(x.id,u);const before=f.ledger.snapshot().totals;
  f.ledger.settle(x.id,u);a.deepEqual(f.ledger.snapshot().totals,before);a.equal(before.requests,1);
  const y=f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'});f.ledger.dispatch(y.id);f.ledger.uncertain(y.id);
  a.throws(()=>f.ledger.settle(y.id,u),/permanent/);a.equal(f.ledger.snapshot().attempts[1]?.cost,q().microUsd);
  a.throws(()=>f.ledger.settle(x.id,{inputTokens:11,outputTokens:10}),/conflicting/);
  a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}),/conflicting/);
 }finally{f.cleanup();}
});
test('usage above any envelope latches stop and retains worst-case reservation',()=>{
 const f=ledgerFixture();try{const x=f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'});f.ledger.dispatch(x.id);
  a.throws(()=>f.ledger.settle(x.id,{inputTokens:1001,outputTokens:1}),/envelope/);
  a.equal(f.ledger.snapshot().attempts[0]?.cost,q().microUsd);a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}),/envelope/);
 }finally{f.cleanup();}
});
test('cancel, restart, missing/corrupt ledger and stale owner fail closed',()=>{
 const f=ledgerFixture();try{
  const x=f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'});f.ledger.dispatch(x.id);
  const second=Ledger.open(f.file,f.m,rates);try{
   a.throws(()=>second.reserve(token(f),'mock-codex',{input:'synthetic'}),/restart/);a.equal(second.snapshot().attempts[0]?.state,'uncertain');
   a.equal(second.snapshot().totals.microUsd,q().microUsd);a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}),/stale/);
  }finally{second.close();}
 }finally{f.cleanup();}
 const c=ledgerFixture();try{c.ledger.stop('operator cancel');a.throws(()=>c.ledger.reserve(token(c),'mock-codex',{input:'synthetic'}),/cancel/);a.throws(()=>Ledger.create(c.file,c.m,rates),/EEXIST/);
  a.throws(()=>Ledger.open(c.file+'-missing',c.m,rates),/missing/);
  c.ledger.close();fs.writeFileSync(c.file,'corrupt');a.throws(()=>Ledger.open(c.file,c.m,rates));
 }finally{c.cleanup();}
});
test('wall-clock rollback, expiration, storage lock and manifest replacement deny admission',()=>{
 for(const which of ['rollback','expiry','lock','manifest'] as const){
  let now=Date.now();const m=guardManifest(),f=ledgerFixture(m,()=>now);let lock:DatabaseSync|undefined;
  try {
   if(which==='rollback')now-=1000;
   if(which==='expiry')now=m.expiresAt;
   if(which==='lock'){lock=new DatabaseSync(f.file);lock.exec('BEGIN EXCLUSIVE');}
   if(which==='manifest')a.throws(()=>Ledger.open(f.file,{...m,id:'changed'},rates),/manifest/);
   else a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}));
  }finally{if(lock){lock.exec('ROLLBACK');lock.close();}f.cleanup();}
 }
});
test('integer rounding and synthetic tariff validation reject unsupported financial claims',()=>{
 const r=rates.rates[0];a.ok(r);a.equal(cost({...r,inputMicroPerMillion:1,outputMicroPerMillion:1},1,1),1);
 a.throws(()=>cost({...r,inputMicroPerMillion:Number.MAX_SAFE_INTEGER},Number.MAX_SAFE_INTEGER,1),/overflow/);
 a.throws(()=>tariff({...rates,mode:'live'}),/mock/);
 a.throws(()=>tariff({...rates,rates:[{...r,model:'unqualified-provider-model'}]}),/synthetic/);
 a.throws(()=>manifest({...guardManifest(),mode:'live-qualified'}),/offline/);
 a.throws(()=>manifest({...guardManifest(),extra:true}),/unknown/);
 a.throws(()=>quote(rates,'claude-code','mock-codex',{}),/allowlisted/);
});
test('deterministic mixed request/settlement/cancel sequence conserves reserved exposure',()=>{
 const f=ledgerFixture();try{
  for(let n=0;n<8;n++){
   const x=f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'});f.ledger.dispatch(x.id);
   if(n%3===0)f.ledger.uncertain(x.id);
   else {const u={inputTokens:n+1,outputTokens:n+1};f.ledger.settle(x.id,u);}
   const s=f.ledger.snapshot();a.equal(s.totals.microUsd,s.attempts.reduce((v,x)=>v+x.cost,0));
   a.ok(s.totals.microUsd<=f.m.total.microUsd);a.equal(s.totals.requests,n+1);
  }
  a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{input:'synthetic'}),/exhausted/);a.equal(f.ledger.snapshot().manifestHash,fingerprint(f.m));
 }finally{f.cleanup();}
});

test('ledger derives reservations and settlement from protected tariffs, never caller prices',()=>{
 const f=ledgerFixture();try{
  a.throws(()=>f.ledger.reserve(token(f),'mock-claude',{}),/allowlisted/);
 }finally{f.cleanup();}
 const g=ledgerFixture();try{const x=g.ledger.reserve(token(g),'mock-codex',{microUsd:1,inputTokens:1,outputTokens:1});
  a.equal(x.quote.microUsd,39_000);a.equal(x.quote.generatedTokens,4000);a.equal(x.quote.inputTokens,1000);
  g.ledger.dispatch(x.id);g.ledger.settle(x.id,{inputTokens:10,outputTokens:10});a.equal(g.ledger.snapshot().totals.microUsd,120);
 }finally{g.cleanup();}
});
test('conflicting excessive callback after success preserves a readable stopped ledger across restart',()=>{
 const f=ledgerFixture();try{
  const x=f.ledger.reserve(token(f),'mock-codex',{});f.ledger.dispatch(x.id);f.ledger.settle(x.id,{inputTokens:10,outputTokens:10});
  a.throws(()=>f.ledger.settle(x.id,{inputTokens:1001,outputTokens:10}),/conflicting/);
  a.equal(f.ledger.snapshot().attempts[0]?.state,'settled');a.equal(f.ledger.snapshot().totals.microUsd,120);
  f.ledger.close();const next=Ledger.open(f.file,f.m,rates);try{a.match(String(next.snapshot().stopped),/conflicting/);a.equal(next.snapshot().totals.microUsd,120);a.throws(()=>next.reserve(token(f),'mock-codex',{}),/conflicting/);}finally{next.close();}
 }finally{f.cleanup();}
});
test('uncertain upstream attempts retain concurrency slots even when the local transport stops',()=>{
 const m=guardManifest();m.maxConcurrent=1;const f=ledgerFixture(m);try{
  const x=f.ledger.reserve(token(f),'mock-codex',{});f.ledger.dispatch(x.id);f.ledger.uncertain(x.id);
  a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{}),/concurrency/);a.equal(f.ledger.snapshot().totals.microUsd,39000);
 }finally{f.cleanup();}
});
test('reload recomputes tariff reservations and successful settlements instead of trusting disk amounts',()=>{
 for(const which of ['settled','quote'] as const){const f=ledgerFixture();try{
  const x=f.ledger.reserve(token(f),'mock-codex',{});
  if(which==='settled'){f.ledger.dispatch(x.id);f.ledger.settle(x.id,{inputTokens:10,outputTokens:10});}
  const db=new DatabaseSync(f.file);try{const row=db.prepare('SELECT body FROM ledger').get();a.ok(row);const state=JSON.parse(String(row.body));
   if(which==='settled')state.attempts[0].cost=0;else {state.attempts[0].quote.microUsd=1;state.attempts[0].cost=1;}
   db.prepare('UPDATE ledger SET body=?').run(JSON.stringify(state));
  }finally{db.close();}
  a.throws(()=>f.ledger.snapshot(),/corrupt/);a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{}),/corrupt/);
 }finally{f.cleanup();}}
});
test('every completion state closes admission on late input or generated envelope breaches',()=>{
 for(const state of ['reserved','dispatched','uncertain','settled'] as const)for(const dimension of ['input','output'] as const){
  const f=ledgerFixture();try{
   const x=f.ledger.reserve(token(f),'mock-codex',{});
   if(state!=='reserved')f.ledger.dispatch(x.id);
   if(state==='uncertain')f.ledger.uncertain(x.id);
   if(state==='settled')f.ledger.settle(x.id,{inputTokens:10,outputTokens:10});
   a.throws(()=>f.ledger.settle(x.id,{inputTokens:dimension==='input'?1001:10,outputTokens:dimension==='output'?4001:10}),/envelope|conflicting/);
   const snapshot=f.ledger.snapshot();a.ok(snapshot.stopped);a.throws(()=>f.ledger.reserve(token(f),'mock-codex',{}),/envelope|conflicting/);
   a.equal(snapshot.attempts[0]?.state,state==='settled'?'settled':'uncertain');
   a.equal(snapshot.totals.microUsd,state==='settled'?120:39000);
  }finally{f.cleanup();}
 }
});
