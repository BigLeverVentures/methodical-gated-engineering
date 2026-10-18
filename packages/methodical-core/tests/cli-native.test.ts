// Synthetic native-hook transport. Live host consumption is a separate qualification gate.
import test from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digest, type Host} from '../src/contracts.js';
import {inspectDispatch} from '../src/dispatch.js';
import {fixture} from './records-fixture.js';

const source = process.env.METHODICAL_SOURCE!;
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
function run(args: string[], input?: unknown, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [cli, ...args], {input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', env: {...process.env, ...env}});
}
function success(args: string[], input?: unknown, env?: NodeJS.ProcessEnv): any {
  const result = run(args, input, env); a.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function prepared(root: string, host: Host) {
  const support = success(['support', root, path.join(source, 'method'), 'lenses/typescript-correctness.md']);
  const profilePath = path.join(source, 'profiles', `${host}.json`);
  const p = success(['profile', host, profilePath]);
  const input = {host, profilePath, binding: {unitId: 'native-unit', planPath: 'plans/active.md', planHash: digest(fs.readFileSync(path.join(root, 'plans/active.md'))), scope: 'read-only native integration', approvalPath: '.methodical/approval.json', approvalHash: '0'.repeat(64)},
    operationId: 'implementation', role: 'worker', risk: 'none', stack: 'typescript', task: 'routine', policy: 'guidance',
    ...support, brief: 'Inspect the active plan and return evidence.', available: [...Object.values(p.choices), ...Object.values(p.qualifiedOverrides?.choices ?? {})]};
  const template = success(['approval-template', root], input);
  a.equal(template.approved, false); a.deepEqual(template.allowedOperations, ['implementation', 'north-star', 'code-grounded', 'simplicity', 'rigor', 'typescript-correctness']);
  const approval = JSON.stringify({...template, approved: true});
  fs.writeFileSync(path.join(root, input.binding.approvalPath), approval); input.binding.approvalHash = digest(approval);
  const i = success(['prepare', root], input);
  a.ok(i.brief.includes(fs.readFileSync(path.join(source, 'method/rules/rules.md'), 'utf8')));
  a.ok(i.brief.includes('approved unit'));
  a.ok(i.brief.includes(i.marker));
  if (host === 'codex') a.equal(i.nativeReference, 'methodical_intent_' + i.id.replaceAll('-', ''));
  else a.equal(i.nativeReference, undefined);
  return {intent: i, input, support};
}
function event(root: string, host: Host, marker: string, name = 'PreToolUse', extra: Record<string, unknown> = {}) {
  return {hook_event_name: name, cwd: root, session_id: 'native-session', tool_use_id: 'native-tool', tool_name: host === 'codex' ? 'spawn_agent' : 'Agent',
    tool_input: host === 'codex' ? {message: marker, model: 'deliberate-mismatch', reasoning_effort: 'low', fork_turns: 'all', task_name: 'diagnostic'}
      : {prompt: marker, model: 'sonnet', effort: 'low', description: 'diagnostic', maxTurns: 2}, ...extra};
}
test('CLI imports immutable canonical support and rejects symlink/corrupt support', () => {
  const f = fixture();
  try {
    const first = success(['support', f.root, path.join(source, 'method'), 'lenses/rigor.md']);
    a.deepEqual(success(['support', f.root, path.join(source, 'method'), 'lenses/rigor.md']), first);
    fs.writeFileSync(path.join(f.root, first.methodPath), 'truncated rules');
    a.notEqual(run(['support', f.root, path.join(source, 'method'), 'lenses/rigor.md']).status, 0);
    a.notEqual(run(['support', f.root, path.join(source, 'method'), '../rules/rules.md']).status, 0);
    const outside = path.join(f.root, 'linked-package'); fs.mkdirSync(outside); fs.symlinkSync(path.join(source, 'method/rules'), path.join(outside, 'rules')); fs.symlinkSync(path.join(source, 'method/lenses'), path.join(outside, 'lenses'));
    a.notEqual(run(['support', f.root, outside, 'lenses/rigor.md']).status, 0);
  } finally { f.cleanup(); }
});
test('CLI actual core consumes a native hook once; full brief and routed values are distinct from caller arguments', () => {
  for (const host of ['claude-code', 'codex'] as const) {
    const f = fixture();
    try {
      const {intent} = prepared(f.root, host);
      const pre = event(f.root, host, intent.marker);
      const routed = success(['hook', host, '/unused-package'], pre).hookSpecificOutput;
      a.equal(routed.updatedInput[host === 'codex' ? 'message' : 'prompt'], intent.brief);
      a.equal(routed.updatedInput.model, intent.decision.setting.model);
      a.equal(routed.updatedInput[host === 'codex' ? 'reasoning_effort' : 'effort'], intent.decision.setting.effort);
      a.equal(routed.permissionDecision, host === 'codex' ? 'allow' : undefined);
      const duplicate = run(['hook', host, '/unused-package'], pre); a.notEqual(duplicate.status, 0);
      a.equal(inspectDispatch(f.root).intents.filter(i => i.reservation !== null).length, 1);
      const receipt = inspectDispatch(f.root).intents[0]!.reservation!;
      a.deepEqual(receipt.requested, {model: host === 'codex' ? 'deliberate-mismatch' : 'sonnet', effort: 'low'});
      a.deepEqual(receipt.configured, intent.decision.setting);
      const post = event(f.root, host, intent.marker, 'PostToolUse', {tool_input: routed.updatedInput, tool_response: host === 'codex' ? {agent_id: 'native-child'} : {agentId: 'native-child', status: 'completed'}});
      if (host === 'claude-code') success(['hook', host, '/unused-package'], {hook_event_name: 'SubagentStop', cwd: f.root, session_id: 'native-session', agent_id: 'native-child', stop_reason: 'completed'});
      success(['hook', host, '/unused-package'], post);
      if (host === 'codex') {
        a.equal(inspectDispatch(f.root).intents[0]!.status, 'reserved');
        success(['hook', host, '/unused-package'], {hook_event_name: 'SubagentStop', cwd: f.root, session_id: 'native-session', agent_id: 'native-child', stop_reason: 'completed'});
      }
      const completed = inspectDispatch(f.root); a.equal(completed.intents[0]!.status, 'completed');
      success(['hook', host, '/unused-package'], post);
      success(['hook', host, '/unused-package'], {hook_event_name: 'SubagentStop', cwd: f.root, session_id: 'native-session', agent_id: 'native-child', stop_reason: 'completed'});
      a.deepEqual(inspectDispatch(f.root), completed); // identical delivery retries never consume or reset debt
      const forged = run(['hook', host, '/unused-package'], {...post, session_id: 'other-session'}); a.notEqual(forged.status, 0);
      a.deepEqual(inspectDispatch(f.root), completed);
    } finally { f.cleanup(); }
  }
});
test('CLI unknown native result leaves durable unknown debt, preventing blind restart', () => {
  const f = fixture();
  try {
    const {intent, input} = prepared(f.root, 'codex');
    success(['hook', 'codex', '/unused-package'], event(f.root, 'codex', intent.marker));
    success(['hook', 'codex', '/unused-package'], event(f.root, 'codex', intent.marker, 'PostToolUse', {tool_response: {unknown: true}}));
    a.equal(inspectDispatch(f.root).intents[0]!.status, 'dispatch-unknown');
    a.notEqual(run(['prepare', f.root], input).status, 0);
  } finally { f.cleanup(); }
});
test('CLI derives a read-only checkpoint binding accepted by publication and rejects a stale plan', () => {
  const f = fixture();
  try {
    const {intent} = prepared(f.root, 'codex');
    const statePath = path.join(f.root, '.methodical/routing-state.json');
    const before = fs.readFileSync(statePath), names = fs.readdirSync(path.join(f.root, '.methodical'), {recursive: true});
    const binding = success(['checkpoint-binding', f.root, intent.id]);
    a.deepEqual(fs.readFileSync(statePath), before);
    a.deepEqual(fs.readdirSync(path.join(f.root, '.methodical'), {recursive: true}), names);
    a.equal(binding.profileHash, intent.profileHash);
    a.equal(binding.plan.path, intent.binding.planPath); a.equal(binding.plan.sha256, intent.binding.planHash);
    a.equal(binding.scope, intent.binding.scope);
    a.deepEqual(binding.routing, {path: '.methodical/routing-state.json', sha256: digest(before)});
    const checkpoint = success(['checkpoint', f.root, 'codex'], {binding, planHash: binding.plan.sha256,
      step: 'work-review', nextAction: 'Inspect the prepared native child.', rulings: 'rulings.md', lessons: [], findings: [], reviewDebt: intent.decision.reviewDebt, evidence: []});
    a.deepEqual(checkpoint.work.binding, binding);
    a.equal(success(['status', f.root]).current, true);
    a.notEqual(run(['checkpoint-binding', f.root, '00000000-0000-4000-8000-000000000000']).status, 0);
    fs.appendFileSync(path.join(f.root, 'plans/active.md'), 'changed plan\n');
    const stale = run(['checkpoint-binding', f.root, intent.id]); a.notEqual(stale.status, 0); a.match(stale.stderr, /active plan hash mismatch/);
  } finally { f.cleanup(); }
});
test('installed wrappers deliver complete bounded startup context without project initialization', () => {
  const f = fixture();
  const packageBase = fs.mkdtempSync(path.join(path.dirname(f.root), 'methodical-native-startup-'));
  try {
    for (const host of ['claude-code', 'codex'] as const) {
      const plugin = path.join(packageBase, host), hooks = path.join(plugin, 'hooks');
      fs.mkdirSync(hooks, {recursive: true}); fs.mkdirSync(path.join(plugin, 'rules')); fs.mkdirSync(path.join(plugin, 'runtime/src'), {recursive: true});
      fs.copyFileSync(path.join(source, '../../adapters', host, 'hook.cjs'), path.join(hooks, 'hook.cjs'));
      fs.copyFileSync(path.join(source, '../../adapters', host, 'overlay.md'), path.join(plugin, 'overlay.md'));
      fs.copyFileSync(path.join(source, 'method/rules/rules.md'), path.join(plugin, 'rules/rules.md'));
      if (host === 'claude-code') fs.copyFileSync(path.join(source, '../../plugins/methodical/hooks/rules.sh'), path.join(hooks, 'rules.sh'));
      fs.writeFileSync(path.join(plugin, 'runtime/package.json'), '{"type":"module"}\n');
      fs.writeFileSync(path.join(plugin, 'runtime/src/cli.js'), `import ${JSON.stringify(pathToFileURL(cli).href)};\n`);
      const result = spawnSync(process.execPath, [path.join(hooks, 'hook.cjs')], {input: JSON.stringify({hook_event_name: 'SessionStart', source: 'startup', cwd: f.root, session_id: 'startup-session'}), encoding: 'utf8'});
      a.equal(result.status, 0, result.stderr);
      const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext as string;
      a.ok(context.includes(fs.readFileSync(path.join(source, 'method/rules/rules.md'), 'utf8')));
      a.ok(context.includes(fs.readFileSync(path.join(plugin, 'overlay.md'), 'utf8')));
      a.match(context, /## Routing \(/); a.match(context, /\| decider \|/);
      const config = JSON.parse(fs.readFileSync(path.join(source, '../../adapters', host, 'hooks.json'), 'utf8'));
      const limit = host === 'codex' ? config.hooks.SessionStart[0].hooks[0].additionalContextLimit : 12000;
      a.ok(context.length < limit, `${host}: ${context.length} exceeds finite startup allowance ${limit}`);
      a.equal(fs.existsSync(path.join(f.root, '.methodical')), false);
    }
  } finally { fs.rmSync(packageBase, {recursive: true, force: true}); f.cleanup(); }
});

test('actual CLI retains async stop-before-response receipts across processes for both hosts', () => {
 for(const host of ['claude-code','codex'] as const) {
  const f=fixture();
  try {
   const {intent}=prepared(f.root,host);
   const routed=success(['hook',host,'/unused-package'],event(f.root,host,intent.marker)).hookSpecificOutput.updatedInput;
   const stop={hook_event_name:'SubagentStop',cwd:f.root,session_id:'native-session',agent_id:'async-child',stop_reason:'completed'};
   success(['hook',host,'/unused-package'],stop);
   const pending=inspectDispatch(f.root); a.equal(pending.pendingStops?.length,1); a.equal(pending.intents[0]?.status,'reserved');
   success(['hook',host,'/unused-package'],stop); a.deepEqual(inspectDispatch(f.root),pending);
   a.notEqual(run(['hook',host,'/unused-package'],{...stop,stop_reason:'failed'}).status,0); a.deepEqual(inspectDispatch(f.root),pending);
   const post=event(f.root,host,intent.marker,'PostToolUse',{tool_input:routed,tool_response:host==='codex'?{agent_id:'async-child'}:{agentId:'async-child',status:'async_launched'}});
   success(['hook',host,'/unused-package'],post);
   const done=inspectDispatch(f.root); a.equal(done.pendingStops?.length,0); a.equal(done.intents[0]?.status,'completed'); a.equal(done.intents[0]?.completion?.outcome,'completed');
   success(['hook',host,'/unused-package'],post); success(['hook',host,'/unused-package'],stop); a.deepEqual(inspectDispatch(f.root),done);
  } finally { f.cleanup(); }
 }
});
test('terminal native stop with unknown task outcome retains debt without claiming a running child or a pass', () => {
 const f=fixture();
 try {
  const {intent,input}=prepared(f.root,'codex');
  success(['hook','codex','/unused-package'],event(f.root,'codex',intent.marker));
  success(['hook','codex','/unused-package'],{hook_event_name:'SubagentStop',cwd:f.root,session_id:'native-session',agent_id:'unknown-child'});
  success(['hook','codex','/unused-package'],event(f.root,'codex',intent.marker,'PostToolUse',{tool_response:{agent_id:'unknown-child'}}));
  const done=inspectDispatch(f.root).intents[0]!;
  a.equal(done.status,'completed'); a.equal(done.completion?.outcome,'unknown'); a.equal(done.completion?.terminal,true); a.deepEqual(done.decision.reviewDebt,intent.decision.reviewDebt);
  a.match(run(['prepare',f.root],input).stderr,/requires classified/);
 } finally { f.cleanup(); }
});
test('CLI cancels only unreserved preparation and keeps its terminal history', () => {
 const f=fixture();
 try {
  const {intent}=prepared(f.root,'codex');
  fs.appendFileSync(path.join(f.root,'plans/active.md'),'Revised before dispatch.\n');
  const cancelled=success(['cancel',f.root,intent.id,'Superseded by the revised plan.']);
  a.equal(cancelled.status,'cancelled'); a.equal(cancelled.reservation,null);
  a.equal(success(['dispatch-status',f.root]).intents[0].cancellation.reason,'Superseded by the revised plan.');
  a.notEqual(run(['hook','codex','/unused-package'],event(f.root,'codex',intent.marker)).status,0);
 } finally { f.cleanup(); }
});
test('ordinary compound writes and commit precede finalization; a later marker invalidates freshness', () => {
 const f=fixture(); let destination:string|undefined;
 try {
  const {intent}=prepared(f.root,'codex');
  fs.mkdirSync(path.join(f.root,'docs'));
  fs.writeFileSync(path.join(f.root,'docs/resume.md'),'Resume: review the exact saved candidate; preserve the ruling.\n');
  fs.appendFileSync(path.join(f.root,'plans/active.md'),'');
  f.git('add','docs/resume.md'); f.git('commit','-qm','docs: save compound resume');
  const binding=success(['checkpoint-binding',f.root,intent.id]);
  const work={binding,planHash:binding.plan.sha256,step:'compact',nextAction:'Resume the recorded review.',rulings:'rulings.md',lessons:[],findings:[],reviewDebt:intent.decision.reviewDebt,evidence:[],captures:[{kind:'local',ref:'methodical:resume',source:'docs/resume.md',archive:'evidence/resume.md',required:true}]};
  const receipt=success(['checkpoint-finalize',f.root,'codex'],work);
  a.deepEqual(Object.keys(receipt).sort(),['checkpointHash','current','generation','host','kind','root','schemaVersion','semanticFreshness'].sort());
  a.equal(receipt.kind,'methodical-checkpoint-finalized'); a.equal(receipt.current,true); a.equal(receipt.semanticFreshness,'not-established');
  const pointer=JSON.parse(fs.readFileSync(path.join(f.root,'.methodical/checkpoint-current.json'),'utf8'));
  a.equal(receipt.generation,pointer.generation); a.equal(receipt.checkpointHash,pointer.sha256); a.equal(success(['status',f.root]).current,true);
  const clone=spawnSync('git',['clone','-q','--local',f.root,f.root+'-recovery'],{encoding:'utf8'}); a.equal(clone.status,0,clone.stderr); destination=f.root+'-recovery';
  const archive=path.join(f.root,'.methodical/checkpoints',receipt.generation);
  a.equal(success(['verify',destination,archive,'pre-restore']).pass,true);
  const checkpoint=success(['inspect',archive]);
  for(const capture of checkpoint.capture.records) if(capture.kind==='local') {
   const file=path.join(destination,capture.source); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.copyFileSync(path.join(archive,capture.archive),file);
  }
  const modes=JSON.parse(fs.readFileSync(path.join(archive,'evidence/dispatch-dependency-modes.json'),'utf8'));
  for(const [name,mode] of Object.entries(modes)) fs.chmodSync(path.join(destination,name),mode as number);
  a.equal(success(['verify',destination,archive,'post-restore']).pass,true);
  fs.appendFileSync(path.join(f.root,'docs/resume.md'),'Checkpoint current: true\n');
  a.equal(success(['status',f.root]).current,false);
  a.notEqual(run(['checkpoint-finalize',f.root,'codex'],{...work,captures:[]}).status,0);
 } finally { if(destination) fs.rmSync(destination,{recursive:true,force:true}); f.cleanup(); }
});

test('records-only waived-plan compaction finalizes and recovers selected ignored support without a child', () => {
 const f=fixture();let destination:string|undefined;
 try {
  fs.rmSync(path.join(f.root,'plans'),{recursive:true});
  fs.appendFileSync(path.join(f.root,'.gitignore'),'docs/private/\n');
  fs.mkdirSync(path.join(f.root,'docs/private'),{recursive:true});
  const files={
   'docs/private/waiver.md':'Direct ruling: skip the plan for this documentation-only unit.\n',
   'docs/private/resume.md':'Resume the recorded documentation unit.\n',
   'docs/private/rulings.md':'Preserve the explicit plan waiver verbatim.\n',
   'docs/private/lesson.md':'Write final support before publishing the checkpoint.\n',
  };
  for(const [name,bytes] of Object.entries(files)) fs.writeFileSync(path.join(f.root,name),bytes);
  fs.chmodSync(path.join(f.root,'docs/private/lesson.md'),0o640);
  f.git('add','-A');f.git('commit','-qm','docs: retain private compound records');
  const binding=success(['checkpoint-binding',f.root,'codex','docs/private/waiver.md','documentation with explicit plan waiver']);
  a.equal(binding.routing,null);a.equal(fs.existsSync(path.join(f.root,'.methodical')),false);
  const work={binding,planHash:binding.plan.sha256,step:'compact',nextAction:'Continue the saved documentation unit.',rulings:'docs/private/rulings.md',lessons:['docs/private/lesson.md'],findings:[],reviewDebt:[],evidence:[],captures:[{kind:'local',ref:'methodical:resume',source:'docs/private/resume.md',archive:'evidence/resume.md',required:true}]};
  const receipt=success(['checkpoint-finalize',f.root,'codex'],work);a.equal(receipt.current,true);a.equal(success(['status',f.root]).current,true);
  destination=f.root+'-no-intent-recovery';
  const clone=spawnSync('git',['clone','-q','--local',f.root,destination],{encoding:'utf8'});a.equal(clone.status,0,clone.stderr);
  const archive=path.join(f.root,'.methodical/checkpoints',receipt.generation);a.equal(success(['verify',destination,archive,'pre-restore']).pass,true);
  const saved=success(['inspect',archive]);
  for(const capture of saved.capture.records) if(capture.kind==='local') {
   const file=path.join(destination,capture.source);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(archive,capture.archive),file);
  }
  const modes=JSON.parse(fs.readFileSync(path.join(archive,'evidence/dispatch-dependency-modes.json'),'utf8'));
  for(const [name,mode] of Object.entries(modes)) fs.chmodSync(path.join(destination,name),mode as number);
  a.equal(success(['verify',destination,archive,'post-restore']).pass,true);
  for(const [name,bytes] of Object.entries(files)) a.equal(fs.readFileSync(path.join(destination,name),'utf8'),bytes);
  a.equal(fs.statSync(path.join(destination,'docs/private/lesson.md')).mode&0o777,0o640);
  a.equal(fs.existsSync(path.join(destination,'.methodical/routing-state.json')),false);
  fs.appendFileSync(path.join(f.root,'docs/private/resume.md'),'Saved after snapshot.\n');a.equal(success(['status',f.root]).current,false);
 }finally{if(destination)fs.rmSync(destination,{recursive:true,force:true});f.cleanup();}
});

test('explicit synchronous Claude results refine an early outcome-less stop without resetting debt or attempts', () => {
 for(const status of ['completed','partial','failed'] as const) {
  const f=fixture();
  try {
   const {intent,input}=prepared(f.root,'claude-code');
   const routed=success(['hook','claude-code','/unused-package'],event(f.root,'claude-code',intent.marker)).hookSpecificOutput.updatedInput;
   const stop={hook_event_name:'SubagentStop',cwd:f.root,session_id:'native-session',agent_id:'sync-child'};
   success(['hook','claude-code','/unused-package'],stop);
   const post=event(f.root,'claude-code',intent.marker,'PostToolUse',{tool_input:routed,tool_response:{agentId:'sync-child',status,usage:{model:'backend-observed'},effort:{level:'high'}}});
   success(['hook','claude-code','/unused-package'],post);
   const refined=inspectDispatch(f.root),done=refined.intents[0]!;
   a.equal(done.status,'completed');a.equal(done.completion?.outcome,status);a.equal(done.completion?.terminal,true);
   a.equal(done.completion?.observedModel,'backend-observed');a.equal(done.completion?.observedEffort,'high');
   const original=done.completion?.initialTerminalReceipt as Record<string,unknown>;
   a.equal(original.outcome,'unknown');a.equal(original.source,'native-stop');a.equal(original.observedModel,null);a.equal(done.completion?.at,original.at);
   const receipts=done.completion?.nativeResponseReceipts as Record<string,unknown>[];a.equal(receipts.length,1);a.equal(receipts[0]?.source,'claude-agent-response');
   a.deepEqual(done.decision.reviewDebt,intent.decision.reviewDebt);a.equal(refined.intents.filter(i=>i.reservation!==null).length,1);
   success(['hook','claude-code','/unused-package'],post);success(['hook','claude-code','/unused-package'],stop);a.deepEqual(inspectDispatch(f.root),refined);
   const conflicting={...post,tool_response:{agentId:'sync-child',status:status==='completed'?'failed':'completed'}};
   a.notEqual(run(['hook','claude-code','/unused-package'],conflicting).status,0);a.deepEqual(inspectDispatch(f.root),refined);
   for(const bad of [{host:'codex'},{sessionId:'other-session'},{toolUseId:'other-tool'},{childId:'other-child'}]) {
    const callback={host:'claude-code',sessionId:'native-session',toolUseId:'native-tool',childId:'sync-child',outcome:status,source:'claude-agent-response',...bad};
    a.notEqual(run(['complete',f.root,intent.id],callback).status,0);a.deepEqual(inspectDispatch(f.root),refined);
   }
   if(status==='completed') {
    const next=success(['prepare',f.root],input);a.equal(next.decision.action,'model');
    const call=event(f.root,'claude-code',next.marker,'PreToolUse',{tool_use_id:'second-tool'});
    success(['hook','claude-code','/unused-package'],call);
    success(['hook','claude-code','/unused-package'],{...call,hook_event_name:'PostToolUse',tool_response:{agentId:'second-child',status:'completed'}});
    const exhausted=success(['prepare',f.root],input);a.equal(exhausted.decision.action,'stop');a.equal(inspectDispatch(f.root).intents.filter(i=>i.reservation!==null).length,2);
   } else a.match(run(['prepare',f.root],input).stderr,/requires classified/);
  }finally{f.cleanup();}
 }
});
test('synchronous Claude observations fill only unknown fields and preserve known stop telemetry', () => {
 const f=fixture();
 try {
  const {intent}=prepared(f.root,'claude-code');
  const routed=success(['hook','claude-code','/unused-package'],event(f.root,'claude-code',intent.marker)).hookSpecificOutput.updatedInput;
  const stop={hook_event_name:'SubagentStop',cwd:f.root,session_id:'native-session',agent_id:'telemetry-child',usage:{model:'known-backend'}};
  success(['hook','claude-code','/unused-package'],stop);
  const post=(response:Record<string,unknown>)=>event(f.root,'claude-code',intent.marker,'PostToolUse',{tool_input:routed,tool_response:{agentId:'telemetry-child',status:'completed',...response}});
  a.notEqual(run(['hook','claude-code','/unused-package'],post({usage:{model:'conflicting-backend'}})).status,0);
  const unknown=inspectDispatch(f.root).intents[0]!;a.equal(unknown.completion?.outcome,'unknown');a.equal(unknown.completion?.observedModel,'known-backend');
  success(['hook','claude-code','/unused-package'],post({}));
  success(['hook','claude-code','/unused-package'],post({effort:{level:'medium'}}));
  const done=inspectDispatch(f.root);a.equal(done.intents[0]?.completion?.outcome,'completed');a.equal(done.intents[0]?.completion?.observedModel,'known-backend');a.equal(done.intents[0]?.completion?.observedEffort,'medium');
  a.equal((done.intents[0]?.completion?.nativeResponseReceipts as unknown[]).length,2);
  success(['hook','claude-code','/unused-package'],post({}));success(['hook','claude-code','/unused-package'],stop);a.deepEqual(inspectDispatch(f.root),done);
  a.notEqual(run(['hook','claude-code','/unused-package'],post({effort:{level:'high'}})).status,0);a.deepEqual(inspectDispatch(f.root),done);
 }finally{f.cleanup();}
});

test('CLI task reference uses the observed Codex alias, revalidates bindings and retains unknown path identity', () => {
 const f=fixture();
 try {
  const {intent,input}=prepared(f.root,'codex');
  const call=event(f.root,'codex','opaque native brief','PreToolUse',{tool_name:'collaborationspawn_agent',tool_input:{message:'opaque native brief',task_name:intent.nativeReference,model:'deliberate-mismatch',reasoning_effort:'low',fork_turns:'all'}});
  const malformed={...call,tool_input:{...call.tool_input as any,task_name:intent.nativeReference+'_bad'}};
  a.notEqual(run(['hook','codex','/unused-package'],malformed).status,0);
  a.equal(inspectDispatch(f.root).intents[0]!.reservation,null);
  const plan=path.join(f.root,'plans/active.md'),bytes=fs.readFileSync(plan);
  fs.appendFileSync(plan,'changed candidate\n');
  a.notEqual(run(['hook','codex','/unused-package'],call).status,0);
  a.equal(inspectDispatch(f.root).intents[0]!.reservation,null);fs.writeFileSync(plan,bytes);
  const routed=success(['hook','codex','/unused-package'],call).hookSpecificOutput.updatedInput;
  a.equal(routed.task_name,intent.nativeReference);a.equal(routed.message,intent.brief);
  a.equal(routed.model,intent.decision.setting.model);a.equal(routed.reasoning_effort,intent.decision.setting.effort);a.equal(routed.fork_turns,'none');
  const post={...call,hook_event_name:'PostToolUse',tool_input:routed,tool_response:{task_name:'/root/'+intent.nativeReference}};
  success(['hook','codex','/unused-package'],post);
  const state=inspectDispatch(f.root),done=state.intents[0]!;
  a.equal(done.status,'dispatch-unknown');a.equal(done.completion?.childId,null);a.equal(done.completion?.outcome,'unknown');
  a.deepEqual(done.decision.reviewDebt,intent.decision.reviewDebt);a.equal(state.intents.filter(i=>i.reservation!==null).length,1);
  a.notEqual(run(['prepare',f.root],input).status,0);
 } finally { f.cleanup(); }
});

test('CLI records native identity from exact returned input containing sealed reference syntax', () => {
 const f=fixture();
 try {
  fs.appendFileSync(path.join(f.root,'plans/active.md'),'Plan: use methodical_intent_<32 lowercase hex> as the native task name.\n');
  const {intent}=prepared(f.root,'codex');
  a.ok(intent.brief.includes('methodical_intent_<32 lowercase hex>'));
  const call=event(f.root,'codex','opaque native brief','PreToolUse',{tool_name:'collaborationspawn_agent',tool_input:{message:'opaque native brief',task_name:intent.nativeReference}});
  const routed=success(['hook','codex','/unused-package'],call).hookSpecificOutput.updatedInput;
  a.equal(routed.message,intent.brief);
  success(['hook','codex','/unused-package'],{...call,hook_event_name:'PostToolUse',tool_input:routed,tool_response:{agent_id:'native-reference-child'}});
  const reserved=inspectDispatch(f.root).intents[0]!;
  a.equal(reserved.status,'reserved');a.equal(reserved.reservation?.childId,'native-reference-child');
  success(['hook','codex','/unused-package'],{hook_event_name:'SubagentStop',cwd:f.root,session_id:'native-session',agent_id:'native-reference-child'});
  const done=inspectDispatch(f.root).intents[0]!;
  a.equal(done.completion?.outcome,'unknown');a.deepEqual(done.decision.reviewDebt,intent.decision.reviewDebt);
 } finally { f.cleanup(); }
});
