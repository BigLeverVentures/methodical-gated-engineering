import { test } from 'node:test';
import * as a from 'node:assert/strict';
import { sign,generateKeyPairSync } from 'node:crypto';
import { ledgerFixture } from './guard-fixture.js';
import { startMockControl,GuardSession,verifyReceipt } from '../guard/operator.js';
import { canonical } from '../guard/contracts.js';
import { setupProposal } from '../guard/isolation.js';
test('operator state is challenge-signed by a pinned key and cannot be substituted or replayed',async()=>{
 const f=ledgerFixture();const control=await startMockControl(f.ledger,f.root+'/c');try{
  const s=await GuardSession.connect(control.connection);a.equal(s.receipt.mode,'mock-only');a.equal(s.receipt.ledgerId,f.ledger.snapshot().ledgerId);
  await a.rejects(GuardSession.connect({...control.connection,token:'actor-token'}),/denied/);
  const forged={receipt:{...s.receipt,totals:{microUsd:0,requests:0,generatedTokens:0}},signature:'forged'};
  a.throws(()=>verifyReceipt(forged,s.receipt.nonce,control.connection.pins),/signature/);
  const actor=generateKeyPairSync('ed25519');const signature=sign(null,Buffer.from(canonical(s.receipt)),actor.privateKey).toString('base64');
  a.throws(()=>verifyReceipt({receipt:s.receipt,signature},s.receipt.nonce,control.connection.pins),/signature/);
  a.throws(()=>GuardSession.requireNative(s,f.m.batchHash),/qualification remains owed/);
  a.throws(()=>GuardSession.requireNative({receipt:{...s.receipt,mode:'native-qualified'}},f.m.batchHash),/authenticated/);
  a.deepEqual(setupProposal().state,'not-provisioned');a.equal(setupProposal().liveBudgetUsd,0);
 }finally{await control.close();f.cleanup();}
});
test('stopped ledger remains visible through authenticated runtime state and cannot open live gate',async()=>{
 const f=ledgerFixture();const control=await startMockControl(f.ledger,f.root+'/c');try{
  const first=await GuardSession.connect(control.connection);f.ledger.stop('operator cancel');const next=await GuardSession.connect(control.connection);
  a.ok(next.receipt.revision>first.receipt.revision);a.notEqual(first.receipt.ledgerDigest,next.receipt.ledgerDigest);
  a.throws(()=>GuardSession.requireNative(next,f.m.batchHash),/stopped/);
 }finally{await control.close();f.cleanup();}
});
test('proposed staged budget arithmetic preserves the full main inventory without spend authority',async()=>{
 const fs=await import('node:fs');const path=await import('node:path');
 const root=process.env.PROOF_SOURCE;a.ok(root);
 const proposal=JSON.parse(fs.readFileSync(path.join(root,'evaluation/guard-budget-proposal.json'),'utf8'));
 const main=JSON.parse(fs.readFileSync(path.join(root,'evaluation/proposed-batch.json'),'utf8'));
 a.equal(proposal.executableLiveBudgetMicroUsd,0);a.equal(proposal.status,'proposal-not-authorized');
 a.equal(proposal.stages.reduce((n:number,s:{microUsd:number})=>n+s.microUsd,0),240_000_000);
 a.equal(proposal.combined.microUsd,240_000_000);a.equal(proposal.combined.requests,280);a.equal(proposal.combined.sessions,24);
 a.equal(proposal.maximumGeneratedPerAttempt,4000);
 for(const s of proposal.stages){a.equal(Object.values<number>(s.hostMicroUsd).reduce((x,y)=>x+y,0),s.microUsd);a.equal(s.generatedTokens,s.requests*4000);}
 a.equal(proposal.stages[1].sessions,main.runs.length);a.equal(proposal.stages[1].requests,main.runs.reduce((n:number,r:{requests:number})=>n+r.requests,0));
});
