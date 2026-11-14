// 5b-cheap regeneration runner: flags, guard, metering, ledger, lock, snapshot, slices, hand-off through the
// Worker, rollback.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildMessages, WITNESS_ROLE_LINE, type PromptRecord } from '../src/prompts.ts'
import { runTick } from '../src/tick.ts'
import { validateSummary, WITNESS_OPENER_PROBLEM } from '../src/validate.ts'
import { parseArgs } from '../scripts/regen/args.ts'
import { acquireLock, admit, classifyResponse, headroomFrom, Ledger, meter, StopRun, usdToNeurons, type Caps } from '../scripts/regen/guard.ts'
import { release, Runner, PRIMARY_MODEL, type AiPost } from '../scripts/regen/runner.ts'
import { SEQ_BAND, witnessHit } from '../scripts/regen/slices.ts'
import * as store from '../scripts/regen/store.ts'
import { FakeAi, FakeKb, makeD1, makeDeps, rows, speechText } from './helpers.ts'

const OLD = 'Argued that supported housing for young people needs 500 places and regional funding, citing the royal commission and the minister.'
/** An old witness brief the witness filter flags (opens with an asker verb). */
const OLD_W = 'Asked the committee whether 500 supported housing places for young people were funded, citing the royal commission.'
const NEW = 'Asked whether the government would deliver 500 supported housing places for young people; the minister said $75 million was set aside for regional projects.'
const WITNESS_GOOD = 'Told the committee that 500 supported housing places for young people were recommended and that $75 million had been set aside for regional projects.'
const T0 = Date.parse('2026-11-14T08:00:00Z')
/** No numbers or names: pads a turn past the 80-word short-turn line without changing what a brief may claim. */
const PAD = 'The member then spoke at length about housing services in country towns and about the need for more support workers in those places. '.repeat(3)

const ok = (summary: string, p = 1000, c = 60) => ({ status: 200, raw: JSON.stringify({ success: true, errors: [], messages: [], result: { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary }) } }], usage: { prompt_tokens: p, completion_tokens: c, total_tokens: p + c } } }) })
const err = (status: number, code?: number, message = 'x') => ({ status, raw: JSON.stringify({ success: false, errors: [code === undefined ? { message } : { code, message }] }) })

class ScriptAi implements AiPost {
  calls: Array<{ model: string; body: any }> = []
  /** Runs inside post() before the gate: a token refresh or any other wait during which the run may be stopped. */
  beforeGate: (() => void) | null = null
  private readonly script: (n: number, model: string, body: any) => { status: number; raw: string } | Error
  constructor(script: (n: number, model: string, body: any) => { status: number; raw: string } | Error) {
    this.script = script
  }
  async post(model: string, body: Record<string, unknown>, gate: () => void) {
    this.beforeGate?.()
    gate()
    const n = this.calls.length
    this.calls.push({ model, body: JSON.parse(JSON.stringify(body)) })
    const r = this.script(n, model, body)
    if (r instanceof Error) throw r
    return r
  }
}

type Spec = { source?: string; speaker?: string; brief?: string; model?: string; outcome?: string; title?: string; short?: boolean }

function world(opts: { rids?: Record<string, Spec> } = {}) {
  const d1 = makeD1()
  const kb = new FakeKb()
  const specs = opts.rids ?? { a1: {} }
  for (const [rid0, s] of Object.entries(specs)) {
    const rid = rid0.padEnd(32, '0')
    const brief = s.brief ?? (s.speaker === 'witness' ? OLD_W : OLD)
    kb.add(rid, {
      title: s.title ?? 'Jane Citizen — 1999-05-04',
      classifications: [
        { labelset: 'kind', label: 'speech' },
        { labelset: 'source', label: s.source ?? 'zenodo' },
        ...(s.speaker ? [{ labelset: 'speaker_type', label: s.speaker }] : []),
      ],
      texts: { body: s.short ? speechText() : speechText(PAD), 'da-summary-t-body': brief },
    })
    d1.raw.prepare(`INSERT INTO queue (rid, task, status, priority, model, result, outcome, neurons, force, created_at, updated_at, done_at)
      VALUES (?, 'speech_summary', 'done', 0, ?, ?, ?, 12.5, 0, 1, 2, 3)`).run(rid, s.model ?? '@cf/qwen/qwen3-30b-a3b-fp8', brief, s.outcome ?? 'written')
  }
  const dir = mkdtempSync(join(tmpdir(), 'regen-'))
  return { d1, kb, dir, rid: (r: string) => r.padEnd(32, '0') }
}

const CAPS: Caps = { runNeurons: usdToNeurons(30), dailyBudget: 1_500_000, workerHeadroom: 756_167 }

function runner(w: ReturnType<typeof world>, ai: AiPost, o: { caps?: Caps; worker?: number; compare?: boolean; limit?: number; runId?: string; concurrency?: number; onWorkerRead?: () => void; spendFails?: boolean } = {}) {
  const ledger = new Ledger(join(w.dir, 'ledger.jsonl'))
  const logs: string[] = []
  let t = T0
  const r = new Runner({
    db: w.d1.d1 as any, kb: w.kb, ai, ledger, resultsPath: join(w.dir, 'results.jsonl'), stopFile: join(w.dir, 'STOP'), caps: o.caps ?? CAPS,
    workerSpendToday: async () => {
      o.onWorkerRead?.()
      return o.worker ?? 0
    },
    recordSpend: async (s) => {
      if (o.spendFails) throw new Error('D1 HTTP 503')
      await store.recordSpend(w.d1.d1 as any, s)
    },
    now: () => (t += 10), sleep: async () => {}, log: (l) => logs.push(l),
  }, { runId: o.runId ?? 'run-1', concurrency: o.concurrency ?? 2, compare: o.compare, limit: o.limit })
  return { r, ledger, logs }
}

async function seeded(w: ReturnType<typeof world>, list: string[], variant: 'b' | 'role' = 'b', slice: 'zenodo' | 'witness' | 'gptoss' = 'zenodo') {
  await store.init(w.d1.d1 as any)
  return store.seed(w.d1.d1 as any, { runId: 'run-1', slice, variant, rids: list.map(w.rid), now: T0 })
}

const regen = (w: ReturnType<typeof world>, rid: string) => rows(w.d1.raw, `SELECT * FROM ${store.TABLE} WHERE rid = ?`, w.rid(rid))[0]
const queue = (w: ReturnType<typeof world>, rid: string) => rows(w.d1.raw, `SELECT * FROM queue WHERE rid = ? AND task = 'speech_summary'`, w.rid(rid))[0]
const tickOf = (w: ReturnType<typeof world>) => () =>
  runTick(makeDeps({ kb: w.kb, ai: new FakeAi(() => new Error('the Worker must not call the model')), env: { WRITE_MODE: 'live', HISTORIC_HOLD: 'true' }, d1: w.d1, now: () => T0 + 60_000 }).deps)

// ------------------------------------------------------------------ flags (fail closed)

const argv = (line: string) => line.split(' ').filter(Boolean)

test('flags: = forms, unknown flags, stray words and repeats are refused, never ignored', () => {
  assert.throws(() => parseArgs(argv('run --run run-1 --limit=50 --cap-usd 0.05')), /no = in flags/)
  assert.throws(() => parseArgs(argv('run --run run-1 --limit 50 --cap-usd 0.05 --compare=true')), /no = in flags/)
  assert.throws(() => parseArgs(argv('rollback --run run-1 --all --dry-run=true')), /write '--dry-run', not '--dry-run=true'/)
  assert.throws(() => parseArgs(argv('rollback --run run-1 --all --dry-run true')), /switch and takes no value/)
  assert.throws(() => parseArgs(argv('run --run run-1 --cap-usd 0.05 --compare-mode')), /unknown flag --compare-mode/)
  assert.throws(() => parseArgs(argv('seed --run run-1 --slice zenodo --rids f.json --seq-base 5')), /unknown flag --seq-base/)
  assert.throws(() => parseArgs(argv('run --run run-1 --cap-usd 0.05 50')), /unexpected '50'/)
  assert.throws(() => parseArgs(argv('run --run run-1 --cap-usd 0.05 --limit 5 --limit 6')), /given twice/)
  assert.throws(() => parseArgs(argv('launch --run run-1')), /unknown command/)
  assert.equal(parseArgs(argv('rollback --run run-1 --all --dry-run')).flags.get('dry-run'), true)
})

test('flags: --cap-usd is required, a plain number above 0 and at most 30; --limit and --concurrency are positive whole numbers', () => {
  assert.throws(() => parseArgs(argv('run --run run-1 --limit 50')), /--cap-usd is required/)
  assert.throws(() => parseArgs(argv('run --run run-1 --limit 50 --cap-usd')), /--cap-usd needs a value/)
  assert.throws(() => parseArgs(argv('run --run run-1 --cap-usd --limit 50')), /--cap-usd needs a value/)
  for (const bad of ['$0.05', '300', '30.01', '0', '0.0', 'NaN', 'Infinity', '-1', '1e1', '.5', '0x10']) {
    assert.throws(() => parseArgs(['run', '--run', 'run-1', '--cap-usd', bad]), /--cap-usd/, bad)
  }
  assert.equal(parseArgs(argv('run --run run-1 --cap-usd 30')).flags.get('cap-usd'), 30)
  for (const bad of ['0', '-5', '5.5', '50abc', '1e3', '']) {
    assert.throws(() => parseArgs(['run', '--run', 'run-1', '--cap-usd', '1', '--limit', bad]), /--limit/, bad)
  }
  assert.throws(() => parseArgs(argv('run --run run-1 --cap-usd 1 --concurrency 9')), /at most 4/)
  const pilot = parseArgs(argv('run --run 5b-cheap-1 --limit 50 --cap-usd 0.05 --concurrency 1 --compare')).flags
  assert.deepEqual([pilot.get('limit'), pilot.get('cap-usd'), pilot.get('concurrency'), pilot.get('compare')], [50, 0.05, 1, true])
})

test('flags: rollback takes exactly one scope; seed takes a known slice and only that slice\'s variants', () => {
  assert.throws(() => parseArgs(argv('rollback --run run-1')), /exactly one of/)
  assert.throws(() => parseArgs(argv('rollback --run run-1 --all --slice zenodo')), /exactly one of/)
  assert.throws(() => parseArgs(argv('seed --run run-1 --slice others --rids f.json')), /--slice is one of/)
  assert.throws(() => parseArgs(argv('seed --run run-1 --slice zenodo --variant role --rids f.json')), /takes --variant b/)
  assert.equal(parseArgs(argv('seed --run run-1 --slice witness --rids f.json')).flags.get('variant'), 'role')
  assert.equal(parseArgs(argv('seed --run run-1 --slice witness --variant b --rids f.json')).flags.get('variant'), 'b')
})

// ------------------------------------------------------------------ guard

test('guard: 402, 403, 429, 401, 5xx stop; a 400/413/422 skips only with an allowlisted code (5006); billing wording stops', () => {
  for (const s of [402, 403, 429, 401, 404, 500, 503]) assert.equal(classifyResponse(s, '{"success":false,"errors":[{"message":"x"}]}').action, 'stop', String(s))
  for (const s of [400, 413, 422]) {
    assert.equal(classifyResponse(s, err(s, 5006, 'bad input').raw).action, 'skip', `${s} code 5006`)
    for (const code of [4006, 3036, 10000]) assert.equal(classifyResponse(s, err(s, code).raw).action, 'stop', `${s} code ${code}`)
    assert.equal(classifyResponse(s, err(s).raw).action, 'stop', `${s} without a code`)
    assert.equal(classifyResponse(s, JSON.stringify({ success: false, errors: [{ code: 5006 }, { code: 4006 }] })).action, 'stop', `${s} mixed codes`)
    assert.equal(classifyResponse(s, '').action, 'stop', `${s} empty body`)
  }
  assert.equal(classifyResponse(400, JSON.stringify({ success: false, errors: [{ code: 5006, message: 'you have exceeded your daily quota' }] })).action, 'stop')
  assert.equal(classifyResponse(413, 'request too large for your plan').action, 'stop')
})

test('guard: billing or limit wording inside a 200 envelope stops, but the same words inside the model output do not', () => {
  const body = (extra: Record<string, unknown>, content = '{"summary":"Argued the debt limit was exceeded and the credit plan had no budget."}') =>
    JSON.stringify({ success: true, errors: [], messages: [], result: { choices: [{ message: { content, reasoning_content: 'quota limit thinking' } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }, ...extra })
  assert.equal(classifyResponse(200, body({})).action, 'ok')
  assert.equal(classifyResponse(200, body({ messages: ['You have used 90% of your daily allocation'] })).action, 'stop')
  assert.equal(classifyResponse(200, body({ errors: [{ message: 'Billing account suspended' }] })).action, 'stop')
  assert.equal(classifyResponse(200, body({ success: false })).action, 'stop')
  assert.equal(classifyResponse(200, 'not json').action, 'stop')
  assert.equal(classifyResponse(200, JSON.stringify({ success: true, result: { response: 'the quota on imports was exceeded', usage: { prompt_tokens: 1, completion_tokens: 1 } } })).action, 'ok')
})

test('meter: actual neurons from usage at the published rates; missing usage books the upper bound; unknown model stops', () => {
  const m = meter(PRIMARY_MODEL, { usage: { prompt_tokens: 1000, completion_tokens: 60 } }, 999)
  assert.equal(m.source, 'usage')
  assert.ok(Math.abs(m.neurons - (1000 * 40909 + 60 * 290909) / 1e6) < 1e-9)
  assert.deepEqual(meter(PRIMARY_MODEL, { usage: {} }, 321), { neurons: 321, promptTokens: null, completionTokens: null, source: 'upper' })
  assert.throws(() => meter('@cf/unknown/model', { usage: { prompt_tokens: 1, completion_tokens: 1 } }, 1), StopRun)
})

test('ledger: survives a restart; an open reservation (crash mid-call) counts at its upper bound', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'))
  const path = join(dir, 'ledger.jsonl')
  const l = new Ledger(path)
  l.append({ t: 'reserve', id: 'a', ts: 1, day: '2026-11-14', rid: 'r', model: PRIMARY_MODEL, upper: 200 })
  l.append({ t: 'settle', id: 'a', ts: 2, day: '2026-11-14', rid: 'r', model: PRIMARY_MODEL, status: 200, neurons: 50, prompt_tokens: 1, completion_tokens: 1, source: 'usage', usd: 0 })
  l.append({ t: 'reserve', id: 'b', ts: 3, day: '2026-11-15', rid: 'r', model: PRIMARY_MODEL, upper: 300 })
  const again = new Ledger(path).totals()
  assert.equal(again.neurons, 350)
  assert.equal(again.unsettled, 300)
  assert.deepEqual(again.byDay, { '2026-11-14': 50, '2026-11-15': 300 })
  assert.equal(again.calls, 1)
})

test('ledger: two writers on one file each see the whole file after sync (no double cap)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'))
  const path = join(dir, 'ledger.jsonl')
  const a = new Ledger(path)
  const b = new Ledger(path)
  a.append({ t: 'reserve', id: 'a', ts: 1, day: '2026-11-14', rid: 'r', model: PRIMARY_MODEL, upper: 2_000_000 })
  b.append({ t: 'reserve', id: 'b', ts: 2, day: '2026-11-14', rid: 'r', model: PRIMARY_MODEL, upper: 2_000_000 })
  a.sync()
  assert.equal(a.totals().neurons, 4_000_000)
  assert.equal(b.totals().neurons, 4_000_000)
})

test('admit: the run cap, then today\'s share after the Worker\'s headroom or its actual spend, whichever is larger', () => {
  const t = (neurons: number, today = 0) => ({ neurons, usd: 0, calls: 0, byDay: { '2026-11-14': today }, unsettled: 0, stops: 0 })
  assert.equal(admit(CAPS, t(usdToNeurons(30) - 10), '2026-11-14', 0, 11).ok, false)
  assert.equal(admit(CAPS, t(0, 743_000), '2026-11-14', 0, 800).ok, true)
  assert.equal(admit(CAPS, t(0, 743_900), '2026-11-14', 0, 800).ok, false)
  assert.equal(admit(CAPS, t(0, 500_000), '2026-11-14', 1_100_000, 800).ok, false) // the Worker ran past its headroom
  assert.equal(headroomFrom([{ day: 'a', n: 630_139 }, { day: 'b', n: 4000 }]), 756_167)
})

test('admit fails closed: a NaN or missing cap, spend or bound refuses; usdToNeurons refuses caps outside (0, 30]', () => {
  const t = { neurons: 0, usd: 0, calls: 0, byDay: {}, unsettled: 0, stops: 0 }
  const refused = (r: ReturnType<typeof admit>) => (r.ok ? 'ok' : r.kind)
  assert.equal(refused(admit({ ...CAPS, runNeurons: NaN }, t, '2026-11-14', 0, 800)), 'invalid')
  assert.equal(refused(admit({ ...CAPS, runNeurons: undefined as any }, t, '2026-11-14', 0, 800)), 'invalid')
  assert.equal(refused(admit(CAPS, { ...t, neurons: NaN }, '2026-11-14', 0, 800)), 'invalid')
  assert.equal(refused(admit(CAPS, t, '2026-11-14', NaN, 800)), 'invalid')
  assert.equal(refused(admit(CAPS, t, '2026-11-14', 0, NaN)), 'invalid')
  assert.equal(refused(admit(CAPS, t, '2026-11-14', 0, 0)), 'invalid')
  assert.equal(refused(admit({ ...CAPS, workerHeadroom: NaN }, t, '2026-11-14', 0, 800)), 'invalid')
  assert.equal(refused(admit(CAPS, t, '2026-11-14', 0, 800)), 'ok')
  for (const bad of [NaN, 0, -1, 30.01, 300, Infinity, '0.05' as any, undefined as any]) assert.throws(() => usdToNeurons(bad), StopRun, String(bad))
  assert.equal(usdToNeurons(0.05), 4545)
})

test('lock: a second command is refused while the lock is held, with the holder named; never taken over; released on exit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-'))
  const path = join(dir, 'LOCK')
  const release1 = acquireLock(path, 'run --run run-1')
  assert.throws(() => acquireLock(path, 'run --run run-1'), (e: any) => e instanceof StopRun && e.message.includes(`"pid":${process.pid}`) && /never taken over/.test(e.message))
  release1()
  assert.equal(existsSync(path), false)
  const release2 = acquireLock(path, 'rollback')
  release1() // an old handle never removes someone else's lock
  assert.equal(existsSync(path), true)
  release2()
  assert.equal(existsSync(path), false)
  writeFileSync(path, '{"pid":99999999,"what":"run"}\n') // a stale lock from a dead process
  assert.throws(() => acquireLock(path, 'run'), /99999999/)
  assert.equal(readFileSync(path, 'utf8').includes('99999999'), true)
})

// ------------------------------------------------------------------ prompt variant

const REC: PromptRecord = { rid: 'r'.repeat(32), slug: 's', kind: 'speech', title: 'T', state: 'federal', party: null, words: 40, text: speechText(), historic: false }

test('prompts: without speaker_role (the Worker) the messages are byte-identical; witness adds the field and one line', () => {
  const base = JSON.stringify(buildMessages(REC, ['summary'], ['x']))
  for (const role of [undefined, null, 'member', 'multi_speaker']) assert.equal(JSON.stringify(buildMessages({ ...REC, speaker_role: role }, ['summary'], ['x'])), base, String(role))
  const w = buildMessages({ ...REC, speaker_role: 'witness' }, ['summary'])
  assert.equal(w[0].content, buildMessages(REC, ['summary'])[0].content)
  assert.match(w[1].content, /"speaker_role":"witness"/)
  assert.ok(w[1].content.includes(WITNESS_ROLE_LINE))
})

test('validator: a witness brief opening Asked or Moved is rejected; members and other openers are untouched', () => {
  assert.ok(validateSummary(NEW, { text: speechText(), speaker_role: 'witness' }).includes(WITNESS_OPENER_PROBLEM))
  assert.ok(validateSummary('Moved that the committee note 500 supported housing places and $75 million for regional projects.', { text: speechText(), speaker_role: 'witness' }).includes(WITNESS_OPENER_PROBLEM))
  assert.ok(!validateSummary(NEW, { text: speechText() }).includes(WITNESS_OPENER_PROBLEM))
  assert.ok(!validateSummary(NEW, { text: speechText(), speaker_role: 'member' }).includes(WITNESS_OPENER_PROBLEM))
  assert.deepEqual(validateSummary(WITNESS_GOOD, { text: speechText(), speaker_role: 'witness' }), [])
})

test('witness filter: the costing regex, unchanged', () => {
  assert.equal(witnessHit(OLD_W), 'opens-asker')
  assert.equal(witnessHit('Said the committee said nothing new.'), 'committee-attribution')
  assert.equal(witnessHit('Moved that the bill be read.'), 'moved')
  assert.equal(witnessHit('Told the senator she had asked twice.'), 'contains-asker')
  assert.equal(witnessHit(WITNESS_GOOD), null)
})

// ------------------------------------------------------------------ the run

test('seed snapshots only finished Workers AI briefs, before anything is generated, and never replaces a snapshot', async () => {
  const w = world({ rids: { a1: {}, b2: { model: 'claude-haiku-5-5' }, c3: { outcome: 'skipped-existing' } } })
  assert.equal(await seeded(w, ['a1', 'b2', 'c3', 'zz']), 1)
  assert.equal(regen(w, 'a1').old_result, OLD)
  assert.equal(regen(w, 'a1').state, 'pending')
  assert.equal(regen(w, 'a1').seq, SEQ_BAND) // zenodo's band, set in code
  w.d1.raw.prepare(`UPDATE queue SET result = 'changed later' WHERE rid = ?`).run(w.rid('a1'))
  assert.equal(await seeded(w, ['a1']), 0)
  assert.equal(regen(w, 'a1').old_result, OLD)
  await assert.rejects(store.seed(w.d1.d1 as any, { runId: 'run-1', slice: 'zenodo', variant: 'role', rids: [w.rid('a1')], now: T0 }), /does not take variant role/)
})

test('run: qwen3.8 no-think at max_tokens 256, metered from usage, booked into D1 spend as regen:, handed to the Worker; the runner never writes the box', async () => {
  const w = world()
  await seeded(w, ['a1'])
  w.d1.raw.prepare(`INSERT INTO spend (day, model, neurons, calls) VALUES ('2026-11-14', '@cf/qwen/qwen3-30b-a3b-fp8', 1000, 3)`).run()
  const ai = new ScriptAi(() => ok(NEW, 1000, 60))
  const { r, ledger } = runner(w, ai)
  assert.deepEqual(await r.loop(), { end: 'done' })
  assert.equal(ai.calls.length, 1)
  assert.equal(ai.calls[0].model, '@cf/qwen/qwen3.8-27b')
  assert.equal(ai.calls[0].body.max_tokens, 256)
  assert.deepEqual(ai.calls[0].body.chat_template_kwargs, { enable_thinking: false })
  assert.equal('enable_thinking' in ai.calls[0].body, false)
  assert.equal(ai.calls[0].body.response_format.type, 'json_schema')
  const expected = (1000 * 40909 + 60 * 290909) / 1e6
  assert.ok(Math.abs(ledger.totals().neurons - expected) < 1e-9)
  const lines = readFileSync(join(w.dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(lines.map((l) => l.t), ['reserve', 'settle'])
  assert.equal(lines[0].upper > expected, true)
  // the Worker's guard (SUM over the day) sees our spend; our read of the Worker's spend leaves it out
  const spend = rows(w.d1.raw, `SELECT * FROM spend WHERE model = 'regen:@cf/qwen/qwen3.8-27b'`)[0]
  assert.ok(Math.abs(spend.neurons - expected) < 1e-9)
  assert.deepEqual([spend.day, spend.calls, spend.in_tokens, spend.out_tokens], ['2026-11-14', 1, 1000, 60])
  assert.equal(await store.workerSpendToday(w.d1.d1 as any, '2026-11-14'), 1000)
  assert.deepEqual((await store.workerDays(w.d1.d1 as any, '2026-11-01')).map((d) => ({ ...d })), [{ day: '2026-11-14', n: 1000 }])
  const q = queue(w, 'a1')
  assert.deepEqual([q.status, q.outcome, q.force, q.model, q.result], ['done', 'unwritten', 1, '@cf/qwen/qwen3.8-27b', NEW])
  const g = regen(w, 'a1')
  assert.deepEqual([g.state, g.old_result, g.new_result, g.prompt_version], ['queued', OLD, NEW, '5b-cheap-1'])
  assert.deepEqual(w.kb.writes(), [])
  // a second run generates nothing
  const again = runner(w, ai)
  assert.deepEqual(await again.r.loop(), { end: 'done' })
  assert.equal(ai.calls.length, 1)
})

test('a failed D1 spend write stops the run after this item; the brief already paid for is kept and handed off', async () => {
  const w = world({ rids: { a1: {}, b2: {} } })
  await seeded(w, ['a1', 'b2'])
  const ai = new ScriptAi(() => ok(NEW))
  const end = await runner(w, ai, { spendFails: true, concurrency: 1 }).r.loop()
  assert.equal(end.end, 'stopped')
  assert.match((end as any).reason, /could not book spend into D1/)
  assert.equal(ai.calls.length, 1)
  assert.deepEqual([regen(w, 'a1').state, regen(w, 'b2').state], ['queued', 'pending'])
})

test('write path: the Worker\'s own live tick writes the new brief (forced); force goes back afterwards; rollback hands the old one back the same way', async () => {
  const w = world()
  await seeded(w, ['a1'])
  await runner(w, new ScriptAi(() => ok(NEW))).r.loop()
  const tick = tickOf(w)
  await tick()
  assert.equal(w.kb.resources.get(w.rid('a1'))!.texts['da-summary-t-body'], NEW)
  assert.deepEqual([queue(w, 'a1').outcome, queue(w, 'a1').force], ['written', 1])
  assert.equal(await store.markWritten(w.d1.d1 as any, 'run-1', T0), 1)
  assert.equal(regen(w, 'a1').state, 'written')
  assert.equal(queue(w, 'a1').force, 0) // back to the snapshot's value
  assert.equal(await store.markWritten(w.d1.d1 as any, 'run-1', T0), 0) // repeatable

  // dry run: nothing changes (the CLI's --dry-run only reads rows and prints them)
  const before = JSON.stringify([queue(w, 'a1'), regen(w, 'a1')])
  const listed = await store.rowsIn(w.d1.d1 as any, 'run-1', ['queued', 'written'])
  assert.equal(listed.length, 1)
  assert.equal(JSON.stringify([queue(w, 'a1'), regen(w, 'a1')]), before)

  const batches = w.d1.batches.length
  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), true)
  assert.equal(w.d1.batches.length, batches + 1) // one batch
  const q = queue(w, 'a1')
  assert.deepEqual([q.outcome, q.force, q.model, q.result], ['unwritten', 1, '@cf/qwen/qwen3-30b-a3b-fp8', OLD])
  assert.equal(regen(w, 'a1').state, 'rolled-back')
  await tick()
  assert.equal(w.kb.resources.get(w.rid('a1'))!.texts['da-summary-t-body'], OLD)
  assert.equal(queue(w, 'a1').outcome, 'written')
  await store.markWritten(w.d1.d1 as any, 'run-1', T0)
  assert.equal(queue(w, 'a1').force, 0) // reset after the rollback write too
  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), false) // only once
})

test('rollback cut short (queue updated, state not): running it again finishes the row', async () => {
  const w = world()
  await seeded(w, ['a1'])
  await runner(w, new ScriptAi(() => ok(NEW))).r.loop()
  w.d1.raw.prepare(`UPDATE queue SET result = ?, force = 1, outcome = 'unwritten' WHERE rid = ?`).run(OLD, w.rid('a1'))
  assert.equal(regen(w, 'a1').state, 'queued')
  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), true)
  assert.deepEqual([regen(w, 'a1').state, queue(w, 'a1').result], ['rolled-back', OLD])
})

test('rollback leaves a row alone if something else has replaced our brief since', async () => {
  const w = world()
  await seeded(w, ['a1'])
  await runner(w, new ScriptAi(() => ok(NEW))).r.loop()
  w.d1.raw.prepare(`UPDATE queue SET result = 'someone else' WHERE rid = ?`).run(w.rid('a1'))
  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), false)
  assert.equal(queue(w, 'a1').result, 'someone else')
  assert.equal(regen(w, 'a1').state, 'queued')
})

test('hand-off: a queue row changed while the brief was generated is not overwritten (queueNewBrief\'s old_result check)', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => {
    w.d1.raw.prepare(`UPDATE queue SET result = 'changed mid-call' WHERE rid = ?`).run(w.rid('a1')) // still done/written
    return ok(NEW)
  })
  assert.equal((await runner(w, ai).r.loop()).end, 'done')
  assert.equal(ai.calls.length, 1)
  assert.deepEqual([queue(w, 'a1').result, queue(w, 'a1').outcome, queue(w, 'a1').force], ['changed mid-call', 'written', 0])
  assert.deepEqual([regen(w, 'a1').state, regen(w, 'a1').new_result], ['skipped', NEW])
})

test('stops: 429 stops before anything is generated and the row goes back to pending; the stop is in the ledger', async () => {
  const w = world({ rids: { a1: {}, b2: {} } })
  await seeded(w, ['a1', 'b2'])
  const ai = new ScriptAi(() => ({ status: 429, raw: '{"success":false,"errors":[{"message":"Too many requests"}]}' }))
  const { r, ledger } = runner(w, ai)
  const end = await r.loop()
  assert.equal(end.end, 'stopped')
  assert.ok(ai.calls.length <= 2)
  assert.equal(regen(w, 'a1').state, 'pending')
  assert.equal(regen(w, 'b2').state, 'pending')
  assert.equal(ledger.totals().stops, 1)
  assert.equal(ledger.totals().neurons, 0)
})

test('stops: a code-only 400 (4006, 3036, 10000) stops the run instead of failing every row', async () => {
  for (const code of [4006, 3036, 10000]) {
    const w = world({ rids: { a1: {}, b2: {}, c3: {} } })
    await seeded(w, ['a1', 'b2', 'c3'])
    const ai = new ScriptAi(() => err(400, code))
    const end = await runner(w, ai, { concurrency: 1 }).r.loop()
    assert.equal(end.end, 'stopped', String(code))
    assert.equal(ai.calls.length, 1, String(code))
    assert.deepEqual([regen(w, 'a1').state, regen(w, 'b2').state, regen(w, 'c3').state], ['pending', 'pending', 'pending'])
  }
})

test('stops: billing wording in a 200 body; a STOP file halts before the next request', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ({ status: 200, raw: JSON.stringify({ success: true, messages: ['Workers AI paid plan required: payment method declined'], result: { response: '{}' } }) }))
  assert.equal((await runner(w, ai).r.loop()).end, 'stopped')
  const w2 = world()
  await seeded(w2, ['a1'])
  writeFileSync(join(w2.dir, 'STOP'), '')
  const ai2 = new ScriptAi(() => ok(NEW))
  const end = await runner(w2, ai2).r.loop()
  assert.deepEqual([end.end, ai2.calls.length, regen(w2, 'a1').state], ['stopped', 0, 'pending'])
})

test('stops: a STOP file touched during the D1 spend read, or during the token wait inside post(), sends nothing', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const a = runner(w, ai, { onWorkerRead: () => writeFileSync(join(w.dir, 'STOP'), '') })
  const end = await a.r.loop()
  assert.deepEqual([end.end, ai.calls.length, regen(w, 'a1').state, a.ledger.totals().neurons], ['stopped', 0, 'pending', 0])
  assert.equal(readFileSync(join(w.dir, 'ledger.jsonl'), 'utf8').includes('"reserve"'), false) // no reservation either

  const w2 = world()
  await seeded(w2, ['a1'])
  const ai2 = new ScriptAi(() => ok(NEW))
  ai2.beforeGate = () => writeFileSync(join(w2.dir, 'STOP'), '')
  const b = runner(w2, ai2)
  const end2 = await b.r.loop()
  assert.deepEqual([end2.end, ai2.calls.length, regen(w2, 'a1').state, b.ledger.totals().neurons, b.ledger.totals().unsettled], ['stopped', 0, 'pending', 0, 0])
})

test('stops: a network error books the upper bound (it may have been billed); a stop raised before sending books nothing', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const net = runner(w, new ScriptAi(() => new Error('socket hang up')))
  assert.equal((await net.r.loop()).end, 'stopped')
  assert.ok(net.ledger.totals().neurons > 0)
  assert.equal(net.ledger.totals().unsettled, 0)
  assert.equal(regen(w, 'a1').state, 'interrupted')
  assert.ok(rows(w.d1.raw, `SELECT neurons FROM spend WHERE model LIKE 'regen:%'`)[0].neurons > 0) // booked for the Worker too
  const w2 = world()
  await seeded(w2, ['a1'])
  const pre = runner(w2, new ScriptAi(() => new StopRun('wrangler OAuth token missing or could not be refreshed')))
  const end = await pre.r.loop()
  assert.deepEqual([end.end, pre.ledger.totals().neurons, regen(w2, 'a1').state], ['stopped', 0, 'pending'])
})

test('stops: the run cap is checked against each call\'s upper bound before it goes out', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const end = await runner(w, ai, { caps: { ...CAPS, runNeurons: 50 } }).r.loop()
  assert.equal(end.end, 'stopped')
  assert.equal(ai.calls.length, 0)
  assert.equal(regen(w, 'a1').state, 'pending')
})

test('stops: a NaN cap refuses every call', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const end = await runner(w, ai, { caps: { ...CAPS, runNeurons: NaN } }).r.loop()
  assert.deepEqual([end.end, ai.calls.length], ['stopped', 0])
})

test('stops: spend another process appended to the ledger counts before the next admission', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const { r } = runner(w, ai, { caps: { ...CAPS, runNeurons: 100_000 } })
  new Ledger(join(w.dir, 'ledger.jsonl')).append({ t: 'reserve', id: 'other', ts: 1, day: '2026-11-14', rid: 'x', model: PRIMARY_MODEL, upper: 99_990 })
  const end = await r.loop()
  assert.deepEqual([end.end, ai.calls.length], ['stopped', 0])
  assert.match((end as any).reason, /run cap/)
})

test('daily share used up (the Worker\'s headroom kept): the run pauses without a call', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const end = await runner(w, ai, { worker: 1_499_990 }).r.loop()
  assert.deepEqual([end.end, ai.calls.length, regen(w, 'a1').state], ['paused', 0, 'pending'])
})

test('a per-item 400 (code 5006) skips and logs that row only; the run continues', async () => {
  const w = world({ rids: { a1: {}, b2: {} } })
  await seeded(w, ['a1', 'b2'])
  const ai = new ScriptAi((_n, _m, body) => (body.messages[1].content.includes(w.rid('a1')) ? err(400, 5006, 'bad input') : ok(NEW)))
  const end = await runner(w, ai).r.loop()
  assert.equal(end.end, 'done')
  assert.equal(regen(w, 'a1').state, 'failed')
  assert.match(regen(w, 'a1').note, /^HTTP 400/)
  assert.equal(regen(w, 'b2').state, 'queued')
})

test('three per-item skips in a row stop the run; a good answer in between resets the count', async () => {
  const w = world({ rids: { a1: {}, b2: {}, c3: {}, d4: {} } })
  await seeded(w, ['a1', 'b2', 'c3', 'd4'])
  const ai = new ScriptAi(() => err(400, 5006, 'bad input'))
  const end = await runner(w, ai, { concurrency: 1 }).r.loop()
  assert.equal(end.end, 'stopped')
  assert.match((end as any).reason, /3 per-item errors in a row/)
  assert.equal(ai.calls.length, 3)
  assert.equal(regen(w, 'd4').state, 'pending')

  const w2 = world({ rids: { a1: {}, b2: {}, c3: {}, d4: {}, e5: {} } })
  await seeded(w2, ['a1', 'b2', 'c3', 'd4', 'e5'])
  const ai2 = new ScriptAi((n) => (n === 2 ? ok(NEW) : err(400, 5006, 'bad input')))
  assert.equal((await runner(w2, ai2, { concurrency: 1 }).r.loop()).end, 'done')
  assert.deepEqual(['a1', 'b2', 'c3', 'd4', 'e5'].map((r) => regen(w2, r).state), ['failed', 'failed', 'queued', 'failed', 'failed'])
})

test('snapshot guard: a changed queue row or a live brief that differs is skipped without spending', async () => {
  const w = world({ rids: { a1: {}, b2: {} } })
  await seeded(w, ['a1', 'b2'])
  w.d1.raw.prepare(`UPDATE queue SET result = 'rewritten by someone' WHERE rid = ?`).run(w.rid('a1'))
  w.kb.resources.get(w.rid('b2'))!.texts['da-summary-t-body'] = 'a canary wrote this'
  const ai = new ScriptAi(() => ok(NEW))
  assert.equal((await runner(w, ai).r.loop()).end, 'done')
  assert.equal(ai.calls.length, 0)
  assert.deepEqual([regen(w, 'a1').state, regen(w, 'b2').state], ['skipped', 'skipped'])
  assert.equal(regen(w, 'b2').kb_brief, 'a canary wrote this')
})

test('slices in code: short turns, hansard_hist, years outside 1998-2000, non-zenodo, witness non-hits and non-gpt-oss rows are skipped without spending', async () => {
  const w = world({
    rids: {
      s1: { short: true },
      h1: { source: 'hansard_hist' },
      y1: { title: 'Jane Citizen — 2004-05-04' },
      n1: { source: 'committee_senate' },
      w1: { source: 'committee_senate', speaker: 'witness', brief: OLD },
      m1: { source: 'committee_senate' },
      g1: { source: 'committee_senate', speaker: 'witness', model: '@cf/qwen/qwen3-30b-a3b-fp8' },
    },
  })
  await seeded(w, ['s1', 'h1', 'y1', 'n1'])
  await seeded(w, ['w1', 'm1'], 'role', 'witness')
  await seeded(w, ['g1'], 'b', 'gptoss')
  const ai = new ScriptAi(() => ok(NEW))
  assert.equal((await runner(w, ai).r.loop()).end, 'done')
  assert.equal(ai.calls.length, 0)
  const note = (r: string) => `${regen(w, r).state}: ${regen(w, r).note}`
  assert.match(note('s1'), /^skipped: outside the zenodo slice: short turn \(37 words/)
  assert.match(note('h1'), /hansard_hist is excluded/)
  assert.match(note('y1'), /title year 2004 is outside 1998-2000/)
  assert.match(note('n1'), /not source\/zenodo/)
  assert.match(note('w1'), /does not match the witness filter/)
  assert.match(note('m1'), /not speaker_type\/witness/)
  assert.match(note('g1'), /not a gpt-oss escalation/)
})

test('resume: a stored result is reused after a crash (no second generation); generating with nothing stored is never retried', async () => {
  const w = world({ rids: { a1: {}, b2: {} } })
  await seeded(w, ['a1', 'b2'])
  w.d1.raw.prepare(`UPDATE ${store.TABLE} SET state = 'generating'`).run()
  writeFileSync(join(w.dir, 'results.jsonl'), JSON.stringify({ rid: w.rid('a1'), run_id: 'run-1', variant: 'b', model: PRIMARY_MODEL, value: NEW, neurons: 50, calls: 1, ts: 1 }) + '\n')
  const ai = new ScriptAi(() => ok(NEW))
  assert.equal((await runner(w, ai).r.loop()).end, 'done')
  assert.equal(ai.calls.length, 0)
  assert.deepEqual([regen(w, 'a1').state, queue(w, 'a1').result], ['queued', NEW])
  assert.equal(regen(w, 'b2').state, 'interrupted')
  assert.equal(queue(w, 'b2').result, OLD)
})

test('resume in compare mode: a role row whose second variant failed is held, not sent to production', async () => {
  const w = world({ rids: { w1: { source: 'committee_senate', speaker: 'witness' } } })
  await seeded(w, ['w1'], 'role', 'witness')
  w.d1.raw.prepare(`UPDATE ${store.TABLE} SET state = 'generating'`).run()
  writeFileSync(join(w.dir, 'results.jsonl'), JSON.stringify({ rid: w.rid('w1'), run_id: 'run-1', variant: 'role', model: PRIMARY_MODEL, value: WITNESS_GOOD, alt_variant: null, alt_value: null, held: true, neurons: 50, calls: 2, ts: 1 }) + '\n')
  const ai = new ScriptAi(() => ok(NEW))
  // the stored line carries held: held even when restarted without --compare
  assert.equal((await runner(w, ai).r.loop()).end, 'done')
  assert.deepEqual([regen(w, 'w1').state, regen(w, 'w1').new_result, queue(w, 'w1').result], ['held', WITNESS_GOOD, OLD_W])
  // a line without the flag is held when the restart is itself a compare run
  const w3 = world({ rids: { w2: { source: 'committee_senate', speaker: 'witness' } } })
  await seeded(w3, ['w2'], 'role', 'witness')
  w3.d1.raw.prepare(`UPDATE ${store.TABLE} SET state = 'generating'`).run()
  writeFileSync(join(w3.dir, 'results.jsonl'), JSON.stringify({ rid: w3.rid('w2'), run_id: 'run-1', variant: 'role', model: PRIMARY_MODEL, value: WITNESS_GOOD, alt_value: null, neurons: 50, calls: 2, ts: 1 }) + '\n')
  assert.equal((await runner(w3, ai, { compare: true }).r.loop()).end, 'done')
  assert.deepEqual([regen(w3, 'w2').state, queue(w3, 'w2').result], ['held', OLD_W])
  assert.equal(ai.calls.length, 0)
})

test('witness variant: speaker_role reaches the prompt and the validator; an Asked opener is retried', async () => {
  const w = world({ rids: { w1: { source: 'committee_senate', speaker: 'witness' } } })
  await seeded(w, ['w1'], 'role', 'witness')
  const ai = new ScriptAi((n) => ok(n === 0 ? NEW : WITNESS_GOOD))
  const { r, logs } = runner(w, ai)
  assert.equal((await r.loop()).end, 'done')
  assert.equal(ai.calls.length, 2)
  assert.match(ai.calls[0].body.messages[1].content, /"speaker_role":"witness"/)
  assert.match(ai.calls[1].body.messages[1].content, /do not start with 'Asked' or 'Moved'/)
  assert.equal(queue(w, 'w1').result, WITNESS_GOOD)
  assert.ok(logs.some((l) => l.includes(WITNESS_OPENER_PROBLEM)))
})

test('pilot compare: EVERY row is held (nothing reaches production); a witness row gets both variants; release queues the pick with no new call', async () => {
  const w = world({ rids: { z1: {}, w1: { source: 'committee_senate', speaker: 'witness' } } })
  await seeded(w, ['z1'])
  await seeded(w, ['w1'], 'role', 'witness')
  const ai = new ScriptAi((_n, _m, body) => ok(body.messages[1].content.includes('speaker_role') ? WITNESS_GOOD : NEW))
  assert.equal((await runner(w, ai, { compare: true }).r.loop()).end, 'done')
  assert.equal(ai.calls.length, 3)
  assert.deepEqual([regen(w, 'z1').state, regen(w, 'z1').new_result, regen(w, 'z1').alt_result], ['held', NEW, null])
  assert.deepEqual([regen(w, 'w1').state, regen(w, 'w1').new_result, regen(w, 'w1').alt_variant, regen(w, 'w1').alt_result], ['held', WITNESS_GOOD, 'b', NEW])
  assert.deepEqual([queue(w, 'z1').result, queue(w, 'w1').result], [OLD, OLD_W])
  assert.deepEqual(w.kb.writes(), [])
  await release(w.d1.d1 as any, 'run-1', 'b', T0, true)
  assert.deepEqual([regen(w, 'z1').state, regen(w, 'w1').state], ['held', 'held'])
  await release(w.d1.d1 as any, 'run-1', 'b', T0, false)
  assert.deepEqual([regen(w, 'w1').state, regen(w, 'w1').variant, queue(w, 'w1').result, queue(w, 'w1').outcome], ['queued', 'b', NEW, 'unwritten'])
  assert.deepEqual([regen(w, 'z1').state, queue(w, 'z1').result], ['queued', NEW]) // its only variant
  assert.equal(ai.calls.length, 3)
})

test('order: one slice at a time in band order (zenodo, then witness, then gptoss), and --limit bounds the pilot', async () => {
  const w = world({ rids: { w1: { source: 'committee_senate', speaker: 'witness' }, z1: {}, z2: {} } })
  await seeded(w, ['w1'], 'b', 'witness') // seeded first, still runs after zenodo
  await seeded(w, ['z1', 'z2'])
  assert.deepEqual((await store.nextPending(w.d1.d1 as any, 'run-1', 10)).map((r) => r.slice), ['zenodo', 'zenodo'])
  const ai = new ScriptAi(() => ok(NEW))
  const { r } = runner(w, ai, { limit: 2 })
  assert.equal((await r.loop()).end, 'limit')
  assert.deepEqual([regen(w, 'z1').state, regen(w, 'z2').state, regen(w, 'w1').state], ['queued', 'queued', 'pending'])
  assert.deepEqual((await store.nextPending(w.d1.d1 as any, 'run-1', 10)).map((r) => r.slice), ['witness'])
})
