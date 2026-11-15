/** Cooperative project-local routing. Hashes detect stale/corrupt records; this is not an approval security boundary. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assert, digest, hash, host, level, object, profile, role, setting, stack, strings, text, effort, type Host, type Profile, type Role, type Level, type Stack, type Setting } from './contracts.js';
import { assertProject, safeFile, repositoryIdentity, candidateIdentity, resolvePlan, ProjectLockBusyError } from './project.js';
import { decide, requiredSeats, type Decision, type Failure } from './policy.js';
import { assertWorkerReservation, workerGuardPolicy, type CodexHookClaim } from './worker-guard.js';
export type UnitBinding = {
    unitId: string;
    planPath: string;
    planHash: string;
    scope: string;
    approvalPath: string;
    approvalHash: string;
};
type Feedback = {
    classification: 'diligence' | 'capability' | 'recurring';
    checkerPath: string;
    checkerHash: string;
    args: string[];
    expectedExit: number;
    outputHash: string;
    findingPath: string;
    findingHash: string;
};
type Input = {
    operationId: string;
    failure: Failure;
    binding: UnitBinding;
    profile: Profile;
    role: Role;
    risk: Level;
    stack: Stack;
    task: 'routine' | 'demanding' | 'deterministic';
    policy: 'guidance' | 'adaptive';
    methodPath: string;
    lensPaths: string[];
    brief: string;
    available: Setting[];
    rejectedModels: string[];
    feedback: Feedback | null;
};
type Correlation = {
    host: Host;
    sessionId: string;
    toolUseId: string;
};
export type Intent = {
    id: string;
    status: 'prepared' | 'reserved' | 'completed' | 'dispatch-unknown' | 'cancelled';
    host: Host;
    brief: string;
    binding: UnitBinding;
    repository: string;
    candidate: string;
    profileHash: string;
    methodHash: string;
    lensHashes: Record<string, string>;
    briefHash: string;
    input: Input;
    decision: Decision;
    preparedAt: string;
    seal: string;
    reservation: (Correlation & {
        transport?: { kind: 'codex-cli-process'; runId: string };
        childId: string | null;
        background?: true;
        requested: {
            model: string | null;
            effort: string | null;
        };
        configured: Setting;
    }) | null;
    completion: Record<string, unknown> | null;
    cancellation?: { reason: string; at: string };
};
type StopReceipt = {
    host: Host;
    sessionId: string;
    childId: string;
    outcome: 'completed' | 'partial' | 'failed' | 'unknown';
    observedModel: string | null;
    observedEffort: ReturnType<typeof effort> | null;
    terminal: true;
    at: string;
};
export type DispatchState = {
    schemaVersion: 1;
    revision: number;
    intents: Intent[];
    pendingStops?: StopReceipt[];
    checksum: string;
};
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const json = (v: unknown) => JSON.stringify(v);
function stateContent(s: Pick<DispatchState, 'revision' | 'intents' | 'pendingStops'>): unknown {
    return { schemaVersion: 1, revision: s.revision, intents: s.intents,
        ...(s.pendingStops === undefined ? {} : { pendingStops: s.pendingStops }) };
}
function boundedFile(root: string, name: string, max = 1024 * 1024): Buffer { const p = safeFile(root, name), s = fs.lstatSync(p); assert(s.isFile() && s.size <= max, 'expected bounded regular file'); return fs.readFileSync(p); }
function parseBinding(value: unknown): UnitBinding { const v = object(value); return { unitId: text(v.unitId), planPath: text(v.planPath), planHash: hash(v.planHash), scope: text(v.scope), approvalPath: text(v.approvalPath), approvalHash: hash(v.approvalHash) }; }
function parseInput(value: unknown): Input {
    const v = object(value);
    const failure = v.failure ?? 'none';
    assert(['none', 'environment', 'diligence', 'capability', 'recurring', 'format', 'delivery', 'unknown'].includes(String(failure)), 'unknown failure classification');
    assert(['routine', 'demanding', 'deterministic'].includes(String(v.task)), 'invalid task');
    assert(v.policy === 'guidance' || v.policy === 'adaptive', 'invalid policy');
    assert(Array.isArray(v.available) && v.available.length <= 64, 'invalid available settings');
    let feedback: Feedback | null = null;
    if (v.feedback !== undefined && v.feedback !== null) {
        const f = object(v.feedback);
        assert(['diligence', 'capability', 'recurring'].includes(String(f.classification)), 'unsupported feedback classification');
        assert(Number.isInteger(f.expectedExit) && (f.expectedExit as number) > 0 && (f.expectedExit as number) <= 255, 'feedback needs explicit failing exit');
        feedback = { classification: f.classification as Feedback['classification'], checkerPath: text(f.checkerPath), checkerHash: hash(f.checkerHash), args: strings(f.args ?? [], 32), expectedExit: f.expectedExit as number, outputHash: hash(f.outputHash), findingPath: text(f.findingPath), findingHash: hash(f.findingHash) };
    }
    if (feedback)
        assert(failure === 'none' || failure === feedback.classification, 'feedback classification mismatch');
    return { operationId: text(v.operationId), failure: feedback ? feedback.classification : failure as Failure, binding: parseBinding(v.binding), profile: profile(v.profile), role: role(v.role), risk: level(v.risk), stack: stack(v.stack), task: v.task as Input['task'], policy: v.policy, methodPath: text(v.methodPath), lensPaths: strings(v.lensPaths), brief: text(v.brief), available: v.available.map(setting), rejectedModels: strings(v.rejectedModels ?? []), feedback };
}
export function policyBindingHash(value: unknown): string { const v = object(value), p = profile(v.profile); return digest(json({ policy: v.policy, risk: level(v.risk), stack: stack(v.stack), limits: p.limits })); }
export function readDispatchApproval(root: string, b: UnitBinding): Record<string, unknown> {
    const bytes = boundedFile(root, b.approvalPath);
    assert(digest(bytes) === b.approvalHash, 'approval record hash mismatch');
    return object(JSON.parse(bytes.toString()));
}
function validateApproval(root: string, b: UnitBinding, input: Input): void { resolvePlan(root, b.planPath, b.planHash); const a = readDispatchApproval(root, b); assert(a.approved === true && a.unitId === b.unitId && a.planHash === b.planHash && a.scope === b.scope && a.profileHash === digest(json(input.profile)) && a.policyHash === policyBindingHash(input) && strings(a.allowedOperations).includes(input.operationId), 'unit lacks matching direct cooperative approval'); }
function immutable(i: Intent): unknown { return { id: i.id, host: i.host, brief: i.brief, binding: i.binding, repository: i.repository, candidate: i.candidate, profileHash: i.profileHash, methodHash: i.methodHash, lensHashes: i.lensHashes, briefHash: i.briefHash, input: i.input, decision: i.decision, preparedAt: i.preparedAt }; }
function readState(root: string): DispatchState {
    const file = safeFile(root, '.methodical/routing-state.json', true);
    if (!fs.existsSync(file))
        return { schemaVersion: 1, revision: 0, intents: [], checksum: '' };
    return parseState(JSON.parse(boundedFile(root, '.methodical/routing-state.json', 1024 * 1024).toString()));
}
function parseState(value: unknown): DispatchState {
    const v = object(value);
    assert(v.schemaVersion === 1 && Number.isSafeInteger(v.revision) && (v.revision as number) >= 0 && Array.isArray(v.intents) && v.intents.length <= 512, 'malformed routing state');
    assert(v.checksum === digest(json(stateContent(v as unknown as DispatchState))), 'routing state checksum mismatch');
    const ids = new Set<string>();
    for (const raw of v.intents) {
        const i = object(raw);
        assert(idPattern.test(text(i.id)) && !ids.has(i.id as string), 'duplicate or malformed intent');
        ids.add(i.id as string);
        const parsed = parseInput(i.input);
        assert(json(parsed) === json(i.input), 'noncanonical stored input');
        assert(['prepared', 'reserved', 'completed', 'dispatch-unknown', 'cancelled'].includes(String(i.status)), 'invalid intent state');
        const intent = i as unknown as Intent;
        assert(intent.seal === digest(json(immutable(intent))), 'intent seal mismatch');
        assert(intent.host === parsed.profile.host && intent.profileHash === digest(json(parsed.profile)) && intent.briefHash === digest(intent.brief) && json(intent.binding) === json(parsed.binding), 'forged intent binding');
        hash(i.candidate);
        hash(i.repository);
        hash(i.methodHash);
        object(i.lensHashes);
        if (i.status === 'prepared' || i.status === 'cancelled') {
            assert(i.reservation === null && i.completion === null, 'unreserved intent has receipt');
            if (i.status === 'cancelled') {
                const cancelled = object(i.cancellation);
                assert(text(cancelled.reason).length <= 2048 && Number.isFinite(Date.parse(text(cancelled.at))), 'invalid cancellation record');
            }
            else assert(i.cancellation === undefined, 'prepared intent has cancellation');
        }
        else {
            const r = correlation(i.reservation);
            assert(r.host === i.host, 'reservation host mismatch');
            const transport = object(i.reservation).transport;
            if (transport !== undefined) {
                const t = object(transport);
                assert(t.kind === 'codex-cli-process' && idPattern.test(text(t.runId)) && i.host === 'codex' && r.sessionId === `wrapper-session:${t.runId}` && r.toolUseId === `wrapper-run:${t.runId}`, 'invalid process claim');
            }
            const child = object(i.reservation).childId;
            assert(object(i.reservation).background === undefined ||
                (i.host === 'claude-code' && object(i.reservation).background === true && typeof child === 'string'),
                'invalid native background reservation');
            assert(child === null || typeof child === 'string' && child.length > 0, 'malformed child correlation');
        }
    }
    if (v.pendingStops !== undefined) {
        assert(Array.isArray(v.pendingStops) && v.pendingStops.length <= 128, 'unmatched stop receipt bound exceeded');
        const keys = new Set<string>();
        for (const raw of v.pendingStops) {
            const receipt = parseStop(raw), key = stopKey(receipt);
            assert(!keys.has(key), 'duplicate unmatched stop receipt'); keys.add(key);
            assert(Number.isFinite(Date.parse(text(object(raw).at))), 'invalid stop receipt date');
            assert(!(v.intents as Intent[]).some(i => i.reservation && stopKey({host: i.host, sessionId: i.reservation.sessionId, childId: i.reservation.childId ?? ''}) === key), 'matched stop receipt was not consumed');
        }
    }
    return v as unknown as DispatchState;
}
function writeState(root: string, s: DispatchState): void { s.revision++; s.checksum = digest(json(stateContent(s))); assert(Buffer.byteLength(json(s) + '\n') <= 1024 * 1024, 'routing state exceeds checkpoint capture bound; explicit archive/recovery required'); writeDispatchRecord(root, 'routing-state.json', s); }
export function writeDispatchRecord(root: string, name: 'routing-state.json' | 'worker-guard.json', value: unknown): void {
    const target = safeFile(root, `.methodical/${name}`, true);
    const tmp = safeFile(root, `.methodical/dispatch-${randomUUID()}.tmp`, true);
    let fd: number | undefined;
    try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, json(value) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, target);
    const dir = fs.openSync(path.dirname(target), 'r');
    try {
        fs.fsyncSync(dir);
    }
    finally {
        fs.closeSync(dir);
    }
}
finally {
    if (fd !== undefined)
        fs.closeSync(fd);
    if (fs.existsSync(tmp))
        fs.unlinkSync(tmp);
} }
function locked<T>(root: string, fn: (actual: string) => T): T { const actual = assertProject(root), dir = safeFile(actual, '.methodical', true); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); const lock = safeFile(actual, '.methodical/lock', true); try {
    fs.mkdirSync(lock);
}
catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw error;
    throw new ProjectLockBusyError('Methodical lock held; inspect pending state before explicit recovery');
} try {
    return fn(actual);
}
finally {
    fs.rmdirSync(lock);
} }
/** Serialize a coordination check with native reservations and receipts. */
export function withDispatchSnapshot<T>(root: string, act: (actual: string, state: DispatchState) => T): T {
    return locked(root, actual => act(actual, readState(actual)));
}
/** Native lifecycle delivery can race another callback; reservations never use this retry. */
async function receiptLocked<T>(root: string, fn: (actual: string) => T): Promise<T> {
    return retryDispatchLock(() => locked(root, fn));
}
/** Retry only contention on the shared project lock. */
export async function retryDispatchLock<T>(act: () => T | Promise<T>, timeoutMs = 1500): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let delay = 5;
    for (;;) {
        try { return await act(); }
        catch (error) {
            if (!(error instanceof ProjectLockBusyError) || Date.now() + delay > deadline) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 50);
        }
    }
}
function liveBindings(root: string, i: Intent): void { validateApproval(root, i.binding, i.input); assert(repositoryIdentity(root) === i.repository, 'repository lineage changed'); assert(candidateIdentity(root) === i.candidate, 'stale candidate identity'); assert(digest(boundedFile(root, i.input.methodPath)) === i.methodHash, 'method content changed'); for (const [file, h] of Object.entries(i.lensHashes))
    assert(digest(boundedFile(root, file)) === h, 'lens content changed'); }
function reproduce(root: string, i: Intent): boolean {
    const f = i.input.feedback;
    if (!f)
        return false;
    const control = safeFile(root, '.methodical/routing-state.json', true), controlHash = fs.existsSync(control) ? digest(fs.readFileSync(control)) : null;
    assert(digest(boundedFile(root, f.checkerPath)) === f.checkerHash, 'checker content changed');
    assert(f.findingPath.startsWith('.methodical/feedback/'), 'finding must live in candidate-independent Methodical feedback records');
    const findingBytes = boundedFile(root, f.findingPath);
    assert(digest(findingBytes) === f.findingHash, 'finding content changed');
    const finding = object(JSON.parse(findingBytes.toString()));
    assert(finding.accepted === true && finding.material === true && finding.classification === f.classification && finding.candidate === i.candidate && finding.planHash === i.binding.planHash, 'feedback is not an accepted current material finding');
    const checker = safeFile(root, f.checkerPath), node = /\.(?:mjs|cjs|js)$/.test(checker), result = spawnSync(node ? process.execPath : checker, node ? [checker, ...f.args] : f.args, { cwd: root, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
    assert(!result.error && result.signal === null && result.status === f.expectedExit, 'failing check did not reproduce');
    assert(digest(Buffer.concat([result.stdout ?? Buffer.alloc(0), Buffer.from('\0'), result.stderr ?? Buffer.alloc(0)])) === f.outputHash, 'reproduced output differs');
    liveBindings(root, i);
    assert((fs.existsSync(control) ? digest(fs.readFileSync(control)) : null) === controlHash, 'checker modified durable routing state');
    return true;
}
function counters(s: DispatchState, i: Intent) { const same = s.intents.filter(x => x.id !== i.id && x.binding.unitId === i.binding.unitId); const spent = same.filter(x => x.reservation !== null); const lane = spent.filter(x => x.input.operationId === i.input.operationId); return { attempts: lane.length, escalations: lane.filter(x => x.input.feedback !== null && x.input.policy === 'adaptive').length, reviewCycles: new Set(lane.filter(x => x.input.feedback !== null).map(x => x.candidate)).size, remainingRequests: Math.max(0, i.input.profile.limits.requests - spent.length) }; }
function operationDefinition(i: Intent): string { return digest(json({ role: i.input.role, risk: i.input.risk, stack: i.input.stack, task: i.input.task, policy: i.input.policy, profileHash: i.profileHash, methodHash: i.methodHash, lensHashes: i.lensHashes, brief: i.input.brief })); }
function decision(s: DispatchState, i: Intent, verified: boolean): Decision { for (const p of s.intents.filter(x => x.id !== i.id && x.binding.unitId === i.binding.unitId && x.status !== 'cancelled'))
    assert(json(p.binding) === json(i.binding) && p.repository === i.repository && p.profileHash === i.profileHash, 'approved unit binding changed'); const prior = s.intents.filter(x => x.id !== i.id && x.binding.unitId === i.binding.unitId && x.input.operationId === i.input.operationId && x.reservation !== null); for (const p of prior)
    assert(operationDefinition(p) === operationDefinition(i), 'approved operation definition changed'); if (prior.some(p => p.input.feedback !== null || p.completion?.outcome === 'failed' || p.completion?.outcome === 'partial' || p.completion?.outcome === 'unknown'))
    assert(i.input.failure !== 'none', 'failed operation requires classified feedback or diagnosis'); return decide(i.input.profile, { role: i.input.role, risk: i.input.risk, stack: i.input.stack, task: i.input.task, policy: i.input.policy, failure: i.input.failure, verifiedFeedback: verified, available: i.input.available, rejectedModels: i.input.rejectedModels, ...counters(s, i) }); }
function find(s: DispatchState, id: string): Intent { assert(idPattern.test(id), 'malformed intent ID'); const i = s.intents.find(x => x.id === id); assert(i, 'unknown intent'); return i; }
function correlation(value: unknown): Correlation { const c = object(value); return { host: host(c.host), sessionId: text(c.sessionId), toolUseId: text(c.toolUseId) }; }
function match(i: Intent, value: unknown): Correlation { const c = correlation(value); assert(i.reservation && json(c) === json({ host: i.reservation.host, sessionId: i.reservation.sessionId, toolUseId: i.reservation.toolUseId }), 'callback correlation mismatch'); return c; }
function boundedId(value: unknown): string {
    const id = text(value); assert(id.length <= 256, 'native receipt ID exceeds bound'); return id;
}
function stopKey(receipt: { host: Host; sessionId: string; childId: string }): string {
    return json([receipt.host, receipt.sessionId, receipt.childId]);
}
function parseStop(value: unknown): Omit<StopReceipt, 'at'> {
    const v = object(value);
    assert(v.terminal === true, 'native stop must explicitly attest a terminal event');
    assert(['completed', 'partial', 'failed', 'unknown'].includes(String(v.outcome)), 'unknown completion outcome');
    return { host: host(v.host), sessionId: boundedId(v.sessionId), childId: boundedId(v.childId),
        outcome: v.outcome as StopReceipt['outcome'],
        observedModel: v.observedModel === undefined || v.observedModel === null ? null : boundedId(v.observedModel),
        observedEffort: v.observedEffort === undefined || v.observedEffort === null ? null : effort(v.observedEffort), terminal: true };
}
function sameStop(a: Omit<StopReceipt, 'at'>, b: Omit<StopReceipt, 'at'>): boolean {
    return stopKey(a) === stopKey(b) && a.outcome === b.outcome && a.observedModel === b.observedModel && a.observedEffort === b.observedEffort;
}
function settle(i: Intent, value: unknown, idempotent: boolean, at = new Date().toISOString()): boolean {
    const v = object(value); match(i, value);
    assert(!i.reservation?.transport, 'process claims require process settlement');
    assert(['completed', 'partial', 'failed', 'unknown'].includes(String(v.outcome)), 'unknown completion outcome');
    const childId = v.childId === null ? null : boundedId(v.childId);
    const receipt = { outcome: v.outcome, childId,
        observedModel: v.observedModel === undefined || v.observedModel === null ? null : boundedId(v.observedModel),
        observedEffort: v.observedEffort === undefined || v.observedEffort === null ? null : effort(v.observedEffort) };
    if (v.source === 'claude-agent-response')
        assert(i.host === 'claude-code' && childId !== null && i.reservation?.childId === childId && receipt.outcome !== 'unknown',
            'synchronous response lacks explicit outcome or matching native identity');
    if (i.status !== 'reserved') {
        const current = i.completion;
        if (v.source === 'claude-agent-response') {
            assert(i.host === 'claude-code' && i.status === 'completed' && current?.terminal === true &&
                childId !== null && i.reservation?.childId === childId && current.childId === childId && receipt.outcome !== 'unknown',
                'synchronous response refinement lacks matching terminal native identity');
            assert(current.outcome === 'unknown' || current.outcome === receipt.outcome, 'conflicting synchronous native outcome');
            for (const key of ['observedModel', 'observedEffort'] as const)
                assert(current[key] === null || receipt[key] === null || current[key] === receipt[key], 'conflicting synchronous native observation');
            const refined = { outcome: current.outcome === 'unknown' ? receipt.outcome : current.outcome,
                observedModel: current.observedModel ?? receipt.observedModel, observedEffort: current.observedEffort ?? receipt.observedEffort };
            if (Object.entries(refined).every(([key, field]) => current[key] === field)) return false;
            const prior = current.initialTerminalReceipt ?? { ...current };
            const responses = current.nativeResponseReceipts === undefined ? [] : current.nativeResponseReceipts as unknown[];
            assert(responses.length < 3, 'synchronous response refinement bound exceeded');
            // At most outcome, model and effort can gain a fact. Keep the original terminal
            // receipt and timestamp rather than rewriting the delivered stop's provenance.
            i.completion = { ...current, ...refined, initialTerminalReceipt: prior,
                nativeResponseReceipts: [...responses, { ...receipt, source: 'claude-agent-response', at: new Date().toISOString() }] };
            return true;
        }
        const original = current?.initialTerminalReceipt;
        if (idempotent && v.source === 'native-stop' && original && typeof original === 'object' &&
            Object.entries(receipt).every(([key, field]) => object(original)[key] === field) && object(original).terminal === true)
            return false;
        assert(idempotent && i.completion && Object.entries(receipt).every(([key, value]) => i.completion![key] === value) &&
            (i.completion.terminal === true || i.completion.outcome !== 'unknown') === (v.terminal === true || v.outcome !== 'unknown'), 'duplicate, conflicting or stale completion');
        return false;
    }
    assert(v.outcome === 'unknown' || childId !== null && i.reservation?.childId === childId, 'completion lacks correlated native child');
    assert(v.terminal !== true || childId !== null && i.reservation?.childId === childId, 'terminal completion needs a correlated native child');
    if (childId !== null) assert(i.reservation?.childId === childId, 'completion child mismatch');
    const terminal = v.terminal === true || v.outcome !== 'unknown';
    i.completion = { ...receipt, terminal, ...(v.source === 'native-stop' || v.source === 'claude-agent-response' ? {source: v.source} : {}), at };
    i.status = v.outcome === 'unknown' && !terminal ? 'dispatch-unknown' : 'completed';
    return true;
}
/** Abandoning preparation is explicit; a consumed reservation cannot be cancelled or refunded. */
export async function cancelIntent(root: string, id: string, value: unknown): Promise<Intent> {
    return locked(root, actual => {
        const s = readState(actual), i = find(s, id), reason = text(object(value).reason);
        assert(reason.length <= 2048, 'cancellation reason exceeds bound');
        if (i.status === 'cancelled') {
            assert(i.cancellation?.reason === reason, 'conflicting intent cancellation'); return structuredClone(i);
        }
        assert(i.status === 'prepared' && i.reservation === null, 'only unreserved prepared intents may be cancelled');
        i.status = 'cancelled'; i.cancellation = { reason, at: new Date().toISOString() };
        writeState(actual, s); return structuredClone(i);
    });
}
/** Stop receipts contain only bounded native identity/outcome fields, never transcript content. */
export async function receiveNativeStop(root: string, value: unknown): Promise<{ recorded: boolean; intentId: string | null }> {
    const receipt = parseStop(value), actual = assertProject(root);
    if (!fs.existsSync(safeFile(actual, '.methodical/routing-state.json', true))) return { recorded: false, intentId: null };
    return receiptLocked(actual, real => {
        const s = readState(real), key = stopKey(receipt);
        const matches = s.intents.filter(i => i.reservation && stopKey({host: i.host, sessionId: i.reservation.sessionId, childId: i.reservation.childId ?? ''}) === key);
        assert(matches.length <= 1, 'ambiguous native child');
        const matched = matches[0];
        if (matched) {
            const changed = settle(matched, { ...receipt, toolUseId: matched.reservation!.toolUseId, source: 'native-stop' }, true);
            if (changed) writeState(real, s);
            return { recorded: true, intentId: matched.id };
        }
        const previous = s.pendingStops?.find(stop => stopKey(stop) === key);
        if (previous) {
            assert(sameStop(previous, receipt), 'conflicting unmatched stop receipt'); return { recorded: true, intentId: null };
        }
        if (!s.intents.some(i => i.status === 'reserved' && !i.reservation?.transport && i.reservation?.childId === null && i.host === receipt.host && i.reservation.sessionId === receipt.sessionId)) return { recorded: false, intentId: null };
        const pending = s.pendingStops ?? [];
        assert(pending.length < 128, 'unmatched stop receipt bound exceeded; reconcile pending dispatches');
        pending.push({ ...receipt, at: new Date().toISOString() }); s.pendingStops = pending;
        writeState(real, s); return { recorded: true, intentId: null };
    });
}
export async function prepareIntent(root: string, value: unknown): Promise<Intent> {
    return locked(root, actual => {
        const input = parseInput(value);
        validateApproval(actual, input.binding, input);
        const s = readState(actual);
        assert(s.intents.length < 512, 'routing history bound; archive with explicit recovery');
        assert(!s.intents.some(x => x.binding.unitId === input.binding.unitId && x.input.operationId === input.operationId && (x.status === 'reserved' || x.status === 'dispatch-unknown')), 'pending or unknown dispatch requires reconciliation');
        const lensHashes: Record<string, string> = {};
        assert(input.lensPaths.length > 0, 'prepared intent needs relevant lens content');
        for (const file of input.lensPaths) {
            assert(!Object.hasOwn(lensHashes, file), 'duplicate lens');
            lensHashes[file] = digest(boundedFile(actual, file));
        }
        const id = randomUUID(), brief = text(`# Methodical child\n\nUnit: ${input.binding.unitId}\nScope: ${input.binding.scope}\nStack: ${input.stack}\nRisk: ${input.risk}\n\n## Method\n${boundedFile(actual, input.methodPath).toString()}\n\n## Approved plan\n${boundedFile(actual, input.binding.planPath).toString()}\n\n${input.lensPaths.map(file => `## Lens: ${file}\n${boundedFile(actual, file).toString()}`).join('\n\n')}\n\n## Task\n${input.brief}\n\n[methodical-intent:${id}]`);
        const i: Intent = { id, status: 'prepared', host: input.profile.host, brief, binding: input.binding, repository: repositoryIdentity(actual), candidate: candidateIdentity(actual), profileHash: digest(json(input.profile)), methodHash: digest(boundedFile(actual, input.methodPath)), lensHashes, briefHash: digest(brief), input, decision: null as unknown as Decision, preparedAt: new Date().toISOString(), seal: '', reservation: null, completion: null };
        i.decision = decision(s, i, reproduce(actual, i));
        i.seal = digest(json(immutable(i)));
        s.intents.push(i);
        writeState(actual, s);
        return structuredClone(i);
    });
}
async function reserve(root: string, id: string, value: unknown, runId?: string, hookClaim?: CodexHookClaim): Promise<Intent> { return locked(root, actual => { const c = correlation(value), s = readState(actual), i = find(s, id); assert(i.status === 'prepared', 'intent already consumed or unresolved'); assert(c.host === i.host && (runId === undefined || i.host === 'codex'), 'wrong native host'); assert(!s.intents.some(x => x.id !== id && x.binding.unitId === i.binding.unitId && x.input.operationId === i.input.operationId && (x.status === 'reserved' || x.status === 'dispatch-unknown')), 'pending or unknown dispatch requires reconciliation'); assert(!s.intents.some(x => x.reservation?.host === c.host && x.reservation?.sessionId === c.sessionId && x.reservation?.toolUseId === c.toolUseId), 'native tool call already reserved'); liveBindings(actual, i); assertWorkerReservation(actual, i, readDispatchApproval(actual, i.binding).workerGuard, Date.now(), hookClaim); assert(!hookClaim || !i.input.feedback, 'feedback checker needs an authorized manual dispatch'); const d = decision(s, i, reproduce(actual, i)); assert(json(d) === json(i.decision), 'durable decision changed; prepare a fresh intent'); assert(d.action === 'model' && d.setting, 'intent does not authorize a native model dispatch'); const rawRequested = object(value).requested, request = rawRequested === undefined || rawRequested === null ? {} : object(rawRequested), requested = { model: request.model === undefined || request.model === null ? null : text(request.model), effort: request.effort === undefined || request.effort === null ? null : text(request.effort) }; assert((requested.model?.length ?? 0) <= 256 && (requested.effort?.length ?? 0) <= 256, 'native requested setting exceeds bound'); i.status = 'reserved'; i.reservation = { ...c, childId: null, requested, configured: d.setting, ...(runId === undefined ? {} : {transport: {kind: 'codex-cli-process' as const, runId}}) }; writeState(actual, s); return structuredClone(i); }); }
export async function interceptIntent(root: string, id: string, value: unknown): Promise<Intent> { return reserve(root, id, value); }
/** Sole durable launch claim. Wrapper correlation is deliberately distinct from native identity. */
export async function reserveProcessIntent(root: string, id: string, hookClaim?: CodexHookClaim): Promise<Intent> {
    const runId = randomUUID();
    return reserve(root, id, {host: 'codex', sessionId: `wrapper-session:${runId}`, toolUseId: `wrapper-run:${runId}`}, runId, hookClaim);
}
export async function finishProcessIntent(root: string, id: string, value: {
    runId: string; childId: string | null; clean: boolean; exitCode: number | null; signal: string | null;
    terminal: boolean; reason: string | null;
}): Promise<Intent> {
    return receiptLocked(root, actual => {
        const s = readState(actual), i = find(s, id), r = i.reservation;
        assert(i.status === 'reserved' && r?.transport?.kind === 'codex-cli-process' && r.transport.runId === value.runId, 'process settlement claim mismatch');
        assert(value.childId === null || /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.childId), 'invalid native process UUID');
        assert(value.reason === null || value.reason.length <= 2048, 'process reason exceeds bound');
        const success = value.clean && value.exitCode === 0 && value.signal === null && value.terminal && value.childId !== null && value.reason === null;
        r.childId = value.childId;
        i.completion = {source: 'codex-cli-process', runId: value.runId, childId: value.childId,
            outcome: success ? 'completed' : 'unknown', terminal: success, observedModel: null, observedEffort: null,
            exitCode: value.exitCode, signal: value.signal, reason: value.reason, at: new Date().toISOString()};
        i.status = success ? 'completed' : 'dispatch-unknown';
        writeState(actual, s); return structuredClone(i);
    });
}
export async function correlateIntent(root: string, id: string, value: unknown): Promise<Intent> {
    return receiptLocked(root, actual => {
        const s = readState(actual), i = find(s, id), v = object(value); match(i, value);
        assert(!i.reservation?.transport, 'process claims require process settlement');
        const childId = boundedId(v.childId);
        if (i.reservation?.childId === childId) return structuredClone(i);
        assert(i.status === 'reserved' && i.reservation && i.reservation.childId === null, 'conflicting or stale correlation');
        assert(!s.intents.some(x => x.id !== id && x.reservation?.host === i.host && x.reservation?.sessionId === i.reservation?.sessionId && x.reservation?.childId === childId), 'child already correlated');
        i.reservation.childId = childId;
        if (v.background === true) {
            assert(i.host === 'claude-code', 'unexpected background Agent result');
            i.reservation.background = true;
        }
        const key = stopKey({ host: i.host, sessionId: i.reservation.sessionId, childId });
        const pending = s.pendingStops?.find(stop => stopKey(stop) === key);
        if (pending) {
            settle(i, { ...pending, toolUseId: i.reservation.toolUseId, source: 'native-stop' }, true, pending.at);
            s.pendingStops = s.pendingStops!.filter(stop => stopKey(stop) !== key);
        }
        writeState(actual, s); return structuredClone(i);
    });
}
/** Refine only an unknown stop for a correlated background Agent with a later host notification. */
export async function confirmClaudeBackgroundCompletion(root: string, receipts: readonly {
    sessionId: string; childId: string; toolUseId: string; runId: string; at: string;
}[]): Promise<void> {
    if (!receipts.length)
        return;
    await receiptLocked(root, actual => {
        const state = readState(actual);
        let changed = false;
        for (const notice of receipts) {
            const sessionId = boundedId(notice.sessionId), childId = boundedId(notice.childId);
            const toolUseId = boundedId(notice.toolUseId), runId = boundedId(notice.runId);
            const matches = state.intents.filter(i => i.host === 'claude-code' && i.reservation?.background &&
                i.reservation.sessionId === sessionId && i.reservation.childId === childId && i.reservation.toolUseId === toolUseId);
            assert(matches.length <= 1, 'ambiguous background completion');
            const intent = matches[0], stop = intent?.completion;
            if (intent?.status !== 'completed' || stop?.source !== 'native-stop' || stop.terminal !== true ||
                stop.outcome !== 'unknown' || stop.childId !== childId || typeof stop.at !== 'string' ||
                !(Date.parse(notice.at) >= Date.parse(stop.at)))
                continue;
            intent.completion = { ...stop, outcome: 'completed', initialTerminalReceipt: {...stop},
                backgroundCompletion: {source: 'claude-task-notification', runId, sessionId, childId, toolUseId, at: notice.at} };
            changed = true;
        }
        if (changed)
            writeState(actual, state);
    });
}
export async function resolveNativeIntent(root: string, value: unknown): Promise<string | null> { const v = object(value), h = host(v.host), session = text(v.sessionId), child = text(v.childId), s = inspectDispatch(root); const found = s.intents.filter(x => x.host === h && x.reservation?.sessionId === session && x.reservation?.childId === child); assert(found.length <= 1, 'ambiguous native child'); return found[0]?.id ?? null; }
export async function completeIntent(root: string, id: string, value: unknown): Promise<Intent> {
    return receiptLocked(root, actual => { const s = readState(actual), i = find(s, id); if (settle(i, value, false)) writeState(actual, s); return structuredClone(i); });
}
export function inspectDispatch(root: string): DispatchState { return structuredClone(readState(assertProject(root))); }
/** Template only: caller records an existing direct user ruling before writing approved:true. */
export function approvalTemplate(root: string, value: unknown): Record<string, unknown> { const v = object(value), b = object(v.binding), p = profile(v.profile); resolvePlan(assertProject(root), text(b.planPath), hash(b.planHash)); return { approved: false, unitId: text(b.unitId), planHash: hash(b.planHash), scope: text(b.scope), allowedOperations: v.allowedOperations === undefined ? ['implementation', ...requiredSeats(level(v.risk), stack(v.stack))] : strings(v.allowedOperations), ...(v.workerGuard === undefined ? {} : {workerGuard: workerGuardPolicy(v.workerGuard)}), profileHash: digest(json(p)), policyHash: policyBindingHash({ ...v, profile: p }) }; }
export type DispatchDependency = {
    source: string;
    sha256: string;
};
/** Serializable dependency list allows checkpoint inspection to verify the archived state itself. */
export function dispatchDependenciesFromState(value: unknown): DispatchDependency[] { const s = parseState(value), deps = new Map<string, string>(); const add = (source: string, sha256: string) => { safeFile('/__methodical_dependency__', source, true); const previous = deps.get(source); assert(previous === undefined || previous === sha256, 'active intents require conflicting dependency bytes'); deps.set(source, sha256); }; for (const i of s.intents.filter(i => i.status !== 'completed' && i.status !== 'cancelled')) {
    add(i.binding.planPath, i.binding.planHash);
    add(i.binding.approvalPath, i.binding.approvalHash);
    add(i.input.methodPath, i.methodHash);
    for (const [file, h] of Object.entries(i.lensHashes))
        add(file, hash(h));
    if (i.input.feedback) {
        add(i.input.feedback.checkerPath, i.input.feedback.checkerHash);
        add(i.input.feedback.findingPath, i.input.feedback.findingHash);
    }
} return [...deps].sort(([a], [b]) => a.localeCompare(b)).map(([source, sha256]) => ({ source, sha256 })); }
export function dispatchDependencies(root: string): DispatchDependency[] { const actual = assertProject(root), s = readState(actual); if (s.intents.length === 0)
    return []; const deps = dispatchDependenciesFromState(s); for (const d of deps)
    assert(digest(boundedFile(actual, d.source)) === d.sha256, `active dispatch dependency changed: ${d.source}`); return deps; }
