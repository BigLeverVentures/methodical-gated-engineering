import { expect, mock, test } from 'claude-code/testing'
import {
  CHECKPOINT,
  CUE,
  NUDGE_TOAST,
  OPTION_COMPOUND,
  OPTION_SKIP,
  QUESTION,
  STEER,
  STEER_DECLINED,
  afterLine,
  contextFigures,
  compactChoice,
  earlyLine,
  isPersonPrompt,
  finalizerCall,
  finalizationReceipt,
  matchingPointer,
  finalizationResume,
  lateLine,
  steered,
  usablePercent,
  usableReserve,
} from './logic'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ROOT = '/proj'
const RESUME = '/proj/docs/resume.md'
const PRIVATE_RESUME = '/proj/docs/private/resume.md'
const MARKER_A = 'handoff: 2026-10-12T10:00:00Z aaaaaaaaaaaaaaaa'
const MARKER_B = 'handoff: 2026-10-12T11:00:00Z bbbbbbbbbbbbbbbb'

type World = {
  files: Record<string, string>
  unreadable: string[]
  rootGate?: Promise<void>
  rootReached?: boolean
  answer: string | Error | (() => Promise<string | Error>) // the dialog; a function may resolve to an Error to deny
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
    unreadable: [],
    answer: '',
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
  on('session.root', async () => {
    w.rootReached = true
    await w.rootGate
    return { value: ROOT }
  })
  on('fs.read', (_$: any, e: any) => {
    if (w.unreadable.includes(e.path)) return { deny: 'EACCES' }
    if (e.path in w.files) return { value: w.files[e.path] }
    return { deny: 'ENOENT' }
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
  on('model.complete', (_$: any, e: any) => {
    w.classified.push(String(e.prompt))
    return { value: { isAnswered: false, reason: 'api-error', usage: USAGE } }
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
      if (w.finalizeFault === 'error') return { result: {}, text: 'failed', isError: true }
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
      if(w.finalizeFault==='unknown')return {result:{current:true},text:'parent says current'}
      return { result: { stdout: '' }, text: JSON.stringify({ schemaVersion: 1, kind: 'methodical-checkpoint-finalized', host: 'claude-code', generation, checkpointHash, current: true, root: ROOT }) }
    }
    if (e.tool === 'Write' || e.tool === 'Edit') {
      if (e.file_path.includes('DENIED')) return { result: {}, text: 'EACCES', isError: true }
      if (e.tool === 'Write') w.files[e.file_path.startsWith('/') ? e.file_path : `${ROOT}/${e.file_path}`] = e.content
      return { result: {}, text: 'ok' }
    }
    const readOnly = e.tool === 'Read' || (e.tool === 'Bash' && e.command === 'git status')
    return readOnly ? { result: {}, text: 'x', isReadOnly: true } : { result: {}, text: 'ran' }
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

async function submitCheckpoint($: any, origin: object = { kind: 'plugin', name: 'methodical' }) {
  const result = await $.prompt.submit({
    text: '/methodical:compound checkpoint',
    origin,
    command: { name: 'methodical:compound', args: 'checkpoint' },
  })
  expect(result.drop).toBeUndefined()
}
const checkpointTurn = ($: any, turnId: string) => $.turn.start({
  turnId,
  text: '<command-name>/methodical:compound</command-name>\n<command-args>checkpoint</command-args>\ncheckpoint skill',
})

async function beginCheckpoint($: any, w: World, turnId: string) {
  expect(w.commands.findLast(c => c.command === 'methodical:compound')?.args).toBe('checkpoint')
  await submitCheckpoint($)
  await checkpointTurn($, turnId)
}

// The runtime is mocked only here; production CLI tests independently check publication and freshness.
const FINALIZER = 'node "/plugin/runtime/src/cli.js" checkpoint-finalize "/proj" claude-code "/proj/.methodical/evidence/checkpoint-work.json"'
async function checkpoint($: any) {
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

test('the menu parser accepts explicit choices and rejects partial or conflicting answers', () => {
  expect(compactChoice(' 2. Skip and compact ')).toBe('skip')
  expect(compactChoice('1) COMPOUND FIRST')).toBe('compound')
  expect(compactChoice('No, just compact.')).toBe('skip')
  for (const answer of ['', '1', 'leave it', 'Compound first, then compact for me', 'skip and compact or compound first'])
    expect(compactChoice(answer)).toBe(null)
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
  expect(steered(undefined, false)).toBe(STEER)
  expect(steered('keep X', true)).toBe(`keep X\n${STEER}${STEER_DECLINED}`)
  expect(steered(undefined, false, 'docs/private/resume.md')).toContain('verified resume point is at docs/private/resume.md')
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
  on('state.set',async(_$:any,e:any,next:any)=>{if(e.key==='handoff'&&e.value?.portable)return {value:{isSet:false,version:0}};return next(e)})
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
  await checkpoint($)
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

// ---------------------------------------------------------------- the question

test('skip is explicit, compacts immediately, and never calls the classifier', async ($, on) => {
  const w = world(on, { answer: OPTION_SKIP })
  expect((await compact($)).skip).toBeUndefined()
  expect(w.options).toEqual([[OPTION_COMPOUND, OPTION_SKIP]])
  expect(w.compacts.map(c => c.instructions)).toEqual([STEER + STEER_DECLINED])
  expect(w.commands).toEqual([])
  expect(w.classified).toEqual([])
})

test('compound starts one checkpoint and leaves the window open', async ($, on) => {
  const w = world(on, { answer: OPTION_COMPOUND })
  const r = await compact($)
  expect(r.skip).toContain('Run /compact when the checkpoint turn ends')
  expect(w.options).toEqual([[OPTION_COMPOUND, OPTION_SKIP]])
  expect(w.compacts).toEqual([])
  expect(w.commands).toEqual([{ command: 'methodical:compound', args: 'checkpoint' }])
  expect(w.classified).toEqual([])
})

test('a rejected checkpoint start toasts and fills an empty box', async ($, on) => {
  const w = world(on, { answer: OPTION_COMPOUND, failCommand: true })
  await compact($)
  await until(() => w.fills.length > 0)
  expect(w.toasts.join(' ')).toContain(CHECKPOINT)
  expect(w.fills).toEqual([CHECKPOINT])
  expect(w.compacts).toEqual([])
})

for (const [name, dismissal] of [
  ['Esc', new Error('dismissed')],
  ['Chat about this', new Error('The user wants to clarify these questions.')],
  ['host refusal', new Error('no tool named AskUserQuestion in this session')],
  ['unanswered', ''],
  ['unknown answer', 'maybe'],
] as const) {
  test(`${name} keeps the window open and grants no bypass to the next attempt`, async ($, on) => {
    const w = world(on, { answer: dismissal })
    expect((await compact($)).skip).toBeDefined()
    expect(w.compacts).toEqual([])
    expect(w.commands).toEqual([])
    expect(w.classified).toEqual([])
    w.answer = OPTION_SKIP
    expect((await compact($)).skip).toBeUndefined()
    expect(w.asked).toBe(2)
    expect(w.compacts.map(c => c.instructions)).toEqual([STEER + STEER_DECLINED])
  })
}

// A prepend hook returns first to model a host abort while a dialog is pending.
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

const abortDuringQuestion = aboveMod()
test('an aborted menu leaves the window open and authorizes nothing later', { plugins: [abortDuringQuestion.plugin] }, async ($, on) => {
  const w = world(on)
  expect((await escAbort($, w)).skip).toBeDefined()
  expect(w.compacts).toEqual([])
  expect(w.commands).toEqual([])
  w.answer = OPTION_SKIP
  expect((await compact($)).skip).toBeUndefined()
  expect(w.asked).toBe(2)
  expect(w.compacts.map(c => c.instructions)).toEqual([STEER + STEER_DECLINED])
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
  expect(second.skip).toContain('already in progress')
  release('')
  const r = await first
  expect(r.skip).toBeDefined()
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
  expect([a.skip, b.skip].filter(x => x?.includes('already in progress')).length).toBe(1)
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
  const w = world(on, { answer: OPTION_SKIP, usage: { ...near, total: 1000 } })
  let seen: string[] | undefined
  // The after-compaction handler runs inside the compaction, so the bottom of session.compact raises it.
  w.inCompact = async () => {
    seen = (await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/compact.jsonl' })).additionalContext
  }
  await step($)
  await compact($) // declined
  expect(w.compacts.length).toBe(1)
  expect(seen ?? []).toEqual([])
  await checkpoint($) // verified handoff, no decline
  await freshRequest($)
  await compact($)
  expect(seen).toEqual([afterLine('/t/compact.jsonl', true)])
  await freshRequest($)
  await compact($, { trigger: 'auto' }) // automatic: never declined
  expect(seen).toEqual([afterLine('/t/compact.jsonl', false)])
})

// ---------------------------------------------------------------- manual handoffs

const endCheckpoint = ($: any, turnId = 'checkpoint', isAborted = false, answer = 'checkpoint attempt finished') =>
  $.turn.complete({ turnId, reason: isAborted ? 'aborted' : 'answer', answer, durationMs: 1, isAborted, usage: {} })

async function chooseCompound($: any, w: World, turnId = 'checkpoint') {
  w.answer = OPTION_COMPOUND
  expect((await compact($)).skip).toContain('Run /compact when the checkpoint turn ends')
  await beginCheckpoint($, w, turnId)
}

test('saved public resume bypasses exactly one subsequent manual menu without a finalizer', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { files: { [RESUME]: 'existing older resume' } })
  await chooseCompound($, w)
  await write($, RESUME, '# Resume\nNext: continue the latest work.\n')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'commit', command: 'git commit -am resume' })
  await endCheckpoint($)
  await clock.advance(10000)
  expect(w.finalizations).toBe(0)
  expect(w.toasts.join(' ')).toContain('Resume point saved.')
  expect(w.toasts.join(' ')).toContain('The portable checkpoint could not be verified.')
  expect(w.compacts).toEqual([])
  expect(w.commands).toEqual([{ command: 'methodical:compound', args: 'checkpoint' }])

  await $.tool.call({ tool: 'Read', tool_use_id: 'r', file_path: RESUME })
  await $.prompt.submit({ text: 'git status', origin: person })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'status', command: 'git status' })
  await $.prompt.submit({ text: '/methodical:rules', origin: person, command: { name: 'methodical:rules', args: '' } })
  expect((await compact($)).skip).toBeUndefined()
  expect(w.asked).toBe(1)
  expect(w.compacts.length).toBe(1)
  await $.classic.SessionStart({ source: 'compact' })
  await compact($)
  expect(w.asked).toBe(2)
})

test('save via Bash in the private path survives failed portable finalization', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { files: { [RESUME]: '# Older public resume\n' }, finalizeFault: 'error' })
  await chooseCompound($, w)
  w.files[PRIVATE_RESUME] = '# Private resume\nNext: continue the private work.\n'
  await $.tool.call({ tool: 'Bash', tool_use_id: 'save', command: 'write private handoff' })
  await checkpoint($)
  await endCheckpoint($)
  await clock.advance(10)
  expect(w.commands.length).toBe(1)
  expect(w.compacts).toEqual([])
  expect(w.finalizations).toBe(1)
  expect(w.toasts.join(' ')).toContain('The portable checkpoint could not be verified.')
  expect((await compact($)).skip).toBeUndefined()
  expect(w.asked).toBe(1)
  expect(w.compacts.length).toBe(1)
  expect(w.compacts[0].instructions).toContain('verified resume point is at docs/private/resume.md')
})

for (const testCase of ['unchanged', 'wrong-turn', 'aborted', 'ambiguous', 'changed-after', 'unreadable-after', 'new-ruling', 'new-work', 'session-end'] as const) {
  test(`${testCase} resume evidence does not bypass the next manual menu`, async ($, on) => {
    const w = world(on, { files: { [RESUME]: 'existing resume' } })
    await chooseCompound($, w)
    if (testCase !== 'unchanged') await write($, RESUME, 'replacement resume')
    if (testCase === 'ambiguous') await write($, PRIVATE_RESUME, 'another replacement')
    if (testCase === 'wrong-turn') {
      await endCheckpoint($, 'unrelated')
      w.files[RESUME] = 'existing resume'
    }
    await endCheckpoint($, 'checkpoint', testCase === 'aborted')
    if (testCase === 'changed-after') w.files[RESUME] = 'external change after checkpoint'
    if (testCase === 'unreadable-after') w.unreadable.push(RESUME)
    if (testCase === 'new-ruling') await $.prompt.submit({ text: 'Here is a new ruling', origin: person })
    if (testCase === 'new-work') await write($, '/proj/src/change.ts', 'changed work')
    if (testCase === 'session-end') await $.session.end({ reason: 'clear' })
    expect(w.compacts).toEqual([])
    w.answer = ''
    expect((await compact($)).skip).toBeDefined()
    expect(w.asked).toBe(2)
    expect(w.compacts).toEqual([])
  })
}

test('a ruling entered during checkpoint completion invalidates the saved resume', async ($, on) => {
  const w = world(on)
  await chooseCompound($, w)
  await write($, RESUME, 'resume before the latest ruling')

  let release: () => void = () => undefined
  w.rootReached = false
  w.rootGate = new Promise<void>(resolve => (release = resolve))
  const completing = endCheckpoint($)
  await until(() => w.rootReached === true)
  expect(w.rootReached).toBe(true)
  await $.prompt.submit({ text: 'There is now a new ruling', origin: person })
  release()
  await completing

  w.answer = ''
  expect((await compact($)).skip).toBeDefined()
  expect(w.asked).toBe(2)
  expect(w.compacts).toEqual([])
})

test('a direct checkpoint command saves a handoff for the next compact', async ($, on) => {
  const w = world(on)
  await submitCheckpoint($, person)
  await checkpointTurn($, 'checkpoint')
  await write($, RESUME, 'resume from direct command')
  await endCheckpoint($)

  expect((await compact($)).skip).toBeUndefined()
  expect(w.asked).toBe(0)
  expect(w.commands).toEqual([])
  expect(w.compacts.length).toBe(1)
})

test('an unrelated turn after a checkpoint submission cannot qualify its own saves', async ($, on) => {
  const w = world(on)
  await submitCheckpoint($, person)
  await $.turn.start({ turnId: 'unrelated', text: 'ordinary work' })
  await write($, RESUME, 'unrelated edit')
  await endCheckpoint($, 'unrelated')

  expect((await compact($)).skip).toBeDefined()
  expect(w.asked).toBe(1)
  expect(w.compacts).toEqual([])
})

test('chat compact reuses a current handoff and asks once for a stale one', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { answer: OPTION_COMPOUND })
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
  expect(w.compacts[0].instructions).toBe(steered(undefined, false, 'docs/resume.md'))
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
  test(`chat "${text}" uses the manual checkpoint flow`, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await $.prompt.submit({ text, origin: person })
    await clock.advance(1)
    expect(w.commands).toEqual([{ command: 'methodical:compound', args: 'checkpoint' }])
    await beginCheckpoint($, w, 'checkpoint')
    await write($, RESUME, 'saved for the manual action')
    await endCheckpoint($)
    await clock.advance(1)
    expect(w.commands.length).toBe(1)
    expect(w.compacts).toEqual([])
    expect((await compact($)).skip).toBeUndefined()
    expect(w.compacts.length).toBe(1)
    expect(w.asked).toBe(0)
  })
}

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
    if (e.key === 'handoff' && e.value?.portable) landed()
    return r
  })
  const w = world(on)
  await Promise.all([checkpoint($), $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'git commit -m x' })])
  expect(log.filter(l => l === 'handoff="stale"').length).toBe(2) // the first stale write missed and was retried
  expect(log).toContain('armed=true')
  await compact($)
  expect(w.asked).toBe(1)
})

// ---------------------------------------------------------------- the offers

async function step($: any, extra: object = {}) {
  for await (const _ of $.turn.step({ turnId: 't', index: 1, model: 'm', effort: 'high', messageCount: 3, ...extra })) void _
}
async function freshRequest($: any) {
  await step($)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: USAGE })
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
  await step($) // same model, but the usage cache still has the pre-compaction sample
  expect(w.toasts.length).toBe(1)
  const pending = await $.prompt.submit({ text: '/methodical:context-status', origin: person })
  expect(pending.drop).toContain('Usable window: unknown; occupied: unknown')
  w.usage = { ...near, total: 1000 }
  await freshRequest($)
  await step($)
  expect(w.toasts.length).toBe(1)
  w.usage = near
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
const small = { total: 0, threshold: 667000, enabled: true, window: 699999 }
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

test('a window one token below the cutoff has no unsolicited offers, even near auto compaction', async ($, on) => {
  const session = mock.session(on)
  const w = world(on, { usage: at(small, 315000) })
  await step($)
  w.usage = at(small, 666999)
  await step($)
  expect(w.toasts.length).toBe(0)
  expect(session.appended().length).toBe(0)
  const note = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/small.jsonl' })
  expect(note.additionalContext).toEqual([afterLine('/t/small.jsonl', true)])
  await compact($)
  expect(w.asked).toBe(1) // the user's compact request still offers the existing checkpoint menu
})

test('the cutoff is inclusive, even without a startup reading on resume', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at({ ...small, window: 700000 }, 314999) })
  await $.classic.SessionStart({ source: 'resume' })
  await freshRequest($)
  expect(w.toasts.length).toBe(0)
  w.usage = { ...w.usage!, total: 315000 }
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('crossing 450000 on a completed request offers immediately, without another request', async ($, on) => {
  const session = mock.session(on)
  const w = world(on, { usage: at(big, 449999) })
  await step($)
  expect(w.toasts.length).toBe(0)
  w.usage = at(big, 450000)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: USAGE })
  expect(w.toasts.length).toBe(1)
  expect(session.appended().length).toBe(1)
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('a resumed large window offers at the first verified post-boundary observation', async ($, on) => {
  const session = mock.session(on)
  const w = world(on, { usage: at(big, 450000) })
  await $.classic.SessionStart({ source: 'resume' })
  await step($)
  expect(w.toasts.length).toBe(0)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: USAGE })
  expect(w.toasts.length).toBe(1)
  expect(session.appended().length).toBe(1)
  await step($)
  expect(w.toasts.length).toBe(1)
})

test('context status keeps the first request input separate from current use and reads no new prompt', async ($, on) => {
  mock.session(on)
  const w = world(on, { usage: at(big, 50000) })
  await $.classic.SessionStart({ source: 'startup' })
  await step($)
  await $.turn.complete({ turnId: 't', reason: 'answer', answer: '', durationMs: 1, isAborted: false,
    usage: { input_tokens: 201, output_tokens: 1000, cache_read_input_tokens: 100, cache_creation_input_tokens: 300 } })
  const response = await $.prompt.submit({ text: '/methodical:context-status', origin: person })
  expect(response.drop).toContain('Startup load: 601 (first-request input, including the first prompt)')
  expect(response.drop).toContain('occupied: 50000')
  expect(w.submits).toEqual([])
  await $.classic.SessionStart({ source: 'compact' })
  const after = await $.prompt.submit({ text: '/methodical:context-status', origin: person })
  expect(after.drop).toContain('Usable window: unknown; occupied: unknown')
})

test('a model switch does not use the previous model’s large-window reading', async ($, on) => {
  const session = mock.session(on)
  const w = world(on, { usage: at(big, 1000) })
  await step($, { turnId: 'old' })
  w.usage = at(big, 950000) // usage cache still refers to the previous model
  await step($, { turnId: 'new', model: 'small' })
  expect(w.toasts.length).toBe(0)
  const switched = await $.prompt.submit({ text: '/methodical:context-status', origin: person })
  expect(switched.drop).toContain('Usable window: unknown')
  w.usage = at(small, 666999)
  await $.turn.complete({ turnId: 'new', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: USAGE })
  await step($, { turnId: 'later', model: 'small' })
  const current = await $.prompt.submit({ text: '/methodical:context-status', origin: person })
  expect(current.drop).toContain('Usable window: 699999')
  expect(session.appended().length).toBe(0)
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
  w.usage = at(big, 1000)
  await freshRequest($)
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
  await freshRequest($)
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
  // A fresh reading in the new cycle has not reached its warning.
  w.usage = at(big, 2000)
  await freshRequest($)
  const plain = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/b.jsonl' })
  expect(plain.additionalContext).toEqual([afterLine('/t/b.jsonl')])
  // warned, and no path to point at: nothing is added
  w.usage = at(big, 2000)
  await freshRequest($)
  w.usage = near
  await step($)
  const none = await $.classic.SessionStart({ source: 'compact' })
  expect(none.additionalContext ?? []).toEqual([])
})

test('a boundary with unknown window keeps just the silent transcript pointer', async ($, on) => {
  mock.session(on)
  world(on)
  const first = await $.classic.SessionStart({ source: 'compact', transcript_path: '/t/f.jsonl' })
  expect(first.additionalContext).toEqual([afterLine('/t/f.jsonl', true)])
})

test('a decline holds for its compaction only: a prompt during it does not remove it, new work asks again', async ($, on) => {
  const w = world(on, { answer: OPTION_SKIP })
  let seen: string[] | undefined
  w.inCompact = async () => {
    await $.prompt.submit({ text: 'typed while it compacts', origin: person })
    seen = (await $.classic.SessionStart({ source: 'compact' })).additionalContext
  }
  await compact($)
  expect(seen ?? []).toEqual([]) // omitted: the decline survived the prompt typed meanwhile
  w.inCompact = undefined
  w.answer = ''
  await $.prompt.submit({ text: 'new work', origin: person })
  await compact($)
  expect(w.asked).toBe(2) // the earlier decline does not carry over
})
