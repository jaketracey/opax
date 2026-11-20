// The Ask guard (src/ask-guard.ts), driven through the real Worker offline: the day's total fails closed,
// the per-address and per-pass limits trip, Turnstile is required only on the website and only while its
// secret is set, an app never sees a challenge, and no GET or HEAD starts a model call.
// Turnstile values are Cloudflare's published test keys; siteverify is answered here as Cloudflare
// documents those keys to answer, so nothing leaves the machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {loadWorker, offline} from './worker-harness.mjs'
import {budgetDatabase} from './fixtures/research-budget.mjs'
import {importBundle} from './fixtures/import-bundle.mjs'

const restore = offline()
test.after(restore)
const h = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public', import.meta.url).pathname)
const base = {...h.env}
const guard = await importBundle((await build({entryPoints: [new URL('../src/ask-guard.ts', import.meta.url).pathname], bundle: true, platform: 'neutral', format: 'esm', write: false})).outputFiles[0].text, 'ask-guard')
const budgets = await importBundle((await build({entryPoints: [new URL('../src/research-budget.ts', import.meta.url).pathname], bundle: true, platform: 'neutral', format: 'esm', write: false})).outputFiles[0].text, 'research-budget')

// Cloudflare's test keys (developers.cloudflare.com/turnstile/troubleshooting/testing/).
const SITE_PASS = '1x00000000000000000000AA'
const SECRET_PASS = '1x0000000000000000000000000000000AA'
const SECRET_FAIL = '2x0000000000000000000000000000000AA'
const SECRET_SPENT = '3x0000000000000000000000000000000AA'
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'
const WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const IOS = 'OPAX-iOS/1.2.0 (iPhone; iOS 26.1)'
const ANDROID = 'OPAX-Android/1.2.0 (Pixel 9; Android 16)'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

// Every outbound request: siteverify answers as Cloudflare's test secrets do; anything else (the knowledge
// box, OpenRouter) is recorded and refused at once, so a route that got past the guard fails fast.
let calls = []
globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input)
  const body = String(init.body ?? '')
  calls.push({url, body})
  if (url === guard.SITEVERIFY_URL) {
    const form = new URLSearchParams(body), secret = form.get('secret'), token = form.get('response')
    const success = secret === SECRET_PASS && token === DUMMY_TOKEN
    return Response.json({success, 'error-codes': success ? [] : secret === SECRET_SPENT ? ['timeout-or-duplicate'] : ['invalid-input-response']})
  }
  return new Response('offline', {status: 503})
}
const modelCalls = () => calls.filter(c => /\/ask$|\/predict\/chat$|openrouter\.ai/.test(c.url) || /"generative_model"/.test(c.body))
const siteverifyCalls = () => calls.filter(c => c.url === guard.SITEVERIFY_URL)

function setup(vars = {}) {
  const daily = budgetDatabase()
  for (const key of Object.keys(h.env)) delete h.env[key]
  Object.assign(h.env, base, {ASK_GUARD: 'on', COMMUNITY_DB: daily.db, ASK_GUARD_SECRET: 'test-only-ask-guard-key-0123456789abcdef', ...vars})
  calls = []
  return daily
}
const ask = (headers = {}, body = {question: 'Who voted for the robodebt royal commission?'}) =>
  h.fetch('/api/ask', {method: 'POST', headers: {'content-type': 'application/json', 'user-agent': WEB, 'cf-connecting-ip': '203.0.113.7', ...headers}, body: JSON.stringify(body)})
const followups = (headers = {}) =>
  h.fetch('/api/followups', {method: 'POST', headers: {'content-type': 'application/json', 'user-agent': WEB, 'cf-connecting-ip': '203.0.113.7', ...headers}, body: JSON.stringify({question: 'Q', answer: 'A'})})
const passedGuard = res => res.status !== 403 && !res.headers.get(guard.ASK_LIMIT_HEADER) && !res.headers.get(guard.ASK_CHECK_HEADER)
const today = () => new Date().toISOString().slice(0, 10)

test('the day spent fails closed: a calm 429 in the rate-limited shape and no model call', async () => {
  const daily = setup({ASK_DAILY_USD: '1'})
  daily.sqlite.prepare('INSERT INTO ask_daily_spend (utc_day, charged_microusd) VALUES (?, ?)').run(today(), 1_000_000)
  for (const ua of [WEB, IOS]) {
    const res = await ask({'user-agent': ua})
    assert.equal(res.status, 429)
    assert.equal(res.headers.get(guard.ASK_LIMIT_HEADER), 'daily')
    assert.ok(Number(res.headers.get('retry-after')) >= 60)
    const body = await res.json()
    assert.deepEqual(Object.keys(body), ['error'], 'old app builds get only the field they already read')
    assert.match(body.error, /^Today's question limit has been reached\. Search and every page still work\./)
    assert.doesNotMatch(body.error, /—/, 'no em dash')
  }
  assert.deepEqual(calls, [], 'refused at the door: not even a search goes out')
  // Follow-ups stay an extra, never an error.
  const chips = await followups()
  assert.equal(chips.status, 200)
  assert.equal(chips.headers.get(guard.ASK_LIMIT_HEADER), 'daily')
  assert.deepEqual(await chips.json(), {questions: []})
  assert.equal(modelCalls().length, 0)
  assert.equal(daily.sqlite.prepare('SELECT COUNT(*) AS n FROM ask_address_daily').get().n, 0, 'a refused question costs the reader none of their quota')
})

test('an unreachable ledger also refuses: no database, or a database that errors', async () => {
  setup()
  delete h.env.COMMUNITY_DB
  assert.equal((await ask()).status, 429)
  setup()
  h.env.COMMUNITY_DB = {prepare() { throw new Error('D1 unavailable') }}
  assert.equal((await ask()).status, 429)
  assert.equal(modelCalls().length, 0)
})

test('every model call reserves from the day total; refused calls are never made and refusals refund', async () => {
  const daily = budgetDatabase()
  const env = {COMMUNITY_DB: daily.db, ASK_DAILY_USD: '0.05', ASK_CALL_USD: '0.02'}
  const a = await guard.reserveAskSpend(env), b = await guard.reserveAskSpend(env)
  assert.ok(a && b)
  assert.equal(await guard.reserveAskSpend(env), null, 'a third 2-cent call does not fit 5 cents')
  await a.settle(0)
  assert.ok(await guard.reserveAskSpend(env), 'an upstream refusal gives its charge back')
  assert.equal(await guard.reserveAskSpend({ASK_DAILY_USD: '5'}), null, 'no ledger: no call')
  // The research loop keeps its own cap and draws on the total; a refusal on either refunds the other.
  const both = budgets.combinedDailyBudget(budgets.researchDailyBudget(daily.db, '10'), budgets.askDailyBudget(daily.db, '0.05'))
  assert.equal(await both.reserve(0.02), null)
  assert.equal(daily.sqlite.prepare('SELECT charged_microusd AS n FROM research_daily_spend').get()?.n ?? 0, 0)
})

// Follow-up chips are one platform generation with no retrieval first, so they show kbFetch's own reservation.
const chipsBody = JSON.stringify({question: 'Who voted for the robodebt royal commission?', answer: 'The Senate voted for it on 18 August 2022.',
  passages: [{title: 'Senate Hansard', kind: 'speech', text: 'The Senate agreed to the motion establishing the royal commission into the robodebt scheme. '.repeat(4)}]})
const chips = () => h.fetch('/api/followups', {method: 'POST', headers: {'content-type': 'application/json', 'user-agent': WEB, 'cf-connecting-ip': '203.0.113.7'}, body: chipsBody})
test('a platform generation is charged to the day total before it is made, and not made when the ledger refuses', async () => {
  const daily = setup()
  await chips()
  assert.equal(modelCalls().length, 1, 'the chips reach the model')
  // The call failed upstream (offline), so its charge came back; a call that answers keeps it.
  assert.equal(daily.sqlite.prepare('SELECT charged_microusd AS n FROM ask_daily_spend').get().n, 0)
  const prior = globalThis.fetch
  globalThis.fetch = async (input, init) => { calls.push({url: String(input), body: String(init?.body ?? '')}); return Response.json({answer: 'Q1? | E1\nQ2? | E2'}) }
  try { setup(); await chips() } finally { globalThis.fetch = prior }
  assert.equal(h.env.COMMUNITY_DB && (await h.env.COMMUNITY_DB.prepare('SELECT charged_microusd AS n FROM ask_daily_spend').bind().first()).n, 20_000)
  // The entry check sees room, then the reservation itself is refused: no call goes out.
  const refusing = setup().db, prepare = refusing.prepare.bind(refusing)
  h.env.COMMUNITY_DB = {...refusing, prepare: sql => /INSERT INTO ask_daily_spend/.test(sql) ? {bind: () => ({first: async () => null})} : prepare(sql)}
  const res = await chips()
  assert.deepEqual(await res.json(), {questions: []})
  assert.equal(modelCalls().length, 0)
})

test('each address has a daily quota, keyed by a salted hash of the address and the day, never the address', async () => {
  const daily = setup({ASK_ADDRESS_DAILY: '2', ASK_ADDRESS_DAILY_EXTRAS: '1'})
  assert.ok(passedGuard(await ask()))
  assert.ok(passedGuard(await ask({'user-agent': IOS})), 'an app shares its address quota')
  const third = await ask()
  assert.equal(third.status, 429)
  assert.equal(third.headers.get(guard.ASK_LIMIT_HEADER), 'address')
  assert.ok(passedGuard(await ask({'cf-connecting-ip': '198.51.100.20'})), 'another address is counted on its own')
  assert.ok(passedGuard(await followups()))
  const chips = await followups()
  assert.equal(chips.headers.get(guard.ASK_LIMIT_HEADER), 'address')
  const rows = daily.sqlite.prepare('SELECT * FROM ask_address_daily').all()
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.match(row.address_hash, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(JSON.stringify(row), /203\.0\.113|198\.51\.100/)
  }
  const tomorrow = await guard.addressKey(h.env, '203.0.113.7', Date.now() + 86_400_000)
  assert.ok(!rows.some(r => r.address_hash === tomorrow), 'the key changes every day')
})

test('the guard is on unless a test harness turns it off, and no deployed environment does', () => {
  assert.equal(guard.askGuardOn({}), true)
  assert.equal(guard.askGuardOn({ASK_GUARD: ''}), true)
  assert.equal(guard.askGuardOn({ASK_GUARD: 'off'}), false)
  assert.doesNotMatch(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /ASK_GUARD"/)
})

test('the per-minute limits are what one person needs', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  for (const ns of ['1001', '2001']) assert.match(config, new RegExp(`"ASK_LIMITER", "namespace_id": "${ns}", "simple": \\{ "limit": 5, "period": 60 \\}`))
  for (const ns of ['1002', '2002']) assert.match(config, new RegExp(`"FOLLOWUPS_LIMITER", "namespace_id": "${ns}", "simple": \\{ "limit": 10, "period": 60 \\}`))
})

test('Turnstile is skipped while its secret is unset; the other limits still apply', async () => {
  setup({TURNSTILE_SITE_KEY: SITE_PASS})
  const res = await ask()
  assert.ok(passedGuard(res))
  assert.equal(siteverifyCalls().length, 0)
})

test('with the secret set, a web question needs a token, verified server-side once, then rides on a signed pass', async () => {
  const daily = setup({TURNSTILE_SITE_KEY: SITE_PASS, TURNSTILE_SECRET_KEY: SECRET_PASS})
  const challenged = await ask()
  assert.equal(challenged.status, 403)
  assert.equal(challenged.headers.get(guard.ASK_CHECK_HEADER), SITE_PASS)
  assert.equal(modelCalls().length, 0)
  assert.equal((await followups()).headers.get(guard.ASK_CHECK_HEADER), SITE_PASS, 'follow-up chips need the pass too')

  const first = await ask({[guard.TURNSTILE_HEADER]: DUMMY_TOKEN})
  assert.ok(passedGuard(first))
  const form = new URLSearchParams(siteverifyCalls()[0].body)
  assert.deepEqual([form.get('secret'), form.get('response'), form.get('remoteip')], [SECRET_PASS, DUMMY_TOKEN, '203.0.113.7'])
  const pass = first.headers.get(guard.ASK_PASS_HEADER)
  assert.match(pass, /^[0-9a-f]{32}\.\d{10}\.[A-Za-z0-9_-]{43}$/)

  calls = []
  assert.ok(passedGuard(await ask({[guard.ASK_PASS_HEADER]: pass})))
  assert.ok(passedGuard(await followups({[guard.ASK_PASS_HEADER]: pass})))
  assert.equal(siteverifyCalls().length, 0, 'a pass needs no fresh widget')
  // A forged or altered pass is a challenge.
  // (The id, not the signature's last character: that one carries two padding bits.)
  const forged = pass.replace(/^./, c => c === 'a' ? 'b' : 'a')
  assert.equal((await ask({[guard.ASK_PASS_HEADER]: forged})).status, 403)
  // About twenty questions on one pass, then a fresh check.
  daily.sqlite.prepare('UPDATE ask_pass_uses SET uses = ?').run(guard.PASS_QUESTIONS)
  assert.equal((await ask({[guard.ASK_PASS_HEADER]: pass})).status, 403)
})

test('a failed or already-spent token is refused', async () => {
  for (const secret of [SECRET_FAIL, SECRET_SPENT]) {
    setup({TURNSTILE_SITE_KEY: SITE_PASS, TURNSTILE_SECRET_KEY: secret})
    const res = await ask({[guard.TURNSTILE_HEADER]: DUMMY_TOKEN})
    assert.equal(res.status, 403)
    assert.equal(siteverifyCalls().length, 1)
    assert.equal(modelCalls().length, 0)
  }
})

test('an app user agent never sees Turnstile, and still gets the address quota', async () => {
  setup({TURNSTILE_SITE_KEY: SITE_PASS, TURNSTILE_SECRET_KEY: SECRET_PASS, ASK_ADDRESS_DAILY: '1'})
  for (const ua of [IOS, ANDROID]) {
    const res = await ask({'user-agent': ua, 'cf-connecting-ip': ua === IOS ? '192.0.2.1' : '192.0.2.2'})
    assert.ok(passedGuard(res), ua)
    assert.equal((await followups({'user-agent': ua, 'cf-connecting-ip': '192.0.2.9'})).headers.get(guard.ASK_CHECK_HEADER), null)
  }
  assert.equal(siteverifyCalls().length, 0)
  assert.equal((await ask({'user-agent': IOS, 'cf-connecting-ip': '192.0.2.1'})).headers.get(guard.ASK_LIMIT_HEADER), 'address')
})

test('no GET or HEAD, from a crawler or anyone, starts a model call', async () => {
  setup()
  // The control: the same summary by POST reaches the model, so the GET below is refused by the rule, not by the setup.
  const summary = '/api/search-summary?q=labor&kind=all'
  await h.fetch(summary, {method: 'POST', headers: {'user-agent': WEB}})
  assert.equal(modelCalls().length, 1, 'the catalog search finds records and the summary asks the model')
  calls = []
  const paths = [summary, `${summary}&stream=1`, '/api/ask', '/api/ask?stream=1&q=robodebt', '/api/followups', '/api/journey-story', '/api/search-summary?q=robodebt&kind=all',
    '/api/search-summary?stream=1&q=robodebt&kind=all', '/ask?q=who+voted+for+robodebt', '/search?q=robodebt', '/', '/bills', '/money']
  for (const ua of [WEB, GOOGLEBOT])
    for (const method of ['GET', 'HEAD'])
      for (const path of paths) await h.fetch(path, {method, headers: {'user-agent': ua, 'cf-connecting-ip': '66.249.66.1'}})
  assert.deepEqual(modelCalls(), [])
  assert.equal((await h.fetch('/api/search-summary?q=robodebt', {method: 'HEAD'})).status, 405)
})

test('only a POST or an app may generate a search summary', () => {
  assert.equal(guard.summaryMayGenerate('GET', WEB), false)
  assert.equal(guard.summaryMayGenerate('GET', GOOGLEBOT), false)
  assert.equal(guard.summaryMayGenerate('HEAD', IOS), false)
  assert.equal(guard.summaryMayGenerate('POST', WEB), true)
  assert.equal(guard.summaryMayGenerate('GET', IOS), true, 'installed apps read summaries by GET')
  assert.equal(guard.askGuardKind('GET', '/api/search-summary', ANDROID), 'extra', 'and take the same limits')
  assert.equal(guard.askGuardKind('GET', '/api/ask', WEB), null)
})

test('the page policy allows Turnstile for script and frame only', async () => {
  setup()
  const csp = (await h.fetch('/')).headers.get('content-security-policy')
  const directive = name => csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) ?? ''
  assert.match(directive('script-src'), /https:\/\/challenges\.cloudflare\.com/)
  assert.match(directive('frame-src'), /https:\/\/challenges\.cloudflare\.com/)
  for (const other of ['connect-src', 'img-src', 'style-src', 'default-src']) assert.doesNotMatch(directive(other), /challenges\.cloudflare\.com/)
  const headers = /Content-Security-Policy: (.+)/.exec(readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'))[1]
  assert.equal(headers.match(/challenges\.cloudflare\.com/g).length, 2, 'the static headers carry the same two')
})

test('old rows are pruned', async () => {
  const daily = budgetDatabase()
  daily.sqlite.prepare("INSERT INTO ask_address_daily (utc_day, address_hash, questions) VALUES ('2026-01-01', ?, 1)").run('a'.repeat(64))
  daily.sqlite.prepare("INSERT INTO ask_pass_uses (pass_id, utc_day, uses) VALUES (?, '2026-01-01', 1)").run('b'.repeat(32))
  await guard.pruneAskGuard(daily.db)
  assert.equal(daily.sqlite.prepare('SELECT COUNT(*) AS n FROM ask_address_daily').get().n, 0)
  assert.equal(daily.sqlite.prepare('SELECT COUNT(*) AS n FROM ask_pass_uses').get().n, 0)
})
