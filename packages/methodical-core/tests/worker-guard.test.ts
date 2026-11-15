import { test, type TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { digest, type Host } from '../src/contracts.js';
import { approvalTemplate, completeIntent, confirmClaudeBackgroundCompletion, correlateIntent, finishProcessIntent, inspectDispatch, interceptIntent, receiveNativeStop,
    prepareIntent, reserveProcessIntent, type Intent } from '../src/dispatch.js';
import { loadProfile } from '../src/profiles.js';
import { checkWorkers, recordWorkerPatchProgress, workerGuardPolicy } from '../src/worker-guard.js';
import { startCodexClaimedWorkers } from '../../../adapters/codex-launch-hook.js';
import { workerGuardStop } from '../../../adapters/worker-guard-hook.js';
import { fixture } from './records-fixture.js';

const operations = ['auth', 'auth-recovery', 'onboarding', 'profile', 'combine'];
const tasks = [
    {id: 'auth', operations: ['auth', 'auth-recovery'], dependsOn: []},
    {id: 'onboarding', operations: ['onboarding'], dependsOn: []},
    {id: 'profile', operations: ['profile'], dependsOn: []},
    {id: 'combine', operations: ['combine'], dependsOn: ['onboarding', 'profile']},
];

async function setup(t: TestContext, host: Host, planTasks = tasks, requests?: number, quietMs = 40) {
    const project = fixture();
    t.after(project.cleanup);
    const {root} = project;
    fs.mkdirSync(path.join(root, '.methodical'));
    const profile = loadProfile(fileURLToPath(new URL(`../profiles/${host}.json`, import.meta.url)));
    if (requests !== undefined)
        profile.limits.requests = requests;
    const config = {unitId: 'unit', parallelism: 2, quietMs, reportMs: 60, claimMs: 10_000, tasks: planTasks};
    const input = {
        operationId: 'auth', profile, role: 'worker', risk: 'lean', stack: 'typescript',
        task: 'routine', policy: 'adaptive', methodPath: 'rulings.md', lensPaths: ['rulings.md'],
        brief: 'Implement the assigned work', available: Object.values(profile.choices), allowedOperations: [...operations, 'simplicity', 'unprepared'], workerGuard: config,
        binding: {unitId: 'unit', planPath: 'plans/active.md', planHash: digest('approved unit\n'),
            scope: 'fixture', approvalPath: '.methodical/approval.json', approvalHash: digest('placeholder')},
    };
    const approval = JSON.stringify({...approvalTemplate(root, input), approved: true});
    fs.writeFileSync(path.join(root, input.binding.approvalPath), approval);
    input.binding.approvalHash = digest(approval);
    const intents = new Map<string, Intent>();
    for (const operationId of [...operations, 'simplicity'])
        intents.set(operationId, await prepareIntent(root, {...input, operationId}));
    const at = Date.now();
    return {...project, at, config, intents, input};
}

async function start(root: string, intent: Intent) {
    if (intent.host === 'codex')
        return reserveProcessIntent(root, intent.id);
    const context = {host: intent.host, sessionId: 'parent', toolUseId: intent.id};
    await interceptIntent(root, intent.id, context);
    return correlateIntent(root, intent.id, {...context, childId: intent.id});
}

async function finish(root: string, intent: Intent, clean = true) {
    const reservation = intent.reservation!;
    if (reservation.transport)
        return finishProcessIntent(root, intent.id, {runId: reservation.transport.runId, childId: intent.id,
            clean, exitCode: clean ? 0 : 1, signal: null, terminal: clean, reason: clean ? null : 'uncertain exit'});
    const {host, sessionId, toolUseId, childId} = reservation;
    return completeIntent(root, intent.id, {host, sessionId, toolUseId, childId,
        outcome: clean ? 'completed' : 'failed', terminal: true});
}

function progress(intent: Intent, at: number, message: string) {
    const reservation = intent.reservation!;
    return {intentId: intent.id, workerId: reservation.transport?.runId ?? reservation.childId,
        sessionId: reservation.sessionId, at, ref: digest(message)};
}

type Check = ReturnType<typeof checkWorkers>;
function output(root: string, check: Check, taskId: string) {
    const {claim} = check.claims.find(item => item.taskId === taskId)!;
    const dir = path.join(root, '.methodical/worker-output');
    fs.mkdirSync(dir, {recursive: true});
    const patch = `diff --git a/${taskId}.txt b/${taskId}.txt
new file mode 100644
--- /dev/null
+++ b/${taskId}.txt
@@ -0,0 +1 @@
+${taskId}
`;
    fs.writeFileSync(path.join(dir, `${claim.intentId}.patch`), patch);
    return {intentId: claim.intentId, base: claim.base, inputs: claim.inputs, sha256: digest(patch)};
}

for (const host of ['claude-code', 'codex'] as const) {
    test(`${host}: refill slots and verify recovery while a worker stays active`, async t => {
        const {root, at, config, intents} = await setup(t, host);
        const launch = checkWorkers(root, {configure: config}, at);
        assert.deepEqual(launch.claims.map(x => x.taskId), ['auth', 'onboarding']);
        await assert.rejects(start(root, intents.get('profile')!), /current guard claim/);
        const auth = await start(root, intents.get('auth')!);
        const onboarding = await start(root, intents.get('onboarding')!);
        checkWorkers(root, {}, at + 1);
        const stalled = checkWorkers(root, {progress: [progress(onboarding, at + 40, 'new onboarding work')]}, at + 41);
        assert.deepEqual(stalled.newRecovery.map(x => x.taskId), ['auth']);
        const acknowledged = checkWorkers(root, {}, at + 42);
        assert.deepEqual(acknowledged.recovery, stalled.recovery);
        assert.deepEqual(acknowledged.newRecovery, []);
        assert.deepEqual(checkWorkers(root, {progress: [progress(auth, at + 40, 'delayed old result')]}, at + 43)
            .recovery, stalled.recovery);
        await finish(root, onboarding);
        const refill = checkWorkers(root, {accepted: [output(root, launch, 'onboarding')]}, at + 44);
        assert.deepEqual(refill.claims.map(x => x.taskId), ['profile']);
        assert.deepEqual(refill.recovery, stalled.recovery);
        assert.equal(checkWorkers(root, {}, at + 44).claims.length, 0);
        const profile = await start(root, intents.get('profile')!);
        await finish(root, profile);
        const next = checkWorkers(root, {accepted: [output(root, refill, 'profile')]}, at + 45);
        assert.deepEqual(next.claims.map(x => x.taskId), ['combine']);
        const inputs = next.claims[0]!.claim.inputs;
        assert.deepEqual(inputs.map(x => x.taskId), ['onboarding', 'profile']);
        const snapshot = fixture();
        t.after(snapshot.cleanup);
        for (const input of inputs)
            execFileSync('git', ['-C', snapshot.root, 'apply', path.join(root, input.path)]);
        assert.equal(fs.readFileSync(path.join(snapshot.root, 'onboarding.txt'), 'utf8'), 'onboarding\n');
        assert.equal(fs.readFileSync(path.join(snapshot.root, 'profile.txt'), 'utf8'), 'profile\n');
        assert.equal(fs.existsSync(path.join(root, 'onboarding.txt')), false);
        assert.equal(fs.existsSync(path.join(root, 'profile.txt')), false);
        assert.equal(next.claims[0]!.claim.base, launch.claims[0]!.claim.base);
        assert.equal(next.status.find(x => x.taskId === 'auth')?.state, 'reserved');
        const resumed = checkWorkers(root, {progress: [progress(auth, at + 46, 'new auth work')]}, at + 46);
        assert.deepEqual(resumed.recovery, []);
        assert.equal(resumed.status.find(x => x.taskId === 'auth')?.intentId, auth.id);
        assert.equal(checkWorkers(root, {}, at + 60).reportDue, true);
        const inputPath = path.join(root, next.claims[0]!.claim.inputs[0]!.path);
        const validPatch = fs.readFileSync(inputPath);
        fs.writeFileSync(inputPath, 'tampered');
        await assert.rejects(start(root, intents.get('combine')!), /patch changed/);
        fs.writeFileSync(inputPath, validPatch);
        const combined = await start(root, intents.get('combine')!);
        await finish(root, combined);
        assert.throws(() => checkWorkers(root, {accepted: [{...output(root, next, 'combine'), inputs: []}]}, at + 61),
            /claimed inputs/);
        assert.equal(checkWorkers(root, {accepted: [output(root, next, 'combine')]}, at + 61)
            .status.find(x => x.taskId === 'combine')?.state, 'accepted');
    });
}

for (const host of ['claude-code', 'codex'] as const) {
    test(`${host}: Stop continues the bound session and preserves available claims`, async t => {
        const {root, at, config, intents} = await setup(t, host, tasks, undefined, 750);
        const coordinator = {host, sessionId: 'owner'};
        const event = {session_id: coordinator.sessionId};
        const initial = checkWorkers(root, {configure: config, coordinator}, at);
        const auth = await start(root, intents.get('auth')!);
        const onboarding = await start(root, intents.get('onboarding')!);
        checkWorkers(root, {});
        await finish(root, onboarding);
        checkWorkers(root, {accepted: [output(root, initial, 'onboarding')]}, Date.now(), false);

        assert.deepEqual(await workerGuardStop(host, {session_id: 'worker'}, root), {});
        assert.deepEqual(await workerGuardStop(host === 'codex' ? 'claude-code' : 'codex', event, root), {});
        assert.throws(() => checkWorkers(root, {coordinator: {...coordinator, sessionId: 'another parent'}}),
            /already has a coordinator/);
        const notice = await workerGuardStop(host, event, root);
        assert.equal(notice.decision, 'block');
        assert.match(notice.reason!, /"auth" reserved/);
        assert.equal(checkWorkers(root, {}, Date.now(), false).claims[0]?.taskId, 'profile');
        await assert.rejects(start(root, intents.get('profile')!), /current guard claim/);
        assert.equal(checkWorkers(root, {}).claims[0]?.taskId, 'profile');

        await new Promise<void>(resolve => setTimeout(resolve, config.quietMs + 10));
        const stalled = await workerGuardStop(host, event, root);
        assert.match(stalled.reason!, /"auth" reserved \(check-worker\)/);
        const continuing = {...event, stop_hook_active: true};
        for (let i = 0; i < 3; i++)
            assert.equal((await workerGuardStop(host, continuing, root)).decision, 'block');
        assert.deepEqual(await workerGuardStop(host, continuing, root), {});
        assert.equal(checkWorkers(root, {}).recovery.find(item => item.taskId === 'auth')?.action, 'check-worker');

        await new Promise<void>(resolve => setTimeout(resolve, 10));
        output(root, initial, 'auth');
        const resumed = recordWorkerPatchProgress(root, auth.id);
        const result = resumed.status.find(item => item.taskId === 'auth');
        assert.equal(result?.recovery, null);
        assert.equal(result?.intentId, auth.id);
        assert.equal(result?.state, 'reserved');
    });
}

test('healthy Stop polls survive an overdue report and the actionable reminder limit', async t => {
    const {root, config, intents} = await setup(t, 'codex', tasks.slice(0, 1), undefined, 36_000);
    let now = Date.now();
    const timing = {now: () => now, wait: async (ms: number) => { now += ms; }};
    const event = {session_id: 'parent', stop_hook_active: true};
    checkWorkers(root, {configure: config, coordinator: {host: 'codex', sessionId: 'parent'}}, now);
    await start(root, intents.get('auth')!);
    checkWorkers(root, {}, now);
    for (let poll = 0; poll < 8; poll++) {
        const notice = await workerGuardStop('codex', event, root, timing);
        assert.equal(notice.decision, 'block');
        assert.match(notice.reason!, /workers running before their next due check/);
    }
    assert.match((await workerGuardStop('codex', event, root, timing)).reason!, /"auth" reserved \(check-worker\)/);
});

test('touching old worker output cannot clear a stall, and completed work no longer owns Stop', async t => {
    const {root, config, intents} = await setup(t, 'codex', tasks.slice(0, 1), undefined, 60);
    const event = {session_id: 'parent'};
    const initial = checkWorkers(root, {configure: config, coordinator: {host: 'codex', sessionId: 'parent'}});
    const auth = await start(root, intents.get('auth')!);
    const staged = output(root, initial, 'auth');
    checkWorkers(root, {});
    const stopped = await workerGuardStop('codex', event, root);
    assert.match(stopped.reason!, /"auth" reserved \(check-worker\)/);
    const patch = path.join(root, '.methodical', 'worker-output', auth.id + '.patch');
    const newTime = new Date();
    fs.utimesSync(patch, newTime, newTime);
    assert.throws(() => recordWorkerPatchProgress(root, auth.id), /patch has not changed/);
    await finish(root, auth);
    checkWorkers(root, {accepted: [staged]});
    fs.appendFileSync(path.join(root, 'app.txt'), 'integrated\n');
    assert.deepEqual(await workerGuardStop('codex', event, root), {});
});

test('Stop reports an approved task whose dispatch was never prepared', async t => {
    const planTasks = [{id: 'unavailable', operations: ['unprepared'], dependsOn: []}, tasks[0]!];
    const {root, config} = await setup(t, 'codex', planTasks);
    checkWorkers(root, {configure: config, coordinator: {host: 'codex', sessionId: 'parent'}});
    const result = await workerGuardStop('codex', {session_id: 'parent'}, root);
    assert.equal(result.decision, 'block');
    assert.match(result.reason!, /"unavailable" waiting \(no eligible prepared dispatch\)/);
});

test('a background patch needs a matching host completion after its unknown stop', async t => {
    const {root, config, intents} = await setup(t, 'claude-code', tasks.slice(0, 1));
    const initial = checkWorkers(root, {configure: config});
    const auth = intents.get('auth')!;
    const context = {host: 'claude-code', sessionId: 'parent', toolUseId: 'tool', childId: 'agent'};
    await interceptIntent(root, auth.id, context);
    const stop = {...context, outcome: 'unknown', terminal: true};
    await receiveNativeStop(root, stop); // Delivery may precede the Agent tool response.
    const capturedAt = inspectDispatch(root).pendingStops![0]!.at;
    const noticeAt = new Date().toISOString();
    await new Promise(resolve => setTimeout(resolve, 20));
    await correlateIntent(root, auth.id, {...context, background: true});
    const staged = output(root, initial, 'auth');
    assert.throws(() => checkWorkers(root, {accepted: [staged]}), /correlated successful completion/);
    const state = () => inspectDispatch(root).intents.find(i => i.id === auth.id)!;
    assert.equal(state().completion?.at, capturedAt);
    const notice = {...context, runId: 'run', at: noticeAt};
    await confirmClaudeBackgroundCompletion(root, [
        {...notice, sessionId: 'other'}, {...notice, childId: 'other'}, {...notice, toolUseId: 'other'},
        {...notice, at: new Date(0).toISOString()},
    ]);
    assert.equal(state().completion?.outcome, 'unknown');
    await confirmClaudeBackgroundCompletion(root, [notice]);
    const success = state().completion!;
    assert.equal(success.outcome, 'completed');
    assert.equal((success.initialTerminalReceipt as Record<string, unknown>).outcome, 'unknown');
    assert.equal((success.backgroundCompletion as Record<string, unknown>).source, 'claude-task-notification');
    await receiveNativeStop(root, stop);
    await confirmClaudeBackgroundCompletion(root, [notice]);
    assert.deepEqual(state().completion, success);
    assert.equal(checkWorkers(root, {accepted: [staged]}).status[0]?.state, 'accepted');
});

test('scoped work requires ordered overlaps and rejects patches outside the worker assignment', async t => {
    const planTasks = [
        {...tasks[0]!, writePaths: ['auth.txt']},
        {...tasks[1]!, writePaths: ['onboarding.txt']},
    ];
    const {root, config, intents} = await setup(t, 'codex', planTasks);
    const overlapping = {...config, tasks: [planTasks[0], {...planTasks[1], writePaths: ['AUTH.txt']}]};
    assert.throws(() => workerGuardPolicy(overlapping), /shared write paths require a dependency/);
    const ordered = {...overlapping, tasks: [overlapping.tasks[0], {...overlapping.tasks[1], dependsOn: ['auth']}]};
    assert.equal(workerGuardPolicy(ordered).tasks.length, 2);
    const initial = checkWorkers(root, {configure: config});
    assert.equal(initial.claims.length, 2);
    const auth = await start(root, intents.get('auth')!);
    await finish(root, auth);
    const scoped = output(root, initial, 'auth');
    const patchPath = path.join(root, '.methodical', 'worker-output', auth.id + '.patch');
    const ownPatch = fs.readFileSync(patchPath, 'utf8');
    const unscopedPatch = 'diff --git a/app.txt b/auth.txt\nsimilarity index 100%\nrename from app.txt\nrename to auth.txt\n';
    fs.writeFileSync(patchPath, unscopedPatch);
    assert.throws(() => checkWorkers(root, {accepted: [{...scoped, sha256: digest(unscopedPatch)}]}),
        /unapproved path/);
    fs.writeFileSync(patchPath, ownPatch);
    assert.equal(checkWorkers(root, {accepted: [scoped]}).status[0]?.state, 'accepted');
});

test('the guard offers only the approved routine or demanding allocation', async t => {
    const planTasks = [{...tasks[0]!, allocation: 'demanding' as const},
        {...tasks[1]!, allocation: 'routine' as const}];
    const {root, config} = await setup(t, 'claude-code', planTasks);
    const claims = checkWorkers(root, {configure: config}).claims;
    assert.deepEqual(claims.map(item => item.taskId), ['onboarding']);
});

test('the owning Codex hook launches only issued claims together, once per claim', async t => {
    const {root, config, intents} = await setup(t, 'codex', tasks, undefined, 30_000);
    const owner = {host: 'codex', sessionId: 'lead', launch: 'codex-hook'};
    const result = checkWorkers(root, {configure: config, coordinator: owner});
    const claim = result.claims[0]!.claim;
    const worker = path.join(root, '.methodical', 'native-worker');
    const launches = path.join(root, '.methodical', 'launch-count');
    const body = `#!${process.execPath}
const fs = require('node:fs');
const launches = ${JSON.stringify(launches)};
process.stdin.resume();
process.stdin.on('end', () => {
  fs.appendFileSync(launches, '1');
  const timer = setInterval(() => {
    if (fs.readFileSync(launches, 'utf8').length !== 2) return;
    clearInterval(timer);
    const events = [
      {type: 'thread.started', thread_id: require('node:crypto').randomUUID()},
      {type: 'turn.started'},
      {type: 'turn.completed', usage: {input_tokens: 1, cached_input_tokens: 0, output_tokens: 1}},
    ];
    for (const event of events) console.log(JSON.stringify(event));
  }, 20);
  setTimeout(() => process.exit(3), 4000).unref();
});
`;
    fs.writeFileSync(worker, body, {mode: 0o700});
    const earlier = process.env.METHODICAL_CODEX_EXECUTABLE;
    process.env.METHODICAL_CODEX_EXECUTABLE = worker;
    t.after(() => {
        if (earlier === undefined) delete process.env.METHODICAL_CODEX_EXECUTABLE;
        else process.env.METHODICAL_CODEX_EXECUTABLE = earlier;
    });
    await assert.rejects(
        reserveProcessIntent(root, claim.intentId, {sessionId: owner.sessionId, expiresAt: claim.expiresAt + 1}),
        /current coordinator claim/,
    );
    assert.deepEqual((await startCodexClaimedWorkers(root, {session_id: 'unrelated'})).started, []);
    assert.deepEqual((await startCodexClaimedWorkers(root, {session_id: owner.sessionId, permission_mode: 'plan'})).started, []);
    assert.equal(fs.existsSync(launches), false);
    const event = {session_id: owner.sessionId};
    const launched = await Promise.all([startCodexClaimedWorkers(root, event), startCodexClaimedWorkers(root, event)]);
    assert.deepEqual(launched.flatMap(result => result.started).sort(), result.claims.map(item => item.claim.intentId).sort());
    const end = Date.now() + 7500;
    const status = () => inspectDispatch(root).intents;
    while (Date.now() < end && status().filter(item => item.status === 'completed').length !== 2)
        await new Promise(resolve => setTimeout(resolve, 30));
    const completed = status().filter(item => item.status === 'completed');
    assert.equal(completed.length, 2);
    assert.equal(fs.readFileSync(launches, 'utf8'), '11');
    assert.equal(status().find(item => item.id === intents.get('profile')!.id)?.status, 'prepared');
    for (const item of completed) {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, '.methodical', 'evidence', 'cli', item.id, 'manifest.json'), 'utf8'));
        assert.equal(manifest.configured.sandbox, 'workspace-write');
        assert.equal(manifest.configured.approvals, 'never');
    }
});

test('a pre-reservation launcher failure stays visible without starting the same claim again', async t => {
    const {root, config} = await setup(t, 'codex', tasks.slice(0, 1));
    const owner = {host: 'codex', sessionId: 'lead', launch: 'codex-hook'};
    const result = checkWorkers(root, {configure: config, coordinator: owner});
    const {intentId, expiresAt} = result.claims[0]!.claim;
    const relative = `.methodical/codex-launch/${intentId}-${expiresAt}.log`;
    fs.mkdirSync(path.join(root, '.methodical', 'codex-launch'));
    fs.writeFileSync(path.join(root, relative), JSON.stringify({intentId, status: 'launcher-error', reason: 'fixture'}));
    const outcome = await startCodexClaimedWorkers(root, {session_id: owner.sessionId});
    assert.deepEqual(outcome, {started: [], failedLogs: [relative]});
    assert.equal(inspectDispatch(root).intents.find(intent => intent.id === intentId)?.status, 'prepared');
});

test('a replacement needs verified progress and uses a distinct, preapproved operation', async t => {
    const {root, at, config, intents} = await setup(t, 'claude-code');
    checkWorkers(root, {configure: config}, at);
    const auth = await start(root, intents.get('auth')!);
    checkWorkers(root, {}, at + 1);
    checkWorkers(root, {}, at + 41);
    await finish(root, auth, false);
    const reassignment = checkWorkers(root, {}, at + 42);
    assert.deepEqual(reassignment.claims.map(x => x.claim.intentId), [intents.get('auth-recovery')!.id]);
    assert.equal(reassignment.recovery[0]!.action, 'replace');
    const replacement = await start(root, intents.get('auth-recovery')!);
    assert.equal(checkWorkers(root, {}, at + 43).recovery[0]!.intentId, auth.id);
    assert.throws(() => checkWorkers(root, {progress: [progress(auth, at + 44, 'late worker')]}, at + 44),
        /current worker claim/);
    assert.deepEqual(checkWorkers(root, {progress: [progress(replacement, at + 45, 'replacement evidence')]}, at + 45).recovery, []);
});

test('an uncertain managed process stays assigned while unrelated work fills the remaining slot', async t => {
    const {root, at, config, intents} = await setup(t, 'codex');
    const initial = checkWorkers(root, {configure: config}, at);
    const auth = await start(root, intents.get('auth')!);
    const onboarding = await start(root, intents.get('onboarding')!);
    await finish(root, auth, false);
    await finish(root, onboarding);
    const next = checkWorkers(root, {accepted: [output(root, initial, 'onboarding')]}, at + 1);
    assert.deepEqual(next.recovery.map(x => [x.taskId, x.action]), [['auth', 'reconcile']]);
    assert.deepEqual(next.claims.map(x => x.taskId), ['profile']);
    await assert.rejects(start(root, intents.get('auth-recovery')!), /current guard claim/);
});

test('concurrent CLI checks claim each slot once and preserve the record across processes', async t => {
    const {root, config} = await setup(t, 'claude-code');
    const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
    const input = path.join(root, '.methodical', 'guard-input.json');
    fs.writeFileSync(input, JSON.stringify({configure: config}));
    const run = () => promisify(execFile)(process.execPath, [cli, 'worker-guard', root, input]);
    const results = await Promise.allSettled([run(), run(), run()]);
    const records = results.flatMap(result => result.status === 'fulfilled' ? [JSON.parse(result.value.stdout) as Check] : []);
    assert.deepEqual(records.flatMap(record => record.claims.map(x => x.taskId)).sort(), ['auth', 'onboarding']);
    assert.deepEqual(checkWorkers(root, {}).claims, []);
});

test('expired unlaunched claims cannot reserve and can be reissued for the same intent', async t => {
    const {root, config, intents} = await setup(t, 'claude-code');
    const past = Date.now() - 20_000;
    const initial = checkWorkers(root, {configure: config}, past);
    await assert.rejects(start(root, intents.get('auth')!), /current guard claim/);
    const next = checkWorkers(root, {});
    assert.deepEqual(next.claims.map(x => x.claim.intentId), initial.claims.map(x => x.claim.intentId));
    assert.equal((await start(root, intents.get('auth')!)).status, 'reserved');
});

test('the approved graph gates implementation but permits the simplicity seat', async t => {
    const {root, at, config, intents} = await setup(t, 'claude-code');
    await assert.rejects(start(root, intents.get('auth')!), /current guard claim/);
    const split = {...config, tasks: [
        {id: 'auth-original', operations: ['auth'], dependsOn: []},
        {id: 'auth-copy', operations: ['auth-recovery'], dependsOn: []},
    ]};
    assert.throws(() => checkWorkers(root, {configure: split}, at), /differs from approved/);
    checkWorkers(root, {configure: config}, at);
    assert.equal((await start(root, intents.get('simplicity')!)).status, 'reserved');
});

test('older progress cannot be replayed after a later observation and another stall', async t => {
    const {root, at, config, intents} = await setup(t, 'claude-code');
    checkWorkers(root, {configure: config}, at);
    const auth = await start(root, intents.get('auth')!);
    checkWorkers(root, {}, at + 1);
    const first = progress(auth, at + 2, 'first');
    checkWorkers(root, {progress: [first, progress(auth, at + 3, 'second')]}, at + 3);
    const stalled = checkWorkers(root, {}, at + 43);
    assert.equal(stalled.recovery[0]!.action, 'check-worker');
    assert.deepEqual(checkWorkers(root, {progress: [{...first, at: at + 44}]}, at + 44).recovery, stalled.recovery);
});

test('a dependent snapshot includes all transitive patch inputs in application order', async t => {
    const {root, at, config, intents} = await setup(t, 'codex', [
        {id: 'onboarding', operations: ['onboarding'], dependsOn: []},
        {id: 'profile', operations: ['profile'], dependsOn: ['onboarding']},
        {id: 'combine', operations: ['combine'], dependsOn: ['profile']},
    ]);
    const first = checkWorkers(root, {configure: config}, at);
    await finish(root, await start(root, intents.get('onboarding')!));
    const second = checkWorkers(root, {accepted: [output(root, first, 'onboarding')]}, at + 1);
    await finish(root, await start(root, intents.get('profile')!));
    const profile = output(root, second, 'profile');
    const patch = 'diff --git a/onboarding.txt b/onboarding.txt\n--- a/onboarding.txt\n+++ b/onboarding.txt\n@@ -1 +1 @@\n-onboarding\n+profile\n';
    fs.writeFileSync(path.join(root, '.methodical/worker-output', `${profile.intentId}.patch`), patch);
    const third = checkWorkers(root, {accepted: [{...profile, sha256: digest(patch)}]}, at + 2);
    const snapshot = fixture();
    t.after(snapshot.cleanup);
    const inputs = third.claims[0]!.claim.inputs;
    assert.deepEqual(inputs.map(input => input.taskId), ['onboarding', 'profile']);
    for (const input of inputs)
        execFileSync('git', ['-C', snapshot.root, 'apply', path.join(root, input.path)]);
    assert.equal(fs.readFileSync(path.join(snapshot.root, 'onboarding.txt'), 'utf8'), 'profile\n');
});

test('exhausted recovery and unavailable dispatch produce different blockers', async t => {
    const {root, at, config, intents, input} = await setup(t, 'claude-code', [
        {id: 'auth', operations: ['auth'], dependsOn: []},
        {id: 'missing', operations: ['unprepared'], dependsOn: []},
    ]);
    // The task can be approved before its intent is prepared.
    assert.ok(input.allowedOperations.includes('unprepared'));
    checkWorkers(root, {configure: config}, at);
    await finish(root, await start(root, intents.get('auth')!), false);
    const blocked = checkWorkers(root, {}, at + 1);
    assert.deepEqual(blocked.status.map(x => [x.taskId, x.blocker]), [
        ['auth', 'approved attempts exhausted'], ['missing', 'no eligible prepared dispatch'],
    ]);
    assert.equal(blocked.recovery[0]!.action, 'blocked');
    assert.deepEqual(checkWorkers(root, {}, at + 2).newRecovery, []);
});

test('settling one guarded unit does not make its unused intents available later', async t => {
    const oneTask = [{id: 'auth', operations: ['auth', 'auth-recovery'], dependsOn: []}];
    const {root, at, config, intents, input} = await setup(t, 'claude-code', oneTask);
    const first = checkWorkers(root, {configure: config}, at);
    await finish(root, await start(root, intents.get('auth')!));
    const settled = checkWorkers(root, {accepted: [output(root, first, 'auth')]}, at + 1);
    assert.equal(settled.nextCheckAt, null);
    const nextConfig = {...config, unitId: 'second-unit'};
    const next = {...input, workerGuard: nextConfig, binding: {
        ...input.binding, unitId: nextConfig.unitId, approvalPath: '.methodical/next-approval.json',
    }};
    const approval = JSON.stringify({...approvalTemplate(root, next), approved: true});
    fs.writeFileSync(path.join(root, next.binding.approvalPath), approval);
    next.binding.approvalHash = digest(approval);
    const nextIntent = await prepareIntent(root, next);
    const second = checkWorkers(root, {configure: nextConfig}, at + 2);
    assert.equal(second.claims[0]!.claim.intentId, nextIntent.id);
    await assert.rejects(start(root, intents.get('auth-recovery')!), /current guard claim/);
    assert.throws(() => checkWorkers(root, {configure: config}, at + 3), /unresolved|settled/);
});

test('changing the role cannot bypass the implementation guard', async t => {
    const {root, at, config, intents, input} = await setup(t, 'claude-code');
    checkWorkers(root, {configure: config}, at);
    await start(root, intents.get('auth')!);
    const bypass = await prepareIntent(root, {...input, operationId: 'auth-recovery', role: 'decider'});
    await assert.rejects(start(root, bypass), /requires the worker role/);
});

test('ready claims respect the request budget even when more intents were preprepared', async t => {
    const {root, at, config, intents} = await setup(t, 'codex', tasks, 1);
    const initial = checkWorkers(root, {configure: config}, at);
    assert.deepEqual(initial.claims.map(x => x.taskId), ['auth']);
    assert.equal(initial.status.find(x => x.taskId === 'onboarding')?.blocker, 'unit request budget unavailable');
    await finish(root, await start(root, intents.get('auth')!));
    const after = checkWorkers(root, {accepted: [output(root, initial, 'auth')]}, at + 1);
    assert.deepEqual(after.claims, []);
    assert.equal(after.status.find(x => x.taskId === 'profile')?.blocker, 'unit request budget unavailable');
});

test('a same-unit review spending the final request releases an unlaunched worker slot', async t => {
    const {root, at, config, intents} = await setup(t, 'claude-code', tasks, 1);
    const before = checkWorkers(root, {configure: config}, at);
    assert.equal(before.occupied, 1);
    await start(root, intents.get('simplicity')!);
    const after = checkWorkers(root, {}, at + 1);
    assert.equal(after.occupied, 0);
    assert.equal(after.status.find(x => x.taskId === 'auth')?.blocker, 'unit request budget unavailable');
    await assert.rejects(start(root, intents.get('auth')!), /current guard claim/);
});
