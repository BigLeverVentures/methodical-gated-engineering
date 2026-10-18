/** Production contracts adapted from proofs/portable-core/core/contracts.ts (historical proof retained). */
import { createHash } from 'node:crypto';
export type Host = 'claude-code' | 'codex';
export type Level = 'none' | 'lean' | 'full';
export type Role = 'worker' | 'decider' | 'census' | 'backstop';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Setting = {
    model: string;
    effort: Effort;
};
export type Stack = 'typescript' | 'python' | 'swift' | 'flutter' | 'general';
export const roles = ['worker', 'decider', 'census', 'backstop'] as const;
export const choiceNames = [...roles, 'demanding', 'diligence', 'capability'] as const;
export type Choice = typeof choiceNames[number];
export type Profile = {
    schemaVersion: 2;
    id: string;
    host: Host;
    scope: 'subagent';
    guidance: {
        retrievedAt: string;
        sources: {
            url: string;
            contentHash: string;
            recommendation: string;
        }[];
    };
    interpretation: string;
    choices: Record<Choice, Setting>;
    fallbacks: Choice[];
    qualifiedOverrides: {
        qualifiedAt: string;
        evidenceRef: string;
        choices: Partial<Record<Choice, Setting>>;
    } | null;
    legacyRoleModels: Partial<Record<Role, string>>;
    limits: {
        attempts: number;
        reviewCycles: number;
        escalations: number;
        requests: number;
    };
};
export function assert(value: unknown, message: string): asserts value { if (!value)
    throw new Error(message); }
export function object(value: unknown): Record<string, unknown> { assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'expected object'); return value as Record<string, unknown>; }
export function text(value: unknown): string { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 65536, 'expected bounded nonempty string'); return value; }
export function integer(value: unknown): number { assert(Number.isSafeInteger(value) && (value as number) >= 0, 'expected nonnegative integer'); return value as number; }
export function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function hash(value: unknown): string { const s = text(value); assert(/^[a-f0-9]{64}$/.test(s), 'expected SHA-256'); return s; }
export function host(value: unknown): Host { assert(value === 'claude-code' || value === 'codex', 'unknown host'); return value; }
export function level(value: unknown): Level { assert(value === 'none' || value === 'lean' || value === 'full', 'unknown assurance level'); return value; }
export function role(value: unknown): Role { assert(roles.includes(value as Role), 'unknown role'); return value as Role; }
export function stack(value: unknown): Stack { assert(['typescript', 'python', 'swift', 'flutter', 'general'].includes(String(value)), 'unknown stack'); return value as Stack; }
export function effort(value: unknown): Effort { assert(['low', 'medium', 'high', 'xhigh', 'max'].includes(String(value)), 'unknown effort'); return value as Effort; }
export function setting(value: unknown): Setting { const v = object(value); return { model: text(v.model), effort: effort(v.effort) }; }
export function strings(value: unknown, max = 64): string[] { assert(Array.isArray(value) && value.length <= max, 'expected bounded string array'); return value.map(text); }
export function date(value: unknown): string { const s = text(value); assert(/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) && Number.isFinite(Date.parse(s)), 'invalid date'); return s; }
export function profile(value: unknown): Profile {
    const v = object(value);
    assert(v.schemaVersion === 2 && v.scope === 'subagent', 'unknown profile schema/scope');
    const h = host(v.host), g = object(v.guidance);
    assert(Array.isArray(g.sources) && g.sources.length > 0 && g.sources.length <= 16, 'profile needs bounded official sources');
    const sources = g.sources.map(s => { const x = object(s), url = new URL(text(x.url)); const allowed = h === 'codex' ? ['learn.chatgpt.com', 'developers.openai.com', 'platform.openai.com'] : ['code.claude.com', 'claude.com', 'platform.claude.com']; assert(url.protocol === 'https:' && allowed.includes(url.hostname), 'unofficial guidance source'); return { url: url.toString(), contentHash: hash(x.contentHash), recommendation: text(x.recommendation) }; });
    const raw = object(v.choices), choices = {} as Record<Choice, Setting>;
    for (const name of choiceNames)
        choices[name] = setting(raw[name]);
    const fallbacks = strings(v.fallbacks).map(x => { assert(choiceNames.includes(x as Choice), 'unknown fallback'); return x as Choice; });
    let qualifiedOverrides: Profile['qualifiedOverrides'] = null;
    if (v.qualifiedOverrides !== null && v.qualifiedOverrides !== undefined) {
        const q = object(v.qualifiedOverrides), qc: Partial<Record<Choice, Setting>> = {};
        for (const [k, s] of Object.entries(object(q.choices))) {
            assert(choiceNames.includes(k as Choice), 'unknown qualified role');
            qc[k as Choice] = setting(s);
        }
        qualifiedOverrides = { qualifiedAt: date(q.qualifiedAt), evidenceRef: text(q.evidenceRef), choices: qc };
    }
    const legacyRoleModels: Profile['legacyRoleModels'] = {};
    for (const [k, m] of Object.entries(object(v.legacyRoleModels ?? {}))) {
        assert(h === 'claude-code' && roles.includes(k as Role), 'legacy role models are Claude roles only');
        legacyRoleModels[k as Role] = text(m);
    }
    const l = object(v.limits), limits = { attempts: integer(l.attempts), reviewCycles: integer(l.reviewCycles), escalations: integer(l.escalations), requests: integer(l.requests) };
    assert(limits.attempts >= 1 && limits.attempts <= 8 && limits.reviewCycles >= 1 && limits.reviewCycles <= 4 && limits.escalations <= 2 && limits.requests >= 1 && limits.requests <= 128, 'profile limits outside bounded policy');
    return { schemaVersion: 2, id: text(v.id), host: h, scope: 'subagent', guidance: { retrievedAt: date(g.retrievedAt), sources }, interpretation: text(v.interpretation), choices, fallbacks, qualifiedOverrides, legacyRoleModels, limits };
}
