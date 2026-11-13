import { claimClauses, proseClaimKeys } from './research-claims'
import { appendWrittenPoints, proseFallback, rawToolEcho, tokens, writingFacts, type WritingFact } from './research-writing'
import { readableDate } from './tools/record-common'
import { plainAnswerPayload, rewriteAnswerPayload, displayAnswerPayload } from './research-language'
import { groundAnswerPayload } from './research-grounding'
import {protectedDecision,answerDecision} from './research-coherence.mjs'
import {sentenceParts} from './research-claim-audit.mjs'
import type { Passage, QualitativeAnswer } from './research-types'
import { passagesAnswer } from './research-evidence'
import type { ResearchPayload } from './research-types'
import type { researchEvalUsage } from './research-eval'
import { inferPeriod } from './ask-period'
import { divisionVoteSource } from './research-record-answer'
import {isEvidenceGap} from './ask-evidence'
import {hearingEvidenceQuestion} from './transcript-answer'

function plannerPayload(payload: Record<string, unknown>, previous?: ResearchPayload): Record<string, unknown> {
  if (payload.research) return payload
  const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
  const research: ResearchPayload = { ...previous, mode: 'planner', rounds: previous?.rounds ?? 0, trail: previous?.trail ?? [], sources: sources.filter(s => s.cited === true).map(s => ({
    title: String(s.title ?? ''), url: String(s.href ?? s.url ?? ''), kind: String(s.kind ?? 'record'), ...(typeof s.date === 'string' ? { date: s.date } : {}), ...(typeof s.speaker === 'string' ? { speaker: s.speaker } : {}),
  })) }
  return { ...payload, research }
}

/** Marks an answer the response boundary made because nothing else could be written: the record lines a run found
 * ("Here is what the record shows") or the no-record answer. Either is what a failed run had left, never stored. */
export type AnswerFallback = 'record_summary' | 'no_record'
export const fallbackAnswer = (payload: Record<string, unknown>): boolean => payload.fallback === 'record_summary' || payload.fallback === 'no_record'

/** A stored answer replays for a week, so only an answer may be stored: never a refusal, limitation or clarification,
 * which the next ask may better, and never a boundary fallback, which a fresh run should replace. */
export const cacheableRoutedAnswer = (payload: Record<string, unknown>, requireCitation: boolean): boolean =>
  typeof payload.answer === 'string' && !!payload.answer.trim() && !protectedDecision(payload) && !fallbackAnswer(payload) && (!requireCitation || Object.keys(payload.citations ?? {}).length > 0)

/** The ordinary (knowledge-box) path's store rule: an answer with at least one cited source, not an excerpts-only
 * stand-in, a refusal (`refused`, judged by the caller) or a boundary fallback. */
export const cacheableAskAnswer = (payload: Record<string, unknown>, refused: boolean): boolean =>
  (payload.answer_status !== 'evidence_only' || payload.evidence_kind === 'original_position_proposal') && !refused && !fallbackAnswer(payload) &&
  (Array.isArray(payload.sources) ? payload.sources : []).some(s => (s as { cited?: boolean } | null)?.cited === true)

/** The retrieved records in their own words, each cited: the passage most relevant to the question first, one per
 * record. Record facts are left to the writer's checks above; only passages a reader can open are listed. */
function recordsAnswer(payload: Record<string, unknown>, question: string): Record<string, unknown> | null {
  const sources = (Array.isArray(payload.sources) ? payload.sources : []).filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
  const passages = new Map<string, Passage>()
  for (const s of sources) {
    const resource = typeof s.resource === 'string' ? s.resource : '', text = typeof s.snippet === 'string' ? s.snippet.trim() : ''
    if (!resource || /^(?:fact-|coverage|research-|USER_CONTEXT_)/i.test(resource) || s.coverage === true || text.length < 20) continue
    const id = resource + '/t/body/0'
    if (passages.has(id)) continue
    passages.set(id, { id, resource, slug: String(s.slug ?? ''), title: String(s.title ?? ''), text, url: String(s.href ?? s.url ?? ''), kind: String(s.kind ?? 'record'),
      ...(typeof s.speaker === 'string' && s.speaker.trim() ? { speaker: s.speaker } : {}), ...(typeof s.date === 'string' && s.date ? { date: s.date } : {}) })
  }
  const held = passagesAnswer(passages, question)
  if (!held?.answer.trim()) return null
  const cited = new Set(Object.keys(held.citations).map(id => id.split('/')[0]))
  return { ...payload, answer: held.answer, citations: held.citations, sources: sources.map(s => ({ ...s, cited: cited.has(String(s.resource)) })) }
}

/** Opens an answer made of the record lines a run found when nothing else could be written from them. */
export const RECORD_SUMMARY_LEAD = 'Here is what the record shows.'
type SourceRow = Record<string, unknown>
const text = (value: unknown): string => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const sourceRows = (payload: Record<string, unknown>): SourceRow[] => (Array.isArray(payload.sources) ? payload.sources : []).filter((s): s is SourceRow => !!s && typeof s === 'object')
/** One line naming a record: its title, who spoke and when, as the source row holds them. */
function recordLine(row: SourceRow): string {
  const title = text(row.title), speaker = text(row.speaker), date = text(row.date).slice(0, 10)
  if (!title) return ''
  const when = /^\d{4}(?:-\d{2}-\d{2})?$/.test(date) ? readableDate(date) : ''
  return [speaker && !title.includes(speaker) ? `${speaker}, ${title}` : title, when].filter(Boolean).join(', ')
}

/** The record lines a run found, each cited, under a plain lead: the facts research gathered, the record summaries its
 * tools returned, else the title of each record found. Used only when no answer could be written from them. */
export function recordSummaryAnswer(payload: Record<string, unknown>, facts: WritingFact[]): Record<string, unknown> | null {
  const rows = sourceRows(payload), research = payload.research as ResearchPayload | undefined
  const listed = new Set(rows.map(row => text(row.resource))), added: SourceRow[] = []
  const lines: { line: string; resource: string }[] = [], seen = new Set<string>()
  const add = (line: string, resource: string) => {
    line = text(line).replace(/^[-*•]\s*/, '')
    const key = line.toLowerCase()
    if (!resource || !/\p{L}/u.test(line) || seen.has(key) || lines.length >= 8) return
    seen.add(key); lines.push({ line, resource })
  }
  for (const fact of facts) {
    const resource = fact.source.resource
    if (fact.coverage || fact.metadata || /^USER_CONTEXT_/i.test(resource)) continue
    if (!listed.has(resource)) { listed.add(resource); added.push({ ...fact.source, snippet: fact.text }) }
    add(fact.text, resource)
  }
  for (const row of rows) {
    const resource = text(row.resource)
    if (!resource || /^(?:USER_CONTEXT_|coverage)/i.test(resource) || row.coverage === true) continue
    // A tool's record row is its own summary; a document is named by its title.
    add(/^fact-/.test(resource) && text(row.snippet) ? text(row.snippet) : recordLine(row), resource)
  }
  // Research's own finds, when the response kept no source rows (a failed loop hands its sources to the fallback).
  if (!lines.length) for (const [i, found] of (research?.sources ?? []).entries()) {
    const url = text(found?.url), resource = `research-${i + 1}`
    if (!url || !text(found?.title)) continue
    const row: SourceRow = { resource, slug: '', kind: found.kind || 'record', title: found.title, href: url, url, snippet: '', ...(found.date ? { date: found.date } : {}), ...(found.speaker ? { speaker: found.speaker } : {}) }
    added.push(row); add(recordLine(row), resource)
  }
  if (!lines.length) return null
  let answer = RECORD_SUMMARY_LEAD
  const citations: Record<string, [number, number][]> = {}
  for (const { line, resource } of lines) {
    answer += '\n- '
    const from = Array.from(answer).length
    answer += /[.!?]$/.test(line) ? line : line + '.'
    ;(citations[resource + '/t/body/0'] ??= []).push([from, Array.from(answer).length])
  }
  const cited = new Set(lines.map(l => l.resource))
  const sources = [...rows, ...added].map(row => ({ ...row, cited: cited.has(text(row.resource)) }))
  return { ...payload, answer, citations, sources, answered: true, answer_decision: 'answer', fallback: 'record_summary' satisfies AnswerFallback }
}

const SEARCHED: [RegExp, string][] = [
  [/^(?:search|person_quotes|read_passage|find_quotes|person_overview|count_speeches|speech_trend)$/, 'Hansard speeches'],
  [/^(?:money_totals|party_receipts|ranked_money|campaign_spend|entity_profile)$/, 'donation and receipt records'],
  [/^(?:paid_answer|parliamentary_pay|annual_reports|agency_reports|member_expenses)$/, 'pay and expense records'],
  [/^(?:division|member_divisions|member_votes)$/, 'recorded votes'],
  [/^(?:legislation|sponsored_bills|count_records)$/, 'bill records'],
  [/^(?:grants|contracts|public_finances)$/, 'grant and contract records'],
  [/^(?:royal_commissions|integrity_reports)$/, 'inquiry and integrity reports'],
  [/^(?:declared_interests|access_registers)$/, 'interest and access registers'],
]
/** What a run searched, in plain words, from the tools its research trail used. */
function searchedRecords(payload: Record<string, unknown>): string {
  const trail = (payload.research as ResearchPayload | undefined)?.trail ?? []
  const named = [...new Set(trail.flatMap(step => SEARCHED.filter(([tool]) => tool.test(String(step.tool))).map(([, words]) => words)))]
  const kinds = named.length ? named : ['Hansard speeches', 'OPAX’s public records']
  return kinds.length > 1 ? kinds.slice(0, -1).join(', ') + ' and ' + kinds.at(-1) : kinds[0]
}
/** The answer when a run found nothing at all: what it searched and what to ask next. No quotation of the question:
 * quotation marks the sources do not hold come off at grounding. */
export function noRecordAnswer(payload: Record<string, unknown>): Record<string, unknown> {
  const answer = `OPAX searched ${searchedRecords(payload)} and found no record that answers this question. ` +
    'Try asking again with a member, party, bill or year named, or ask about one part of the question at a time.'
  const decision = protectedDecision(payload) ? payload.answer_decision : 'limitation'
  // No line cites anything, so no source is marked cited.
  const sources = sourceRows(payload).map(row => ({ ...row, cited: false }))
  return { ...payload, answer, citations: {}, sources, answered: true, answer_decision: decision, fallback: 'no_record' satisfies AnswerFallback }
}

/** An answer written from an evidence-only payload's excerpts is an ordinary cited answer: the web shows an
 * evidence-only answer's text as a notice above the same excerpts, which would print each quote twice. */
function withoutExcerpts(payload: Record<string, unknown>): Record<string, unknown> {
  const { answer_status: _status, evidence_excerpts: _excerpts, ...rest } = payload
  return rest
}

/** One answer after another, citations shifted to the second's new place and each source listed once. */
function joinAnswers(first: Record<string, unknown>, second: Record<string, unknown>): Record<string, unknown> {
  const head = String(first.answer ?? '').trimEnd(), offset = Array.from(head).length + 2
  const citations: Record<string, [number, number][]> = { ...(first.citations as Record<string, [number, number][]> | undefined) }
  for (const [id, ranges] of Object.entries((second.citations ?? {}) as Record<string, [number, number][]>))
    citations[id] = [...(citations[id] ?? []), ...ranges.map(([a, b]) => [a + offset, b + offset] as [number, number])]
  const rows = new Map<string, SourceRow>()
  for (const [i, row] of [...sourceRows(first), ...sourceRows(second)].entries()) {
    const key = text(row.resource) || `#${i}`, prior = rows.get(key)
    rows.set(key, prior ? { ...prior, cited: prior.cited === true || row.cited === true } : row)
  }
  return { ...first, answer: head + '\n\n' + String(second.answer ?? ''), citations, sources: [...rows.values()], answered: true }
}

/** An answer with no text is written from what the response holds (old cached and streamed payloads included): the facts
 * research gathered, else the records retrieval found, in their own words and cited; else, for a response that claimed
 * an answer, one plain line on what the records could not establish; else the record lines the run found, cited, under
 * "Here is what the record shows"; else a no-record answer naming what was searched. A completed run never reaches a
 * reader with no answer text. An explicit non-answer (answered: false, including an internal partial) and an error
 * stay as sent. */
export function ensureAnswerText(payload: Record<string, unknown>, question?: string): Record<string, unknown> {
  const claimed = payload.answered === true || payload.answer_decision === 'answer'
  if (typeof payload.answer === 'string' && payload.answer.trim() || payload.answered === false && !claimed || typeof payload.error === 'string') return payload
  const research = payload.research as ResearchPayload | undefined
  const facts = writingFacts({ answer: '', citations: {}, sources: (research?.pre_writer_sources ?? []).map(s => ({ ...s, cited: true })) } as QualitativeAnswer)
  // Reuse the writer's period, scope and grounding checks. A tool fact is never model-authored fallback text.
  const write = (question: string) => {
    const period = inferPeriod(question), constraints = { ...(payload.answer_scope as import('./ask-constraints').AskConstraints | undefined), period }
    const written = proseFallback({ question, period, constraints, facts })
    const checked = groundAnswerPayload({ ...payload, ...written, answer_scope: constraints }, question)
    return typeof checked.answer === 'string' && checked.answer.trim() ? { ...checked, answered: true } : null
  }
  const open = !protectedDecision(payload)
  // A typed limitation still shows the records the run found; a refusal or a clarification does not.
  const lists = open || payload.answer_decision === 'limitation'
  // An evidence-only payload's excerpts are records the run found; they count as its sources here.
  const excerpts = (Array.isArray(payload.evidence_excerpts) ? payload.evidence_excerpts : []) as { resource?: unknown; text?: unknown }[]
  const found = excerpts.length ? { ...payload, sources: sourceRows(payload).map(row => { const hit = excerpts.find(e => e?.resource === row.resource); return hit && !text(row.snippet) ? { ...row, snippet: text(hit.text) } : row }) } : payload
  const records = () => lists ? recordsAnswer(found, question ?? '') ?? recordSummaryAnswer(found, facts) : null
  // A written limitation is followed by what the run did find, so a limit is never all a reader sees of it.
  const withRecords = (written: Record<string, unknown>) => {
    if (written.answer_decision !== 'limitation') return written
    const listed = records()
    return listed ? { ...joinAnswers(written, listed), fallback: 'record_summary' satisfies AnswerFallback } : written
  }
  if (question && open && facts.length) { const written = write(question); if (written) return withRecords(written) }
  if (open) { const listed = recordsAnswer(found, question ?? ''); if (listed) return excerpts.length ? withoutExcerpts(listed) : listed }
  if (question && open && claimed && !facts.length) { const line = write(question); if (line) return withRecords(line) }
  // Nothing could be written: show what the run found, each line cited; with nothing found, say what was searched.
  const listed = records()
  if (listed) return { ...(excerpts.length ? withoutExcerpts(listed) : listed), answered: true, ...(open ? {} : { answer_decision: payload.answer_decision }) }
  return noRecordAnswer(payload)
}

/** Add metadata only at the boundary. Existing JSON and SSE fields survive. */
export async function withPlannerResearch(response: Response, previous?: ResearchPayload): Promise<Response> {
  return mapResearchResponse(response, payload => plannerPayload(payload, previous))
}

/** A pay answer the calculator wrote (paid_answer): every figure, sentence and table row comes from the pay data with its
 *  instrument cited, so it is shown as written, as on the ordinary path, rather than re-checked as model prose. */
export const calculatedPayAnswer = (payload: Record<string, unknown>): boolean => payload.pay_answer === true && payload.answer_status === 'calculated'

/** One guard covers JSON, streamed fallbacks and cached payloads. */
export async function withAnswerLanguage(response: Response,question?:string,askedAs?:string): Promise<Response> {
  return mapResearchResponse(response, payload=>{
    payload=ensureAnswerText(payload,question)
    if(!question||calculatedPayAnswer(payload)){const out=displayAnswerPayload(ensureAnswerText(plainAnswerPayload(payload)));return askedAs?{...out,asked_as:askedAs}:out}
    const prepared=protectedDecision(payload)?payload:normaliseWrittenPayload(payload,question)
    const out=displayAnswerPayload(ensureAnswerText(normaliseCoveragePayload(groundAnswerPayload(prepared,question),question),question))
    return askedAs?{...out,asked_as:askedAs}:out
  }, true, true)
}

export async function withResearchEval(response: Response, usage: () => ReturnType<typeof researchEvalUsage> & { model?: string }): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  headers.set('x-opax-cache', 'BYPASS')
  return mapResearchResponse(new Response(response.body, { status: response.status, statusText: response.statusText, headers }), payload => {
    const augmented = plannerPayload(payload)
    return { ...augmented, research: { ...augmented.research as ResearchPayload, ...usage() } }
  })
}

async function mapResearchResponse(response: Response, augment: (payload: Record<string, unknown>) => Record<string, unknown>, validateBeforeText = false,replayUnchangedDeltas=false): Promise<Response> {
  if (!response.ok) return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) return new Response(JSON.stringify(augment(await response.json() as Record<string, unknown>)), { status: response.status, statusText: response.statusText, headers })
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  let pending = ''
  const deltas:string[]=[]
  let deltaText='',replayable=true
  const frame = (value: string,separator='\n\n') => {
    // Fallback and cache replay deltas have not passed the period check yet.
    // The validated done payload is the only answer text released on this path.
    if (validateBeforeText && /^event: delta$/m.test(value)) {
      if(replayUnchangedDeltas&&replayable){
        try {const data=JSON.parse(/^data: (.+)$/m.exec(value)?.[1]??'');if(typeof data.text!=='string')throw Error('invalid delta');deltaText+=data.text;deltas.push(value+separator)}catch{replayable=false}
        if(deltaText.length>100_000){replayable=false;deltas.length=0;deltaText=''}
      }
      return ''
    }
    if (!/^event: done$/m.test(value)) return value
    let unchanged=false
    const done=value.replace(/^data: (.+)$/m, (_line, data: string) => {
      const original=JSON.parse(data),checked=augment(original)
      unchanged=typeof original.answer==='string'&&checked.answer===original.answer&&deltaText===checked.answer
      return 'data: '+JSON.stringify(checked)
    })
    const safe=replayUnchangedDeltas&&replayable&&unchanged?deltas.join(''):''
    deltas.length=0
    deltaText=''
    return safe+done
  }
  return new Response(response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const next = frame(pending.slice(0, boundary.index),boundary[0])
        if (next) controller.enqueue(encoder.encode(next + boundary[0]))
        pending = pending.slice(boundary.index + boundary[0].length)
      }
    },
    flush(controller) { pending += decoder.decode(); if (pending) controller.enqueue(encoder.encode(frame(pending))) },
  })), { status: response.status, statusText: response.statusText, headers })
}

/** A failed loop may use ordinary RAG, but it may not substitute undated/current evidence for a dated ask. */
export async function withFallbackPeriod(response: Response, period: import('./agentic-ask').Period): Promise<Response> {
  if (!response.ok) return response
  return mapResearchResponse(response, payload => {
    payload=normaliseWrittenPayload(payload)
    if(protectedDecision(payload))return payload
    // A request for a name asserts no dated facts; keep it through ordinary fallback.
    if(/^Please (?:give the full name|name the person)/i.test(String(payload.answer??''))&&!/[\d$]/.test(String(payload.answer))&&!((payload.sources??[]) as unknown[]).length)return payload
    // No fallback/cache delta is released before both writing and period checks.
    if (rawToolEcho(String(payload.answer ?? ''))) {
      const facts=writingFacts(payload as unknown as QualitativeAnswer)
      const written=proseFallback({question:'',period,facts})
      payload={...payload,...written}
    }
    if (period.kind === 'all' || !period.since && !period.until) return payload
    const coverage = payload.coverage as { matched?: boolean; since?: string; until?: string; requested_since?: string; requested_until?: string; as_of?: string; note?: string } | undefined
    const periodCoverage=!!coverage&&['matched','since','until','requested_since','requested_until','as_of'].some(key=>Object.hasOwn(coverage,key))
    const within = (since?: string, until?: string) => !!(since || until) &&
      (!period.since || !!since && since >= period.since) && (!period.until || !!until && until <= period.until) &&
      (!period.until || !since || since <= period.until) && (!period.since || !until || until >= period.since)
    if (coverage?.matched === true && within(coverage.requested_since ?? coverage.since, coverage.requested_until ?? coverage.until) && within(coverage.since, coverage.until)) return payload
    if (payload.pay_answer && coverage?.matched === false && within(coverage.requested_since, coverage.requested_until) && !/\$[\d,]+/.test(String(payload.answer))) return payload
    const sources = Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : []
    const cited = sources.filter(s => s.cited === true)
    const outside = cited.find(s => typeof s.date === 'string' && (period.since && s.date.slice(0, 10) < period.since || period.until && s.date.slice(0, 10) > period.until))
    if (!periodCoverage && !outside && cited.length && cited.every(s => typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.date))) return payload
    const requested = `${period.since ?? 'the start of the record'} to ${period.until ?? 'the present'}`
    // A period the records may not cover is a note under the answer, never a replacement for it.
    const note = `These records may not cover ${requested}: ${outside ? `a returned source is dated ${String(outside.date).slice(0, 10)}.` : 'their dates could not be confirmed for that period.'}`
    return { ...payload, coverage: { ...coverage, requested_since: period.since ?? null, requested_until: period.until ?? null, as_of: outside?.date ?? coverage?.as_of ?? null, matched: false, note:[coverage?.note,note].filter(Boolean).join(' ') } }
  }, true)
}

type CoverageKind = 'title_search' | 'ranked_sample' | 'vote_reasons' | 'salary' | 'contracts' | 'topics' | 'receipts' | 'period' | 'selection'
function incidentalCoverage(text:string):CoverageKind|undefined {
  if(/^(?:(?:Divisions are|Those divisions were) matched (?:only )?by (?:a word|words) in (?:the division or bill title|their titles)|Title[- ]word matching can miss)/i.test(text))return 'title_search'
  if(/^(?:(?:(?:That|The) count comes from|The matching figures here are|These are) ranked matching|The selected passages are a ranked sample)/i.test(text))return 'ranked_sample'
  if(/^A recorded vote (?:is not a statement of reasons|does not establish why a member voted that way)/i.test(text))return 'vote_reasons'
  if(/^(?:(?:OPAX's |The |These )?(?:federal )?(?:pay records|salary (?:records|entitlements|figures))\b.*\b(?:exclude|not payslips|outside income)|These (?:are|figures (?:are|cover)) salary entitlements\b|(?:Allowances|Expenses|Superannuation|Outside income) (?:are|is) (?:excluded|not included))/i.test(text))return 'salary'
  if(/^(?:These (?:are|figures (?:are|represent)) (?:published )?contract values\b.*\b(?:payments|amendments)|(?:Published )?contract values\b.*\b(?:not|rather than) payments)/i.test(text))return 'contracts'
  if(/^(?:(?:Topic[- ]labelled|Topic labels|Speech records|Hansard records)\b.*\b(?:incomplete|undercount|gaps|cover|exclude)|(?:Older years|Committee[- ]hearing turns)\b.*\b(?:undercount|excluded|incomplete))/i.test(text))return 'topics'
  if(/^(?:(?:These |Disclosed )?(?:disclosed )?(?:party |federal )?(?:receipts|totals)\b.*\b(?:selection|threshold|lower bound|loans|non-gift|exhaustive|aggregation)|Disclosed party receipts can include\b|These (?:are party receipts|disclosed party receipts)\b|(?:These |The )?amounts are (?:lower bounds?|aggregated|disclosed receipts))/i.test(text))return 'receipts'
  if(/^(?:OPAX could not confirm that these records fall in the requested period|Some selected records lack verified coverage for the requested scope|The (?:requested )?period (?:is|was) (?:unconfirmed|not confirmed)|These records (?:have no|lack) verified date coverage)/i.test(text))return 'period'
}

/** Search-method notes qualify aggregate findings, not the identity or outcome of one record. */
export function normaliseCoveragePayload(payload:Record<string,unknown>,question?:string):Record<string,unknown> {
  if(typeof payload.answer!=='string'||!payload.answer.trim())return payload
  const original=payload.answer,parts=sentenceParts(original) as {text:string;at:number}[]
  const sources=(Array.isArray(payload.sources)?payload.sources:[]) as Record<string,unknown>[]
  const entries=payload.citations&&typeof payload.citations==='object'?Object.entries(payload.citations):[]
  const cp=(at:number)=>Array.from(original.slice(0,at)).length
  const kindOf=(part:{text:string;at:number}):CoverageKind|undefined=>{
    const known=incidentalCoverage(part.text)
    if(known)return known
    // A source marked as coverage still cannot turn a factual lead or a dated scope into a caveat.
    if(/[“”"]/.test(part.text))return
    if(!/\b(?:exclude[sd]?|omitted|not included|incomplete|undercount\w*|gaps?|lower bounds?|partial|not (?:an? )?(?:complete|exhaustive)|outside (?:the|this) (?:selection|coverage|series))\b/i.test(part.text))return
    const start=cp(part.at),end=cp(part.at+part.text.length)
    const cited=entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(range=>Array.isArray(range)&&range[0]<end&&range[1]>start)).map(([id])=>id)
    if(!cited.length||!cited.every(id=>/^coverage(?:[-/]|$)|^period-coverage(?:\/|$)/.test(id)||sources.some(source=>source.coverage===true&&(id===source.resource||id.startsWith(String(source.resource)+'/')))))return
    if(/salary|pay |office holders|allowances|superannuation|outside income/i.test(part.text))return 'salary'
    if(/contract|amendments|payments/i.test(part.text))return 'contracts'
    if(/speeches|speech count|Hansard|topic|committee[- ]hearing/i.test(part.text))return 'topics'
    if(/receipts|donation|loans|disclosure threshold/i.test(part.text))return 'receipts'
    return 'selection'
  }
  const classified=parts.map(part=>({...part,kind:kindOf(part)}))
  const ordinary=classified.filter(part=>!part.kind),finding=ordinary.map(part=>part.text).join(' ')
  const count='(?:\\d[\\d,]*|zero|one|two|three|four|five|six|seven|eight|nine|ten)'
  const divisionCount=new RegExp('\\b'+count+' (?:matching |recorded |selected |Senate |House |chamber )*divisions?\\b|\\bin '+count+' divisions?\\b','i').test(finding)
  const recordCount=new RegExp('\\b'+count+' (?:matching |recorded |selected |chamber |topic-labelled )*(?:records?|results?|matches|divisions?|speeches|bills?|contracts?|grants?)\\b','i').test(finding)||
    !!question&&/\b(?:how many|number of|count)\b/i.test(question)&&tokens(finding).some(value=>! /^(?:19|20)\d{2}$/.test(value))&&!/\$/.test(finding)
  const money=/\$\s*\d/.test(finding)
  const salary=money&&/salary|annual pay|a year|earned|paid/i.test(finding)
  const contracts=money&&/contract|awarded|supplier/i.test(finding)
  const topics=recordCount&&/speeches|speech count|spoke|debates?|Hansard/i.test(finding+' '+(question??''))
  const receipts=money&&/receipts?|donat\w*|received|gave|funding|donors?/i.test(finding)
  const temporal=/\b(?:19|20)\d{2}\b|\b(?:since|before|after|between|during|today|yesterday|last|current|this (?:term|year|month)|period)\b/i.test(finding+' '+(question??''))
  const reasons=!!question&&/\b(?:why|reasons?|motivat\w*)\b/i.test(question)&&/\b(?:votes?|voted|aye|noes|divisions?)\b/i.test(finding)
  const relevant=(kind:CoverageKind)=>({title_search:divisionCount,ranked_sample:recordCount,vote_reasons:reasons,salary,contracts,topics,receipts,period:temporal||recordCount,selection:recordCount||money})[kind]
  const notes:string[]=[],remove:string[]=[]
  const add=(text:string,kind=incidentalCoverage(text))=>{
    if(!kind){notes.push(text);return}
    if(!relevant(kind))return
    // Legacy combined notes also state that votes do not establish motives. Keep that part only for a reasons question.
    if(kind==='title_search'&&/recorded vote/i.test(text)){
      notes.push('Divisions are matched by words in their titles; divisions filed under other titles may be missed.')
      if(reasons)notes.push('A recorded vote does not establish why a member voted that way.')
    }else notes.push(text)
  }
  const coverage=payload.coverage&&typeof payload.coverage==='object'&&!Array.isArray(payload.coverage)?payload.coverage as Record<string,unknown>:undefined
  if(typeof coverage?.note==='string')for(const part of sentenceParts(coverage.note) as {text:string}[])add(part.text)
  // Passage-plus-list fallbacks retain explicit note sources even when their wrapper drops coverage metadata.
  for(const source of sources)if(source.coverage===true&&source.cited===false&&typeof source.snippet==='string')for(const part of sentenceParts(source.snippet) as {text:string}[]){
    let kind=incidentalCoverage(part.text)
    if(!kind&&/\b(?:not|cannot|can't|only|exclude\w*|omitted|incomplete|gaps?|lower bounds?|partial|unconfirmed|outside)\b/i.test(part.text)){
      kind=/salary|pay records|allowances|superannuation|outside income/i.test(part.text)?'salary':/contracts?|amendments/i.test(part.text)?'contracts':/topic|speeches|Hansard|committee[- ]hearing/i.test(part.text)?'topics':/receipts?|donations?|AEC|disclosure threshold/i.test(part.text)?'receipts':'selection'
    }
    if(kind)add(part.text,kind)
  }
  // A limitation is itself the answer. Its explanation must stay readable in the body.
  const limitationOnly=ordinary.length>0&&ordinary.every(part=>/^(?:I (?:cannot|can't|could not)|Please\b|(?:(?:The|These|This)\b[^.!?]*|OPAX)\b[^.!?]*\b(?:cannot|can't|do(?:es)? not establish|could not|not establish))/.test(part.text))
  if(!protectedDecision(payload)&&ordinary.length&&!limitationOnly)for(const part of classified)if(part.kind){remove.push(part.text);add(part.text,part.kind)}
  const key=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(),seen=new Set<string>(),kinds=new Set<CoverageKind>()
  const note=notes.filter(text=>{const signature=key(text),kind=incidentalCoverage(text),equivalent=kind&&['title_search','ranked_sample','vote_reasons'].includes(kind);if(!signature||seen.has(signature)||equivalent&&kinds.has(kind))return false;seen.add(signature);if(equivalent)kinds.add(kind);return true}).join(' ')
  let out=payload
  if(remove.length)out=rewriteAnswerPayload(payload,replace=>{
    for(const text of remove)replace(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'')
    replace(/^[ \t]*[-*][ \t]*(?:\n|$)/gm,'')
    replace(/[ \t]+\n/g,'\n')
    replace(/\n(?:[ \t]*\n){2,}/g,'\n\n')
    replace(/^[ \t]+|[ \t]+$/gm,'')
    replace(/^\s+|\s+$/g,'')
    replace(/[ \t]{2,}/g,' ')
  })
  if(note===coverage?.note)return out
  if(!note){
    if(!coverage||!('note'in coverage))return out
    const {note:_note,...rest}=coverage
    return {...out,coverage:rest}
  }
  return {...out,coverage:{...coverage,note}}
}

/** Keep the fallback model's prose, removing repeated claims and financial figure sets before replay. */
export function normaliseWrittenPayload(payload: Record<string, unknown>,question?:string): Record<string, unknown> {
  payload=plainAnswerPayload(normaliseCoveragePayload(payload,question))
  if (typeof payload.answer !== 'string' || !payload.answer.trim()) return payload
  if(!protectedDecision(payload)&&rawToolEcho(payload.answer)){
    const facts=writingFacts(payload as unknown as QualitativeAnswer),receiptRows=facts.filter(fact=>/^(?:Disclosed receipt|Donor):/i.test(fact.text))
    const rawFacts=receiptRows.length?facts.filter(fact=>receiptRows.includes(fact)||fact.coverage||fact.metadata):facts
    let written=proseFallback({question:question??'',period:{kind:'all',label:''},facts:rawFacts})
    const chars=Array.from(payload.answer),removed:[number,number][]=[],sources=(Array.isArray(payload.sources)?payload.sources:[]) as Record<string,unknown>[]
    const pointRanges=Object.entries((payload.citations??{}) as Record<string,unknown>).filter(([id])=>sources.some(source=>(id===source.resource||id.startsWith(String(source.resource)+'/'))&&!rawToolEcho(String(source.snippet??'')))).flatMap(([,ranges])=>Array.isArray(ranges)?ranges.filter((range):range is [number,number]=>Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)):[])
    for(const line of payload.answer.matchAll(/[^\n]+/g))if(rawToolEcho(line[0])||/^\s*\|/.test(line[0])){
      const from=Array.from(payload.answer.slice(0,line.index)).length,until=from+Array.from(line[0]).length
      let cursor=from
      // Remove the complete raw row, including trailing industry labels, while retaining separately cited prose on that line.
      for(const [a,b]of pointRanges.filter(([a,b])=>a<until&&b>from).sort((a,b)=>a[0]-b[0])){
        const start=Math.max(from,a),end=Math.min(until,b)
        if(start>cursor)removed.push([cursor,start])
        cursor=Math.max(cursor,end)
      }
      if(cursor<until)removed.push([cursor,until])
    }
    if(chars.some((char,index)=>/\S/.test(char)&&!removed.some(([from,until])=>index>=from&&index<until))){
      const points=rewriteAnswerPayload(payload,replace=>{
        for(const [from,until]of removed){const text=chars.slice(from,until).join('');if(text.trim())replace(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'')}
        replace(/^\s+|\s+$/g,'')
      })
      written=appendWrittenPoints(written,points as unknown as QualitativeAnswer)
    }
    const prior=payload.coverage&&typeof payload.coverage==='object'?payload.coverage as Record<string,unknown>:undefined
    const note=[prior?.note,written.coverage?.note].filter(value=>typeof value==='string'&&value.trim()).join(' ')
    payload=normaliseCoveragePayload({...payload,...written,...(prior||written.coverage?{coverage:{...prior,...written.coverage,...(note?{note}:{})}}:{})},question)
  }
  if(typeof payload.answer!=='string')return payload
  const original = payload.answer, cp = (n: number) => Array.from(original.slice(0,n)).length
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
  const sources=(Array.isArray(payload.sources)?payload.sources:[]) as Record<string,unknown>[]
  const claimScope=(text:string,from:number,until:number)=>{
    const ids=Object.entries((payload.citations??{}) as Record<string,unknown>).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(range=>Array.isArray(range)&&range[0]<until&&range[1]>from)).map(([id])=>id)
    const selected=sources.filter(source=>ids.some(id=>id===source.resource||id.startsWith(String(source.resource)+'/')))
    const receipt=selected.flatMap(source=>source.receipt&&typeof source.receipt==='object'?[source.receipt as Record<string,unknown>]:[]).map(receipt=>JSON.stringify(['receipt',receipt.source,receipt.party,receipt.period,receipt.jurisdiction])).sort()
    const counterparty=/\b(?:received|gave|donated)\b/i.test(text)?/\b(?:from|to)\s+(.+?)(?=\s+(?:in|during|since|for)\s+(?:19|20)\d{2}\b|[.!?;]|$)/i.exec(text)?.[1]:undefined
    const records=receipt.length?receipt:selected.map(source=>JSON.stringify([source.kind,source.title,source.slug,source.url??source.href,source.resource])).sort()
    return records.join('|')+(counterparty?'|counterparty:'+key(counterparty):'')
  }
  const seenText=new Set<string>(), seenClaims=new Set<string>()
  const kept: {text:string;from:number;until:number}[][]=[]
  let changed=false
  for(const paragraph of original.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)) {
    const text=paragraph[0], base=paragraph.index!
    if (/^(?:#{1,6}\s*)?(?:what the records? say(?:s)?|answer|overview|sources|summary)\s*:?$/i.test(text.trim())) {changed=true;continue}
    const parts:{text:string;from:number;until:number}[]=[]
    // Repeated procedural wording belongs to each complete cited division title.
    const division=divisionVoteSource({sources:sources as unknown as QualitativeAnswer['sources'],citations:(payload.citations??{}) as QualitativeAnswer['citations']},text,cp(base),cp(base+text.length))
    for(const clause of division?[{text,start:0,end:text.length}]:claimClauses(text)) {
      const connector=parts.length?/(?:,?\s+and\s+)$/.exec(text.slice(0,clause.start))?.[0]:undefined
      const sentence=(connector?'and ':'')+clause.text, scope=claimScope(clause.text,cp(base+clause.start),cp(base+clause.end)),identities=proseClaimKeys(clause.text).map(identity=>scope?identity+'|'+scope:identity),signature=key(clause.text)
      if(seenText.has(signature)||identities.length>0&&identities.every(id=>seenClaims.has(id))) {changed=true;continue}
      seenText.add(signature);identities.forEach(id=>seenClaims.add(id))
      parts.push({text:sentence,from:cp(base+clause.start-(connector?4:0)),until:cp(base+clause.end)})
    }
    if(parts.length)kept.push(parts)
  }
  if(!changed)return payload
  if(!kept.length) return {...payload,...proseFallback({question:'',period:{kind:'all',label:''},facts:writingFacts(payload as unknown as QualitativeAnswer)})}
  const originalLength=Array.from(original).length, mapping=new Map<number,number>();let answer=''
  for(const paragraph of kept) {
    if(answer)answer+='\n\n'
    for(const [index,part] of paragraph.entries()) {
      if(index)answer+=' '
      const offset=Array.from(answer).length
      for(let i=part.from;i<part.until;i++)mapping.set(i,offset+i-part.from)
      answer+=part.text
    }
  }
  const citations: Record<string,[number,number][]>={}
  const originalCitations=payload.citations && typeof payload.citations==='object' ? payload.citations as Record<string,unknown> : {}
  for(const [id,ranges] of Object.entries(originalCitations))if(Array.isArray(ranges))for(const range of ranges) {
    if(!Array.isArray(range) || !range.every(Number.isSafeInteger) || range.length!==2)continue
    let from:number|undefined,until:number|undefined
    for(let i=Math.max(0,range[0]);i<Math.min(originalLength,range[1]);i++) {
      const mapped=mapping.get(i)
      if(mapped!==undefined){from=from===undefined?mapped:Math.min(from,mapped);until=Math.max(until??0,mapped+1)}
    }
    if(from!==undefined && until!==undefined)(citations[id]??=[]).push([from,until])
  }
  const remainingSources=sources.map(s=>typeof s.resource==='string' && s.cited===true ? {...s,cited:Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}:s)
  return {...payload,answer,citations,sources:remainingSources,...(!Object.keys(citations).length?{answer_status:'uncited'}:{})}
}
