// Methodical's compaction mod: offer to compound before a compaction, never block one.
//
//   moment 2  two offers, never a compaction: one at a percent of the window, one before the threshold (turn.step)
//   moment 4  one question at a typed /compact when nothing has been saved (session.compact)
//   moment 5  one note after any compaction, unless that compaction was declined (classic.SessionStart)
//
// Every hook fails open (its .catch continues), except that once the host has aborted a /compact, a failure inside
// session.compact ends in a neutral line rather than a compaction, unless the person has just answered the question. The state is the session's: nothing is written to
// disk. The engine behaviour it relies on was settled by running probes against Claude Code 2.1.295.
import type { PluginState, Register } from 'claude-code'
import {
  CHECKPOINT,
  COMPACT_TOKEN,
  compactRequest,
  CUE,
  NUDGE_TOAST,
  OPTION_CHAIN,
  OPTION_COMPOUND,
  QUESTION,
  afterLine,
  classifierPrompt,
  contextFigures,
  earlyLine,
  isPersonPrompt,
  finalizerCall,
  finalizationReceipt,
  matchingPointer,
  finalizationResume,
  lateLine,
  LINE_ESC_PASS,
  LINE_NEUTRAL,
  LINE_STOPPED,
  readDismissal,
  newNonce,
  parseLabel,
  steered,
  usablePercent,
  usableReserve,
} from './logic'
import type { Label } from './logic'
import { contextStatus, minimumOfferWindow, tokenCount } from './context-policy'
import type { StartupLoad } from './context-policy'

// The state refs are literals in source, as `$.state` requires.
const HANDOFF = { plugin: 'methodical', key: 'handoff' } as const
const ARMED = { plugin: 'methodical', key: 'armed' } as const
const EARLY = { plugin: 'methodical', key: 'early' } as const
const ATTEMPT = { plugin: 'methodical', key: 'attempt' } as const
const CHAIN = { plugin: 'methodical', key: 'chain' } as const
const PROMPTS = { plugin: 'methodical', key: 'prompts' } as const
const CONTEXT = { plugin: 'methodical', key: 'context' } as const
const FRESH_CONTEXT = { plugin: 'methodical', key: 'freshContext' } as const
const PASS = { plugin: 'methodical', key: 'pass' } as const

type ObservedContext = NonNullable<PluginState['methodical']['context']>
type CompactChain = NonNullable<PluginState['methodical']['chain']>

const isMain = (e: { agentId?: string | null }): boolean => e.agentId === undefined || e.agentId === null

// The handoff is lost. The write always lands (it bumps the version, so a finalization that began
// earlier cannot then make it current: stale wins), and the last offer is armed again when it
// was current.
async function loseHandoff($: any): Promise<void> {
  for (;;) {
    const held = await $.state.get(HANDOFF)
    const wrote = await $.state.set(HANDOFF, 'stale', { ifVersion: held.version })
    if (wrote.isSet === false) continue // another write landed between the read and this one: read again
    if (held.value === 'current') await $.state.set(ARMED, true)
    return
  }
}

// An Esc pass ('declined') lasts only until the next thing the person or the session does; the chat
// pass (true) is left alone.
async function dropDeclined($: any): Promise<void> {
  if ((await $.state.get(PASS)).value === 'declined') await $.state.set(PASS, null)
}

async function resetAll($: any): Promise<void> {
  await $.state.set(CONTEXT, null)
  await $.state.set(FRESH_CONTEXT, null)
  await $.state.set(HANDOFF, 'stale')
  await $.state.set(ARMED, true)
  await $.state.set(EARLY, false)
  await $.state.set(ATTEMPT, null)
  await $.state.set(CHAIN, null)
  await $.state.set(PROMPTS, [])
  await $.state.set(PASS, null)
}

async function classify($: any, model: string, kind: 'compact' | 'answer', texts: readonly string[], instructions: string): Promise<Label | null> {
  const r = await $.model.complete({
    model,
    prompt: classifierPrompt(kind, texts, instructions),
    maxTokens: 16,
    timeoutMs: 5000,
  })
  return r.isAnswered ? parseLabel(r.text) : null
}

function compactChain(stage: 'queued' | 'choose' | 'declined'): CompactChain {
  return { token: `methodical-compact-${newNonce()}`, stage }
}

async function clearChain($: any, token: string): Promise<void> {
  const held = await $.state.get(CHAIN)
  if (held.value?.token === token) await $.state.set(CHAIN, null, { ifVersion: held.version })
}

// Run after prompt.submit returns. Claude refuses a direct command call from that hook.
function scheduleCommand($: any, chain: CompactChain): void {
  void $.clock.after(0, async () => {
    const active = (await $.state.get(CHAIN)).value
    if (active?.token !== chain.token || active.stage !== chain.stage) return
    if (chain.stage === 'queued') {
      startCheckpoint($, chain.token)
      return
    }
    try {
      await $.command.run({ command: 'compact', args: chain.token })
    } catch {
      await clearChain($, chain.token)
      $.ui.toast('Could not compact. Try /compact.')
    }
  })
}

// This call is also used by the compact menu. Its new turn begins after the compact hook returns.
function startCheckpoint($: any, token?: string): void {
  void $.command
    .run({ command: 'methodical:compound', args: token ? `checkpoint then compact ${token}` : 'checkpoint' })
    .catch(async () => {
      if (token) await clearChain($, token)
      $.ui.toast(`Could not start the checkpoint: run ${CHECKPOINT}, then /compact.`)
      const box = await $.prompt.read().catch(() => null)
      if (box && box.text === '') await $.prompt.fill({ text: CHECKPOINT, mode: 'replace' }).catch(() => undefined)
    })
    .catch(() => undefined)
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

async function observeComplete($: any, e: { turnId: string; reason: string; isAborted: boolean; usage: unknown }) {
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
  if ((await $.state.get(HANDOFF)).value === 'current') return
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

// The host cancelled the command while the question was up, and Esc closed it: no compaction is run in
// this dispatch. Every call after the abort is guarded, so a refused call ends in the neutral line and
// never in an automatic compaction. The attempt is cleared first, then the pass written, then the line shown.
async function escClosed($: any, mine: string, version: unknown): Promise<{ skip: string }> {
  try {
    await clearAttempt($, mine)
    const wrote = await $.state.set(PASS, 'declined', { ifVersion: version })
    if (wrote.isSet === false) return { skip: LINE_NEUTRAL }
    $.ui.toast(LINE_ESC_PASS)
    return { skip: LINE_ESC_PASS }
  } catch {
    return { skip: LINE_NEUTRAL }
  }
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
  const census = (): string => (options as { census?: string }).census ?? 'sonnet'

  on('session.end', async ($, e, next) => {
    await resetAll($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'plugin' && e.origin.name === 'methodical' && e.command?.name === 'methodical:compound' &&
        e.command.args.startsWith('checkpoint then compact methodical-compact-')) {
      const held = await $.state.get(CHAIN)
      const chain = held.value
      if (chain?.stage !== 'queued' || e.command.args !== `checkpoint then compact ${chain.token}`)
        return { drop: 'This checkpoint request is no longer active.' }
      const started = await $.state.set(CHAIN, { ...chain, stage: 'starting' }, { ifVersion: held.version })
      if (!started.isSet) return { drop: 'This checkpoint request is no longer active.' }
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
      const request = e.isMeta || e.attachments?.length || e.command ? null : compactRequest(text)
      if (request) {
        const chain = compactChain(request === 'checkpoint' ? 'queued' : request)
        await $.state.set(CHAIN, chain)
        scheduleCommand($, chain)
        return { drop: request === 'checkpoint' ? 'Compounding, then compacting.' : 'Opening native compaction.' }
      }
      if (text !== '') {
        const { value = [] } = await $.state.get(PROMPTS)
        await $.state.set(PROMPTS, [...value, text.slice(0, 600)].slice(-3))
      }
      await $.state.set(CHAIN, null)
      await loseHandoff($)
      await dropDeclined($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (isMain(e)) {
      const held = await $.state.get(CHAIN)
      if (held.value?.stage === 'starting') {
        await loseHandoff($)
        await $.state.set(CHAIN, { token: held.value.token, stage: 'checkpoint', turnId: e.turnId }, { ifVersion: held.version })
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
            if (source !== null && source === archived && plan !== null && plan === archivedPlan && await $.fs.read(pointer).catch(() => '') === after) {
              await $.state.set(HANDOFF, 'current', { ifVersion: entry })
              return ran
            }
          }
        }
      }
      const failedEdit = (ev.tool === 'Write' || ev.tool === 'Edit') && ran.isError === true
      if (ran.isReadOnly !== true && !failedEdit) {
        await loseHandoff($)
        await dropDeclined($)
      }
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

  // Refresh status and run the mod’s /compact only for a finalized checkpoint chain.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (!isMain(e as { agentId?: string | null })) return ran
    try {
      await offerIfEligible($, await observeComplete($, e), options as OfferOptions)
    } catch {
      // A diagnostic or offer failure must not disturb the completed turn or a compact chain.
    }
    const held = await $.state.get(CHAIN)
    const chain = held.value
    if (chain?.stage !== 'checkpoint' || chain.turnId !== e.turnId) return ran
    const current = (await $.state.get(HANDOFF)).value === 'current'
    if (e.reason === 'answer' && !e.isAborted && current) {
      const ready = { token: chain.token, stage: 'ready' } as const
      const wrote = await $.state.set(CHAIN, ready, { ifVersion: held.version })
      if (wrote.isSet) scheduleCommand($, ready)
    } else {
      const wrote = await $.state.set(CHAIN, null, { ifVersion: held.version })
      if (wrote.isSet) $.ui.toast(
        current
          ? 'The turn was interrupted; the handoff is written, run /compact.'
          : 'The checkpoint stopped before the handoff was written.',
      )
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    // `go` is `next` that records the call. Once the host has aborted the command it refuses to start a compaction
    // (an `afterAnswer` call, made once the person has answered the question, is the one exception), and a throw
    // anywhere below (a `$` call the host refuses, say) while `next` was never called ends in the neutral line and
    // not in the hook's `.catch`, which would call `next(e)`: an automatic compaction after an abort.
    const internal = COMPACT_TOKEN.test(e.instructions ?? '')
    let called = false
    const go = (x: any, afterAnswer = false) => {
      if (!afterAnswer && next.signal?.aborted) throw new Error('the host aborted this /compact')
      called = true
      return next(x)
    }
    try {
      let ev = e as { trigger: string; agentId?: string | null; instructions?: string }
      if (!isMain(ev) || ev.trigger === 'plugin') return go(e)
      if (ev.trigger === 'auto' || ev.trigger === 'precompute') {
        return go({ ...e, instructions: steered(ev.instructions, false) })
      }

      const queued = await $.state.get(CHAIN)
      const chain = queued.value
      if (internal) {
        if (chain?.token !== ev.instructions || chain.stage === 'checkpoint' || chain.stage === 'queued' || chain.stage === 'starting')
          return { skip: 'This compaction request is no longer active.' }
        const handoff = chain.stage === 'ready' ? await $.state.get(HANDOFF) : null
        const used = await $.state.set(CHAIN, null, { ifVersion: queued.version })
        if (!used.isSet) return { skip: 'This compaction request is no longer active.' }
        if (handoff && (handoff.value !== 'current' || (await $.state.get(HANDOFF)).version !== handoff.version))
          return { skip: 'The handoff changed before compaction. Run /compact when ready.' }
        if (chain.stage === 'ready')
          return go({ ...e, instructions: steered('', false) })
        e = { ...e, instructions: '' }
        ev = e
      }

      // After "Chat about this" (true) the person has had the conversation, so this /compact is not asked.
      // After Esc closed the question under an abort ('declined') it is not asked either, and it counts
      // as a declined offer.
      const held = await $.state.get(PASS)
      const declined = internal && chain?.stage === 'declined'
      if (held.value === true && !declined) {
        await $.state.set(PASS, null)
        return go({ ...e, instructions: steered(ev.instructions, false) })
      }
      const retryDeclined = held.value === 'declined'

      // One attempt at a time: a second /compact while a question is up asks nothing and breaks nothing.
      const open = await $.state.get(ATTEMPT)
      const pending = { skip: 'a question about this compaction is pending' }
      if (open.value) return pending
      const mine = newNonce()
      const opened = await $.state.set(ATTEMPT, { nonce: mine, declined: false }, { ifVersion: open.version })
      if (opened.isSet === false) return pending
      try {
        if (retryDeclined || declined) {
          await $.state.set(PASS, null) // used only once the attempt is open: a pending /compact leaves it
          return await proceed($, e, mine, true, go)
        }
        if (isOff() || (await $.state.get(HANDOFF)).value === 'current') {
          return await go({ ...e, instructions: steered(ev.instructions, false) })
        }

        const menu = await $.state.get(CHAIN)
        const label = internal ? 'other' : await classify(
          $, census(), 'compact', (await $.state.get(PROMPTS)).value ?? [], ev.instructions ?? '',
        ).catch(() => null)
        if (next.signal?.aborted) return { skip: LINE_STOPPED } // stopped before the question was shown
        if ((await $.state.get(CHAIN)).version !== menu.version)
          return { skip: 'This compaction request is no longer active.' }
        if (label === 'skip') return await proceed($, e, mine, true, go)
        if (label === null) return await proceed($, e, mine, false, go)

        let answer: string
        try {
          answer = await $.ui.ask(QUESTION, [OPTION_COMPOUND, OPTION_CHAIN])
        } catch (err) {
          const message = (typeof err === 'string' ? err : (err as Error)?.message) ?? ''
          const aborted = next.signal?.aborted === true
          $.ui.log(`methodical: question closed (aborted=${aborted}): ${message}`, { to: 'debug' })
          const kind = readDismissal(message, aborted)
          if (kind === 'chat') {
            const wrote = await $.state.set(PASS, true, { ifVersion: held.version })
            if (wrote.isSet === false) return { skip: LINE_NEUTRAL }
            return { skip: 'Held so you can talk it over: run /compact when you are ready, and it will not ask again.' }
          }
          if (kind === 'esc-abort') return await escClosed($, mine, held.version)
          const person = (await $.session.surfaces()).length > 0 && kind !== 'refused'
          if (next.signal?.aborted) return await escClosed($, mine, held.version) // the host cancelled while we looked
          return await proceed($, e, mine, person, go)
        }

        if ((await $.state.get(CHAIN)).version !== menu.version)
          return { skip: 'This compaction request is no longer active.' }
        let choice: 'compound' | 'chain' | 'compact'
        if (answer === OPTION_COMPOUND) choice = 'compound'
        else if (answer === OPTION_CHAIN || compactRequest(answer) === 'checkpoint') choice = 'chain'
        else if (compactRequest(answer) === 'declined')
          return await proceed($, e, mine, true, (x: any) => go(x, true))
        else {
          const said = await classify($, census(), 'answer', [answer], '').catch(() => null)
          choice = said === 'compound' ? 'compound' : 'compact'
          if (choice === 'compact') {
            if ((await $.state.get(CHAIN)).version !== menu.version)
              return { skip: 'This compaction request is no longer active.' }
            return await proceed($, e, mine, said === 'skip', (x: any) => go(x, true))
          }
        }
        const selected = choice === 'chain' ? compactChain('queued') : null
        const wrote = await $.state.set(CHAIN, selected, { ifVersion: menu.version })
        if (!wrote.isSet) return { skip: 'This compaction request is no longer active.' }
        startCheckpoint($, selected?.token)
        return {
          skip:
            choice === 'chain'
              ? `Compounding first: ${CHECKPOINT} is starting, and the compaction follows it.`
              : `Compounding first: ${CHECKPOINT} is starting. Run /compact when it ends.`,
        }
      } finally {
        await clearAttempt($, mine).catch(() => undefined)
      }

    } catch (err) {
      if (next.signal?.aborted && !called) return { skip: LINE_NEUTRAL }
      if (internal && !called) return { skip: 'Could not run the compaction request. Try /compact.' }
      throw err
    }
  }).catch(($, e, next) => COMPACT_TOKEN.test(e.instructions ?? '')
    ? { skip: 'Could not finish the compaction request. Try /compact.' }
    : next(e))

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
    const warned = (await $.state.get(ARMED)).value === false || (await $.state.get(HANDOFF)).value === 'current'
    await $.state.set(HANDOFF, 'stale')
    await $.state.set(ARMED, true)
    await $.state.set(EARLY, false)
    await $.state.set(PROMPTS, [])
    await $.state.set(CHAIN, null)
    await $.state.set(PASS, null)
    if (isOff() || (attempt && attempt.declined)) return result
    const note = afterLine((e as { transcript_path?: string }).transcript_path, warned || !eligible)
    if (note === null) return result
    return { ...result, additionalContext: [...(result.additionalContext ?? []), note] }
  }).catch(($, e, next) => next(e))
}

