import type { RecordQuestion } from './ask-records'
import type { CatalogRecord } from './catalog-search'
import { payPersonRecord, payGeneralRecords } from './pay-records.mjs'

/**
 * "Who is the highest paid politician?" has an answer, and it is not in any
 * speech: a salary is the parliamentary base salary plus the loading of the
 * office held, both set by the Remuneration Tribunal. /pay.json
 * (scripts/build_pay.py) joins those instruments to the Parliamentary
 * Handbook's record of who held which post when, and this module answers from
 * it without a model, the way ask-money.ts answers from receipt edges.
 *
 * Every figure is an entitlement read off an instrument, never a payslip, and
 * the answer says so each time.
 */

type Spell = [from: string, to: string | null, post: string, pct: number, salary: number, assumed?: number]
interface PayPerson {
  name: string; pid: string | null; party: string | null; chamber: string | null
  from: string; to: string | null; sitting: boolean
  now: { post: string; pct: number; salary: number; since: string; assumed?: boolean } | null
  peak: { post: string; pct: number; salary: number; year: number }
  total: number; spells: Spell[]; by_year: [number, number][]
}
interface PayRow { id: string; name: string; party: string | null; chamber: string | null; post: string; pct: number; salary: number; assumed?: boolean }
export interface PayData {
  meta: {
    as_of: string; from: string; generated: string
    sources: { id: string; title: string; url: string; publisher: string }[]
    not_covered: { id: string; text: string }[]
    electorate_allowance?: { min: number; max: number }
  }
  base: { from: string; amount: number; source: string; url?: string }[]
  offices: Record<string, { label: string; kind: string; pct: number }>
  current: PayRow[]
  names: Record<string, string>
  people: Record<string, PayPerson>
}

const PAY_WORDS = /\b(?:paid|pay|salar(?:y|ies)|earn(?:s|ed|ing|ings)?|remuneration|wages?|pay\s?packets?|makes?)\b/i
const RANKING = /\b(?:highest|best|top|most|lowest|least)[- ]?(?:paid|paying|earning)\b|\b(?:highest|biggest|largest|top|lowest|smallest)\s+(?:salar(?:y|ies)|earners?|pay(?:\s?packets?)?|wages?)\b|\b(?:paid|earns?|earning|makes?)\s+(?:the\s+)?(?:most|least|highest|lowest)\b|\bwho\s+(?:is|are|gets?)\s+paid\s+(?:the\s+)?(?:most|least)\b/i
const COMPARED = /\b(?:paid|earns?|earning|makes?|gets?)\s+(?:paid\s+)?more\b|\bbigger\s+salary\b|\bhigher\s+(?:salary|pay)\b/i
const LOWEST = /\b(?:lowest|least|smallest)\b/i
const AMOUNT = /\bhow\s+much\b.*\b(?:paid|earn\w*|makes?|made|gets?|salar(?:y|ies)|pay|on)\b|\bwhat(?:['’]s|\s+is|\s+was|\s+are|\s+were|\s+does|\s+do|\s+did)?\b.*\b(?:salar(?:y|ies)|pay|remuneration|wages?|paid|earn\w*)\b|\bsalar(?:y|ies)\s+(?:of|for)\b|\b(?:salary|pay)\s+(?:history|over\s+time)\b/i
const WHO = /\b(?:politicians?|parliamentarians?|MPs?|members?\s+of\s+parliament|senators?|ministers?|prime\s+minister|PM|treasurer|backbenchers?|frontbenchers?|speaker|opposition\s+leader|leader\s+of\s+the\s+opposition|whips?|shadow\s+(?:ministers?|cabinet)|cabinet|pollies)\b/i
// Pay words that are about somebody else's pay, or about what was said of it.
const NOT_THEIR_PAY = /\b(?:say|said|says|speech(?:es)?|spoke|debate[ds]?|vot(?:e|ed|es|ing)|donat\w*|donors?|grants?|contracts?|workers?|nurses?|teachers?|CEOs?|executives?|public\s+servants?|staff(?:ers)?|minimum\s+wage|award\s+wages?|gender\s+pay|pay\s+gap|wage\s+(?:growth|theft|price)|real\s+wages|pay\s+rise\s+for|childcare|aged[- ]care)\b/i

const PARTIES: { label: string; pattern: RegExp; members: string[] }[] = [
  { label: 'Labor', pattern: /\b(?:Labor|ALP)\b/i, members: ['Labor'] },
  { label: 'Liberal', pattern: /\bLiberals?\b/i, members: ['Liberal'] },
  { label: 'Coalition', pattern: /\bCoalition\b/i, members: ['Liberal', 'Nationals', 'LNP', 'Country Liberal Party'] },
  { label: 'Nationals', pattern: /\bNationals?\b/i, members: ['Nationals'] },
  { label: 'Greens', pattern: /\bGreens\b/i, members: ['Greens'] },
  { label: 'One Nation', pattern: /\bOne\s+Nation\b/i, members: ['One Nation'] },
  { label: 'Independent', pattern: /\b(?:independents?|crossbench(?:ers?)?|teals?)\b/i, members: ['Independent'] },
]

// A post a reader might ask the price of, and the office id that prices it.
const POSTS: { pattern: RegExp; office: string | null; label: string }[] = [
  { pattern: /\bdeputy\s+prime\s+minister\b|\bdeputy\s+PM\b/i, office: 'dpm', label: 'Deputy Prime Minister' },
  // "PM" stays case-sensitive: "pm" is a time of day.
  { pattern: /\b[Pp]rime\s+[Mm]inister\b|\bPM\b/, office: 'pm', label: 'Prime Minister' },
  { pattern: /\bdeputy\s+(?:opposition\s+leader|leader\s+of\s+the\s+opposition)\b/i, office: 'deputy_loto', label: 'Deputy Leader of the Opposition' },
  { pattern: /\bopposition\s+leader\b|\bleader\s+of\s+the\s+opposition\b/i, office: 'loto', label: 'Leader of the Opposition' },
  { pattern: /\btreasurer\b/i, office: 'treasurer', label: 'Treasurer' },
  { pattern: /\bshadow\s+cabinet\b/i, office: 'shadow_cabinet', label: 'shadow cabinet minister' },
  { pattern: /\bshadow\s+ministers?\b/i, office: 'shadow_minister', label: 'shadow minister' },
  { pattern: /\bcabinet\s+ministers?\b|\bcabinet\b/i, office: 'cabinet', label: 'Cabinet minister' },
  { pattern: /\bassistant\s+ministers?\b|\bparliamentary\s+secretar(?:y|ies)\b/i, office: 'parlsec', label: 'assistant minister' },
  { pattern: /\bministers?\b/i, office: 'minister', label: 'minister outside Cabinet' },
  { pattern: /\bspeaker\b/i, office: 'speaker', label: 'Speaker of the House of Representatives' },
  { pattern: /\bpresident\s+of\s+the\s+senate\b|\bsenate\s+president\b/i, office: 'president', label: 'President of the Senate' },
  { pattern: /\bbackbenchers?\b|\bpoliticians?\b|\bparliamentarians?\b|\bMPs?\b|\bmembers?\s+of\s+parliament\b|\bsenators?\b|\bpollies\b|\bbase\s+salary\b/i, office: null, label: 'parliamentarian' },
]

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
const plain = (s: string) => s.replace(/[|\n\r\[\]*]/g, ' ').replace(/\s+/g, ' ').trim()
/** A date for a table cell: short, and never broken across lines. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayShort = (iso: string) => { const [y, m, d] = iso.split('-'); return `${Number(d)}\u00a0${MONTHS[Number(m) - 1]}\u00a0${y}` }
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
/** A post as it reads after "as": the backbench labels are common nouns. */
const asPost = (post: string) => post === 'Senator' ? 'a senator' : post === 'Member of Parliament' ? 'a member of parliament' : plain(post)
const loading = (pct: number) => pct ? `${pct}%` : 'none'
const financialYear = (start: number) => `${start}–${String(start + 1).slice(2)}`
/** Must fold exactly as scripts/build_pay.py does: pay.json's names are keyed by it. */
const fold = (s: string) => s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim()
const personHref = (name: string) => `/subject/person/${encodeURIComponent(name)}#person-pay`

/** Pay is in the question, and it is a parliamentarian's: what the record search
 *  should carry pay evidence for, whether or not a calculated answer follows. */
export function mentionsPay(question: string | undefined): boolean {
  return PAY_WORDS.test(question || '') && !NOT_THEIR_PAY.test(question || '')
}

/** A cheap gate on the words alone; the data decides the rest. */
export function isPayQuestion(input: RecordQuestion): boolean {
  const q = input.question || ''
  if (input.kind && input.kind !== 'all' || input.speaker || input.topic) return false
  return PAY_WORDS.test(q) && (RANKING.test(q) || AMOUNT.test(q) || COMPARED.test(q)) && !NOT_THEIR_PAY.test(q)
}

function peopleNamed(question: string, data: PayData): PayPerson[] {
  const q = ` ${fold(question.replace(/['’]s\b/g, ''))} `
  const hits = new Map<string, number>()
  for (const [name, id] of Object.entries(data.names)) {
    if (name.includes(' ') && q.includes(` ${name} `)) hits.set(id, Math.max(hits.get(id) || 0, name.length))
  }
  if (!hits.size) {
    // A lone surname, capitalised mid-sentence, that one sitting member answers to.
    for (const word of question.match(/(?<=\S\s)[A-Z][\p{L}'’-]{2,}/gu) || []) {
      const holders = data.current.filter(row => fold(row.name).split(' ').at(-1) === fold(word))
      if (holders.length === 1) hits.set(holders[0].id, word.length)
    }
  }
  return [...hits.keys()].map(id => data.people[id]).filter(Boolean)
}

type Source = { resource: string; title: string; href: string; url: string; kind: string; snippet: string; cited: boolean; source?: string; dateLabel?: string; date?: string }

function answerBuilder(data: PayData) {
  let answer = ''
  const citations: Record<string, number[][]> = {}
  const sources: Source[] = []
  const cite = (title: string, href: string, snippet: string, source: string, offset = 0) => {
    const end = Array.from(answer).length - offset
    // One instrument can stand behind two sentences; it is still one source.
    const again = sources.find(row => row.href === href)
    if (again) { citations[again.resource].push([end - 1, end]); return }
    const resource = `pay-${sources.length}`
    citations[resource] = [[end - 1, end]]
    sources.push({ resource, title, href, url: href, kind: 'pay', snippet: plain(snippet), cited: true, source, dateLabel: `As at ${day(data.meta.as_of)}`, date: data.meta.as_of })
  }
  const instrument = (id: string, snippet: string, offset = 0) => {
    const s = data.meta.sources.find(row => row.id === id)
    if (s) cite(s.title, s.url, snippet, s.publisher, offset)
  }
  return { add: (text: string) => { answer += text }, cite, instrument, done: () => ({ answer, citations, sources }) }
}

const base = (data: PayData) => data.base[data.base.length - 1]
/** "Coverage: " is the answer renderer's cue to fold this under "About these numbers". */
function limits(data: PayData, answer: string): string {
  const allowance = data.meta.electorate_allowance
  // The notice caveat belongs only under an answer that prices a shadow minister.
  const notes = data.meta.not_covered.filter(note => note.id !== 'shadow-notice' || /\bnotice\b/.test(answer)).map(note => note.text)
  return `Coverage: These are salary entitlements set by the Remuneration Tribunal, **not payslips**. They leave out the electorate allowance${allowance ? ` (${aud(allowance.min)} to ${aud(allowance.max)} a year)` : ''}, expenses, superannuation and any outside income. ${notes.join(' ')}`.trim()
}
/** An estimate reads as one: "about $6.7 million", not a figure to the dollar. */
const about = (n: number) => n >= 1_000_000 ? `about $${(n / 1_000_000).toFixed(1)} million` : `about ${aud(Math.round(n / 1000) * 1000)}`
const context = (data: PayData) => `**Salaries as at ${day(data.meta.as_of)}.** Each is the parliamentary base salary of ${aud(base(data).amount)} plus the loading of the post held, as a percentage of that base. Federal parliament only.`

function finish(b: ReturnType<typeof answerBuilder>, data: PayData, next: { label: string; href: string }[], scope: Record<string, string> = {}) {
  const so_far = b.done().answer
  b.add(`\n\n${limits(data, so_far)}`)
  // money_context is the renderer's name for the scope line under the lead; a
  // pay answer styles and stamps the same way without being a receipt ranking.
  return { ...b.done(), answer_status: 'calculated', pay_answer: true, money_context: context(data), pay_next: next, scope: { state: 'federal', ...scope } }
}

function rankingAnswer(question: string, data: PayData) {
  const parties = PARTIES.filter(p => p.pattern.test(question))
  // "Liberal" inside "Country Liberal" or "Liberal National" is not the Liberals.
  const named = parties.filter(p => !(p.label === 'Liberal' && /\b(?:Country\s+Liberal|Liberal\s+National)\b/i.test(question)))
  const chamber = /\bsenators?\b|\bsenate\b|\bupper\s+house\b/i.test(question) ? 'senate'
    : /\bhouse\s+of\s+representatives\b|\blower\s+house\b/i.test(question) ? 'representatives' : null
  const pool = data.current.filter(row => !chamber || row.chamber === chamber)
  const who = chamber === 'senate' ? 'senator' : chamber === 'representatives' ? 'member of the House of Representatives' : 'federal parliamentarian'
  const limit = Math.min(Math.max(Number(/\btop\s+(\d{1,2})\b/i.exec(question)?.[1]) || 0, 0), 20)
  const b = answerBuilder(data)
  const table = (rows: PayRow[], withParty: boolean) => {
    b.add(`\n\n| Parliamentarian |${withParty ? ' Party |' : ''} Post | Loading | Salary a year |\n| --- |${withParty ? ' --- |' : ''} --- | ---: | ---: |`)
    for (const row of rows) {
      b.add(`\n| ${plain(row.name)} |${withParty ? ` ${plain(row.party || 'Unknown')} |` : ''} ${plain(row.post)}${row.assumed ? ' (if named in the Opposition Leader’s notice)' : ''} | ${loading(row.pct)} | ${aud(row.salary)} |`)
      b.cite(`${row.name}: ${aud(row.salary)} a year`, personHref(row.name), `${row.name}${row.party ? ` (${row.party})` : ''}, ${row.post}: base salary ${aud(base(data).amount)} plus a loading of ${loading(row.pct)}, ${aud(row.salary)} a year.`, 'Parliamentary Handbook and Remuneration Tribunal, joined by Opax', 2)
    }
  }
  if (LOWEST.test(question) && !/\bhighest\b/i.test(question)) {
    const scoped = named.length === 1 ? pool.filter(row => named[0].members.includes(row.party || '')) : pool
    const floor = scoped.filter(row => row.pct === 0)
    b.add(`**${floor.length.toLocaleString('en-AU')} of ${scoped.length.toLocaleString('en-AU')} ${named.length === 1 ? `${named[0].label} ` : ''}${who}s are on the base salary of ${aud(base(data).amount)} a year**, the least a sitting parliamentarian is paid: they hold no post that carries a loading in this data.`)
    b.instrument('mp-determination', `Base salary ${aud(base(data).amount)} (section 7).`)
    b.add(`\n\n${context(data)}`)
    return finish(b, data, [{ label: 'Who is the highest paid politician?', href: '/ask?q=' + encodeURIComponent('Who is the highest paid politician?') }])
  }
  if (named.length >= 2) {
    const sides = named.map(p => ({ party: p, rows: pool.filter(row => p.members.includes(row.party || '')) })).filter(side => side.rows.length)
    if (sides.length < 2) return null
    sides.sort((x, y) => y.rows[0].salary - x.rows[0].salary)
    const [first, ...rest] = sides
    const top = first.rows[0]
    b.add(`**${plain(top.name)} (${first.party.label}) is the highest paid: ${aud(top.salary)} a year as ${asPost(top.post)}.**`)
    b.instrument(data.offices.pm && top.pct === data.offices.pm.pct ? 'ministerial-report' : 'mp-determination', `${top.post}: a loading of ${loading(top.pct)} on the base salary of ${aud(base(data).amount)}.`)
    for (const side of rest) {
      const best = side.rows[0]
      b.add(` The highest paid ${side.party.label} parliamentarian is ${plain(best.name)}, ${aud(best.salary)} a year as ${asPost(best.post)}${best.assumed ? ', if named in the Opposition Leader’s notice' : ''}.`)
    }
    b.instrument('mp-determination', `Base salary ${aud(base(data).amount)} (section 7) and the percentage of base for each parliamentary office (section 11).`)
    b.add(`\n\n${context(data)} ${sides.map(side => `${side.rows.length.toLocaleString('en-AU')} ${side.party.label}`).join(' and ')} ${who}s compared.`)
    b.instrument('handbook', 'Who holds each post, and since when.')
    const per = limit || (sides.length > 2 ? 2 : 3)
    table(sides.flatMap(side => side.rows.slice(0, per)).sort((x, y) => y.salary - x.salary), true)
    return finish(b, data, [
      { label: `${top.name}’s pay over time`, href: personHref(top.name) },
      { label: 'Who is the highest paid politician overall?', href: '/ask?q=' + encodeURIComponent('Who is the highest paid politician?') },
    ])
  }
  const scoped = named.length === 1 ? pool.filter(row => named[0].members.includes(row.party || '')) : pool
  if (!scoped.length) return null
  const top = scoped[0]
  b.add(`**${plain(top.name)} is the highest paid ${named.length === 1 ? `${named[0].label} ` : ''}${who}: ${aud(top.salary)} a year as ${asPost(top.post)}.**`)
  b.instrument(top.pct === data.offices.pm?.pct ? 'ministerial-report' : 'mp-determination', `${top.post}: a loading of ${loading(top.pct)} on the base salary of ${aud(base(data).amount)}.`)
  const tied = scoped.filter(row => row.salary === top.salary).length
  if (tied > 1) b.add(` ${tied - 1} ${tied === 2 ? 'other is' : 'others are'} on the same salary.`)
  b.add(`\n\n${context(data)} ${scoped.length.toLocaleString('en-AU')} sitting ${named.length === 1 ? `${named[0].label} ` : ''}${who}s ranked.`)
  b.instrument('handbook', 'Who holds each post, and since when.')
  table(scoped.slice(0, limit || 5), named.length !== 1)
  return finish(b, data, [
    { label: `${top.name}’s pay over time`, href: personHref(top.name) },
    ...(named.length ? [{ label: 'Who is the highest paid politician overall?', href: '/ask?q=' + encodeURIComponent('Who is the highest paid politician?') }]
      : [{ label: 'Between Labor and Liberal, who is paid the most?', href: '/ask?q=' + encodeURIComponent('Between Labor and Liberal, who is the highest paid politician?') }]),
  ])
}

function personAnswer(person: PayPerson, data: PayData) {
  const b = answerBuilder(data)
  const name = plain(person.name)
  if (person.now) {
    b.add(`**${name} is paid ${aud(person.now.salary)} a year** as ${asPost(person.now.post)}${person.now.assumed ? ', if named in the Opposition Leader’s notice' : ''}: the base salary of ${aud(base(data).amount)}${person.now.pct ? ` plus a loading of ${loading(person.now.pct)}` : ' with no loading'}, since ${day(person.now.since)}. As at ${day(data.meta.as_of)}.`)
  } else {
    const last = person.spells[person.spells.length - 1]
    b.add(`**${name} was last paid ${aud(last[4])} a year** as ${asPost(last[2])}, on leaving parliament${person.to ? ` in ${day(person.to).replace(/^\d+\s/, '')}` : ''}.`)
  }
  b.instrument(person.now && person.now.pct === data.offices.pm?.pct ? 'ministerial-report' : 'mp-determination', 'The base salary and the percentage of it that each post adds.')
  if (person.peak.salary > (person.now?.salary || 0)) b.add(` The highest rate was ${aud(person.peak.salary)} a year as ${asPost(person.peak.post)}, in ${financialYear(person.peak.year)}.`)
  const years = person.by_year
  const partial = person.from <= data.meta.from
  b.add(`\n\n**${financialYear(years[0][0])} to ${financialYear(years[years.length - 1][0])}: ${about(person.total)} in salary entitlements**${partial ? `, counting only from ${day(data.meta.from)}, where this data starts` : ''}. Day by day, the base salary then in force plus the loading of the post then held; not adjusted for inflation.`)
  b.instrument('handbook', `${person.name}: the posts held and their dates.`)
  b.add('\n\n| Period | Post | Loading | Salary a year |\n| --- | --- | ---: | ---: |')
  const recent = person.spells.slice(-8)
  for (const [from, to, post, pct, salary, assumed] of recent) {
    b.add(`\n| ${dayShort(from)} – ${to ? dayShort(to) : 'now'} | ${plain(post)}${assumed ? ' †' : ''} | ${loading(pct)} | ${aud(salary)} |`)
  }
  const notes = [
    person.spells.length > recent.length ? `The ${recent.length} most recent of ${person.spells.length} spells.` : '',
    'A new row starts whenever the post or its loading changed; the salary shown is the rate at the end of each spell.',
    recent.some(spell => spell[5]) ? '† Paid only if named in the Opposition Leader’s notice to the Clerks.' : '',
  ].filter(Boolean)
  b.add(`\n\n${notes.join(' ')}`)
  return finish(b, data, [
    { label: `${person.name}’s pay, year by year`, href: personHref(person.name) },
    { label: 'Who is the highest paid politician?', href: '/ask?q=' + encodeURIComponent('Who is the highest paid politician?') },
  ])
}

function comparePeople(people: PayPerson[], data: PayData) {
  const b = answerBuilder(data)
  const rate = (p: PayPerson) => p.now?.salary ?? p.spells[p.spells.length - 1][4]
  const rows = [...people].sort((x, y) => rate(y) - rate(x)).slice(0, 6)
  const [first, second] = rows
  b.add(rate(first) === rate(second) ? `**${plain(first.name)} and ${plain(second.name)} are on the same salary: ${aud(rate(first))} a year.**`
    : `**${plain(first.name)} is paid more: ${aud(rate(first))} a year against ${plain(second.name)}’s ${aud(rate(second))}.**`)
  b.instrument('mp-determination', 'The base salary and the percentage of it that each post adds.')
  b.add(`\n\n${context(data)} A former member is shown at the rate they left on.`)
  b.add('\n\n| Parliamentarian | Post | Loading | Salary a year |\n| --- | --- | ---: | ---: |')
  for (const p of rows) {
    const last = p.spells[p.spells.length - 1]
    b.add(`\n| ${plain(p.name)} | ${plain(p.now?.post ?? `${last[2]} (left ${p.to ? day(p.to) : 'parliament'})`)} | ${loading(p.now?.pct ?? last[3])} | ${aud(rate(p))} |`)
    b.cite(`${p.name}: ${aud(rate(p))} a year`, personHref(p.name), `${p.name}: ${aud(rate(p))} a year.`, 'Parliamentary Handbook and Remuneration Tribunal, joined by Opax', 2)
  }
  return finish(b, data, rows.slice(0, 2).map(p => ({ label: `${p.name}’s pay over time`, href: personHref(p.name) })))
}

function postAnswer(question: string, data: PayData) {
  const post = POSTS.find(p => p.pattern.test(question))
  if (!post) return null
  const b = answerBuilder(data)
  const step = base(data)
  if (post.office && data.offices[post.office]) {
    const office = data.offices[post.office]
    const ministerial = office.kind === 'ministerial'
    const salary = ministerial ? Math.round(step.amount * (1 + office.pct / 100)) : step.amount + Math.ceil((step.amount * office.pct) / 1000) * 10
    const holders = data.current.filter(row => row.pct === office.pct && post.pattern.test(row.post))
    b.add(`**${/^[A-Z]/.test(post.label) ? `The ${post.label}` : `A ${post.label}`} is paid ${aud(salary)} a year**: the base salary of ${aud(step.amount)} plus a loading of ${loading(office.pct)}.`)
    b.instrument(ministerial ? 'ministerial-report' : 'mp-determination', `${office.label}: ${loading(office.pct)} of the base salary.`)
    if (holders.length === 1) b.add(` ${plain(holders[0].name)} holds the post.`)
  } else {
    b.add(`**A federal parliamentarian’s base salary is ${aud(step.amount)} a year**, for senators and members alike, since ${day(step.from)}. A post adds a loading on top, from 2% for a deputy whip to 160% for the Prime Minister.`)
    b.instrument('mp-determination', `Base salary ${aud(step.amount)} (section 7).`)
  }
  b.add(`\n\n${context(data)}`)
  b.add('\n\n| Post | Loading | Salary a year |\n| --- | ---: | ---: |')
  b.add(`\n| Senator or member with no other post | none | ${aud(step.amount)} |`)
  for (const id of ['pm', 'dpm', 'treasurer', 'loto', 'cabinet', 'speaker', 'president', 'minister', 'deputy_loto', 'parlsec', 'shadow_cabinet', 'shadow_minister']) {
    const office = data.offices[id]
    if (!office) continue
    const salary = office.kind === 'ministerial' ? Math.round(step.amount * (1 + office.pct / 100)) : step.amount + Math.ceil((step.amount * office.pct) / 1000) * 10
    b.add(`\n| ${plain(office.label)} | ${loading(office.pct)} | ${aud(salary)} |`)
  }
  b.instrument('ministerial-report', 'The additional salary of each ministerial office, as a percentage of base.', 2)
  const steps = data.base.slice(-6)
  b.add(`\n\nThe base salary over time: ${steps.map(s => `${aud(s.amount)} from ${day(s.from)}`).join('; ')}.`)
  return finish(b, data, [
    { label: 'Who is the highest paid politician?', href: '/ask?q=' + encodeURIComponent('Who is the highest paid politician?') },
    { label: 'Between Labor and Liberal, who is paid the most?', href: '/ask?q=' + encodeURIComponent('Between Labor and Liberal, who is the highest paid politician?') },
  ])
}

// --- evidence for the model ---------------------------------------------------
// A pay question the calculated answer cannot take (a misspelt name, a vague or
// compound question) still deserves the figures. The catalog's word search
// cannot reach "alabesen" from "albanese", so the closest people are found
// here, by typo distance over the names in pay.json, and their records go to
// the model first; the scheme's own rows follow when the question is about
// posts or pay in general rather than one person.

/** Optimal string alignment distance: edits plus swapped neighbours, which is what a typo is. */
function typoDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let best = max + 1
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1)
      rows[i][j] = d
      best = Math.min(best, d)
    }
    if (best > max) return max + 1
  }
  return rows[a.length][b.length]
}
/** How well a typed word stands for a name: 1 exact, then by typo distance for the length. */
function nameMatch(typed: string, name: string): number {
  if (typed === name) return 1
  if (typed.length < 4 || typed[0] !== name[0]) return 0
  const d = typoDistance(typed, name, 3)
  if (d === 1) return 0.8
  if (d === 2 && typed.length >= 6) return 0.6
  if (d === 3 && typed.length >= 8) return 0.4
  return 0
}
// Words a pay question is made of, which are not anybody's name.
const NOT_A_NAME = new Set(('how much what who which whom whose does do did is was are were has have had the a an of for in on over time history pay paid salary salaries ' +
  'earn earns earned earning earnings get gets got make makes made remuneration wage wages income per year annual annually now current currently total and or vs versus ' +
  'than more less most least highest lowest top best paid who mp mps senator senators minister ministers politician politicians parliamentarian parliamentarians member members ' +
  'hon mr ms mrs dr been to from his her their its packet packets by with as at it this that these those about between compared compare labor liberal liberals nationals greens ' +
  'coalition independent one nation party since when why where federal parliament prime deputy leader opposition treasurer cabinet shadow speaker president whip backbencher').split(' '))
// Surnames that are also ordinary words: "pay day loans" is not about Bob Day.
// Such a surname counts only beside a matching first name, or capitalised.
const WORD_SURNAMES = new Set('back baker bell berry bird bishop broad brown bullock butler cash champion chandler cherry cook crane crook day draper drum farmer fisher fletcher flint french garland gash gee gray green hale hall hart hawker hill hockey hull hunt kemp king kirk lamb lees may mason nettle organ palmer parry pike porter price quick ray rice short shorten slipper small soon stoker stone swan tanner tink truss vale walker ware washer watt webber west white witty wood worth wright young'.split(' '))

interface NameIndex { id: string; first: string[]; last: string }
let nameMemo: { data: PayData; index: NameIndex[] } | null = null
function nameIndex(data: PayData): NameIndex[] {
  if (nameMemo?.data === data) return nameMemo.index
  const byId = new Map<string, NameIndex>()
  for (const [name, id] of Object.entries(data.names)) {
    const words = name.split(' ')
    if (words.length < 2) continue
    const entry = byId.get(id) ?? { id, first: [], last: fold(data.people[id]?.name || name).split(' ').at(-1)! }
    for (const word of words.slice(0, -1)) if (!entry.first.includes(word)) entry.first.push(word)
    byId.set(id, entry)
  }
  nameMemo = { data, index: [...byId.values()] }
  return nameMemo.index
}

/** The people a loosely written pay question most likely means, best first. */
function closestPeople(question: string, data: PayData): string[] {
  const typed = fold(question.replace(/['’]s\b/g, '')).split(' ').filter(word => word.length >= 3 && !NOT_A_NAME.has(word))
  if (!typed.length) return []
  const capitalised = new Set((question.match(/(?<=\S\s)[A-Z][\p{L}'’-]{2,}/gu) || []).map(fold))
  const scored: { id: string; person: PayPerson; score: number }[] = []
  for (const entry of nameIndex(data)) {
    let surname = 0, given = 0
    for (const word of typed) {
      surname = Math.max(surname, nameMatch(word, entry.last))
      for (const first of entry.first) given = Math.max(given, nameMatch(word, first))
    }
    if (!surname) continue
    if (WORD_SURNAMES.has(entry.last) && !given && !capitalised.has(entry.last)) continue
    const person = data.people[entry.id]
    if (person) scored.push({ id: entry.id, person, score: surname + given })
  }
  scored.sort((x, y) => y.score - x.score || Number(y.person.sitting) - Number(x.person.sitting) || (y.person.now?.salary ?? y.person.total) - (x.person.now?.salary ?? x.person.total))
  const best = scored[0]?.score ?? 0
  return scored.filter(row => row.score >= best - 0.5).slice(0, 3).map(row => row.id)
}

const asRecord = (row: ReturnType<typeof payGeneralRecords>[number]): CatalogRecord => ({
  kind: row.kind, title: row.title, href: row.href, snippet: row.snippet, slug: row.extra.slug, resource: '',
  dateLabel: row.extra.dateLabel, source: row.extra.source, url: row.extra.url, record_id: row.extra.record_id,
})

/** Pay records for the model to read: the closest people, then the scheme itself. */
export async function payEvidence(input: RecordQuestion, assets: Fetcher): Promise<CatalogRecord[]> {
  const question = input.question || ''
  if (!mentionsPay(question) || (input.kind && input.kind !== 'all') || (input.state && input.state !== 'federal')) return []
  const data = await loadPay(assets)
  const named = input.speaker ? data.names[fold(input.speaker)] : undefined
  const people = named ? [named] : input.speaker ? [] : closestPeople(question, data)
  const rows = people.map(id => payPersonRecord(data, id)).filter((row): row is NonNullable<typeof row> => !!row)
  const general = !people.length || WHO.test(question) || RANKING.test(question) || /\b(?:base\s+salary|pay\s+rise|over\s+time|history)\b/i.test(question) ? payGeneralRecords(data) : []
  return [...rows, ...general].map(asRecord)
}

let memo: Promise<PayData> | null = null
function loadPay(assets: Fetcher): Promise<PayData> {
  memo ??= assets.fetch(new Request('https://opax.com.au/pay.json')).then(async (res) => {
    if (!res.ok) throw new Error('Pay data unavailable')
    const data = await res.json() as PayData
    if (!Array.isArray(data?.current) || !Array.isArray(data?.base) || !data.base.length || !data.people) throw new Error('Pay data invalid')
    return data
  }).catch((err) => { memo = null; throw err })
  return memo
}

/** A calculated answer, or null when the question is not about what a federal parliamentarian is paid. */
export async function paidAnswer(input: RecordQuestion, assets: Fetcher) {
  if (!isPayQuestion(input)) return null
  if (input.state && input.state !== 'federal') return null
  const question = input.question || ''
  const data = await loadPay(assets)
  const people = peopleNamed(question, data)
  if (people.length >= 2) return comparePeople(people, data)
  if (people.length === 1) return personAnswer(people[0], data)
  const aboutThem = WHO.test(question)
  if ((RANKING.test(question) || COMPARED.test(question)) && (aboutThem || PARTIES.some(p => p.pattern.test(question)))) return rankingAnswer(question, data)
  if (aboutThem) return postAnswer(question, data)
  return null
}
