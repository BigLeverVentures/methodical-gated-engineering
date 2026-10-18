import { createHash } from 'node:crypto';

export type Host = 'claude-code' | 'codex';
export type Level = 'none' | 'lean' | 'full';
export type Role = 'worker' | 'decider' | 'census' | 'backstop';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Setting = { model: string; effort: Effort };
export type EvidenceKind = 'simulated' | 'helper' | 'operator' | 'runtime' | 'configuration';
export type Evidence = { kind: EvidenceKind; ref: string; sha256: string };
export type Receipt = {
  requested: Setting | null; configured: Setting | null;
  observedModel: string | null; observedEffort: Effort | null;
  evidence: Evidence[];
};
export const kinds = ['decision-requested', 'decision-granted', 'seat-invoked', 'seat-completed',
  'acceptance-passed', 'acceptance-failed', 'finding', 'fixed', 'budget-stop',
  'checkpoint-published', 'checkpoint-stale', 'compaction-started', 'compaction-completed'] as const;
export type EventKind = typeof kinds[number];
export type ProofEvent = {
  schemaVersion: 1; eventId: string; runId: string; caseId: string; host: Host;
  sessionId: string; seatId: string; sequence: number; at: string; kind: EventKind;
  planHash: string; candidate: string; evidence: Evidence; data: Record<string, unknown>;
};
export type Profile = {
  schemaVersion: 1; id: string; host: Host; retrievedAt: string;
  scope: 'subagent'; sources: { url: string; contentHash: string; recommendation: string }[];
  interpretation: string; choices: Record<string, Setting>; fallbacks: string[];
};
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'expected object');
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  assert(typeof value === 'string' && value.trim().length > 0, 'expected nonempty string');
  return value;
}
export function integer(value: unknown): number {
  assert(Number.isSafeInteger(value) && (value as number) >= 0, 'expected nonnegative integer');
  return value as number;
}
export function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export function hash(value: unknown): string {
  const s = text(value); assert(/^[a-f0-9]{64}$/.test(s), 'expected SHA-256'); return s;
}
export function host(value: unknown): Host {
  assert(value === 'claude-code' || value === 'codex', 'unknown host'); return value;
}
export function level(value: unknown): Level {
  assert(value === 'none' || value === 'lean' || value === 'full', 'unknown assurance level'); return value;
}
export function effort(value: unknown): Effort {
  assert(['low', 'medium', 'high', 'xhigh', 'max'].includes(String(value)), 'unknown effort');
  return value as Effort;
}
export function setting(value: unknown): Setting {
  const v = object(value); return { model: text(v.model), effort: effort(v.effort) };
}
export function evidence(value: unknown): Evidence {
  const v = object(value);
  assert(['simulated','helper','operator','runtime','configuration'].includes(String(v.kind)), 'unknown evidence kind');
  return { kind: v.kind as EvidenceKind, ref: text(v.ref), sha256: hash(v.sha256) };
}
export function profile(value: unknown): Profile {
  const v = object(value); assert(v.schemaVersion === 1, 'unknown profile schema');
  assert(v.scope === 'subagent', 'profile scope must be explicit');
  assert(Array.isArray(v.sources) && v.sources.length > 0, 'profile needs official sources');
  const h = host(v.host);
  const sources = v.sources.map(s => {
    const x = object(s); const url = new URL(text(x.url));
    const allowed = h === 'codex' ? ['learn.chatgpt.com','developers.openai.com','platform.openai.com']
      : ['code.claude.com','claude.com','platform.claude.com'];
    assert(url.protocol === 'https:' && allowed.includes(url.hostname), 'unofficial baseline source');
    return { url: url.toString(), contentHash: hash(x.contentHash), recommendation: text(x.recommendation) };
  });
  const choices = Object.fromEntries(Object.entries(object(v.choices)).map(([k,s]) => [k, setting(s)]));
  for (const k of ['worker','demanding','decider','census','backstop','diligence','capability']) assert(choices[k], `missing ${k} choice`);
  assert(Array.isArray(v.fallbacks) && v.fallbacks.every(k => typeof k === 'string' && choices[k]), 'invalid fallbacks');
  assert(Number.isFinite(Date.parse(text(v.retrievedAt))), 'invalid source retrieval date');
  return { schemaVersion: 1, id: text(v.id), host: h, retrievedAt: v.retrievedAt as string,
    scope: 'subagent', sources, interpretation: text(v.interpretation), choices, fallbacks: v.fallbacks as string[] };
}
export function event(value: unknown): ProofEvent {
  const v = object(value); assert(v.schemaVersion === 1, 'unknown event schema');
  assert(kinds.includes(v.kind as EventKind), 'unknown event shape');
  const data = object(v.data); const kind = v.kind as EventKind;
  if (kind.startsWith('decision-')) {
    text(data.requestId); text(data.scope);
    assert(['implement','merge','spend'].includes(String(data.action)), 'unknown decision action');
    if (kind === 'decision-granted') assert(evidence(v.evidence).kind === 'operator', 'grant needs direct operator evidence');
  }
  if (['seat-invoked','seat-completed'].includes(kind)) { text(data.seat); }
  if (kind === 'finding' || kind === 'fixed') { text(data.findingId); }
  assert(Number.isFinite(Date.parse(text(v.at))), 'invalid event timestamp');
  return { schemaVersion: 1, eventId: text(v.eventId), runId: text(v.runId), caseId: text(v.caseId),
    host: host(v.host), sessionId: text(v.sessionId), seatId: text(v.seatId), sequence: integer(v.sequence),
    at: v.at as string, kind, planHash: hash(v.planHash), candidate: text(v.candidate), evidence: evidence(v.evidence), data };
}
export function validateStream(values: unknown[], runId: string, caseId: string): ProofEvent[] {
  const events = values.map(event); const ids = new Set<string>(); let seq = -1;
  const requests = new Map<string, ProofEvent>(); const seats = new Set<string>(); const findings = new Set<string>();
  for (const e of events) {
    assert(e.runId === runId && e.caseId === caseId, 'wrong run/case');
    assert(!ids.has(e.eventId) && e.sequence > seq, 'duplicate or out-of-order event');
    ids.add(e.eventId); seq = e.sequence;
    if (e.kind === 'decision-requested') requests.set(String(e.data.requestId), e);
    if (e.kind === 'decision-granted') {
      const r = requests.get(String(e.data.requestId));
      assert(r && r.planHash === e.planHash && r.data.action === e.data.action && r.data.scope === e.data.scope, 'stale or unrelated approval');
    }
    const key = `${e.host}:${e.sessionId}:${e.seatId}:${String(e.data.seat)}:${e.candidate}:${e.planHash}`;
    if (e.kind === 'seat-invoked') seats.add(key);
    if (e.kind === 'seat-completed') assert(seats.has(key), 'seat receipt lacks matching invocation');
    if (e.kind === 'finding') findings.add(String(e.data.findingId));
    if (e.kind === 'fixed') assert(findings.has(String(e.data.findingId)), 'fix without finding');
  }
  return events;
}
