import { test } from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { packages, portableSkill } from '../scripts/package.js';
import { digest, type Evidence } from '../core/contracts.js';
import { codexReceipt } from '../adapters/codex/bridge.js';
import { claudeReceipt } from '../adapters/claude-code/bridge.js';
import { publish, readCheckpoint } from '../core/checkpoint.js';
import { fixture, source } from './helpers.js';
const compiled=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function cli(pkg:string,args:string[],body:unknown):ReturnType<typeof spawnSync>{
 return spawnSync('node',[path.join(pkg,'runtime/scripts/cli.js'),...args],{input:JSON.stringify(body),encoding:'utf8'});
}
test('both generated packages share source/runtime content and exclude the scored oracle',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'proof-packages-'));
 try{
  const p=packages(source,compiled,path.join(tmp,'packages'));
  const left=JSON.parse(fs.readFileSync(path.join(p['claude-code'],'proof-package.json'),'utf8'));
  const right=JSON.parse(fs.readFileSync(path.join(p.codex,'proof-package.json'),'utf8'));
  a.equal(left.commonSourceHash,right.commonSourceHash);
  for(const file of ['core/method.md','runtime/core/policy.js','runtime/core/checkpoint.js','runtime/scripts/cli.js','LICENSE','THIRD-PARTY-NOTICES.md'])
   a.equal(left.files[file],right.files[file]);
  for(const h of Object.values(p)){a.equal(fs.existsSync(path.join(h,'evaluation/oracles')),false);a.equal(fs.existsSync(path.join(h,'runtime/core/budget.js')),false);a.equal(fs.existsSync(path.join(h,'runtime/guard')),false);}
  const valid=spawnSync('claude',['plugin','validate','--strict',p['claude-code']],{encoding:'utf8'});
  a.equal(valid.status,0,String(valid.stdout)+String(valid.stderr));
  const nativeTests=spawnSync('claude',['plugin','test',p['claude-code']],{encoding:'utf8'});
  a.equal(nativeTests.status,0,String(nativeTests.stdout)+String(nativeTests.stderr));
  // This native build omits hooks when a portable root manifest shadows the compatibility entrypoint.
  a.equal(fs.existsSync(path.join(p.codex,'plugin.json')),false);
  const manifest=JSON.parse(fs.readFileSync(path.join(p.codex,'.codex-plugin/plugin.json'),'utf8'));
  a.equal(manifest.hooks,'./hooks/hooks.json');
  const productionVersion=JSON.parse(fs.readFileSync(path.resolve(source,'../../plugins/methodical/.claude-plugin/plugin.json'),'utf8')).version as string;
  a.equal(manifest.name,'methodical-proof');a.notEqual(manifest.version,productionVersion);
  a.equal(JSON.parse(fs.readFileSync(path.join(p['claude-code'],'.claude-plugin/plugin.json'),'utf8')).version,manifest.version);
  a.equal(left.version,manifest.version);a.equal(right.version,manifest.version);
  a.equal(manifest.skills,'./skills/');
  a.equal(fs.existsSync(path.join(p.codex,manifest.hooks)),true);
  a.throws(()=>packages(source,compiled,path.join(tmp,'packages')),/empty/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('shared policy data change reaches both packages without editing host overlays',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'proof-policy-packages-'));
 try{
  const copied=path.join(tmp,'copy');fs.cpSync(source,copied,{recursive:true,filter:p=>!p.includes('node_modules')});
  // Retain repository-relative notice/version paths while exercising copied common data.
  fs.mkdirSync(path.join(tmp,'plugins'),{recursive:true});
  fs.cpSync(path.resolve(source,'../../plugins/methodical'),path.join(tmp,'plugins/methodical'),{recursive:true});
  fs.copyFileSync(path.resolve(source,'../../LICENSE'),path.join(tmp,'LICENSE'));
  const nested=path.join(tmp,'proofs/portable-core');fs.mkdirSync(path.dirname(nested),{recursive:true});fs.renameSync(copied,nested);
  const before=packages(nested,compiled,path.join(tmp,'before'));
  for(const h of ['claude-code','codex']){
   const f=path.join(nested,`core/profiles/${h}.json`);const v=JSON.parse(fs.readFileSync(f,'utf8'));v.choices.worker.effort='low';fs.writeFileSync(f,JSON.stringify(v));
  }
  const after=packages(nested,compiled,path.join(tmp,'after'));
  for(const h of ['claude-code','codex'] as const){
   const old=JSON.parse(fs.readFileSync(path.join(before[h],'proof-package.json'),'utf8'));
   const now=JSON.parse(fs.readFileSync(path.join(after[h],'proof-package.json'),'utf8'));
   a.notEqual(now.commonSourceHash,old.commonSourceHash);
   const profile=JSON.parse(fs.readFileSync(path.join(after[h],`core/profiles/${h}.json`),'utf8'));a.equal(profile.choices.worker.effort,'low');
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('native hook shape denies unsupported authority and does not block compaction',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'proof-hook-'));const f=fixture();
 try{
  const p=packages(source,compiled,path.join(tmp,'packages'));
  for(const h of ['claude-code','codex'] as const){
   const denied=cli(p[h],['hook',h],{cwd:f.root,hook_event_name:'PreToolUse'});a.equal(denied.status,0);
   const body=JSON.parse(String(denied.stdout));a.equal(body.hookSpecificOutput.permissionDecision,'deny');
   fs.writeFileSync(path.join(f.root,'.methodical/approval.json'),JSON.stringify({planHash:f.work.planHash,action:'implement',scope:'fixture-mean',operatorRef:'human-test-record'}));
   a.deepEqual(JSON.parse(String(cli(p[h],['hook',h],{cwd:f.root,hook_event_name:'PreToolUse'}).stdout)),{});
   fs.rmSync(path.join(f.root,'.methodical/approval.json'));
   a.deepEqual(JSON.parse(String(cli(p[h],['hook',h],{cwd:f.root,hook_event_name:'PreCompact',trigger:'manual'}).stdout)),{});
  }
 }finally{f.cleanup();fs.rmSync(tmp,{recursive:true,force:true});}
});
test('Codex startup has a finite context allowance covering the complete generated instructions',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'proof-startup-limit-'));const f=fixture();
 try{
  const p=packages(source,compiled,path.join(tmp,'packages'));
  const hooks=JSON.parse(fs.readFileSync(path.join(p.codex,'hooks/hooks.json'),'utf8'));
  const limit=hooks.hooks.SessionStart[0].hooks[0].additionalContextLimit;
  a.ok(Number.isInteger(limit)&&limit>0,'startup must declare a finite positive allowance');
  const started=cli(p.codex,['hook','codex'],{cwd:f.root,hook_event_name:'SessionStart'});
  a.equal(started.status,0,String(started.stderr));
  const context=JSON.parse(String(started.stdout)).hookSpecificOutput.additionalContext as string;
  // Approximate-token smoke only: a real native receipt must also confirm no spilling.
  a.ok(Buffer.byteLength(context,'utf8')<=limit*4,'startup exceeds its declared context allowance');
  for(const file of ['core/method.md','core/capabilities.md','core/records.md','core/proof-protocol.md','overlay.md'])
   a.ok(context.includes(fs.readFileSync(path.join(p.codex,file),'utf8')),file);
 }finally{f.cleanup();fs.rmSync(tmp,{recursive:true,force:true});}
});

test('configuration and synthetic hook input never become actual effort receipts',()=>{
 const ev:Evidence={kind:'configuration',ref:'thread',sha256:digest('thread')};
 const configured=codexReceipt({model:'gpt-6.1-sol',reasoningEffort:'medium'},ev);
 a.equal(configured.configured?.effort,'medium');a.equal(configured.observedEffort,null);a.equal(configured.observedModel,null);
 a.equal(claudeReceipt({usage:{model:'sonnet'},effort:{level:'high'}},{...ev,kind:'simulated'}).observedEffort,null);
});

test('packaged native tool observations and chat records stale semantic checkpoints; own standalone helpers do not',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'proof-journal-'));const f=fixture();
 try{
  const p=packages(source,compiled,path.join(tmp,'packages'));
  const work=path.join(f.root,'work.json');fs.writeFileSync(work,JSON.stringify(f.work));
  for(const h of ['claude-code','codex'] as const){
   a.equal(cli(p[h],['checkpoint',f.root,h,work],{}).status,0);
   const own=`node "${path.join(p[h],'runtime/scripts/cli.js')}" checkpoint "${f.root}" ${h} "${work}"`;
   a.equal(cli(p[h],['hook',h],{cwd:f.root,hook_event_name:'PostToolUse',tool_input:{command:own}}).status,0);
   a.equal(readCheckpoint(f.root).current,true);
   a.equal(cli(p[h],['hook',h],{cwd:f.root,hook_event_name:'PostToolUse',tool_name:'Bash',tool_use_id:'check-1',tool_input:{command:'python3 checks.py'},tool_response:'new acceptance finding'}).status,0);
   a.equal(readCheckpoint(f.root).current,false);
   a.equal(cli(p[h],['checkpoint',f.root,h,work],{}).status,0);
   a.equal(cli(p[h],['record',f.root,'finding','new-chat-finding'],{}).status,0);
   a.equal(readCheckpoint(f.root).current,false);
  }
 }finally{f.cleanup();fs.rmSync(tmp,{recursive:true,force:true});}
});

// Independently inspect a generated artifact after relocation, rather than trusting its generator.
function inventory(root:string, relative=''):string[]{
 return fs.readdirSync(path.join(root,relative)).sort().flatMap(name=>{
  const file=path.join(relative,name);const st=fs.lstatSync(path.join(root,file));
  a.equal(st.isSymbolicLink(),false);return st.isDirectory()?inventory(root,file):[file];
 });
}
function checkPortable(root:string):void{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'proof-package.json'),'utf8'));
 const files=inventory(root).filter(name=>name!=='proof-package.json');
 a.deepEqual(Object.keys(manifest.files).sort(),files.sort());
 for(const file of files)a.equal(manifest.files[file],digest(fs.readFileSync(path.join(root,file))));
 const skill=fs.readFileSync(path.join(root,'SKILL.md'),'utf8');
 a.match(skill,/^---\nname: methodical\n/);
 a.equal(path.basename(root),'methodical');
 a.equal(manifest.methodSourceHash,digest(skill.split('---\n\n')[1]!));
 for(const match of skill.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1]!;a.equal(path.isAbsolute(target),false);a.equal(target.includes('..'),false);
  a.equal(fs.statSync(path.join(root,target)).isFile(),true);
 }
 a.deepEqual(files.sort(),['LICENSE','SKILL.md','THIRD-PARTY-NOTICES.md','references/capabilities.md','references/records.md'].sort());
}
test('portable skill is complete, relocatable, instruction-only and detects artifact corruption',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portable-skill-'));
 try{
  const built=portableSkill(source,path.join(tmp,'original/methodical'));
  const moved=path.join(tmp,'relocated/methodical');fs.mkdirSync(path.dirname(moved));fs.renameSync(built,moved);
  checkPortable(moved);
  a.throws(()=>portableSkill(source,moved),/empty/);
  a.throws(()=>portableSkill(source,path.join(tmp,'wrong-name')),/named methodical/);
  fs.writeFileSync(path.join(moved,'undeclared.txt'),'unexpected');a.throws(()=>checkPortable(moved));
  fs.rmSync(path.join(moved,'undeclared.txt'));
  const ref=path.join(moved,'references/records.md');const bytes=fs.readFileSync(ref);
  fs.rmSync(ref);a.throws(()=>checkPortable(moved));fs.writeFileSync(ref,bytes);
  fs.appendFileSync(ref,'changed');a.throws(()=>checkPortable(moved));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('canonical instructions and references reach portable and relocated native entrypoints',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portable-shared-'));const f=fixture();
 try{
  const native=packages(source,compiled,path.join(tmp,'native'));
  const portable=portableSkill(source,path.join(tmp,'portable/methodical'));checkPortable(portable);
  const method=fs.readFileSync(path.join(source,'core/method.md'),'utf8');
  const protocol=fs.readFileSync(path.join(source,'core/proof-protocol.md'),'utf8');
  a.equal(fs.readFileSync(path.join(portable,'SKILL.md'),'utf8').split('---\n\n')[1],method);
  for(const h of ['claude-code','codex'] as const){
   const moved=path.join(tmp,'moved',h);fs.mkdirSync(path.dirname(moved),{recursive:true});fs.renameSync(native[h],moved);
   const manifest=JSON.parse(fs.readFileSync(path.join(moved,'proof-package.json'),'utf8'));
   a.equal(manifest.methodSourceHash,digest(method));
   const skill=fs.readFileSync(path.join(moved,'skills/proof/SKILL.md'),'utf8');a.ok(skill.includes(method));
   a.ok(skill.includes('../../core/proof-protocol.md'));
   for(const match of skill.matchAll(/\]\(([^)]+)\)/g))a.equal(fs.statSync(path.resolve(moved,'skills/proof',match[1]!)).isFile(),true);
   const start=cli(moved,['hook',h],{cwd:f.root,hook_event_name:'SessionStart'});a.equal(start.status,0);
   const context=JSON.parse(String(start.stdout)).hookSpecificOutput.additionalContext;
   a.ok(context.includes(method));a.ok(context.includes(protocol));
   for(const name of ['capabilities.md','records.md']){
    const shared=fs.readFileSync(path.join(source,'core',name),'utf8');
    a.equal(fs.readFileSync(path.join(portable,'references',name),'utf8'),shared);
    a.equal(fs.readFileSync(path.join(moved,'skills/proof/references',name),'utf8'),shared);
    a.ok(context.includes(shared));
   }
   // Loss of the extracted native protocol must fail startup, not silently drop proof requirements.
   fs.rmSync(path.join(moved,'core/proof-protocol.md'));
   a.notEqual(cli(moved,['hook',h],{cwd:f.root,hook_event_name:'SessionStart'}).status,0);
  }
 }finally{f.cleanup();fs.rmSync(tmp,{recursive:true,force:true});}
});
test('a canonical method edit propagates to every generated skill',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portable-edit-'));
 try{
  const repo=path.join(tmp,'source');const copied=path.join(repo,'proofs/portable-core');
  fs.mkdirSync(path.dirname(copied),{recursive:true});
  fs.cpSync(source,copied,{recursive:true,filter:p=>!p.includes('node_modules')});
  fs.cpSync(path.resolve(source,'../../plugins/methodical'),path.join(repo,'plugins/methodical'),{recursive:true});
  fs.copyFileSync(path.resolve(source,'../../LICENSE'),path.join(repo,'LICENSE'));
  const before=portableSkill(copied,path.join(tmp,'before/methodical'));
  const old=JSON.parse(fs.readFileSync(path.join(before,'proof-package.json'),'utf8')).methodSourceHash;
  fs.appendFileSync(path.join(copied,'core/method.md'),'\nCanonical propagation probe.\n');
  const native=packages(copied,compiled,path.join(tmp,'native'));
  const portable=portableSkill(copied,path.join(tmp,'after/methodical'));checkPortable(portable);
  const changed=digest(fs.readFileSync(path.join(copied,'core/method.md')));a.notEqual(changed,old);
  for(const pkg of [...Object.values(native),portable]){
   a.equal(JSON.parse(fs.readFileSync(path.join(pkg,'proof-package.json'),'utf8')).methodSourceHash,changed);
   const skill=fs.readFileSync(path.join(pkg,pkg===portable?'SKILL.md':'skills/proof/SKILL.md'),'utf8');
   a.ok(skill.includes('Canonical propagation probe.'));
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

// These snapshots deliberately do not call status: status itself may prepare metadata.
// Include directory existence and modes, including .methodical; Git internals are
// outside the repository helper's state and can contain access-dependent caches.
function repositoryInventory(root:string,relative=''):Record<string,{mode:number;bytes?:string}>{
 const entries:Record<string,{mode:number;bytes?:string}>={};
 for(const name of fs.readdirSync(path.join(root,relative)).sort()){
  if(relative===''&&name==='.git')continue;
  const file=relative?relative+'/'+name:name;const full=path.join(root,file);const st=fs.lstatSync(full);
  a.equal(st.isSymbolicLink(),false);
  entries[file]={mode:st.mode&0o777,...(st.isFile()?{bytes:fs.readFileSync(full).toString('base64')}:{})};
  if(st.isDirectory())Object.assign(entries,repositoryInventory(root,file));
 }
 return entries;
}
function unchanged<T>(root:string,operation:()=>T):T{
 const before=repositoryInventory(root);const result=operation();
 a.deepEqual(repositoryInventory(root),before,'read-only verification changed repository bytes, modes or existence');
 return result;
}
test('relocated native packages verify recovery read-only and exempt only exact verification hooks',()=>{
 const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'proof-verify-packages-')));const f=fixture();
 try{
  const built=packages(source,compiled,path.join(tmp,'original'));
  fs.mkdirSync(path.join(f.root,'.methodical/evidence'),{recursive:true});
  fs.writeFileSync(path.join(f.root,'.methodical/evidence/support.txt'),'required portable support\n');
  const saved=publish(f.root,'claude-code',{...f.work,captures:[{kind:'local',ref:'support',source:'.methodical/evidence/support.txt',archive:'evidence/support.txt',required:true}]});
  const bundle=path.join(tmp,'relocated-bundle');
  fs.renameSync(path.join(f.root,'.methodical/checkpoints',saved.generation),bundle);
  fs.rmSync(path.join(f.root,'.methodical'),{recursive:true});
  for(const h of ['claude-code','codex'] as const){
   const pkg=path.join(tmp,'relocated packages',h);fs.mkdirSync(path.dirname(pkg),{recursive:true});fs.renameSync(built[h],pkg);
   const root=path.join(tmp,'destination-'+h);
   const cloned=spawnSync('git',['clone','--quiet','--no-local',f.root,root],{encoding:'utf8'});
   a.equal(cloned.status,0,String(cloned.stderr));
   a.equal(fs.existsSync(path.join(root,'.methodical')),false);
   const exact=(phase:string,target=bundle)=>`node "${path.join(pkg,'runtime/scripts/cli.js')}" verify "${root}" "${target}" ${phase}`;
   const hook=(event:string,command:string)=>cli(pkg,['hook',h],{cwd:root,hook_event_name:event,tool_name:'Bash',tool_input:{command}});
   for(const phase of ['pre-restore','post-restore']){
    const passed=unchanged(root,()=>cli(pkg,['verify',root,bundle,phase],{}));
    a.equal(passed.status,0,String(passed.stderr));a.equal(JSON.parse(String(passed.stdout)).pass,true);
    const denied=unchanged(root,()=>hook('PreToolUse',exact(phase)));
    a.equal(denied.status,0,String(denied.stderr));a.equal(JSON.parse(String(denied.stdout)).hookSpecificOutput.permissionDecision,'deny');
    const observed=unchanged(root,()=>hook('PostToolUse',exact(phase)));
    a.equal(observed.status,0,String(observed.stderr));a.deepEqual(JSON.parse(String(observed.stdout)),{});
   }
   a.equal(fs.existsSync(path.join(root,'.methodical')),false);
   // Failed verification must not create metadata either. PostToolUse does not
   // get to rewrite the result of the command it just observed.
   fs.appendFileSync(path.join(root,'calc.py'),'\n# mismatched destination\n');
   for(const phase of ['pre-restore','post-restore']){
    const failed=unchanged(root,()=>cli(pkg,['verify',root,bundle,phase],{}));
    a.equal(failed.status,1,String(failed.stderr));a.equal(JSON.parse(String(failed.stdout)).pass,false);
    a.deepEqual(JSON.parse(String(unchanged(root,()=>hook('PostToolUse',exact(phase))).stdout)),{});
   }
   a.equal(fs.existsSync(path.join(root,'.methodical')),false);
   fs.copyFileSync(path.join(f.root,'calc.py'),path.join(root,'calc.py'));
   fs.mkdirSync(path.join(root,'.methodical'),{mode:0o700});
   fs.writeFileSync(path.join(root,'.methodical/approval.json'),JSON.stringify({planHash:f.work.planHash,action:'implement',scope:'fixture-mean',operatorRef:'human-test-record'}));
   fs.writeFileSync(path.join(root,'.methodical/preserve.txt'),'existing metadata\n',{mode:0o640});
   for(const phase of ['pre-restore','post-restore']){
    const allowed=unchanged(root,()=>hook('PreToolUse',exact(phase)));
    a.equal(allowed.status,0,String(allowed.stderr));a.deepEqual(JSON.parse(String(allowed.stdout)),{});
    const passed=unchanged(root,()=>cli(pkg,['verify',root,bundle,phase],{}));
    a.equal(passed.status,0,String(passed.stderr));
    unchanged(root,()=>hook('PostToolUse',exact(phase)));
    const missing=path.join(tmp,'missing-bundle');
    const failed=unchanged(root,()=>cli(pkg,['verify',root,missing,phase],{}));
    a.equal(failed.status,1,String(failed.stderr));a.equal(JSON.parse(String(failed.stdout)).pass,false);
    a.deepEqual(JSON.parse(String(unchanged(root,()=>hook('PreToolUse',exact(phase,missing))).stdout)),{});
    a.deepEqual(JSON.parse(String(unchanged(root,()=>hook('PostToolUse',exact(phase,missing))).stdout)),{});
   }
   const lookalikes=[exact('pre-restore')+' && true',exact('pre-restore')+'; true',exact('pre-restore')+' extra',
    exact('pre-restore').replace('node "','node "'+path.sep+'wrong'),`echo ${exact('pre-restore')}`];
   for(const command of lookalikes){
    const before=fs.existsSync(path.join(root,'.methodical/journal.json'))?JSON.parse(fs.readFileSync(path.join(root,'.methodical/journal.json'),'utf8')).relevant:0;
    const observed=hook('PostToolUse',command);a.equal(observed.status,0,String(observed.stderr));
    const journal=JSON.parse(fs.readFileSync(path.join(root,'.methodical/journal.json'),'utf8'));
    a.equal(journal.relevant,before+1,'lookalike or compound verify command bypassed observation');
   }
  }
 }finally{f.cleanup();fs.rmSync(tmp,{recursive:true,force:true});}
});
