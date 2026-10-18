import { assert, type Level, type Profile, type Role, type Setting } from './contracts.js';
export type Failure = 'none' | 'environment' | 'diligence' | 'capability' | 'recurring';
export type PolicyInput = {
  role: Role; risk: Level; task: 'routine' | 'demanding' | 'deterministic';
  policy: 'guidance' | 'adaptive'; failure: Failure; evidenceIds: string[];
  attempts: number; reviewCycles: number; escalations: number;
  available: Setting[]; rejectedModels: string[]; remainingRequests: number;
};
export type Decision = { action: 'tool' | 'model' | 'stop'; setting: Setting | null;
  reason: string; evidenceIds: string[]; requiredSeats: string[]; reviewDebt: string[] };
export function requiredSeats(risk: Level): string[] {
  return ['north-star','code-grounded','simplicity','rigor','python-correctness', ...(risk === 'none' ? [] : ['backstop'])];
}
export function seatSetting(p: Profile, seat: string, risk: Level): Setting {
  const key = seat === 'backstop' || (risk === 'full' && ['code-grounded','rigor','python-correctness'].includes(seat))
    ? 'backstop' : seat === 'north-star' ? 'census' : seat === 'simplicity' ? 'worker' : 'decider';
  return p.choices[key]!;
}
export function decide(p: Profile, i: PolicyInput): Decision {
  assert(['worker','decider','census','backstop'].includes(i.role), 'invalid role');
  assert(['none','lean','full'].includes(i.risk), 'invalid risk');
  assert(['routine','demanding','deterministic'].includes(i.task), 'invalid task');
  assert(['guidance','adaptive'].includes(i.policy), 'invalid policy');
  assert(['none','environment','diligence','capability','recurring'].includes(i.failure), 'invalid failure');
  for (const v of [i.attempts,i.reviewCycles,i.escalations,i.remainingRequests]) assert(Number.isSafeInteger(v) && v >= 0, 'invalid policy counter');
  const seats = requiredSeats(i.risk);
  const result = (action: Decision['action'], selected: Setting | null, reason: string): Decision => ({
    action, setting: selected, reason, evidenceIds: i.evidenceIds, requiredSeats: seats,
    reviewDebt: action === 'stop' ? seats : [] });
  if (i.failure === 'environment') return result('stop', null, 'repair environment; do not retry reasoning');
  if (i.task === 'deterministic') return result('tool', null, 'run deterministic check');
  if (i.remainingRequests === 0 || i.attempts >= 2 || i.reviewCycles >= 2) return result('stop', null, 'proof attempt/cycle/request limit');
  const changing = i.failure !== 'none' && i.policy === 'adaptive';
  if (changing) {
    assert(i.evidenceIds.length > 0, 'escalation requires evidence');
    if (i.escalations >= 1) return result('stop', null, 'adaptive escalation limit');
  }
  const baseline = i.role === 'worker' && i.task === 'demanding' ? 'demanding' : i.role;
  const key = changing ? (i.failure === 'diligence' ? 'diligence' : 'capability') : baseline;
  const selected = p.choices[key]!;
  const allowed = (s: Setting): boolean => !i.rejectedModels.includes(s.model) &&
    i.available.some(a => a.model === s.model && a.effort === s.effort);
  if (allowed(selected)) return result('model', selected, changing ? `escalate for ${i.failure}` : 'published-guidance baseline');
  // A fallback is diagnostic work with outstanding required review, never a substitute pass.
  const seen = new Set<string>([selected.model, ...i.rejectedModels]);
  for (const name of p.fallbacks) {
    const s = p.choices[name]!;
    if (seen.has(s.model)) continue;
    seen.add(s.model);
    if (allowed(s)) return { ...result('model', s, 'explicit fallback; required review remains owed'), reviewDebt: seats };
  }
  return result('stop', null, 'no distinct supported setting; review remains owed');
}
export type ContextReading = { used: number; window: number; compactAt: number | null; source: 'observed' | 'estimated' | 'cumulative' };
export function headroom(r: ContextReading | null): { remaining: number | null; certainty: string } {
  if (!r || r.source === 'cumulative' || !Number.isFinite(r.used) || !Number.isFinite(r.window) || r.used < 0 || r.window <= 0 || r.used > r.window)
    return { remaining: null, certainty: 'unknown' };
  const threshold = r.compactAt;
  if (threshold === null || !Number.isFinite(threshold) || threshold <= 0 || threshold > r.window)
    return { remaining: null, certainty: 'unknown threshold' };
  return { remaining: Math.max(0, threshold - r.used), certainty: r.source };
}
