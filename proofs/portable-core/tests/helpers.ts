import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { digest, profile, type Host, type Profile } from '../core/contracts.js';
import type { Work } from '../core/checkpoint.js';
export const source = process.env.PROOF_SOURCE!;
export function fixture(): { root: string; cleanup: () => void; work: Work } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'methodical-proof-')));
  fs.cpSync(path.join(source,'fixtures/python'),root,{recursive:true});
  const git = (...args: string[]) => execFileSync('git',['-C',root,...args],{stdio:'pipe'});
  git('init','-q','-b','main');
  git('config','user.name','Proof Fixture');git('config','user.email','proof@example.invalid');
  git('config','user.useConfigOnly','true');git('add','.');
  git('commit','-qm','fixture baseline');
  return { root, cleanup:() => fs.rmSync(root,{recursive:true,force:true}),work:{
    planHash:digest(fs.readFileSync(path.join(root,'docs/plan.md'))),step:'work-review',nextAction:'resolve the material finding',
    rulings:'docs/rulings.md',lessons:[],findings:['empty-input'],reviewDebt:['rigor'],evidence:['smoke-check'] } };
}
export function baseline(host: Host): Profile {
  return profile(JSON.parse(fs.readFileSync(path.join(source,`core/profiles/${host}.json`),'utf8')));
}
