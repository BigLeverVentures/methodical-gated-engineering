import { setTimeout as delay } from 'node:timers/promises';
import { digest, type Host } from '../packages/methodical-core/src/contracts.js';
import { retryDispatchLock } from '../packages/methodical-core/src/dispatch.js';
import { checkWorkers, guardCoordinator, recordWorkerStopNotice } from '../packages/methodical-core/src/worker-guard.js';

const stopWaitMs = 4_000;
type Timing = {now: () => number; wait: (ms: number) => Promise<unknown>};

/** Stop keeps an existing turn available while owned work is active. */
export async function workerGuardStop(platform: Host, event: Record<string, unknown>, root: string, timing?: Timing) {
    const owner = guardCoordinator(root);
    if (!owner || owner.host !== platform || owner.sessionId !== event.session_id)
        return {};
    const inspect = () => retryDispatchLock(() => checkWorkers(root, {}, timing?.now(), false));
    let check = await inspect();
    const nextWorkerCheck = () => Math.min(...check.status.flatMap(item =>
        item.state === 'reserved' && item.recovery?.action !== 'check-worker' && item.nextCheckAt !== null ? [item.nextCheckAt] : []));
    const needsAction = () => check.recovery.length > 0 || check.claims.length > 0 ||
        check.status.some(item => item.blocker !== null && item.blocker !== 'worker capacity in use') ||
        check.status.some(item => item.state === 'prepared' && item.nextCheckAt !== null);
    const waitForWorker = (next: number) => (timing?.wait ?? delay)(
        Math.min(stopWaitMs, Math.max(100, next - (timing?.now() ?? Date.now()))));
    let waited = false;
    if (!needsAction() && Number.isFinite(nextWorkerCheck())) {
        await waitForWorker(nextWorkerCheck());
        check = await inspect();
        waited = true;
    }

    if (needsAction()) {
        const key = digest(JSON.stringify({
            status: check.status.map(item => [item.taskId, item.intentId, item.state, item.lastProgress, item.recovery, item.blocker]),
            ready: check.claims.map(item => [item.taskId, item.claim.intentId]),
        }));
        const attempt = await retryDispatchLock(() => recordWorkerStopNotice(root, owner, key, event.stop_hook_active === true));
        if (attempt >= 1 && attempt <= 4) {
            const report = check.status.slice(0, 32).map(item =>
                `${JSON.stringify(item.taskId).slice(0, 96)} ${item.state}${item.recovery ? ` (${item.recovery.action})` : ''}${item.blocker ? ` (${item.blocker})` : ''}`).join(', ');
            const reason = `Methodical worker guard: ${report}. ` +
                'Run worker-guard with an empty JSON object to get current claims and recovery. Dispatch ready work within its approved scope. ' +
                'Check stalled workers and take the recorded action. Report any blocked task with its reason. A status response alone does not clear recovery. ' +
                'Use correlated worker progress or completed output to verify the result.';
            const finalNotice = ' If recovery remains unresolved, report the exact blocker and leave it pending.';
            return {decision: 'block', reason: attempt === 4 ? reason + finalNotice : reason};
        }
    }
    const next = nextWorkerCheck();
    if (!Number.isFinite(next))
        return {};
    if (!waited)
        await waitForWorker(next);
    return {decision: 'block', reason: 'Methodical still has workers running before their next due check. ' +
        'Use the host wait tool or wait briefly, then run worker-guard with an empty JSON object and dispatch independent ready work.'};
}
