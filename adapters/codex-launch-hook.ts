import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { retryDispatchLock } from '../packages/methodical-core/src/dispatch.js';
import { safeFile } from '../packages/methodical-core/src/project.js';
import { checkWorkers, guardCoordinator } from '../packages/methodical-core/src/worker-guard.js';

const cli = fileURLToPath(new URL('../packages/methodical-core/src/cli.js', import.meta.url));

function failedLaunch(log: string): boolean {
    const fd = fs.openSync(log, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size === 0 || stat.size > 8192)
            return false;
        const bytes = Buffer.alloc(stat.size);
        const count = fs.readSync(fd, bytes);
        try {
            return JSON.parse(bytes.toString('utf8', 0, count))?.status === 'launcher-error';
        } catch {
            return false; // The wrapper may still be writing its result.
        }
    } finally {
        fs.closeSync(fd);
    }
}

/** A trusted parent hook hands issued claims to independent managed workers. */
export async function startCodexClaimedWorkers(root: string, event: Record<string, unknown>): Promise<{started: string[]; failedLogs: string[]}> {
    const owner = guardCoordinator(root);
    if (owner?.host !== 'codex' || owner.launch !== 'codex-hook' || owner.sessionId !== event.session_id || event.permission_mode === 'plan')
        return {started: [], failedLogs: []};
    const check = await retryDispatchLock(() => checkWorkers(root, {}, undefined, false));
    const ready = check.status.filter(item => item.host === 'codex' && item.state === 'prepared' &&
        item.nextCheckAt !== null && item.intentId !== null);
    const attempts = await Promise.all(ready.map(async item => {
        const id = item.intentId!;
        const relative = `.methodical/codex-launch/${id}-${item.nextCheckAt}.log`;
        fs.mkdirSync(safeFile(root, '.methodical/codex-launch', true), {mode: 0o700, recursive: true});
        const log = safeFile(root, relative, true);
        let fd: number;
        try {
            fd = fs.openSync(log, 'wx', 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                return failedLaunch(log) ? {failed: relative} : {};
            throw error;
        }
        try {
            const worker = spawn(process.execPath, [cli, 'dispatch-codex-hook-worker', root, id,
                owner.sessionId, String(item.nextCheckAt)], {cwd: root, detached: true, stdio: ['ignore', fd, fd]});
            await new Promise<void>((resolve, reject) => {
                worker.once('spawn', resolve);
                worker.once('error', reject);
            });
            worker.unref();
            return {started: id};
        } catch (error) {
            fs.unlinkSync(log);
            throw error;
        } finally {
            fs.closeSync(fd);
        }
    }));
    return {
        started: attempts.flatMap(attempt => attempt.started ? [attempt.started] : []),
        failedLogs: attempts.flatMap(attempt => attempt.failed ? [attempt.failed] : []),
    };
}
