import { findPeople, type ToolDeps } from './agentic-tools'
import { identityRequest } from './ask-identity-intent'
import type { RecordQuestion } from './ask-records'

interface Representation { electorate: string; jurisdiction: string; chamber: string; state?: string | null }
interface IdentityPerson {
  name: string; party: string | null; current: boolean | null; chambers: string[]
  representation?: Representation[]; confidence?: number
}
interface ServiceSeat {
  name: string; chamber: string; jurisdiction: string; current: boolean; url?: string
  periods?: { start: string; end: string | null }[]
}
interface ServicePerson { name: string; aliases?: string[]; electorates: ServiceSeat[] }
interface PayPerson { name: string; chamber: string; from: string; to: string | null; sitting: boolean; spells?: [string, string | null, ...unknown[]][] }
interface PayData { meta?: { from?: string; as_of?: string }; people?: Record<string, PayPerson> }
export interface IdentityAnswer {
  answer: string; answer_status: string; answer_source: 'template'; identity_fact: true
  citations: Record<string, number[][]>
  sources: { resource: string; title: string; kind: 'person'; href: string; url: string; snippet: string; cited: boolean; answer_ranges: number[][] }[]
}
const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[‘’]/g, "'").trim()
const date = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const previousDay = (s: string) => new Date(Date.parse(s + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
/** Pay spells use exclusive end dates and may change with an office or salary.
 * Join adjacent spells, preserving any interruption in parliamentary service. */
function payPeriods(person: PayPerson): { start: string; end: string | null }[] {
  const periods: { start: string; end: string | null }[] = []
  for (const [start, end] of [...(person.spells ?? [])].sort(([a], [b]) => a.localeCompare(b))) {
    const last = periods.at(-1)
    if (last && (last.end === null || start <= last.end)) last.end = last.end === null || end === null ? null : last.end > end ? last.end : end
    else periods.push({ start, end })
  }
  return periods.length ? periods.map(p => ({ start: p.start, end: p.end ? previousDay(p.end) : null })) : [{ start: person.from, end: person.to }]
}
const chamberName = (s: string) => ({ representatives: 'House of Representatives', senate: 'Senate', nsw_la: 'NSW Legislative Assembly', nsw_lc: 'NSW Legislative Council', vic_la: 'Victorian Legislative Assembly', vic_lc: 'Victorian Legislative Council', qld_la: 'Queensland Legislative Assembly', sa_ha: 'SA House of Assembly', sa_lc: 'SA Legislative Council', wa_la: 'WA Legislative Assembly', wa_lc: 'WA Legislative Council', tas_ha: 'Tasmanian House of Assembly', tas_lc: 'Tasmanian Legislative Council', act_la: 'ACT Legislative Assembly', nt_la: 'NT Legislative Assembly' } as Record<string, string>)[s] ?? s

/** Roster facts do not need a speech establishing a policy position. Resolve
 * before generation and cache reads, and bind every fact to its own source. */
export async function identityAnswer(input: RecordQuestion, deps: ToolDeps): Promise<IdentityAnswer | null> {
  const question = input.question ?? '', request = identityRequest(question)
  if (!request || input.kind && !['all', 'speech', 'person'].includes(input.kind)) return null
  const found = await findPeople(deps, { name: request.subject })
  const people = found.data?.people as IdentityPerson[] | undefined
  if (!found.ok || !people?.length) return null
  // Exact full names win over partial-name candidates. The name-resolution
  // tool owns fuzzy confidence and ambiguity; speech volume is not identity.
  const exact = people.filter(p => fold(p.name) === fold(request.subject))
  const candidates = exact.length ? exact : people
  const best = candidates[0]
  if (!best || candidates.length > 1 && (best.confidence === undefined || best.confidence === candidates[1].confidence)) return null
  if (input.speaker && fold(input.speaker) !== fold(best.name)) return null
  const origin = deps.origin ?? 'https://opax.com.au'
  const profile = found.cite.find(c => c.label === best.name)?.url ?? `${origin}/subject/person/${encodeURIComponent(best.name)}`
  const out: IdentityAnswer = { answer: '', answer_status: 'answered', answer_source: 'template', identity_fact: true, citations: {}, sources: [] }
  const add = (text: string, url = profile) => {
    if (out.answer) out.answer += '\n'
    const start = Array.from(out.answer).length
    out.answer += text
    const range = [start, Array.from(out.answer).length]
    const resource = `identity-${out.sources.length + 1}`
    out.citations[`${resource}/t/identity`] = [range]
    out.sources.push({ resource, title: best.name, kind: 'person', href: url, url, snippet: text, cited: true, answer_ranges: [range] })
  }
  const representations = (best.representation ?? []).filter(r => (!input.chamber || r.chamber === input.chamber) && (!input.state || r.jurisdiction === input.state))
  const dated = /\b(?:19|20)\d{2}\b/.test(question) || !!(input.since || input.until || input.from || input.to)
  const periodLimit = dated ? '; this roster does not establish their representation for the requested period' : ''
  if (request.fields.includes('party')) {
    // A current roster cannot establish an affiliation on a specified date.
    add(best.party ? dated ? `${best.name}'s recorded roster affiliation is ${best.party}; this roster does not establish their party for the requested period.` : `${best.name}'s recorded party is ${best.party}.` : `${best.name}'s party is not recorded in the roster.`)
  }
  if (request.fields.includes('chamber')) {
    const chambers = [...new Set(representations.map(r => r.chamber))]
    // Committee venues do not establish membership of a parliamentary house.
    const houses = chambers.length ? chambers : input.state || input.chamber ? [] : [...new Set(best.chambers.filter(c => !c.includes('committee')))]
    add(houses.length ? `${best.name} is recorded in the ${houses.map(chamberName).join(' and ')}${periodLimit}.` : `${best.name}'s parliamentary chamber is not recorded in this roster.`)
  }
  if (request.fields.includes('electorate')) {
    const seats = [...new Set(representations.map(r => `${r.electorate} (${chamberName(r.chamber)})`))]
    add(seats.length ? `${best.name}'s recorded representation is ${seats.join(' and ')}${periodLimit}.` : `${best.name}'s electorate or state of representation is not recorded in this roster.`)
  }
  if (request.fields.some(f => f === 'service' || f === 'current')) {
    // Published service periods are distinct from find_people's indexed speech years.
    const manifest = await deps.asset('/electorates/manifest.json') as { people_url?: string } | null
    const service = manifest?.people_url && /^\/electorates\/releases\/[a-z0-9]+\/people\.json$/.test(manifest.people_url)
      ? await deps.asset(manifest.people_url) as { people?: ServicePerson[] } | null : null
    const chamber = input.chamber ?? (/\b(?:senate|senator)\b/i.test(question) ? 'senate' : /\bhouse of representatives\b/i.test(question) ? 'representatives' : undefined)
    const allSeats = service?.people?.filter(p => fold(p.name) === fold(best.name) || p.aliases?.some(n => fold(n) === fold(best.name))).flatMap(p => p.electorates) ?? []
    const seats = allSeats.filter(s => (!chamber || chamber === s.chamber) && (!input.state || input.state === s.jurisdiction))
    // Prefer a seat explicitly named in the request; otherwise retain every service spell.
    const namedSeats = seats.filter(s => fold(question).includes(fold(s.name)))
    const selected = namedSeats.length ? namedSeats : seats
    const periods = selected.flatMap(s => (s.periods ?? []).map(p => ({ ...p, seat: s }))).sort((a, b) => a.start.localeCompare(b.start))
    let current: boolean | null = best.current
    if (current !== true && selected.length) current = selected.some(s => s.current)
    let pay: PayData | null = null
    let paid: PayPerson | undefined
    if (!periods.length || current === null) {
      pay = await deps.asset('/pay.json') as PayData | null
      paid = Object.values(pay?.people ?? {}).find(p => fold(p.name) === fold(best.name) && (!chamber || chamber === p.chamber) && (!input.state || input.state === 'federal'))
      if (current === null && paid) current = paid.sitting
    }
    if (request.fields.includes('service')) {
      if (periods.length) for (const p of periods) add(`${best.name} represented ${p.seat.name} from ${date(p.start)}${p.end ? ` to ${date(p.end)}` : p.seat.current ? ' and is recorded as a current representative' : '; no end date is recorded'}.`, p.seat.url ? new URL(p.seat.url, origin).href : profile)
      // The pay export's chamber is the latest chamber, even for old spells.
      // It cannot date entry into a house when the person changed chambers.
      else if (paid && (!chamber || !allSeats.some(s => s.chamber !== chamber) && !(best.representation ?? []).some(r => r.chamber !== chamber))) for (const p of payPeriods(paid)) add(`${best.name}'s parliamentary service ${p.start === pay?.meta?.from ? 'is covered by the published pay record from' : 'is recorded from'} ${date(p.start)}${p.end ? ` to ${date(p.end)}` : paid.sitting ? ' and they are recorded as still serving' : '; no end date is recorded'}.`, `${origin}/pay`)
      else add(`${best.name}'s dates of parliamentary service are not available in these records; indexed speech years do not establish service dates.`)
    }
    if (request.fields.includes('current')) add(current === true ? `${best.name} is recorded as a current member of parliament${periodLimit}.` : current === false ? `${best.name} is recorded as no longer serving in parliament${periodLimit}.` : `${best.name}'s current membership of parliament is not established by the roster.`)
  }
  return out.answer ? out : null
}

/** Deterministic facts use identical JSON and SSE payloads. */
export function identityResponse(payload: IdentityAnswer, request: Request): Response {
  const streaming = new URL(request.url).searchParams.get('stream') === '1' || request.headers.get('accept')?.includes('text/event-stream')
  const headers = { 'x-opax-identity-route': 'roster-v1', 'cache-control': 'no-store', 'x-opax-cache': 'BYPASS' }
  return streaming ? new Response(`event: done\ndata: ${JSON.stringify(payload)}\n\n`, { headers: { ...headers, 'content-type': 'text/event-stream' } }) : Response.json(payload, { headers })
}
