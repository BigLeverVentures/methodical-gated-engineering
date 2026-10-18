import { assert, object, text, integer, hash, host, digest, type Host } from '../core/contracts.js';
export { assert, object, text, integer, hash, host };
export function exact(v: Record<string, unknown>, keys: string[]): void {
  assert(Object.keys(v).every(k => keys.includes(k)), 'unknown field');
}
export function positive(v: unknown): number { const n = integer(v); assert(n > 0, 'expected positive integer'); return n; }
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const o = object(v); return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  const s = JSON.stringify(v); assert(s !== undefined, 'non-JSON value'); return s;
}
export const fingerprint = (v: unknown): string => digest(canonical(v));
export type Cap = { microUsd: number; requests: number; generatedTokens: number };
export type Scope = { stage: string; host: Host; run: string };
export type Allocation = Scope & { cap: Cap };
export type GuardManifest = {
  schemaVersion: 1; mode: 'mock-only'; id: string; batchHash: string; tariffHash: string;
  expiresAt: number; maxConcurrent: number; deadlineMs: number; maxBodyBytes: number;
  total: Cap; stages: Record<string, Cap>; hosts: Record<Host, Cap>; allocations: Allocation[];
};
export function cap(value: unknown): Cap {
  const v = object(value); exact(v, ['microUsd','requests','generatedTokens']);
  return { microUsd: positive(v.microUsd), requests: positive(v.requests), generatedTokens: positive(v.generatedTokens) };
}
export function manifest(value: unknown): GuardManifest {
  const v = object(value); exact(v, ['schemaVersion','mode','id','batchHash','tariffHash','expiresAt','maxConcurrent','deadlineMs','maxBodyBytes','total','stages','hosts','allocations']);
  assert(v.schemaVersion === 1 && v.mode === 'mock-only', 'only offline mock authority is implemented');
  const stages = Object.fromEntries(Object.entries(object(v.stages)).map(([k,c]) => [text(k),cap(c)]));
  const h = object(v.hosts); exact(h, ['claude-code','codex']);
  assert(Array.isArray(v.allocations) && v.allocations.length > 0, 'missing allocations');
  const ids = new Set<string>();
  const allocations = v.allocations.map(x => {
    const a = object(x); exact(a,['stage','host','run','cap']);
    const stage = text(a.stage), run = text(a.run); assert(stages[stage], 'unknown stage');
    assert(!ids.has(run), 'duplicate run'); ids.add(run);
    return { stage, host: host(a.host), run, cap: cap(a.cap) };
  });
  const maxConcurrent = positive(v.maxConcurrent), maxBodyBytes = positive(v.maxBodyBytes), deadlineMs = positive(v.deadlineMs);
  assert(maxConcurrent <= 32 && maxBodyBytes <= 2_000_000 && deadlineMs <= 60_000, 'offline resource limit exceeded');
  return { schemaVersion:1, mode:'mock-only', id:text(v.id), batchHash:hash(v.batchHash), tariffHash:hash(v.tariffHash),
    expiresAt:positive(v.expiresAt),maxConcurrent,deadlineMs,maxBodyBytes,total:cap(v.total),stages,
    hosts:{'claude-code':cap(h['claude-code']),codex:cap(h.codex)},allocations };
}
export type Quote = { microUsd: number; inputTokens: number; generatedTokens: number; model: string; tariffHash: string; requestHash: string };
export type Usage = { inputTokens: number; outputTokens: number };
export function usage(value: unknown): Usage {
  const v = object(value); exact(v,['inputTokens','outputTokens']);
  return {inputTokens:integer(v.inputTokens),outputTokens:integer(v.outputTokens)};
}

export function freeze<T>(value:T):T {
  if(value!==null && typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
}
