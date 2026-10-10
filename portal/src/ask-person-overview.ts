import { FOOTNOTE_INSTRUCTIONS, evidenceExcerpt } from './ask-evidence'
import { positionEvidence, firstSpeechTurn } from './position-evidence'
import { TOPIC_NAMES } from './topic-names.mjs'
import type { CatalogRecord } from './catalog-search'
import type { RecordQuestion, AskRecords } from './ask-records'
import { AskDeadline } from './ask-deadline'

const fold = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The roster-loading gate and subject parser use the very same grammar. */
function overviewCandidate(question: string): string | undefined {
  const q = fold(question).replace(/[?!.]+$/, '')
  const n = '(.{3,80}?)'
  const patterns = [
      `^what (?:has|did) (?:senator |mp |dr |mr |ms )?${n} (?:said|say|spoken about|talked about)(?: in (?:the )?parliament| over (?:the years|time))?$`,
      `^what does ${n} (?:talk|speak) about(?: in (?:the )?parliament)?$`,
      `^(?:summari[sz]e|give me|show me) ${n}'s (?:speeches|views|parliamentary record)$`,
      `^(?:give me |show me |summarise |summarize )?(?:an? )?(?:overview|summary) of ${n}(?:'s (?:speeches|views|parliamentary record))?$`,
      `^what (?:topics|themes) (?:does|did|has) ${n} (?:discuss|discussed|speak about|talk about|spoken about)$`,
      `^(?:what (?:are|were) )?${n}'s (?:views|positions|speeches)(?: in (?:the )?parliament)?$`,
  ]
  for (const pattern of patterns) {
    const match = new RegExp(pattern).exec(q)
    if (match) return match[1]
  }
}
export const isPersonOverviewCandidate = (question: string): boolean => !!overviewCandidate(question)

/** Whole-person requests only; exact public roster names resolve the subject. */
export function overviewSubject(question: string, people: readonly { name: string }[]): string | undefined {
  const name = overviewCandidate(question)
  if (!name) return undefined
  const matches = [...new Set(people.filter(p => fold(p.name) === name).map(p => p.name))]
  return matches.length === 1 ? matches[0] : undefined
}

export function isPersonOverviewIntent(input: RecordQuestion): boolean {
  return !!input.speaker && (!input.kind || ['speech', 'all'].includes(input.kind)) &&
    !input.topic && !input.from && !input.to && overviewSubject(input.question || '', [{ name: input.speaker }]) === input.speaker
}

export function isPersonRecentIntent(input: RecordQuestion): boolean {
  if (!input.speaker || input.topic || input.from || input.to || (input.kind && !['speech','all'].includes(input.kind))) return false
  return new RegExp(`^what did ${escape(fold(input.speaker))} say in (?:their |the )?(?:most recent|latest) parliamentary speech[?.!]*$`).test(fold(input.question || ''))
}

export const isPersonRecentCandidate = (question: string): boolean => /^what did .{3,80} say in (?:their |the )?(?:most recent|latest) parliamentary speech[?.!]*$/.test(fold(question))

export type OverviewSpeech = {
  slug: string; resource?: string; title: string; speaker: string; date: string;
  topics: string[]; state?: string; chamber?: string; url?: string; snippet?: string
}
export type OverviewTheme = { slug: string; name: string; count: number; recent_count: number | null }
export type PersonContext = {
  name: string; party: string | null; electorate: string; speeches: number;
  topics: OverviewTheme[]; recent_from: string; as_of: string; complete: boolean;
  enumeration_complete?: boolean; dates_complete?: boolean; classifications_complete?: boolean;
  profile: string; votes: string; interests: string; peer?: { name: string; theme: string }
}
export type OverviewPack = { records: AskRecords; context: PersonContext }
export type OverviewDependencies = {
  catalogue: (page: number, signal: AbortSignal) => Promise<{ total: number; counts: Record<string, number>; speeches: OverviewSpeech[] }>;
  find: (theme: string, signal: AbortSignal) => Promise<OverviewSpeech[]>;
  original: (speech: OverviewSpeech, theme: string, signal: AbortSignal) => Promise<string | null>;
  bills: (signal: AbortSignal) => Promise<{ key: string; title: string; introduced: string; sponsor?: string; speech_dates?: string[] }[]>;
  peer: (theme: string, signal: AbortSignal) => Promise<string | undefined>;
  safe: (...values: string[]) => boolean;
  belongs: (speech: OverviewSpeech) => boolean;
}

export const OVERVIEW_RETRIEVAL_MS = 4_000
export const OVERVIEW_CALL_MS = 1_200
export const OVERVIEW_FIRST_ANSWER_MS = 20_000
export const OVERVIEW_VERIFICATION_MS = 2_000
export const OVERVIEW_CAPS = { pages: 10, page_size: 200, parallel: 5, themes: 5, per_theme: 2, recent: 2, bills: 2, chars: 24000 }
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s
const topThemes = (counts: Record<string, number>) => Object.entries(counts).filter(([slug,count]) => TOPIC_NAMES[slug] && count > 0)
  .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, OVERVIEW_CAPS.themes)

/** Catalogue totals are whole-record facets, never a nearest-chunk count.
 * Dates come from speech metadata, never catalogue created/index time. */
export async function buildPersonOverview(
  person: { name: string; party?: string | null; party_now?: string; representation?: { electorate: string }[] },
  asOf: string, profile: string, deps: OverviewDependencies, scoped = false, parent?: AbortSignal | AskDeadline,
): Promise<OverviewPack> {
  const deadline = parent instanceof AskDeadline ? parent : new AskDeadline(OVERVIEW_RETRIEVAL_MS, parent)
  const call = <T>(work: (signal: AbortSignal) => Promise<T>) => deadline.run(work, OVERVIEW_CALL_MS)
  const parallel = async (tasks: (() => Promise<void>)[]) => {
    let next = 0
    await Promise.all(Array.from({length:Math.min(OVERVIEW_CAPS.parallel,tasks.length)}, async () => {
      while (next < tasks.length) { deadline.signal.throwIfAborted(); await tasks[next++]() }
    }))
  }
  try {
    if (!validDate(asOf)) throw new Error('Invalid corpus snapshot date')
    const [first,bills] = await Promise.all([call(signal=>deps.catalogue(0,signal)),call(signal=>deps.bills(signal))])
    const rows = [...first.speeches]
    const pages = Math.min(OVERVIEW_CAPS.pages, Math.ceil(first.total / OVERVIEW_CAPS.page_size))
    const foundByTheme = new Map<string,OverviewSpeech[]>()
    let peer: string | undefined
    const themeTasks = (themes: [string,number][]) => [
      ...themes.map(([slug]) => async () => { foundByTheme.set(slug,await call(signal=>deps.find(slug,signal))) }),
      ...(themes[0] ? [async () => { peer = await call(signal=>deps.peer(themes[0][0],signal)) }] : []),
    ]
    await parallel([
      ...Array.from({length:Math.max(0,pages-1)},(_,i)=>async()=>{ rows.push(...(await call(signal=>deps.catalogue(i+1,signal))).speeches) }),
      ...(!scoped ? themeTasks(topThemes(first.counts)) : []),
    ])
    const enumerationComplete = new Set(rows.map(s=>s.slug)).size === first.total
    const datesComplete = rows.every(s=>validDate(s.date))
    const classificationsComplete = rows.every(s=>s.topics.length > 0 && s.topics.every(slug=>!!TOPIC_NAMES[slug]))
    const complete = enumerationComplete && datesComplete && classificationsComplete
    const speeches = [...new Map(rows.filter(s => deps.belongs(s)).map(s => [s.slug, s])).values()]
    const date = new Date(asOf + 'T00:00:00Z')
    date.setUTCFullYear(date.getUTCFullYear() - 1)
    const recentFrom = date.toISOString().slice(0, 10)
    const counts = scoped ? Object.fromEntries(Object.keys(TOPIC_NAMES).map(slug => [slug, speeches.filter(s => s.topics.includes(slug)).length])) : first.counts
    // A split identity with incomplete enumeration has no reliable denominator.
    if (scoped && !complete) throw new Error('Scoped speech catalogue metadata incomplete')
    if (scoped) await parallel(themeTasks(topThemes(counts)))
    const topics = topThemes(counts)
      .map(([slug,count]) => ({ slug, name: TOPIC_NAMES[slug], count,
        recent_count: complete ? speeches.filter(s => s.topics.includes(slug) && s.date >= recentFrom && s.date <= asOf).length : null }))
    const context: PersonContext = { name: person.name, party: person.party_now || person.party || null,
      electorate: [...new Set((person.representation || []).map(r => r.electorate))].join(', '),
      speeches: scoped ? speeches.length : first.total, topics, recent_from: recentFrom, as_of: asOf, complete,
      enumeration_complete:enumerationComplete,dates_complete:datesComplete,classifications_complete:classificationsComplete,
      profile, votes: profile + '#subject-votes', interests: '/declared?' + new URLSearchParams({person: person.name}) }
    const records: CatalogRecord[] = []
    let chars = 0
    const add = (record: CatalogRecord) => {
      if (!deps.safe(record.title, record.snippet) || chars + record.snippet.length > OVERVIEW_CAPS.chars) return
      if (records.some(r => r.slug === record.slug)) return
      records.push(record); chars += record.snippet.length
    }
    add({ kind: 'person', title: person.name + ' — speech topic counts', href: profile,
      resource: '', slug: 'person-overview-counts', source: 'OPAX speech catalogue · topic labels', date: asOf,
      snippet: JSON.stringify({ name: person.name, speeches: context.speeches, as_of: asOf, recent_from: recentFrom,
        recent_to: asOf, topics, complete, enumeration_complete:enumerationComplete,dates_complete:datesComplete,classifications_complete:classificationsComplete,
        coverage: 'Indexed speeches, not a count of all parliamentary appearances. Speeches can carry multiple topic labels; topic counts overlap. Labels describe subjects, not positions. Recent counts and latest speeches require full enumeration and valid dates and topic classifications for every speech.' }) })
    const recent = complete ? speeches.filter(s => s.date && s.date <= asOf && deps.safe(s.title))
      .sort((a,b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug)).slice(0, OVERVIEW_CAPS.recent) : []
    const candidates = new Map<string,{speech:OverviewSpeech;theme:string}>()
    for (const theme of topics) for (const speech of (foundByTheme.get(theme.slug) || []).filter(s=>deps.belongs(s) && deps.safe(s.title)).slice(0,OVERVIEW_CAPS.per_theme)) {
      candidates.set(speech.slug,{speech,theme:theme.name})
    }
    for (const speech of recent) if (!candidates.has(speech.slug)) candidates.set(speech.slug,{speech,theme:''})
    const originals = new Map<string,string | null>()
    await parallel([...candidates.values()].map(({speech,theme})=>async()=>{
      const original = await call(signal=>deps.original(speech,theme,signal))
      originals.set(speech.slug,original ? firstSpeechTurn(original) : null)
    }))
    for (const theme of topics) {
      const found = (foundByTheme.get(theme.slug) || []).filter(s => deps.belongs(s) && deps.safe(s.title)).slice(0, OVERVIEW_CAPS.per_theme)
      for (const speech of found) {
        const original = originals.get(speech.slug)
        if (!original || !deps.safe(original)) continue
        const evidence = positionEvidence(original, theme.name)
        if (!evidence) continue
        add({ kind: 'speech', title: speech.title, href: '/doc/' + speech.slug, slug: speech.slug,
          resource: '', source: 'Hansard · verified speaking turn', date: speech.date, url: speech.url,
          snippet: `${person.name}, ${speech.date}. Topic label: ${theme.name}.\n` + evidenceExcerpt(evidence, theme.name, 1500, true).text })
      }
    }
    for (const speech of recent) {
      const original = originals.get(speech.slug)
      if (!original || !deps.safe(original)) continue
      const existing = records.find(r=>r.slug === speech.slug)
      if (existing) { existing.source = 'Hansard · recent speech'; continue }
      add({ kind: 'speech', title: speech.title, href: '/doc/' + speech.slug, slug: speech.slug, resource: '',
        source: 'Hansard · recent speech', date: speech.date, url: speech.url,
        snippet: `${person.name}, ${speech.date}. Recent speech in the complete catalogue.\n` + evidenceExcerpt(original, speech.title, 1500, true).text })
    }
    const billDate = (b: {introduced:string;speech_dates?:string[]}) => (b.speech_dates || []).filter(date=>date<=asOf).sort().at(-1) || b.introduced
    for (const bill of bills.filter(b => (fold(b.sponsor || '') === fold(person.name) || b.speech_dates?.some(date=>date<=asOf)) && billDate(b) && billDate(b) <= asOf && deps.safe(b.title))
      .sort((a,b) => billDate(b).localeCompare(billDate(a))).slice(0, OVERVIEW_CAPS.bills)) {
      add({kind:'bill',title:bill.title,href:'/bill/'+bill.key,slug:'bill-'+bill.key,resource:'',source:'Parliamentary bill register',date:bill.introduced,
        snippet:JSON.stringify({title:bill.title,sponsor:bill.sponsor,introduced:bill.introduced,speaker:person.name,speech_dates:(bill.speech_dates || []).filter(date=>date<=asOf).slice(0,3),date_meaning:'Introduced is the introduction date, not passage or assent. Speech dates are linked Hansard appearances. Neither establishes a vote.'})})
    }
    if (peer && topics[0] && deps.safe(peer)) context.peer = {name:peer,theme:topics[0].name}
    return {context,records:{records,coverage:'Whole-record topic facets; recent speech dates from catalogue metadata. Verbatim evidence retrieved separately by theme. No votes inferred from speeches.',total:records.length}}
  } catch (error) { deadline.cancel(); throw error }
  finally { if (!(parent instanceof AskDeadline)) deadline.dispose() }
}

export const OVERVIEW_INSTRUCTIONS =
  'This is a person-overview intent. Use the aggregate evidence pack to write about 300 words: first a short prose overview of the top 3–5 themes grounded in the whole-record counts and recent counts, then notable recent speeches and bills with exact dates, then one or two short verbatim quotes from verified speaking turns. Cite EVERY factual sentence, count, date and quotation. Counts are overlapping topic labels, not evidence of a stance; establish views only from the pack’s verified original speaking turns, in past tense, with attribution. The ordinary ranked retrieval is background, never authority to attribute another speaking turn to this person. Do not editorialise about the person or infer views from their party. Distinguish speech dates from bill introduction dates; a speech on a bill does not establish sponsorship or a vote. If fewer themes or quotations are supported, use only those; never fill a gap. When complete is false, omit rolling-year counts and latest-speech claims and explain the metadata limitation. Do not turn null recent counts into zero. ' + FOOTNOTE_INSTRUCTIONS
