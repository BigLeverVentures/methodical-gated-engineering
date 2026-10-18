import test from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {nativeHook, intentId, intentMarker, intentNativeReference, type NativeRuntime, type NativeHost} from '../../../adapters/native.js';

const id = '12345678-1234-4123-8123-123456789abc';
const brief = `Complete canonical method, plan and lens.\n${intentMarker(id)}`;
function stub() {
  const calls: {kind: string; value: unknown}[] = [];
  let child: string | null = null, reserved = false;
  const runtime: NativeRuntime = {
    async intercept(_root, intent, value) {
      a.equal(intent, id); a.equal(reserved, false); reserved = true;
      calls.push({kind: 'intercept', value});
      return {id, brief, decision: {action: 'model', setting: {model: 'chosen-model', effort: 'high'}}};
    },
    async correlate(_root, intent, value) {
      a.equal(intent, id); child = (value as {childId: string}).childId; calls.push({kind: 'correlate', value});
    },
    async stop(_root, value) { calls.push({kind: 'stop', value}); },
    async complete(_root, intent, value) { a.equal(intent, id); calls.push({kind: 'complete', value}); },
  };
  return {runtime, calls};
}
function event(host: NativeHost, name = 'PreToolUse', extra: Record<string, unknown> = {}) {
  return {hook_event_name: name, cwd: '/project', session_id: 'session-1', tool_use_id: 'tool-1',
    tool_name: host === 'codex' ? 'spawn_agent' : 'Agent',
    tool_input: host === 'codex' ? {message: intentMarker(id), model: 'wrong-model', reasoning_effort: 'low', fork_turns: 'all', task_name: 'review', sandbox: 'inherit'}
      : {prompt: intentMarker(id), model: 'wrong-model', effort: 'low', description: 'review', maxTurns: 3, mode: 'default'}, ...extra};
}
test('native wrappers rewrite entire bound arguments using shared decision and preserve trust fields', async () => {
  for (const host of ['claude-code', 'codex'] as const) {
    const {runtime, calls} = stub();
    const output = await nativeHook(host, event(host), runtime);
    const specific = output.hookSpecificOutput as Record<string, unknown>;
    const updated = specific.updatedInput as Record<string, unknown>;
    a.equal(updated.model, 'chosen-model');
    if (host === 'codex') {
      a.equal(updated.message, brief); a.equal(updated.reasoning_effort, 'high'); a.equal(updated.fork_turns, 'none');
      a.equal(updated.task_name, 'review'); a.equal(updated.sandbox, 'inherit'); a.equal(specific.permissionDecision, 'allow');
      a.equal(updated.reasoningEffort, undefined);
    } else {
      a.equal(updated.prompt, brief); a.equal(updated.effort, 'high'); a.equal(updated.maxTurns, 3); a.equal(updated.mode, 'default');
      a.equal(specific.permissionDecision, undefined);
    }
    a.deepEqual(calls, [{kind: 'intercept', value: {host, sessionId: 'session-1', toolUseId: 'tool-1', requested: {model: 'wrong-model', effort: 'low'}}}]);
    await a.rejects(nativeHook(host, event(host), runtime)); // no second reservation
  }
});
test('unbound calls and permission requests do not execute core or grant permission', async () => {
  for (const host of ['claude-code', 'codex'] as const) {
    const {runtime, calls} = stub();
    a.deepEqual(await nativeHook(host, event(host, 'PreToolUse', {tool_input: {message: 'ordinary child'}}), runtime), {});
    a.deepEqual(await nativeHook(host, event(host, 'PermissionRequest'), runtime), {});
    a.equal(calls.length, 0);
  }
});
test('malformed marks, unknown native prompt schemas and runtime errors fail closed', async () => {
  const {runtime} = stub();
  a.throws(() => intentId('[methodical-intent:bad]'));
  a.throws(() => intentId('[methodical-intent]'));
  a.throws(() => intentId(`${intentMarker(id)} ${intentMarker(id)}`));
  await a.rejects(nativeHook('codex', event('codex', 'PreToolUse', {tool_input: {prompt: intentMarker(id)}}), runtime), /schema/);
  await a.rejects(nativeHook('codex', event('codex', 'PreToolUse', {tool_input: {message: intentMarker(id), fork_turns: true}}), runtime), /schema/);
  await a.rejects(nativeHook('claude-code', event('claude-code', 'PreToolUse', {tool_use_id: undefined}), runtime), /tool_use_id/);
  await a.rejects(nativeHook('claude-code', event('claude-code'), {...runtime, async intercept() { throw Error('stale candidate'); }}), /stale candidate/);
});
test('Claude synchronous stop before response is forwarded for durable correlation', async () => {
  const {runtime, calls} = stub();
  await nativeHook('claude-code', event('claude-code'), runtime);
  await nativeHook('claude-code', {hook_event_name: 'SubagentStop', cwd: '/project', session_id: 'session-1', agent_id: 'child-1', stop_reason: 'completed'}, runtime);
  a.equal(calls.length, 2); a.equal(calls[1]!.kind, 'stop');
  await nativeHook('claude-code', event('claude-code', 'PostToolUse', {tool_input: {prompt: brief}, tool_response: {agentId: 'child-1', status: 'completed', model: 'requested-only'}}), runtime);
  a.deepEqual(calls.map(call => call.kind), ['intercept', 'stop', 'correlate', 'complete']);
  a.deepEqual(calls[3]!.value, {host: 'claude-code', sessionId: 'session-1', toolUseId: 'tool-1', childId: 'child-1', outcome: 'completed', observedModel: null, observedEffort: null, source: 'claude-agent-response'});
});
test('Codex launch only correlates; stop observes explicit usage and unknown outcomes stay unknown', async () => {
  const {runtime, calls} = stub();
  await nativeHook('codex', event('codex'), runtime);
  await nativeHook('codex', event('codex', 'PostToolUse', {tool_input: {message: brief}, tool_response: {agent_id: 'child-1'}}), runtime);
  a.deepEqual(calls.map(call => call.kind), ['intercept', 'correlate']);
  await nativeHook('codex', {hook_event_name: 'SubagentStop', cwd: '/project', session_id: 'session-1', agent_id: 'child-1', usage: {model: 'backend-model'}, effort: {level: 'high'}}, runtime);
  a.equal(calls[2]!.kind, 'stop');
  a.deepEqual(calls[2]!.value, {host: 'codex', sessionId: 'session-1', childId: 'child-1', terminal: true, outcome: 'unknown', observedModel: 'backend-model', observedEffort: 'high'});
});
test('unsupported native child result never invents child or success', async () => {
  const {runtime, calls} = stub();
  await nativeHook('codex', event('codex'), runtime);
  await nativeHook('codex', event('codex', 'PostToolUse', {tool_response: {id: 'unsupported'}}), runtime);
  a.deepEqual(calls[1]!.value, {host: 'codex', sessionId: 'session-1', toolUseId: 'tool-1', childId: null, outcome: 'unknown'});
});
test('installed JS wrappers pass unrelated calls without runtime and block marked runtime failure', () => {
  const source = path.resolve(process.env.METHODICAL_SOURCE!, '../..');
  const root = fs.mkdtempSync(path.join(tmpdir(), 'methodical-native-wrapper-'));
  try {
    for (const host of ['claude-code', 'codex'] as const) {
      const hooks = path.join(root, host, 'hooks'); fs.mkdirSync(hooks, {recursive: true});
      const hook = path.join(hooks, 'hook.cjs'); fs.copyFileSync(path.join(source, 'adapters', host, 'hook.cjs'), hook);
      const run = (value: unknown) => spawnSync(process.execPath, [hook], {input: JSON.stringify(value), encoding: 'utf8'});
      const ordinary = run(event(host, 'PreToolUse', {tool_input: {message: 'ordinary'}}));
      a.equal(ordinary.status, 0); a.equal(ordinary.stdout, '');
      const failed = run(event(host)); a.equal(failed.status, 2); a.match(failed.stderr, /native hook stopped/);
      const permission = run(event(host, 'PermissionRequest')); a.equal(permission.status, 0); a.equal(permission.stdout, '');
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('exact Codex task reference binds the observed alias without a visible message marker', async () => {
  const {runtime, calls} = stub();
  const reference = intentNativeReference(id);
  a.equal(reference, 'methodical_intent_12345678123441238123123456789abc');
  const input = {message: 'opaque native brief', task_name: reference, model: 'wrong-model', reasoning_effort: 'low', fork_turns: 'all', sandbox: 'inherit'};
  const output = await nativeHook('codex', event('codex', 'PreToolUse', {tool_name: 'collaborationspawn_agent', tool_input: input}), runtime);
  const updated = (output.hookSpecificOutput as any).updatedInput;
  a.equal(updated.task_name, reference); a.equal(updated.message, brief); a.equal(updated.sandbox, 'inherit');
  a.equal(updated.model, 'chosen-model'); a.equal(updated.reasoning_effort, 'high'); a.equal(updated.fork_turns, 'none');
  await nativeHook('codex', event('codex', 'PostToolUse', {tool_name: 'collaborationspawn_agent', tool_input: updated, tool_response: {task_name: '/root/' + reference}}), runtime);
  a.deepEqual(calls.map(call => call.kind), ['intercept', 'complete']);
  a.deepEqual(calls[1]!.value, {host: 'codex', sessionId: 'session-1', toolUseId: 'tool-1', childId: null, outcome: 'unknown'});
});
test('Codex reference and tool conflicts fail before any reservation', async () => {
  const reference = intentNativeReference(id);
  const {runtime, calls} = stub();
  const base = {message: 'opaque native brief', task_name: reference};
  for (const tool_input of [
    {...base, task_name: reference.toUpperCase().replace('METHODICAL_INTENT_', 'methodical_intent_')},
    {...base, task_name: reference + '_suffix'},
    {...base, task_name: reference + reference},
    {...base, task_name: [reference]},
    {...base, message: intentMarker('00000000-0000-4000-8000-000000000000')},
    {...base, message: intentMarker(id), task_name: 7},
    {...base, message: intentMarker(id) + intentMarker(id)},
    {...base, message: undefined},
  ]) await a.rejects(nativeHook('codex', event('codex', 'PreToolUse', {tool_input}), runtime));
  for (const tool_name of ['other_tool', 'prefixcollaborationspawn_agent', 'collaborationspawn_agent_extra'])
    await a.rejects(nativeHook('codex', event('codex', 'PreToolUse', {tool_name, tool_input: base}), runtime), /unsupported native tool/);
  a.equal(calls.length, 0);
  await a.rejects(nativeHook('codex', event('codex', 'PreToolUse', {tool_input: base}), {...runtime, async intercept() { throw Error('stale candidate'); }}), /stale candidate/);
  const valid = await nativeHook('codex', event('codex', 'PreToolUse', {tool_input: {...base, message: intentMarker(id)}}), runtime);
  a.ok(valid.hookSpecificOutput); a.equal(calls.length, 1);
});
test('Codex wrapper blocks task-reference calls without runtime and hook matchers are exact', () => {
  const source = path.resolve(process.env.METHODICAL_SOURCE!, '../..');
  const root = fs.mkdtempSync(path.join(tmpdir(), 'methodical-reference-wrapper-'));
  try {
    const hooks = path.join(root, 'hooks'); fs.mkdirSync(hooks);
    const hook = path.join(hooks, 'hook.cjs'); fs.copyFileSync(path.join(source, 'adapters/codex/hook.cjs'), hook);
    for (const task_name of [intentNativeReference(id), 'methodical_intent_bad']) {
      const result = spawnSync(process.execPath, [hook], {input: JSON.stringify(event('codex', 'PreToolUse', {tool_name: 'collaborationspawn_agent', tool_input: {message: 'opaque native brief', task_name}})), encoding: 'utf8'});
      a.equal(result.status, 2); a.match(result.stderr, /native hook stopped/);
    }
    const ordinary = spawnSync(process.execPath, [hook], {input: JSON.stringify(event('codex', 'PreToolUse', {tool_input: {message: 'Plan discusses methodical_intent_<32 lowercase hex>.', extra: intentNativeReference(id)}})), encoding: 'utf8'});
    a.equal(ordinary.status, 0); a.equal(ordinary.stdout, '');
    const config = JSON.parse(fs.readFileSync(path.join(source, 'adapters/codex/hooks.json'), 'utf8'));
    for (const name of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']) {
      const matcher = new RegExp(config.hooks[name][0].matcher);
      for (const alias of ['Agent', 'spawn_agent', 'collaborationspawn_agent']) a.equal(matcher.test(alias), true);
      for (const alias of ['other_tool', 'prefixspawn_agent', 'spawn_agent_extra']) a.equal(matcher.test(alias), false);
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('Codex exact updatedInput survives reference syntax in the sealed plan and task prose', async () => {
  const reference = intentNativeReference(id);
  const prose = `Approved plan: use methodical_intent_<32 lowercase hex> task names. Task mentions ${reference} as data.\n${brief}`;
  const {runtime, calls} = stub();
  const routedRuntime: NativeRuntime = {...runtime, async intercept(root, intent, context) {
    const result = await runtime.intercept(root, intent, context);
    return {...result, brief: prose};
  }};
  const output = await nativeHook('codex', event('codex', 'PreToolUse', {tool_name: 'collaborationspawn_agent', tool_input: {message: 'opaque native brief', task_name: reference}}), routedRuntime);
  const updated = (output.hookSpecificOutput as any).updatedInput;
  a.equal(updated.message, prose);
  await nativeHook('codex', event('codex', 'PostToolUse', {tool_name: 'collaborationspawn_agent', tool_input: updated, tool_response: {agent_id: 'native-child'}}), routedRuntime);
  a.deepEqual(calls.map(call => call.kind), ['intercept', 'correlate']);
  a.equal((calls[1]!.value as any).childId, 'native-child');
});
test('Codex reference syntax outside the task_name carrier remains ordinary data', async () => {
  const reference = intentNativeReference(id);
  const {runtime, calls} = stub();
  const data = {message: `Plan discusses methodical_intent_<32 lowercase hex> and ${reference}.`, extra: reference};
  a.deepEqual(await nativeHook('codex', event('codex', 'PreToolUse', {tool_input: data}), runtime), {});
  a.equal(calls.length, 0);
  await nativeHook('codex', event('codex', 'PreToolUse', {tool_input: {...data, task_name: reference}}), runtime);
  a.equal(calls.length, 1);
});
