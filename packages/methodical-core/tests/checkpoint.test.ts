import {test} from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {publish,readCheckpoint,inspectBundle,verifyRecovery,withLock,recordRelevant,type Work,type Checkpoint} from '../src/checkpoint.js';
import {repositoryIdentity,identityAlgorithm,type ProjectBinding} from '../src/project.js';
import {digest,profile} from '../src/contracts.js';
import {prepareIntent,cancelIntent,interceptIntent,completeIntent,correlateIntent,receiveNativeStop,approvalTemplate,dispatchDependencies,inspectDispatch} from '../src/dispatch.js';
import {candidateIdentity} from '../src/project.js';
import {fixture} from './records-fixture.js';
function emptyRouting():string {const state={schemaVersion:1,revision:0,intents:[]};return JSON.stringify({...state,checksum:digest(JSON.stringify(state))});}
function binding(root:string,plan='plans/active.md'):ProjectBinding {
  const routing=path.join(root,'.methodical/routing-state.json');
  return {schemaVersion:1,identityAlgorithm,repositoryIdentity:repositoryIdentity(root),plan:{path:plan,sha256:digest(fs.readFileSync(path.join(root,plan)))},scope:'app.txt',policyHash:'1'.repeat(64),profileHash:'2'.repeat(64),routing:fs.existsSync(routing)?{path:'.methodical/routing-state.json',sha256:digest(fs.readFileSync(routing))}:null};
}
function work(root:string,plan?:string):Work {const b=binding(root,plan);return {binding:b,planHash:b.plan.sha256,step:'work-review',nextAction:'resolve finding',rulings:'rulings.md',lessons:[],findings:['finding'],reviewDebt:['rigor'],evidence:['opaque label']};}
function bundle(root:string,c:Checkpoint){return path.join(root,'.methodical/checkpoints',c.generation);}
function clone(root:string){const out=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-destination-'));execFileSync('git',['clone','-q','--local',root,out],{stdio:'pipe'});return out;}
function contents(root:string):string {
  const walk=(dir:string):unknown=>fs.readdirSync(dir).sort().map(name=>{const file=path.join(dir,name),s=fs.lstatSync(file);return [name,s.mode,s.isDirectory()?walk(file):s.isSymbolicLink()?fs.readlinkSync(file):digest(fs.readFileSync(file))];});return JSON.stringify(walk(root));
}
function immutable(root:string,archive:string,phase:'pre-restore'|'post-restore',pass:boolean){const before=contents(root);const v=verifyRecovery(root,archive,phase);a.equal(v.pass,pass,JSON.stringify(v));a.equal(contents(root),before,'verification wrote destination');return v;}
function restore(root:string,archive:string){const c=inspectBundle(archive);const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
  if(fs.statSync(path.join(archive,'dirty.patch')).size)git('apply','--binary',path.join(archive,'dirty.patch'));
  if(fs.statSync(path.join(archive,'index.patch')).size)git('apply','--cached','--binary',path.join(archive,'index.patch'));
  for(const name of Object.keys(c.payload))if(name.startsWith('untracked/')){const out=path.join(root,name.slice(10));fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(archive,name),out);}
  for(const [name,mode] of Object.entries(JSON.parse(fs.readFileSync(path.join(archive,'file-modes.json'),'utf8'))))fs.chmodSync(path.join(root,name),mode as number);
}
test('checkpoint requires explicit binding; current reads are pure and routing creation invalidates absence',()=>{
  const f=fixture();try {
    const w=work(f.root);a.throws(()=>publish(f.root,'codex',{...w,binding:undefined}),/binding/);
    const c=publish(f.root,'codex',w);const before=contents(f.root);a.equal(readCheckpoint(f.root).current,true);a.equal(contents(f.root),before);
    a.equal(inspectBundle(bundle(f.root,c)).work.binding?.plan.path,'plans/active.md');
    fs.writeFileSync(path.join(f.root,'.methodical/routing-state.json'),emptyRouting());a.equal(readCheckpoint(f.root).current,false);
    const next=publish(f.root,'codex',work(f.root));a.equal(readCheckpoint(f.root).current,true);a.ok(inspectBundle(bundle(f.root,next)).capture?.records.some(r=>r.ref==='methodical:routing-state'));
    recordRelevant(f.root,'finding','new');a.equal(readCheckpoint(f.root).current,false);
  }finally{f.cleanup();}
});
test('relocated bundle retains exact dirty/index/untracked bytes and modes with read-only recovery checks',()=>{
  const f=fixture(),destination=clone(f.root),moved=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-archive-'));
  try {
    fs.appendFileSync(path.join(f.root,'app.txt'),'staged\n');f.git('add','app.txt');fs.appendFileSync(path.join(f.root,'app.txt'),'unstaged\n');
    fs.chmodSync(path.join(f.root,'app.txt'),0o755);fs.writeFileSync(path.join(f.root,'notes.txt'),'untracked\0bytes');
    const c=publish(f.root,'claude-code',work(f.root));fs.cpSync(bundle(f.root,c),moved,{recursive:true});fs.rmSync(path.join(f.root,'.methodical'),{recursive:true});
    immutable(destination,moved,'pre-restore',true);immutable(destination,moved,'post-restore',false);restore(destination,moved);immutable(destination,moved,'post-restore',true);
    fs.appendFileSync(path.join(destination,'app.txt'),'lost');immutable(destination,moved,'post-restore',false);
  }finally{f.cleanup();fs.rmSync(destination,{recursive:true,force:true});fs.rmSync(moved,{recursive:true,force:true});}
});
test('ignored arbitrary active plan is explicit portable evidence; missing binding evidence and unsafe plan fail',()=>{
  const f=fixture();try {
    fs.mkdirSync(path.join(f.root,'.private'));fs.writeFileSync(path.join(f.root,'.private/unit.md'),'private approved plan\n');
    const c=publish(f.root,'codex',work(f.root,'.private/unit.md'));const archive=bundle(f.root,c);
    a.equal(fs.readFileSync(path.join(archive,'evidence/active-plan'),'utf8'),'private approved plan\n');
    fs.rmSync(path.join(f.root,'.private'),{recursive:true});immutable(f.root,archive,'post-restore',false);restoreCaptures(f.root,archive);immutable(f.root,archive,'post-restore',true);
    fs.unlinkSync(path.join(archive,'evidence/project-binding.json'));a.throws(()=>inspectBundle(archive),/missing/);
    fs.symlinkSync('plans/active.md',path.join(f.root,'alias'));a.throws(()=>publish(f.root,'codex',work(f.root,'alias')),/symlink/);
  }finally{f.cleanup();}
});
test('checkpoint shared lock, interrupted generation and concurrent evidence edits fail closed',()=>{
  const f=fixture();try {
    const c=publish(f.root,'codex',work(f.root));withLock(f.root,()=>a.throws(()=>publish(f.root,'codex',work(f.root)),/busy/));
    a.throws(()=>publish(f.root,'codex',work(f.root),p=>{if(p==='staged')throw Error('interruption');}),/interruption/);a.equal(readCheckpoint(f.root).checkpoint?.generation,c.generation);
    a.throws(()=>publish(f.root,'codex',work(f.root),p=>{if(p==='staged')fs.appendFileSync(path.join(f.root,'plans/active.md'),'mutation');}),/changed/);
    a.equal(readCheckpoint(f.root).current,false);
  }finally{f.cleanup();}
});
test('read of absent checkpoint is pure; legacy inspection requires explicit compatible recovery binding',()=>{
  const f=fixture();try {
    a.equal(f.git('config','--local','--get','maintenance.auto').toString().trim(),'false');
    a.equal(f.git('config','--local','--get','gc.auto').toString().trim(),'0');
    const before=contents(f.root);a.equal(readCheckpoint(f.root).current,false);a.equal(contents(f.root),before);a.equal(fs.existsSync(path.join(f.root,'.methodical')),false);
    const c=publish(f.root,'codex',work(f.root)),archive=bundle(f.root,c);const raw=JSON.parse(fs.readFileSync(path.join(archive,'checkpoint.json'),'utf8'));
    raw.schemaVersion=1;delete raw.capture;delete raw.work.captures;delete raw.work.binding;
    for(const name of Object.keys(raw.payload))if(name.startsWith('evidence/')){delete raw.payload[name];fs.unlinkSync(path.join(archive,name));}
    fs.rmSync(path.join(archive,'evidence'),{recursive:true});fs.writeFileSync(path.join(archive,'checkpoint.json'),JSON.stringify(raw));a.equal(inspectBundle(archive).schemaVersion,1);
    const v=immutable(f.root,archive,'post-restore',false);a.match(v.destinationCompatibility.reason,/explicit compatible/);a.equal(v.evidenceCompleteness.coverage,'unknown');
  }finally{f.cleanup();}
});
test('durable pending routing state must be restored exactly and keeps recovery read-only',()=>{
  const f=fixture(),destination=clone(f.root);try {
    fs.mkdirSync(path.join(f.root,'.methodical'));const state=emptyRouting();fs.writeFileSync(path.join(f.root,'.methodical/routing-state.json'),state);
    const c=publish(f.root,'codex',work(f.root)),archive=bundle(f.root,c);immutable(destination,archive,'pre-restore',true);
    const missing=immutable(destination,archive,'post-restore',false);a.match(missing.restoredState!.reason,/restore declared routing/);
    fs.mkdirSync(path.join(destination,'.methodical'));fs.copyFileSync(path.join(archive,'evidence/routing-state.json'),path.join(destination,'.methodical/routing-state.json'));immutable(destination,archive,'post-restore',true);
    fs.writeFileSync(path.join(destination,'.methodical/routing-state.json'),'{}');immutable(destination,archive,'post-restore',false);
  }finally{f.cleanup();fs.rmSync(destination,{recursive:true,force:true});}
});
test('capture selection rejects missing, credentials, transcript, symlink and oversize support',()=>{
  const f=fixture();try {
    fs.mkdirSync(path.join(f.root,'.methodical/evidence'),{recursive:true});
    const local=(source:string)=>({kind:'local' as const,ref:'required',source,archive:'evidence/required',required:true as const});
    const w=work(f.root);a.throws(()=>publish(f.root,'codex',{...w,captures:[local('.methodical/evidence/missing')]}),/missing/);
    for(const source of ['.git/config','.methodical/journal.json','.methodical/evidence/credentials.json','.methodical/evidence/transcripts/session.jsonl'])a.throws(()=>publish(f.root,'codex',{...w,captures:[local(source)]}),/metadata|credentials|transcripts/);
    fs.symlinkSync('../../app.txt',path.join(f.root,'.methodical/evidence/alias'));a.throws(()=>publish(f.root,'codex',{...w,captures:[local('.methodical/evidence/alias')]}),/symlink/);
    fs.unlinkSync(path.join(f.root,'.methodical/evidence/alias'));fs.writeFileSync(path.join(f.root,'.methodical/evidence/large'),Buffer.alloc(1024*1024+1));a.throws(()=>publish(f.root,'codex',{...w,captures:[local('.methodical/evidence/large')]}),/size limit/);
  }finally{f.cleanup();}
});
async function pendingFixture(root:string) {
  fs.mkdirSync(path.join(root,'.methodical/evidence'),{recursive:true});fs.mkdirSync(path.join(root,'.methodical/feedback'),{recursive:true});
  const support:Record<string,string>={'.methodical/evidence/method.md':'Keep the exact candidate and review debt.','.methodical/evidence/lens.md':'Check correctness.','.methodical/evidence/check.cjs':'process.stderr.write("FAIL\\n");process.exit(1);'};
  for(const [name,bytes] of Object.entries(support))fs.writeFileSync(path.join(root,name),bytes);
  fs.chmodSync(path.join(root,'.methodical/evidence/check.cjs'),0o755);
  const source=process.env.METHODICAL_SOURCE_ROOT??process.cwd(),p=profile(JSON.parse(fs.readFileSync(path.join(source,'packages/methodical-core/profiles/codex.json'),'utf8')));
  const input={binding:{unitId:'checkpoint-unit',planPath:'plans/active.md',planHash:digest(fs.readFileSync(path.join(root,'plans/active.md'))),scope:'app.txt',approvalPath:'.methodical/approval.json',approvalHash:digest('placeholder')},operationId:'implementation',profile:p,role:'worker',risk:'full',stack:'typescript',task:'routine',policy:'adaptive',methodPath:'.methodical/evidence/method.md',lensPaths:['.methodical/evidence/lens.md'],brief:'Inspect the candidate.',available:[...Object.values(p.choices),...Object.values(p.qualifiedOverrides?.choices??{})],rejectedModels:[]} as Record<string,unknown>;
  const approval=JSON.stringify({...approvalTemplate(root,input),approved:true});fs.writeFileSync(path.join(root,'.methodical/approval.json'),approval);(input.binding as {approvalHash:string}).approvalHash=digest(approval);
  const finding=JSON.stringify({accepted:true,material:true,classification:'capability',candidate:candidateIdentity(root),planHash:(input.binding as {planHash:string}).planHash});fs.writeFileSync(path.join(root,'.methodical/feedback/finding.json'),finding);
  input.feedback={classification:'capability',checkerPath:'.methodical/evidence/check.cjs',checkerHash:digest(support['.methodical/evidence/check.cjs']!),args:[],expectedExit:1,outputHash:digest(Buffer.from('\0FAIL\n')),findingPath:'.methodical/feedback/finding.json',findingHash:digest(finding)};
  return {intent:await prepareIntent(root,input),input};
}
function restoreCaptures(root:string,archive:string) {
  for(const record of inspectBundle(archive).capture?.records??[])if(record.kind==='local') {const file=path.join(root,record.source);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(archive,record.archive),file);}
  const modeFile=path.join(archive,'evidence/dispatch-dependency-modes.json');
  if(fs.existsSync(modeFile))for(const [name,mode] of Object.entries(JSON.parse(fs.readFileSync(modeFile,'utf8'))))fs.chmodSync(path.join(root,name),mode as number);
}
test('every prepared, reserved and unknown dispatch dependency survives portable recovery at its bound path',async()=>{
  const f=fixture();let destination:string|undefined;try {
    const {intent}=await pendingFixture(f.root);const correlation={host:'codex',sessionId:'source',toolUseId:'call'};
    for(const status of ['prepared','reserved','dispatch-unknown']) {
      if(status==='reserved')await interceptIntent(f.root,intent.id,correlation);
      if(status==='dispatch-unknown')await completeIntent(f.root,intent.id,{...correlation,childId:null,outcome:'unknown'});
      const dependencies=dispatchDependencies(f.root),before=new Map(dependencies.map(d=>[d.source,fs.readFileSync(path.join(f.root,d.source))]));
      const c=publish(f.root,'codex',work(f.root)),archive=bundle(f.root,c);destination=clone(f.root);
      immutable(destination,archive,'pre-restore',true);fs.mkdirSync(path.join(destination,'.methodical'));fs.copyFileSync(path.join(archive,'evidence/routing-state.json'),path.join(destination,'.methodical/routing-state.json'));
      const missing=immutable(destination,archive,'post-restore',false);a.match(missing.restoredState!.reason,/missing|ENOENT/);
      restoreCaptures(destination,archive);immutable(destination,archive,'post-restore',true);
      for(const [name,bytes] of before)a.deepEqual(fs.readFileSync(path.join(destination,name)),bytes,`${status} dependency changed: ${name}`);
      fs.appendFileSync(path.join(destination,'.methodical/approval.json'),'changed');immutable(destination,archive,'post-restore',false);
      fs.rmSync(destination,{recursive:true});destination=undefined;
    }
    const missingSource=path.join(f.root,'.methodical/evidence/lens.md');fs.unlinkSync(missingSource);a.throws(()=>publish(f.root,'codex',work(f.root)),/missing|ENOENT/);
  }finally{f.cleanup();if(destination)fs.rmSync(destination,{recursive:true,force:true});}
});
test('removing active dependency payload and its declarations cannot pass pure bundle inspection',async()=>{
  const f=fixture(),moved=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-dependency-tamper-'));try {
    await pendingFixture(f.root);const c=publish(f.root,'codex',work(f.root));fs.cpSync(bundle(f.root,c),moved,{recursive:true});
    const filename=path.join(moved,'checkpoint.json'),raw=JSON.parse(fs.readFileSync(filename,'utf8'));
    const record=raw.capture.records.find((r:{source:string})=>r.source==='.methodical/approval.json');a.ok(record);
    raw.capture.records=raw.capture.records.filter((r:{ref:string})=>r.ref!==record.ref);raw.work.captures=raw.work.captures.filter((r:{ref:string})=>r.ref!==record.ref);delete raw.payload[record.archive];fs.unlinkSync(path.join(moved,record.archive));fs.writeFileSync(filename,JSON.stringify(raw));
    a.throws(()=>inspectBundle(moved),/missing required active dispatch dependency/);immutable(f.root,moved,'post-restore',false);
  }finally{f.cleanup();fs.rmSync(moved,{recursive:true,force:true});}
});
test('completed routing history retains counters without requiring obsolete dependency source bytes',async()=>{
  const f=fixture();try {
    const {intent}=await pendingFixture(f.root),pending=publish(f.root,'codex',work(f.root));
    const c={host:'codex',sessionId:'source',toolUseId:'call'};await interceptIntent(f.root,intent.id,c);await correlateIntent(f.root,intent.id,{...c,childId:'child'});await completeIntent(f.root,intent.id,{...c,childId:'child',outcome:'completed'});
    for(const source of ['.methodical/approval.json','.methodical/evidence/method.md','.methodical/evidence/lens.md','.methodical/evidence/check.cjs','.methodical/feedback/finding.json'])fs.unlinkSync(path.join(f.root,source));
    const next=publish(f.root,'codex',{...pending.work,binding:binding(f.root)});a.equal(readCheckpoint(f.root).current,true);
    a.equal(inspectBundle(bundle(f.root,next)).capture?.records.some(r=>r.kind==='local' && ['.methodical/approval.json','.methodical/evidence/method.md','.methodical/evidence/lens.md','.methodical/evidence/check.cjs','.methodical/feedback/finding.json'].includes(r.source)),false);
    const state=JSON.parse(fs.readFileSync(path.join(bundle(f.root,next),'evidence/routing-state.json'),'utf8'));a.equal(state.intents.length,1);a.equal(state.intents[0].status,'completed');a.ok(state.intents[0].reservation);
  }finally{f.cleanup();}
});

test('cancelled stale preparation permits a revised unit checkpoint and portable recovery',async()=>{
 const f=fixture();let destination:string|undefined;
 try {
  const {intent,input}=await pendingFixture(f.root);
  fs.appendFileSync(path.join(f.root,'plans/active.md'),'Revised scope before any child launch.\n');
  await cancelIntent(f.root,intent.id,{reason:'Superseded by revised approved unit.'});
  const next={...input,feedback:null,failure:'none',binding:{...(input.binding as Record<string,unknown>),unitId:'revised-unit',planHash:digest(fs.readFileSync(path.join(f.root,'plans/active.md')))}};
  const approval=JSON.stringify({...approvalTemplate(f.root,next),approved:true});
  fs.writeFileSync(path.join(f.root,'.methodical/approval.json'),approval);(next.binding as Record<string,unknown>).approvalHash=digest(approval);
  const revised=await prepareIntent(f.root,next);
  const call={host:'codex',sessionId:'recovery-source',toolUseId:'recovery-call'};
  await interceptIntent(f.root,revised.id,call);
  await receiveNativeStop(f.root,{host:'codex',sessionId:call.sessionId,childId:'early-recovery-child',terminal:true,outcome:'completed'});
  const c=publish(f.root,'codex',work(f.root)),archive=bundle(f.root,c);
  a.equal(inspectBundle(archive).work.binding?.plan.sha256,revised.binding.planHash);
  const saved=JSON.parse(fs.readFileSync(path.join(archive,'evidence/routing-state.json'),'utf8'));
  a.deepEqual(saved.intents.map((i:{status:string})=>i.status),['cancelled','reserved']);a.equal(saved.intents[0].reservation,null);a.equal(saved.pendingStops.length,1);
  destination=clone(f.root);immutable(destination,archive,'pre-restore',true);restore(destination,archive);restoreCaptures(destination,archive);immutable(destination,archive,'post-restore',true);
  a.deepEqual(inspectDispatch(destination).intents.map(i=>i.status),['cancelled','reserved']);
  const resumed=await correlateIntent(destination,revised.id,{...call,childId:'early-recovery-child'});
  a.equal(resumed.status,'completed');a.equal(inspectDispatch(destination).pendingStops?.length,0);
 }finally{f.cleanup();if(destination)fs.rmSync(destination,{recursive:true,force:true});}
});
test('selected ignored private resume, rulings and lesson recover at original paths and modes without routing',()=>{
  const f=fixture();let destination:string|undefined;try {
    fs.appendFileSync(path.join(f.root,'.gitignore'),'docs/private/\n');f.git('add','.gitignore');f.git('commit','-qm','private record location');
    fs.mkdirSync(path.join(f.root,'docs/private'),{recursive:true});for(const [name,bytes]of Object.entries({'resume.md':'Next: continue this exact unit.\n','rulings.md':'Keep the direct ruling verbatim.\n','lesson.md':'Preserve the non-obvious lesson.\n'}))fs.writeFileSync(path.join(f.root,'docs/private',name),bytes,{mode:0o600});
    const w={...work(f.root),rulings:'docs/private/rulings.md',lessons:['docs/private/lesson.md'],captures:[{kind:'local' as const,ref:'methodical:resume',source:'docs/private/resume.md',archive:'evidence/resume.md',required:true as const}]};
    const c=publish(f.root,'codex',w),archive=bundle(f.root,c);a.equal(readCheckpoint(f.root).current,true);destination=clone(f.root);
    immutable(destination,archive,'pre-restore',true);immutable(destination,archive,'post-restore',false);restoreCaptures(destination,archive);immutable(destination,archive,'post-restore',true);
    for(const name of ['resume.md','rulings.md','lesson.md']){a.deepEqual(fs.readFileSync(path.join(destination,'docs/private',name)),fs.readFileSync(path.join(f.root,'docs/private',name)));a.equal(fs.statSync(path.join(destination,'docs/private',name)).mode&0o777,0o600);}
    fs.chmodSync(path.join(destination,'docs/private/resume.md'),0o644);immutable(destination,archive,'post-restore',false);
    fs.appendFileSync(path.join(f.root,'docs/private/rulings.md'),'new ruling');a.equal(readCheckpoint(f.root).current,false);
  }finally{f.cleanup();if(destination)fs.rmSync(destination,{recursive:true,force:true});}
});
