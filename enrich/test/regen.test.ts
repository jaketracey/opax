// 5b-cheap regeneration runner: guard, metering, ledger, snapshot, hand-off through the Worker, rollback.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildMessages, WITNESS_ROLE_LINE, type PromptRecord } from '../src/prompts.ts'
import { runTick } from '../src/tick.ts'
import { validateSummary, WITNESS_OPENER_PROBLEM } from '../src/validate.ts'
import { admit, classifyResponse, headroomFrom, Ledger, meter, StopRun, usdToNeurons, type Caps } from '../scripts/regen/guard.ts'
import { release, Runner, PRIMARY_MODEL, type AiPost } from '../scripts/regen/runner.ts'
import * as store from '../scripts/regen/store.ts'
import { FakeAi, FakeKb, makeD1, makeDeps, rows, speechText } from './helpers.ts'

const OLD = 'Argued that supported housing for young people needs 500 places and regional funding, citing the royal commission and the minister.'
const NEW = 'Asked whether the government would deliver 500 supported housing places for young people; the minister said $75 million was set aside for regional projects.'
const WITNESS_GOOD = 'Told the committee that 500 supported housing places for young people were recommended and that $75 million had been set aside for regional projects.'
const T0 = Date.parse('2026-11-14T08:00:00Z')

const ok = (summary: string, p = 1000, c = 60) => ({ status: 200, raw: JSON.stringify({ success: true, errors: [], messages: [], result: { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary }) } }], usage: { prompt_tokens: p, completion_tokens: c, total_tokens: p + c } } }) })

class ScriptAi implements AiPost {
  calls: Array<{ model: string; body: any }> = []
  private readonly script: (n: number, model: string, body: any) => { status: number; raw: string } | Error
  constructor(script: (n: number, model: string, body: any) => { status: number; raw: string } | Error) {
    this.script = script
  }
  async post(model: string, body: Record<string, unknown>) {
    const n = this.calls.length
    this.calls.push({ model, body: JSON.parse(JSON.stringify(body)) })
    const r = this.script(n, model, body)
    if (r instanceof Error) throw r
    return r
  }
}

function world(opts: { rids?: Record<string, { source?: string; speaker?: string; brief?: string; model?: string; outcome?: string }> } = {}) {
  const d1 = makeD1()
  const kb = new FakeKb()
  const specs = opts.rids ?? { a1: {} }
  let i = 0
  for (const [rid0, s] of Object.entries(specs)) {
    const rid = rid0.padEnd(32, '0')
    const brief = s.brief ?? OLD
    kb.add(rid, {
      title: 'Jane Citizen — Housing — 1999-05-04',
      classifications: [
        { labelset: 'kind', label: 'speech' },
        { labelset: 'source', label: s.source ?? 'zenodo' },
        ...(s.speaker ? [{ labelset: 'speaker_type', label: s.speaker }] : []),
      ],
      texts: { body: speechText(), 'da-summary-t-body': brief },
    })
    d1.raw.prepare(`INSERT INTO queue (rid, task, status, priority, model, result, outcome, neurons, force, created_at, updated_at, done_at)
      VALUES (?, 'speech_summary', 'done', 0, ?, ?, ?, 12.5, 0, 1, 2, 3)`).run(rid, s.model ?? '@cf/qwen/qwen3-30b-a3b-fp8', brief, s.outcome ?? 'written')
    i += 1
  }
  const dir = mkdtempSync(join(tmpdir(), 'regen-'))
  return { d1, kb, dir, rid: (r: string) => r.padEnd(32, '0') }
}

const CAPS: Caps = { runNeurons: usdToNeurons(30), dailyBudget: 1_500_000, workerHeadroom: 756_167 }

function runner(w: ReturnType<typeof world>, ai: AiPost, o: { caps?: Caps; worker?: number; compare?: boolean; limit?: number; runId?: string } = {}) {
  const ledger = new Ledger(join(w.dir, 'ledger.jsonl'))
  const logs: string[] = []
  let t = T0
  const r = new Runner({
    db: w.d1.d1 as any, kb: w.kb, ai, ledger, resultsPath: join(w.dir, 'results.jsonl'), stopFile: join(w.dir, 'STOP'), caps: o.caps ?? CAPS,
    workerSpendToday: async () => o.worker ?? 0, now: () => (t += 10), sleep: async () => {}, log: (l) => logs.push(l),
  }, { runId: o.runId ?? 'run-1', concurrency: 2, compare: o.compare, limit: o.limit })
  return { r, ledger, logs }
}

async function seeded(w: ReturnType<typeof world>, list: string[], variant: 'b' | 'role' = 'b', slice = 'zenodo') {
  await store.init(w.d1.d1 as any)
  return store.seed(w.d1.d1 as any, { runId: 'run-1', slice, variant, seqBase: 1_000_000, rids: list.map(w.rid), now: T0 })
}

const regen = (w: ReturnType<typeof world>, rid: string) => rows(w.d1.raw, `SELECT * FROM ${store.TABLE} WHERE rid = ?`, w.rid(rid))[0]
const queue = (w: ReturnType<typeof world>, rid: string) => rows(w.d1.raw, `SELECT * FROM queue WHERE rid = ? AND task = 'speech_summary'`, w.rid(rid))[0]

// ------------------------------------------------------------------ guard

test('guard: 402, 403, 429, 401, 5xx stop; a plain 400/413/422 skips the item; billing wording in a 4xx stops', () => {
  for (const s of [402, 403, 429, 401, 404, 500, 503]) assert.equal(classifyResponse(s, '{"success":false,"errors":[{"message":"x"}]}').action, 'stop', String(s))
  for (const s of [400, 413, 422]) assert.equal(classifyResponse(s, '{"success":false,"errors":[{"code":5006,"message":"bad input"}]}').action, 'skip', String(s))
  assert.equal(classifyResponse(400, '{"success":false,"errors":[{"message":"you have exceeded your daily quota"}]}').action, 'stop')
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

test('admit: the run cap, then today\'s share after the Worker\'s headroom or its actual spend, whichever is larger', () => {
  const t = (neurons: number, today = 0) => ({ neurons, usd: 0, calls: 0, byDay: { '2026-11-14': today }, unsettled: 0, stops: 0 })
  assert.equal(admit(CAPS, t(usdToNeurons(30) - 10), '2026-11-14', 0, 11).ok, false)
  assert.equal(admit(CAPS, t(0, 743_000), '2026-11-14', 0, 800).ok, true)
  assert.equal(admit(CAPS, t(0, 743_900), '2026-11-14', 0, 800).ok, false)
  assert.equal(admit(CAPS, t(0, 500_000), '2026-11-14', 1_100_000, 800).ok, false) // the Worker ran past its headroom
  assert.equal(headroomFrom([{ day: 'a', n: 630_139 }, { day: 'b', n: 4000 }]), 756_167)
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

// ------------------------------------------------------------------ the run

test('seed snapshots only finished Workers AI briefs, before anything is generated, and never replaces a snapshot', async () => {
  const w = world({ rids: { a1: {}, b2: { model: 'claude-haiku-5-5' }, c3: { outcome: 'skipped-existing' } } })
  assert.equal(await seeded(w, ['a1', 'b2', 'c3', 'zz']), 1)
  assert.equal(regen(w, 'a1').old_result, OLD)
  assert.equal(regen(w, 'a1').state, 'pending')
  w.d1.raw.prepare(`UPDATE queue SET result = 'changed later' WHERE rid = ?`).run(w.rid('a1'))
  assert.equal(await seeded(w, ['a1']), 0)
  assert.equal(regen(w, 'a1').old_result, OLD)
})

test('run: qwen3.8 no-think at max_tokens 256, metered from usage, handed to the Worker as a forced unwritten row; the runner never writes the box', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW, 1000, 60))
  const { r, ledger } = runner(w, ai)
  assert.deepEqual(await r.loop(), { end: 'done' })
  assert.equal(ai.calls.length, 1)
  assert.equal(ai.calls[0].model, '@cf/qwen/qwen3.8-27b')
  assert.equal(ai.calls[0].body.max_tokens, 256)
  assert.equal(ai.calls[0].body.enable_thinking, false)
  assert.equal(ai.calls[0].body.response_format.type, 'json_schema')
  const expected = (1000 * 40909 + 60 * 290909) / 1e6
  assert.ok(Math.abs(ledger.totals().neurons - expected) < 1e-9)
  const lines = readFileSync(join(w.dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(lines.map((l) => l.t), ['reserve', 'settle'])
  assert.equal(lines[0].upper > expected, true)
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

test('write path: the Worker\'s own live tick writes the new brief (forced); rollback hands the old one back the same way', async () => {
  const w = world()
  await seeded(w, ['a1'])
  await runner(w, new ScriptAi(() => ok(NEW))).r.loop()
  const tick = () => runTick(makeDeps({ kb: w.kb, ai: new FakeAi(() => new Error('the Worker must not call the model')), env: { WRITE_MODE: 'live', HISTORIC_HOLD: 'true' }, d1: w.d1, now: () => T0 + 60_000 }).deps)
  await tick()
  assert.equal(w.kb.resources.get(w.rid('a1'))!.texts['da-summary-t-body'], NEW)
  assert.equal(queue(w, 'a1').outcome, 'written')
  assert.equal(await store.markWritten(w.d1.d1 as any, 'run-1', T0), 1)
  assert.equal(regen(w, 'a1').state, 'written')

  // dry run: nothing changes (the CLI's --dry-run only reads rows and prints them)
  const before = JSON.stringify([queue(w, 'a1'), regen(w, 'a1')])
  const listed = await store.rowsIn(w.d1.d1 as any, 'run-1', ['queued', 'written'])
  assert.equal(listed.length, 1)
  assert.equal(JSON.stringify([queue(w, 'a1'), regen(w, 'a1')]), before)

  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), true)
  const q = queue(w, 'a1')
  assert.deepEqual([q.outcome, q.force, q.model, q.result], ['unwritten', 1, '@cf/qwen/qwen3-30b-a3b-fp8', OLD])
  assert.equal(regen(w, 'a1').state, 'rolled-back')
  await tick()
  assert.equal(w.kb.resources.get(w.rid('a1'))!.texts['da-summary-t-body'], OLD)
  assert.equal(queue(w, 'a1').outcome, 'written')
  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), false) // only once
})

test('rollback leaves a row alone if something else has replaced our brief since', async () => {
  const w = world()
  await seeded(w, ['a1'])
  await runner(w, new ScriptAi(() => ok(NEW))).r.loop()
  w.d1.raw.prepare(`UPDATE queue SET result = 'someone else' WHERE rid = ?`).run(w.rid('a1'))
  assert.equal(await store.rollbackRow(w.d1.d1 as any, w.rid('a1'), T0), false)
  assert.equal(queue(w, 'a1').result, 'someone else')
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

test('stops: the run cap is checked against each call\'s upper bound before it goes out', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const end = await runner(w, ai, { caps: { ...CAPS, runNeurons: 50 } }).r.loop()
  assert.equal(end.end, 'stopped')
  assert.equal(ai.calls.length, 0)
  assert.equal(regen(w, 'a1').state, 'pending')
})

test('daily share used up (the Worker\'s headroom kept): the run pauses without a call', async () => {
  const w = world()
  await seeded(w, ['a1'])
  const ai = new ScriptAi(() => ok(NEW))
  const end = await runner(w, ai, { worker: 1_499_990 }).r.loop()
  assert.deepEqual([end.end, ai.calls.length, regen(w, 'a1').state], ['paused', 0, 'pending'])
})

test('a per-item 400 skips and logs that row only; the run continues', async () => {
  const w = world({ rids: { a1: {}, b2: {} } })
  await seeded(w, ['a1', 'b2'])
  const ai = new ScriptAi((n, _m, body) => (body.messages[1].content.includes(w.rid('a1')) ? { status: 400, raw: '{"success":false,"errors":[{"message":"bad input"}]}' } : ok(NEW)))
  const end = await runner(w, ai).r.loop()
  assert.equal(end.end, 'done')
  assert.equal(regen(w, 'a1').state, 'failed')
  assert.match(regen(w, 'a1').note, /^HTTP 400/)
  assert.equal(regen(w, 'b2').state, 'queued')
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

test('pilot compare: a witness row gets both variants, nothing is queued until release picks one (no new call)', async () => {
  const w = world({ rids: { w1: { source: 'committee_senate', speaker: 'witness' } } })
  await seeded(w, ['w1'], 'role', 'witness')
  const ai = new ScriptAi((_n, _m, body) => ok(body.messages[1].content.includes('speaker_role') ? WITNESS_GOOD : NEW))
  assert.equal((await runner(w, ai, { compare: true }).r.loop()).end, 'done')
  assert.equal(ai.calls.length, 2)
  assert.deepEqual([regen(w, 'w1').state, regen(w, 'w1').new_result, regen(w, 'w1').alt_variant, regen(w, 'w1').alt_result], ['held', WITNESS_GOOD, 'b', NEW])
  assert.equal(queue(w, 'w1').result, OLD)
  await release(w.d1.d1 as any, 'run-1', 'b', T0, true)
  assert.equal(regen(w, 'w1').state, 'held')
  await release(w.d1.d1 as any, 'run-1', 'b', T0, false)
  assert.deepEqual([regen(w, 'w1').state, regen(w, 'w1').variant, queue(w, 'w1').result, queue(w, 'w1').outcome], ['queued', 'b', NEW, 'unwritten'])
  assert.equal(ai.calls.length, 2)
})

test('order: slices run by seq (zenodo before witness) and --limit bounds the pilot', async () => {
  const w = world({ rids: { w1: { speaker: 'witness' }, z1: {}, z2: {} } })
  await store.init(w.d1.d1 as any)
  await store.seed(w.d1.d1 as any, { runId: 'run-1', slice: 'witness', variant: 'b', seqBase: 2_000_000, rids: [w.rid('w1')], now: T0 })
  await store.seed(w.d1.d1 as any, { runId: 'run-1', slice: 'zenodo', variant: 'b', seqBase: 1_000_000, rids: [w.rid('z1'), w.rid('z2')], now: T0 })
  const ai = new ScriptAi(() => ok(NEW))
  const { r } = runner(w, ai, { limit: 2 })
  assert.equal((await r.loop()).end, 'limit')
  assert.deepEqual([regen(w, 'z1').state, regen(w, 'z2').state, regen(w, 'w1').state], ['queued', 'queued', 'pending'])
})
