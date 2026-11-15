// Methodical offers compounding before manual compaction and verifies a saved handoff in the owning session.
import type { PluginState, Register } from 'claude-code'
import {
  CHECKPOINT,
  COMPACT_TOKEN,
  compactRequest,
  CUE,
  NUDGE_TOAST,
  OPTION_SKIP,
  compactChoice,
  OPTION_COMPOUND,
  QUESTION,
  afterLine,
  contextFigures,
  earlyLine,
  isPersonPrompt,
  finalizerCall,
  finalizationReceipt,
  matchingPointer,
  finalizationResume,
  lateLine,
  LINE_NEUTRAL,
  newNonce,
  steered,
  usablePercent,
  usableReserve,
} from './logic'
import { contextStatus, minimumOfferWindow, tokenCount } from './context-policy'
import type { StartupLoad } from './context-policy'

// The state refs are literals in source, as `$.state` requires.
const HANDOFF = { plugin: 'methodical', key: 'handoff' } as const
const ARMED = { plugin: 'methodical', key: 'armed' } as const
const EARLY = { plugin: 'methodical', key: 'early' } as const
const ATTEMPT = { plugin: 'methodical', key: 'attempt' } as const
const NATIVE_REQUEST = { plugin: 'methodical', key: 'compactRequest' } as const
const COMPOUND_TURN = { plugin: 'methodical', key: 'compoundTurn' } as const
const CONTEXT = { plugin: 'methodical', key: 'context' } as const
const FRESH_CONTEXT = { plugin: 'methodical', key: 'freshContext' } as const

type ObservedContext = NonNullable<PluginState['methodical']['context']>
type NativeRequest = NonNullable<PluginState['methodical']['compactRequest']>
type RunningCompound = Extract<NonNullable<PluginState['methodical']['compoundTurn']>, { stage: 'running' }>
type Handoff = Exclude<PluginState['methodical']['handoff'], 'stale'>
type ResumePath = Handoff['path']
type ResumeBefore = RunningCompound['before'][ResumePath]
const resumePaths = ['docs/resume.md', 'docs/private/resume.md'] as const

const isMain = (e: { agentId?: string | null }): boolean => e.agentId === undefined || e.agentId === null

// The handoff is lost. The write always lands (it bumps the version, so a finalization that began
// earlier cannot then make it current: stale wins), and the last offer is armed again when it
// was current.
async function loseHandoff($: any): Promise<void> {
  for (;;) {
    const held = await $.state.get(HANDOFF)
    const wrote = await $.state.set(HANDOFF, 'stale', { ifVersion: held.version })
    if (wrote.isSet === false) continue // another write landed between the read and this one: read again
    if (held.value && held.value !== 'stale') await $.state.set(ARMED, true)
    return
  }
}

async function resetAll($: any): Promise<void> {
  await $.state.set(CONTEXT, null)
  await $.state.set(FRESH_CONTEXT, null)
  await $.state.set(HANDOFF, 'stale')
  await $.state.set(ARMED, true)
  await $.state.set(EARLY, false)
  await $.state.set(ATTEMPT, null)
  await $.state.set(NATIVE_REQUEST, null)
  await $.state.set(COMPOUND_TURN, null)
}

async function resumeBefore($: any, root: string, path: ResumePath): Promise<ResumeBefore> {
  try {
    const contents = await $.fs.read(root + '/' + path)
    return typeof contents === 'string' ? { kind: 'read', contents } : { kind: 'unavailable' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return /^(?:methodical: \$\.fs\.read(?:\([^\r\n]*\) failed)?: )?ENOENT$/.test(message)
      ? { kind: 'absent' }
      : { kind: 'unavailable' }
  }
}

async function currentHandoff($: any): Promise<Handoff | undefined> {
  const held = await $.state.get(HANDOFF)
  const handoff: Handoff | 'stale' | undefined = held.value
  if (!handoff || typeof handoff !== 'object' || await $.session.root() !== handoff.root) return
  const { root, path, contents, portable } = handoff
  if (await $.fs.read(root + '/' + path).catch(() => null) !== contents) return
  if (portable) {
    if (await $.fs.read(root + '/.methodical/checkpoint-current.json').catch(() => null) !== portable.pointer ||
        await $.fs.read(root + '/' + portable.planPath).catch(() => null) !== portable.planContents) return
  }
  if ((await $.state.get(HANDOFF)).version === held.version) return handoff
}

async function finishCompound($: any, turn: RunningCompound, version: unknown) {
  const portable = await currentHandoff($)
  if (portable?.portable && (await $.state.get(HANDOFF)).version === version) {
    $.ui.toast('Resume point saved and portable checkpoint verified. Run /compact when you are ready.')
    return
  }
  const after = await Promise.all(resumePaths.map(async path => ({
    path, result: await resumeBefore($, turn.root, path), before: turn.before[path],
  })))
  const changed = after.filter(({ result, before }) => result.kind === 'read' && result.contents.trim() &&
    (before.kind === 'absent' || (before.kind === 'read' && before.contents !== result.contents)))
  const saved = changed[0]
  const ambiguous = after.some(({ result, before }) => result.kind === 'unavailable' ||
    (result.kind === 'read' && before.kind === 'unavailable'))
  if (changed.length === 1 && !ambiguous && saved?.result.kind === 'read') {
    const wrote = await $.state.set(HANDOFF, { root: turn.root, path: saved.path, contents: saved.result.contents }, { ifVersion: version })
    if (wrote.isSet) {
      $.ui.toast('Resume point saved. Run /compact when you are ready. The portable checkpoint could not be verified.')
      return
    }
  }
  $.ui.toast('Could not verify a newly saved resume point. Check the handoff before running /compact.')
}

// Claude refuses a command call directly from prompt.submit.
function scheduleNativeCompact($: any, request: NativeRequest) {
  void $.clock.after(0, async () => {
    const held = await $.state.get(NATIVE_REQUEST)
    if (held.value?.token !== request.token) return
    try {
      await $.command.run({ command: 'compact', args: request.token })
    } catch {
      await $.state.set(NATIVE_REQUEST, null, { ifVersion: held.version })
      $.ui.toast('Could not compact. Try /compact.')
    }
  })
}

// Reserve the next compound before releasing the menu. The native command starts a separate turn.
async function queueCheckpoint($: any, deferred = false): Promise<boolean> {
  const held = await $.state.get(COMPOUND_TURN)
  if (held.value) return false
  const token = newNonce()
  if (!(await $.state.set(COMPOUND_TURN, { stage: 'queued', token }, { ifVersion: held.version })).isSet) return false

  const launch = async () => {
    const queued = await $.state.get(COMPOUND_TURN)
    if (queued.value?.stage !== 'queued' || queued.value.token !== token) return
    try {
      await $.command.run({ command: 'methodical:compound', args: 'checkpoint' })
    } catch {
      $.ui.toast(`Could not start the checkpoint: run ${CHECKPOINT}, then /compact.`)
      const box = await $.prompt.read().catch(() => null)
      if (box?.text === '') await $.prompt.fill({ text: CHECKPOINT, mode: 'replace' }).catch(() => undefined)
    } finally {
      await $.state.set(COMPOUND_TURN, null, { ifVersion: queued.version })
    }
  }
  if (deferred) void $.clock.after(0, launch)
  else void launch().catch(() => undefined)
  return true
}

async function readFigures($: any): Promise<ReturnType<typeof contextFigures>> {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    return context?.breakdown ? contextFigures(context.breakdown, context.window) : null
  } catch {
    return null
  }
}

const observed = (model: string, figures: NonNullable<ReturnType<typeof contextFigures>>) =>
  ({ model, window: figures.window, occupied: figures.used, source: 'Claude Code session usage summary' })

async function observeStep($: any, model: unknown, turnId: string) {
  const held = await $.state.get(CONTEXT)
  const prior: ObservedContext | null | undefined = held.value
  const boundary = (await $.state.get(FRESH_CONTEXT)).value
  if (boundary) await $.state.set(FRESH_CONTEXT, null)
  if (typeof model !== 'string' || !model) {
    await $.state.set(CONTEXT, null)
    return null
  }
  // The usage cache can still contain the last request made under the previous model.
  const pending = boundary === 'boundary' || (!!prior && (prior.model !== model || prior.pending))
  const figures = pending ? null : await readFigures($)
  const next: ObservedContext = {
    model, turnId, pending,
    reading: figures ? observed(model, figures) : null,
    startup: prior?.model === model ? prior.startup : null,
    firstRequest: boundary === 'startup' || (!!prior?.firstRequest && prior.turnId === turnId && prior.model === model),
    steps: prior?.turnId === turnId && prior.model === model ? prior.steps + 1 : 1,
  }
  const wrote = await $.state.set(CONTEXT, next, { ifVersion: held.version })
  return wrote.isSet ? figures : null
}

// Claude reports the components of turn usage. With exactly one request this is first-request
// input including the prompt; billable uncached input alone is not the context loaded.
function requestInput(usage: any): number | null {
  const from = [usage?.input_tokens, usage?.cache_creation_input_tokens, usage?.cache_read_input_tokens]
  if (!from.every(tokenCount)) return null
  const total = from.reduce((sum, value) => sum + value, 0)
  return tokenCount(total) && total > 0 ? total : null
}

async function observeComplete($: any, e: { turnId: string; reason: string; isAborted: boolean; usage?: unknown }) {
  const held = await $.state.get(CONTEXT)
  const state: ObservedContext | null | undefined = held.value
  if (!state || state.turnId !== e.turnId) return
  const input = e.reason === 'answer' && !e.isAborted ? requestInput(e.usage) : null
  const figures = (!state.pending || input !== null) ? await readFigures($) : null
  const startup: StartupLoad | null = state.firstRequest && state.steps === 1 && input !== null
    ? { tokens: input, kind: 'first-request input, including the first prompt' }
    : state.startup
  const wrote = await $.state.set(CONTEXT, {
    ...state, startup, firstRequest: false, pending: state.pending && !figures,
    reading: figures ? observed(state.model, figures) : null,
  }, { ifVersion: held.version })
  return wrote.isSet && input !== null ? figures : null
}

// Two offers, each at most once per cycle, neither ever compacting.
async function nudge($: any, figures: NonNullable<ReturnType<typeof contextFigures>>, percent: unknown, reserve: unknown): Promise<void> {
  const armed = (await $.state.get(ARMED)).value
  if (armed === false) return
  if (await currentHandoff($)) return
  const share = usablePercent(percent)
  const last = figures.threshold === null ? null : lateLine(figures.threshold, usableReserve(reserve, figures.threshold))
  if (last !== null && figures.used >= last) {
    await $.state.set(ARMED, false)
  } else if (share < 100 && figures.used >= earlyLine(figures.window, share) && (await $.state.get(EARLY)).value !== true) {
    await $.state.set(EARLY, true)
  } else {
    return
  }
  $.ui.toast(NUDGE_TOAST)
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: CUE }] } })
}


async function clearAttempt($: any, mine: string): Promise<void> {
  const now = (await $.state.get(ATTEMPT)).value
  if (now && now.nonce === mine) await $.state.set(ATTEMPT, null)
}

async function proceed($: any, e: any, mine: string, declined: boolean, go: (x: any) => any) {
  if (declined) await $.state.set(ATTEMPT, { nonce: mine, declined: true })
  return go({ ...e, instructions: steered(e.instructions, declined) })
}


type OfferOptions = { offer?: string; nudgePercent?: number; nudgeReserve?: number }

async function offerIfEligible($: any, figures: Awaited<ReturnType<typeof readFigures>> | undefined, options: OfferOptions) {
  if (options.offer !== 'off' && figures && figures.window >= minimumOfferWindow)
    await nudge($, figures, options.nudgePercent, options.nudgeReserve)
}

export const register: Register = (on, options) => {
  const isOff = (): boolean => (options as { offer?: string }).offer === 'off'

  on('session.end', async ($, e, next) => {
    await resetAll($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    const origin = e.origin as { kind?: string; name?: string } | undefined
    if (!e.attachments?.length && e.command?.name === 'methodical:compound' && e.command.args === 'checkpoint' &&
        (isPersonPrompt(origin) || (origin?.kind === 'plugin' && origin.name === 'methodical'))) {
      const queued = await $.state.get(COMPOUND_TURN)
      if (queued.value && queued.value.stage !== 'queued') return { drop: 'A compound checkpoint is already in progress.' }
      const submitted = await $.state.set(COMPOUND_TURN, { stage: 'submitted' }, { ifVersion: queued.version })
      if (!submitted.isSet) return { drop: 'This compound checkpoint is no longer active.' }
      await loseHandoff($)
      return next(e)
    }
    if (isPersonPrompt(e.origin)) {
      const text = String(e.text ?? '').trim()
      if (!e.attachments?.length && (e.command?.name === 'methodical:context-status' || (!e.command && text === '/methodical:context-status'))) {
        const state: ObservedContext | null | undefined = (await $.state.get(CONTEXT)).value
        const status = contextStatus(state?.reading ?? null, state?.startup ?? null)
        const count = (n: number | null) => n === null ? 'unknown' : String(n)
        return { drop: [
          `Methodical context: ${status.model ?? 'unknown model'} (${status.source ?? 'no current reading'}).`,
          `Usable window: ${count(status.window)}; occupied: ${count(status.occupied)}; remaining in full window: ${count(status.runway)}.`,
          `Startup load: ${count(status.startup?.tokens ?? null)}${status.startup ? ` (${status.startup.kind})` : ''}; initial runway: ${count(status.initialRunway)}.`,
          `Window eligible for offers: ${status.eligible === null ? 'unknown' : status.eligible ? 'yes' : 'no'} (minimum ${status.minimumOfferWindow}).`,
        ].join('\n') }
      }
      if (e.command?.name === 'model' || /^\/model(?:\s|$)/.test(text)) {
        const state: ObservedContext | null | undefined = (await $.state.get(CONTEXT)).value
        if (state) await $.state.set(CONTEXT, { ...state, reading: null, pending: true })
      }
      // Exact informational requests can keep their handoff. Their tools still invalidate on writes.
      const inspection = /^(?:please +)?(?:(?:run +)?git status|(?:check|show)(?: the)? git status|\/methodical:rules)[.!]?$/i
      if (!e.attachments?.length && (e.command?.name === 'methodical:rules' || (!e.command && inspection.test(text)))) {
        return next(e)
      }
      const request = e.isMeta || e.attachments?.length || e.command ? null : compactRequest(text)
      if (request === 'checkpoint') {
        const queued = await queueCheckpoint($, true)
        return { drop: queued ? 'Compounding first. Run /compact when the checkpoint turn ends.' : 'A compound checkpoint is already in progress.' }
      }
      if (request) {
        const native = { token: `methodical-compact-${newNonce()}`, choice: request }
        await $.state.set(NATIVE_REQUEST, native)
        scheduleNativeCompact($, native)
        return { drop: 'Opening native compaction.' }
      }
      if (e.command?.name !== 'compact' && !(!e.command && !e.attachments?.length && /^\/compact(?:\s|$)/.test(text))) {
        await $.state.set(NATIVE_REQUEST, null)
        await $.state.set(COMPOUND_TURN, null)
        await loseHandoff($)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (!isMain(e)) return next(e)
    const held = await $.state.get(COMPOUND_TURN)
    if (held.value?.stage === 'submitted') {
      const command = e.text.includes('<command-name>/methodical:compound</command-name>') &&
        e.text.includes('<command-args>checkpoint</command-args>')
      const root = command ? await $.session.root() : null
      if (!root) {
        await $.state.set(COMPOUND_TURN, null, { ifVersion: held.version })
      } else {
        const [tracked, privateResume] = await Promise.all([
          resumeBefore($, root, resumePaths[0]), resumeBefore($, root, resumePaths[1]),
        ])
        await $.state.set(COMPOUND_TURN, {
          stage: 'running', turnId: e.turnId, root,
          before: { 'docs/resume.md': tracked, 'docs/private/resume.md': privateResume },
        }, { ifVersion: held.version })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A successful finalizer publishes and checks freshness in the same native tool invocation.
  // Corroborate its result against the new on-disk pointer, plan binding and exact resume capture.
  on('tool.call', async ($, e, next) => {
    if (!isMain(e as { agentId?: string | null })) return next(e)
    const ev = e as { tool?: string; command?: string }
    const root = ev.tool === 'Bash' ? await $.session.root() : ''
    const finalizing = finalizerCall(ev.command, root)
    const pointer = root + '/.methodical/checkpoint-current.json'
    const before = finalizing ? await $.fs.read(pointer).catch(() => '') : ''
    const entry = (await $.state.get(HANDOFF)).version
    const ran = await next(e)
    try {
      if (ran.deny !== undefined) return ran
      if (finalizing && ran.isError !== true) {
        const receipt = finalizationReceipt(ran.text, root)
        const after = await $.fs.read(pointer).catch(() => '')
        if (receipt && before !== after && matchingPointer(after, receipt)) {
          const base = root + '/.methodical/checkpoints/' + receipt.generation
          const checkpoint = await $.fs.read(base + '/checkpoint.json').catch(() => '')
          const resume = finalizationResume(checkpoint, receipt)
          if (resume) {
            const [source, archived, plan, archivedPlan] = await Promise.all([
              $.fs.read(root + '/' + resume.source).catch(() => null),
              $.fs.read(base + '/' + resume.archive).catch(() => null),
              $.fs.read(root + '/' + resume.plan.source).catch(() => null),
              $.fs.read(base + '/' + resume.plan.archive).catch(() => null),
            ])
            const path = resumePaths.find(path => path === resume.source)
            if (path && typeof source === 'string' && source.trim() && source === archived &&
                typeof plan === 'string' && plan === archivedPlan && await $.fs.read(pointer).catch(() => '') === after) {
              await $.state.set(HANDOFF, {
                root, path, contents: source,
                portable: { pointer: after, planPath: resume.plan.source, planContents: plan },
              }, { ifVersion: entry })
              return ran
            }
          }
        }
      }
      const failedEdit = (ev.tool === 'Write' || ev.tool === 'Edit') && ran.isError === true
      if (ran.isReadOnly !== true && !failedEdit) await loseHandoff($)
      return ran
    } catch { return ran } // A post-tool capability failure must not execute the command twice.
  }).catch(($, e, next) => next(e))

  // The offers, on every main-thread request. One read, a comparison, nothing else.
  on('turn.step', async function* ($, e, next) {
    if (isMain(e as { agentId?: string | null })) {
      try {
        await offerIfEligible($, await observeStep($, e.model, e.turnId), options as OfferOptions)
      } catch {
        // fail open: a failed reading says nothing
      }
    }
    return yield* next(e)
  }).catch(async function* ($, e, next) {
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (!isMain(e as { agentId?: string | null })) return ran
    try {
      const held = await $.state.get(COMPOUND_TURN)
      const turn = held.value
      if (turn?.stage === 'running' && turn.turnId === e.turnId) {
        const {version} = await $.state.get(HANDOFF)
        const claimed = await $.state.set(COMPOUND_TURN, { stage: 'settling', turnId: turn.turnId }, { ifVersion: held.version })
        if (claimed.isSet) {
          try {
            if (!e.isAborted && 'reason' in e && e.reason === 'answer' && await $.session.root() === turn.root) {
              await finishCompound($, turn, version)
            } else {
              await loseHandoff($)
            }
          } finally {
            const settled = await $.state.get(COMPOUND_TURN)
            if (settled.value?.stage === 'settling' && settled.value.turnId === turn.turnId) {
              await $.state.set(COMPOUND_TURN, null, { ifVersion: settled.version })
            }
          }
        }
      }
      await offerIfEligible($, await observeComplete($, e), options as OfferOptions)
    } catch { /* keep the completed turn available */ }
    return ran
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    if (!isMain(e) || e.trigger === 'plugin') return next(e)
    if (e.trigger === 'auto' || e.trigger === 'precompute') {
      return next({ ...e, instructions: steered(e.instructions, false) })
    }

    let called = false
    const go = (event: typeof e, answered = false) => {
      if (!answered && next.signal?.aborted) throw new Error('The host aborted compaction.')
      called = true
      return next(event)
    }
    try {
      if ((await $.state.get(COMPOUND_TURN)).value) {
        return { skip: 'Compound is still running. Run /compact after it finishes.' }
      }
      const held = await $.state.get(ATTEMPT)
      const pending = { skip: 'A compaction request is already in progress.' }
      if (held.value) return pending
      const mine = newNonce()
      const opened = await $.state.set(ATTEMPT, { nonce: mine, declined: false }, { ifVersion: held.version })
      if (!opened.isSet) return pending
      try {
        if (COMPACT_TOKEN.test(e.instructions ?? '')) {
          const native = await $.state.get(NATIVE_REQUEST)
          if (native.value?.token !== e.instructions || !(await $.state.set(NATIVE_REQUEST, null, { ifVersion: native.version })).isSet) {
            return { skip: 'This compaction request is no longer active.' }
          }
          e = { ...e, instructions: '' }
          if (native.value?.choice === 'declined') return await proceed($, e, mine, true, go)
        }

        const handoff = await currentHandoff($)
        if (handoff || isOff()) {
          return await go({ ...e, instructions: steered(e.instructions, false, handoff?.path) })
        }

        const answer = await $.ui.ask(QUESTION, [OPTION_COMPOUND, OPTION_SKIP]).catch(() => null)
        if (next.signal?.aborted) return { skip: LINE_NEUTRAL }
        const choice = compactChoice(answer)
        if (choice === 'skip') return await proceed($, e, mine, true, event => go(event, true))
        if (choice !== 'compound') return { skip: LINE_NEUTRAL }

        if (!await queueCheckpoint($)) return { skip: 'A compound checkpoint is already in progress.' }
        return { skip: 'Compounding first. Run /compact when the checkpoint turn ends.' }
      } finally {
        await clearAttempt($, mine).catch(() => undefined)
      }
    } catch (error) {
      if (called) throw error
      return { skip: LINE_NEUTRAL }
    }
  }).catch(($, e, next) => e.trigger === 'auto' || e.trigger === 'precompute' || e.trigger === 'plugin' || !isMain(e)
    ? next(e)
    : { skip: LINE_NEUTRAL })

  // The boundary: the handoff is stale, both offers armed, the recorded prompts cleared, and
  // the one line added unless this compaction was declined. This runs inside the compaction.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if ((e as { agent_id?: string }).agent_id) return result
    const { source, model } = e as { source?: string; model?: string }
    const prior: ObservedContext | null | undefined = (await $.state.get(CONTEXT)).value
    await $.state.set(FRESH_CONTEXT, source === 'startup' ? 'startup' : 'boundary')
    if (source !== 'compact') {
      await $.state.set(CONTEXT, null)
      return result
    }
    await $.state.set(CONTEXT, prior ? { ...prior, turnId: '', reading: null, pending: true, firstRequest: false } : null)
    const eligible = prior?.reading && (!model || prior.model === model) && prior.reading.window >= minimumOfferWindow
    const attempt = (await $.state.get(ATTEMPT)).value
    const warned = (await $.state.get(ARMED)).value === false || !!await currentHandoff($)
    await $.state.set(HANDOFF, 'stale')
    await $.state.set(ARMED, true)
    await $.state.set(EARLY, false)
    await $.state.set(NATIVE_REQUEST, null)
    await $.state.set(COMPOUND_TURN, null)
    if (isOff() || (attempt && attempt.declined)) return result
    const note = afterLine((e as { transcript_path?: string }).transcript_path, warned || !eligible)
    if (note === null) return result
    return { ...result, additionalContext: [...(result.additionalContext ?? []), note] }
  }).catch(($, e, next) => next(e))
}

