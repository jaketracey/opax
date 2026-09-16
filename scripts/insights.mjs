#!/usr/bin/env node
/**
 * OPAX insights: one command for "how is traffic, and is anyone responding".
 *
 *   cd portal && npm run insights            # the last 14 days
 *   npm run insights -- --days 7             # a shorter window
 *   npm run insights -- --only social        # cloudflare | posthog | community | social
 *   npm run insights -- --whois              # name the networks behind Ask callers
 *   npm run insights -- --fresh              # bypass the Worker's 10-minute engagement cache
 *   npm run insights -- --json               # everything as JSON
 *
 * Sources (docs/INSIGHTS.md):
 *   Cloudflare zone analytics  wrangler's OAuth token (refreshed via `wrangler whoami`)
 *   PostHog (real readers)     POSTHOG_PERSONAL_API_KEY, query:read scope
 *   D1 community + journal     `wrangler d1 execute --remote`
 *   Social engagement          GET /api/daily-post/engagement with DAILY_POST_OPERATOR_SECRET
 * Keys live in ~/.config/opax/insights.env (KEY=VALUE) or the environment.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const portal = resolve(dirname(fileURLToPath(import.meta.url)), '../portal')
const ZONE = 'de2bde527274c1b5cfeb162fbce1099d'
const POSTHOG_PROJECT = '507367'
const ORIGIN = 'https://opax.com.au'
const D1 = 'opax-community'
const MODEL_PATHS = ['/api/ask', '/api/search-summary', '/api/followups', '/api/journey-story', '/api/search']

const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback }
const has = name => args.includes(name)
const days = Math.min(Math.max(parseInt(flag('--days', '14'), 10) || 14, 2), 30)
const only = flag('--only', null)
const asJson = has('--json')
const sections = ['cloudflare', 'posthog', 'community', 'social'].filter(s => !only || s === only)
if (only && !sections.length) { console.error(`--only must be one of cloudflare, posthog, community, social`); process.exit(2) }

function loadEnv() {
  const out = {}
  const file = resolve(homedir(), '.config/opax/insights.env')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
    }
  }
  return { ...out, ...process.env }
}
const env = loadEnv()

// ---------------------------------------------------------------- helpers
const pad = (v, w, right) => { const s = String(v ?? ''); return right ? s.padStart(w) : s.padEnd(w) }
function table(rows, columns) {
  if (!rows.length) return '  (none)'
  const widths = columns.map(c => Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? '').length)))
  const line = cells => '  ' + cells.map((v, i) => pad(v, widths[i], columns[i].right)).join('  ')
  return [line(columns.map(c => c.label)), ...rows.map(r => line(columns.map(c => r[c.key])))].join('\n')
}
const col = (key, label = key, right = false) => ({ key, label, right })
const n = (key, label = key) => col(key, label, true)
const isoDay = ms => new Date(ms).toISOString().slice(0, 10)
async function attempt(fn) { try { return await fn() } catch (error) { return { error: error instanceof Error ? error.message : String(error) } } }

// ---------------------------------------------------------------- cloudflare
function wranglerToken() {
  const file = resolve(homedir(), '.config/.wrangler/config/default.toml')
  const read = () => {
    if (!existsSync(file)) return {}
    const t = readFileSync(file, 'utf8')
    return { token: /oauth_token\s*=\s*"([^"]+)"/.exec(t)?.[1], exp: /expiration_time\s*=\s*"([^"]+)"/.exec(t)?.[1] }
  }
  let c = read()
  if (!c.token || !c.exp || Date.parse(c.exp) < Date.now() + 60_000) {
    spawnSync('npx', ['wrangler', 'whoami'], { cwd: portal, stdio: 'ignore' })
    c = read()
  }
  return c.token
}
async function graphql(token, query) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }),
  })
  const body = await res.json()
  if (body.errors?.length) throw new Error(body.errors.map(e => e.message).join('; '))
  return body.data.viewer.zones[0]
}
async function cloudflare() {
  const token = wranglerToken()
  if (!token) return { error: 'no wrangler OAuth token; run `npx wrangler login` in portal/' }
  const zone = `zones(filter:{zoneTag:"${ZONE}"})`
  const since = isoDay(Date.now() - (days - 1) * 86400000)
  const h23 = new Date(Date.now() - 23 * 3600000).toISOString()
  const group = async (filter, dims, limit = 12) => (await graphql(token,
    `{ viewer { ${zone} { httpRequestsAdaptiveGroups(limit:${limit}, filter:{datetime_geq:"${h23}", ${filter}}, orderBy:[count_DESC]) { count dimensions { ${dims} } } } } }`,
  )).httpRequestsAdaptiveGroups.map(r => ({ ...r.dimensions, count: r.count }))
  const out = {}
  out.daily = await attempt(async () => (await graphql(token,
    `{ viewer { ${zone} { httpRequests1dGroups(limit:${days}, filter:{date_geq:"${since}"}, orderBy:[date_ASC]) { dimensions { date } sum { requests pageViews } uniq { uniques } } } } }`,
  )).httpRequests1dGroups.map(r => ({ date: r.dimensions.date, requests: r.sum.requests, pageViews: r.sum.pageViews, uniques: r.uniq.uniques })))
  out.countries = await attempt(() => group('userAgent_neq:""', 'clientCountryName'))
  out.modelRoutes = await attempt(() => group(`userAgent_neq:"", clientRequestPath_in:[${MODEL_PATHS.map(p => `"${p}"`).join(',')}]`, 'clientRequestPath edgeResponseStatus clientCountryName', 30))
  out.askCallers = await attempt(() => group('clientRequestPath:"/api/ask", edgeResponseStatus:200', 'clientIP clientCountryName', 20))
  out.auPages = await attempt(() => group('userAgent_neq:"", clientCountryName:"AU", edgeResponseStatus:200, edgeResponseContentTypeName:"html"', 'clientRequestPath', 15))
  out.ownIp = await attempt(async () => (await (await fetch('https://api64.ipify.org', { signal: AbortSignal.timeout(5000) })).text()).trim())
  if (has('--whois') && Array.isArray(out.askCallers)) {
    for (const row of out.askCallers) {
      const r = spawnSync('whois', ['-h', 'whois.cymru.com', ` -v ${row.clientIP}`], { encoding: 'utf8' })
      row.network = (r.stdout.trim().split('\n').pop() || '').split('|').pop()?.trim() || ''
    }
  }
  return out
}
function printCloudflare(cf) {
  console.log(`\n== Cloudflare zone (bots included; the human floor is the AU rows)`)
  if (cf.error) return console.log('  ' + cf.error)
  const rows = cf.daily.error ? [] : cf.daily
  console.log(cf.daily.error ? '  ' + cf.daily.error : table(rows, [col('date'), n('requests'), n('pageViews', 'page views'), n('uniques')]))
  console.log(`\n  Last 23h by country (real user agents):`)
  console.log(cf.countries.error ? '  ' + cf.countries.error : '  ' + cf.countries.map(r => `${r.clientCountryName} ${r.count}`).join('  '))
  console.log(`\n  Model-backed routes, last 23h:`)
  console.log(cf.modelRoutes.error ? '  ' + cf.modelRoutes.error : table(cf.modelRoutes, [col('clientRequestPath', 'path'), n('edgeResponseStatus', 'status'), col('clientCountryName', 'cc'), n('count')]))
  console.log(`\n  Ask calls that returned 200, last 23h, by address${typeof cf.ownIp === 'string' ? ` (you are ${cf.ownIp})` : ''}:`)
  if (cf.askCallers.error) console.log('  ' + cf.askCallers.error)
  else console.log(table(cf.askCallers.map(r => ({ ...r, who: r.clientIP === cf.ownIp ? 'you' : (r.network ?? '') })), [col('clientIP', 'address'), col('clientCountryName', 'cc'), n('count'), col('who')]))
  console.log(`\n  AU HTML pages served, last 23h:`)
  console.log(cf.auPages.error ? '  ' + cf.auPages.error : table(cf.auPages, [col('clientRequestPath', 'path'), n('count')]))
}

// ---------------------------------------------------------------- posthog
async function hogql(key, query) {
  const res = await fetch(`https://us.posthog.com/api/projects/${POSTHOG_PROJECT}/query/`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  })
  if (!res.ok) throw new Error(`PostHog HTTP ${res.status}`)
  const body = await res.json()
  return { columns: body.columns, results: body.results }
}
const rowsOf = ({ columns, results }) => results.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])))
async function posthog() {
  const key = env.POSTHOG_PERSONAL_API_KEY
  if (!key) return { error: 'set POSTHOG_PERSONAL_API_KEY (query:read) in ~/.config/opax/insights.env; until then use the PostHog MCP or https://us.posthog.com/project/507367' }
  const out = {}
  out.daily = await attempt(async () => rowsOf(await hogql(key, `
    SELECT toDate(timestamp) AS day,
      uniqIf(distinct_id, event = '$pageview') AS readers,
      countIf(event = '$pageview') AS views,
      countIf(event = 'opax_ask_started') AS asks,
      uniqIf(distinct_id, event = 'opax_ask_started') AS askers,
      countIf(event = 'opax_search_completed') AS searches
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY AND event IN ('$pageview', 'opax_ask_started', 'opax_search_completed')
    GROUP BY day ORDER BY day`)))
  const breakdown = (expr, label) => attempt(async () => rowsOf(await hogql(key, `
    SELECT coalesce(toString(${expr}), '(none)') AS ${label}, uniq(distinct_id) AS readers, count() AS views
    FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY
    GROUP BY ${label} ORDER BY readers DESC, views DESC LIMIT 12`)))
  out.referrers = await breakdown('properties.$referring_domain', 'referrer')
  out.countries = await breakdown('properties.$geoip_country_code', 'country')
  out.paths = await breakdown('properties.$pathname', 'path')
  return out
}
function printPosthog(ph) {
  console.log(`\n== PostHog readers (browsers only; no bots, no headless fleets)`)
  if (ph.error) return console.log('  ' + ph.error)
  console.log(ph.daily.error ? '  ' + ph.daily.error : table(ph.daily, [col('day'), n('readers'), n('views'), n('asks'), n('askers'), n('searches')]))
  for (const [key, label] of [['referrers', 'referrer'], ['countries', 'country'], ['paths', 'path']]) {
    console.log(`\n  Last 7 days by ${label}:`)
    console.log(ph[key].error ? '  ' + ph[key].error : table(ph[key], [col(label), n('readers'), n('views')]))
  }
}

// ---------------------------------------------------------------- community (D1)
function d1(sql) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', D1, '--remote', '--json', '--command', sql], { cwd: portal, encoding: 'utf8' })
  const text = (r.stdout || '').trim()
  const start = text.indexOf('[')
  try { return JSON.parse(text.slice(start))[0].results } catch { throw new Error('d1: ' + (r.stderr || text).replace(/\s+/g, ' ').slice(0, 240)) }
}
async function community() {
  const out = {}
  out.counts = await attempt(() => d1(`SELECT
    (SELECT COUNT(*) FROM members) AS members, (SELECT COUNT(*) FROM member_sessions) AS sessions,
    (SELECT COUNT(*) FROM community_threads) AS threads, (SELECT COUNT(*) FROM community_replies) AS replies,
    (SELECT COUNT(*) FROM member_chats) AS chats, (SELECT COUNT(*) FROM reading_lists) AS reading_lists,
    (SELECT COUNT(*) FROM voice_sessions) AS voice_sessions, (SELECT COUNT(*) FROM mcp_keys) AS mcp_keys,
    (SELECT COUNT(*) FROM social_editions) AS editions,
    (SELECT COUNT(*) FROM social_deliveries WHERE status='posted') AS posted,
    (SELECT COUNT(*) FROM social_deliveries WHERE status NOT IN ('posted')) AS undelivered`)[0])
  out.members = await attempt(() => d1(`SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS joined FROM members WHERE created_at >= strftime('%s','now') - ${days} * 86400 GROUP BY day ORDER BY day`))
  out.deliveries = await attempt(() => d1(`SELECT edition_date, channel, status FROM social_deliveries WHERE edition_date >= date('now', '-7 days') ORDER BY edition_date DESC, channel`))
  return out
}
function printCommunity(c) {
  console.log(`\n== Community (D1 ${D1})`)
  if (c.counts.error) console.log('  ' + c.counts.error)
  else console.log('  ' + Object.entries(c.counts).map(([k, v]) => `${k} ${v}`).join('  '))
  console.log(`\n  Members joined, last ${days} days:`)
  console.log(c.members.error ? '  ' + c.members.error : table(c.members, [col('day'), n('joined')]))
  console.log(`\n  Daily edition deliveries, last 7 days:`)
  if (c.deliveries.error) console.log('  ' + c.deliveries.error)
  else {
    const byDate = new Map()
    for (const d of c.deliveries) byDate.set(d.edition_date, [...(byDate.get(d.edition_date) ?? []), `${d.channel}${d.status === 'posted' ? '' : `:${d.status}`}`])
    console.log(table([...byDate].map(([edition_date, channels]) => ({ edition_date, channels: channels.join(' ') })), [col('edition_date', 'edition'), col('channels')]))
  }
}

// ---------------------------------------------------------------- social
async function social() {
  const out = {}
  out.status = await attempt(async () => await (await fetch(`${ORIGIN}/api/daily-post/status`, { signal: AbortSignal.timeout(20000) })).json())
  const secret = env.DAILY_POST_OPERATOR_SECRET
  out.engagement = secret
    ? await attempt(async () => {
      const res = await fetch(`${ORIGIN}/api/daily-post/engagement${has('--fresh') ? '?fresh=1' : ''}`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90000) })
      if (!res.ok) throw new Error(`engagement HTTP ${res.status}`)
      return await res.json()
    })
    : { error: 'set DAILY_POST_OPERATOR_SECRET in ~/.config/opax/insights.env to read X, Facebook and Instagram engagement' }
  return out
}
function printSocial(s) {
  console.log(`\n== Social`)
  if (s.status.error) console.log('  status: ' + s.status.error)
  else {
    const ch = Object.entries(s.status.channels ?? {}).map(([k, v]) => `${k}${v.ready ? '' : ` (${v.reason})`}`).join('  ')
    console.log(`  Today ${s.status.date}: channels ${ch}`)
    console.log(`  Today's deliveries: ${(s.status.deliveries ?? []).map(d => `${d.channel}=${d.status}`).join(' ') || 'none yet'}`)
  }
  const e = s.engagement
  if (e.error) return console.log('  engagement: ' + e.error)
  console.log(`\n  Accounts (read ${e.at}):`)
  console.log('  ' + Object.entries(e.accounts).map(([k, v]) => `${k}: ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', ')}`).join('  |  ') || '  (none)')
  console.log(`\n  Latest feed posts:`)
  console.log(table(e.posts.map(p => ({ ...p, id: p.post_id.length > 22 ? p.post_id.slice(0, 20) + '…' : p.post_id })), [col('date'), col('channel'), n('views'), n('likes'), n('comments'), n('shares'), col('id')]))
  const errors = Object.entries(e.errors ?? {})
  if (errors.length) console.log(`\n  Platform refusals: ${errors.map(([k, v]) => `${k}=${v}`).join('  ')}`)
}

// ---------------------------------------------------------------- run
const report = {}
const work = { cloudflare, posthog, community, social }
const printers = { cloudflare: printCloudflare, posthog: printPosthog, community: printCommunity, social: printSocial }
await Promise.all(sections.map(async s => { report[s] = await attempt(work[s]) }))
if (asJson) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`OPAX insights, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, last ${days} days`)
  for (const s of sections) printers[s](report[s])
  console.log('')
}
