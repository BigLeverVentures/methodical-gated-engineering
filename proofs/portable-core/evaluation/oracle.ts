import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { readCheckpoint } from '../core/checkpoint.js';
import { assert, digest, hash, object, text, type Evidence, type ProofEvent } from '../core/contracts.js';
export type Frozen = { directory: string; hashes: Record<string,string> };
export function freezeOracle(source: string, directory: string): Frozen {
  assert(!fs.existsSync(directory),'oracle destination must not exist');fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const hashes: Record<string,string>={};
  for(const name of ['score.py','recovery.json']) {
    const bytes=fs.readFileSync(path.join(source,name));hashes[name]=digest(bytes);
    fs.writeFileSync(path.join(directory,name),bytes,{mode:0o400});
  }
  return {directory,hashes};
}
export function intact(frozen: Frozen): boolean {
  const v=object(frozen);text(v.directory);const hashes=object(v.hashes);
  assert(Object.keys(hashes).sort().join(',')==='recovery.json,score.py','incomplete frozen oracle');
  Object.values(hashes).forEach(hash);
  return Object.entries(hashes).every(([file,sum])=>{
    try{return digest(fs.readFileSync(path.join(frozen.directory,file)))===sum;}catch{return false;}
  });
}
export function scoreCode(root: string, frozen: Frozen): { passed: boolean; problems: string[] } {
  assert(path.resolve(frozen.directory)!==path.resolve(root)&&!path.resolve(frozen.directory).startsWith(path.resolve(root)+path.sep),'scored oracle must be outside actor repository');
  assert(intact(frozen),'oracle integrity failure before scoring');
  const result=spawnSync('python3',['-I','-B',path.join(frozen.directory,'score.py'),root],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  assert(intact(frozen),'oracle integrity failure after scoring');
  if(result.error||result.status===null)return{passed:false,problems:['scoring process failed or timed out']};
  try{
    const value=object(JSON.parse(result.stdout));
    assert(typeof value.passed==='boolean'&&Array.isArray(value.problems)&&value.problems.every(x=>typeof x==='string'),'invalid scoring result');
    return {passed:result.status===0&&value.passed,problems:value.problems as string[]};
  }catch{return{passed:false,problems:['missing or malformed independent score']};}
}
export type LessonAssessment = { correct:boolean; lessonHash:string; probeHash:string; indexHash:string; evidence:Evidence };
export function newLesson(root: string, frozen: Frozen, lessonPath: string, probe: unknown, initialIndexHash: string,
  assessment?:LessonAssessment, catalog:SourceCatalog={}): boolean {
  assert(intact(frozen),'oracle integrity failure');
  const expected=object(JSON.parse(fs.readFileSync(path.join(frozen.directory,'recovery.json'),'utf8')));
  const p=object(probe);
  if(JSON.stringify(p)!==JSON.stringify(expected.probe))return false;
  assert(lessonPath.startsWith('docs/solutions/')&&!lessonPath.includes('..')&&!path.isAbsolute(lessonPath),'invalid lesson path');
  if(!assessment||assessment.correct!==true)return false;
  trustedEvidence(assessment.evidence,catalog,true);
  try{
    const file=fs.readFileSync(path.join(root,lessonPath),'utf8');
    const index=fs.readFileSync(path.join(root,'docs/solutions/README.md'),'utf8');
    return file.trim().length>0 && digest(index)!==initialIndexHash && index.includes(lessonPath.replace('docs/solutions/','')) &&
      digest(file)===hash(assessment.lessonHash)&&digest(index)===hash(assessment.indexHash)&&digest(JSON.stringify(probe))===hash(assessment.probeHash);
  }catch{return false;}
}
export type SourceCatalog = Record<string,{ kind: Evidence['kind']; sha256: string }>;
export function trustedEvidence(e: Evidence, catalog: SourceCatalog, native: boolean): void {
  const source=catalog[e.ref];
  assert(source&&source.kind===e.kind&&source.sha256===hash(e.sha256),'evidence source/provenance mismatch');
  if(native)assert(e.kind==='runtime'||e.kind==='operator','simulation/helper/configuration cannot certify native behavior');
}
export function verifyFinalReview(root: string, events: ProofEvent[], required: string[], catalog: SourceCatalog): void {
  const dirty=execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=all'],{encoding:'utf8'});
  assert(dirty.trim()==='','review candidate has unreviewed working tree changes');
  const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  for(const seat of required){
    const pass=[...events].reverse().find(e=>e.kind==='seat-completed'&&e.data.seat===seat&&e.candidate===head);
    assert(pass&&pass.data.material===false,`missing current ${seat} review`);trustedEvidence(pass.evidence,catalog,true);
    assert(events.some(e=>e.kind==='seat-invoked'&&e.sequence<pass.sequence&&e.host===pass.host&&e.sessionId===pass.sessionId&&e.seatId===pass.seatId&&e.data.seat===seat&&e.candidate===head&&e.planHash===pass.planHash),'review lacks matching invocation');
  }
  for(const finding of events.filter(e=>e.kind==='finding'&&e.data.material!==false)) {
    assert(events.some(e=>e.sequence>finding.sequence&&e.kind==='fixed'&&e.data.findingId===finding.data.findingId),'unresolved material finding');
  }
}
