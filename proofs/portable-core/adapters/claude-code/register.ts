// Native observation only. No filesystem, model calls, or second orchestration loop.
async function log($: any, data: unknown): Promise<void> {
  try { await $.ui.log(JSON.stringify(data), { to: 'debug' }); } catch { /* receipt remains unavailable */ }
}
export const register = (on: any): void => {
  on('agent.spawn', async ($: any, e: any, next: any) => {
    const result = await next(e);
    await log($,{event:'spawn',toolUseId:e.tool_use_id ?? null,requestedModel:e.model ?? null,
      agentId:result.agentId ?? null,resolvedModel:result.model ?? null,denied:result.deny ?? null});
    return result;
  });
  on('turn.complete', async ($: any, e: any, next: any) => {
    await log($,{event:'last-response',agentId:e.agentId ?? null,turnId:e.turnId,
      observedModel:e.usage?.model ?? null});
    return next(e);
  });
  on('classic.SubagentStop', async ($: any, e: any, next: any) => {
    await log($,{event:'stop',agentId:e.agent_id ?? null,effectiveEffort:e.effort?.level ?? null});
    return next(e);
  });
  on('turn.step', async function* ($: any, e: any, next: any) {
    // session.usage has no agent selector: only attach its snapshot to main-loop steps.
    let context: unknown = null;
    if (e.agentId === undefined || e.agentId === null) {
      try { context = (await $.session.usage({breakdown:'summary'})).context ?? null; }
      catch { /* missing observation stays unknown */ }
    }
    const result = yield* next(e);
    try {
      await $.ui.log(JSON.stringify({
        event:'response', agentId:e.agentId ?? null, turnId:e.turnId, index:e.index,
        requestedModel:e.model, requestedEffort:e.effort ?? null,
        observedModel:result.usage?.model ?? null, usage:result.usage ?? null,
        stopReason:result.stopReason ?? null,
        contextBefore:context, contextProvenance:'estimated-local-summary', contextScope:context === null ? null : 'session-main'
      }), {to:'debug'});
    } catch { /* observer failure must never replay a request */ }
    return result;
  });
};
