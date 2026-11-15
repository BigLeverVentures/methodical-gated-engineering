/** Owned POSIX CLI transport. Native delivery and backend configuration remain separately qualified. */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { assert, digest, object } from '../packages/methodical-core/src/contracts.js';
import { reserveProcessIntent, finishProcessIntent, retryDispatchLock } from '../packages/methodical-core/src/dispatch.js';
import { assertProject, safeFile } from '../packages/methodical-core/src/project.js';
import { recordRelevant } from '../packages/methodical-core/src/checkpoint.js';
export const processLimits = { line: 256 * 1024, output: 512 * 1024, events: 10000, deadlineMs: 600000 };
export function codexArguments(selected, guarded = false) {
    return ['exec', '--json', ...(guarded ? ['--sandbox', 'workspace-write', '-c', 'approval_policy="never"'] : []),
        '--model', selected.model,
        '-c', `model_reasoning_effort=${JSON.stringify(selected.effort)}`,
        '-c', 'features.multi_agent=false', '-c', 'features.multi_agent_v2=false', '-'];
}
/** One startup, one turn, one terminal. Item content is bounded opaque evidence, never authority. */
export class CodexEventParser {
    decoder = new TextDecoder('utf-8', { fatal: true });
    pending = '';
    count = 0;
    childId = null;
    started = false;
    terminal = false;
    feed(bytes) { this.consume(this.decoder.decode(bytes, { stream: true })); }
    end() {
        this.consume(this.decoder.decode());
        assert(this.pending.length === 0, 'truncated JSONL');
        assert(this.childId !== null && this.started && this.terminal, 'missing startup or completed turn');
    }
    consume(chunk) {
        this.pending += chunk;
        for (;;) {
            const newline = this.pending.indexOf('\n');
            if (newline < 0)
                break;
            const line = this.pending.slice(0, newline);
            this.pending = this.pending.slice(newline + 1);
            assert(Buffer.byteLength(line) <= processLimits.line, 'JSONL line overflow');
            this.event(JSON.parse(line));
        }
        assert(Buffer.byteLength(this.pending) <= processLimits.line, 'JSONL line overflow');
    }
    event(raw) {
        assert(++this.count <= processLimits.events, 'event count overflow');
        const e = object(raw);
        assert(!this.terminal, 'event after terminal');
        if (e.type === 'thread.started') {
            assert(this.childId === null && !this.started && typeof e.thread_id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(e.thread_id), 'invalid or duplicate thread startup');
            this.childId = e.thread_id;
        }
        else if (e.type === 'turn.started') {
            assert(this.childId !== null && !this.started, 'invalid turn start');
            this.started = true;
        }
        else if (e.type === 'item.started' || e.type === 'item.updated' || e.type === 'item.completed') {
            assert(this.started, 'item before turn');
            const item = object(e.item);
            assert(typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 256 && typeof item.type === 'string' && item.type.length > 0 && item.type.length <= 256, 'invalid item');
        }
        else if (e.type === 'turn.completed') {
            assert(this.started, 'completion before turn');
            const usage = object(e.usage);
            for (const key of ['input_tokens', 'cached_input_tokens', 'output_tokens'])
                assert(Number.isSafeInteger(usage[key]) && usage[key] >= 0, 'invalid usage');
            assert(usage.cached_input_tokens <= usage.input_tokens, 'invalid cached usage');
            this.terminal = true;
        }
        else if (e.type === 'turn.failed' || e.type === 'error') {
            throw Error('native failure event');
        }
        else
            throw Error('unsupported CLI event');
    }
}
export async function dispatchCodexProcess(root, id, options = {}) {
    assert(process.platform === 'darwin' || process.platform === 'linux', 'owned process groups require POSIX');
    assert(!options.signal?.aborted, 'dispatch cancelled before claim');
    assert(options.deadlineMs === undefined || Number.isSafeInteger(options.deadlineMs) && options.deadlineMs > 0 && options.deadlineMs <= processLimits.deadlineMs, 'invalid deadline');
    assert(options.graceMs === undefined || Number.isSafeInteger(options.graceMs) && options.graceMs >= 0 && options.graceMs <= 1000, 'invalid termination grace');
    const actual = assertProject(root);
    const reserve = () => reserveProcessIntent(actual, id, options.hookClaim);
    const intent = options.hookClaim
        ? await retryDispatchLock(reserve, Math.max(0, Math.min(20_000, options.hookClaim.expiresAt - Date.now())))
        : await reserve();
    const reservation = intent.reservation;
    const runId = reservation.transport.runId, args = codexArguments(reservation.configured, !!options.hookClaim);
    const base = `.methodical/evidence/cli/${intent.id}`;
    let child;
    let reason = null, exitCode = null, exitSignal = null;
    const parser = new CodexEventParser(), stdout = [], stderr = [];
    let retained = 0, total = 0, killTimer, localWaitTimer;
    let leaderReaped = false, stdoutEOF = false, stderrEOF = false, forcedPipeClose = false;
    let releaseWait = () => { };
    const grace = options.graceMs ?? 150;
    const signalGroup = (signal) => {
        if (child?.pid)
            try {
                process.kill(-child.pid, signal);
            }
            catch (e) {
                if (e.code !== 'ESRCH')
                    reason ??= 'process group signal failed';
            }
    };
    const fail = (message) => {
        reason ??= message;
        child?.stdin.destroy();
        signalGroup('SIGTERM');
        killTimer ??= setTimeout(() => signalGroup('SIGKILL'), grace);
        // close also waits for inherited pipes. Escaped descendants cannot extend this local bound.
        localWaitTimer ??= setTimeout(() => {
            if (!stdoutEOF || !stderrEOF) {
                forcedPipeClose = true;
                child?.stdout.destroy();
                child?.stderr.destroy();
            }
            child?.stdin.destroy();
            if (!leaderReaped)
                child?.unref();
            releaseWait();
        }, grace + 100);
    };
    const abort = () => fail('dispatch cancelled');
    const interrupt = () => fail('launcher interrupted');
    let deadline;
    try {
        await new Promise(resolve => {
            releaseWait = resolve;
            try {
                child = spawn(options.executable ?? process.env.METHODICAL_CODEX_EXECUTABLE ?? 'codex', args, { cwd: actual, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
            }
            catch {
                reason = 'spawn failed';
                resolve();
                return;
            }
            child.once('error', () => fail('spawn failed'));
            child.stdin.on('error', () => fail('stdin failed'));
            const consume = (chunk, target, parse) => {
                total += chunk.length;
                const available = Math.max(0, processLimits.output - retained);
                const saved = Buffer.from(chunk.subarray(0, available));
                retained += saved.length;
                if (saved.length)
                    target.push(saved);
                if (total > processLimits.output) {
                    fail('combined output overflow');
                    return;
                }
                if (parse && reason === null)
                    try {
                        parser.feed(chunk);
                    }
                    catch {
                        fail('invalid CLI event stream');
                    }
            };
            child.stdout.on('error', () => fail('stdout failed'));
            child.stderr.on('error', () => fail('stderr failed'));
            child.stdout.on('data', (chunk) => consume(chunk, stdout, true));
            child.stderr.on('data', (chunk) => consume(chunk, stderr, false));
            child.once('exit', (code, signal) => { leaderReaped = true; exitCode = code; exitSignal = signal; });
            child.stdout.once('end', () => { stdoutEOF = true; });
            child.stderr.once('end', () => { stderrEOF = true; });
            child.once('close', () => { resolve(); });
            options.signal?.addEventListener('abort', abort, { once: true });
            process.on('SIGINT', interrupt);
            process.on('SIGTERM', interrupt);
            deadline = setTimeout(() => fail('dispatch deadline'), options.deadlineMs ?? processLimits.deadlineMs);
            if (options.signal?.aborted)
                abort();
            child.stdin.end(Buffer.from(intent.brief));
        });
        if (!leaderReaped)
            reason ??= 'leader reap unconfirmed';
        if (!stdoutEOF || !stderrEOF || forcedPipeClose)
            reason ??= 'incomplete output streams';
        if (reason === null)
            try {
                parser.end();
            }
            catch {
                reason = 'incomplete or invalid CLI event stream';
            }
        if (exitCode !== 0 || exitSignal !== null)
            reason ??= 'unclean process exit';
    }
    finally {
        if (deadline)
            clearTimeout(deadline);
        options.signal?.removeEventListener('abort', abort);
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
        if (localWaitTimer)
            clearTimeout(localWaitTimer);
        // A clean leader exit also must not leave an owned same-group descendant running.
        signalGroup('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, grace));
        signalGroup('SIGKILL');
        if (killTimer)
            clearTimeout(killTimer);
        child?.removeAllListeners();
        child?.on('error', () => { });
        for (const stream of [child?.stdout, child?.stderr, child?.stdin]) {
            stream?.removeAllListeners();
            // Destruction may finish asynchronously after an unconfirmed reap.
            stream?.on('error', () => { });
        }
    }
    fs.mkdirSync(safeFile(actual, base, true), { recursive: true, mode: 0o700 });
    const out = Buffer.concat(stdout), err = Buffer.concat(stderr);
    const manifest = { schemaVersion: 1, transport: 'codex-cli-process', intentId: id, wrapperRunId: runId,
        wrapperSessionId: reservation.sessionId, nativeThreadId: parser.childId, pid: child?.pid ?? null,
        configured: { executable: options.executable ?? process.env.METHODICAL_CODEX_EXECUTABLE ?? 'codex', args, sandbox: options.hookClaim ? 'workspace-write' : 'inherited-native-configuration', approvals: options.hookClaim ? 'never' : 'inherited-native-configuration', authentication: 'native', trust: 'native', multiAgent: false, multiAgentV2: false },
        observed: { model: null, effort: null }, stdinHash: digest(intent.brief), stdoutHash: digest(out), stderrHash: digest(err),
        retainedBytes: retained, receivedBytes: total, exitCode, signal: exitSignal, terminal: parser.terminal, reason,
        leaderReaped, stdoutEOF, stderrEOF, forcedPipeClose, streamsComplete: stdoutEOF && stderrEOF && !forcedPipeClose,
        localGroupCleanup: 'owned group TERM/KILL attempted; escaped descendants not contained; backend termination unobserved' };
    for (const [name, bytes] of [['stdout.jsonl', out], ['stderr.txt', err], ['manifest.json', Buffer.from(JSON.stringify(manifest) + '\n')]])
        fs.writeFileSync(safeFile(actual, `${base}/${name}`, true), bytes, { flag: 'wx', mode: 0o600 });
    await retryDispatchLock(() => recordRelevant(actual, 'codex-cli-process', `${base}/manifest.json`));
    return finishProcessIntent(actual, id, { runId, childId: parser.childId, clean: reason === null, exitCode,
        signal: exitSignal, terminal: parser.terminal, reason });
}
/** Start one dispatch per distinct approved claim before waiting for any result. */
export async function dispatchCodexBatch(root, ids, options = {}) {
    assert(ids.length >= 2 && ids.length <= 32 && new Set(ids).size === ids.length &&
        ids.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)), 'expected two to thirty-two distinct dispatch intent IDs');
    const attempts = await Promise.allSettled(ids.map(id => dispatchCodexProcess(root, id, options)));
    return attempts.map((attempt, index) => attempt.status === 'fulfilled'
        ? { intentId: ids[index], status: attempt.value.status, completion: attempt.value.completion }
        : { intentId: ids[index], status: 'rejected',
            error: attempt.reason instanceof Error ? attempt.reason.message : 'worker dispatch failed' });
}
