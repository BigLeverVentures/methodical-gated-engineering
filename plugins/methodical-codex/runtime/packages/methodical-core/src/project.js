/** Production Git bindings. Checkpoint path guard adapted from portable-core/core/checkpoint.ts. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assert, digest, hash, text, object } from './contracts.js';
export const identityAlgorithm = 'git-root-lineage-sha256-v1';
export const git = (root, ...args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
export function safeFile(root, relative, allowMissing = false) {
    assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes('\0') && relative.length > 0 && !relative.split('/').some(p => p === '..' || p === '.' || p === ''), 'unsafe relative path');
    const base = path.resolve(root), resolved = path.resolve(base, relative);
    assert(resolved.startsWith(base + path.sep), 'path escaped repository');
    let here = base;
    for (const part of relative.split('/')) {
        here = path.join(here, part);
        try {
            assert(!fs.lstatSync(here).isSymbolicLink(), 'symlink not allowed');
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
            assert(allowMissing, `missing file ${relative}`);
            break;
        }
    }
    return resolved;
}
export function assertProject(root) {
    const actual = fs.realpathSync(root);
    assert(git(actual, 'rev-parse', '--show-toplevel').toString().trim() === actual, 'root must be repository root');
    git(actual, 'rev-parse', '--verify', 'HEAD');
    assert(git(actual, 'ls-files', '-z', '--', '.methodical').length === 0, 'reserved .methodical metadata must not be tracked');
    return actual;
}
/** Root lineage is portable across local paths and remote changes; no remote URL is read. */
export function repositoryIdentity(root) {
    const actual = assertProject(root);
    const roots = git(actual, 'rev-list', '--max-parents=0', 'HEAD').toString().trim().split('\n').sort();
    assert(roots.length > 0 && roots.every(r => /^[a-f0-9]{40,64}$/.test(r)), 'invalid root lineage');
    return digest(identityAlgorithm + '\0' + roots.join('\n'));
}
export function projectFiles(root) {
    return [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').toString().split('\0'))]
        .filter(p => p && p !== '.methodical' && !p.startsWith('.methodical/')).sort();
}
export function candidateIdentity(root) {
    const actual = assertProject(root), tree = Object.create(null);
    for (const name of projectFiles(actual)) {
        const file = safeFile(actual, name, true);
        if (!fs.existsSync(file)) {
            tree[name] = null;
            continue;
        }
        const st = fs.lstatSync(file);
        assert(st.isFile(), 'candidate accepts only regular files');
        tree[name] = digest(Buffer.concat([Buffer.from(String(st.mode & 0o777) + ':'), fs.readFileSync(file)]));
    }
    return digest('methodical-candidate-v1\0' + JSON.stringify({ head: git(actual, 'rev-parse', 'HEAD').toString().trim(), index: digest(git(actual, 'ls-files', '--stage', '-z')), tree }));
}
export function resolvePlan(root, relative, expectedHash) {
    hash(expectedHash);
    const file = safeFile(root, relative);
    const st = fs.lstatSync(file);
    assert(st.isFile() && st.size <= 1024 * 1024, 'plan must be a bounded regular file');
    assert(digest(fs.readFileSync(file)) === expectedHash, 'active plan hash mismatch');
    return file;
}
export function projectBinding(value) {
    const b = object(value), p = object(b.plan);
    assert(b.schemaVersion === 1 && b.identityAlgorithm === identityAlgorithm, 'unsupported project binding identity');
    assert(Object.keys(b).sort().join(',') === 'identityAlgorithm,plan,policyHash,profileHash,repositoryIdentity,routing,schemaVersion,scope', 'unexpected project binding fields');
    assert(Object.keys(p).sort().join(',') === 'path,sha256', 'unexpected plan binding fields');
    hash(b.repositoryIdentity);
    text(p.path);
    safeFile('/__methodical_binding__', p.path, true);
    hash(p.sha256);
    text(b.scope);
    hash(b.policyHash);
    hash(b.profileHash);
    assert(Object.hasOwn(b, 'routing'), 'binding must declare durable routing state');
    if (b.routing !== null) {
        const r = object(b.routing);
        assert(Object.keys(r).sort().join(',') === 'path,sha256', 'unexpected routing binding fields');
        assert(r.path === '.methodical/routing-state.json', 'unsupported routing state path');
        hash(r.sha256);
    }
    return b;
}
export function validateBinding(root, value) {
    const b = projectBinding(value);
    assert(repositoryIdentity(root) === b.repositoryIdentity, 'project binding identity mismatch');
    resolvePlan(root, b.plan.path, b.plan.sha256);
    const state = safeFile(root, '.methodical/routing-state.json', true);
    assert(fs.existsSync(state) === (b.routing !== null), 'binding routing state presence mismatch');
    if (b.routing) {
        assert(fs.statSync(state).isFile() && fs.statSync(state).size <= 1024 * 1024, 'routing state must be bounded regular file');
        assert(digest(fs.readFileSync(state)) === b.routing.sha256, 'binding routing state hash mismatch');
    }
    return b;
}
