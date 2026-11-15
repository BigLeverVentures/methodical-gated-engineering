import {test} from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,profile,type Host} from '../src/contracts.js';
import {prepareIntent,cancelIntent,correlateIntent,receiveNativeStop,completeIntent,inspectDispatch,policyBindingHash,approvalTemplate} from '../src/dispatch.js';
const source=process.env.METHODICAL_SOURCE_ROOT??process.cwd();
function baseline(h:Host){return profile(JSON.parse(fs.readFileSync(path.join(source,'packages/methodical-core/profiles',`${h}.json`),'utf8')));}
function fixture(t:{after:(fn:()=>void)=>void},h:Host='codex'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-routing-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});git('init','-q');git('config','user.name','Example');git('config','user.email','example@example.invalid');
 fs.mkdirSync(path.join(root,'.methodical/feedback'),{recursive:true});fs.writeFileSync(path.join(root,'.gitignore'),'.methodical/\n');for(const[n,s]of Object.entries({'plan.md':'Approved scoped plan','method.md':'Read exact candidate and preserve debt','lens.md':'Check stack correctness','check.cjs':'process.stderr.write("FAIL\\n"); process.exit(1);'}))fs.writeFileSync(path.join(root,n),s);
 git('add','.');git('commit','-qm','fixture');const p=baseline(h),input={binding:{unitId:'unit-a',planPath:'plan.md',planHash:digest('Approved scoped plan'),scope:'one scoped change',approvalPath:'.methodical/approval.json',approvalHash:digest('placeholder')},operationId:'implementation',profile:p,role:'worker',risk:'full',stack:'typescript',task:'routine',policy:'adaptive',methodPath:'method.md',lensPaths:['lens.md'],brief:'Inspect this scoped task',available:[...Object.values(p.choices),...Object.values(p.qualifiedOverrides?.choices??{})],rejectedModels:[]} as Record<string,unknown>;
 const approval={...approvalTemplate(root,input),approved:true};fs.writeFileSync(path.join(root,'.methodical/approval.json'),JSON.stringify(approval));(input.binding as {approvalHash:string}).approvalHash=digest(JSON.stringify(approval));return {root,input};
}

import {dispatchCodexBatch, dispatchCodexProcess, CodexEventParser, processLimits} from '../../../adapters/codex-process.js';
import {reserveProcessIntent} from '../src/dispatch.js';
const uuid='12345678-1234-1234-1234-123456789abc';
const start=[{type:'thread.started',thread_id:uuid},{type:'turn.started'}];
const terminal={type:'turn.completed',usage:{input_tokens:3,cached_input_tokens:0,output_tokens:1}};
const lines=(events:unknown[])=>events.map(e=>JSON.stringify(e)+'\n').join('');
function executable(root:string, body:string):string {
 const file=path.join(root,'.methodical/fixture');
 fs.writeFileSync(file,`#!${process.execPath}\n${body}`,{mode:0o700});return file;
}
const emit=(events:unknown[])=>`process.stdout.write(${JSON.stringify(lines(events))});`;
function fixtureCode(root:string, body:string):string {
 return executable(root,`const fs=require('node:fs');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{fs.appendFileSync(${JSON.stringify(path.join(root,'.methodical/launches'))},'1');fs.writeFileSync(${JSON.stringify(path.join(root,'.methodical/invocation.json'))},JSON.stringify({args:process.argv.slice(2),input}));${body}});`);
}
test('owned process uses selected fixed argv and exact sealed brief once under concurrent claims',async t=>{
 const {root,input}=fixture(t),i=await prepareIntent(root,input);
 const exe=fixtureCode(root,emit([...start,terminal]));
 const results=await Promise.allSettled([dispatchCodexProcess(root,i.id,{executable:exe,graceMs:10}),dispatchCodexProcess(root,i.id,{executable:exe,graceMs:10})]);
 a.equal(results.filter(r=>r.status==='fulfilled').length,1);
 a.equal(fs.readFileSync(path.join(root,'.methodical/launches'),'utf8'),'1');
 const done=inspectDispatch(root).intents[0]!;a.equal(done.status,'completed');a.equal(done.reservation?.childId,uuid);a.equal(done.completion?.source,'codex-cli-process');a.equal(done.completion?.observedModel,null);
 a.match(done.reservation!.sessionId,/^wrapper-session:/);a.notEqual(done.reservation!.sessionId,uuid);
 const invocation=JSON.parse(fs.readFileSync(path.join(root,'.methodical/invocation.json'),'utf8'));a.equal(invocation.input,i.brief);
 a.deepEqual(invocation.args,['exec','--json','--model',i.decision.setting!.model,'-c',`model_reasoning_effort=${JSON.stringify(i.decision.setting!.effort)}`,'-c','features.multi_agent=false','-c','features.multi_agent_v2=false','-']);
 const m=JSON.parse(fs.readFileSync(path.join(root,`.methodical/evidence/cli/${i.id}/manifest.json`),'utf8'));a.equal(m.stdinHash,i.briefHash);
 await a.rejects(dispatchCodexProcess(root,i.id,{executable:exe}),/consumed/);
});
test('a managed batch starts both distinct intents before either reports completion', async t => {
 const {root,input}=fixture(t);
 const binding=input.binding as {approvalPath:string;approvalHash:string};
 const operations=['implementation','second-worker'];
 const approval=JSON.stringify({...approvalTemplate(root,{...input,allowedOperations:operations}),approved:true});
 fs.writeFileSync(path.join(root,binding.approvalPath),approval);
 binding.approvalHash=digest(approval);
 const first=await prepareIntent(root,{...input,operationId:operations[0]});
 const second=await prepareIntent(root,{...input,operationId:operations[1]});
 const launches=path.join(root,'.methodical/launches');
 const exe=fixtureCode(root,`const timer=setInterval(()=>{if(fs.readFileSync(${JSON.stringify(launches)},'utf8').length===2){clearInterval(timer);${emit([...start,terminal])}}},10);`);
 await a.rejects(dispatchCodexBatch(root,[first.id,first.id],{executable:exe}),/distinct/);
 a.equal(fs.existsSync(launches),false);
 const results=await dispatchCodexBatch(root,[first.id,second.id],{executable:exe,deadlineMs:3_000,graceMs:10});
 a.deepEqual(results.map(item=>item.status),['completed','completed']);
 a.equal(fs.readFileSync(launches,'utf8'),'11');
});

test('a clean managed worker records completion after a coordinator briefly holds the journal lock', async t => {
 const {root,input}=fixture(t);
 const worker=await prepareIntent(root,input);
 const lock=path.join(root,'.methodical/lock');
 const exe=fixtureCode(root,`fs.mkdirSync(${JSON.stringify(lock)});${emit([...start,terminal])}`);
 const result=dispatchCodexProcess(root,worker.id,{executable:exe,graceMs:10});
 const end=Date.now()+2_000;
 while(!fs.existsSync(path.join(root,'.methodical/launches')) || !fs.existsSync(lock)){
  a.ok(Date.now()<end,'worker did not reach the contention fixture');
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 await new Promise(resolve=>setTimeout(resolve,150));
 fs.rmdirSync(lock);
 a.equal((await result).status,'completed');
 const journal=JSON.parse(fs.readFileSync(path.join(root,'.methodical/journal.json'),'utf8'));
 a.equal(journal.records.filter((record:{kind:string})=>record.kind==='codex-cli-process').length,1);
});

test('authority failures launch zero synthetic processes; reserved crash debt prevents replay',async t=>{
 for(const mode of ['approval','candidate','cancel','host','crash'] as const){
  const {root,input}=fixture(t,mode==='host'?'claude-code':'codex'),i=await prepareIntent(root,input),exe=fixtureCode(root,emit([...start,terminal]));
  if(mode==='approval')fs.writeFileSync(path.join(root,'.methodical/approval.json'),'{}');
  if(mode==='candidate')fs.appendFileSync(path.join(root,'lens.md'),'changed');
  if(mode==='cancel')await cancelIntent(root,i.id,{reason:'explicit abandonment'});
  if(mode==='crash')await reserveProcessIntent(root,i.id);
  await a.rejects(dispatchCodexProcess(root,i.id,{executable:exe}));a.equal(fs.existsSync(path.join(root,'.methodical/launches')),false);
 }
});
test('process claims reject generic, native-stop and queued native correlation receipts',async t=>{
 const {root,input}=fixture(t),i=await prepareIntent(root,input),r=(await reserveProcessIntent(root,i.id)).reservation!;
 const context={host:r.host,sessionId:r.sessionId,toolUseId:r.toolUseId,childId:uuid};
 a.deepEqual(await receiveNativeStop(root,{...context,terminal:true,outcome:'completed'}),{recorded:false,intentId:null});
 await a.rejects(correlateIntent(root,i.id,context),/process claims/);
 for(const source of [undefined,'native-stop','codex-cli-process'])await a.rejects(completeIntent(root,i.id,{...context,outcome:'completed',source}),/process claims/);
 a.equal(inspectDispatch(root).intents[0]!.status,'reserved');
});
test('chunked fatal UTF8 parser accepts finite valid sequence and rejects ambiguous control',()=>{
 const bytes=Buffer.from(lines([...start,{type:'item.completed',item:{id:'i',type:'agent_message',text:'café'}},terminal]));
 const p=new CodexEventParser();for(const byte of bytes)p.feed(Buffer.from([byte]));p.end();a.equal(p.childId,uuid);
 const bad:Buffer[]=[Buffer.from([0xff]),Buffer.from('null\n'),Buffer.from('{}\n'),Buffer.from('{\n'),Buffer.from(lines([...start,start[0],terminal])),Buffer.from(lines([...start,terminal,terminal])),Buffer.from(lines([...start,{...terminal,usage:{input_tokens:-1,cached_input_tokens:0,output_tokens:0}}])),Buffer.from(lines([...start,{type:'error',message:'failure'}])),Buffer.from(lines([{type:'thread.started',thread_id:'wrapper-id'},...start,terminal])),Buffer.from(lines([...start,terminal]).trimEnd())];
 for(const bytes of bad)a.throws(()=>{const parser=new CodexEventParser();parser.feed(bytes);parser.end();});
});
test('missing terminal, native error, nonzero exit, overflow and absent executable keep unknown debt',async t=>{
 for(const mode of ['missing','error','nonzero','overflow','absent','stdin'] as const){
  const {root,input}=fixture(t),i=await prepareIntent(root,input);
  const body=mode==='missing'?emit(start):mode==='error'?emit([...start,{type:'turn.failed',error:{message:'failed'}}]):mode==='overflow'?`process.stderr.write('x'.repeat(${processLimits.output+1}));setInterval(()=>{},1000);`:emit([...start,terminal])+ (mode==='nonzero'?'process.exitCode=3;':'');
  const exe=mode==='absent'?path.join(root,'.methodical/missing'):mode==='stdin'?executable(root,'process.stdin.destroy();setInterval(()=>{},1000);'):fixtureCode(root,body);
  const done=await dispatchCodexProcess(root,i.id,{executable:exe,deadlineMs:250,graceMs:15});a.equal(done.status,'dispatch-unknown',mode);a.equal(done.completion?.terminal,false,mode);
  await a.rejects(prepareIntent(root,input),/pending|unknown/);
  const dir=path.join(root,`.methodical/evidence/cli/${i.id}`);a.ok(fs.statSync(path.join(dir,'stdout.jsonl')).size+fs.statSync(path.join(dir,'stderr.txt')).size<=processLimits.output);
 }
});
test('deadline and cancellation kill an owned TERM-ignoring descendant',async t=>{
 for(const cancel of [false,true]){
 const {root,input}=fixture(t),i=await prepareIntent(root,input),pidFile=path.join(root,'.methodical/descendant');
 const exe=fixtureCode(root,`process.on('SIGTERM',()=>{});const cp=require('node:child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(cp.pid));setInterval(()=>{},1000);`);
 const controller=new AbortController();const pending=dispatchCodexProcess(root,i.id,{executable:exe,signal:controller.signal,deadlineMs:400,graceMs:25});
 if(cancel){while(!fs.existsSync(pidFile))await new Promise(r=>setTimeout(r,5));controller.abort();}
 const done=await pending;a.equal(done.status,'dispatch-unknown');const pid=Number(fs.readFileSync(pidFile,'utf8'));
 // A dead descendant may briefly remain a zombie until the system reaper observes it.
 let alive=true;for(let n=0;n<50;n++){try{process.kill(pid,0);}catch{alive=false;break;}await new Promise(r=>setTimeout(r,10));}
 a.equal(alive,false,'descendant still alive');
 }
});

import {publish,readCheckpoint,inspectBundle,verifyRecovery} from '../src/checkpoint.js';
import {identityAlgorithm,repositoryIdentity} from '../src/project.js';

test('maximum retained output publishes explicit captures and unknown recovery retains consumed claim',async t=>{
 const {root,input}=fixture(t),i=await prepareIntent(root,input);
 const initial=lines(start),exe=fixtureCode(root,`process.stdout.write(${JSON.stringify(initial)});process.stderr.write('x'.repeat(${processLimits.output-Buffer.byteLength(initial)}));`);
 const done=await dispatchCodexProcess(root,i.id,{executable:exe,graceMs:10});a.equal(done.status,'dispatch-unknown');
 const base=`.methodical/evidence/cli/${i.id}`;
 const captures=['manifest.json','stdout.jsonl','stderr.txt'].map(name=>({kind:'local' as const,ref:`cli:${name}`,source:`${base}/${name}`,archive:`evidence/cli/${name}`,required:true}));
 const routing='.methodical/routing-state.json';
 const binding={schemaVersion:1 as const,identityAlgorithm,repositoryIdentity:repositoryIdentity(root),plan:{path:'plan.md',sha256:digest(fs.readFileSync(path.join(root,'plan.md')))},scope:'one scoped change',profileHash:i.profileHash,policyHash:policyBindingHash(i.input),routing:{path:routing,sha256:digest(fs.readFileSync(path.join(root,routing)))}};
 const work={binding,planHash:binding.plan.sha256,step:'compact',nextAction:'Reconcile unknown CLI claim.',rulings:'method.md',lessons:[],findings:[],reviewDebt:done.decision.reviewDebt,evidence:[],captures};
 const checkpoint=publish(root,'codex',work),archive=path.join(root,'.methodical/checkpoints',checkpoint.generation);
 a.equal(readCheckpoint(root).current,true);a.equal(inspectBundle(archive).capture?.records.filter(r=>r.ref.startsWith('cli:')).length,3);
 const target=root+'-recovered';t.after(()=>fs.rmSync(target,{recursive:true,force:true}));execFileSync('git',['clone','-q','--local',root,target]);
 for(const capture of inspectBundle(archive).capture!.records)if(capture.kind==='local'){
  const dest=path.join(target,capture.source);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(archive,capture.archive),dest);
 }
 for(const [name,mode]of Object.entries(JSON.parse(fs.readFileSync(path.join(archive,'evidence/dispatch-dependency-modes.json'),'utf8'))))fs.chmodSync(path.join(target,name),mode as number);
 a.equal(verifyRecovery(target,archive,'post-restore').pass,true);a.equal(inspectDispatch(target).intents[0]!.status,'dispatch-unknown');
 await a.rejects(dispatchCodexProcess(target,i.id,{executable:exe}),/consumed/);
 fs.appendFileSync(path.join(root,base,'stderr.txt'),'later');a.equal(readCheckpoint(root).current,false);
 a.throws(()=>publish(root,'codex',{...work,captures:[...captures,{kind:'local',ref:'missing',source:`${base}/missing`,archive:'evidence/missing',required:true}]}),/missing/);
});

test('public dispatch-cli command uses only root/intent and operator executable configuration',async t=>{
 const {root,input}=fixture(t),i=await prepareIntent(root,input),exe=fixtureCode(root,emit([...start,terminal]));
 const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
 const output=execFileSync(process.execPath,[cli,'dispatch-cli',root,i.id],{env:{...process.env,METHODICAL_CODEX_EXECUTABLE:exe},encoding:'utf8'});
 a.equal(JSON.parse(output).status,'completed');a.equal(fs.readFileSync(path.join(root,'.methodical/launches'),'utf8'),'1');
});


test('escaped descendant holding inherited pipes cannot extend the local deadline', {timeout:5000}, async t=>{
 const {root,input}=fixture(t),i=await prepareIntent(root,input),pidFile=path.join(root,'.methodical/escaped');
 let escapedPid:number|undefined;
 t.after(()=>{if(escapedPid)try{process.kill(escapedPid,'SIGKILL');}catch{}});
 const exe=fixtureCode(root,`const cp=require('node:child_process').spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{detached:true,stdio:['ignore',1,2]});fs.writeFileSync(${JSON.stringify(pidFile)},String(cp.pid));${emit([...start,terminal])}process.exit(0);`);
 const before={int:process.listenerCount('SIGINT'),term:process.listenerCount('SIGTERM')};
 const started=Date.now();const pending=dispatchCodexProcess(root,i.id,{executable:exe,deadlineMs:250,graceMs:20});
 while(!fs.existsSync(pidFile)){a.ok(Date.now()-started<2000);await new Promise(r=>setTimeout(r,5));}
 escapedPid=Number(fs.readFileSync(pidFile,'utf8'));
 const done=await pending;a.ok(Date.now()-started<2000);a.equal(done.status,'dispatch-unknown');a.equal(done.completion?.terminal,false);
 const m=JSON.parse(fs.readFileSync(path.join(root,`.methodical/evidence/cli/${i.id}/manifest.json`),'utf8'));
 a.equal(m.leaderReaped,true);a.equal(m.forcedPipeClose,true);a.equal(m.streamsComplete,false);a.equal(m.reason,'dispatch deadline');a.equal(m.configured.sandbox,'inherited-native-configuration');
 a.equal(process.listenerCount('SIGINT'),before.int);a.equal(process.listenerCount('SIGTERM'),before.term);
 await a.rejects(dispatchCodexProcess(root,i.id,{executable:exe}),/consumed/);
 // This process escaped the owned group. The test, not the adapter, explicitly owns its teardown.
 process.kill(escapedPid,0);
});
