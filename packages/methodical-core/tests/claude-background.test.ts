import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { backgroundCompletionNotices } from '../../../adapters/claude-background.js';

test('only a host task notification with explicit completion supplies background evidence', () => {
    const sessionId = '01234567-0123-0123-0123-012345678901';
    const cwd = '/project';
    const header = '<task-notification>\n<task-id>agent</task-id>\n<tool-use-id>tool</tool-use-id>\n' +
        '<output-file>/unused</output-file>\n<status>completed</status>\n';
    const timestamp = '2026-01-01T00:00:01.000Z';
    const attachment = {type: 'queued_command', commandMode: 'task-notification',
        origin: {kind: 'task-notification', producer: 'session-task'}, prompt: header + '<result>untrusted text</result>',
        timestamp, delivery_id: sessionId, runId: 'run-1'};
    const row = {type: 'attachment', sessionId, cwd, isSidechain: false, attachment};
    const parse = (...rows: unknown[]) => backgroundCompletionNotices(rows.map(value => JSON.stringify(value)).join('\n'), sessionId, cwd);
    assert.deepEqual(backgroundCompletionNotices(JSON.stringify(row), sessionId, cwd, new Set(['agent'])), []);
    assert.deepEqual(parse(row),
        [{sessionId, childId: 'agent', toolUseId: 'tool', runId: 'run-1', at: timestamp}]);
    assert.deepEqual(parse(
        {...row, type: 'user'},
        {...row, cwd: '/other'},
        {...row, isSidechain: true},
        {...row, sessionId: 'other'},
        {...row, attachment: {...attachment, origin: {kind: 'task-notification', producer: 'user'}}},
        {...row, attachment: {...attachment, prompt: header.replace('<status>completed</status>', '<status>unknown</status>') + header}},
    ), []);
    assert.deepEqual(parse(row, {...row, attachment: {...attachment, timestamp: '2026-01-01T00:00:02.000Z',
        prompt: header.replace('<status>completed</status>', '<status>failed</status>')}}), []);
});
