import { object, setting, type Receipt, type Evidence } from '../../core/contracts.js';
export function codexReceipt(raw: unknown, evidence: Evidence): Receipt {
  const x=object(raw);
  const configured=typeof x.model === 'string' && typeof x.reasoningEffort === 'string'
    ? setting({model:x.model,effort:x.reasoningEffort}) : null;
  return { requested:null,configured,
    observedModel:evidence.kind === 'runtime' && x.hook_event_name !== undefined && typeof x.model === 'string' ? x.model : null,
    observedEffort:null,evidence:[evidence] };
}
