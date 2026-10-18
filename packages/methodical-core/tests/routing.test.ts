import {test} from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest,profile,type Host} from '../src/contracts.js';
import {decide,requiredSeats,seatSetting} from '../src/policy.js';
import {choiceSetting} from '../src/profiles.js';
import {prepareIntent,cancelIntent,interceptIntent,correlateIntent,receiveNativeStop,completeIntent,inspectDispatch,policyBindingHash,approvalTemplate,dispatchDependencies,dispatchDependenciesFromState} from '../src/dispatch.js';
import {candidateIdentity} from '../src/project.js';
const source=process.env.METHODICAL_SOURCE_ROOT??process.cwd();
function baseline(h:Host){return profile(JSON.parse(fs.readFileSync(path.join(source,'packages/methodical-core/profiles',`${h}.json`),'utf8')));}
function fixture(t:{after:(fn:()=>void)=>void},h:Host='codex'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-routing-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});git('init','-q');git('config','user.name','Example');git('config','user.email','example@example.invalid');
 fs.mkdirSync(path.join(root,'.methodical/feedback'),{recursive:true});fs.writeFileSync(path.join(root,'.gitignore'),'.methodical/\n');for(const[n,s]of Object.entries({'plan.md':'Approved scoped plan','method.md':'Read exact candidate and preserve debt','lens.md':'Check stack correctness','check.cjs':'process.stderr.write("FAIL\\n"); process.exit(1);'}))fs.writeFileSync(path.join(root,n),s);
 git('add','.');git('commit','-qm','fixture');const p=baseline(h),input={binding:{unitId:'unit-a',planPath:'plan.md',planHash:digest('Approved scoped plan'),scope:'one scoped change',approvalPath:'.methodical/approval.json',approvalHash:digest('placeholder')},operationId:'implementation',profile:p,role:'worker',risk:'full',stack:'typescript',task:'routine',policy:'adaptive',methodPath:'method.md',lensPaths:['lens.md'],brief:'Inspect this scoped task',available:[...Object.values(p.choices),...Object.values(p.qualifiedOverrides?.choices??{})],rejectedModels:[]} as Record<string,unknown>;
 const approval={...approvalTemplate(root,input),approved:true};fs.writeFileSync(path.join(root,'.methodical/approval.json'),JSON.stringify(approval));(input.binding as {approvalHash:string}).approvalHash=digest(JSON.stringify(approval));return {root,input};
}
const context={host:'codex',sessionId:'session',toolUseId:'tool'};
test('stack seats, guidance provenance, qualified overrides and legacy models stay distinct',()=>{
 const p=baseline('codex');a.equal(p.choices.backstop.effort,'low');a.equal(choiceSetting(p,'backstop','backstop').effort,'medium');a.equal(seatSetting(p,'rigor','full').effort,'medium');for(const s of ['typescript','python','swift','flutter','general'] as const){const seats=requiredSeats('none',s);a.ok(seats.includes(`${s==='general'||s==='flutter'?'generic':s}-correctness`));a.ok(!seats.includes('backstop'));a.ok(requiredSeats('lean',s).includes('backstop'));}
 const c=baseline('claude-code');c.legacyRoleModels={worker:'explicit-model'};a.deepEqual(choiceSetting(c,'demanding','worker'),{model:'explicit-model',effort:'medium'});
 const i={role:'worker' as const,risk:'full' as const,stack:'typescript' as const,task:'routine' as const,policy:'adaptive' as const,failure:'capability' as const,verifiedFeedback:false,attempts:0,reviewCycles:0,escalations:0,available:Object.values(p.choices),rejectedModels:[],remainingRequests:5};a.throws(()=>decide(p,i),/freshly reproduced/);a.equal(decide(p,{...i,failure:'unknown'}).action,'stop');
});
test('prepared complete brief binds approval, support, exact candidate and profile',async t=>{const {root,input}=fixture(t),i=await prepareIntent(root,input);a.ok(i.brief.includes('Approved scoped plan'));a.ok(i.brief.includes('Check stack correctness'));a.ok(i.brief.includes(`[methodical-intent:${i.id}]`));a.equal(i.briefHash,digest(i.brief));a.equal(i.decision.reviewDebt.length,6);fs.writeFileSync(path.join(root,'lens.md'),'changed');await a.rejects(interceptIntent(root,i.id,context),/stale candidate|lens/);a.equal(inspectDispatch(root).intents[0]?.status,'prepared');});
test('profile substitution and nonmatching cooperative approval fail closed',async t=>{const {root,input}=fixture(t);(input.profile as {limits:{requests:number}}).limits.requests=25;await a.rejects(prepareIntent(root,input),/approval/);a.equal(inspectDispatch(root).intents.length,0);a.throws(()=>policyBindingHash({...input,risk:'arbitrary'}),/assurance/);});
test('duplicate reservation, forged correlation and completion retain review debt and durable attempts',async t=>{const {root,input}=fixture(t),i=await prepareIntent(root,input);await interceptIntent(root,i.id,context);await a.rejects(interceptIntent(root,i.id,context),/consumed/);await a.rejects(prepareIntent(root,input),/pending/);await a.rejects(correlateIntent(root,i.id,{...context,toolUseId:'forged',childId:'child'}),/correlation/);await correlateIntent(root,i.id,{...context,childId:'child'});const done=await completeIntent(root,i.id,{...context,childId:'child',outcome:'completed'});a.equal(done.status,'completed');a.ok(done.decision.reviewDebt.includes('backstop'));await a.rejects(completeIntent(root,i.id,{...context,childId:'child',outcome:'completed'}),/duplicate/);const next=await prepareIntent(root,input);await interceptIntent(root,next.id,{...context,toolUseId:'tool2'});await correlateIntent(root,next.id,{...context,toolUseId:'tool2',childId:'child2'});await completeIntent(root,next.id,{...context,toolUseId:'tool2',childId:'child2',outcome:'completed'});const stop=await prepareIntent(root,input);a.equal(stop.decision.action,'stop');await a.rejects(interceptIntent(root,stop.id,{...context,toolUseId:'tool3'}),/does not authorize/);});
test('reservation without receipt and unknown outcomes never blindly retry after reload',async t=>{const {root,input}=fixture(t),i=await prepareIntent(root,input);await interceptIntent(root,i.id,context);a.equal(inspectDispatch(root).intents[0]?.status,'reserved');await a.rejects(prepareIntent(root,input),/pending/);await completeIntent(root,i.id,{...context,childId:null,outcome:'unknown'});a.equal(inspectDispatch(root).intents[0]?.status,'dispatch-unknown');await a.rejects(prepareIntent(root,input),/unknown/);});
test('fresh deterministic feedback reproduction is mandatory and exact output is bound',async t=>{const {root,input}=fixture(t),candidate=candidateIdentity(root),finding={accepted:true,material:true,classification:'capability',candidate,planHash:(input.binding as {planHash:string}).planHash};const bytes=JSON.stringify(finding);fs.writeFileSync(path.join(root,'.methodical/feedback/finding.json'),bytes);input.feedback={classification:'capability',checkerPath:'check.cjs',checkerHash:digest(fs.readFileSync(path.join(root,'check.cjs'))),args:[],expectedExit:1,outputHash:digest(Buffer.from('\0FAIL\n')),findingPath:'.methodical/feedback/finding.json',findingHash:digest(bytes)};const i=await prepareIntent(root,input);a.match(i.decision.reason,/verified capability/);await interceptIntent(root,i.id,context);a.equal(inspectDispatch(root).intents[0]?.status,'reserved');});
test('evidence identifiers cannot manufacture an escalation and unknown classification is rejected',async t=>{const {root,input}=fixture(t);input.evidenceIds=['fake'];const i=await prepareIntent(root,input);a.doesNotMatch(i.decision.reason,/verified/);input.feedback={classification:'unknown'};await a.rejects(prepareIntent(root,input),/classification/);});
test('wrong failure output and stale accepted finding cannot grant an adjustment',async t=>{const {root,input}=fixture(t),finding={accepted:true,material:true,classification:'diligence',candidate:candidateIdentity(root),planHash:(input.binding as {planHash:string}).planHash};const bytes=JSON.stringify(finding);fs.writeFileSync(path.join(root,'.methodical/feedback/f.json'),bytes);input.feedback={classification:'diligence',checkerPath:'check.cjs',checkerHash:digest(fs.readFileSync(path.join(root,'check.cjs'))),args:[],expectedExit:1,outputHash:digest('fabricated'),findingPath:'.methodical/feedback/f.json',findingHash:digest(bytes)};await a.rejects(prepareIntent(root,input),/output differs/);a.equal(inspectDispatch(root).intents.length,0);(input.feedback as {outputHash:string}).outputHash=digest(Buffer.from('\0FAIL\n'));fs.writeFileSync(path.join(root,'new-file'),'new candidate');await a.rejects(prepareIntent(root,input),/current material/);});
test('held crash lock and corrupt durable state stop before reservation',async t=>{const {root,input}=fixture(t);fs.mkdirSync(path.join(root,'.methodical/lock'));await a.rejects(prepareIntent(root,input),/lock held/);fs.rmdirSync(path.join(root,'.methodical/lock'));await prepareIntent(root,input);const file=path.join(root,'.methodical/routing-state.json'),s=JSON.parse(fs.readFileSync(file,'utf8'));s.intents[0].decision.setting.model='forged';fs.writeFileSync(file,JSON.stringify(s));a.throws(()=>inspectDispatch(root),/checksum/);});
test('concurrent native processes consume a prepared intent exactly once',async t=>{const {root,input}=fixture(t),i=await prepareIntent(root,input),moduleURL=pathToFileURL(fileURLToPath(new URL('../src/dispatch.js',import.meta.url))).href;const code=`import {interceptIntent} from ${JSON.stringify(moduleURL)};try{await interceptIntent(process.argv[1],process.argv[2],JSON.parse(process.argv[3]));process.exitCode=0}catch{process.exitCode=7}`;const run=()=>new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,root,i.id,JSON.stringify(context)],{stdio:'ignore'});child.once('error',reject);child.once('exit',resolve);});const results=await Promise.all([run(),run()]);a.equal(results.filter(x=>x===0).length,1);a.equal(results.filter(x=>x===7).length,1);a.equal(inspectDispatch(root).intents.filter(x=>x.reservation).length,1);a.equal(fs.readdirSync(path.join(root,'.methodical')).filter(x=>x.endsWith('.tmp')).length,0);});

test('different approved review operations have independent attempts while failures cannot reset',async t=>{const {root,input}=fixture(t);for(const operationId of ['north-star','code-grounded','simplicity','rigor','typescript-correctness']){const next={...input,operationId,role:'decider',brief:`Review ${operationId}`};const i=await prepareIntent(root,next),c={...context,toolUseId:operationId};await interceptIntent(root,i.id,c);await correlateIntent(root,i.id,{...c,childId:operationId});await completeIntent(root,i.id,{...c,childId:operationId,outcome:'completed'});}const i=await prepareIntent(root,input);await interceptIntent(root,i.id,context);await correlateIntent(root,i.id,{...context,childId:'implementation'});await completeIntent(root,i.id,{...context,childId:'implementation',outcome:'partial'});await a.rejects(prepareIntent(root,input),/requires classified/);const stopped=await prepareIntent(root,{...input,failure:'environment'});a.equal(stopped.decision.action,'stop');});

test('native requested settings are recorded separately from configured and unknown observations',async t=>{const {root,input}=fixture(t),i=await prepareIntent(root,input);const r=await interceptIntent(root,i.id,{...context,requested:{model:'deliberately-mismatched',effort:'unsupported-request'}});a.equal(r.reservation?.requested.model,'deliberately-mismatched');a.deepEqual(r.reservation?.configured,i.decision.setting);await correlateIntent(root,i.id,{...context,childId:'child'});const done=await completeIntent(root,i.id,{...context,childId:'child',outcome:'completed'});a.equal(done.completion?.observedModel,null);a.equal(done.completion?.observedEffort,null);});

test('independent approved operations reserve concurrently and checkpoint dependency list follows active state',async t=>{const {root,input}=fixture(t);const one=await prepareIntent(root,input),two=await prepareIntent(root,{...input,operationId:'rigor',role:'decider',brief:'Review rigor'});await interceptIntent(root,one.id,context);await interceptIntent(root,two.id,{...context,toolUseId:'review'});a.equal(inspectDispatch(root).intents.filter(i=>i.status==='reserved').length,2);const deps=dispatchDependencies(root);a.ok(deps.some(d=>d.source==='.methodical/approval.json'));a.ok(deps.some(d=>d.source==='method.md'));a.ok(deps.some(d=>d.source==='lens.md'));a.deepEqual(dispatchDependenciesFromState(inspectDispatch(root)),deps);fs.writeFileSync(path.join(root,'lens.md'),'stale lens');a.throws(()=>dispatchDependencies(root),/dependency changed/);});

test('every supported stack and assurance level resolves canonical lens files',()=>{for(const s of ['typescript','python','swift','flutter','general'] as const)for(const risk of ['none','lean','full'] as const)for(const seat of requiredSeats(risk,s)){if(seat==='backstop')continue;a.ok(fs.statSync(path.join(source,'packages/methodical-core/method/lenses',`${seat}.md`)).isFile(),`${s}/${risk}/${seat}`);}});

test('prepared cancellation is explicit and terminal, with history and spent counters retained', async t => {
 const {root,input}=fixture(t);
 const abandoned=await prepareIntent(root,input);
 await cancelIntent(root,abandoned.id,{reason:'Superseded before dispatch.'});
 const after=inspectDispatch(root);
 a.equal(after.intents[0]?.status,'cancelled'); a.equal(after.intents[0]?.reservation,null);
 await cancelIntent(root,abandoned.id,{reason:'Superseded before dispatch.'}); a.deepEqual(inspectDispatch(root),after);
 await a.rejects(cancelIntent(root,abandoned.id,{reason:'A conflicting reason.'}),/conflicting/);
 await a.rejects(interceptIntent(root,abandoned.id,context),/consumed/);
 for(let count=0;count<2;count++) {
  const active=await prepareIntent(root,input),call={...context,toolUseId:`spent-${count}`};
  await interceptIntent(root,active.id,call);
  await a.rejects(cancelIntent(root,active.id,{reason:'Cannot refund a running child.'}),/only unreserved/);
  await correlateIntent(root,active.id,{...call,childId:`child-${count}`});
  await completeIntent(root,active.id,{...call,childId:`child-${count}`,outcome:'completed'});
  await a.rejects(cancelIntent(root,active.id,{reason:'Cannot refund a completed child.'}),/only unreserved/);
 }
 const stopped=await prepareIntent(root,input); a.equal(stopped.decision.action,'stop');
 a.equal(inspectDispatch(root).intents.filter(i=>i.reservation!==null).length,2);
});
test('early terminal receipts are bounded, unrelated stops are pure, duplicates are exact and conflicts stop', async t => {
 const {root,input}=fixture(t),i=await prepareIntent(root,input);
 const terminal={host:'codex',sessionId:'session',childId:'early-child',terminal:true,outcome:'completed',observedModel:'runtime-model',observedEffort:'medium'};
 const before=inspectDispatch(root);
 a.deepEqual(await receiveNativeStop(root,terminal),{recorded:false,intentId:null}); a.deepEqual(inspectDispatch(root),before);
 await interceptIntent(root,i.id,context);
 a.deepEqual(await receiveNativeStop(root,{...terminal,sessionId:'unrelated'}),{recorded:false,intentId:null});
 await receiveNativeStop(root,{...terminal,transcript:'must never persist'});
 const pending=inspectDispatch(root); a.equal(pending.pendingStops?.length,1); a.ok(!JSON.stringify(pending).includes('must never persist'));
 await receiveNativeStop(root,terminal); a.deepEqual(inspectDispatch(root),pending);
 await a.rejects(receiveNativeStop(root,{...terminal,outcome:'failed'}),/conflicting/); a.deepEqual(inspectDispatch(root),pending);
 const correlated=await correlateIntent(root,i.id,{...context,childId:'early-child'});
 a.equal(correlated.status,'completed'); a.equal(correlated.completion?.observedModel,'runtime-model'); a.equal(inspectDispatch(root).pendingStops?.length,0);
 const done=inspectDispatch(root);
 await receiveNativeStop(root,terminal); await correlateIntent(root,i.id,{...context,childId:'early-child'}); a.deepEqual(inspectDispatch(root),done);
 await a.rejects(receiveNativeStop(root,{...terminal,outcome:'failed'}),/conflicting/); a.deepEqual(inspectDispatch(root),done);
});
test('unmatched receipts stop at their bound without erasing the reservation', async t => {
 const {root,input}=fixture(t),i=await prepareIntent(root,input); await interceptIntent(root,i.id,context);
 for(let count=0;count<128;count++) await receiveNativeStop(root,{host:'codex',sessionId:'session',childId:`unmatched-${count}`,terminal:true,outcome:'unknown'});
 const before=inspectDispatch(root);
 await a.rejects(receiveNativeStop(root,{host:'codex',sessionId:'session',childId:'over-bound',terminal:true,outcome:'unknown'}),/bound exceeded/);
 a.deepEqual(inspectDispatch(root),before); a.equal(before.intents[0]?.status,'reserved');
});

test('concurrent lifecycle processes retry only transient lock contention and settle once in either order', async t => {
 const {root,input}=fixture(t),i=await prepareIntent(root,input);await interceptIntent(root,i.id,context);
 const moduleURL=pathToFileURL(fileURLToPath(new URL('../src/dispatch.js',import.meta.url))).href;
 const code=`import {receiveNativeStop,correlateIntent} from ${JSON.stringify(moduleURL)};try{const [root,id,kind,value]=process.argv.slice(1);if(kind==='stop')await receiveNativeStop(root,JSON.parse(value));else await correlateIntent(root,id,JSON.parse(value));}catch(error){process.stderr.write(error.message);process.exitCode=7;}`;
 const stop={host:'codex',sessionId:'session',childId:'parallel-child',terminal:true,outcome:'completed'};
 const run=(kind:string,value:unknown)=>new Promise<{status:number|null;stderr:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',code,root,i.id,kind,JSON.stringify(value)],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',bytes=>stderr+=String(bytes));child.once('error',reject);child.once('exit',status=>resolve({status,stderr}));
 });
 fs.mkdirSync(path.join(root,'.methodical/lock'));
 const calls=[run('stop',stop),run('correlate',{...context,childId:'parallel-child'}),run('stop',stop)];
 await new Promise(resolve=>setTimeout(resolve,200));fs.rmdirSync(path.join(root,'.methodical/lock'));
 for(const result of await Promise.all(calls)) a.equal(result.status,0,result.stderr);
 const settled=inspectDispatch(root);a.equal(settled.intents.length,1);a.equal(settled.intents[0]?.status,'completed');a.equal(settled.intents[0]?.completion?.outcome,'completed');a.equal(settled.pendingStops?.length??0,0);a.equal(settled.intents.filter(i=>i.reservation!==null).length,1);
 await receiveNativeStop(root,stop);await correlateIntent(root,i.id,{...context,childId:'parallel-child'});a.deepEqual(inspectDispatch(root),settled);
});
test('persistent lifecycle lock fails within its bound and never steals or releases the abandoned lock', async t => {
 const {root,input}=fixture(t),i=await prepareIntent(root,input);await interceptIntent(root,i.id,context);
 const before=inspectDispatch(root),lock=path.join(root,'.methodical/lock');fs.mkdirSync(lock);const started=Date.now();
 await a.rejects(receiveNativeStop(root,{host:'codex',sessionId:'session',childId:'blocked-child',terminal:true,outcome:'completed'}),/lock held/);
 a.ok(Date.now()-started<2200);a.equal(fs.existsSync(lock),true);a.deepEqual(inspectDispatch(root),before);fs.rmdirSync(lock);
});

test('a claimed terminal flag cannot settle a launch that has no correlated native child',async t=>{
 const {root,input}=fixture(t),i=await prepareIntent(root,input);await interceptIntent(root,i.id,context);
 const before=inspectDispatch(root);
 await a.rejects(completeIntent(root,i.id,{...context,childId:null,outcome:'unknown',terminal:true}),/terminal completion needs/);
 a.deepEqual(inspectDispatch(root),before);
 await completeIntent(root,i.id,{...context,childId:null,outcome:'unknown'});a.equal(inspectDispatch(root).intents[0]?.status,'dispatch-unknown');
});
