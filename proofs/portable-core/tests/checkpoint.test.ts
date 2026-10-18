import { test } from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { digest } from '../core/contracts.js';
import { publish, readCheckpoint, recordRelevant, safeFile, withLock, assertFixture, inspectBundle, verifyRecovery, repositoryIdentity, captureLimits, type Checkpoint, type CaptureRequest } from '../core/checkpoint.js';
import { fixture } from './helpers.js';

test('checkpoint carries dirty bytes and exact rulings across host readers; readers detect drift',()=>{
  const f=fixture(); try {
    fs.writeFileSync(path.join(f.root,'notes.txt'),'unfinished\n');
    fs.appendFileSync(path.join(f.root,'calc.py'),'\n# dirty work\n');
    const c=publish(f.root,'claude-code',f.work);
    a.equal(readCheckpoint(f.root).current,true);
    const base=path.join(f.root,'.methodical/checkpoints',c.generation);
    a.equal(fs.readFileSync(path.join(base,'untracked/notes.txt'),'utf8'),'unfinished\n');
    a.ok(fs.readFileSync(path.join(base,'resume.md'),'utf8').includes('Keep the public total(values) signature unchanged.'));
    a.equal(readCheckpoint(f.root).checkpoint?.host,'claude-code');
    fs.appendFileSync(path.join(f.root,'docs/rulings.md'),'New scope.\n');
    a.equal(readCheckpoint(f.root).current,false);
    publish(f.root,'codex',f.work); a.equal(readCheckpoint(f.root).current,true);
    recordRelevant(f.root,'finding','new independent evidence'); a.equal(readCheckpoint(f.root).current,false);
  } finally { f.cleanup(); }
});
test('interrupted publication retains previous complete generation',()=>{
  const f=fixture();try{
    const c=publish(f.root,'codex',f.work);
    a.throws(()=>publish(f.root,'codex',f.work,p=>{if(p==='staged')throw new Error('crash');}),/crash/);
    a.equal(readCheckpoint(f.root).checkpoint?.generation,c.generation);
    a.equal(readCheckpoint(f.root).current,true);
  }finally{f.cleanup();}
});
test('concurrent publishers refuse; mutation at publication boundaries cannot claim freshness',()=>{
  const f=fixture();try{
    withLock(f.root,()=>a.throws(()=>publish(f.root,'codex',f.work),/busy/));
    a.throws(()=>publish(f.root,'codex',f.work,p=>{if(p==='captured')fs.appendFileSync(path.join(f.root,'calc.py'),'\n# concurrent edit');}),/changed/);
    a.equal(readCheckpoint(f.root).current,false);
    const newer=publish(f.root,'codex',f.work);a.equal(readCheckpoint(f.root).checkpoint?.generation,newer.generation);
    a.throws(()=>publish(f.root,'codex',f.work,p=>{if(p==='swapped')fs.appendFileSync(path.join(f.root,'calc.py'),'\n# after swap');}),/stale/);
    a.equal(readCheckpoint(f.root).current,false);
  }finally{f.cleanup();}
});
test('tampering, paths and symbolic links fail closed',()=>{
  const f=fixture();try{
    a.throws(()=>safeFile(f.root,'../outside'),/unsafe/);
    fs.symlinkSync(path.join(f.root,'calc.py'),path.join(f.root,'alias.py'));
    a.throws(()=>publish(f.root,'codex',f.work),/symlink/);fs.unlinkSync(path.join(f.root,'alias.py'));
    const c=publish(f.root,'codex',f.work);
    fs.appendFileSync(path.join(f.root,'.methodical/checkpoints',c.generation,'resume.md'),'forged');
    a.equal(readCheckpoint(f.root).checkpoint,null);
  }finally{f.cleanup();}
});

const runGit=(root: string,...args: string[])=>execFileSync('git',['--no-optional-locks','-C',root,...args],{stdio:'pipe'});
function bundlePath(root: string,c: Checkpoint): string { return path.join(root,'.methodical/checkpoints',c.generation); }
function local(ref='diagnostic',source='.methodical/evidence/diagnostic.txt',archive='evidence/diagnostic.txt'): CaptureRequest {
  return {kind:'local',ref,source,archive,required:true};
}
function support(root: string,relative='.methodical/evidence/diagnostic.txt',bytes: string | Buffer='required diagnostic\n'): void {
  fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true}); fs.writeFileSync(path.join(root,relative),bytes);
}
function bytesAndModes(root: string): string {
  const visit=(dir: string): unknown=>fs.readdirSync(dir).sort().map(name=>{
    const file=path.join(dir,name),st=fs.lstatSync(file);
    return [name,st.mode,st.isDirectory() ? visit(file):st.isSymbolicLink() ? fs.readlinkSync(file):digest(fs.readFileSync(file))];
  });
  return JSON.stringify(visit(root));
}
function immutableCheck(root: string,bundle: string,phase: 'pre-restore'|'post-restore',pass: boolean): ReturnType<typeof verifyRecovery> {
  const before=bytesAndModes(root); const result=verifyRecovery(root,bundle,phase);
  a.equal(result.pass,pass,JSON.stringify(result)); a.equal(bytesAndModes(root),before,'verification modified destination'); return result;
}
function clone(root: string): {root:string;cleanup:()=>void} {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-recovery-')), destination=path.join(parent,'fixture');
  execFileSync('git',['clone','-q','--local',root,destination],{stdio:'pipe'});
  return {root:destination,cleanup:()=>fs.rmSync(parent,{recursive:true,force:true})};
}
function relocate(bundle: string): {bundle:string;cleanup:()=>void} {
  const destination=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-bundle-'));
  fs.cpSync(bundle,destination,{recursive:true});
  return {bundle:destination,cleanup:()=>fs.rmSync(destination,{recursive:true,force:true})};
}
function rewrite(bundle: string,mutate: (c: Record<string,any>)=>void): void {
  const filename=path.join(bundle,'checkpoint.json'),c=JSON.parse(fs.readFileSync(filename,'utf8'));
  mutate(c);fs.writeFileSync(filename,JSON.stringify(c));
}
function restore(root: string,bundle: string): void {
  const c=inspectBundle(bundle);
  runGit(root,'apply','--binary',path.join(bundle,'dirty.patch'));
  if (fs.statSync(path.join(bundle,'index.patch')).size) runGit(root,'apply','--cached','--binary',path.join(bundle,'index.patch'));
  for (const file of Object.keys(c.payload)) if (file.startsWith('untracked/')) {
    const destination=path.join(root,file.slice('untracked/'.length));fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(bundle,file),destination);
  }
  const modes=JSON.parse(fs.readFileSync(path.join(bundle,'file-modes.json'),'utf8'));
  for (const [name,mode] of Object.entries(modes)) fs.chmodSync(path.join(root,name),mode as number);
}

test('v2 carries explicitly required ignored support after relocation and source deletion; opaque labels remain opaque',()=>{
  const f=fixture(); let moved:ReturnType<typeof relocate>|undefined;
  try {
    support(f.root); const c=publish(f.root,'codex',{...f.work,captures:[local(),{kind:'external',ref:'external',url:'https://example.invalid/report'},
      {kind:'unavailable',ref:'missing-observation',reason:'not observed'}]});
    a.equal(c.schemaVersion,2); a.deepEqual(c.work.evidence,['smoke-check']);
    moved=relocate(bundlePath(f.root,c));fs.rmSync(path.join(f.root,'.methodical'),{recursive:true});
    const result=immutableCheck(f.root,moved.bundle,'post-restore',true);
    a.equal(result.evidenceCompleteness.coverage,'explicit');a.equal(result.evidenceCompleteness.limitations.length,2);
    a.equal(result.evidenceCompleteness.mappings[0]?.ref,'diagnostic');
    a.equal(fs.readFileSync(path.join(moved.bundle,result.evidenceCompleteness.mappings[0]!.archive),'utf8'),'required diagnostic\n');
    a.equal(result.semanticFreshness,'not-established');a.equal(fs.existsSync(path.join(f.root,'.methodical')),false);
  } finally {moved?.cleanup();f.cleanup();}
});

test('pre-restore accepts clean base with absent dirty plan/ruling/lesson bytes, then post independently verifies restoration',()=>{
  const f=fixture(),destination=clone(f.root);let moved:ReturnType<typeof relocate>|undefined;
  try {
    fs.appendFileSync(path.join(f.root,'docs/plan.md'),'\nChanged plan to restore.\n');
    fs.appendFileSync(path.join(f.root,'docs/rulings.md'),'\nRestore this ruling.\n');
    support(f.root,'docs/lesson.md','carried lesson\n');fs.writeFileSync(path.join(f.root,'notes.txt'),'untracked notes\n');
    fs.appendFileSync(path.join(f.root,'calc.py'),'\n# staged\n');runGit(f.root,'add','calc.py');
    fs.appendFileSync(path.join(f.root,'calc.py'),'# unstaged\n');
    fs.unlinkSync(path.join(f.root,'pyproject.toml'));fs.chmodSync(path.join(f.root,'checks.py'),0o755);
    support(f.root);
    const work={...f.work,planHash:digest(fs.readFileSync(path.join(f.root,'docs/plan.md'))),lessons:['docs/lesson.md'],captures:[local()]};
    const c=publish(f.root,'claude-code',work); moved=relocate(bundlePath(f.root,c));
    immutableCheck(destination.root,moved.bundle,'pre-restore',true);
    immutableCheck(destination.root,moved.bundle,'post-restore',false);
    restore(destination.root,moved.bundle);
    immutableCheck(destination.root,moved.bundle,'post-restore',true);
    for (const mutation of [()=>fs.appendFileSync(path.join(destination.root,'calc.py'),'lost-byte'),
      ()=>fs.chmodSync(path.join(destination.root,'checks.py'),0o644),
      ()=>fs.writeFileSync(path.join(destination.root,'pyproject.toml'),'resurrected'),
      ()=>runGit(destination.root,'add','calc.py'),
      ()=>fs.unlinkSync(path.join(destination.root,'docs/lesson.md'))]) {
      const copy=fs.mkdtempSync(path.join(os.tmpdir(),'restore-backup-'));fs.cpSync(destination.root,copy,{recursive:true});
      try {mutation();immutableCheck(destination.root,moved.bundle,'post-restore',false);}
      finally {fs.rmSync(destination.root,{recursive:true});fs.cpSync(copy,destination.root,{recursive:true});fs.rmSync(copy,{recursive:true});}
    }
    fs.unlinkSync(path.join(moved.bundle,'evidence/diagnostic.txt'));immutableCheck(destination.root,moved.bundle,'post-restore',false);
  } finally {moved?.cleanup();destination.cleanup();f.cleanup();}
});

test('pre-restore rejects paired restoration payload and declaration removal against the verified clean base',()=>{
  const f=fixture(),destination=clone(f.root);try {
    fs.writeFileSync(path.join(f.root,'notes.txt'),'required untracked bytes\n');
    fs.writeFileSync(path.join(f.root,'added.py'),'# staged new file\n');runGit(f.root,'add','added.py');
    fs.appendFileSync(path.join(f.root,'calc.py'),'\n# changed tracked bytes\n');
    fs.appendFileSync(path.join(f.root,'docs/plan.md'),'\nDirty plan required after restore.\n');
    const c=publish(f.root,'codex',{...f.work,planHash:digest(fs.readFileSync(path.join(f.root,'docs/plan.md')))});
    const original=bundlePath(f.root,c);
    immutableCheck(destination.root,original,'pre-restore',true);
    for (const archive of ['untracked/notes.txt','worktree/added.py','worktree/calc.py','worktree/docs/plan.md']) {
      const moved=relocate(original);try {
        fs.unlinkSync(path.join(moved.bundle,archive));rewrite(moved.bundle,value=>{delete value.payload[archive];});
        // This attack remains checksum/shape-consistent; completeness needs the independently verified HEAD.
        a.doesNotThrow(()=>inspectBundle(moved.bundle));
        const result=immutableCheck(destination.root,moved.bundle,'pre-restore',false);
        a.equal(result.destinationCompatibility.pass,true);
        a.equal(result.integrity.pass,false);a.match(result.integrity.reason,/missing restoration payload/);
      } finally {moved.cleanup();}
    }
  } finally {destination.cleanup();f.cleanup();}
});

test('pre-restore rejects every identity/base difference without any write, including canceled staging and ignored untracked files',()=>{
  const f=fixture();let moved:ReturnType<typeof relocate>|undefined;
  try {
    const c=publish(f.root,'codex',f.work);moved=relocate(bundlePath(f.root,c));
    const cases:[string,(root:string)=>void][]=[
      ['marker',root=>fs.appendFileSync(path.join(root,'methodical-proof-fixture.json'),' ')],
      ['branch',root=>{runGit(root,'checkout','-qb','other');}],
      ['HEAD',root=>{runGit(root,'-c','user.name=Proof','-c','user.email=proof@example.invalid','commit','--allow-empty','-qm','different');}],
      ['unstaged',root=>fs.appendFileSync(path.join(root,'calc.py'),'dirty')],
      ['staged',root=>{fs.appendFileSync(path.join(root,'calc.py'),'dirty');runGit(root,'add','calc.py');}],
      ['canceled-staging',root=>{const original=fs.readFileSync(path.join(root,'calc.py'));fs.appendFileSync(path.join(root,'calc.py'),'dirty');runGit(root,'add','calc.py');fs.writeFileSync(path.join(root,'calc.py'),original);}],
      ['untracked',root=>fs.writeFileSync(path.join(root,'unexpected.txt'),'dirty')],
      ['ignored-untracked',root=>support(root,'__pycache__/ignored.py','dirty')],
      ['mode',root=>{runGit(root,'config','core.filemode','false');fs.chmodSync(path.join(root,'calc.py'),0o755);}],
      ['missing-file',root=>fs.unlinkSync(path.join(root,'calc.py'))],
    ];
    for (const [name,mutation] of cases) {
      const d=clone(f.root);try {mutation(d.root);const result=immutableCheck(d.root,moved.bundle,'pre-restore',false);a.equal(result.destinationCompatibility.pass,false,name);}
      finally {d.cleanup();}
    }
    const d=clone(f.root);try {immutableCheck(d.root,moved.bundle,'pre-restore',true);a.equal(fs.existsSync(path.join(d.root,'.methodical')),false);}
    finally {d.cleanup();}
  } finally {moved?.cleanup();f.cleanup();}
});

test('publication requires readable regular selected sources, prevents metadata and ignored recursion, and rechecks source bytes',()=>{
  const f=fixture();try {
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:[local()]}),/missing/);
    support(f.root);
    execFileSync('mkfifo',[path.join(f.root,'.methodical/evidence/pipe')]);
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:[local('fifo','.methodical/evidence/pipe')]}),/regular/);
    fs.unlinkSync(path.join(f.root,'.methodical/evidence/pipe'));
    fs.symlinkSync(path.join(f.root,'calc.py'),path.join(f.root,'.methodical/evidence/link'));
    for (const source of ['.git/config','.methodical/journal.json','.methodical/checkpoints/1/file','.methodical/evidence/credentials.json','.methodical/evidence/transcripts/session.jsonl','../outside','/absolute','a\\b','.methodical/evidence/link'])
      a.throws(()=>publish(f.root,'codex',{...f.work,captures:[local('bad',source)]}),source);
    support(f.root,'__pycache__/support.txt');a.throws(()=>publish(f.root,'codex',{...f.work,captures:[local('ignored','__pycache__/support.txt')]}),/ignored support/);
    fs.unlinkSync(path.join(f.root,'.methodical/evidence/link'));
    const ordinary=publish(f.root,'codex',{...f.work,captures:[local('ordinary','calc.py','evidence/calc.py')]});
    a.equal(inspectBundle(bundlePath(f.root,ordinary)).capture?.records.length,1);
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:[local()]},phase=>{if(phase==='staged')support(f.root,undefined,'mutated');}),/evidence changed/);
  } finally {f.cleanup();}
});

test('capture descriptor, per-file, total and metadata limits fail closed',()=>{
  const f=fixture();try {
    support(f.root); const huge=Buffer.alloc(captureLimits.fileBytes+1);support(f.root,undefined,huge);
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:[local()]}),/size limit/);
    support(f.root,undefined,Buffer.alloc(captureLimits.fileBytes));
    const records:CaptureRequest[]=[];
    for(let i=0;i<9;i++){const source=`.methodical/evidence/${i}.bin`;support(f.root,source,Buffer.alloc(captureLimits.fileBytes));records.push(local(String(i),source,`evidence/${i}.bin`));}
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:records}),/total byte limit/);
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:Array.from({length:129},(_,i)=>({kind:'unavailable',ref:String(i),reason:'bounded'}))}),/descriptor limit/);
    a.throws(()=>publish(f.root,'codex',{...f.work,captures:[{kind:'unavailable',ref:'large',reason:'x'.repeat(captureLimits.metadataBytes)}]}),/metadata limit/);
    const exact=publish(f.root,'codex',{...f.work,captures:records.slice(0,8)});a.equal(inspectBundle(bundlePath(f.root,exact)).capture?.records.length,8);
  } finally {f.cleanup();}
});

test('malformed, unsafe, duplicate and inconsistent bundle manifests and payloads fail pure inspection',()=>{
  const f=fixture();try {
    support(f.root);const c=publish(f.root,'codex',{...f.work,captures:[local()]});
    const mutations:((c:Record<string,any>)=>void)[]=[
      c=>{c.schemaVersion=3;},c=>{delete c.capture;},c=>{c.capture.schemaVersion=2;},c=>{c.repo.index='bad';},
      c=>{c.repo.tree['../escape']='0'.repeat(64);},c=>{c.repo.branch=42;},c=>{delete c.work.rulings;},
      c=>{c.capture.records[0].bytes++;},c=>{c.capture.records[0].sha256='0'.repeat(64);},
      c=>{c.capture.records.push({...c.capture.records[0]});},
      c=>{c.capture.records.push({...c.capture.records[0],ref:'other'});},
      c=>{c.capture.records[0].archive='../escape';},c=>{c.capture.records[0].source='.git/config';},
      c=>{delete c.payload['evidence/diagnostic.txt'];},c=>{c.payload['checkpoint.json']='0'.repeat(64);},
      c=>{c.capture.records[0].required=false;},c=>{c.capture.records.push({kind:'unavailable',ref:'empty',reason:''});},
      c=>{c.work.captures[0].ref='different';},c=>{c.capture.records[0].bytes=captureLimits.fileBytes+1;},
    ];
    for (const mutation of mutations) {
      const moved=relocate(bundlePath(f.root,c));try {rewrite(moved.bundle,mutation);a.throws(()=>inspectBundle(moved.bundle));immutableCheck(f.root,moved.bundle,'pre-restore',false);}
      finally {moved.cleanup();}
    }
    for (const tamper of [(bundle:string)=>fs.appendFileSync(path.join(bundle,'evidence/diagnostic.txt'),'forged'),
      (bundle:string)=>fs.writeFileSync(path.join(bundle,'undeclared'),'extra'),
      (bundle:string)=>{fs.unlinkSync(path.join(bundle,'evidence/diagnostic.txt'));fs.symlinkSync(path.join(f.root,'calc.py'),path.join(bundle,'evidence/diagnostic.txt'));},
      (bundle:string)=>fs.writeFileSync(path.join(bundle,'checkpoint.json'),'{malformed'),
      (bundle:string)=>fs.writeFileSync(path.join(bundle,'checkpoint.json'),'x'.repeat(16*1024*1024+1)),
      (bundle:string)=>fs.writeFileSync(path.join(bundle,'file-modes.json'),'{}')]) {
      const moved=relocate(bundlePath(f.root,c));try {tamper(moved.bundle);a.throws(()=>inspectBundle(moved.bundle));}finally {moved.cleanup();}
    }
  } finally {f.cleanup();}
});

test('legacy v1 still reads opaque evidence labels with explicitly unknown verification coverage',()=>{
  const f=fixture();try {
    const c=publish(f.root,'codex',f.work),bundle=bundlePath(f.root,c);
    rewrite(bundle,c=>{c.schemaVersion=1;delete c.capture;});
    const pointer=path.join(f.root,'.methodical/checkpoint-current.json'),p=JSON.parse(fs.readFileSync(pointer,'utf8'));
    p.sha256=digest(fs.readFileSync(path.join(bundle,'checkpoint.json')));fs.writeFileSync(pointer,JSON.stringify(p));
    a.equal(readCheckpoint(f.root).current,true);a.deepEqual(readCheckpoint(f.root).checkpoint?.work.evidence,['smoke-check']);
    const result=immutableCheck(f.root,bundle,'post-restore',false);a.equal(result.integrity.pass,true);a.equal(result.evidenceCompleteness.coverage,'unknown');
  } finally {f.cleanup();}
});

test('shared identity preserves raw marker bytes and internal root newlines',()=>{
  const f=fixture();try {
    const marker=fs.readFileSync(path.join(f.root,'methodical-proof-fixture.json'));
    const roots=runGit(f.root,'rev-list','--max-parents=0','HEAD').toString().trim();
    a.equal(repositoryIdentity(f.root),digest(Buffer.concat([marker,Buffer.from(roots)])));
    const tree=runGit(f.root,'rev-parse','HEAD^{tree}').toString().trim();
    const other=runGit(f.root,'-c','user.name=Proof','-c','user.email=proof@example.invalid','commit-tree',tree,'-m','independent root').toString().trim();
    runGit(f.root,'-c','user.name=Proof','-c','user.email=proof@example.invalid','merge','--allow-unrelated-histories','-s','ours','-m','join roots',other);
    const multiple=runGit(f.root,'rev-list','--max-parents=0','HEAD').toString().trim();
    a.equal(multiple.split('\n').length,2);
    a.equal(repositoryIdentity(f.root),digest(Buffer.concat([marker,Buffer.from(multiple)])));
    a.notEqual(repositoryIdentity(f.root),digest(Buffer.concat([marker,Buffer.from(multiple.replaceAll('\n',''))])));
    const before=bytesAndModes(f.root);a.equal(assertFixture(f.root),f.root);a.equal(bytesAndModes(f.root),before);
  } finally {f.cleanup();}
});
