import {ASK_EVIDENCE_RULES} from './ask-writing-rules'
import { searchCatalog, type CatalogRecord } from './catalog-search'
import { tokens } from './catalog-query.mjs'
import { payEvidence } from './ask-pay'
import type {SourceTurn} from './ask-followup'

export interface RecordQuestion {
  question?: string; kind?: string; speaker?: string; party?: string
  since?: string; until?: string; state?: string; chamber?: string; topic?: string; from?: string; to?: string
  context?: SourceTurn[]
}

// Remove question scaffolding, retaining names, industries and record IDs.
// These are retrieval hints only: the original question still goes to the model.
const QUESTION_WORDS = new Set(('who whom whose which what when where why how do does did can could would should will ' +
  'we you i they them their these those this that there here us me about say says said saying tell show find ' +
  'it its and then government awarded awards award get gets got take takes taking taken give gives gave given receive receives received receiving ' +
  'have had been being not any all most much many more some recent latest please pls also ' +
  'politician politicians company companies organisation organisations money funding fund funds donation donations ' +
  'donor donors receipt receipts contract contracts grant grants spend spending spent political party parties interest interests declared declare record records summary summaries ' +
  // Filler that survives the scaffolding strip. Left in, "How have MPs described
  // negative gearing over the years?" reached the any-term fallback as
  // "mps described negative gearing over year" and came back with 32 records
  // matched on "over", "year" and "mps" (OVER IP GROUP, Year 13 Pty Ltd, MPS
  // Macmillan); the model read them and refused over 20 on-topic passages
  // (2026-09-12).
  'over years year time times since ever long across between during before after through describe described describing discuss discussed discussing ' +
  'talk talked talking mention mentioned argue argued view views position positions stance stances change changed changes changing think thought ' +
  'often always never still already again ago mp mps senator senators minister ministers member members house senate parliament parliamentary ' +
  'federal state states australia australian').split(' ').flatMap(w => tokens(w)))

export function recordQuery(input: RecordQuestion): string {
  const subject = (text: string) => tokens(text.replace(/\b(pokies|pokie|poker machines?|casinos?|betting|wagering)\b/gi, 'gambling'))
    .filter((t: string) => !QUESTION_WORDS.has(t) && !/^\d{4}$/.test(t))
  const question = input.question || ''
  let terms: string[] = subject(question)
  // A short follow-up inherits the last user question, never model prose.
  if ((terms.length < 2 || /^(?:and|what about|how about)\b/i.test(question.trim())) && Array.isArray(input.context) && input.context.length) {
    const previous = [...input.context].reverse().find(t => (t.author === 'question' || t.author === 'user') && t.text)
    terms = [...terms, ...subject(previous?.text || '')]
  }
  if (!terms.length) terms = tokens(question).filter((t: string) => /^(donation|donor|receipt|contract|grant|expense|interest|bill)$/.test(t))
  if (!terms.length && /\bmoney|funding\b/i.test(question)) terms = ['receipt']
  return [...new Set(terms)].slice(0, 12).join(' ')
}

export const integrityQuestion = (question: string) => /\b(?:anti[- ]corruption|integrity) commission\b/i.test(question)

export interface AskRecords { records: CatalogRecord[]; coverage: string; total: number }
// Catalogue metadata is year-grained; it only narrows candidates. Exact Ask
// windows additionally require a known record date or a fully-contained span.
// This establishes record eligibility, not a bill's passage/assent date or a
// transaction date for a profile aggregate. Never recalculate a span subtotal.
function withinExactRecordWindow(record: CatalogRecord, input: RecordQuestion): boolean {
  if (!input.since && !input.until) return true
  const since = input.since || (input.from ? `${input.from}-01-01` : '')
  const until = input.until || (input.to ? `${input.to}-12-31` : '')
  const span = record.dateLabel?.match(/^(\d{4})(?:[–-](\d{4}))?$/)
  let start: string, end: string
  if (span) {
    start = `${span[1]}-01-01`
    end = `${span[2] || span[1]}-12-31`
  } else {
    const date = record.date?.match(/^\d{4}-\d{2}-\d{2}(?:$|T)/)?.[0].slice(0, 10)
    if (!date) return false
    const parsed = new Date(date)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false
    start = end = date
  }
  return start <= end && (!since || start >= since) && (!until || end <= until)
}

export async function retrieveAskRecords(input: RecordQuestion, assets: Fetcher): Promise<AskRecords> {
  const empty = { records: [], coverage: '', total: 0 }
  if ((input.kind && input.kind !== 'all') || input.chamber) return empty
  // A pay question carries its pay records whatever the word search finds: the
  // closest people by typo distance, then the scheme. They lead, and a row the
  // search finds again is not repeated.
  const pay = await payEvidence(input, assets).catch(() => [])
  const q = recordQuery(input)
  if (!q) return pay.length ? { records: pay, coverage: '', total: pay.length } : empty
  const params = new URLSearchParams({ q, kind: 'all' })
  for (const key of ['speaker', 'party', 'state', 'topic', 'from', 'to'] as const) {
    if (input[key]) params.set(key, input[key]!)
  }
  if (input.since) params.set('from', input.since.slice(0, 4))
  if (input.until) params.set('to', input.until.slice(0, 4))
  const url = new URL('https://opax.com.au/api/search-all?' + params)
  let found = await searchCatalog(url, assets, { perKind: 16 })
  // The union fallback matches any word, so only subject words may drive it:
  // a filler-only remainder attaches nothing rather than a random slice of
  // every register.
  if (!found.total) {
    const strong = tokens(q).filter((t: string) => t.length >= 4)
    if (!strong.length) return empty
    if (strong.length !== tokens(q).length) url.searchParams.set('q', strong.join(' '))
    found = await searchCatalog(url, assets, { anyTerms: true, perKind: 16 })
  }
  const records: CatalogRecord[] = [...pay]
  const counts = new Map<string, number>(pay.length ? [['pay', pay.length]] : [])
  const seen = new Set(pay.map(r => r.slug))
  for (const r of found.results) {
    if (seen.has(r.slug)) continue
    if (integrityQuestion(input.question || '') && !/\b(?:corruption|integrity|NACC)\b/i.test(r.title + ' ' + r.snippet)) continue
    if (!withinExactRecordWindow(r, input)) continue
    // Overlapping date filters do not recalculate profile/connection totals.
    // Do not hand the model an out-of-window aggregate to mistake for a subtotal.
    const span = r.dateLabel?.match(/^(\d{4})(?:[–-](\d{4}))?$/)
    if (span && ((input.from && Number(span[1]) < Number(input.from)) ||
      (input.to && Number(span[2] || span[1]) > Number(input.to)))) continue
    const cap = r.kind === 'receipt' ? 16 : r.kind === 'pay' ? 8 : 6
    if ((counts.get(r.kind) || 0) >= cap) continue
    counts.set(r.kind, (counts.get(r.kind) || 0) + 1)
    records.push(r)
    if (records.length >= 48) break
  }
  return { records, coverage: input.since || input.until
    ? `${found.coverage} Exact-window evidence is filtered from bounded catalogue candidates by known record dates or fully-contained year spans; not a complete inventory or a recalculated period subtotal.`
    : found.coverage, total: input.since || input.until ? records.length : found.total }
}

export function recordContext(records: CatalogRecord[]): string[] {
  return records.map(r => JSON.stringify({
    kind: r.kind, title: r.title, record: r.snippet.slice(0, 1800),
    period: r.dateLabel || r.date || 'Not recorded',
    ...(r.kind === 'bill' ? { date_meaning: 'Introduction date, not passage or assent date. Status is current register status, not status on this date.' } : {}),
    source: r.source,
    ...(r.speaker ? { speaker: r.speaker } : {}),
    ...((r.state || r.chamber || r.source_url) ? {state:r.state,chamber:r.chamber,source_url:r.source_url,url:r.url} : {}),
    destination: r.href, official_url: r.url, record_id: r.record_id,
  }))
}

// Verified against the live Ask API: extra_context[n] citations are keyed
// USER_CONTEXT_n. Keep that resource ID unchanged so ordinary citation ranges,
// source navigation, exports, streaming and cache replays all work together.
export function recordSources(records: CatalogRecord[], citations: Record<string, unknown>) {
  return records.map((r, i) => ({ ...r, resource: `USER_CONTEXT_${i}`,
    cited: Object.hasOwn(citations, `USER_CONTEXT_${i}`),
  }))
}

export const RECORD_GROUNDING = ASK_EVIDENCE_RULES +
  'Lead with up to four relevant financial disclosure examples from structured receipt records, each with its source, recipient, measure label, amount and stated period. Discuss relevant debate passages separately, attributed to their speakers. A donor-to-party receipt names the party organisation as recipient; name an individual recipient when the disclosure names that person. ' +
  'Keep grants, invitations, contract awards, payments, political receipts and salary entitlements as distinct measures. Grant invitations describe applications; awards describe published commitments. Preserve each snapshot and funding stage. Attribute published research findings to its author. Project electorates require an explicit source location; recipient addresses describe the recipient. Election baselines and affiliations carry their recorded dates. ' +
  'Structured extracts are OPAX descriptions. Cite their facts in your own words; literal quotations come from original source text. A pay record gives parliamentary base salary plus the loading for the office, with its dates; electorate allowances, expenses, superannuation, outside income and committee chair loadings sit outside that entitlement. Expenses are claimed costs. Use a plainly matched pay-record name and explain the spelling read from the question. ' +
  'Use one non-overlapping source measure for a total, preserving its jurisdiction and stated period. For a requested subtotal, use matching dated records. With partial evidence, give the supported figures first and one brief explanation of their scope. After an empty lookup, say which records and years were searched and where to look next. ' +
  'Bill text describes a specific version of a proposal. Describe its provisions as proposed until enactment and commencement are documented. Keep every condition with the numbered clause, section or schedule that states it; label neighbouring provisions separately. Explain the extent of an incomplete excerpt. For a bill-stage speaker, cite an original speaking turn establishing the matching bill, requested stage and date. A complete speaker list requires complete stage-and-date coverage. First-reading text and sponsors supply bill metadata; stage speakers come from explicit original speaking turns. Introduction, passage and assent each have their own dates. ' +
  'Attribute a passage to its explicitly identified speaker; a combined debate’s index label supplies retrieval scope. Give supplied dates and preserve uncertainty. Normally use up to four financial examples and three distinct debate passages, with one citation per fact. '
