/** Adapted from proofs/portable-core/core/checkpoint.ts (frozen v2 semantics); production bindings replace fixture guards. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { safeFile, assertProject, repositoryIdentity, projectBinding, validateBinding, resolvePlan, ProjectLockBusyError } from './project.js';
import { dispatchDependencies, dispatchDependenciesFromState } from './dispatch.js';
export { safeFile, assertProject, repositoryIdentity } from './project.js';
import { assert, digest, hash, integer, object, text, host as parseHost } from './contracts.js';
export const captureLimits = { descriptors: 128, fileBytes: 1024 * 1024, totalBytes: 8 * 1024 * 1024, metadataBytes: 64 * 1024 };
const empty = () => ({ sequence: 0, relevant: 0, generation: 0, records: [] });
const git = (root, ...args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const metadata = (root) => path.join(root, '.methodical');
function atomic(file, bytes) {
    const tmp = file + '.tmp-' + randomBytes(8).toString('hex');
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
}
function prepare(root) {
    safeFile(root, '.methodical', true);
    fs.mkdirSync(metadata(root), { recursive: true, mode: 0o700 });
    assert(!fs.lstatSync(metadata(root)).isSymbolicLink(), 'symlink metadata');
}
function journal(root) {
    const file = safeFile(root, '.methodical/journal.json', true);
    if (!fs.existsSync(file))
        return empty();
    const j = object(JSON.parse(fs.readFileSync(file, 'utf8')));
    integer(j.sequence);
    integer(j.relevant);
    integer(j.generation);
    assert(Array.isArray(j.records), 'invalid journal');
    return j;
}
function saveJournal(root, j) { atomic(safeFile(root, '.methodical/journal.json', true), JSON.stringify(j)); }
export function withLock(root, act) {
    const real = assertProject(root);
    prepare(real);
    const lock = safeFile(real, '.methodical/lock', true);
    try {
        fs.mkdirSync(lock);
    }
    catch (e) {
        if (e.code !== 'EEXIST')
            throw e;
        throw new ProjectLockBusyError('checkpoint publisher busy; reconcile abandoned lock before retry', { cause: e });
    }
    try {
        return act();
    }
    finally {
        fs.rmdirSync(lock);
    }
}
export function recordRelevant(root, kind, ref) {
    withLock(root, () => {
        const j = journal(root);
        j.sequence++;
        j.relevant++;
        j.records.push({ at: new Date().toISOString(), kind: text(kind), ref: text(ref) });
        saveJournal(root, j);
    });
}
function files(root) {
    return [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').toString().split('\0'))]
        .filter(p => p && p !== '.methodical' && !p.startsWith('.methodical/')).sort();
}
function snapshot(root) {
    const tree = Object.create(null);
    for (const file of files(root)) {
        sourcePath(file);
        const full = safeFile(root, file, true);
        if (!fs.existsSync(full)) {
            tree[file] = null;
            continue;
        }
        assert(fs.lstatSync(full).isFile(), 'snapshot accepts only regular files');
        tree[file] = digest(Buffer.concat([Buffer.from(String(fs.statSync(full).mode & 0o777) + ':'), fs.readFileSync(full)]));
    }
    return { identity: repositoryIdentity(root), head: git(root, 'rev-parse', 'HEAD').toString().trim(),
        branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD').toString().trim(), tree,
        index: digest(git(root, 'ls-files', '--stage', '-z')) };
}
function same(a, b) {
    if (a === b)
        return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
        return false;
    const x = Object.keys(a).sort(), y = Object.keys(b).sort();
    return x.length === y.length && x.every((key, i) => key === y[i] && same(a[key], b[key]));
}
function workShape(value) {
    const w = object(value);
    hash(w.planHash);
    text(w.step);
    text(w.nextAction);
    relativePath(text(w.rulings));
    assert(Array.isArray(w.lessons) && w.lessons.every(x => typeof x === 'string'), 'invalid lesson paths');
    for (const item of w.lessons)
        relativePath(item);
    for (const name of ['findings', 'reviewDebt', 'evidence']) {
        assert(Array.isArray(w[name]) && w[name].every(v => typeof v === 'string'), `invalid ${name}`);
    }
    if (w.binding !== undefined)
        projectBinding(w.binding);
    if (w.captures !== undefined)
        captureShape({ schemaVersion: 1, records: w.captures }, false);
    return w;
}
function validateWork(root, value) {
    const work = workShape(value);
    safeFile(root, work.rulings);
    for (const lesson of work.lessons)
        safeFile(root, lesson);
    assert(work.binding, 'explicit production project binding required');
    const binding = validateBinding(root, work.binding);
    assert(binding.plan.sha256 === work.planHash, 'work plan hash differs from project binding');
    sourcePath(binding.plan.path);
    for (const name of [work.rulings, ...work.lessons]) {
        sourcePath(name);
    }
    return work;
}
export function publish(root, host, value, fault) {
    return withLock(root, () => {
        const input = validateWork(root, value);
        const work = boundWork(root, input);
        const capture = captureSources(root, work.captures ?? [], work);
        const before = snapshot(root);
        const j = journal(root);
        const number = j.generation + 1;
        const generation = `${number}-${randomBytes(8).toString('hex')}`;
        const payload = Object.create(null);
        const stageBase = safeFile(root, '.methodical/checkpoints', true);
        fs.mkdirSync(stageBase, { recursive: true });
        const stage = path.join(stageBase, '.stage-' + generation);
        fs.mkdirSync(stage, { mode: 0o700 });
        const put = (name, bytes) => {
            const f = path.join(stage, name);
            fs.mkdirSync(path.dirname(f), { recursive: true });
            const fd = fs.openSync(f, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, bytes);
                fs.fsyncSync(fd);
            }
            finally {
                fs.closeSync(fd);
            }
            payload[name] = digest(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
        };
        try {
            fault?.('captured');
            for (const record of capture.records)
                if (record.kind === 'local')
                    put(record.archive, capture.bytes.get(record.ref));
            put('file-modes.json', JSON.stringify(Object.fromEntries(Object.keys(before.tree).filter(name => before.tree[name] !== null).map(name => [name, fs.statSync(safeFile(root, name)).mode & 0o777]))));
            put('dirty.patch', git(root, 'diff', '--binary', 'HEAD'));
            put('index.patch', git(root, 'diff', '--cached', '--binary', 'HEAD'));
            const changed = new Set(git(root, 'diff', '--name-only', '-z', 'HEAD').toString().split('\0'));
            const untracked = new Set(git(root, 'ls-files', '--others', '--exclude-standard', '-z').toString().split('\0'));
            for (const name of Object.keys(before.tree)) {
                if ((changed.has(name) || untracked.has(name)) && before.tree[name] !== null)
                    put((untracked.has(name) ? 'untracked/' : 'worktree/') + name, fs.readFileSync(safeFile(root, name)));
            }
            put('resume.md', `# Resume\n\nStep: ${work.step}\n\nNext: ${work.nextAction}\n\n${fs.readFileSync(safeFile(root, work.rulings), 'utf8')}\n\nOpen findings: ${work.findings.join('; ')}\nReview debt: ${work.reviewDebt.join('; ')}\nLessons: ${work.lessons.join(', ')}\n`);
            const c = { schemaVersion: 2, capture: { schemaVersion: 1, records: capture.records }, generation, createdAt: new Date().toISOString(), host,
                relevant: j.relevant, repo: before, work, payload };
            put('checkpoint.json', JSON.stringify(c, null, 2));
            // checkpoint.json is hashed by the pointer, not recursively by its own payload map.
            delete payload['checkpoint.json'];
            fault?.('staged');
            assert(same(before, snapshot(root)) && journal(root).relevant === j.relevant, 'repository changed while checkpointing');
            for (const record of capture.records)
                if (record.kind === 'local' && record.ref !== bindingRef && record.ref !== dependencyModesRef)
                    assert(digest(readBounded(safeFile(root, record.source), captureLimits.fileBytes)) === record.sha256, 'captured evidence changed while checkpointing');
            const modes = capture.records.find(r => r.ref === dependencyModesRef);
            if (modes)
                assert(digest(dependencyModeBytes(root, work)) === modes.sha256, 'active dependency modes changed while checkpointing');
            const final = path.join(stageBase, generation);
            fs.renameSync(stage, final);
            j.generation = number;
            j.sequence++;
            saveJournal(root, j);
            atomic(safeFile(root, '.methodical/checkpoint-current.json', true), JSON.stringify({
                schemaVersion: 1, generation, sha256: digest(fs.readFileSync(path.join(final, 'checkpoint.json')))
            }));
            fault?.('swapped');
            assert(same(before, snapshot(root)), 'checkpoint became stale during publication');
            return c;
        }
        finally {
            fs.rmSync(stage, { recursive: true, force: true });
        }
    });
}
export function readCheckpoint(root) {
    try {
        assertProject(root);
        const p = object(JSON.parse(readBounded(safeFile(root, '.methodical/checkpoint-current.json'), 4096).toString('utf8')));
        assert(p.schemaVersion === 1 && /^\d+-[a-f0-9]{16}$/.test(text(p.generation)), 'invalid checkpoint pointer');
        const base = `.methodical/checkpoints/${p.generation}`;
        const bytes = readBounded(safeFile(root, base + '/checkpoint.json'), 16 * 1024 * 1024);
        assert(digest(bytes) === hash(p.sha256), 'checkpoint metadata checksum mismatch');
        const checkpoint = inspectBundle(safeFile(root, base));
        assert(checkpoint.generation === p.generation, 'invalid checkpoint generation');
        validateWork(root, checkpoint.work);
        for (const r of checkpoint.capture?.records ?? [])
            if (r.kind === 'local' && r.ref !== bindingRef && r.ref !== dependencyModesRef)
                assert(digest(readBounded(safeFile(root, r.source), captureLimits.fileBytes)) === r.sha256, 'captured evidence is stale');
        const modeCapture = checkpoint.capture?.records.find(r => r.ref === dependencyModesRef);
        if (modeCapture)
            assert(digest(dependencyModeBytes(root, checkpoint.work)) === modeCapture.sha256, 'active dependency modes are stale');
        const j = journal(root);
        const current = same(checkpoint.repo, snapshot(root)) && checkpoint.relevant === j.relevant &&
            Number(checkpoint.generation.split('-')[0]) === j.generation;
        return { checkpoint, current, reason: current ? 'current at this read; revalidate before use' : 'stale: reconcile repository, rulings and latest work before resuming' };
    }
    catch (e) {
        return { checkpoint: null, current: false, reason: e.message };
    }
}
function relativePath(value) {
    assert(value.length > 0 && !path.isAbsolute(value) && !value.includes('\\') && !value.includes('\0') &&
        !value.split('/').some(part => part === '' || part === '.' || part === '..'), 'unsafe relative path');
}
function sourcePath(value) {
    relativePath(value);
    const lower = value.toLowerCase();
    assert(lower !== '.git' && !lower.startsWith('.git/'), 'Git metadata cannot be evidence');
    assert(lower !== '.methodical' && (!lower.startsWith('.methodical/') || lower.startsWith('.methodical/evidence/') || lower.startsWith('.methodical/feedback/') || lower === '.methodical/approval.json' || lower === '.methodical/routing-state.json'), 'helper control metadata cannot be evidence');
    assert(!value.split('/').some(part => /^(?:\.env(?:\..*)?|credentials(?:\..*)?|auth\.json|id_(?:rsa|ed25519)|transcript(?:s)?(?:\..*)?)$/i.test(part)), 'credentials or transcripts cannot be evidence');
}
function readBounded(file, limit) {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const st = fs.fstatSync(fd);
        assert(st.isFile() && st.size <= limit, 'file must be regular and within size limit');
        const bytes = Buffer.alloc(st.size + 1);
        let size = 0;
        while (size < bytes.length) {
            const count = fs.readSync(fd, bytes, size, bytes.length - size, null);
            if (!count)
                break;
            size += count;
        }
        assert(size === st.size, 'file size changed while reading');
        return bytes.subarray(0, size);
    }
    finally {
        fs.closeSync(fd);
    }
}
function captureShape(value, archived) {
    const manifest = object(value);
    assert(manifest.schemaVersion === 1 && Array.isArray(manifest.records), 'invalid capture schema');
    assert(manifest.records.length <= captureLimits.descriptors, 'capture descriptor limit exceeded');
    assert(Buffer.byteLength(JSON.stringify(manifest)) <= captureLimits.metadataBytes, 'capture metadata limit exceeded');
    const refs = new Set(), sources = new Set(), archives = [];
    let total = 0;
    for (const item of manifest.records) {
        const r = object(item);
        const ref = text(r.ref);
        assert(!refs.has(ref), 'duplicate evidence reference');
        refs.add(ref);
        let keys;
        if (r.kind === 'local') {
            const source = text(r.source), archive = text(r.archive);
            sourcePath(source);
            relativePath(archive);
            assert(archive.startsWith('evidence/'), 'capture archive must be under evidence/');
            assert(r.required === true, 'local evidence must declare required true');
            const sourceKey = source.toLowerCase(), archiveKey = archive.toLowerCase();
            assert(!sources.has(sourceKey), 'duplicate evidence source');
            sources.add(sourceKey);
            assert(!archives.some(other => other === archiveKey || other.startsWith(archiveKey + '/') || archiveKey.startsWith(other + '/')), 'capture archive collision');
            archives.push(archiveKey);
            keys = ['kind', 'ref', 'source', 'archive', 'required'];
            if (archived) {
                const size = integer(r.bytes);
                hash(r.sha256);
                total += size;
                assert(size <= captureLimits.fileBytes && total <= captureLimits.totalBytes, 'capture byte limit exceeded');
                keys.push('bytes', 'sha256');
            }
        }
        else if (r.kind === 'external') {
            const url = new URL(text(r.url));
            assert(['https:', 'http:'].includes(url.protocol), 'external reference needs HTTP URL');
            keys = ['kind', 'ref', 'url'];
        }
        else {
            assert(r.kind === 'unavailable', 'unknown capture kind');
            text(r.reason);
            keys = ['kind', 'ref', 'reason'];
        }
        assert(Object.keys(r).length === keys.length && Object.keys(r).every(key => keys.includes(key)), 'unexpected capture fields');
    }
    assert(Object.keys(manifest).length === 2, 'unexpected capture manifest fields');
    return manifest;
}
function captureSources(root, requests, work) {
    captureShape({ schemaVersion: 1, records: requests }, false);
    const binding = work.binding;
    const selected = new Set(workSources(work));
    const dependencies = new Map(dispatchDependencies(root).map(d => [d.source, d.sha256]));
    const bytes = new Map();
    let total = 0;
    const records = requests.map(record => {
        if (record.kind !== 'local')
            return { ...record };
        // Ignore exceptions are exact selected work records, bound active dependencies, or dedicated evidence paths.
        if (record.source !== binding.plan.path && record.source !== '.methodical/routing-state.json' && !dependencies.has(record.source) && !selected.has(record.source) && !record.source.startsWith('.methodical/evidence/')) {
            const ignored = spawnSync('git', ['--no-optional-locks', '-C', root, 'check-ignore', '--no-index', '-z', '--stdin'], { input: record.source + '\0', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            assert(!ignored.error && ignored.status === 1, 'ignored support must be staged under .methodical/evidence/');
        }
        const data = record.ref === bindingRef ? Buffer.from(JSON.stringify(binding)) : record.ref === dependencyModesRef ? dependencyModeBytes(root, work) : readBounded(safeFile(root, record.source), captureLimits.fileBytes);
        total += data.length;
        const expected = dependencies.get(record.source);
        if (expected)
            assert(digest(data) === expected, 'active dispatch dependency hash mismatch');
        assert(total <= captureLimits.totalBytes, 'capture total byte limit exceeded');
        bytes.set(record.ref, data);
        return { ...record, bytes: data.length, sha256: digest(data) };
    });
    // Sizes/hashes are also bounded metadata and are checked before publication.
    captureShape({ schemaVersion: 1, records }, true);
    return { records, bytes };
}
function cleanBase(root) {
    const entries = git(root, 'ls-tree', '-r', '-z', 'HEAD').toString().split('\0').filter(Boolean).map(line => {
        const tab = line.indexOf('\t'), [mode, type, oid] = line.slice(0, tab).split(' '), name = line.slice(tab + 1);
        assert(tab > 0 && type === 'blob' && (mode === '100644' || mode === '100755') && oid, 'clean base supports ordinary files only');
        const file = safeFile(root, name);
        const stat = fs.lstatSync(file);
        assert(stat.isFile() && (stat.mode & 0o777) === (Number.parseInt(mode, 8) & 0o777), 'destination worktree mode differs from clean base');
        const bytes = fs.readFileSync(file);
        assert(digest(bytes) === digest(git(root, 'cat-file', 'blob', oid)), 'destination worktree bytes differ from clean base');
        return { name, sum: digest(Buffer.concat([Buffer.from(String(stat.mode & 0o777) + ':'), bytes])), record: `${mode} ${oid} 0\t${name}\0` };
    }).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
    assert(digest(Buffer.from(entries.map(e => e.record).join(''))) === digest(git(root, 'ls-files', '--stage', '-z')), 'destination index differs from clean base');
    return Object.fromEntries(entries.map(entry => [entry.name, entry.sum]));
}
function repoShape(value) {
    const r = object(value);
    assert(same(Object.keys(r).sort(), ['branch', 'head', 'identity', 'index', 'tree']), 'invalid repository state fields');
    hash(r.identity);
    hash(r.index);
    assert(/^[a-f0-9]{40,64}$/.test(text(r.head)), 'invalid saved HEAD');
    text(r.branch);
    const tree = object(r.tree);
    for (const [name, sum] of Object.entries(tree)) {
        relativePath(name);
        assert(!/^\.(?:git|methodical)(?:\/|$)/i.test(name), 'metadata in saved tree');
        if (sum !== null)
            hash(sum);
    }
    return r;
}
function bundleFiles(root, relative = '') {
    return fs.readdirSync(path.join(root, relative)).sort().flatMap(name => {
        const rel = relative ? relative + '/' + name : name;
        const full = safeFile(root, rel);
        const stat = fs.lstatSync(full);
        assert(stat.isFile() || stat.isDirectory(), 'special file in bundle');
        return stat.isDirectory() ? bundleFiles(root, rel) : [rel];
    });
}
/** Validate an archive without touching repository state or requiring restored work files. */
export function inspectBundle(bundle) {
    const root = fs.realpathSync(bundle);
    const c = object(JSON.parse(readBounded(safeFile(root, 'checkpoint.json'), 16 * 1024 * 1024).toString('utf8')));
    assert(c.schemaVersion === 1 || c.schemaVersion === 2, 'invalid checkpoint schema');
    assert(/^\d+-[a-f0-9]{16}$/.test(text(c.generation)), 'invalid checkpoint generation');
    assert(Number.isFinite(Date.parse(text(c.createdAt))), 'invalid checkpoint timestamp');
    parseHost(c.host);
    integer(c.relevant);
    const work = workShape(c.work), repo = repoShape(c.repo), payload = object(c.payload);
    for (const name of ['resume.md', 'dirty.patch', 'index.patch', 'file-modes.json'])
        hash(payload[name]);
    let capture;
    if (c.schemaVersion === 2) {
        capture = captureShape(c.capture, true);
        const requests = capture.records.map(record => { const { bytes, sha256, ...request } = record; return request; });
        assert(same(requests, work.captures ?? []), 'work capture requests do not match archived manifest');
    }
    else
        assert(c.capture === undefined && work.captures === undefined, 'v1 evidence coverage must remain unknown');
    if (work.binding)
        inspectBinding(root, work, capture);
    const archives = new Map();
    for (const record of capture?.records ?? [])
        if (record.kind === 'local')
            archives.set(record.archive, record);
    const modes = object(JSON.parse(readBounded(safeFile(root, 'file-modes.json'), 16 * 1024 * 1024).toString('utf8')));
    for (const [name, mode] of Object.entries(modes)) {
        relativePath(name);
        assert(repo.tree[name] !== null && Object.hasOwn(repo.tree, name), 'mode lacks saved tree file');
        assert(integer(mode) <= 0o777, 'invalid saved file mode');
    }
    assert(Object.keys(repo.tree).filter(name => repo.tree[name] !== null).every(name => Object.hasOwn(modes, name)), 'missing saved file mode');
    for (const [file, sum] of Object.entries(payload)) {
        relativePath(file);
        hash(sum);
        assert(['resume.md', 'dirty.patch', 'index.patch', 'file-modes.json'].includes(file) || file.startsWith('untracked/') || file.startsWith('worktree/') || archives.has(file), 'unknown archive payload');
        const record = archives.get(file);
        const bytes = readBounded(safeFile(root, file), record ? captureLimits.fileBytes : 16 * 1024 * 1024);
        assert(digest(bytes) === sum, 'checkpoint payload checksum mismatch');
        if (record)
            assert(bytes.length === record.bytes && sum === record.sha256, 'capture byte/hash mismatch');
        if (file.startsWith('untracked/') || file.startsWith('worktree/')) {
            const name = file.slice(file.indexOf('/') + 1);
            assert(Object.hasOwn(modes, name) && repo.tree[name] === digest(Buffer.concat([Buffer.from(String(modes[name]) + ':'), bytes])), 'restoration payload does not match saved tree');
            assert(!Object.hasOwn(payload, (file.startsWith('untracked/') ? 'worktree/' : 'untracked/') + name), 'duplicate restoration payload');
        }
    }
    for (const [archive, record] of archives)
        assert(payload[archive] === record.sha256, 'missing captured payload');
    const declared = Object.keys(payload).concat('checkpoint.json').sort();
    assert(same(bundleFiles(root), declared), 'undeclared or missing bundle files');
    return c;
}
/** Both phases are strictly read-only, including when metadata is absent or validation fails. */
export function verifyRecovery(root, bundle, phase, legacyBinding) {
    const failed = (reason) => ({ pass: false, reason });
    const result = { pass: false, phase, integrity: failed('not checked'), destinationCompatibility: failed('not checked'), restoredState: null,
        evidenceCompleteness: { ...failed('not checked'), coverage: 'unknown', limitations: [], mappings: [] }, semanticFreshness: 'not-established' };
    let checkpoint;
    try {
        assert(phase === 'pre-restore' || phase === 'post-restore', 'invalid recovery phase');
        checkpoint = inspectBundle(bundle);
        result.integrity = { pass: true, reason: 'bundle shape and payload checksums valid' };
    }
    catch (e) {
        result.integrity = failed(e.message);
        return result;
    }
    const manifest = checkpoint.capture;
    result.evidenceCompleteness = { pass: checkpoint.schemaVersion === 2, coverage: manifest ? 'explicit' : 'unknown',
        reason: manifest ? 'all declared required local records are present; opaque labels assert no coverage' : 'legacy bundle evidence coverage is unknown',
        limitations: (manifest?.records ?? []).filter(r => r.kind !== 'local').map(r => r.kind === 'external' ? `${r.ref}: external ${r.url}` : r.kind === 'unavailable' ? `${r.ref}: unavailable ${r.reason}` : ''),
        mappings: (manifest?.records ?? []).flatMap(r => r.kind === 'local' ? [{ ref: r.ref, archive: r.archive, sha256: r.sha256, bytes: r.bytes }] : []) };
    try {
        const real = assertProject(root);
        if (checkpoint.work.binding) {
            assert(repositoryIdentity(real) === checkpoint.repo.identity, 'destination project identity mismatch');
            assert(checkpoint.work.binding.repositoryIdentity === checkpoint.repo.identity, 'bundle binding identity mismatch');
        }
        else {
            assert(legacyBinding?.identityAlgorithm === 'explicit-legacy-sha256', 'legacy recovery requires explicit compatible identity binding');
            assert(hash(legacyBinding.repositoryIdentity) === checkpoint.repo.identity && hash(legacyBinding.destinationIdentity) === repositoryIdentity(real), 'legacy identity binding mismatch');
        }
        assert(git(real, 'rev-parse', 'HEAD').toString().trim() === checkpoint.repo.head, 'destination HEAD mismatch');
        assert(git(real, 'rev-parse', '--abbrev-ref', 'HEAD').toString().trim() === checkpoint.repo.branch, 'destination branch mismatch');
        let baseTree;
        if (phase === 'pre-restore') {
            baseTree = cleanBase(real);
            assert(git(real, 'ls-files', '--others', '-z').toString().split('\0').every(name => !name || name.startsWith('.methodical/')), 'destination has unexpected untracked files');
        }
        result.destinationCompatibility = { pass: true, reason: phase === 'pre-restore' ? 'project identity, HEAD, branch and clean base match' : 'project identity, HEAD and branch match' };
        if (baseTree) {
            try {
                // A self-consistent declaration cannot hide missing recovery bytes. HEAD supplies only unchanged files.
                for (const [name, sum] of Object.entries(checkpoint.repo.tree)) {
                    if (sum === null || sum === baseTree[name])
                        continue;
                    assert(Object.hasOwn(checkpoint.payload, 'worktree/' + name) || Object.hasOwn(checkpoint.payload, 'untracked/' + name), `missing restoration payload for ${name}`);
                }
            }
            catch (e) {
                result.integrity = failed(e.message);
            }
        }
        if (phase === 'post-restore') {
            try {
                assert(same(snapshot(real), checkpoint.repo), 'restored tree or index mismatch');
                validateRecoveredWork(real, bundle, checkpoint.work, legacyBinding?.planPath);
                result.restoredState = { pass: true, reason: 'saved bytes, modes, deletions, index and work references match' };
            }
            catch (e) {
                result.restoredState = failed(e.message);
            }
        }
    }
    catch (e) {
        result.destinationCompatibility = failed(e.message);
    }
    result.pass = result.integrity.pass && result.destinationCompatibility.pass && result.evidenceCompleteness.pass && (phase === 'pre-restore' || result.restoredState?.pass === true);
    return result;
}
const bindingRef = 'methodical:project-binding';
const planRef = 'methodical:active-plan';
const routingRef = 'methodical:routing-state';
const dependencyPrefix = 'methodical:dispatch-dependency:';
const dependencyModesRef = 'methodical:dispatch-dependency-modes';
const dependencyModesSource = '.methodical/evidence/dispatch-dependency-modes.json';
const dependencyModesArchive = 'evidence/dispatch-dependency-modes.json';
function workSources(work) {
    const resume = (work.captures ?? []).filter(r => r.kind === 'local' && r.ref === 'methodical:resume').map(r => r.kind === 'local' ? r.source : '');
    return [...new Set([work.rulings, ...work.lessons, ...resume, ...(work.binding ? [work.binding.plan.path] : [])])].sort();
}
function dependencySources(work, dependencies) {
    return [...new Set([...workSources(work), ...dependencies.map(d => d.source)])].sort().map(source => ({ source }));
}
function dependencyModeBytes(root, work) {
    return Buffer.from(JSON.stringify(Object.fromEntries(dependencySources(work, dispatchDependencies(root)).map(d => [d.source, fs.statSync(safeFile(root, d.source)).mode & 0o777]))));
}
function dependencyModes(bundle, dependencies) {
    const modes = object(JSON.parse(readBounded(safeFile(bundle, dependencyModesArchive), captureLimits.fileBytes).toString('utf8')));
    assert(same(Object.keys(modes).sort(), dependencies.map(d => d.source).sort()), 'active dependency mode map mismatch');
    for (const mode of Object.values(modes))
        assert(integer(mode) <= 0o777, 'invalid active dependency mode');
    return modes;
}
function generatedRef(ref) { return [bindingRef, planRef, routingRef, dependencyModesRef].includes(ref) || ref.startsWith(dependencyPrefix); }
function boundWork(root, work) {
    const binding = work.binding;
    const captures = (work.captures ?? []).filter(r => !generatedRef(r.ref));
    captures.push({ kind: 'local', ref: bindingRef, source: '.methodical/evidence/project-binding.json', archive: 'evidence/project-binding.json', required: true });
    assert(!captures.some(r => r.kind === 'local' && r.source === binding.plan.path), 'active plan capture is generated from explicit binding');
    captures.push({ kind: 'local', ref: planRef, source: binding.plan.path, archive: 'evidence/active-plan', required: true });
    if (binding.routing) {
        assert(!captures.some(r => r.kind === 'local' && r.source === binding.routing.path), 'routing capture is generated from explicit binding');
        captures.push({ kind: 'local', ref: routingRef, source: binding.routing.path, archive: 'evidence/routing-state.json', required: true });
    }
    const dependencies = dependencySources(work, dispatchDependencies(root));
    for (const dependency of dependencies) {
        sourcePath(dependency.source);
        assert(dependency.source !== dependencyModesSource, 'active dependency conflicts with generated mode evidence');
        if (captures.some(r => r.kind === 'local' && r.source === dependency.source))
            continue;
        const key = digest(dependency.source);
        captures.push({ kind: 'local', ref: dependencyPrefix + key, source: dependency.source, archive: 'evidence/dispatch-dependencies/' + key, required: true });
    }
    if (dependencies.length)
        captures.push({ kind: 'local', ref: dependencyModesRef, source: dependencyModesSource, archive: dependencyModesArchive, required: true });
    return { ...work, captures };
}
function inspectBinding(bundle, work, capture) {
    const binding = projectBinding(work.binding);
    assert(work.planHash === binding.plan.sha256, 'binding plan hash mismatch');
    sourcePath(binding.plan.path);
    const records = capture?.records ?? [];
    const required = (ref, source, archive, sum) => {
        const r = records.find(r => r.ref === ref);
        assert(r?.kind === 'local' && r.source === source && r.archive === archive && r.required === true, 'missing explicit project binding capture');
        if (sum)
            assert(r.sha256 === sum, 'bound capture hash mismatch');
        return r;
    };
    required(bindingRef, '.methodical/evidence/project-binding.json', 'evidence/project-binding.json');
    const archived = projectBinding(JSON.parse(readBounded(safeFile(bundle, 'evidence/project-binding.json'), captureLimits.fileBytes).toString('utf8')));
    assert(same(archived, binding), 'archived project binding mismatch');
    required(planRef, binding.plan.path, 'evidence/active-plan', binding.plan.sha256);
    if (binding.routing) {
        required(routingRef, binding.routing.path, 'evidence/routing-state.json', binding.routing.sha256);
        const dependencies = dispatchDependenciesFromState(JSON.parse(readBounded(safeFile(bundle, 'evidence/routing-state.json'), captureLimits.fileBytes).toString('utf8')));
        for (const dependency of dependencies) {
            sourcePath(dependency.source);
            assert(records.some(r => r.kind === 'local' && r.required && r.source === dependency.source && r.sha256 === dependency.sha256), 'missing required active dispatch dependency capture');
        }
    }
    else
        assert(!records.some(r => r.kind === 'local' && r.source === '.methodical/routing-state.json'), 'routing absence conflicts with captured state');
    for (const source of workSources(work)) {
        sourcePath(source);
        assert(records.some(r => r.kind === 'local' && r.required && r.source === source), 'missing required selected work record capture');
    }
    const routing = binding.routing ? dispatchDependenciesFromState(JSON.parse(readBounded(safeFile(bundle, 'evidence/routing-state.json'), captureLimits.fileBytes).toString('utf8'))) : [];
    const sources = dependencySources(work, routing);
    if (sources.length) {
        required(dependencyModesRef, dependencyModesSource, dependencyModesArchive);
        dependencyModes(bundle, sources);
    }
}
function validateRecoveredWork(root, bundle, work, legacyPlan) {
    if (!work.binding) {
        assert(legacyPlan, 'legacy plan path binding required');
        resolvePlan(root, legacyPlan, work.planHash);
    }
    else {
        const b = projectBinding(work.binding);
        assert(repositoryIdentity(root) === b.repositoryIdentity, 'project binding identity mismatch');
        const plan = safeFile(root, b.plan.path, true);
        if (fs.existsSync(plan))
            resolvePlan(root, b.plan.path, b.plan.sha256);
        else
            assert(!Object.hasOwn(object(inspectBundle(bundle).repo.tree), b.plan.path), 'required restored plan missing');
        const routing = safeFile(root, '.methodical/routing-state.json', true);
        assert(fs.existsSync(routing) === (b.routing !== null), 'restore declared routing state from evidence before resuming');
        if (b.routing) {
            assert(digest(readBounded(routing, captureLimits.fileBytes)) === b.routing.sha256, 'restored routing state differs');
            dispatchDependencies(root); // Require every active source at its original path.
        }
    }
    const checkpoint = inspectBundle(bundle);
    for (const name of workSources(work)) {
        const file = safeFile(root, name);
        const captured = checkpoint.capture?.records.find(r => r.kind === 'local' && r.source === name);
        if (captured)
            assert(digest(readBounded(file, captureLimits.fileBytes)) === captured.sha256, 'restored work reference differs from captured bytes');
    }
    if (work.binding) {
        const sources = dependencySources(work, dispatchDependencies(root));
        const modes = dependencyModes(bundle, sources);
        for (const d of sources)
            assert((fs.statSync(safeFile(root, d.source)).mode & 0o777) === modes[d.source], 'restored selected work or dependency mode mismatch');
    }
}
