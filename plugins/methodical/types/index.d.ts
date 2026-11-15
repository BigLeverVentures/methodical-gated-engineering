// The mod's session state (declared so `claude plugin validate` and `$.state` can name each key).
// Every value is plain JSON. The mod resets all of them at every `session.end`.
// The native state declaration is self-contained; the runtime adapters own the measurement policy.
export type ContextReading = { window: number; occupied: number; source: string; model: string }
export type StartupLoad = { tokens: number; kind: 'first-request input, including the first prompt' | 'before the first prompt' }

export type ResumePath = 'docs/resume.md' | 'docs/private/resume.md'

export type Handoff = 'stale' | {
  root: string
  path: ResumePath
  contents: string
  portable?: { pointer: string; planPath: string; planContents: string }
}

export type Attempt = { nonce: string; declined: boolean }
export type ResumeBefore = { kind: 'absent' } | { kind: 'unavailable' } | { kind: 'read'; contents: string }
export type CompoundTurn = { stage: 'queued'; token: string } | { stage: 'submitted' } | { stage: 'settling'; turnId: string } | {
  stage: 'running'
  turnId: string
  root: string
  before: Record<ResumePath, ResumeBefore>
}
export type CompactRequest = { token: string; choice: 'choose' | 'declined' }

declare module 'claude-code' {
  interface PluginState {
    methodical: {
      handoff: Handoff
      armed: boolean
      // Set when the first offer (at a percent of the window) showed in this cycle; reset at a boundary and at session end.
      early: boolean
      attempt: Attempt | null
      compactRequest: CompactRequest | null
      compoundTurn: CompoundTurn | null
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
