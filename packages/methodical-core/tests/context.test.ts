import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { contextStatus, tokenCount } from '../src/context-policy.js';
import { codexContextStatus, observeCodexRollout, recordCodexContext } from '../../../adapters/codex-context.js';

const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const high = 'model-large', low = 'model-small';
const rollout = (type: string, payload: object = {}) => ({type, payload});
const event = (type: string, fields: object = {}) => rollout('event_msg', {type, ...fields});
const meta = (session = id) => rollout('session_meta', {id: session});
const start = (turn_id: string, model_context_window?: number) => event('task_started', {turn_id, model_context_window});
const context = (turn_id: string, model: string) => rollout('turn_context', {turn_id, model});
const tokens = (window: number, input: number, occupied: number, cumulative = occupied) => event('token_count', {info: {
    model_context_window: window, last_usage_includes_reasoning: true,
    last_token_usage: {input_tokens: input, total_tokens: occupied}, total_token_usage: {total_tokens: cumulative},
}});
type Native = { session_id: string; turn_id: string; model: string; transcript_path: string };
const first = [meta(), start('first', 1_000_000), context('first', high), tokens(1_000_000, 33_000, 34_000)];

function fixture(t: {after(fn: () => void): void}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'methodical-context-test-'));
    t.after(() => fs.rmSync(home, {recursive: true, force: true}));
    const dir = path.join(home, 'sessions', '2026', '11', '01');
    fs.mkdirSync(dir, {recursive: true});
    const transcript_path = path.join(dir, `rollout-fixture-${id}.jsonl`);
    const native: Native = {session_id: id, turn_id: 'first', model: high, transcript_path};
    const write = (...records: unknown[]) => fs.writeFileSync(transcript_path, records.map(row => JSON.stringify(row)).join('\n') + '\n');
    const read = (overrides: Partial<Native> = {}, baseline: string | null = 'first', compact = false) =>
        observeCodexRollout({...native, ...overrides}, baseline, home, compact);
    return {home, transcript_path, write, read, native};
}

test('context policy has one inclusive cutoff and clamps runway without clipping the observation', () => {
    for (const [window, eligible] of [[699_999, false], [700_000, true], [1_000_000, true]] as const) {
        const status = contextStatus({window, occupied: window + 1, source: 'fixture', model: high}, null);
        assert.equal(status.eligible, eligible);
        assert.equal(status.occupied, window + 1);
        assert.equal(status.runway, 0);
        assert.equal(status.initialRunway, null);
    }
    assert.equal(contextStatus(null, null).eligible, null);
    for (const invalid of [-1, 21.5, NaN, Infinity, '700000', undefined]) assert.equal(tokenCount(invalid), false);
});

test('rollout reports actual occupancy and independently proves startup input', t => {
    const {write, read} = fixture(t);
    write(...first, tokens(1_000_000, 46_000, 51_000, 85_000));
    const status = read();
    assert.equal(status.reading?.window, 1_000_000);
    assert.equal(status.reading?.occupied, 51_000);
    assert.equal(status.startup?.tokens, 33_000);
    assert.equal(read({}, 'another').startup, null);
    assert.equal(read({}, null).startup, null);
    write(meta(), start('first', 1_000_000), context('first', high), tokens(1_000_000, 33_000, 34_000, 68_000));
    assert.equal(read().startup, null); // not the first request: prior usage is not provable
});

test('new turn and model reject old or unbound samples, then accept verified small-window use', t => {
    const {write, read} = fixture(t);
    const latest = {turn_id: 'later', model: low};
    const switched = [...first, start('later', 475_000), context('later', low)];
    write(...switched);
    assert.equal(read(latest).reading, null);
    write(...switched, tokens(475_000, 33_000, 34_000, 34_000)); // stale cumulative usage
    assert.equal(read(latest).reading, null);
    write(...switched, tokens(475_000, 480_000, 490_000, 524_000));
    assert.equal(read(latest).reading?.occupied, 490_000);
    assert.equal(read(latest).reading?.window, 475_000);
    assert.equal(read(latest).startup, null);
    assert.equal(read().reading, null);
    assert.equal(read({...latest, model: ''}).reading, null);
    write(...first, start('later'), context('later', low), tokens(475_000, 480_000, 490_000, 524_000));
    assert.equal(read(latest).reading, null);
});

test('compaction invalidates a reading until a genuine usage update after the saved boundary', t => {
    const {write, read} = fixture(t);
    write(...first);
    assert.equal(read({}, 'first', true).reading, null); // hook has signaled, but rollout has not recorded it
    const compacted = [...first, rollout('compacted'), context('first', high)];
    write(...compacted, tokens(1_000_000, 0, 12_000, 34_000));
    assert.equal(read().reading, null); // packed estimate is not a model request
    write(...compacted, tokens(1_000_000, 50_000, 52_000, 86_000));
    assert.equal(read().reading?.occupied, 52_000);
    assert.equal(read({}, 'first', true).reading?.occupied, 52_000);
});

test('rollout refuses missing, malformed, partial, foreign or symlinked targets', t => {
    const {home, transcript_path, write, read} = fixture(t);
    assert.equal(read().reading, null);
    write(...first);
    assert.equal(read({session_id: other}).reading, null);
    const foreign = path.join(home, path.basename(transcript_path));
    fs.copyFileSync(transcript_path, foreign);
    assert.equal(read({transcript_path: foreign}).reading, null);
    write(meta(other), ...first.slice(1));
    assert.equal(read().reading, null);
    write(...first);
    fs.appendFileSync(transcript_path, '{bad json}\n');
    assert.equal(read().reading, null);
    write(...first);
    fs.appendFileSync(transcript_path, '{');
    assert.equal(read().reading, null);
    fs.unlinkSync(transcript_path);
    fs.symlinkSync(foreign, transcript_path);
    assert.equal(read().reading, null);
});

test('bounded tail requires current turn markers; missing initial provenance is reported separately', t => {
    const {write, read} = fixture(t);
    const large = rollout('response_item', {content: 'x'.repeat(540_000)});
    const current = [start('later', 1_000_000), context('later', high), tokens(1_000_000, 600_000, 601_000, 670_000)];
    write(meta(), large, ...first.slice(1), ...current);
    const status = read({turn_id: 'later'});
    assert.equal(status.reading?.occupied, 601_000);
    assert.equal(status.startup, null); // original usage is outside the trusted prefix
    write(...first, ...current.slice(0, 2), large, ...current.slice(2));
    assert.equal(read({turn_id: 'later'}).reading, null);
});

function contextProfile(t: {after(fn: () => void): void}, home: string) {
    const prev = {CODEX_HOME: process.env.CODEX_HOME, TMPDIR: process.env.TMPDIR};
    process.env.CODEX_HOME = home;
    process.env.TMPDIR = home;
    t.after(() => { for (const [k,v] of Object.entries(prev)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
}

test('Desktop can prove startup without UserPromptSubmit only at the original first turn', t => {
    const {home, native, write} = fixture(t);
    contextProfile(t, home);
    const send = (hook_event_name: string, fields: object = {}) =>
        recordCodexContext({...native, cwd: home, hook_event_name, ...fields});
    const status = () => codexContextStatus(id, home);

    write(...first);
    send('SessionStart', {source: 'startup'});
    send('Stop');
    assert.equal(status().startup?.tokens, 33_000);

    const next = {turn_id: 'second'};
    write(...first, start('second', 1_000_000), context('second', high), tokens(1_000_000, 37_000, 38_000, 72_000));
    send('Stop', next);
    assert.equal(status().occupied, 38_000);
    assert.equal(status().startup?.tokens, 33_000);

    send('SessionStart', {source: 'startup'}); // The first observed Stop is already a later turn.
    send('Stop', next);
    assert.equal(status().occupied, 38_000);
    assert.equal(status().startup, null);

    for (const source of ['resume', 'fork', 'clear']) {
        send('SessionStart', {source});
        write(...first);
        send('Stop');
        assert.equal(status().occupied, 34_000);
        assert.equal(status().startup, null);
    }
});

test('ordinary hook lifecycle caches only the current session numbers and invalidates at host boundaries', t => {
    const {home, native, write} = fixture(t);
    contextProfile(t, home);
    const send = (hook_event_name: string, other: object = {}) =>
        recordCodexContext({...native, cwd: home, hook_event_name, ...other});
    const status = () => codexContextStatus(id, home);
    assert.equal(status().window, null);
    assert.ok(!fs.readdirSync(home).some(entry => entry.startsWith('methodical-context-')));
    write(...first);
    send('SessionStart', {source: 'startup'});
    send('UserPromptSubmit');
    send('Stop');
    assert.equal(status().window, 1_000_000);
    assert.equal(status().startup?.tokens, 33_000);
    assert.equal(status().proactiveOffers, false);
    assert.equal(codexContextStatus(other, home).window, null);
    send('PreCompact');
    send('Stop');
    assert.equal(status().window, null);
    send('SessionStart', {source: 'resume'});
    assert.equal(status().window, null);
    write(...first, start('second', 475_000), context('second', low), tokens(475_000, 100, 200, 34_200));
    const next = {model: low, turn_id: 'second'};
    send('UserPromptSubmit', next);
    assert.equal(status().window, null);
    send('Stop', next);
    assert.equal(status().window, 475_000);
    assert.equal(status().startup, null);
    assert.equal(status().eligible, false);
});
