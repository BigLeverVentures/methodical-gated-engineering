import { object, type Receipt, type Evidence } from '../../core/contracts.js';
export function claudeReceipt(raw: unknown, evidence: Evidence): Receipt {
  const x=object(raw); const usage=x.usage === undefined ? {} : object(x.usage);
  const effective=x.effort === undefined ? {} : object(x.effort);
  const effort=effective.level;
  return { requested:null,configured:null,
    observedModel:evidence.kind === 'runtime' && typeof usage.model === 'string' ? usage.model : null,
    observedEffort:evidence.kind === 'runtime' && ['low','medium','high','xhigh','max'].includes(String(effort)) ? effort as Receipt['observedEffort'] : null,
    evidence:[evidence] };
}
