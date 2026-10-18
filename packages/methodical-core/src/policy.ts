/** Bounded decision policy adapted from proofs/portable-core/core/policy.ts. */
import { assert, integer, level, role, stack, type Level, type Profile, type Role, type Setting, type Stack } from './contracts.js';
import { choiceSetting } from './profiles.js';
export type Failure = 'none' | 'environment' | 'diligence' | 'capability' | 'recurring' | 'format' | 'delivery' | 'unknown';
export type PolicyInput = {
    role: Role;
    risk: Level;
    stack: Stack;
    task: 'routine' | 'demanding' | 'deterministic';
    policy: 'guidance' | 'adaptive';
    failure: Failure;
    verifiedFeedback: boolean;
    attempts: number;
    reviewCycles: number;
    escalations: number;
    available: Setting[];
    rejectedModels: string[];
    remainingRequests: number;
};
export type Decision = {
    action: 'tool' | 'model' | 'stop';
    setting: Setting | null;
    reason: string;
    requiredSeats: string[];
    reviewDebt: string[];
};
export function requiredSeats(risk: Level, language: Stack = 'general'): string[] { level(risk); stack(language); return ['north-star', 'code-grounded', 'simplicity', 'rigor', `${language === 'general' || language === 'flutter' ? 'generic' : language}-correctness`, ...(risk === 'none' ? [] : ['backstop'])]; }
export function seatSetting(p: Profile, seat: string, risk: Level): Setting { const r: Role = seat === 'backstop' || (risk === 'full' && (seat === 'code-grounded' || seat === 'rigor' || seat.endsWith('-correctness'))) ? 'backstop' : seat === 'north-star' ? 'census' : seat === 'simplicity' ? 'worker' : 'decider'; return choiceSetting(p, r, r); }
export function decide(p: Profile, i: PolicyInput): Decision {
    role(i.role);
    level(i.risk);
    stack(i.stack);
    assert(['routine', 'demanding', 'deterministic'].includes(i.task), 'invalid task');
    assert(['guidance', 'adaptive'].includes(i.policy), 'invalid policy');
    assert(['none', 'environment', 'diligence', 'capability', 'recurring', 'format', 'delivery', 'unknown'].includes(i.failure), 'invalid failure');
    for (const n of [i.attempts, i.reviewCycles, i.escalations, i.remainingRequests])
        integer(n);
    const seats = requiredSeats(i.risk, i.stack), result = (action: Decision['action'], selected: Setting | null, reason: string): Decision => ({ action, setting: selected, reason, requiredSeats: seats, reviewDebt: [...seats] });
    if (['environment', 'format', 'delivery', 'unknown'].includes(i.failure))
        return result('stop', null, `diagnose ${i.failure}; no reasoning escalation`);
    if (i.task === 'deterministic')
        return result('tool', null, 'run deterministic check');
    if (i.remainingRequests === 0 || i.attempts >= p.limits.attempts || i.reviewCycles >= p.limits.reviewCycles)
        return result('stop', null, 'durable attempt/cycle/request limit');
    const changing = i.failure !== 'none' && i.policy === 'adaptive';
    if (changing) {
        assert(i.verifiedFeedback, 'escalation requires freshly reproduced bound feedback');
        if (i.escalations >= p.limits.escalations)
            return result('stop', null, 'adaptive escalation limit');
    }
    const key = changing ? (i.failure === 'diligence' ? 'diligence' : 'capability') : i.role === 'worker' && i.task === 'demanding' ? 'demanding' : i.role;
    const selected = choiceSetting(p, key, i.role), allowed = (s: Setting) => !i.rejectedModels.includes(s.model) && i.available.some(a => a.model === s.model && a.effort === s.effort);
    if (allowed(selected))
        return result('model', selected, changing ? `verified ${i.failure} adjustment` : 'dated guidance with explicit profile overrides');
    const seen = new Set([selected.model, ...i.rejectedModels]);
    for (const name of p.fallbacks) {
        const s = choiceSetting(p, name, i.role);
        if (seen.has(s.model))
            continue;
        seen.add(s.model);
        if (allowed(s))
            return result('model', s, 'distinct supported fallback; required review remains owed');
    }
    return result('stop', null, 'no distinct supported setting; required review remains owed');
}
export type ContextReading = {
    used: number;
    window: number;
    compactAt: number | null;
    source: 'observed' | 'estimated' | 'cumulative';
};
export function headroom(r: ContextReading | null): {
    remaining: number | null;
    certainty: string;
} { if (!r || r.source === 'cumulative' || !Number.isFinite(r.used) || !Number.isFinite(r.window) || r.used < 0 || r.window <= 0 || r.used > r.window)
    return { remaining: null, certainty: 'unknown' }; if (r.compactAt === null || !Number.isFinite(r.compactAt) || r.compactAt <= 0 || r.compactAt > r.window)
    return { remaining: null, certainty: 'unknown threshold' }; return { remaining: Math.max(0, r.compactAt - r.used), certainty: r.source }; }
