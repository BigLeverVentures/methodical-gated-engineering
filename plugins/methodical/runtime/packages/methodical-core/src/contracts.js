/** Production contracts adapted from proofs/portable-core/core/contracts.ts (historical proof retained). */
import { createHash } from 'node:crypto';
export const roles = ['worker', 'decider', 'census', 'backstop'];
export const choiceNames = [...roles, 'demanding', 'diligence', 'capability'];
export function assert(value, message) {
    if (!value)
        throw new Error(message);
}
export function object(value) { assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'expected object'); return value; }
export function text(value) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 65536, 'expected bounded nonempty string'); return value; }
export function integer(value) { assert(Number.isSafeInteger(value) && value >= 0, 'expected nonnegative integer'); return value; }
export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export function hash(value) { const s = text(value); assert(/^[a-f0-9]{64}$/.test(s), 'expected SHA-256'); return s; }
export function host(value) { assert(value === 'claude-code' || value === 'codex', 'unknown host'); return value; }
export function level(value) { assert(value === 'none' || value === 'lean' || value === 'full', 'unknown assurance level'); return value; }
export function role(value) { assert(roles.includes(value), 'unknown role'); return value; }
export function stack(value) { assert(['typescript', 'python', 'swift', 'flutter', 'general'].includes(String(value)), 'unknown stack'); return value; }
export function effort(value) { assert(['low', 'medium', 'high', 'xhigh', 'max'].includes(String(value)), 'unknown effort'); return value; }
export function setting(value) { const v = object(value); return { model: text(v.model), effort: effort(v.effort) }; }
export function strings(value, max = 64) { assert(Array.isArray(value) && value.length <= max, 'expected bounded string array'); return value.map(text); }
export function date(value) { const s = text(value); assert(/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) && Number.isFinite(Date.parse(s)), 'invalid date'); return s; }
export function profile(value) {
    const v = object(value);
    assert(v.schemaVersion === 2 && v.scope === 'subagent', 'unknown profile schema/scope');
    const h = host(v.host), g = object(v.guidance);
    assert(Array.isArray(g.sources) && g.sources.length > 0 && g.sources.length <= 16, 'profile needs bounded official sources');
    const sources = g.sources.map(s => { const x = object(s), url = new URL(text(x.url)); const allowed = h === 'codex' ? ['learn.chatgpt.com', 'developers.openai.com', 'platform.openai.com'] : ['code.claude.com', 'claude.com', 'platform.claude.com']; assert(url.protocol === 'https:' && allowed.includes(url.hostname), 'unofficial guidance source'); return { url: url.toString(), contentHash: hash(x.contentHash), recommendation: text(x.recommendation) }; });
    const raw = object(v.choices), choices = {};
    for (const name of choiceNames)
        choices[name] = setting(raw[name]);
    const fallbacks = strings(v.fallbacks).map(x => { assert(choiceNames.includes(x), 'unknown fallback'); return x; });
    let qualifiedOverrides = null;
    if (v.qualifiedOverrides !== null && v.qualifiedOverrides !== undefined) {
        const q = object(v.qualifiedOverrides), qc = {};
        for (const [k, s] of Object.entries(object(q.choices))) {
            assert(choiceNames.includes(k), 'unknown qualified role');
            qc[k] = setting(s);
        }
        qualifiedOverrides = { qualifiedAt: date(q.qualifiedAt), evidenceRef: text(q.evidenceRef), choices: qc };
    }
    const legacyRoleModels = {};
    for (const [k, m] of Object.entries(object(v.legacyRoleModels ?? {}))) {
        assert(h === 'claude-code' && roles.includes(k), 'legacy role models are Claude roles only');
        legacyRoleModels[k] = text(m);
    }
    const l = object(v.limits), limits = { attempts: integer(l.attempts), reviewCycles: integer(l.reviewCycles), escalations: integer(l.escalations), requests: integer(l.requests) };
    assert(limits.attempts >= 1 && limits.attempts <= 8 && limits.reviewCycles >= 1 && limits.reviewCycles <= 4 && limits.escalations <= 2 && limits.requests >= 1 && limits.requests <= 128, 'profile limits outside bounded policy');
    return { schemaVersion: 2, id: text(v.id), host: h, scope: 'subagent', guidance: { retrievedAt: date(g.retrievedAt), sources }, interpretation: text(v.interpretation), choices, fallbacks, qualifiedOverrides, legacyRoleModels, limits };
}
