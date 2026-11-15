import { tokenCount } from './context-policy'

// Pure helpers for the compaction mod (register.ts). No engine calls here, so each can be tested
// on its own. The module environment has no Node: nothing below imports anything.

export const QUESTION = 'Before we compact, would you like to compound first?'
export const OPTION_COMPOUND = 'Compound first'
export const OPTION_SKIP = 'Skip and compact'
export const CHECKPOINT = '/methodical:compound checkpoint'

// Interpret only whole affirmative requests so quotations and additional work stay in chat.
export function compactRequest(text: string): 'choose' | 'declined' | 'checkpoint' | null {
  const request = text.trim().toLowerCase().replace(/[.!]+$/, '')
  if (/^(?:please +)?compact(?: +please)?$/.test(request)) return 'choose'
  if (/^(?:no,? +)?(?:please +)?just +compact(?: +please)?$/.test(request)) return 'declined'
  if (/^(?:yes,? +)?(?:please +)?compound(?: +first)?(?:,? +(?:and(?: +then)?|then)) +compact(?: +for me| +please)?$/.test(request))
    return 'checkpoint'
  return null
}

export const COMPACT_TOKEN = /^methodical-compact-[a-f0-9]{16}$/

// Portable checkpoint currency comes from the verified finalizer invocation.
// Keep one supported shell form so suffix commands, substitutions and wrapper scripts cannot look like it.
export function finalizerCall(command: unknown, root: string): boolean {
  if (typeof command !== 'string') return false
  const match = /^node "([^"\n\r]+)\/runtime\/src\/cli\.js" checkpoint-finalize "([^"\n\r]+)" claude-code "([^"\n\r]+)"$/.exec(command)
  if (!match) return false
  const [, packageRoot, repo, input] = match
  if (!packageRoot || !repo || !input || repo !== root) return false
  const safe = (value: string): boolean => !/[`$\\\0]/.test(value)
  return (packageRoot === '${CLAUDE_PLUGIN_ROOT}' || (packageRoot.startsWith('/') && safe(packageRoot))) &&
    safe(repo) && safe(input) && input.startsWith(root + '/.methodical/evidence/') &&
    !input.split('/').some(part => part === '.' || part === '..')
}
export type FinalizationReceipt = { generation: string; checkpointHash: string }
export function finalizationReceipt(output: unknown, root: string): FinalizationReceipt | null {
  try {
    if (typeof output !== 'string' || output.length > 8192) return null
    const r = JSON.parse(output)
    if (!r || r.schemaVersion !== 1 || r.kind !== 'methodical-checkpoint-finalized' || r.host !== 'claude-code' ||
      r.root !== root || r.current !== true || !/^\d+-[a-f0-9]{16}$/.test(r.generation) || !/^[a-f0-9]{64}$/.test(r.checkpointHash)) return null
    return { generation: r.generation, checkpointHash: r.checkpointHash }
  } catch { return null }
}
export function matchingPointer(bytes: string, receipt: FinalizationReceipt): boolean {
  try { const p = JSON.parse(bytes); return p.schemaVersion === 1 && p.generation === receipt.generation && p.sha256 === receipt.checkpointHash }
  catch { return false }
}
export function finalizationResume(bytes: string, receipt: FinalizationReceipt): { source: string; archive: string; plan: {source:string;archive:string} } | null {
  try {
    const c = JSON.parse(bytes), w = c.work, b = w.binding
    if (c.schemaVersion !== 2 || c.generation !== receipt.generation || !/^[a-f0-9]{64}$/.test(w.planHash) ||
      b.plan.sha256 !== w.planHash || b.repositoryIdentity !== c.repo.identity) return null
    const r = c.capture.records.find((r: any) => r.ref === 'methodical:resume')
    const safe = (value: unknown): value is string => typeof value === 'string' && value.length > 0 &&
      !value.startsWith('/') && !/[\\\0]/.test(value) && !value.split('/').some(part => part === '' || part === '.' || part === '..')
    if (!r || r.kind !== 'local' || r.required !== true || !safe(r.source) || !r.source.endsWith('/resume.md') ||
      !safe(r.archive) || !r.archive.startsWith('evidence/') || !/^[a-f0-9]{64}$/.test(r.sha256) || c.payload[r.archive] !== r.sha256 ||
      !w.captures.some((x: any) => x.kind === 'local' && x.required === true && x.ref === r.ref && x.source === r.source && x.archive === r.archive)) return null
    const plan=c.capture.records.find((x:any)=>x.ref==='methodical:active-plan')
    if(!/^[a-f0-9]{64}$/.test(b.repositoryIdentity) || !safe(b.plan.path) || !plan || plan.kind!=='local' || plan.required!==true || plan.source!==b.plan.path || plan.sha256!==w.planHash || !safe(plan.archive) || !plan.archive.startsWith('evidence/') || c.payload[plan.archive]!==w.planHash)return null
    return { source: r.source, archive: r.archive, plan: {source:plan.source,archive:plan.archive} }
  } catch { return null }
}

// The person's own prompt: a closed set. A task notification, peer, scheduled, plugin or
// unclassified prompt is none of these.
export function isPersonPrompt(origin: { kind?: string } | undefined): boolean {
  const kind = origin?.kind
  return kind === 'composer' || kind === 'bridge' || kind === 'sdk'
}

export const LINE_NEUTRAL = 'Compaction paused. Run /compact to try again, or say “just compact”.'

export function compactChoice(answer: unknown): 'compound' | 'skip' | null {
  if (typeof answer !== 'string') return null
  const label = answer.trim().replace(/^[12][.)]\s+/, '').toLowerCase()
  if (label === OPTION_COMPOUND.toLowerCase()) return 'compound'
  if (label === OPTION_SKIP.toLowerCase() || compactRequest(label) === 'declined') return 'skip'
  return null
}

export const STEER =
  'Keep, in the summary: the lessons learned that are not yet written up, the user\'s rulings verbatim, the unresolved questions, and a pointer to the resume point (docs/resume.md or docs/private/resume.md).'
export const STEER_DECLINED =
  ' The user chose to compact without compounding for this compaction only; do not re-offer it for this compaction.'

// Compaction instructions, including the verified resume location when available.
export function steered(instructions: string | undefined, declined: boolean, resume?: string): string {
  const base = instructions ?? ''
  const path = resume ? ` The verified resume point is at ${resume}. Read it on continuation.` : ''
  return `${base ? `${base}\n` : ''}${STEER}${declined ? STEER_DECLINED : ''}${path}`
}

// Both offers (the first, at a percent of the window, and the last, before the host's threshold) say
// the same thing: a checkpoint is a good move now, and compacting is the user's to decide.
export const CUE =
  '[methodical] The context is filling up and the handoff is not current. In your next reply, tell the user in one sentence that this is a good time to run /methodical:compound checkpoint, and that compacting is theirs to decide. Do not run it unless they ask.'
export const NUDGE_TOAST =
  'Context is filling up: a good time to run /methodical:compound checkpoint. Compacting is up to you.'

// The note added after a compaction. When the last offer already showed in this cycle the user has
// been offered the checkpoint, so the note keeps only the pointer to the earlier conversation (or is
// null when there is no path to point at).
export function afterLine(transcriptPath: string | undefined, warned = false): string | null {
  const where = transcriptPath
    ? ` The earlier conversation is at ${JSON.stringify(String(transcriptPath))}; read it from the end in small pieces, never whole.`
    : ''
  if (warned) return where ? `[methodical] A compaction just ran.${where} Say nothing to the user about this.` : null
  return (
    '[methodical] A compaction just ran. If the summary lists non-obvious lessons that are not yet written up in docs/solutions/, and does not show that the user chose to skip compounding, tell the user in one sentence that /methodical:compound checkpoint can write them up.' +
    where +
    ' Do not run it unless they ask. Otherwise say nothing about this.'
  )
}

export const DEFAULT_RESERVE = 120000
export const DEFAULT_PERCENT = 45

// The first offer's share of the model's window: a finite number from 1 to 100, else the default.
export function usablePercent(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100 ? value : DEFAULT_PERCENT
}

// The lead before the host's threshold, in tokens: a positive finite value, else the default, and
// never more than a fifth of the threshold (so a small window cannot offer at the start) or less than one.
export function usableReserve(value: unknown, threshold: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_RESERVE
  return Math.max(1, Math.min(n, Math.floor(threshold / 5)))
}

export const earlyLine = (window: number, percent: number): number => (window * percent) / 100
export const lateLine = (threshold: number, reserve: number): number => threshold - reserve

// What the guard reads: tokens used and the model's window, and the host's compaction threshold
// (the window itself when auto-compact is off; null when it is on but no threshold is reported).
// Null when a figure is missing or cannot be a count.
export function contextFigures(b: {
  totalTokens?: number
  autoCompactThreshold?: number
  isAutoCompactEnabled?: boolean
}, windowSize: number | undefined): { used: number; window: number; threshold: number | null } | null {
  const used = b.totalTokens
  if (!tokenCount(used)) return null
  if (!tokenCount(windowSize) || windowSize === 0) return null
  const reported = b.autoCompactThreshold
  const threshold = b.isAutoCompactEnabled
    ? tokenCount(reported) && reported > 0 ? reported : null
    : windowSize
  return { used, window: windowSize, threshold }
}

// A 16-hex-digit nonce. Not a secret: it only tells this mod's own chained /compact from text.
export function newNonce(): string {
  let out = ''
  for (let i = 0; i < 16; i += 1) out += Math.floor(Math.random() * 16).toString(16)
  return out
}
