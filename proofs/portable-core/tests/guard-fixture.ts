import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fingerprint, type GuardManifest } from '../guard/contracts.js';
import { tariff } from '../guard/tariff.js';
import { Ledger } from '../guard/ledger.js';
export const rates=tariff({schemaVersion:1,mode:'mock-only',rates:[
  {host:'claude-code',model:'mock-claude',serviceInputMaximum:1000,generatedMaximum:4000,inputMicroPerMillion:2_000_000,outputMicroPerMillion:8_000_000},
  {host:'codex',model:'mock-codex',serviceInputMaximum:1000,generatedMaximum:4000,inputMicroPerMillion:3_000_000,outputMicroPerMillion:9_000_000}
]});
export function guardManifest():GuardManifest {
  const cap={microUsd:500_000,requests:8,generatedTokens:32_000};
  return {schemaVersion:1,mode:'mock-only',id:'synthetic-stage',batchHash:fingerprint('synthetic-batch'),tariffHash:fingerprint(rates),
    expiresAt:Date.now()+60_000,maxConcurrent:4,deadlineMs:1000,maxBodyBytes:100_000,total:{...cap},
    stages:{canary:{...cap}},hosts:{'claude-code':{...cap},codex:{...cap}},
    allocations:[{stage:'canary',host:'claude-code',run:'claude-run',cap:{...cap}},{stage:'canary',host:'codex',run:'codex-run',cap:{...cap}}]};
}
export function ledgerFixture(m=guardManifest(),now=Date.now) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-guard-'));
  const file=path.join(root,'ledger.sqlite');
  const {ledger,tokens}=Ledger.create(file,m,rates,now);
  return {root,file,ledger,tokens,m,cleanup:()=>{try{ledger.close();}catch{/* Already closed by a restart test. */}fs.rmSync(root,{recursive:true,force:true});}};
}
