// Native protocol only. Policy, reservations and durable receipts belong to the core.
export type NativeHost = 'claude-code' | 'codex';
type JsonObject = Record<string, unknown>;
type Intent = {
    id: string;
    brief: string;
    decision: {
        action: string;
        setting: {
            model: string;
            effort: string;
        } | null;
    };
};
export interface NativeRuntime {
    intercept(root: string, id: string, context: unknown): Promise<Intent>;
    correlate(root: string, id: string, context: unknown): Promise<unknown>;
    stop(root: string, receipt: unknown): Promise<unknown>;
    complete(root: string, id: string, callback: unknown): Promise<unknown>;
}
const tag = '[methodical-intent';
const prefix = `${tag}:`;
const nativeReferenceTag = 'methodical_intent_';
const marker = /\[methodical-intent:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;
function object(value: unknown): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('unsupported native hook object');
    return value as JsonObject;
}
function required(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096)
        throw new Error(`missing native ${field}`);
    return value;
}
export function intentMarker(id: string): string {
    const value = `${prefix}${id}]`;
    if (intentId(value) !== id)
        throw new Error('invalid intent ID');
    return value;
}
export function intentId(prompt: string): string | null {
    if (!prompt.includes(tag))
        return null;
    const matches = [...prompt.matchAll(marker)];
    if (matches.length !== 1 || prompt.split(tag).length !== 2)
        throw new Error('malformed or repeated Methodical intent marker');
    return matches[0]![1]!;
}
// A Codex task name carries only the prepared identifier; it grants no dispatch authority.
export function intentNativeReference(id: string): string {
    intentMarker(id);
    return nativeReferenceTag + id.replaceAll('-', '');
}
function nativeReferenceId(value: unknown): string | null {
    if (typeof value !== 'string' || !value.includes(nativeReferenceTag))
        return null;
    if (!/^methodical_intent_[a-f0-9]{32}$/.test(value))
        throw new Error('malformed Methodical native reference');
    const hex = value.slice(nativeReferenceTag.length);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function markedInput(host: NativeHost, event: JsonObject): {
    input: JsonObject;
    id: string;
} | null {
    const tool = event.tool_input;
    if (tool === undefined)
        return null;
    const serialized = JSON.stringify(tool);
    // Only task_name carries the Codex reference. Plan/task prose is ordinary message data.
    const taskReference = host === 'codex' && tool !== null && typeof tool === 'object'
        ? (tool as JsonObject).task_name : undefined;
    if (!serialized.includes(tag) && !JSON.stringify(taskReference ?? null).includes(nativeReferenceTag))
        return null;
    const input = object(tool);
    const prompt = input[host === 'claude-code' ? 'prompt' : 'message'];
    if (typeof prompt !== 'string')
        throw new Error('marked invocation has unsupported native prompt schema');
    const promptId = intentId(prompt);
    const referenceId = host === 'codex' ? nativeReferenceId(input.task_name) : null;
    if (promptId && referenceId && promptId !== referenceId)
        throw new Error('conflicting Methodical dispatch references');
    const id = promptId ?? referenceId;
    if (!id)
        throw new Error('intent marker must be in the native prompt field');
    if (host === 'claude-code' ? event.tool_name !== 'Agent' : !['Agent', 'spawn_agent', 'collaborationspawn_agent'].includes(String(event.tool_name))) {
        throw new Error('marked invocation uses an unsupported native tool');
    }
    for (const field of host === 'claude-code' ? ['model', 'effort'] : ['model', 'reasoning_effort', 'fork_turns', 'task_name']) {
        if (input[field] !== undefined && typeof input[field] !== 'string')
            throw new Error(`unsupported native ${field} schema`);
    }
    if (host === 'codex' && input.fork_turns !== undefined && input.fork_turns !== 'all' && input.fork_turns !== 'none')
        throw new Error('unsupported native fork_turns value');
    return { input, id };
}
function stoppedOutcome(event: JsonObject): 'completed' | 'partial' | 'failed' | 'unknown' {
    // A stop callback alone does not distinguish maxTurns, failure and a complete child.
    switch (event.stop_reason) {
        case 'completed':
        case 'end_turn': return 'completed';
        case 'max_turns':
        case 'max_tokens': return 'partial';
        case 'error':
        case 'failed': return 'failed';
        default: return 'unknown';
    }
}
function observation(value: JsonObject): {
    observedModel: string | null;
    observedEffort: string | null;
} {
    const usage = value.usage && typeof value.usage === 'object' ? object(value.usage) : {};
    const effort = value.effort && typeof value.effort === 'object' ? object(value.effort) : {};
    return { observedModel: typeof usage.model === 'string' ? usage.model : null,
        observedEffort: typeof effort.level === 'string' ? effort.level : null };
}
export async function nativeHook(host: NativeHost, raw: unknown, runtime: NativeRuntime): Promise<JsonObject> {
    const event = object(raw);
    const name = event.hook_event_name;
    if (name === 'PermissionRequest')
        return {};
    if (name === 'SubagentStop') {
        if (typeof event.session_id !== 'string' || typeof event.agent_id !== 'string')
            return {};
        // Only explicit runtime usage is observation; requested/configured values are not.
        await runtime.stop(required(event.cwd, 'cwd'), { host, sessionId: event.session_id, childId: event.agent_id, terminal: true, outcome: stoppedOutcome(event),
            ...observation(event) });
        return {};
    }
    if (!['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(String(name)))
        return {};
    const marked = markedInput(host, event);
    if (!marked)
        return {};
    const root = required(event.cwd, 'cwd');
    const context = { host, sessionId: required(event.session_id, 'session_id'), toolUseId: required(event.tool_use_id, 'tool_use_id') };
    if (name === 'PreToolUse') {
        const intent = await runtime.intercept(root, marked.id, { ...context, requested: {
                model: marked.input.model ?? null, effort: marked.input[host === 'claude-code' ? 'effort' : 'reasoning_effort'] ?? null,
            } });
        if (!intent.decision.setting || intent.decision.action === 'stop')
            throw new Error('core declined native dispatch');
        const { model, effort } = intent.decision.setting;
        const updatedInput = host === 'claude-code'
            ? { ...marked.input, prompt: intent.brief, model, effort }
            : { ...marked.input, message: intent.brief, model, reasoning_effort: effort, fork_turns: 'none' };
        // Claude retains normal permission processing. Codex applies updatedInput only with
        // allow on this validated PreToolUse Agent call. No child permission fields change.
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput,
                ...(host === 'codex' ? { permissionDecision: 'allow' } : {}) } };
    }
    const response = event.tool_response;
    const value = response && typeof response === 'object' && !Array.isArray(response) ? object(response) : {};
    const childId = host === 'claude-code' ? value.agentId : value.agent_id;
    if (name === 'PostToolUseFailure' || typeof childId !== 'string' || childId.length === 0) {
        await runtime.complete(root, marked.id, { ...context, childId: null, outcome: 'unknown' });
        return {};
    }
    await runtime.correlate(root, marked.id, { ...context, childId,
        ...(host === 'claude-code' && value.status === 'async_launched' ? {background: true} : {}) });
    if (host === 'claude-code' && value.status !== 'async_launched') {
        // Synchronous Claude children can stop before their Agent response reaches the parent.
        // Only the explicit response status settles that call; an unfamiliar result stays debt.
        const outcomes: Record<string, 'completed' | 'partial' | 'failed'> = {
            completed: 'completed', partial: 'partial', max_turns: 'partial', max_turns_reached: 'partial', failed: 'failed', error: 'failed',
        };
        const outcome = typeof value.status === 'string' ? outcomes[value.status] ?? 'unknown' : 'unknown';
        await runtime.complete(root, marked.id, { ...context, childId, outcome, ...observation(value),
            ...(outcome === 'unknown' ? {} : {source: 'claude-agent-response'}) });
    }
    return {};
}
