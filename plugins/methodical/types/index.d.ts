// The mod's session state (declared so `claude plugin validate` and `$.state` can name each key).
// Every value is plain JSON. The mod resets all of them at every `session.end`.
export type Handoff = 'current' | 'stale'

// One typed /compact being decided. `declined` is read by the after-compaction handler that runs
// inside the compaction; the attempt is removed by the handler that opened it.
export type Attempt = { nonce: string; declined: boolean }

// "Compound first, then compact for me": set when the checkpoint starts, `fired` when the mod has
// scheduled its own /compact, whose `args` carry `nonce`.
export type Chain = { nonce: string; fired: boolean }

declare module 'claude-code' {
  interface PluginState {
    methodical: {
      handoff: Handoff
      armed: boolean
      // Set when the first offer (at a percent of the window) showed in this cycle; reset at a boundary and at session end.
      early: boolean
      attempt: Attempt | null
      chain: Chain | null
      // `true` when the person chose "Chat about this": the next typed /compact goes through unasked.
      // `'declined'` when Esc closed the question after the host cancelled the command: the next typed
      // /compact goes through unasked and counts as a declined offer.
      pass: true | 'declined' | null
      prompts: string[]
    }
  }
}
