import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assert, digest, hash, host, integer, object, strings, text, type Host } from './contracts.js';
import { readDispatchApproval, withDispatchSnapshot, writeDispatchRecord, type Intent } from './dispatch.js';
import { candidateIdentity, safeFile } from './project.js';

type Task = { id: string; operations: string[]; dependsOn: string[]; writePaths?: string[]; allocation?: 'routine' | 'demanding' };
type Policy = { unitId: string; parallelism: number; quietMs: number; reportMs: number; claimMs: number; tasks: Task[] };
type Claim = { intentId: string; expiresAt: number; base: string; inputs: InputArtifact[] };
type InputArtifact = { taskId: string; intentId: string; path: string; sha256: string };
type Progress = { intentId: string; at: number; ref: string };
type Recovery = { intentId: string; since: number; action: 'check-worker' | 'reconcile' | 'replace' | 'prepare-replacement' | 'blocked' | 'accept-output' };
type Work = {
    id: string;
    claim: Claim | null;
    observedAt: number | null;
    progress: Progress | null;
    progressRefs: string[];
    recovery: Recovery | null;
    stalledPatchRef?: string;
    accepted: InputArtifact | null;
};
type Coordinator = {host: Host; sessionId: string; launch?: 'codex-hook'};
export type CodexHookClaim = {sessionId: string; expiresAt: number};
type State = { version: 1; coordinator?: Coordinator; stopNotice?: { key: string; delivered: number }; policy: Policy; base: string; checkedAt: number; reportAt: number; work: Work[]; retiredUnits: string[] };
const file = '.methodical/worker-guard.json';
const maxBytes = 1024 * 1024;

export function workerGuardPolicy(value: unknown): Policy {
    const raw = object(value);
    const parallelism = integer(raw.parallelism), quietMs = integer(raw.quietMs),
        reportMs = integer(raw.reportMs), claimMs = integer(raw.claimMs);
    assert(parallelism >= 1 && parallelism <= 32, 'invalid worker capacity');
    for (const interval of [quietMs, reportMs, claimMs])
        assert(interval >= 1 && interval <= 86_400_000, 'invalid worker guard interval');
    assert(Array.isArray(raw.tasks) && raw.tasks.length >= 1 && raw.tasks.length <= 128, 'invalid work list');
    const tasks: Task[] = raw.tasks.map(value => {
        const task = object(value);
        const allocation = task.allocation;
        assert(allocation === undefined || allocation === 'routine' || allocation === 'demanding',
            'invalid worker allocation');
        const writePaths = task.writePaths === undefined ? undefined : strings(task.writePaths, 128);
        if (writePaths) {
            assert(writePaths.length > 0 && new Set(writePaths).size === writePaths.length &&
                writePaths.every(name => name.length <= 1024 && !/[\x00-\x1f\x7f\\]/.test(name) &&
                    name.split('/').every(part => part && part !== '.' && part !== '..' &&
                        !['.git', '.methodical'].includes(part.toLowerCase()))),
                'expected distinct repo-relative worker write paths');
        }
        return { id: text(task.id), operations: strings(task.operations, 8), dependsOn: strings(task.dependsOn, 128),
            ...(writePaths ? {writePaths} : {}), ...(allocation ? {allocation} : {}) };
    });
    const scoped = tasks.some(task => task.writePaths);
    assert(!scoped || tasks.every(task => task.writePaths), 'provide write paths for every guarded task');
    const byId = new Map(tasks.map(task => [task.id, task]));
    const operations = tasks.flatMap(task => task.operations);
    assert(byId.size === tasks.length && new Set(operations).size === operations.length, 'duplicate task or operation');
    const ancestors = new Map<string, Set<string>>(), visiting = new Set<string>();
    function visit(task: Task): void {
        if (ancestors.has(task.id))
            return;
        assert(!visiting.has(task.id), 'cyclic work dependencies');
        visiting.add(task.id);
        assert(task.operations.length && new Set(task.dependsOn).size === task.dependsOn.length, 'invalid work item');
        const prior = new Set(task.dependsOn);
        for (const id of task.dependsOn) {
            const predecessor = byId.get(id);
            assert(predecessor, 'unknown work dependency');
            visit(predecessor);
            for (const upstream of ancestors.get(id)!)
                prior.add(upstream);
        }
        visiting.delete(task.id);
        ancestors.set(task.id, prior);
    }
    tasks.forEach(visit);
    if (scoped) {
        const owners = new Map<string, Set<string>>();
        for (const task of tasks) {
            for (const file of task.writePaths!) {
                const key = file.normalize('NFC').toLowerCase();
                const ids = owners.get(key) ?? new Set<string>();
                ids.add(task.id);
                owners.set(key, ids);
            }
        }
        for (const [file, ids] of owners) {
            let prefix = file;
            while (prefix) {
                for (const peer of owners.get(prefix) ?? []) {
                    for (const id of ids)
                        assert(id === peer || ancestors.get(id)!.has(peer) || ancestors.get(peer)!.has(id),
                            `shared write paths require a dependency between ${peer} and ${id}`);
                }
                const slash = prefix.lastIndexOf('/');
                prefix = slash === -1 ? '' : prefix.slice(0, slash);
            }
        }
    }
    return { unitId: text(raw.unitId), parallelism, quietMs, reportMs, claimMs, tasks };
}

function load(root: string): State | null {
    const filename = safeFile(root, file, true);
    if (!fs.existsSync(filename))
        return null;
    const stat = fs.lstatSync(filename);
    assert(stat.isFile() && stat.size <= maxBytes, 'expected bounded worker guard record');
    const record = object(JSON.parse(fs.readFileSync(filename, 'utf8')));
    const state = object(record.state) as unknown as State;
    assert(state.version === 1 && record.checksum === digest(JSON.stringify(state)), 'worker guard state checksum mismatch');
    return state;
}

/** Called under the native reservation lock. An expired claim cannot acquire someone else's slot. */
export function assertWorkerReservation(root: string, intent: Intent, configured: unknown, now: number, hookClaim?: CodexHookClaim): void {
    assert(!hookClaim || configured !== undefined, 'native launch needs an approved worker guard');
    if (configured === undefined)
        return;
    const approval = workerGuardPolicy(configured);
    assert(approval.unitId === intent.binding.unitId, 'guard policy belongs to a different unit');
    const task = approval.tasks.find(task => task.operations.includes(intent.input.operationId));
    assert(!hookClaim || task, 'native launch needs an approved worker task');
    if (!task)
        return;
    assert(intent.input.role === 'worker', 'guarded implementation requires the worker role');
    assert(!task.allocation || intent.input.task === task.allocation, 'dispatch does not match approved worker allocation');
    const state = load(root);
    assert(state && JSON.stringify(state.policy) === JSON.stringify(approval), 'worker dispatch needs a current guard claim');
    const work = state.work.find(work => work.id === task.id);
    assert(work?.claim?.intentId === intent.id && work.claim.expiresAt > now && !work.accepted,
        'worker dispatch needs a current guard claim');
    if (hookClaim)
        assert(state.coordinator?.host === 'codex' && state.coordinator.launch === 'codex-hook' &&
            state.coordinator.sessionId === hookClaim.sessionId && work.claim.expiresAt === hookClaim.expiresAt,
            'native launch needs the current coordinator claim');
    for (const artifact of work.claim.inputs)
        verifyArtifact(root, artifact);
}

function values(raw: unknown): unknown[] {
    if (raw === undefined)
        return [];
    assert(Array.isArray(raw) && raw.length <= 128, 'invalid worker evidence list');
    return raw;
}

function acceptProgress(work: Work, intent: Intent, event: Record<string, unknown>, now: number): void {
    const at = integer(event.at), ref = hash(event.ref);
    assert(at <= now, 'future worker progress');
    const reservation = intent.reservation;
    const identity = reservation?.transport?.runId ?? reservation?.childId;
    assert(intent.status === 'reserved' && identity && text(event.workerId) === identity &&
        text(event.sessionId) === reservation?.sessionId, 'uncorrelated worker progress');
    if (at < (work.observedAt ?? 0))
        return;
    if (work.progressRefs.includes(ref))
        return;
    assert(work.progressRefs.length < 1024, 'worker progress evidence exceeds attempt bound');
    work.progressRefs.push(ref);
    if (!work.progress || at > work.progress.at)
        work.progress = {intentId: intent.id, at, ref};
}

function verifyArtifact(root: string, artifact: InputArtifact, writePaths?: string[]): void {
    const {bytes} = readPatch(root, artifact.path);
    assert(digest(bytes) === artifact.sha256, 'staged worker patch changed');
    if (!writePaths)
        return;
    // Check both directions so renames and copies cannot hide an additional path.
    const allowed = new Set(writePaths);
    const patchPaths = (reverse: boolean) => {
        const output = execFileSync('git', ['-C', root, 'apply', '--numstat', '-z', ...(reverse ? ['--reverse'] : [])],
            {input: bytes, maxBuffer: maxBytes, timeout: 5000});
        const result = new TextDecoder('utf-8', {fatal: true}).decode(output);
        assert(result.endsWith('\0'), 'expected a patch with changed paths');
        for (const row of result.slice(0, -1).split('\0')) {
            const path = /^(?:[0-9]+|-)\t(?:[0-9]+|-)\t([^\x00-\x1f\x7f]+)$/.exec(row)?.[1];
            assert(path && allowed.has(path), 'staged worker patch changes an unapproved path');
        }
    };
    patchPaths(false);
    patchPaths(true);
}

function acceptEvidence(root: string, state: State, intents: Map<string, Intent>, input: Record<string, unknown>, now: number): void {
    const assigned = new Map(state.work.flatMap(work => work.claim ? [[work.claim.intentId, work] as const] : []));
    for (const raw of values(input.progress)) {
        const event = object(raw), id = text(event.intentId), work = assigned.get(id), intent = intents.get(id);
        assert(work && intent && !work.accepted, 'progress must match a current worker claim');
        acceptProgress(work, intent, event, now);
    }
    for (const raw of values(input.accepted)) {
        const event = object(raw), id = text(event.intentId), work = assigned.get(id), intent = intents.get(id);
        assert(work?.claim && intent?.status === 'completed' && intent.completion?.terminal === true &&
            intent.completion.outcome === 'completed', 'acceptance requires correlated successful completion');
        assert(hash(event.base) === work.claim.base && JSON.stringify(event.inputs) === JSON.stringify(work.claim.inputs),
            'accepted artifact does not match the claimed inputs');
        const artifact = {taskId: work.id, intentId: id, path: `.methodical/worker-output/${id}.patch`, sha256: hash(event.sha256)};
        verifyArtifact(root, artifact, state.policy.tasks.find(task => task.id === work.id)?.writePaths);
        assert(!work.accepted || work.accepted.sha256 === artifact.sha256, 'accepted artifact changed');
        work.accepted = artifact;
    }
}

function pending(work: Work, intent: Intent, action: Recovery['action'], now: number): void {
    if (work.recovery?.intentId !== intent.id || work.recovery.action !== action)
        work.recovery = {intentId: intent.id, action, since: now};
}

function retryableTerminal(intent: Intent): boolean {
    return intent.status === 'completed' && intent.completion?.terminal === true &&
        ['failed', 'partial'].includes(String(intent.completion.outcome));
}

function syncWork(root: string, work: Work, intent: Intent, now: number, quietMs: number): void {
    if (intent.status === 'reserved') {
        work.observedAt ??= now;
        const progress = work.progress?.intentId === intent.id ? work.progress.at : null;
        // Even a reservation can precede a failed launch. Require correlated progress.
        if (work.recovery && progress !== null && progress > work.recovery.since &&
            (work.recovery.action === 'check-worker' || work.recovery.intentId !== intent.id))
            work.recovery = null;
        const last = Math.max(work.observedAt, progress ?? 0);
        if (now - last >= quietMs) {
            if (work.recovery?.intentId !== intent.id || work.recovery.action !== 'check-worker') {
                delete work.stalledPatchRef;
                try {
                    const patch = workerPatch(root, intent.id);
                    work.stalledPatchRef = patch.ref;
                } catch {
                    // A missing or invalid artifact does not prevent a stall check.
                }
            }
            pending(work, intent, 'check-worker', now);
        }
    } else if (intent.status === 'dispatch-unknown' ||
        (intent.status === 'completed' && !['completed', 'failed', 'partial'].includes(String(intent.completion?.outcome)))) {
        pending(work, intent, 'reconcile', now);
    } else if (intent.status === 'cancelled') {
        // Only unreserved intents can be cancelled. Recovery for an earlier attempt stays owed.
        work.claim = null;
    } else if (intent.status === 'completed' && !retryableTerminal(intent)) {
        if (work.accepted)
            work.recovery = null;
        else
            pending(work, intent, 'accept-output', now);
    }
}

function occupiesSlot(work: Work, intent: Intent, now: number): boolean {
    return intent.status === 'reserved' || intent.status === 'dispatch-unknown' ||
        (intent.status === 'prepared' && work.claim!.expiresAt > now);
}

function dependencyInputs(task: Task, tasks: Map<string, Task>, works: Map<string, Work>): InputArtifact[] | null {
    const inputs = new Map<string, InputArtifact>();
    function collect(id: string): boolean {
        if (inputs.has(id))
            return true;
        const artifact = works.get(id)!.accepted;
        if (!artifact || !tasks.get(id)!.dependsOn.every(collect))
            return false;
        inputs.set(id, artifact);
        return true;
    }
    return task.dependsOn.every(collect) ? [...inputs.values()] : null;
}

function nextWorker(task: Task, lanes: Intent[], base: string) {
    const spent = lanes.filter(intent => intent.reservation);
    const operation = task.operations.find(operation => !spent.some(intent => intent.input.operationId === operation));
    const attempts = lanes[0]?.input.profile.limits.attempts;
    if (!operation || (attempts !== undefined && spent.length >= attempts))
        return {intent: null, blocker: 'approved attempts exhausted'};
    const intent = lanes.find(intent => intent.input.operationId === operation && intent.status === 'prepared' &&
        intent.decision.action === 'model' && intent.candidate === base &&
        (!task.allocation || intent.input.task === task.allocation)) ?? null;
    return {intent, blocker: intent ? null : 'no eligible prepared dispatch'};
}

export function checkWorkers(root: string, raw: unknown, clock?: number, schedule = true) {
    const input = object(raw);
    return withDispatchSnapshot(root, (actual, dispatch) => {
        const now = integer(clock ?? Date.now());
        const stored = load(actual);
        const config = input.configure === undefined ? stored?.policy : workerGuardPolicy(input.configure);
        const replacingUnit = stored && config?.unitId !== stored.policy.unitId;
        assert(!replacingUnit || stored.work.every(work => work.accepted), 'previous worker guard unit is unresolved');
        const existing = replacingUnit ? null : stored;
        const retired = stored?.retiredUnits ?? [];
        assert(config, 'worker guard needs a configured unit');
        assert(!retired.includes(config.unitId), 'worker guard unit already settled');
        assert(!existing || JSON.stringify(config) === JSON.stringify(existing.policy), 'worker guard configuration changed');
        const base = candidateIdentity(actual);
        const state: State = existing ?? {version: 1, policy: config, base, checkedAt: now, reportAt: 0,
            work: config.tasks.map(task => ({id: task.id, claim: null, observedAt: null, progress: null, progressRefs: [], recovery: null, accepted: null})),
            retiredUnits: replacingUnit ? [...retired, stored.policy.unitId] : retired};
        const before = JSON.stringify(state);
        if (input.coordinator !== undefined) {
            const rawCoordinator = object(input.coordinator);
            const ownerHost = host(rawCoordinator.host);
            assert(rawCoordinator.launch === undefined || (ownerHost === 'codex' && rawCoordinator.launch === 'codex-hook'),
                'invalid coordinator launch mode');
            const coordinator: Coordinator = {host: ownerHost, sessionId: text(rawCoordinator.sessionId),
                ...(rawCoordinator.launch === 'codex-hook' ? {launch: rawCoordinator.launch} : {})};
            assert(!state.coordinator || JSON.stringify(state.coordinator) === JSON.stringify(coordinator),
                'worker guard already has a coordinator');
            state.coordinator = coordinator;
        }
        assert(base === state.base, 'worker guard candidate changed');
        assert(now >= state.checkedAt && now <= Number.MAX_SAFE_INTEGER - 86_400_000, 'worker guard clock out of range');
        const operations = new Set(config.tasks.flatMap(task => task.operations));
        const intents = new Map(dispatch.intents.filter(intent => intent.binding.unitId === config.unitId &&
            intent.input.role === 'worker' && operations.has(intent.input.operationId)).map(intent => [intent.id, intent]));
        const anchor = [...intents.values()].find(intent => intent.status !== 'cancelled');
        assert(anchor, 'prepare an approved worker before checking the guard');
        const approval = readDispatchApproval(actual, anchor.binding);
        assert(JSON.stringify(workerGuardPolicy(approval.workerGuard)) === JSON.stringify(config),
            'worker guard policy differs from approved configuration');
        const allowed = strings(approval.allowedOperations);
        assert([...operations].every(id => allowed.includes(id)), 'guard includes an unapproved operation');
        const wasPending = new Map(state.work.map(work => [work.id, work.recovery]));
        acceptEvidence(actual, state, intents, input, now);
        const works = new Map(state.work.map(work => [work.id, work]));
        const tasks = new Map(config.tasks.map(task => [task.id, task]));
        const lanes = new Map(config.tasks.map(task => [task.id, [...intents.values()].filter(intent =>
            task.operations.includes(intent.input.operationId))]));
        let occupied = 0;
        let remainingRequests = anchor.input.profile.limits.requests - dispatch.intents.filter(intent =>
            intent.binding.unitId === config.unitId && intent.reservation).length;
        for (const work of state.work) {
            const claimed = work.claim && intents.get(work.claim.intentId);
            assert(!work.claim || claimed, 'missing claimed dispatch evidence');
            assert(!lanes.get(work.id)!.some(intent => intent.id !== claimed?.id &&
                (intent.status === 'reserved' || intent.status === 'dispatch-unknown')),
            'worker dispatch has no matching guard claim');
            if (claimed) {
                syncWork(actual, work, claimed, now, config.quietMs);
                if (work.claim && occupiesSlot(work, claimed, now)) {
                    if (claimed.status === 'prepared' && remainingRequests <= 0) {
                        // An independent same-unit review may have spent the last request meanwhile.
                        work.claim = null;
                        if (work.recovery)
                            pending(work, intents.get(work.recovery.intentId)!, 'blocked', now);
                    } else {
                        occupied++;
                        if (claimed.status === 'prepared')
                            remainingRequests--;
                    }
                }
            }
        }
        const claims: {taskId: string; claim: Claim}[] = [];
        const blocked = new Map<string, string>();
        for (const task of config.tasks) {
            const work = works.get(task.id)!, previous = work.claim && intents.get(work.claim.intentId);
            if (work.accepted || (previous && occupiesSlot(work, previous, now)))
                continue;
            if (previous && previous.status !== 'prepared' && !retryableTerminal(previous))
                continue;
            const inputs = dependencyInputs(task, tasks, works);
            if (!inputs)
                continue;
            const next = nextWorker(task, lanes.get(task.id)!, state.base);
            const blocker = remainingRequests <= 0 ? 'unit request budget unavailable' : next.blocker;
            if (previous && retryableTerminal(previous)) {
                const action = blocker === null ? 'replace' : blocker === 'no eligible prepared dispatch' ? 'prepare-replacement' : 'blocked';
                pending(work, previous, action, now);
            }
            if (blocker) {
                blocked.set(task.id, blocker);
                continue;
            }
            assert(next.intent, 'missing eligible dispatch');
            if (occupied >= config.parallelism) {
                blocked.set(task.id, 'worker capacity in use');
                continue;
            }
            const intent = previous?.status === 'prepared' ? previous : next.intent;
            try {
                for (const artifact of inputs)
                    verifyArtifact(actual, artifact);
            } catch (error) {
                blocked.set(task.id, error instanceof Error ? error.message : 'invalid worker input');
                continue;
            }
            const claim = {intentId: intent.id, base: state.base, inputs, expiresAt: now + config.claimMs};
            if (schedule) {
                work.claim = claim;
                work.observedAt = null;
                if (previous?.id !== claim.intentId)
                    work.progressRefs = [];
                work.progress = null;
            }
            claims.push({taskId: task.id, claim});
            occupied++;
            remainingRequests--;
        }
        const recovery = state.work.flatMap(work => work.recovery ? [{taskId: work.id, ...work.recovery}] : []);
        const status = config.tasks.map(task => {
            const work = works.get(task.id)!, intent = work.claim && intents.get(work.claim.intentId);
            const last = Math.max(work.observedAt ?? now, work.progress?.at ?? 0);
            const nextCheckAt = intent?.status === 'reserved'
                ? last + (Math.floor((now - last) / config.quietMs) + 1) * config.quietMs
                : intent?.status === 'prepared' && work.claim!.expiresAt > now ? work.claim!.expiresAt : null;
            return {taskId: task.id, intentId: intent?.id ?? null, host: intent?.host ?? null,
                state: work.accepted ? 'accepted' : work.recovery?.action === 'blocked' ? 'blocked' : intent?.status ?? 'waiting',
                configured: intent?.decision.setting ?? null, reason: intent?.decision.reason ?? null,
                lastProgress: work.progress?.at ?? null, outcome: intent?.completion?.outcome ?? null,
                waitingFor: task.dependsOn.filter(id => !works.get(id)!.accepted),
                blocker: blocked.get(task.id) ?? null, nextCheckAt,
                recovery: work.recovery};
        });
        const reportDue = !existing || now >= state.reportAt;
        const newRecovery = recovery.filter(item => {
            const before = wasPending.get(item.taskId);
            return before?.intentId !== item.intentId || before.action !== item.action;
        });
        if (reportDue && schedule)
            state.reportAt = now + config.reportMs;
        state.checkedAt = now;
        if (!existing || before !== JSON.stringify(state)) {
            const record = {state, checksum: digest(JSON.stringify(state))};
            assert(Buffer.byteLength(JSON.stringify(record) + '\n') <= maxBytes, 'worker guard record exceeds capture bound');
            writeDispatchRecord(actual, 'worker-guard.json', record);
        }
        const nextReportAt = state.work.every(work => work.accepted) ? null : state.reportAt;
        const due = [nextReportAt, ...status.map(item => item.nextCheckAt)].filter(at => at !== null);
        return {reportDue, nextReportAt, nextCheckAt: due.length ? Math.min(...due) : null,
            occupied, claims, recovery, newRecovery, status};
    });
}

/** The parent session owns Stop continuation. Worker sessions never drive it. */
export function guardCoordinator(root: string): Coordinator | undefined {
    const state = load(root);
    return state?.work.every(work => work.accepted) ? undefined : state?.coordinator;
}

/** Coalesce unchanged notices and bound attempts to continue one turn. */
export function recordWorkerStopNotice(root: string, owner: Coordinator, key: string, continued: boolean): number {
    return withDispatchSnapshot(root, actual => {
        const state = load(actual);
        if (!state?.coordinator || state.coordinator.host !== owner.host || state.coordinator.sessionId !== owner.sessionId)
            return 0;
        const last = state.stopNotice;
        const delivered = continued && last?.key === key ? last.delivered + 1 : 1;
        if (delivered <= 4) {
            state.stopNotice = {key, delivered};
            writeDispatchRecord(actual, 'worker-guard.json', {state, checksum: digest(JSON.stringify(state))});
        }
        return delivered;
    });
}

function workerPatch(root: string, id: string) {
    const {bytes, at} = readPatch(root, `.methodical/worker-output/${id}.patch`);
    return {at, ref: digest(bytes)};
}

function readPatch(root: string, relative: string) {
    const name = safeFile(root, relative);
    const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const stat = fs.fstatSync(fd);
        assert(stat.isFile() && stat.size > 0 && stat.size <= maxBytes, 'expected bounded staged worker patch');
        const bytes = Buffer.alloc(stat.size + 1);
        const length = fs.readSync(fd, bytes);
        const after = fs.fstatSync(fd);
        assert(length === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs,
            'staged worker patch changed while reading');
        return {at: Math.floor(stat.mtimeMs), bytes: bytes.subarray(0, length)};
    } finally {
        fs.closeSync(fd);
    }
}

/** Record a worker's explicitly staged patch as progress, without consuming a ready slot. */
export function recordWorkerPatchProgress(root: string, id: string) {
    assert(/^[a-f0-9-]{36}$/.test(id), 'invalid worker intent ID');
    const observation = withDispatchSnapshot(root, (actual, state) => {
        const intent = state.intents.find(item => item.id === id);
        const reservation = intent?.reservation;
        const workerId = reservation?.transport?.runId ?? reservation?.childId;
        assert(intent?.status === 'reserved' && reservation && workerId, 'worker launch has no correlation');
        const patch = workerPatch(actual, id);
        const work = load(actual)?.work.find(item => item.claim?.intentId === id);
        assert(work?.recovery?.action !== 'check-worker' || patch.ref !== work.stalledPatchRef,
            'staged worker patch has not changed since the stall');
        return {intentId: id, sessionId: reservation.sessionId, workerId, ...patch};
    });
    return checkWorkers(root, {progress: [observation]}, undefined, false);
}
