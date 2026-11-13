import type { NamedScope, Period } from './agentic-ask'
import type { ToolDeps } from './agentic-tools'
import type { QualitativeAnswer } from './research-types'
import { resolvePersonName } from './person-name-matching'
import { offScopeQuestion, isBillSpeechQuestion } from './ask-scope-intent'
import { appendWrittenPoints } from './research-writing'
import { normalBillTitle, billTitleMatches, requestedBillTitle } from './bill-title'
export { normalBillTitle, billTitleMatches, requestedBillTitle } from './bill-title'

type Row = Record<string, unknown>
export interface LookupDecision { answer: QualitativeAnswer; terminal: boolean; correctedParty?: true }
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const rows = (v: unknown, key: string): Row[] | null => Array.isArray(object(v)[key]) ? (object(v)[key] as unknown[]).map(object) : null
const normal = (v: unknown) => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''
const latest = (dates: string[]) => dates.filter(Boolean).sort().at(-1)
const voteQuestion = /\b(?:divisions?|vot(?:e|ed|es|ing))\b|\bwhy(?: did|['’]d)\b.{0,120}\bback\b/i

function decision(text: string, path: string, deps: ToolDeps, terminal = true, recorded?: string): LookupDecision {
  const url = new URL(path, deps.origin ?? 'https://opax.com.au').href
  const source = { resource: 'exact-lookup', slug: '', title: 'Exact record lookup', href: url, url, snippet: recorded ?? text, cited: true, kind: 'record' }
  return { terminal, answer: { answer: text, answer_decision: terminal ? 'limitation' : 'answer', citations: { 'exact-lookup/t/body/0': [[0, Array.from(text).length]] }, sources: [source] } }
}

/** A name slot is different from an unknown topic. Keep collective questions out of the person lookup. */
function requestedPerson(question: string): string | null {
  const patterns = [
    /\b(?:did|has|have|does|will)\s+(?:(?:senator|the federal MP)\s+)?(.+?)\s+(?:vot(?:e|ed)|say|said|declare[ds]?|spoken|speak|done|back(?:ed)?|been the member)\b/i,
    /\bwhy['’]d\s+(.+?)\s+back\b/i,
    /\belectorate\s+does\s+(.+?)\s+(?:MP\s+)?represent\b/i,
    /\b(?:what(?:'s| is)|what has)\s+(?:on\s+)?(.+?)(?:['’]s)?\s+(?:interests|declared|declare[ds]?|say|said)\b/i,
    /\b(?:federal MP|senator)\s+(.+?)\s+(?:MP\s+)?(?:paid|vote|represent)\b/i,
    /\bwhat(?:'s| is)\s+(.+?)\s+(?:MP\s+)?paid\b/i,
    /\bwhen was\s+(.+?)\s+Prime Minister\b/i,
    /\bwhat did\s+(.+?)\s+\S+\s+as Prime Minister\b/i,
    /\b(.+?)\s+declared interests\b/i,
  ]
  for (const pattern of patterns) {
    const name = pattern.exec(question)?.[1]?.replace(/['’]s$/, '').replace(/\s+MP$/i, '').trim()
    if (!name || name.split(/\s+/).length < 2 || name.split(/\s+/).length > 5 || !/^[\p{L}'’ -]+$/u.test(name)) continue
    if (/\b(?:parliament|senate|house|government|opposition|members|senators|politicians|party|parties|bill|federal|Australian|the|record)\b/i.test(name)) continue
    return name
  }
  return null
}

/** Check authoritative indexes before ranked discovery can substitute a neighbouring record.
 * Unavailable indexes remain unknown. A missing indexed record does not mean an event never happened. */
export async function exactRecordLookup(question: string, deps: ToolDeps, period: Period, named?: NamedScope): Promise<LookupDecision | null> {
  question = named?.resolvedQuestion ?? question
  if (offScopeQuestion(question)) return { terminal: true, answer: { answer: 'OPAX covers Australian parliament and public records. Please ask about Australian politics, public spending, bills or votes.', answer_decision: 'refusal', citations: {}, sources: [] } }
  const read = async (path: string) => { try { return await deps.asset(path) } catch { return null } }
  const today = new Date().toISOString().slice(0, 10)
  // A future event or an unmatched name, bill or division is a miss: the agent answers it.
  const personSlot = requestedPerson(question)
  let resolvedPerson = named?.people.length === 1 ? named.people[0] : null
  const identityQuestion = /\b(?:MP|senator|parliamentarian|electorate|interests|paid|declared|Prime Minister)\b/i.test(question) || /\b(?:did|has|does|why['’]d)\b.+\b(?:say|said|vote|voted|back)\b/i.test(question)
  const needsPerson = personSlot && identityQuestion || named?.people.length === 1 && /\b(?:MP|senator|member for|Prime Minister|their MP)\b/i.test(question)
  if (needsPerson) {
    const roster = await read('/parliamentarians.json'), people = rows(roster, 'people')
    const names = (people ?? []).filter((p): p is Row & { name: string } => typeof p.name === 'string')
    const resolution = personSlot ? resolvePersonName(personSlot, names) : null
    const person = named?.people.length === 1 ? named.people[0] : resolution?.status === 'matched' ? resolution.candidates[0].person.name : null
    resolvedPerson = person
    if (people && personSlot && !person && resolution?.status === 'no_match' && !named?.people.length) return null
    const p = people?.find(r => normal(r.name) === normal(person))
    if (p && person) {
      const path = '/subject/person/' + encodeURIComponent(person)
      const descriptor = /\b(Labor|ALP|Liberal|LNP|Liberal National|Greens|Nationals|Independent|One Nation)\s+(?:federal\s+)?(?:MP|senator|member)\b/i.exec(question)?.[1]
      const party = p.party_now ?? p.party
      // Current roster labels cannot correct historical affiliations.
      if (descriptor && party && /\p{L}/u.test(String(party)) && period.kind === 'all' && normal(descriptor) !== normal(party) && !(normal(descriptor) === 'alp' && normal(party) === 'labor')) {
        return { ...decision(`${person} is recorded as ${party}, not ${descriptor}.`, path, deps, false, `${person}: ${party}.`), correctedParty: true }
      }
      const seat = /\bmember for\s+([\p{L}'’-]+)|\bpeople of\s+([\p{L}'’-]+)\s+as their MP/iu.exec(question)
      const seats = (rows(p, 'representation') ?? []).filter(r => r.chamber === 'representatives').map(r => String(r.electorate ?? '')).filter(Boolean)
      const requested = seat?.[1] ?? seat?.[2]
      if (requested && seats.length === 1 && normal(seats[0]) !== normal(requested) && period.kind === 'all') return decision(`${person} is recorded as the member for ${seats[0]}, not ${requested}.`, path, deps, true, `${person}: recorded representation ${seats[0]}.`)
      if (/\bPrime Minister\b/i.test(question)) {
        const pay = object(await read('/pay.json')), office = Object.values(object(pay.people)).map(object).find(r => normal(r.name) === normal(person))
        const spells = Array.isArray(office?.spells) ? office.spells as unknown[][] : []
        if (spells.length && !spells.some(s => /(?:^|\+\s*)Prime Minister\b/i.test(String(s[2])))) {
          const recorded = [...new Set(spells.map(s => String(s[2])))].find(s => /Leader of the Opposition/.test(s)) ?? String(spells.at(-1)![2])
          return decision(`OPAX has no record of ${person} serving as Prime Minister; its office records list ${recorded}.${object(pay.meta).from ? ` The office records cover ${object(pay.meta).from} to ${object(pay.meta).as_of}.` : ''}`, '/money/pay', deps)
        }
      }
    }
  }

  // A lifecycle index cannot establish the absence of a member's Hansard words.
  if (isBillSpeechQuestion(question)) return null
  const title = requestedBillTitle(question)
  if (title && !/\b(?:NSW|Victorian?|Queensland|Tasmanian?|South Australian|Western Australian|Northern Territory)\b/i.test(question)) {
    const index = await read('/bills/index.json'), bills = rows(index, 'bills')
    if (bills) {
      const withoutYear = (v: unknown) => normalBillTitle(v).replace(/ (?:19|20)\d{2}(?: \d{2,4})?$/, '')
      const matches = bills.filter(b => [b.title, b.short_title].some(t => billTitleMatches(t, title)))
      if (!matches.length) {
        // A lifecycle index is not the division archive. A dated vote must be
        // checked there before declaring the named bill absent.
        if (voteQuestion.test(question) && period.since && period.until) {
          const divisions = rows(await read('/divisions/index.json'), 'divisions')
          if (!divisions) return null
          const chamber = /\bsenat(?:e|ors?)\b/i.test(question) ? 'senate' : /\bhouse\b/i.test(question) ? 'representatives' : undefined
          const candidates = divisions.filter(r => (!chamber || String(r.key).startsWith('federal-'+chamber+'-')) && day(r.date) >= period.since! && day(r.date) <= period.until!)
          if (candidates.length) {
            if (candidates.length > 60) return null
            const files = await Promise.all(candidates.map(async r => {
              if (r.name || r.title) return r
              return object(await read('/divisions/' + String(r.slug ?? 'division-' + r.key) + '.json'))
            }))
            // Missing title data is unknown, not evidence of absence.
            if (files.some(r => !r.name && !r.title || (' ' + withoutYear(r.name ?? r.title) + ' ').includes(' ' + withoutYear(title) + ' '))) return null
            return null
          }
        } else return null
      }
      const bill = matches[0]
      if (bill && matches.every(b => b.status === 'passed') && /\b(?:rejected|defeated|voted down|failed to pass)\b/i.test(question)) return decision(`${bill.title} passed parliament; it was not rejected.`, '/bill/' + encodeURIComponent(String(bill.key)), deps, true, `${bill.title}: passed.`)
      if (bill && /\bintroduc\w*\s+on\b/i.test(question) && period.since === period.until && day(bill.introduced) && day(bill.introduced) !== period.since) return decision(`${bill.title} was introduced on ${day(bill.introduced)}, not ${period.since}.`, '/bill/' + encodeURIComponent(String(bill.key)), deps)
    }
  }

  if (voteQuestion.test(question) && period.since && period.until && !/\b(?:NSW|Victorian?|Queensland|Tasmanian?|South Australian|Western Australian|Northern Territory)\b/i.test(question)) {
    const index = await read('/divisions/index.json'), divisions = rows(index, 'divisions')
    if (!divisions) return null
    const chamber = /\bsenat(?:e|ors?)\b/i.test(question) ? 'senate' : /\bhouse\b/i.test(question) ? 'representatives' : undefined
    const scoped = divisions.filter(r => !chamber || String(r.key).startsWith('federal-' + chamber + '-'))
    const matches = scoped.filter(r => day(r.date) >= period.since! && day(r.date) <= period.until!)
    const dates = scoped.map(r => day(r.date)).filter(Boolean).sort(), from = dates[0], until = dates.at(-1)
    const window = period.since === period.until ? `on ${period.since}` : `from ${period.since} to ${period.until}`
    const countInCoverage = /\b(?:how many|number of|count|more|fewer)\b/i.test(question) && from && until && period.since >= from && period.until <= until
    if (!matches.length && !countInCoverage) return null
    // Resolve a single day's full division title before interpreting a member's vote.
    const assertedAye = /\b(?:vote(?:d)? for|back(?:ed)?)\b/i.test(question), assertedNo = /\b(?:vote(?:d)? against|oppos(?:e|ed))\b/i.test(question)
    if (period.since === period.until && resolvedPerson && (assertedAye || assertedNo) && matches.length <= 60) {
      const files = (await Promise.all(matches.map(r => read('/divisions/' + String(r.slug ?? 'division-' + r.key) + '.json')))).map(object)
      const q = ' ' + normal(question) + ' '
      const mentioned = files.filter(r => typeof r.name === 'string' && q.includes(' ' + normal(r.name) + ' '))
      const exact = mentioned.filter(r => !mentioned.some(other => normal(other.name).length > normal(r.name).length && normal(other.name).includes(normal(r.name))))
      if (exact.length === 1) {
        const div = exact[0], member = rows(div, 'members')?.find(r => normal(r.name) === normal(resolvedPerson))
        if (member && (assertedAye && member.vote === 'no' || assertedNo && member.vote === 'aye')) return decision(`${member.name} voted ${member.vote} on ${div.name} on ${day(div.date)}.`, '/doc/division-' + div.key, deps, true)
      }
    }
  }
  return null
}

/** A checked correction stays first even when the writer reorders or omits other facts. */
export function prependLookupCorrection(answer: QualitativeAnswer, correction: QualitativeAnswer): QualitativeAnswer {
  // The false premise limits the original question. This typed decision also keeps final grounding from moving it.
  return { ...answer, ...appendWrittenPoints(correction, answer), answer_decision: 'limitation' }
}
