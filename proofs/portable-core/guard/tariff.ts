import { assert, exact, object, text, positive, integer, fingerprint, type Quote, type Usage } from './contracts.js';
import type { Host } from '../core/contracts.js';
export type Rate = {
  host: Host; model: string; serviceInputMaximum: number; generatedMaximum: number;
  inputMicroPerMillion: number; outputMicroPerMillion: number;
};
// Offline synthetic tariff only. A published price is not an approved provider envelope.
export type Tariff = { schemaVersion: 1; mode: 'mock-only'; rates: Rate[] };
export function tariff(value: unknown): Tariff {
  const v = object(value); exact(v,['schemaVersion','mode','rates']);
  assert(v.schemaVersion === 1 && v.mode === 'mock-only' && Array.isArray(v.rates), 'mock tariff required');
  const seen = new Set<string>();
  const rates = v.rates.map((x): Rate => {
    const r = object(x); exact(r,['host','model','serviceInputMaximum','generatedMaximum','inputMicroPerMillion','outputMicroPerMillion']);
    assert(r.host === 'claude-code' || r.host === 'codex', 'unknown tariff host');
    const model = text(r.model); assert(model.startsWith('mock-'), 'synthetic model required');
    assert(!seen.has(model), 'duplicate model'); seen.add(model);
    const generatedMaximum = positive(r.generatedMaximum); assert(generatedMaximum <= 4000, 'generated envelope too large');
    return {host:r.host,model,serviceInputMaximum:positive(r.serviceInputMaximum),generatedMaximum,
      inputMicroPerMillion:positive(r.inputMicroPerMillion),outputMicroPerMillion:positive(r.outputMicroPerMillion)};
  });
  assert(rates.length > 0, 'empty tariff'); return {schemaVersion:1,mode:'mock-only',rates};
}
export function cost(rate: Rate, input: number, output: number): number {
  integer(input); integer(output);
  // BigInt avoids overflow before upward rounding to integer USD micro-units.
  const n = (BigInt(input)*BigInt(rate.inputMicroPerMillion) + BigInt(output)*BigInt(rate.outputMicroPerMillion) + 999_999n)/1_000_000n;
  assert(n <= BigInt(Number.MAX_SAFE_INTEGER), 'cost overflow'); return Number(n);
}
export function quote(t: Tariff, host: Host, model: string, body: unknown): Quote {
  const r = t.rates.find(x => x.model === model && x.host === host); assert(r,'model not allowlisted');
  return {model,tariffHash:fingerprint(t),requestHash:fingerprint(body),inputTokens:r.serviceInputMaximum,
    generatedTokens:r.generatedMaximum,microUsd:cost(r,r.serviceInputMaximum,r.generatedMaximum)};
}
export function actualCost(t: Tariff, q: Quote, u: Usage): number {
  const r = t.rates.find(x => x.model === q.model); assert(r && fingerprint(t) === q.tariffHash, 'tariff mismatch');
  integer(u.inputTokens); integer(u.outputTokens);
  assert(u.inputTokens <= q.inputTokens && u.outputTokens <= q.generatedTokens, 'usage exceeds reservation envelope');
  return cost(r,u.inputTokens,u.outputTokens);
}
