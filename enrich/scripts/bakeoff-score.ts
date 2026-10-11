import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { hash, validate, qwenAccounting } from './bakeoff-lib.ts'

const out = '/home/jake/opax-staging/federation/bakeoff/'
const read = (n: string) => JSON.parse(readFileSync(out + n, 'utf8'))
const lines = (p: string) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map(s => JSON.parse(s))
const write = (n: string, d: any) => writeFileSync(out + n, JSON.stringify(d, null, 2) + '\n', { mode: 0o600 })
const slugs = new Set(read('units-200.json').map((u: any) => u.slug))
const units = lines('/home/jake/opax-staging/federation/kb-gap/pilot-2000.jsonl').filter(u => slugs.has(u.slug)).sort((a, b) => a.slug.localeCompare(b.slug))
// The backfill lane owns this recogniser. A staging snapshot fixes the exact code and roster.
const manifest = read('guard-snapshot/manifest.json')
for (const [file, digest] of Object.entries(manifest)) if (hash(readFileSync(out + 'guard-snapshot/' + file, 'utf8')) !== digest) throw Error('guard snapshot checksum mismatch')
const { hasNewPersonalName } = await import(pathToFileURL(out + 'guard-snapshot/validate.ts').href)
function fullText(u: any): string { return Object.values(u.texts).map((v: any) => v.body ?? v.value?.body ?? '').sort((a, b) => b.length - a.length)[0] ?? '' }
function audit() {
  const all: any = {}
  for (const [side, file] of [['haiku', 'haiku-200.jsonl'], ['qwen3', 'qwen3-200.jsonl']]) {
    const rows = lines(out + file), bySlug = new Map(rows.map(r => [r.slug, r]))
    if (bySlug.size !== 200 || units.some(u => !bySlug.has(u.slug))) throw Error('missing or duplicate output slug')
    const scores = units.map(unit => {
      const r = bySlug.get(unit.slug), v = validate(r, unit)
      return { slug: unit.slug, valid: v.valid, raw_valid: !r.error && !r.refusal && !v.rawSummaryProblems.length && !v.topicProblems.length, summary_problems: v.summaryProblems, topic_problems: v.topicProblems, new_name: hasNewPersonalName(v.summary ?? '', fullText(unit)), refusal: Boolean(r.refusal || r.stop_reason === 'refusal'), empty: !String(r.summary ?? '').trim(), error: r.error ?? null, topics: v.topics, chars: String(r.summary ?? '').length }
    })
    write(`${side}-validator-details.json`, scores)
    all[side] = { units: scores.length, validator_pass: scores.filter(s => s.valid).length, raw_validator_pass: scores.filter(s => s.raw_valid).length, new_name_hits: scores.filter(s => s.new_name).length, refusals: scores.filter(s => s.refusal).length, empty: scores.filter(s => s.empty).length, errors: scores.filter(s => s.error).length }
    if (side === 'qwen3' && !rows.every(r => Object.hasOwn(r, 'refusal') || Object.hasOwn(r, 'stop_reason'))) all[side].refusals = null
    if (side === 'qwen3' && !rows.every(r => Object.hasOwn(r, 'error'))) all[side].errors = null
  }
  write('validator-metrics.json', all); console.log(JSON.stringify(all))
}
function score() {
  const pairs = read('blind-pairs.json'), key = new Map(read('blind-key.json').map((k: any) => [k.id, k])), raw = lines(out + 'judge-results.jsonl')
  const byId = new Map(raw.map(r => [r.custom_id, r]))
  const scores: any[] = []
  for (const pair of pairs) {
    const row = byId.get(pair.id)
    if (!row || row.result?.type !== 'succeeded' || row.result.message.stop_reason !== 'end_turn') throw Error(`incomplete judge result ${pair.id}`)
    const result = JSON.parse(row.result.message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(''))
    for (const position of ['A', 'B']) {
      const verdict = result[position], topics = pair[position].topics
      if (!Array.isArray(verdict.topics) || verdict.topics.length !== topics.length || new Set(verdict.topics.map((t: any) => t.slug)).size !== topics.length || topics.some((t: string) => !verdict.topics.some((v: any) => v.slug === t)) || !Number.isInteger(verdict.summary_errors) || verdict.summary_errors < 0) throw Error(`invalid judge coverage ${pair.id}`)
      // Never retain the judge's free-text reason in the report: numeric properties only.
      scores.push({ id: pair.id, slug: pair.slug, position, side: (key.get(pair.id) as any)[position], topic_count: topics.length, supported_topics: verdict.topics.filter((t: any) => t.supported === true).length, topics_all_supported: verdict.topics.every((t: any) => t.supported === true), summary_errors: verdict.summary_errors })
    }
  }
  write('judge-numeric-details.json', scores)
  const metrics = read('validator-metrics.json')
  for (const side of ['haiku', 'qwen3']) {
    const s = scores.filter(s => s.side === side)
    Object.assign(metrics[side], { supported_topics: s.reduce((n, x) => n + x.supported_topics, 0), total_topics: s.reduce((n, x) => n + x.topic_count, 0), units_all_topics_supported: s.filter(x => x.topics_all_supported).length, summary_error_units: s.filter(x => x.summary_errors > 0).length, summary_errors: s.reduce((n, x) => n + x.summary_errors, 0) })
    const nonempty = s.filter(x => pairs.find((p: any) => p.id === x.id)[x.position].summary.trim())
    metrics[side].nonempty_summaries = nonempty.length
    metrics[side].nonempty_summary_error_units = nonempty.filter(x => x.summary_errors > 0).length
  }
  const nameReview = read('name-guard-reviewed.json'), nameFlags = read('name-guard-blind-flags.json')
  const expectedFlags = nameFlags.flatMap((f: any) => ['A', 'B'].filter(p => f[p]).map(position => `${f.id}:${position}`))
  if (nameReview.length !== expectedFlags.length || new Set(nameReview.map((r: any) => `${r.id}:${r.position}`)).size !== expectedFlags.length || expectedFlags.some((f: string) => !nameReview.some((r: any) => `${r.id}:${r.position}` === f)) || nameReview.some((r: any) => typeof r.personal_name_hit !== 'boolean')) throw Error('require blind review of every name-guard flag')
  for (const side of ['haiku', 'qwen3']) metrics[side].confirmed_new_personal_names = nameReview.filter((r: any) => (key.get(r.id) as any)[r.position] === side && r.personal_name_hit).length
  const manual = read('spotcheck-verdicts.json')
  const spots = read('spotcheck-30.json')
  if (manual.length !== 30 || new Set(manual.map((s: any) => s.id)).size !== 30 || spots.some((s: any) => !manual.some((m: any) => m.id === s.id))) throw Error('require independent review of all 30 selected pairs')
  let topicAgreement = 0, summaryAgreement = 0, exactErrorAgreement = 0
  for (const m of manual) for (const position of ['A', 'B']) {
    const s = scores.find(s => s.id === m.id && s.position === position)
    if (typeof m[position]?.topics_all_supported !== 'boolean' || !Number.isInteger(m[position]?.summary_errors) || m[position].summary_errors < 0) throw Error('invalid manual verdict')
    topicAgreement += Number(s.topics_all_supported === m[position].topics_all_supported)
    summaryAgreement += Number((s.summary_errors === 0) === (m[position].summary_errors === 0))
    exactErrorAgreement += Number(s.summary_errors === m[position].summary_errors)
  }
  metrics.spotcheck = { pairs: 30, candidates: 60, topic_support_agreement: topicAgreement, summary_clean_agreement: summaryAgreement, summary_error_count_agreement: exactErrorAgreement }
  const qwen = lines(out + 'qwen3-200.jsonl')
  Object.assign(metrics.qwen3, qwenAccounting(qwen, existsSync(out + 'qwen3-meta.json') ? read('qwen3-meta.json') : undefined))
  metrics.haiku.cost_usd = read(existsSync(out + 'haiku-total-usage.json') ? 'haiku-total-usage.json' : 'haiku-usage.json').cost_usd
  metrics.haiku.first_pass = read('haiku-early-audit.json').metrics
  for (const side of ['haiku', 'qwen3']) metrics[side].cost_per_1000_usd = metrics[side].cost_usd * 5
  metrics.cohort_spend_usd = metrics.haiku.cost_usd + metrics.qwen3.cost_usd + read('judge-usage.json').cost_usd + read('donation-usage.json').cost_usd
  metrics.total_spend_usd = metrics.haiku.cost_usd + metrics.qwen3.run_cost_usd + read('judge-usage.json').cost_usd + read('donation-usage.json').cost_usd
  metrics.model = 'claude-haiku-5-5'
  write('metrics.json', metrics); console.log(JSON.stringify(metrics))
}
if (process.argv[2] === 'audit') audit()
else if (process.argv[2] === 'score') score()
else throw Error('usage: bakeoff-score.ts audit|score')
