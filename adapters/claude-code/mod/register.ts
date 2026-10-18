// Methodical's compaction mod: offer to compound before a compaction, never block one.
//
//   moment 2  two offers, never a compaction: one at a percent of the window, one before the threshold (turn.step)
//   moment 4  one question at a typed /compact when nothing has been saved (session.compact)
//   moment 5  one note after any compaction, unless that compaction was declined (classic.SessionStart)
//
// Every hook fails open (its .catch continues), except that once the host has aborted a /compact, a failure inside
// session.compact ends in a neutral line rather than a compaction, unless the person has just answered the question. The state is the session's: nothing is written to
// disk. The engine behaviour it relies on was settled by running probes against Claude Code 2.1.295.
import type { Register } from 'claude-code'
import {
  CHECKPOINT,
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

// The state refs are literals in source, as `$.state` requires.
const HANDOFF = { plugin: 'methodical', key: 'handoff' } as const
const ARMED = { plugin: 'methodical', key: 'armed' } as const
const EARLY = { plugin: 'methodical', key: 'early' } as const
const ATTEMPT = { plugin: 'methodical', key: 'attempt' } as const
const CHAIN = { plugin: 'methodical', key: 'chain' } as const
const PROMPTS = { plugin: 'methodical', key: 'prompts' } as const
const PASS = { plugin: 'methodical', key: 'pass' } as const

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

// Starts the checkpoint as the user's own command; never awaited inside the compact hook (the
// turn it starts cannot begin until that hook returns).
function startCheckpoint($: any): void {
  void $.command
    .run({ command: 'methodical:compound', args: 'checkpoint' })
    .catch(async () => {
      await $.state.set(CHAIN, null)
      $.ui.toast(`Could not start the checkpoint: run ${CHECKPOINT}, then /compact.`)
      const box = await $.prompt.read().catch(() => null)
      if (box && box.text === '') await $.prompt.fill({ text: CHECKPOINT, mode: 'replace' }).catch(() => undefined)
    })
    .catch(() => undefined)
}


// Two offers, each at most once per cycle, neither ever compacting. The last comes before the
// host's threshold (and is armed again when new work makes a current handoff stale); the first
// comes at a percent of the model's window and is not armed again until the next boundary.
async function nudge($: any, percent: unknown, reserve: unknown): Promise<void> {
  const armed = (await $.state.get(ARMED)).value
  if (armed === false) return
  if ((await $.state.get(HANDOFF)).value === 'current') return
  const usage = await $.session.usage({ breakdown: 'summary' })
  const figures = usage.context?.breakdown && contextFigures(usage.context.breakdown, usage.context.window)
  if (!figures) return
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


export const register: Register = (on, options) => {
  const isOff = (): boolean => (options as { offer?: string }).offer === 'off'
  const census = (): string => (options as { census?: string }).census ?? 'sonnet'

  on('session.end', async ($, e, next) => {
    await resetAll($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The person's own prompt records itself for the classifier, loses the handoff, and stops a chain.
  on('prompt.submit', async ($, e, next) => {
    if (isPersonPrompt((e as { origin?: { kind?: string } }).origin)) {
      const text = String((e as { text?: string }).text ?? '').trim()
      if (text !== '') {
        const { value = [] } = await $.state.get(PROMPTS)
        await $.state.set(PROMPTS, [...value, text.slice(0, 600)].slice(-3))
      }
      await loseHandoff($)
      await dropDeclined($)
      await $.state.set(CHAIN, null)
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
    if (isMain(e as { agentId?: string | null }) && !isOff()) {
      try {
        await nudge($, (options as { nudgePercent?: number }).nudgePercent, (options as { nudgeReserve?: number }).nudgeReserve)
      } catch {
        // fail open: a failed reading says nothing
      }
    }
    return yield* next(e)
  }).catch(async function* ($, e, next) {
    return yield* next(e)
  })

  // After a "then compact for me" checkpoint, and nothing else: run the mod's own /compact.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (!isMain(e as { agentId?: string | null })) return ran
    const chain = (await $.state.get(CHAIN)).value
    if (!chain || chain.fired) return ran
    const current = (await $.state.get(HANDOFF)).value === 'current'
    if ((e as { reason?: string }).reason === 'answer' && current) {
      await $.state.set(CHAIN, { nonce: chain.nonce, fired: true })
      void $.clock.after(0, async () => {
        try {
          await $.command.run({ command: 'compact', args: chain.nonce })
        } catch {
          await $.state.set(CHAIN, null).catch(() => undefined)
          $.ui.toast('Handoff written; run /compact.')
        }
      })
    } else {
      await $.state.set(CHAIN, null)
      $.ui.toast(
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
    let called = false
    const go = (x: any, afterAnswer = false) => {
      if (!afterAnswer && next.signal?.aborted) throw new Error('the host aborted this /compact')
      called = true
      return next(x)
    }
    try {
      const ev = e as { trigger: string; agentId?: string | null; instructions?: string }
      if (!isMain(ev) || ev.trigger === 'plugin') return go(e)
      if (ev.trigger === 'auto' || ev.trigger === 'precompute') {
        return go({ ...e, instructions: steered(ev.instructions, false) })
      }

      // The mod's own chained compaction: consume the chain, strip its nonce, no question.
      const chain = (await $.state.get(CHAIN)).value
      if (chain && chain.fired && ev.instructions && ev.instructions.includes(chain.nonce)) {
        await $.state.set(CHAIN, null)
        return go({ ...e, instructions: steered(ev.instructions, false, chain.nonce) })
      }

      // After "Chat about this" (true) the person has had the conversation, so this /compact is not asked.
      // After Esc closed the question under an abort ('declined') it is not asked either, and it counts
      // as a declined offer.
      const held = await $.state.get(PASS)
      if (held.value === true) {
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
        if (retryDeclined) {
          await $.state.set(PASS, null) // used only once the attempt is open: a pending /compact leaves it
          return await proceed($, e, mine, true, go)
        }
        if (isOff() || (await $.state.get(HANDOFF)).value === 'current') {
          return await go({ ...e, instructions: steered(ev.instructions, false) })
        }

        const prompts = (await $.state.get(PROMPTS)).value ?? []
        const label = await classify($, census(), 'compact', prompts, ev.instructions ?? '').catch(() => null)
        if (next.signal?.aborted) return { skip: LINE_STOPPED } // stopped before the question was shown
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

        let choice: 'compound' | 'chain' | 'compact'
        if (answer === OPTION_COMPOUND) choice = 'compound'
        else if (answer === OPTION_CHAIN) choice = 'chain'
        else {
          const said = await classify($, census(), 'answer', [answer], '').catch(() => null)
          choice = said === 'compound' ? 'compound' : 'compact'
          if (choice === 'compact') return await proceed($, e, mine, said === 'skip', (x: any) => go(x, true))
        }
        await $.state.set(CHAIN, choice === 'chain' ? { nonce: newNonce(), fired: false } : null)
        startCheckpoint($)
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
      throw err
    }
  }).catch(($, e, next) => next(e))

  // The boundary: the handoff is stale, both offers armed, the recorded prompts cleared, and
  // the one line added unless this compaction was declined. This runs inside the compaction.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if ((e as { source?: string }).source !== 'compact') return result
    if ((e as { agent_id?: string }).agent_id) return result // a subagent's compaction is not the main thread's
    const attempt = (await $.state.get(ATTEMPT)).value
    const warned = (await $.state.get(ARMED)).value === false // the last offer showed in this cycle
    await $.state.set(HANDOFF, 'stale')
    await $.state.set(ARMED, true)
    await $.state.set(EARLY, false)
    await $.state.set(PROMPTS, [])
    await $.state.set(PASS, null)
    if (isOff() || (attempt && attempt.declined)) return result
    const note = afterLine((e as { transcript_path?: string }).transcript_path, warned)
    if (note === null) return result
    return { ...result, additionalContext: [...(result.additionalContext ?? []), note] }
  }).catch(($, e, next) => next(e))
}

