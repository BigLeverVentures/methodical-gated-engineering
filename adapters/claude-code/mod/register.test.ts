import { expect, mock, test } from 'claude-code/testing'
import {
  CHECKPOINT,
  CUE,
  LINE_ESC_PASS,
  LINE_NEUTRAL,
  LINE_STOPPED,
  NUDGE_TOAST,
  OPTION_CHAIN,
  OPTION_COMPOUND,
  QUESTION,
  STEER,
  STEER_DECLINED,
  afterLine,
  contextFigures,
  earlyLine,
  isPersonPrompt,
  finalizerCall,
  finalizationReceipt,
  matchingPointer,
  finalizationResume,
  lateLine,
  looksLikeChat,
  looksLikeRefusal,
  parseLabel,
  readDismissal,
  steered,
  usablePercent,
  usableReserve,
} from './logic'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ROOT = '/proj'
const RESUME = '/proj/docs/resume.md'
const MARKER_A = 'handoff: 2026-10-12T10:00:00Z aaaaaaaaaaaaaaaa'
const MARKER_B = 'handoff: 2026-10-12T11:00:00Z bbbbbbbbbbbbbbbb'

type World = {
  files: Record<string, string>
  label: string | null | ((prompt: string) => string) // the classifier's reply; null = a call that did not answer
  answer: string | Error | (() => Promise<string | Error>) // the dialog; a function may resolve to an Error to deny
  classifyGate?: (prompt: string) => Promise<void> | undefined // holds a classifier call until released
  surfacesGate?: Promise<void> // holds the surface lookup until released
  surfacesReached?: boolean
  surfaces: string[]
  usage: { total: number; threshold: number; enabled: boolean; window: number; rawMaxTokens?: number } | null
  asked: number
  options: string[][] // the labels of each question asked
  classified: string[]
  commands: { command: string; args?: string }[]
  toasts: string[]
  compacts: { trigger: string; instructions?: string }[]
  fills: string[]
  submits: string[] // prompts that reach the bottom of the prompt.submit chain: anything the mod itself submits
  failCommand: boolean
  finalizations: number
  finalizeFault?: 'pointer'|'resume'|'plan'|'error'|'unknown'
  inCompact?: ($: any) => Promise<void> // runs inside the compaction, as the after-compaction hook does
}

// The world beneath the mod: every call the mod makes on `$` is answered here.
function world(on: any, overrides: Partial<World> = {}): World {
  const w: World = {
    files: {},
    label: 'other',
    answer: OPTION_COMPOUND,
    surfaces: ['terminal'],
    usage: null,
    asked: 0,
    options: [],
    classified: [],
    commands: [],
    toasts: [],
    compacts: [],
    fills: [],
    submits: [],
    failCommand: false,
    finalizations: 0,
    ...overrides,
  }
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('session.surfaces', async () => {
    w.surfacesReached = true
    await w.surfacesGate
    return { value: w.surfaces }
  })
  on('fs.read', (_$: any, e: any) => {
    if (e.path in w.files) return { value: w.files[e.path] }
    throw new Error('ENOENT')
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: w.usage ? {
        window: w.usage.window,
        tokens: w.usage.total,
        breakdown: {
          totalTokens: w.usage.total,
          autoCompactThreshold: w.usage.threshold,
          isAutoCompactEnabled: w.usage.enabled,
          ...(w.usage.rawMaxTokens === undefined ? {} : { rawMaxTokens: w.usage.rawMaxTokens }),
        },
      } : { window: 1000000 },
      rateLimits: [],
    },
  }))
  on('model.complete', async (_$: any, e: any) => {
    w.classified.push(String(e.prompt))
    await w.classifyGate?.(String(e.prompt))
    const said = typeof w.label === 'function' ? w.label(String(e.prompt)) : w.label
    return {
      value:
        said === null
          ? { isAnswered: false, reason: 'api-error', usage: USAGE }
          : { isAnswered: true, text: said, usage: USAGE },
    }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', (_$: any, e: any) => {
    w.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.submit', (_$: any, e: any) => {
    w.submits.push(String(e.text))
    return { text: e.text }
  })
  on('session.end', () => ({ sessionId: 's' }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('prompt.fill', (_$: any, e: any) => {
    w.fills.push(String(e.text))
    return { isFilled: true, text: e.text, cursor: 0 }
  })
  on('command.run', (_$: any, e: any) => {
    w.commands.push({ command: e.command, args: e.args })
    if (w.failCommand) throw new Error('unknown command')
    return { text: '' }
  })
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'AskUserQuestion') {
      w.asked += 1
      w.options.push((e.questions?.[0]?.options ?? []).map((o: any) => o.label))
      const a = w.answer
      if (a instanceof Error) return { deny: a.message }
      const give = (s: string) => ({ result: { questions: [], answers: { [QUESTION]: s } }, text: s })
      return typeof a === 'function' ? a().then(r => (r instanceof Error ? { deny: r.message } : give(r))) : give(a)
    }
    if (e.tool === 'Bash' && finalizerCall(e.command, ROOT)) {
      w.finalizations += 1
      const pointer = ROOT + '/.methodical/checkpoint-current.json'
      const number = pointer in w.files ? Number(JSON.parse(w.files[pointer]).generation.split('-')[0]) + 1 : 1
      const generation = `${number}-aaaaaaaaaaaaaaaa`, checkpointHash = 'a'.repeat(64), planHash = 'b'.repeat(64)
      const capture = { kind: 'local', ref: 'methodical:resume', source: 'docs/resume.md', archive: 'evidence/resume.md', required: true }
      w.files[pointer] = JSON.stringify({ schemaVersion: 1, generation, sha256: checkpointHash })
      const base = ROOT + '/.methodical/checkpoints/' + generation
      w.files[base + '/checkpoint.json'] = JSON.stringify({ schemaVersion: 2, generation,
        repo: { identity: 'c'.repeat(64) }, work: { planHash, binding: { plan: { path: 'plans/unit.md', sha256: planHash }, repositoryIdentity: 'c'.repeat(64) }, captures: [capture] },
        capture: { records: [{ ...capture, sha256: 'd'.repeat(64) }, { kind: 'local', ref: 'methodical:active-plan', source: 'plans/unit.md', archive: 'evidence/active-plan', sha256: planHash, required: true }] },
        payload: { 'evidence/resume.md': 'd'.repeat(64), 'evidence/active-plan': planHash } })
      w.files[RESUME] = '# Resume\nNext: continue with the exact finding.\n'
      w.files[base + '/evidence/resume.md'] = w.files[RESUME]
      w.files[ROOT + '/plans/unit.md'] = 'approved plan'
      w.files[base + '/evidence/active-plan'] = 'approved plan'
      if(w.finalizeFault==='pointer')delete w.files[pointer]
      if(w.finalizeFault==='resume')w.files[RESUME]+='later change'
      if(w.finalizeFault==='plan')w.files[ROOT+'/plans/unit.md']='later scope'
      if(w.finalizeFault==='error')return {result:{},text:'failed',isError:true}
      if(w.finalizeFault==='unknown')return {result:{current:true},text:'parent says current'}
      return { result: { stdout: '' }, text: JSON.stringify({ schemaVersion: 1, kind: 'methodical-checkpoint-finalized', host: 'claude-code', generation, checkpointHash, current: true, root: ROOT }) }
    }
    if (e.tool === 'Write' || e.tool === 'Edit') {
      if (e.file_path.includes('DENIED')) return { result: {}, text: 'EACCES', isError: true }
      if (e.tool === 'Write') w.files[e.file_path.startsWith('/') ? e.file_path : `${ROOT}/${e.file_path}`] = e.content
      return { result: {}, text: 'ok' }
    }
    return e.tool === 'Read' ? { result: {}, text: 'x', isReadOnly: true } : { result: {}, text: 'ran' }
  })
  on('session.compact', async (_$: any, e: any) => {
    w.compacts.push({ trigger: e.trigger, instructions: e.instructions })
    if (w.inCompact) await w.inCompact(_$)
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('classic.SessionStart', () => ({}))
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })
  return w
}

const write = ($: any, file_path: string, content: string, extra: object = {}) =>
  $.tool.call({ tool: 'Write', tool_use_id: 't', file_path, content, ...extra })
const person = { kind: 'composer' }

async function beginCheckpoint($: any, w: World, turnId: string) {
  const call = w.commands.findLast(c => c.command === 'methodical:compound')
  expect(call?.args).toMatch(/^checkpoint then compact methodical-compact-[0-9a-f]{16}$/)
  const result = await $.prompt.submit({
    text: `/methodical:compound ${call?.args}`,
    origin: { kind: 'plugin', name: 'methodical' },
    command: { name: 'methodical:compound', args: call?.args },
  })
  expect(result.drop).toBeUndefined()
  await $.turn.start({ turnId, text: 'checkpoint skill' })
}

// The runtime is mocked only here; production CLI tests independently check publication and freshness.
const FINALIZER = 'node "/plugin/runtime/src/cli.js" checkpoint-finalize "/proj" claude-code "/proj/.methodical/evidence/checkpoint-work.json"'
async function checkpoint($: any, _label = MARKER_A) {
  await $.tool.call({ tool: 'Bash', tool_use_id: 'finalize', command: FINALIZER })
}
const compact = ($: any, extra: object = {}) =>
  $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }], ...extra })

// Waits for something a fire-and-forget promise does, without a fixed sleep.
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 2000 && !done(); i += 1) await new Promise(r => setTimeout(r, 1))
}

// ---------------------------------------------------------------- pure helpers

test('only the exact finalizer command counts; shell suffixes, substitutions and other roots fail', () => {
  expect(finalizerCall(FINALIZER, ROOT)).toBe(true)
  expect(finalizerCall(FINALIZER.replace('/plugin', '${CLAUDE_PLUGIN_ROOT}'), ROOT)).toBe(true)
  for (const command of [FINALIZER + '; git commit -am x', FINALIZER + ' && true', FINALIZER.replace('/proj" claude-code', '/other" claude-code'), FINALIZER.replace('/plugin', '$(echo /plugin)'), 'echo current'])
    expect(finalizerCall(command, ROOT)).toBe(false)
})
test('receipts require the runtime tag, host, root, current result and matching pointer', () => {
  const receipt = { schemaVersion: 1, kind: 'methodical-checkpoint-finalized', host: 'claude-code', root: ROOT, current: true, generation: '1-aaaaaaaaaaaaaaaa', checkpointHash: 'a'.repeat(64) }
  const read = finalizationReceipt(JSON.stringify(receipt), ROOT)
  expect(read).not.toBe(null)
  expect(matchingPointer(JSON.stringify({ schemaVersion: 1, generation: receipt.generation, sha256: receipt.checkpointHash }), read!)).toBe(true)
  for (const extra of [{current:false}, {host:'codex'}, {root:'/other'}, {kind:'parent-says-current'}, {checkpointHash:'bad'}])expect(finalizationReceipt(JSON.stringify({...receipt,...extra}),ROOT)).toBe(null)
  expect(finalizationResume('{}',read!)).toBe(null)
})

test('the closed set of the person\'s own prompts', () => {
  for (const kind of ['composer', 'bridge', 'sdk']) expect(isPersonPrompt({ kind })).toBe(true)
  for (const kind of ['task-notification', 'peer', 'plugin', 'unclassified', 'scheduled-trigger'])
    expect(isPersonPrompt({ kind })).toBe(false)
  expect(isPersonPrompt(undefined)).toBe(false)
})

test('labels are normalised and matched exactly; the rest is other', () => {
  expect(parseLabel('Skip.')).toBe('skip')
  expect(parseLabel(' compound\n')).toBe('compound')
  expect(parseLabel('Other')).toBe('other')
  expect(parseLabel('banana')).toBe('other')
  expect(parseLabel('skip it please')).toBe('other')
})

test('the percent, the reserve and the lines', () => {
  expect(usablePercent(45)).toBe(45)
  expect(usablePercent(1)).toBe(1)
  expect(usablePercent(100)).toBe(100)
  expect(usablePercent(47.5)).toBe(47.5)
  for (const bad of [0, -5, 101, Number.NaN, Number.POSITIVE_INFINITY, '47', undefined, null]) expect(usablePercent(bad)).toBe(45)
  expect(usableReserve(50000, 900000)).toBe(50000)
  for (const bad of [0, -1, Number.NaN, 'x', undefined]) expect(usableReserve(bad, 900000)).toBe(120000)
  expect(usableReserve(undefined, 100000)).toBe(20000) // the default is capped at a fifth of the threshold
  expect(usableReserve(200000, 900000)).toBe(180000) // a valid value above the cap is clamped to it
  expect(usableReserve(900000, 900000)).toBe(180000)
  expect(usableReserve(undefined, 3)).toBe(1) // never below one token
  expect(earlyLine(1000000, 45)).toBe(450000)
  expect(earlyLine(200000, 45)).toBe(90000)
  expect(lateLine(967000, 120000)).toBe(847000)
  const on = { totalTokens: 100, autoCompactThreshold: 1000, isAutoCompactEnabled: true }
  expect(contextFigures(on, 5000)).toEqual({ used: 100, window: 5000, threshold: 1000 })
  expect(contextFigures({ ...on, isAutoCompactEnabled: false }, 5000)).toEqual({ used: 100, window: 5000, threshold: 5000 })
  expect(contextFigures({ totalTokens: 100, isAutoCompactEnabled: true }, 5000)).toEqual({ used: 100, window: 5000, threshold: null })
  for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) expect(contextFigures({ ...on, totalTokens: bad }, 5000)).toBe(null)
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) expect(contextFigures(on, bad as any)).toBe(null)
  expect(looksLikeRefusal('no tool named AskUserQuestion in this session')).toBe(true)
  expect(looksLikeRefusal('dismissed')).toBe(false)
  expect(steered(undefined, false)).toBe(STEER)
  expect(steered('keep X', true, 'abc')).toBe(`keep X\n${STEER}${STEER_DECLINED}`)
  expect(steered('abc', false, 'abc')).toBe(STEER)
})

// ---------------------------------------------------------------- currency

test('a checkpoint makes /compact go straight through, no question, no classifier', async ($, on) => {
  const w = world(on)
  await checkpoint($)
  const r = await compact($)
  expect(r.skip).toBeUndefined()
  expect(w.asked).toBe(0)
  expect(w.classified.length).toBe(0)
  expect(w.compacts.length).toBe(1)
  expect(w.compacts[0].instructions).toContain(STEER)
})

for(const fault of ['pointer','resume','plan','error','unknown'] as const)test(`a ${fault} finalizer mismatch never makes the handoff current`,async($,on)=>{
  const w=world(on,{finalizeFault:fault});await checkpoint($);await compact($);expect(w.asked).toBe(1);expect(w.finalizations).toBe(1)
})
test('a refused currency write never repeats the finalizer command',async($,on)=>{
  on('state.set',async(_$:any,e:any,next:any)=>{if(e.key==='handoff'&&e.value==='current')return {value:{isSet:false,version:0}};return next(e)})
  const w=world(on);await checkpoint($);await compact($);expect(w.asked).toBe(1);expect(w.finalizations).toBe(1)
})

test('a resume marker, another file, a failed write and a subagent do not make it current', async ($, on) => {
  const w = world(on, { files: { [RESUME]: `${MARKER_A}\nold` } })
  const attempts: [string, () => Promise<unknown>][] = [
    ['retained', () => write($, RESUME, `${MARKER_A}\nupdated`)],
    ['other file', () => write($, '/proj/skills/x.md', `${MARKER_B}\n`)],
    ['failed', () => write($, '/proj/DENIED/docs/resume.md', `${MARKER_B}\n`)],
    ['subagent', () => write($, RESUME, `${MARKER_B}\n`, { agentId: 'sub-1' })],
  ]
  for (const [name, act] of attempts) {
    await act()
    const before = w.asked
    await compact($)
    expect(`${name}:${w.asked - before}`).toBe(`${name}:1`)
  }
})

test('after finalization only a read-only call and non-person prompts keep it current', async ($, on) => {
  const w = world(on)
  await checkpoint($)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r', file_path: '/proj/a' })
  await $.prompt.submit({ text: 'done', origin: { kind: 'task-notification' } })
  await compact($)
  expect(w.asked).toBe(0)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'bash tests/x.sh' })
  await compact($)
  expect(w.asked).toBe(1)
})

test('a prompt of the person\'s own, or a later resume write, makes it stale', async ($, on) => {
  const w = world(on)
  await checkpoint($)
  await $.prompt.submit({ text: 'one more ruling', origin: person })
  await compact($)
  expect(w.asked).toBe(1)
  await checkpoint($, MARKER_B)
  await write($, RESUME, `${MARKER_B}\nedited again`)
  await compact($)
  expect(w.asked).toBe(2)
})

test('finalization and a commit in one batch end stale', async ($, on) => {
  const w = world(on)
  await Promise.all([checkpoint($), $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'git commit -m x' })])
  await compact($)
  expect(w.asked).toBe(1)
})

test('a failed write after finalization leaves the handoff current', async ($, on) => {
  const w = world(on)
  await checkpoint($)
  await write($, '/proj/DENIED/x.md', 'x')
  await compact($)
  expect(w.asked).toBe(0)
})

test('session.end makes everything stale and drops a pending chain', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: OPTION_CHAIN })
  await compact($) // starts a checkpoint and a chain
  await $.session.end({ reason: 'clear' })
  await checkpoint($)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: {} })
  await clock.advance(1)
  expect(w.commands.some(c => c.command === 'compact')).toBe(false) // the chain went with the session
  await $.session.end({ reason: 'clear' })
  w.answer = OPTION_COMPOUND
  await compact($)
  expect(w.asked).toBe(2) // stale again
})

// ---------------------------------------------------------------- the question

test('the classifier saying skip compacts with nothing asked and the decline in the steer', async ($, on) => {
  const w = world(on, { label: 'skip' })
  await $.prompt.submit({ text: 'just compact, skip the compounding', origin: person })
  await compact($)
  expect(w.asked).toBe(0)
  expect(w.compacts[0].instructions).toContain(STEER_DECLINED.trim())
})

test('an unanswered classifier compacts with no decline; an unparseable one asks', async ($, on) => {
  const w = world(on, { label: null })
  await compact($)
  expect(w.asked).toBe(0)
  expect(w.compacts[0].instructions).not.toContain('chose to compact')
  w.label = 'Noskip.'
  await compact($)
  expect(w.asked).toBe(1)
})

test('both options hold the compaction, start the checkpoint and store no choice', async ($, on) => {
  const w = world(on, { label: 'other' })
  const r = await compact($)
  expect(r.skip).toContain(CHECKPOINT)
  expect(w.options).toEqual([[OPTION_COMPOUND, OPTION_CHAIN]]) // exactly these two: no skip option
  expect(w.compacts.length).toBe(0)
  expect(w.commands).toEqual([{ command: 'methodical:compound', args: 'checkpoint' }])
  await compact($) // a later /compact with a stale handoff asks again
  expect(w.asked).toBe(2)
  w.answer = OPTION_CHAIN
  const chained = await compact($)
  expect(chained.skip).toContain('the compaction follows')
  expect(w.commands.length).toBe(3)
})

test('a rejected checkpoint start toasts and fills an empty box', async ($, on) => {
  const w = world(on, { answer: OPTION_CHAIN, failCommand: true })
  await compact($)
  await until(() => w.fills.length > 0)
  expect(w.toasts.join(' ')).toContain(CHECKPOINT)
  expect(w.fills).toEqual([CHECKPOINT])
})

test('free text: compound holds, skip and other compact', async ($, on) => {
  const w = world(on)
  w.answer = 'yes, keep the lessons'
  w.label = p => (p.includes('keep the lessons') ? 'compound' : p.includes('just compact') ? 'skip' : 'other')
  const r = await compact($)
  expect(r.skip).toContain(CHECKPOINT)
  w.answer = 'no thanks, just compact'
  const r2 = await compact($)
  expect(r2.skip).toBeUndefined()
  w.answer = 'hmm, what does that mean?'
  const r3 = await compact($)
  expect(r3.skip).toBeUndefined()
  expect(w.compacts.length).toBe(2)
  expect(w.compacts[1].instructions).not.toContain('chose to compact') // not a decline
})

test('Esc with a surface is a decline; no surface, or a refusal, is not', async ($, on) => {
  const w = world(on, { answer: new Error('dismissed') })
  await compact($)
  expect(w.compacts[0].instructions).toContain('chose to compact')
  w.answer = new Error('no tool named AskUserQuestion in this session')
  await compact($)
  expect(w.compacts[1].instructions).not.toContain('chose to compact')
  w.answer = new Error('dismissed')
  w.surfaces = []
  await compact($)
  expect(w.compacts[2].instructions).not.toContain('chose to compact')
})

test('"Chat about this" holds once, then the next /compact goes through unasked', async ($, on) => {
  const w = world(on, { answer: new Error('The user wants to clarify these questions.') })
  const first = await compact($)
  expect(first.skip).toContain('talk it over')
  expect(w.compacts.length).toBe(0)
  expect(w.commands.length).toBe(0) // no checkpoint, no decline recorded
  await $.prompt.submit({ text: 'what would you write up?', origin: person }) // the chat itself
  const second = await compact($)
  expect(second.skip).toBeUndefined()
  expect(w.asked).toBe(1) // not asked a second time
  expect(w.compacts[0].instructions).not.toContain('chose to compact')
  w.answer = OPTION_COMPOUND
  await compact($) // the pass is used up: asked again
  expect(w.asked).toBe(2)
})

test('the chat pass does not outlive a compaction boundary or the session', async ($, on) => {
  const w = world(on, { answer: new Error('The user wants to clarify these questions.') })
  await compact($)
  await $.classic.SessionStart({ source: 'compact' })
  w.answer = OPTION_COMPOUND
  await compact($)
  expect(w.asked).toBe(2)
})

test('"wants to clarify" is a chat, a dismissal is not', () => {
  expect(looksLikeChat('The user wants to clarify these questions.')).toBe(true)
  expect(looksLikeChat('dismissed')).toBe(false)
})

// ------------------------------------------------ an abort while the question is up (the host cancels the command)

// An inline plugin above the mod. It runs in a module of its own, so the test drives it with prompts it
// answers itself: `__arm__`, `__settle__` and `__inner__`. Armed, it starts the rest of the chain and waits
// for `__settle__`, then returns first, which aborts the mod's `next.signal`. `__inner__` answers with the
// mod's own result as JSON (or its error).
function aboveMod() {
  return {
    plugin: {
      name: 'above',
      tier: 'prepend' as const,
      register(on: any) {
        let armed = true
        let inner: Promise<any> | undefined
        let release: () => void = () => undefined
        on('session.compact', async (_$: any, e: any, next: any) => {
          if (!armed) return next(e)
          armed = false
          inner = next(e)
          inner.catch(() => undefined)
          await new Promise<void>(r => (release = r))
          return { skip: 'above-settled-first' }
        })
        on('prompt.submit', async (_$: any, e: any, next: any) => {
          if (e.text === '__arm__') armed = true
          else if (e.text === '__settle__') release()
          else if (e.text === '__inner__') {
            const r = await (inner as Promise<any>).then(
              (v: any) => v,
              (err: any) => ({ error: String(err && err.message) }),
            )
            return { text: JSON.stringify(r) }
          } else return next(e)
          return { text: e.text }
        })
      },
    },
  }
}
const arm = ($: any) => $.prompt.submit({ text: '__arm__' })
const settle = ($: any) => $.prompt.submit({ text: '__settle__' })
const innerOf = async ($: any) => JSON.parse((await $.prompt.submit({ text: '__inner__' })).text)

// One abort at the question, then the dialog is closed with `message`. Returns the mod's own result.
async function escAbort($: any, w: World, message = 'dismissed') {
  let deny: (e: Error) => void = () => undefined
  w.answer = () => new Promise<string | Error>(r => (deny = r))
  await arm($)
  const before = w.asked
  const outer = compact($)
  await until(() => w.asked > before)
  await settle($)
  expect((await outer).skip).toBe('above-settled-first')
  deny(new Error(message))
  return await innerOf($)
}

test('the dismissal reading: chat first, then an abort, then a refusal, else a rejection', () => {
  expect(readDismissal('The user wants to clarify these questions.', true)).toBe('chat')
  expect(readDismissal('The user wants to clarify these questions.', false)).toBe('chat')
  expect(readDismissal('permission denied', true)).toBe('esc-abort')
  expect(readDismissal('dismissed', true)).toBe('esc-abort')
  expect(readDismissal('permission denied', false)).toBe('refused')
  expect(readDismissal('dismissed', false)).toBe('rejected')
})

const k1 = aboveMod()
test('K1 Esc under an abort: no compaction now, an honest line, then the next /compact compacts unasked', { plugins: [k1.plugin] }, async ($, on) => {
  const w = world(on, { label: 'other' })
  const afterLines: string[][] = []
  w.inCompact = async () => {
    afterLines.push((await $.classic.SessionStart({ source: 'compact' })).additionalContext ?? [])
  }
  const mod = await escAbort($, w)
  expect(mod.skip).toBe(LINE_ESC_PASS)
  expect(mod.skip).not.toBe('cancelled')
  expect(w.compacts.length).toBe(0)
  expect(w.toasts).toContain(LINE_ESC_PASS)
  expect(w.asked).toBe(1)
  const retry = await compact($) // the very next /compact
  expect(retry.skip).toBeUndefined()
  expect(w.asked).toBe(1) // not asked again
  expect(w.compacts.length).toBe(1)
  expect(w.compacts[0].instructions).toContain(STEER_DECLINED.trim())
  expect(afterLines.length).toBe(1) // the kit's compaction asked the after-compaction hook
  expect(afterLines[0]).toEqual([]) // and the declined attempt left the after-compaction line out
  await $.prompt.submit({ text: 'more work', origin: person })
  w.answer = OPTION_COMPOUND
  const later = await compact($)
  expect(w.asked).toBe(2) // the pass is used up
  expect(later.skip).toContain(CHECKPOINT) // and the attempt was cleared: not "pending"
})

test('K2 Esc as a plain rejection compacts now and sets no pass', async ($, on) => {
  const w = world(on, { answer: new Error('dismissed') })
  const r = await compact($)
  expect(r.skip).toBeUndefined()
  expect(w.compacts.length).toBe(1)
  expect(w.compacts[0].instructions).toContain('chose to compact')
  await compact($) // the immediate next /compact, no new work, asks again
  expect(w.asked).toBe(2)
})

for (const label of ['skip', 'other', null] as const) {
  const above = aboveMod()
  test(`K3 an abort before the question shows compacts nothing, holds nothing (classifier says ${label})`, { plugins: [above.plugin] }, async ($, on) => {
    let open: () => void = () => undefined
    const gate = new Promise<void>(r => (open = r))
    const w = world(on, { label })
    w.classifyGate = () => gate
    const outer = compact($)
    await until(() => w.classified.length > 0)
    await settle($)
    expect((await outer).skip).toBe('above-settled-first')
    open()
    const mod = await innerOf($)
    expect(mod.skip).toBe(LINE_STOPPED)
    expect(w.asked).toBe(0)
    expect(w.compacts.length).toBe(0)
    w.classifyGate = undefined
    w.label = 'other'
    w.answer = OPTION_COMPOUND
    await compact($) // no pass was set: the next /compact asks
    expect(w.asked).toBe(1)
  })
}

const k4 = aboveMod()
test('K4 the Esc pass is dropped by new work, a boundary and the end of the session; a read does not drop it', { plugins: [k4.plugin] }, async ($, on) => {
  const w = world(on, { label: 'other' })
  const droppers: [string, () => Promise<unknown>][] = [
    ["a person's prompt", () => $.prompt.submit({ text: 'and then', origin: person })],
    ['a non-read-only tool call', () => $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'git commit -m x' })],
    ['a compaction boundary', () => $.classic.SessionStart({ source: 'compact' })],
    ['the end of the session', () => $.session.end({ reason: 'clear' })],
  ]
  for (const [name, drop] of droppers) {
    const mod = await escAbort($, w)
    expect(mod.skip).toBe(LINE_ESC_PASS)
    await drop()
    const before = w.asked
    w.answer = OPTION_COMPOUND
    await compact($)
    if (w.asked !== before + 1) throw new Error(`${name} did not drop the pass`)
  }
  // a read does not drop it
  await escAbort($, w)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r' })
  const asked = w.asked
  const compacts = w.compacts.length
  await compact($)
  expect(w.asked).toBe(asked)
  expect(w.compacts.length).toBe(compacts + 1)
  // the chat pass survives a non-read-only call
  w.answer = new Error('The user wants to clarify these questions.')
  await $.prompt.submit({ text: 'new work', origin: person })
  await compact($)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'ls' })
  const askedAfterChat = w.asked
  const compactsAfterChat = w.compacts.length
  await compact($)
  expect(w.asked).toBe(askedAfterChat)
  expect(w.compacts.length).toBe(compactsAfterChat + 1)
})

const k5 = aboveMod()
test('K5 an abort with the chat message is a chat; an abort with a refusal-pattern message is Esc', { plugins: [k5.plugin] }, async ($, on) => {
  const w = world(on, { label: 'other' })
  const chat = await escAbort($, w, 'The user wants to clarify these questions.')
  expect(chat.skip).toContain('talk it over')
  const asked = w.asked
  const r = await compact($) // the chat pass: goes through unasked, not declined
  expect(r.skip).toBeUndefined()
  expect(w.asked).toBe(asked)
  expect(w.compacts[0].instructions).not.toContain('chose to compact')
  const denied = await escAbort($, w, 'permission denied')
  expect(denied.skip).toBe(LINE_ESC_PASS)
})

const k6 = aboveMod()
test('K6 an abort during the free-text classify leaves the existing answer path alone', { plugins: [k6.plugin] }, async ($, on) => {
  let open: () => void = () => undefined
  const gate = new Promise<void>(r => (open = r))
  const w = world(on, { answer: 'yes, keep the lessons' })
  w.label = p => (p.includes('keep the lessons') ? 'compound' : 'other')
  w.classifyGate = p => (p.includes('answered in their own words') ? gate : undefined)
  const outer = compact($)
  await until(() => w.classified.length >= 2)
  await settle($)
  expect((await outer).skip).toBe('above-settled-first')
  open()
  const mod = await innerOf($)
  expect(mod.skip).toContain(CHECKPOINT) // compound held and started the checkpoint, as without an abort
  w.classifyGate = undefined
  w.answer = OPTION_COMPOUND
  await compact($)
  expect(w.asked).toBe(2) // and no pass was set
})

const k6b = aboveMod()
test('K6 an abort during the free-text classify of a "just compact" answer still compacts: the person answered', { plugins: [k6b.plugin] }, async ($, on) => {
  let open: () => void = () => undefined
  const gate = new Promise<void>(r => (open = r))
  const w = world(on, { answer: 'no thanks, just compact' })
  w.label = p => (p.includes('just compact') ? 'skip' : 'other')
  w.classifyGate = p => (p.includes('answered in their own words') ? gate : undefined)
  const outer = compact($)
  await until(() => w.classified.length >= 2)
  await settle($)
  expect((await outer).skip).toBe('above-settled-first')
  open()
  expect((await innerOf($)).skip).toBeUndefined()
  expect(w.compacts.length).toBe(1)
})

const k7a = aboveMod()
test('K7 a pass write that lands nothing after the abort gives the neutral line and compacts nothing', { plugins: [k7a.plugin] }, async ($, on) => {
  on('state.set', async (_$: any, e: any, next: any) => {
    if (e.key === 'pass' && e.value === 'declined') return { value: { isSet: false } }
    return next(e)
  })
  const w = world(on, { label: 'other' })
  const mod = await escAbort($, w)
  expect(mod.skip).toBe(LINE_NEUTRAL)
  expect(w.compacts.length).toBe(0)
  expect(w.toasts).not.toContain(LINE_ESC_PASS) // no toast promising a pass that was not written
  w.answer = OPTION_COMPOUND
  await compact($) // no pass, and the attempt was cleared: asked, not "pending"
  expect(w.asked).toBe(2)
})

const k7b = aboveMod()
test('K7 a refused call before the question, after an abort, gives the neutral line and never a compaction (the inline guard)', { plugins: [k7b.plugin] }, async ($, on) => {
  let boom: () => void = () => undefined
  const hold = new Promise<void>(r => (boom = r))
  let reached = false
  on('state.get', async (_$: any, e: any, next: any) => {
    if (e.key === 'prompts' && !reached) {
      reached = true
      await hold
      return { deny: 'refused' } // the `$` call rejects, as a call the host refuses would
    }
    return next(e)
  })
  const w = world(on, { label: 'other' })
  const outer = compact($)
  await until(() => reached)
  await settle($)
  expect((await outer).skip).toBe('above-settled-first')
  boom()
  expect((await innerOf($)).skip).toBe(LINE_NEUTRAL)
  expect(w.compacts.length).toBe(0)
  expect(w.asked).toBe(0)
})

test('K7 a refused call with no abort fails open: the compaction still runs', async ($, on) => {
  let denied = false
  on('state.get', async (_$: any, e: any, next: any) => {
    if (e.key === 'prompts' && !denied) {
      denied = true
      return { deny: 'refused' }
    }
    return next(e)
  })
  const w = world(on, { label: 'other' })
  await compact($)
  expect(denied).toBe(true)
  expect(w.compacts.length).toBe(1) // the hook's own catch lets the compaction go on, as for every hook
})

const k7d = aboveMod()
test('K7 a failure after the compaction was started is not turned into the neutral line', { plugins: [k7d.plugin] }, async ($, on) => {
  let boom: () => void = () => undefined
  const hold = new Promise<void>(r => (boom = r))
  const w = world(on, { label: 'skip' })
  w.inCompact = async () => {
    await hold
    throw new Error('compaction failed')
  }
  const outer = compact($)
  await until(() => w.compacts.length > 0)
  await settle($)
  expect((await outer).skip).toBe('above-settled-first')
  boom()
  expect((await innerOf($)).skip).not.toBe(LINE_NEUTRAL)
})

const k10 = aboveMod()
test('K10 an abort that lands while the attempt is recorded, before any question, still compacts nothing', { plugins: [k10.plugin] }, async ($, on) => {
  let go: () => void = () => undefined
  const hold = new Promise<void>(r => (go = r))
  let reached = false
  on('state.set', async (_$: any, e: any, next: any) => {
    if (e.key === 'attempt' && e.value && e.value.declined === true && !reached) {
      reached = true
      await hold
    }
    return next(e)
  })
  const w = world(on, { label: 'skip' }) // the person said to skip: proceed(declined) records the attempt first
  const outer = compact($)
  await until(() => reached)
  await settle($)
  expect((await outer).skip).toBe('above-settled-first')
  go()
  expect((await innerOf($)).skip).toBe(LINE_NEUTRAL)
  expect(w.compacts.length).toBe(0)
})

const kx = aboveMod()
test('KX a boundary or the end of the session while the question lingers after an abort stops the pass being written', { plugins: [kx.plugin] }, async ($, on) => {
  const w = world(on, { label: 'other' })
  for (const between of [
    () => $.classic.SessionStart({ source: 'compact' }),
    () => $.session.end({ reason: 'clear' }),
  ]) {
    let deny: (e: Error) => void = () => undefined
    w.answer = () => new Promise<string | Error>(r => (deny = r))
    await arm($)
    const before = w.asked
    const outer = compact($)
    await until(() => w.asked > before)
    await settle($)
    await outer
    await between() // lands while the question still lingers
    deny(new Error('dismissed'))
    expect((await innerOf($)).skip).toBe(LINE_NEUTRAL) // the late pass write missed: no pass survives
    w.answer = OPTION_COMPOUND
    const asked = w.asked
    await compact($)
    expect(w.asked).toBe(asked + 1)
  }
})

const k8 = aboveMod()
test('K8 an abort that lands while the mod looks for a surface still compacts nothing', { plugins: [k8.plugin] }, async ($, on) => {
  let go: () => void = () => undefined
  const w = world(on, { label: 'other', answer: new Error('dismissed') }) // a plain rejection first
  w.surfacesGate = new Promise<void>(r => (go = r))
  const outer = compact($)
  await until(() => w.surfacesReached === true)
  await settle($) // the host aborts after the rejection
  expect((await outer).skip).toBe('above-settled-first')
  go()
  expect((await innerOf($)).skip).toBe(LINE_ESC_PASS)
  expect(w.compacts.length).toBe(0)
})

const k9 = aboveMod()
test('K9 a /compact that meets a pending attempt does not use up the Esc pass', { plugins: [k9.plugin] }, async ($, on) => {
  let fakePending = false
  on('state.get', async (_$: any, e: any, next: any) => {
    if (fakePending && e.key === 'attempt') return { value: { value: { nonce: 'other', declined: false }, version: 'v1' } }
    return next(e)
  })
  const w = world(on, { label: 'other' })
  await escAbort($, w)
  fakePending = true // another dispatch has an attempt open
  expect((await compact($)).skip).toContain('pending')
  fakePending = false
  const retry = await compact($) // the pass is still there
  expect(retry.skip).toBeUndefined()
  expect(w.compacts.length).toBe(1)
  w.answer = OPTION_COMPOUND
  await compact($) // the pass was used by the retry: this one asks
  expect(w.asked).toBe(2)
})

test('auto, precompute, plugin and subagent compactions are never held', async ($, on) => {
  const w = world(on)
  for (const extra of [{ trigger: 'auto' }, { trigger: 'precompute' }, { trigger: 'plugin' }, { agentId: 'sub-1' }]) {
    await compact($, extra)
  }
  expect(w.asked).toBe(0)
  expect(w.compacts.length).toBe(4)
  expect(w.compacts[0].instructions).toContain(STEER)
  expect(w.compacts[1].instructions).toContain(STEER)
  expect(w.compacts[2].instructions ?? '').not.toContain(STEER)
  expect(w.compacts[3].instructions ?? '').not.toContain(STEER)
})

test('a second /compact while the question is up asks nothing and breaks nothing', async ($, on) => {
  let release: (s: string) => void = () => undefined
  let reached: () => void = () => undefined
  const asking = new Promise<void>(r => (reached = r))
  const gate = new Promise<string>(r => (release = r))
  const w = world(on, { answer: () => { reached(); return gate } })
  const first = compact($)
  await asking // the question is up
  const second = await compact($)
  expect(second.skip).toContain('pending')
  release(OPTION_COMPOUND)
  const r = await first
  expect(r.skip).toContain(CHECKPOINT)
  expect(w.asked).toBe(1)
  await compact($) // the attempt was removed: it asks again
  expect(w.asked).toBe(2)
})

test('two /compact dispatches at once ask once', async ($, on) => {
  let release: (s: string) => void = () => undefined
  const gate = new Promise<string>(r => (release = r))
  const w = world(on, { answer: () => gate })
  const both = Promise.all([compact($), compact($)])
  await until(() => w.asked > 0)
  release(OPTION_COMPOUND)
  const [a, b] = await both
  expect(w.asked).toBe(1)
  expect([a.skip, b.skip].filter(x => x?.includes('pending')).length).toBe(1)
})

test('offer off: nothing is asked and nothing is added, the steer stays', { options: { offer: 'off' } }, async ($, on) => {
  const w = world(on)
  await compact($)
  expect(w.asked).toBe(0)
  expect(w.compacts[0].instructions).toContain(STEER)
  const r = await $.classic.SessionStart({ source: 'compact' })
  expect(r.additionalContext ?? []).toEqual([])
})

// ---------------------------------------------------------------- the line after

test('the line is omitted for a declined attempt and present for one that was not', async ($, on) => {
  const w = world(on, { label: 'skip' })
  let seen: string[] | undefined
  // The after-compaction handler runs inside the compaction, so the bottom of session.compact raises it.
  w.inCompact = async () => {
    seen = (await $.classic.SessionStart({ source: 'compact' })).additionalContext
  }
  await compact($) // declined
  expect(w.compacts.length).toBe(1)
  expect(seen ?? []).toEqual([])
  w.label = 'other'
  w.answer = new Error('no tool named AskUserQuestion') // plain proceed, no decline
  await compact($)
  expect((seen ?? []).length).toBe(1)
  await compact($, { trigger: 'auto' }) // automatic: never declined
  expect((seen ?? []).length).toBe(1)
})

// ---------------------------------------------------------------- the chain

test('then compact for me: the mod runs its own /compact with a nonce the steer never shows', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: OPTION_CHAIN })
  await compact($)
  expect(w.commands.length).toBe(1)
  await beginCheckpoint($, w, 't1')
  await checkpoint($)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, usage: {} })
  await clock.advance(1)
  const run = w.commands.find(c => c.command === 'compact')
  expect(run?.args).toMatch(/^methodical-compact-[0-9a-f]{16}$/)
  w.compacts.length = 0
  await compact($, { instructions: run?.args })
  expect(w.asked).toBe(1)
  expect(w.compacts[0].instructions).toBe(STEER)
})

const endCheckpoint = ($: any, isAborted = false) =>
  $.turn.complete({ turnId: 'checkpoint', reason: 'answer', answer: '', durationMs: 1, isAborted, usage: {} })

test('chat compact reuses a current handoff and asks once for a stale one', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { label: 'skip' })
  await $.prompt.submit({ text: 'just compact the old session', origin: person })
  await checkpoint($)
  await $.prompt.submit({ text: 'Compact.', origin: person })
  await clock.advance(1)
  const first = w.commands.at(-1)
  expect(first?.command).toBe('compact')
  let note: string[] = []
  w.inCompact = async () => {
    note = (await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/session.jsonl' })).additionalContext ?? []
  }
  await compact($, { instructions: first?.args })
  expect(w.compacts[0].instructions).toBe(STEER)
  expect(w.asked).toBe(0)
  expect(note.join(' ')).toContain('/t/session.jsonl')
  expect(note.join(' ')).not.toContain(CHECKPOINT)

  await checkpoint($)
  await $.prompt.submit({ text: 'one more ruling', origin: person })
  await $.prompt.submit({ text: 'compact', origin: person })
  await clock.advance(1)
  await compact($, { instructions: w.commands.at(-1)?.args })
  expect(w.compacts.length).toBe(1)
  expect(w.asked).toBe(1)
  expect(w.classified).toEqual([])
  expect(w.commands.at(-1)).toEqual({ command: 'methodical:compound', args: 'checkpoint' })
})

test('a direct chat decline compacts once without the menu', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  await $.prompt.submit({ text: 'No, just compact.', origin: person })
  await clock.advance(1)
  const run = w.commands.at(-1)
  expect(run?.command).toBe('compact')
  await compact($, { instructions: run?.args })
  await compact($, { instructions: run?.args })
  expect(w.compacts.map(c => c.instructions)).toEqual([STEER + STEER_DECLINED])
  expect(w.asked).toBe(0)
})

for (const text of ['compound, then compact', 'Compound and compact.', 'Yes, compound first, then compact for me']) {
  test(`chat "${text}" starts a verified checkpoint and compacts once`, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await checkpoint($)
    await $.prompt.submit({ text, origin: person })
    await clock.advance(1)
    expect(w.commands.map(c => c.command)).toEqual(['methodical:compound'])
    await $.turn.complete({ turnId: 'previous', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: {} })
    await beginCheckpoint($, w, 'checkpoint')
    await checkpoint($)
    await endCheckpoint($)
    await clock.advance(1)
    const run = w.commands.at(-1)
    expect(run?.command).toBe('compact')
    await compact($, { instructions: run?.args })
    await compact($, { instructions: run?.args })
    expect(w.compacts.map(c => c.instructions)).toEqual([STEER])
    expect(w.asked).toBe(0)
  })
}

test('an exact custom answer uses the same compound and compact chain', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: 'compound and compact' })
  await compact($)
  await beginCheckpoint($, w, 'checkpoint')
  await checkpoint($)
  await endCheckpoint($)
  await clock.advance(1)
  await compact($, { instructions: w.commands.at(-1)?.args })
  expect(w.asked).toBe(1)
  expect(w.compacts.length).toBe(1)
})

test('a prior handoff and an aborted checkpoint cannot authorize automatic compact', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  await checkpoint($)
  await $.prompt.submit({ text: 'compound, then compact', origin: person })
  await clock.advance(1)
  await beginCheckpoint($, w, 'checkpoint')
  await endCheckpoint($)
  await clock.advance(1)
  expect(w.commands.map(c => c.command)).toEqual(['methodical:compound'])
  await $.prompt.submit({ text: 'compound, then compact', origin: person })
  await clock.advance(1)
  await beginCheckpoint($, w, 'checkpoint')
  await checkpoint($)
  await endCheckpoint($, true)
  await clock.advance(1)
  expect(w.commands.map(c => c.command)).toEqual(['methodical:compound', 'methodical:compound'])
})

test('a queued compaction stops silently when its handoff changes or its request is replaced', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: OPTION_CHAIN })
  await compact($)
  await beginCheckpoint($, w, 'checkpoint')
  await checkpoint($)
  await endCheckpoint($)
  await clock.advance(1)
  const stale = w.commands.at(-1)?.args
  await write($, RESUME, 'new work')
  await compact($, { instructions: stale })

  await compact($)
  await beginCheckpoint($, w, 'checkpoint')
  await checkpoint($)
  await endCheckpoint($)
  await clock.advance(1)
  const replaced = w.commands.at(-1)?.args
  await $.prompt.submit({ text: 'one more ruling', origin: person })
  await compact($, { instructions: replaced })
  expect(w.asked).toBe(2)
  expect(w.compacts).toEqual([])
})

test('quoted requests, mixed work and plugin prompts do not dispatch compaction', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  await $.prompt.submit({ text: 'What does "compound, then compact" mean?', origin: person })
  await $.prompt.submit({ text: 'compact and then update the plan', origin: person })
  await $.prompt.submit({ text: 'compound, then compact', origin: { kind: 'plugin' } })
  await clock.advance(1)
  expect(w.submits.length).toBe(3)
  expect(w.commands).toEqual([])
})

test('the chain stops for a person\'s prompt, an interrupted turn or a handoff not written', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: OPTION_CHAIN })
  const chained = () => w.commands.some(c => c.command === 'compact')
  const complete = async (reason: string) => {
    await $.turn.complete({ turnId: 't', reason, answer: '', durationMs: 1, isAborted: reason === 'aborted', usage: {} })
    await clock.advance(1)
  }

  await compact($) // 1: a person's prompt arrives during the checkpoint
  await beginCheckpoint($, w, 't')
  await $.prompt.submit({ text: 'wait', origin: person })
  await checkpoint($)
  await complete('answer')
  expect(chained()).toBe(false)

  await $.prompt.submit({ text: 'again', origin: person }) // make the handoff stale again
  await compact($) // 2: the turn is interrupted although the handoff is written
  await beginCheckpoint($, w, 't')
  await checkpoint($, MARKER_B)
  await complete('aborted')
  expect(chained()).toBe(false)
  expect(w.toasts.join(' ')).toContain('interrupted') // the handoff was written: the toast must not say otherwise
  expect(w.toasts.join(' ')).not.toContain('stopped before')

  await $.prompt.submit({ text: 'again', origin: person })
  w.toasts.length = 0
  await compact($) // 3: the turn answers but the handoff was never written
  await beginCheckpoint($, w, 't')
  await complete('answer')
  expect(chained()).toBe(false)
  expect(w.toasts.join(' ')).toContain('stopped before the handoff was written')
  expect(w.asked).toBe(3)
})

test('a stale write that misses because finalization landed first is retried: stale wins and the warning re-arms', async ($, on) => {
  let landed: () => void = () => undefined
  const currentLanded = new Promise<void>(r => (landed = r))
  const log: string[] = []
  let held = false
  on('state.set', async (_$: any, e: any, next: any) => {
    if (e.key === 'handoff' && e.value === 'stale' && e.ifVersion !== undefined && !held) {
      held = true
      await currentLanded // the marker's write lands before this conditional stale write
    }
    const r = await next(e)
    log.push(`${e.key}=${JSON.stringify(e.value)}`)
    if (e.key === 'handoff' && e.value === 'current') landed()
    return r
  })
  const w = world(on)
  await Promise.all([checkpoint($), $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'git commit -m x' })])
  expect(log.filter(l => l === 'handoff="stale"').length).toBe(2) // the first stale write missed and was retried
  expect(log).toContain('armed=true')
  await compact($)
  expect(w.asked).toBe(1)
})

test('a chain dropped for a handoff not written does not fire on a later turn that writes it', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: OPTION_CHAIN })
  await compact($)
  await beginCheckpoint($, w, 't1')
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: {} })
  await clock.advance(1)
  expect(w.toasts.join(' ')).toContain('stopped before the handoff was written')
  await $.prompt.submit({ text: 'done', origin: { kind: 'task-notification' } }) // not the person's: no chain reset here
  await checkpoint($)
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: {} })
  await clock.advance(1)
  expect(w.commands.some(c => c.command === 'compact')).toBe(false)
})

test('a nonce that is not a fired chain\'s is ordinary text and the question is asked', async ($, on) => {
  const w = world(on)
  await compact($, { instructions: 'aaaaaaaaaaaaaaaa' })
  expect(w.asked).toBe(1)
})

// ---------------------------------------------------------------- the offers

async function step($: any, extra: object = {}) {
  for await (const _ of $.turn.step({ turnId: 't', index: 1, model: 'm', effort: 'high', messageCount: 3, ...extra })) void _
}
const near = { total: 880000, threshold: 967000, enabled: true, window: 1000000 }

test('one toast and one cue at the line, none after, again after the handoff is lost', async ($, on) => {
  const session = mock.session(on)
  const w = world(on, { usage: { ...near, total: 100000 } })
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = near
  await step($)
  await step($)
  expect(w.toasts.length).toBe(1)
  expect(session.appended().length).toBe(1)
  await checkpoint($)
  await step($)
  expect(w.toasts.length).toBe(1) // current: no warning
  await $.prompt.submit({ text: 'more', origin: person }) // lost: armed again
  await step($)
  expect(w.toasts.length).toBe(2)
})

test('the warning arms again after a boundary and after the session ends', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: near })
  await step($)
  expect(w.toasts.length).toBe(1)
  await $.classic.SessionStart({ source: 'compact' })
  await step($)
  expect(w.toasts.length).toBe(2)
  await $.session.end({ reason: 'clear' })
  await step($)
  expect(w.toasts.length).toBe(3)
})

test('a subagent\'s compaction boundary changes nothing and adds no line', async ($, on) => {
  const w = world(on)
  await checkpoint($)
  const r = await $.classic.SessionStart({ source: 'compact', agent_id: 'sub-1' })
  expect(r.additionalContext ?? []).toEqual([])
  await compact($)
  expect(w.asked).toBe(0) // still current
})

test('an empty prompt of the person\'s own is not recorded as data', async ($, on) => {
  const w = world(on, { label: 'other' })
  await $.prompt.submit({ text: '   ', origin: person })
  await $.prompt.submit({ text: 'real words', origin: person })
  await compact($)
  expect(w.classified[0]).toContain('- real words')
  expect(w.classified[0]).not.toMatch(/^- \s*$/m)
})

test('the warning ignores subagents, absent figures, a bad reserve and offer off', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: near })
  await step($, { agentId: 'sub-1' })
  expect(w.toasts.length).toBe(0)
  w.usage = null
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = { ...near, enabled: false, total: 100000 } // against the window: plenty left
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = { ...near, enabled: false, total: 900000 } // 100k left of the window: inside the default reserve
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('offer off silences the warning', { options: { offer: 'off' } }, async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: near })
  await step($)
  expect(w.toasts.length).toBe(0)
})

test('the reserve option moves the late line', { options: { nudgeReserve: 10000, nudgePercent: 100 } }, async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: near }) // 87k left: outside a 10k reserve
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = { ...near, total: 960000 }
  await step($)
  expect(w.toasts.length).toBe(1)
})

// The two offers. The first is at a percent of the model's window; the last is before the host's threshold.
const big = { total: 0, threshold: 967000, enabled: true, window: 1000000 }
const small = { total: 0, threshold: 167000, enabled: true, window: 200000 }
const at = (base: typeof big, total: number, more: object = {}) => ({ ...base, total, ...more })

test('the first offer comes at 45% of a 1M window, and not before', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 0) })
  await step($)
  w.usage = at(big, 449999)
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(big, 450000)
  await step($)
  expect(w.toasts).toEqual([NUDGE_TOAST])
})

test('a current handoff gets no offer at either line, and a person\'s next prompt brings it back', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 449999) })
  await checkpoint($)
  await step($)
  w.usage = at(big, 450000)
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(big, 847000)
  await step($)
  expect(w.toasts.length).toBe(0)
  await $.prompt.submit({ text: 'more', origin: person }) // the handoff is lost
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('the first offer on a 200k window comes at 90,000, not at the start', { options: {} }, async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(small, 1) })
  await step($)
  w.usage = at(small, 89999)
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(small, 90000)
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('a small compaction threshold with the default reserve is silent at the start and offers at its capped line', async ($, on) => {
  mock.session(on)
  const tiny = { total: 0, threshold: 100000, enabled: true, window: 1000000 }
  const w = world(on, { usage: at(tiny, 20000) })
  await step($)
  w.usage = at(tiny, 79999)
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(tiny, 80000)
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('taking the first offer and carrying on does not repeat it; the last offer comes once at the late line', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 450000) })
  await step($)
  expect(w.toasts.length).toBe(1)
  await checkpoint($)
  await $.prompt.submit({ text: 'more work', origin: person }) // the handoff is lost
  for (const total of [460000, 600000, 846999]) {
    w.usage = at(big, total)
    await step($)
  }
  expect(w.toasts.length).toBe(1)
  w.usage = at(big, 847000)
  await step($)
  await step($)
  expect(w.toasts.length).toBe(2)
})

test('ignoring the first offer still gets the last one, and the boundary note follows what was shown', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 450000) })
  await step($)
  expect(w.toasts.length).toBe(1)
  // only the first offer showed: the full note still carries the compound sentence
  const early = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/a.jsonl' })
  expect(early.additionalContext).toEqual([afterLine('/t/a.jsonl', false)])
  // the last offer showed: the note keeps only the pointer
  w.usage = at(big, 450000)
  await step($)
  w.usage = at(big, 847000)
  await step($)
  expect(w.toasts.length).toBe(3) // first, then (after the boundary re-armed it) first again, then the last
  const late = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/b.jsonl' })
  expect(late.additionalContext).toEqual([afterLine('/t/b.jsonl', true)])
})

test('a new conversation gets its own first offer: after the session ends and after a boundary, not after a subagent\'s', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 500000) })
  await step($)
  expect(w.toasts.length).toBe(1)
  await $.classic.SessionStart({ source: 'compact', agent_id: 'sub-1' }) // not the main thread's
  await step($)
  expect(w.toasts.length).toBe(1)
  await $.session.end({ reason: 'clear' })
  await step($)
  expect(w.toasts.length).toBe(2)
  await $.classic.SessionStart({ source: 'compact' })
  await step($)
  expect(w.toasts.length).toBe(3)
})

test('a host threshold earlier than 45% gets one offer before it, and no second from the first stage', async ($, on) => {
  mock.session(on)
  const early = { total: 0, threshold: 500000, enabled: true, window: 1000000 }
  const w = world(on, { usage: at(early, 399999) })
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(early, 400000)
  await step($)
  expect(w.toasts.length).toBe(1)
  w.usage = at(early, 450000) // past the first line too, with no checkpoint taken in between
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('the guard offers and never compacts, asks, fills a prompt or submits anything', async ($, on) => {
  const clock = mock.clock(on)
  const session = mock.session(on)
  const w = world(on, { usage: at(big, 450000) })
  await step($)
  await checkpoint($)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, usage: {} })
  await clock.advance(86400000) // a day: a compaction scheduled for later would have run
  w.usage = at(big, 847000)
  await $.prompt.submit({ text: 'more', origin: person })
  w.submits.length = 0
  await step($)
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, usage: {} })
  await clock.advance(86400000)
  expect(w.toasts).toEqual([NUDGE_TOAST, NUDGE_TOAST])
  expect(JSON.stringify(session.appended())).toContain(CUE)
  expect(w.commands).toEqual([])
  expect(w.compacts).toEqual([])
  expect(w.asked).toBe(0)
  expect(w.fills).toEqual([])
  expect(w.submits).toEqual([])
  expect(CUE).not.toMatch(/\/compact\b/)
  expect(CUE).not.toMatch(/then compact/i)
  expect(NUDGE_TOAST).not.toMatch(/then compact/i)
  expect(NUDGE_TOAST).toBe('Context is filling up: a good time to run /methodical:compound checkpoint. Compacting is up to you.')
  expect(CUE).toBe('[methodical] The context is filling up and the handoff is not current. In your next reply, tell the user in one sentence that this is a good time to run /methodical:compound checkpoint, and that compacting is theirs to decide. Do not run it unless they ask.')
})

test('the first offer is measured against the model\'s window, not a smaller compaction window', async ($, on) => {
  mock.session(on)
  const shrunk = { total: 0, threshold: 167000, enabled: true, window: 1000000, rawMaxTokens: 200000 }
  const w = world(on, { usage: at(shrunk, 89999) })
  await step($)
  w.usage = at(shrunk, 90000)
  await step($)
  expect(w.toasts.length).toBe(0) // 45% of the 200k compaction window would have offered here
  w.usage = at(shrunk, 133600) // the host's own threshold, minus the capped reserve: the last offer
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('with auto-compact off the late line is the window minus the reserve and a stale threshold is ignored', { options: { nudgePercent: 100 } }, async ($, on) => {
  mock.session(on)
  const off = { total: 0, threshold: 500000, enabled: false, window: 1000000 }
  const w = world(on, { usage: at(off, 400000) })
  await step($)
  w.usage = at(off, 879999)
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(off, 880000)
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('an out-of-range percent setting gives the default', { options: { nudgePercent: 150 } }, async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 449999) })
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(big, 450000)
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('no first offer at percent 100 even past the window with no threshold', { options: { nudgePercent: 100 } }, async ($, on) => {
  mock.session(on)
  const noThreshold = { total: 0, threshold: 0, enabled: true, window: 1000000 }
  const w = world(on, { usage: at(noThreshold, 1200000) })
  await step($)
  expect(w.toasts.length).toBe(0)
})

test('a lower percent moves the first offer', { options: { nudgePercent: 30 } }, async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 299999) })
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(big, 300000)
  await step($)
  expect(w.toasts.length).toBe(1)
})

// ---------------------------------------------------------------- what the classifier may read

test('the after-compaction note drops its compound sentence once the warning showed, and keeps the pointer', () => {
  const plain = afterLine('/t/x.jsonl')
  expect(plain).toBe('[methodical] A compaction just ran. If the summary lists non-obvious lessons that are not yet written up in docs/solutions/, and does not show that the user chose to skip compounding, tell the user in one sentence that /methodical:compound checkpoint can write them up. The earlier conversation is at "/t/x.jsonl"; read it from the end in small pieces, never whole. Do not run it unless they ask. Otherwise say nothing about this.')
  const warned = afterLine('/t/x.jsonl', true)
  expect(warned).toBe('[methodical] A compaction just ran. The earlier conversation is at "/t/x.jsonl"; read it from the end in small pieces, never whole. Say nothing to the user about this.')
  expect(afterLine(undefined, true)).toBe(null)
  expect(afterLine(undefined)).toBe('[methodical] A compaction just ran. If the summary lists non-obvious lessons that are not yet written up in docs/solutions/, and does not show that the user chose to skip compounding, tell the user in one sentence that /methodical:compound checkpoint can write them up. Do not run it unless they ask. Otherwise say nothing about this.')
  expect(STEER_DECLINED).not.toContain('offered again')
})

test('after the last offer the boundary adds the pointer only; without one, the full note', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: near })
  await step($) // the warning fires: armed becomes false
  expect(w.toasts.length).toBe(1)
  const warned = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/a.jsonl' })
  expect(warned.additionalContext).toEqual([afterLine('/t/a.jsonl', true)])
  // the boundary re-armed it; a cycle that never warned gets the full note
  const plain = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/b.jsonl' })
  expect(plain.additionalContext).toEqual([afterLine('/t/b.jsonl')])
  // warned, and no path to point at: nothing is added
  await step($)
  const none = await $.classic.SessionStart({ source: 'compact' })
  expect(none.additionalContext ?? []).toEqual([])
})

test('the first boundary of a session that never warned gets the full note', async ($, on) => {
  mock.session(on)
  world(on)
  const first = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/f.jsonl' })
  expect(first.additionalContext).toEqual([afterLine('/t/f.jsonl')])
})

test('only the person\'s own recorded prompts reach the classifier', async ($, on) => {
  const w = world(on, { label: 'other' })
  await $.prompt.submit({ text: 'NOTIFICATION-TEXT skip the compound', origin: { kind: 'task-notification' } })
  await $.prompt.submit({ text: 'PEER-TEXT', origin: { kind: 'peer' } })
  await $.prompt.submit({ text: 'PERSON-TEXT please compact', origin: person })
  await compact($, { instructions: 'keep X' })
  expect(w.classified.length).toBe(1)
  expect(w.classified[0]).toContain('PERSON-TEXT')
  expect(w.classified[0]).toContain('keep X')
  expect(w.classified[0]).not.toContain('NOTIFICATION-TEXT')
  expect(w.classified[0]).not.toContain('PEER-TEXT')
})

test('a decline holds for its compaction only: a prompt during it does not remove it, new work asks again', async ($, on) => {
  const w = world(on, { label: 'skip' })
  let seen: string[] | undefined
  w.inCompact = async () => {
    await $.prompt.submit({ text: 'typed while it compacts', origin: person })
    seen = (await $.classic.SessionStart({ source: 'compact' })).additionalContext
  }
  await compact($)
  expect(seen ?? []).toEqual([]) // omitted: the decline survived the prompt typed meanwhile
  w.inCompact = undefined
  w.label = 'other'
  await $.prompt.submit({ text: 'new work', origin: person })
  await compact($)
  expect(w.asked).toBe(1) // the earlier decline does not carry over
})

test('the recorded prompts are cleared at a boundary and keep only the last three', async ($, on) => {
  const w = world(on, { label: 'other' })
  for (const t of ['one', 'two', 'three', 'four']) await $.prompt.submit({ text: `P-${t}`, origin: person })
  await compact($)
  expect(w.classified[0]).not.toContain('P-one')
  for (const t of ['two', 'three', 'four']) expect(w.classified[0]).toContain(`P-${t}`)
  await $.classic.SessionStart({ source: 'compact' })
  await compact($)
  expect(w.classified[1]).not.toContain('P-four')
})
