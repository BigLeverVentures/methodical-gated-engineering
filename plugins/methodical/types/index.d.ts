// The mod's session state (declared so `claude plugin validate` and `$.state` can name each key).
// Every value is plain JSON. The mod resets all of them at every `session.end`.
// The native state declaration is self-contained; the runtime adapters own the measurement policy.
export type ContextReading = { window: number; occupied: number; source: string; model: string }
export type StartupLoad = { tokens: number; kind: 'first-request input, including the first prompt' | 'before the first prompt' }

export type Handoff = 'current' | 'stale'

// One typed /compact being decided. `declined` is read by the after-compaction handler that runs
// inside the compaction; the attempt is removed by the handler that opened it.
export type Attempt = { nonce: string; declined: boolean }

// Session-local authorization for one native /compact. A checkpoint must finalize before
// transitioning to ready.
export type CompactChain =
  | { token: string; stage: 'queued' | 'starting' | 'ready' | 'choose' | 'declined' }
  | { token: string; stage: 'checkpoint'; turnId: string }

declare module 'claude-code' {
  interface PluginState {
    methodical: {
      handoff: Handoff
      armed: boolean
      // Set when the first offer (at a percent of the window) showed in this cycle; reset at a boundary and at session end.
      early: boolean
      attempt: Attempt | null
      chain: CompactChain | null
      // `true` when the person chose "Chat about this": the next typed /compact goes through unasked.
      // `'declined'` when Esc closed the question after the host cancelled the command: the next typed
      // /compact goes through unasked and counts as a declined offer.
      pass: true | 'declined' | null
      prompts: string[]
      context: {
        model: string
        turnId: string
        pending: boolean
        firstRequest: boolean
        steps: number
        reading: ContextReading | null
        startup: StartupLoad | null
      } | null
      freshContext: 'startup' | 'boundary' | null
    }
  }
}
