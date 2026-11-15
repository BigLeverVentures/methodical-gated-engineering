#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, digest, host, integer, object, text } from './contracts.js';
import { loadProfile, resolveProfile, choiceSetting, coordinatorSetting } from './profiles.js';
import { prepareIntent, cancelIntent, approvalTemplate, policyBindingHash, interceptIntent, correlateIntent, receiveNativeStop, completeIntent, inspectDispatch, retryDispatchLock } from './dispatch.js';
import { publish, readCheckpoint, inspectBundle, verifyRecovery, recordRelevant, withLock } from './checkpoint.js';
import { assertProject, safeFile, identityAlgorithm, repositoryIdentity, resolvePlan, validateBinding } from './project.js';
import { intentMarker, intentNativeReference, nativeHook } from '../../../adapters/native.js';
import { dispatchCodexBatch, dispatchCodexProcess } from '../../../adapters/codex-process.js';
import { checkWorkers, guardCoordinator, recordWorkerPatchProgress } from './worker-guard.js';
import { reconcileClaudeBackground } from '../../../adapters/claude-background.js';
import { startCodexClaimedWorkers } from '../../../adapters/codex-launch-hook.js';
import { codexContextStatus, recordCodexContext } from '../../../adapters/codex-context.js';
import { workerGuardStop } from '../../../adapters/worker-guard-hook.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const json = (value) => { process.stdout.write(JSON.stringify(value) + '\n'); };
function readJson(file) {
    const bytes = fs.readFileSync(file === undefined ? 0 : file);
    assert(bytes.length <= 1024 * 1024, 'input exceeds one MiB');
    return JSON.parse(bytes.toString('utf8'));
}
function legacyOptions(platform) {
    const models = {}, invalid = new Set();
    if (platform === 'claude-code')
        for (const role of ['decider', 'worker', 'census', 'backstop']) {
            const value = process.env[`CLAUDE_PLUGIN_OPTION_${role.toUpperCase()}`];
            if (value) {
                if (['fable', 'opus', 'sonnet', 'haiku'].includes(value))
                    models[role] = value;
                else
                    invalid.add(role);
            }
        }
    return { models, invalid };
}
function resolved(platform, file) {
    const p = loadProfile(file ?? path.resolve(here, '../profiles', `${platform}.json`));
    assert(p.host === platform, 'profile host mismatch');
    return resolveProfile(p, { legacyRoleModels: { ...p.legacyRoleModels, ...legacyOptions(platform).models } });
}
function routingTable(platform, file) {
    const p = resolved(platform, file), { invalid } = legacyOptions(platform);
    const lead = coordinatorSetting(platform);
    const seats = ['decider', 'worker', 'census', 'backstop'].map(role => {
        const choice = choiceSetting(p, role, role);
        return `| ${role} | ${choice.model}${invalid.has(role) ? ' (invalid value ignored)' : ''} | ${choice.effort} |`;
    });
    return [`| coordinator | ${lead.model} | ${lead.effort} |`, ...seats].join('\n');
}
function preparation(value) {
    const input = object(value);
    const raw = input.profile ?? (input.profilePath === undefined
        ? resolved(host(input.host)) : loadProfile(text(input.profilePath)));
    const p = object(raw), platform = host(p.host);
    input.profile = resolveProfile(p, { legacyRoleModels: { ...object(p.legacyRoleModels ?? {}), ...legacyOptions(platform).models } });
    return input;
}
function boundedSupport(packageRoot, relative, limit = 1024 * 1024) {
    const full = safeFile(packageRoot, relative);
    const fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const info = fs.fstatSync(fd);
        assert(info.isFile() && info.size <= limit, 'support must be a bounded regular file');
        const bytes = fs.readFileSync(fd);
        assert(bytes.length === info.size, 'support changed while reading');
        return bytes;
    }
    finally {
        fs.closeSync(fd);
    }
}
function support(root, packageRoot, lenses) {
    assertProject(root);
    assert(lenses.length > 0 && lenses.length <= 16 && new Set(lenses).size === lenses.length, 'select one to sixteen distinct builtin lenses');
    assert(lenses.every(name => /^lenses\/[a-z][a-z0-9-]*\.md$/.test(name)), 'support accepts builtin lens paths only');
    const names = ['rules/rules.md', ...lenses].sort();
    const content = names.map(name => ({ name, bytes: boundedSupport(packageRoot, name) }));
    assert(content.reduce((total, entry) => total + entry.bytes.length, 0) <= 2 * 1024 * 1024, 'support total size exceeded');
    const sourceHash = digest(content.map(entry => `${entry.name}\0${digest(entry.bytes)}`).join('\n'));
    const base = `.methodical/evidence/methodical-support/${sourceHash}`;
    withLock(root, () => {
        for (const entry of content) {
            const relative = `${base}/${entry.name}`;
            fs.mkdirSync(safeFile(root, path.posix.dirname(relative), true), { recursive: true, mode: 0o700 });
            const full = safeFile(root, relative, true);
            if (fs.existsSync(full))
                assert(fs.readFileSync(full).equals(entry.bytes), 'immutable support content differs');
            else
                fs.writeFileSync(full, entry.bytes, { flag: 'wx', mode: 0o600 });
        }
    });
    return { sourceHash, methodPath: `${base}/rules/rules.md`, lensPaths: lenses.map(name => `${base}/${name}`) };
}
function checkpointBinding(root, intentId) {
    const actual = assertProject(root);
    const routingPath = '.methodical/routing-state.json';
    const before = boundedSupport(actual, routingPath);
    const intent = inspectDispatch(actual).intents.find(item => item.id === intentId);
    assert(intent, 'unknown checkpoint intent');
    resolvePlan(actual, intent.binding.planPath, intent.binding.planHash);
    const identity = repositoryIdentity(actual);
    assert(identity === intent.repository, 'checkpoint intent repository lineage changed');
    assert(before.equals(boundedSupport(actual, routingPath)), 'routing state changed while deriving checkpoint binding');
    return validateBinding(actual, {
        schemaVersion: 1, identityAlgorithm, repositoryIdentity: identity,
        plan: { path: intent.binding.planPath, sha256: intent.binding.planHash }, scope: intent.binding.scope,
        profileHash: intent.profileHash, policyHash: policyBindingHash(intent.input),
        routing: { path: routingPath, sha256: digest(before) },
    });
}
/** Records-only provenance does not authorize dispatch or replace any intent's policy binding. */
function recordsBinding(root, platform, reference, scope) {
    const actual = assertProject(root), routingPath = '.methodical/routing-state.json';
    const exists = fs.existsSync(safeFile(actual, routingPath, true));
    const before = exists ? boundedSupport(actual, routingPath) : null;
    if (exists)
        inspectDispatch(actual);
    const binding = {
        schemaVersion: 1, identityAlgorithm, repositoryIdentity: repositoryIdentity(actual),
        plan: { path: reference, sha256: digest(boundedSupport(actual, reference)) }, scope,
        profileHash: digest(JSON.stringify(resolved(platform))),
        policyHash: digest(JSON.stringify({ kind: 'methodical-records-only', host: platform, scope })),
        routing: before ? { path: routingPath, sha256: digest(before) } : null,
    };
    if (before)
        assert(before.equals(boundedSupport(actual, routingPath)), 'routing state changed while deriving records-only binding');
    return validateBinding(actual, binding);
}
function finalizeCheckpoint(root, platform, work) {
    const actual = assertProject(root), input = object(work);
    assert(Array.isArray(input.captures), 'checkpoint finalization requires explicit resume evidence');
    const resume = input.captures.filter(raw => object(raw).ref === 'methodical:resume');
    assert(resume.length === 1, 'checkpoint finalization requires one methodical:resume capture');
    const capture = object(resume[0]);
    assert(capture.kind === 'local' && capture.required === true && /(?:^|\/)resume\.md$/.test(text(capture.source)) && capture.archive === 'evidence/resume.md', 'checkpoint finalization requires the chosen resume.md as local evidence');
    const checkpoint = publish(actual, platform, work);
    const status = readCheckpoint(actual);
    assert(status.current && status.checkpoint?.generation === checkpoint.generation, 'published checkpoint did not pass its immediate current-state check');
    const pointer = object(JSON.parse(boundedSupport(actual, '.methodical/checkpoint-current.json', 4096).toString('utf8')));
    const checkpointHash = digest(boundedSupport(actual, `.methodical/checkpoints/${checkpoint.generation}/checkpoint.json`, 16 * 1024 * 1024));
    assert(pointer.schemaVersion === 1 && pointer.generation === checkpoint.generation && pointer.sha256 === checkpointHash, 'checkpoint finalization pointer changed');
    const final = readCheckpoint(actual);
    assert(final.current && final.checkpoint?.generation === checkpoint.generation, 'checkpoint changed during finalization');
    return { schemaVersion: 1, kind: 'methodical-checkpoint-finalized', host: platform, root: actual,
        generation: checkpoint.generation, checkpointHash, current: true, semanticFreshness: 'not-established' };
}
const runtime = {
    intercept: interceptIntent,
    stop: receiveNativeStop,
    async correlate(root, id, raw) {
        const context = object(raw);
        const same = () => {
            const i = inspectDispatch(root).intents.find(item => item.id === id), r = i?.reservation;
            return !!r && r.host === context.host && r.sessionId === context.sessionId && r.toolUseId === context.toolUseId && r.childId === context.childId;
        };
        if (same())
            return;
        try {
            return await correlateIntent(root, id, raw);
        }
        catch (error) {
            if (!same())
                throw error;
        }
    },
    async complete(root, id, raw) {
        const callback = object(raw);
        const same = () => {
            const i = inspectDispatch(root).intents.find(item => item.id === id), r = i?.reservation, c = i?.completion;
            return !!r && !!c && r.host === callback.host && r.sessionId === callback.sessionId && r.toolUseId === callback.toolUseId &&
                c.childId === callback.childId && c.outcome === callback.outcome &&
                c.observedModel === (callback.observedModel ?? null) && c.observedEffort === (callback.observedEffort ?? null);
        };
        if (same())
            return;
        try {
            return await completeIntent(root, id, raw);
        }
        catch (error) {
            if (!same())
                throw error;
        }
    },
};
async function hook(platform, raw, packageRoot) {
    const event = object(raw);
    if (platform === 'codex' && ['SessionStart', 'Stop', 'UserPromptSubmit', 'PreCompact', 'PostCompact'].includes(String(event.hook_event_name)))
        recordCodexContext(event);
    if (event.hook_event_name === 'UserPromptSubmit')
        return {};
    if (event.hook_event_name === 'Stop') {
        const root = text(event.cwd);
        if (platform === 'claude-code') {
            const coordinator = guardCoordinator(root);
            if (coordinator?.host === platform && coordinator.sessionId === event.session_id)
                await reconcileClaudeBackground(root, event);
        }
        else {
            if (event.permission_mode === 'plan' || !path.isAbsolute(root) || !fs.existsSync(path.join(root, '.methodical/worker-guard.json')))
                return {};
            const launch = await startCodexClaimedWorkers(root, event);
            const feedback = await workerGuardStop(platform, event, root);
            if (feedback.reason && launch.failedLogs.length)
                return { ...feedback, reason: feedback.reason + ' A launcher did not reserve its issued claim. ' +
                        'Inspect the local launch records before reissuing or using an authorized manual dispatch. ' +
                        launch.failedLogs.join(', ') };
            return feedback;
        }
        return workerGuardStop(platform, event, root);
    }
    if (event.hook_event_name === 'SessionStart') {
        // Startup reads installed content and existing records; it never initializes a project.
        const root = text(event.cwd);
        const rules = platform === 'claude-code'
            ? execFileSync('bash', [path.join(packageRoot, 'hooks/rules.sh')], { input: JSON.stringify(event), encoding: 'utf8', maxBuffer: 1024 * 1024,
                env: { ...process.env, CLAUDE_PLUGIN_ROOT: packageRoot, CLAUDE_PROJECT_DIR: root } })
            : `${fs.readFileSync(path.join(packageRoot, 'rules/rules.md'), 'utf8')}\n\n## Routing (shared profile)\n\n| role | model | effort |\n|---|---|---|\n${routingTable(platform)}`;
        const overlay = fs.readFileSync(path.join(packageRoot, 'overlay.md'), 'utf8');
        const status = readCheckpoint(root);
        return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${rules}\n\n${overlay}\n\nCheckpoint: ${status.reason}.\nPackage root: ${packageRoot}\nHost session ID: ${typeof event.session_id === 'string' ? event.session_id : 'unavailable'}` } };
    }
    // Compaction cannot do the semantic compound work or assert that a checkpoint is current.
    if (event.hook_event_name === 'PreCompact' || event.hook_event_name === 'PostCompact')
        return {};
    return nativeHook(platform, raw, runtime);
}
async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'dispatch-codex-hook-worker') {
        assert(args.length === 4, 'expected a coordinator claim');
        const [root, id, sessionId, expiresAt] = args.map(text);
        try {
            const completed = await dispatchCodexProcess(root, id, {
                hookClaim: { sessionId: sessionId, expiresAt: integer(Number(expiresAt)) },
            });
            json({ intentId: completed.id, status: completed.status });
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : 'worker launcher failed';
            json({ intentId: id, status: 'launcher-error', reason: reason.slice(0, 1000) });
            process.exitCode = 1;
        }
    }
    else if (command === 'dispatch-cli') {
        const root = text(args[0]), ids = args.slice(1).map(text);
        assert(ids.length >= 1, 'dispatch-cli ROOT INTENT-ID [INTENT-ID...]');
        if (ids.length === 1) {
            json(await dispatchCodexProcess(root, ids[0]));
        }
        else {
            const results = await dispatchCodexBatch(root, ids);
            json(results);
            if (results.some(item => item.status === 'rejected'))
                process.exitCode = 1;
        }
    }
    else if (command === 'prepare') {
        const root = text(args[0]), input = preparation(readJson(args[1]));
        const result = await prepareIntent(root, input);
        json({ ...result, marker: intentMarker(result.id), ...(input.host === 'codex' ? { nativeReference: intentNativeReference(result.id) } : {}) });
    }
    else if (command === 'approval-template')
        json(approvalTemplate(text(args[0]), preparation(readJson(args[1]))));
    else if (command === 'intercept')
        json(await interceptIntent(text(args[0]), text(args[1]), readJson(args[2])));
    else if (command === 'complete')
        json(await completeIntent(text(args[0]), text(args[1]), readJson(args[2])));
    else if (command === 'cancel')
        json(await cancelIntent(text(args[0]), text(args[1]), { reason: text(args[2]) }));
    else if (command === 'dispatch-status')
        json(inspectDispatch(text(args[0])));
    else if (command === 'worker-guard') {
        const input = readJson(args[1]);
        json(await retryDispatchLock(() => checkWorkers(text(args[0]), input)));
    }
    else if (command === 'worker-guard-progress')
        json(await retryDispatchLock(() => recordWorkerPatchProgress(text(args[0]), text(args[1]))));
    else if (command === 'checkpoint-binding')
        json(args.length === 4 ? recordsBinding(text(args[0]), host(args[1]), text(args[2]), text(args[3])) : checkpointBinding(text(args[0]), text(args[1])));
    else if (command === 'coordinator-setting')
        json(coordinatorSetting(host(args[0])));
    else if (command === 'profile')
        json(resolved(host(args[0]), args[1]));
    else if (command === 'support')
        json(support(text(args[0]), text(args[1]), args.slice(2)));
    else if (command === 'routing-table')
        process.stdout.write(routingTable(host(args[0]), args[1]) + '\n');
    else if (command === 'context-status')
        json(codexContextStatus(text(args[0]), text(args[1])));
    else if (command === 'status')
        json(readCheckpoint(text(args[0])));
    else if (command === 'inspect')
        json(inspectBundle(text(args[0])));
    else if (command === 'checkpoint')
        json(publish(text(args[0]), host(args[1]), readJson(args[2])));
    else if (command === 'checkpoint-finalize')
        json(finalizeCheckpoint(text(args[0]), host(args[1]), readJson(args[2])));
    else if (command === 'record') {
        recordRelevant(text(args[0]), text(args[1]), text(args[2]));
        json({ recorded: true });
    }
    else if (command === 'verify') {
        assert(args[2] === 'pre-restore' || args[2] === 'post-restore', 'verify ROOT BUNDLE pre-restore|post-restore [LEGACY-BINDING-JSON]');
        const result = verifyRecovery(text(args[0]), text(args[1]), args[2], args[3] === undefined ? undefined : readJson(args[3]));
        json(result);
        if (!result.pass)
            process.exitCode = 1;
    }
    else if (command === 'hook')
        json(await hook(host(args[0]), readJson(), text(args[1])));
    else
        throw new Error('commands: dispatch-cli ROOT INTENT-ID [INTENT-ID...] | coordinator-setting HOST | support ROOT PACKAGE-ROOT lenses/NAME.md... | approval-template ROOT [INPUT-JSON] | prepare ROOT [INPUT-JSON] | cancel ROOT INTENT-ID REASON | intercept ROOT ID [CONTEXT-JSON] | complete ROOT ID [CALLBACK-JSON] | dispatch-status ROOT | worker-guard ROOT [INPUT-JSON] | worker-guard-progress ROOT INTENT-ID | checkpoint-binding ROOT INTENT-ID | profile HOST [PROFILE-JSON] | routing-table HOST [PROFILE-JSON] | status ROOT | context-status SESSION-ID CWD | checkpoint ROOT HOST [WORK-JSON] | checkpoint-finalize ROOT HOST [WORK-JSON] | inspect BUNDLE | verify ROOT BUNDLE pre-restore|post-restore [LEGACY-BINDING-JSON] | record ROOT KIND REF | hook HOST PACKAGE-ROOT');
}
main().catch((error) => {
    process.stderr.write(`Methodical: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
