// Stock Codex hooks do not carry token usage. The rollout is a version-sensitive fallback;
// read only bounded slices of the exact native file. Missing provenance is an unknown reading.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { contextStatus, tokenCount } from '../packages/methodical-core/src/context-policy.js';
const LIMIT = 512 * 1024;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const modelSlug = (value) => typeof value === 'string' && /^[a-zA-Z0-9][\w.:-]{0,127}$/.test(value);
const sessionId = (value) => typeof value === 'string' && idPattern.test(value);
const positive = (value) => tokenCount(value) && value > 0;
const codeHome = () => path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const firstInput = 'first-request input, including the first prompt';
function obj(input) {
    return typeof input === 'object' && input !== null && !Array.isArray(input) ? input : {};
}
function slice(fd, offset, len) {
    const bytes = Buffer.alloc(len);
    if (fs.readSync(fd, bytes, 0, len, offset) !== len)
        throw Error('incomplete read');
    return bytes.toString('utf8');
}
function lines(bytes, partialHead = false) {
    if (!bytes.endsWith('\n'))
        throw Error('unfinished rollout record');
    const split = bytes.split('\n');
    return split.slice(partialHead ? 1 : 0, -1);
}
function usage(payload) {
    const info = obj(payload.info), last = obj(info.last_token_usage);
    const { model_context_window: window } = info, { input_tokens: input, total_tokens: occupied } = last;
    const cumulative = obj(info.total_token_usage).total_tokens;
    // In particular, reject compacted-history estimates: those can have 0 input tokens.
    if (!positive(window) || !positive(occupied) || !positive(input) || occupied < input
        || !positive(cumulative) || cumulative < occupied || info.last_usage_includes_reasoning !== true)
        return null;
    return { window, occupied, input, cumulative };
}
function scan(records) {
    let active = null;
    let firstTurn = null, first = null;
    let cumulative = 0, startupPossible = true;
    for (const line of records) {
        const record = obj(JSON.parse(line)), payload = obj(record.payload);
        if (typeof record.type !== 'string')
            throw Error('unrecognized rollout record');
        if (record.type === 'compacted' || (record.type === 'event_msg' && payload.type === 'context_compacted')) {
            if (active) {
                active.activeSample = null;
                active.model = null;
                active.compacted = true;
            }
            startupPossible = false;
        }
        else if (record.type === 'event_msg' && payload.type === 'task_started') {
            active = typeof payload.turn_id === 'string' && payload.turn_id
                ? { turn: payload.turn_id, window: positive(payload.model_context_window) ? payload.model_context_window : null,
                    model: null, activeSample: null, compacted: false }
                : null;
            if (!active)
                startupPossible = false;
            if (firstTurn === null && active)
                firstTurn = active.turn;
        }
        else if (record.type === 'turn_context') {
            if (active && payload.turn_id === active.turn && modelSlug(payload.model)) {
                if (active.model !== payload.model)
                    active.activeSample = null;
                active.model = payload.model;
            }
            else {
                if (active) {
                    active.model = null;
                    active.activeSample = null;
                }
                startupPossible = false;
            }
        }
        else if (record.type === 'event_msg' && payload.type === 'token_count') {
            // An info:null rate-limit update carries no usage. Other unrecognized samples invalidate.
            if (payload.info === null)
                continue;
            const sample = usage(payload);
            const total = obj(obj(payload.info).total_token_usage).total_tokens;
            if (active && sample && active.model && sample.window === active.window && sample.cumulative > cumulative) {
                active.activeSample = sample;
                if (startupPossible && first === null && active.turn === firstTurn && cumulative === 0
                    && sample.cumulative === sample.occupied)
                    first = { ...sample, model: active.model };
            }
            else if (active && (!sample || sample.cumulative !== active.activeSample?.cumulative
                || sample.window !== active.activeSample.window || sample.occupied !== active.activeSample.occupied
                || sample.input !== active.activeSample.input)) {
                active.activeSample = null;
            }
            if (!first && total !== 0)
                startupPossible = false;
            if (positive(total))
                cumulative = Math.max(cumulative, total);
        }
    }
    return { active, first, firstTurn };
}
export function observeCodexRollout(event, firstPromptTurn = null, home = codeHome(), afterCompaction = false) {
    const unavailable = { reading: null, startup: null };
    const { session_id: id, turn_id: turn, transcript_path: supplied, model } = event;
    if (!sessionId(id) || typeof turn !== 'string' || !turn || !modelSlug(model)
        || typeof supplied !== 'string' || !path.isAbsolute(supplied))
        return unavailable;
    let fd;
    try {
        const root = path.join(fs.realpathSync(home), 'sessions');
        if (!fs.lstatSync(root).isDirectory())
            return unavailable;
        // Normalize the Codex home alias (/tmp vs /private/tmp, for example), but no symlinks below it.
        const rel = path.relative(path.join(home, 'sessions'), path.resolve(supplied));
        const canonicalRel = path.relative(root, path.resolve(supplied));
        const inside = (name) => /^(\d{4})[/\\](\d{2})[/\\](\d{2})[/\\]rollout-[^/\\]+\.jsonl$/.test(name)
            && name.endsWith(`-${id}.jsonl`);
        const filename = inside(rel) ? path.join(root, rel) : inside(canonicalRel) ? path.join(root, canonicalRel) : null;
        if (!filename || fs.realpathSync(filename) !== filename)
            return unavailable;
        const before = fs.lstatSync(filename);
        if (!before.isFile() || before.nlink !== 1)
            return unavailable;
        fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || before.dev !== stat.dev || before.ino !== stat.ino || stat.size === 0)
            return unavailable;
        const head = slice(fd, 0, Math.min(LIMIT, stat.size));
        const newline = head.indexOf('\n');
        if (newline < 0)
            return unavailable;
        const meta = obj(JSON.parse(head.slice(0, newline)));
        if (meta.type !== 'session_meta' || obj(meta.payload).id !== id)
            return unavailable;
        const offset = Math.max(0, stat.size - LIMIT);
        const tail = lines(offset === 0 ? head : slice(fd, offset - 1, LIMIT + 1), offset > 0);
        const { active } = scan(tail);
        if (active?.turn !== turn || active.model !== model || !active.activeSample || (afterCompaction && !active.compacted) || fs.fstatSync(fd).size !== stat.size)
            return unavailable;
        const { window, occupied } = active.activeSample;
        const reading = { model, window, occupied, source: 'Codex rollout, last verified request' };
        let startup = null;
        if (firstPromptTurn) {
            const fullPrefix = head.slice(0, head.lastIndexOf('\n') + 1);
            const start = scan(lines(fullPrefix));
            if (start.firstTurn === firstPromptTurn && start.first?.window === window && start.first.model === model)
                startup = { kind: firstInput, tokens: start.first.input };
        }
        return { reading, startup };
    }
    catch {
        return unavailable;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
}
function location(id, cwd, create = false) {
    const uid = process.getuid?.();
    if (uid === undefined || !sessionId(id))
        throw Error('invalid local session');
    const root = path.join(fs.realpathSync(os.tmpdir()), `methodical-context-${uid}`);
    if (create)
        try {
            fs.mkdirSync(root, { mode: 0o700 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077))
        throw Error('unsafe status directory');
    const binding = createHash('sha256').update(JSON.stringify([codeHome(), fs.realpathSync(cwd), id])).digest('hex');
    return path.join(root, binding + '.json');
}
function load(file) {
    let fd;
    try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1 || st.uid !== process.getuid?.() || (st.mode & 0o077) || st.size > 4096)
            return null;
        const result = obj(JSON.parse(slice(fd, 0, st.size)));
        if (!modelSlug(result.model))
            return null;
        const r = obj(result.reading), s = obj(result.startup);
        const reading = positive(r.window) && positive(r.occupied) && r.model === result.model
            ? { window: r.window, occupied: r.occupied, model: result.model, source: 'Codex rollout, last verified request' } : null;
        const startup = s.kind === firstInput && positive(s.tokens) ? { tokens: s.tokens, kind: firstInput } : null;
        return { model: result.model, startupTurn: typeof result.startupTurn === 'string' ? result.startupTurn : null,
            compactTurn: typeof result.compactTurn === 'string' ? result.compactTurn : null,
            awaitingFirstPrompt: result.awaitingFirstPrompt === true, reading, startup };
    }
    catch {
        return null;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
}
function save(file, value) {
    const temp = file + '.' + randomUUID();
    try {
        fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temp, file);
    }
    finally {
        fs.rmSync(temp, { force: true });
    }
}
export function recordCodexContext(event) {
    if (!sessionId(event.session_id) || typeof event.cwd !== 'string')
        return;
    try {
        const file = location(event.session_id, event.cwd, true);
        if (!modelSlug(event.model)) {
            fs.rmSync(file, { force: true });
            return;
        }
        const empty = { model: event.model, awaitingFirstPrompt: false, startupTurn: null, compactTurn: null, reading: null, startup: null };
        if (event.hook_event_name === 'SessionStart' && event.source !== 'compact') {
            save(file, { ...empty, awaitingFirstPrompt: event.source === 'startup' });
            return;
        }
        const prior = load(file);
        const state = prior?.model === event.model ? prior : empty;
        if (event.hook_event_name === 'UserPromptSubmit') {
            const startupTurn = state.awaitingFirstPrompt && typeof event.turn_id === 'string' ? event.turn_id : state.startupTurn;
            save(file, { ...state, awaitingFirstPrompt: false, startupTurn });
        }
        else if (event.hook_event_name === 'Stop') {
            // Desktop can reach Stop without a UserPromptSubmit hook. Only try this after an
            // explicit fresh startup, and let the bounded rollout prove that Stop is the first turn.
            const firstTurn = state.awaitingFirstPrompt && typeof event.turn_id === 'string'
                ? event.turn_id : state.startupTurn;
            const afterCompaction = state.compactTurn !== null && state.compactTurn === event.turn_id;
            const { reading, startup } = observeCodexRollout(event, firstTurn, codeHome(), afterCompaction);
            save(file, { ...state, awaitingFirstPrompt: false, reading,
                startupTurn: startup ? firstTurn : state.startupTurn,
                startup: startup ?? (reading?.window === state.reading?.window ? state.startup : null) });
        }
        else {
            save(file, { ...state, reading: null, awaitingFirstPrompt: false,
                compactTurn: typeof event.turn_id === 'string' ? event.turn_id : state.compactTurn });
        }
    }
    catch {
        // No capability, no reading. This never blocks work, compaction or worker dispatch.
    }
}
export function codexContextStatus(id, cwd) {
    try {
        const state = load(location(id, cwd));
        return { ...contextStatus(state?.reading ?? null, state?.startup ?? null), proactiveOffers: false };
    }
    catch {
        return { ...contextStatus(null, null), proactiveOffers: false };
    }
}
