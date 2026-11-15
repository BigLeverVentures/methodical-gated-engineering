import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { confirmClaudeBackgroundCompletion, inspectDispatch } from '../packages/methodical-core/src/dispatch.js';

const maxTail = 2 * 1024 * 1024;
const sessionPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hostIdentifier = /^[a-zA-Z0-9_-]{1,128}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const notificationHeader = /^<task-notification>\n<task-id>([a-zA-Z0-9_-]{1,128})<\/task-id>\n<tool-use-id>([a-zA-Z0-9_-]{1,128})<\/tool-use-id>\n<output-file>[^\r\n<>]*<\/output-file>\n<status>([a-z_-]{1,32})<\/status>\n/;

export function backgroundCompletionNotices(tail: string, sessionId: string, root: string, busy: ReadonlySet<string> = new Set()) {
    const latest = new Map<string, {sessionId: string; childId: string; toolUseId: string; runId: string; at: string; status: string}>();
    for (const line of tail.split('\n')) {
        // The task result text and model prose never count as host completion evidence.
        if (!line.includes('queued_command'))
            continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        const notice = row?.attachment;
        if (row?.type !== 'attachment' || row.sessionId !== sessionId || row.cwd !== root || row.isSidechain !== false ||
            notice?.type !== 'queued_command' || notice.commandMode !== 'task-notification' ||
            notice.origin?.kind !== 'task-notification' || notice.origin.producer !== 'session-task' ||
            typeof notice.delivery_id !== 'string' || !sessionPattern.test(notice.delivery_id) ||
            typeof notice.runId !== 'string' || !hostIdentifier.test(notice.runId) ||
            typeof notice.timestamp !== 'string' || !timestampPattern.test(notice.timestamp) || typeof notice.prompt !== 'string')
            continue;
        const match = notificationHeader.exec(notice.prompt);
        if (!match)
            continue;
        const [, childId, toolUseId, status] = match;
        if (!childId || !toolUseId || !status || busy.has(childId))
            continue;
        const key = JSON.stringify([childId, toolUseId]);
        const previous = latest.get(key);
        if (!previous || previous.at <= notice.timestamp)
            latest.set(key, {sessionId, childId, toolUseId, status, runId: notice.runId, at: notice.timestamp});
    }
    return [...latest.values()].flatMap(({status, ...notice}) => status === 'completed' ? [notice] : []);
}

function transcriptTail(filename: string, sessionId: string): string {
    const projects = path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
    if (!sessionPattern.test(sessionId) || !path.isAbsolute(filename) || path.basename(filename) !== sessionId + '.jsonl')
        return '';
    try {
        const parent = fs.realpathSync(path.dirname(filename));
        if (path.dirname(parent) !== fs.realpathSync(projects))
            return '';
        const fd = fs.openSync(path.join(parent, path.basename(filename)),
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile() || stat.uid !== process.getuid?.())
                return '';
            const start = Math.max(0, stat.size - maxTail);
            const bytes = Buffer.alloc(stat.size - start);
            const length = fs.readSync(fd, bytes, 0, bytes.length, start);
            const tail = bytes.toString('utf8', 0, length);
            const end = tail.lastIndexOf('\n');
            return tail.slice(start ? tail.indexOf('\n') + 1 : 0, Math.max(0, end));
        } finally {
            fs.closeSync(fd);
        }
    } catch {
        // Missing, rotated or unsupported native records leave the stop unresolved.
        return '';
    }
}

export async function reconcileClaudeBackground(root: string, event: Record<string, unknown>) {
    const {session_id: sessionId, transcript_path: transcriptPath, background_tasks: tasks} = event;
    if (typeof sessionId !== 'string' || typeof transcriptPath !== 'string' || !Array.isArray(tasks))
        return;
    const pending = inspectDispatch(root).intents.some(intent => intent.reservation?.background &&
        intent.reservation.sessionId === sessionId && intent.completion?.source === 'native-stop' &&
        intent.completion.outcome === 'unknown');
    if (!pending)
        return;
    const busy = new Set<string>();
    for (const task of tasks) {
        if (typeof task?.id !== 'string')
            return;
        busy.add(task.id);
    }
    const notices = backgroundCompletionNotices(transcriptTail(transcriptPath, sessionId), sessionId, root, busy);
    await confirmClaudeBackgroundCompletion(root, notices);
}
