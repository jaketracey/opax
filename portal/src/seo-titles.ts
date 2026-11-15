/**
 * Search-result titles for people and bills: the words an Australian types
 * into Google ("anthony albanese labor grayndler", a bill's full name) in the
 * title, the most important first.
 *
 * A person's title names their role the way the parliament does ("MP",
 * "Senator for", "MLC for") and their seat. A bill's title is its official
 * name in full: Search Console shows bill traffic arriving on exact full-name
 * queries, so a shortened or reworded title loses the match.
 */

/** How long a title may run before the lower-value pieces are dropped. */
export const TITLE_MAX = 65
/** A bill title keeps the masthead only up to this length (see billTitle). */
export const BILL_TITLE_MAX = 70

const LOWER_HOUSES = new Set(['representatives', 'nsw_la', 'vic_la', 'qld_la', 'sa_ha', 'act_la'])
const COUNCILS = new Set(['nsw_lc', 'vic_lc', 'sa_lc', 'wa_lc', 'tas_lc'])
const STATE_TAGS: Record<string, string> = {
  NSW: 'NSW', 'NEW SOUTH WALES': 'NSW', VIC: 'Vic', VICTORIA: 'Vic', QLD: 'Qld', QUEENSLAND: 'Qld',
  SA: 'SA', 'SOUTH AUSTRALIA': 'SA', WA: 'WA', 'WESTERN AUSTRALIA': 'WA', TAS: 'Tas', TASMANIA: 'Tas',
  ACT: 'ACT', 'AUSTRALIAN CAPITAL TERRITORY': 'ACT', NT: 'NT', 'NORTHERN TERRITORY': 'NT',
}

const TERRITORIES: Record<string, string> = { 'Australian Capital Territory': 'the ACT', 'Northern Territory': 'the NT' }

export interface RoleSeat { electorate: string; jurisdiction: string; chamber: string; state?: string | null }
export interface RolePerson {
  name: string
  party: string | null
  party_now?: string
  current?: boolean
  states: string[]
  last: number | null
  representation?: RoleSeat[]
  affiliations?: (RoleSeat & { start: string; end?: string | null; party?: string | null })[]
}

export interface PersonRole {
  /** "Anthony Albanese MP" */
  name: string
  /** "former " or "" */
  former: string
  party: string
  /** "Member for Grayndler", "Senator for South Australia", "MLC for Northern Victoria" */
  role: string
  /** " (NSW)" or "" */
  tag: string
  federal: boolean
  /** A member until their house's term ended: the full phrase for a sentence ("until the Assembly
   *  expired on 3 November") and the dated forms a title has room for ("until 3 November 2026"). */
  until?: TermEnd
}
export interface TermEnd { phrase: string; title: string; short: string }
/** What a reviewed record says of a person and a house whose term has ended (public/vic-term.js). */
export type EndedSeat = { jurisdiction: string; member: { role: string; until: TermEnd; party?: string | null } | null } | null

/**
 * The seat a person is best known by and whether they still hold it. Federal
 * sitting status comes from the APH roster (`current`); the state files carry
 * no roster flag, so a state member who spoke this year or last is taken as
 * sitting, and anyone else as former. A dated current service takes priority
 * over those heuristics for careers that span parliaments or chambers.
 *
 * `ended` speaks for a house whose term has ended before its new roster loads. It
 * answers once for the person, for their seat in its jurisdiction: `member` is the
 * role, party and end of term of someone a seat's own roster names ("Member for
 * Richmond", until the Assembly expired); a null `member` is anyone else recorded
 * in that house, who is no sitting member either. Null: it has nothing to say.
 */
export function personRole(p: RolePerson, year: number, ended: EndedSeat = null): PersonRole | null {
  const seats = p.representation ?? []
  if (!seats.length) return null
  const federalSeat = seats.find(s => s.jurisdiction === 'federal')
  const stateSeat = seats.find(s => s.jurisdiction !== 'federal')
  const stateSitting = !!stateSeat && (p.last ?? 0) >= year - 1
  const service = p.current ? (p.affiliations ?? []).filter(s => s.start && !s.end && Number(s.start.slice(0, 4)) <= year)
    .sort((a, b) => b.start.localeCompare(a.start))[0] : undefined
  const datedSeat = service && seats.find(s => s.jurisdiction === service.jurisdiction &&
    s.chamber === service.chamber && s.electorate === service.electorate)
  const seat = datedSeat ?? (p.current && federalSeat ? federalSeat : stateSitting ? stateSeat! : (federalSeat ?? stateSeat!))
  const federal = seat.jurisdiction === 'federal'
  const closed = ended && seat.jurisdiction === ended.jurisdiction ? ended : null
  const term = closed?.member ?? null
  const sitting = closed ? !!term : datedSeat ? !!p.current : federal ? !!p.current : stateSitting
  const party = term?.party ?? (sitting ? (datedSeat ? service?.party : null) ?? p.party_now : null) ?? p.party ?? ''
  const senate = federal && seat.chamber === 'senate'
  // Some state rosters append the member's portfolios ("Williamstown – Minister for Ports").
  const place = seat.electorate.split(/\s+[–—-]\s+/)[0].trim().replace(/^Legislative Council district of /, '')
  const role = term ? term.role : senate ? `Senator for ${TERRITORIES[place] ?? place}`
    : COUNCILS.has(seat.chamber) ? `MLC for ${place}`
    : LOWER_HOUSES.has(seat.chamber) ? `Member for ${place}`
    : `representative for ${place}`
  const stateTag = STATE_TAGS[String(seat.state ?? seat.jurisdiction).toUpperCase()] ?? ''
  const statewide = COUNCILS.has(seat.chamber) && stateTag === STATE_TAGS[place.toUpperCase()]
  return {
    name: sitting && LOWER_HOUSES.has(seat.chamber) && !term ? `${p.name} MP` : p.name,
    former: sitting ? '' : 'former ',
    party,
    role,
    // Senate and statewide Council seats already name their state.
    tag: !senate && !statewide && stateTag ? ` (${stateTag})` : '',
    federal,
    ...(term ? { until: term.until } : {}),
  }
}

/** "Anthony Albanese MP, Labor Member for Grayndler (NSW)" and its shorter forms. */
function roleLead(r: PersonRole, withParty: boolean, withTag: boolean): string {
  const party = withParty && r.party ? `${r.party} ` : ''
  return `${r.name}, ${r.former}${party}${r.role}${withTag ? r.tag : ''}`
}

/** The role in a sentence: "Labor Member for Grayndler (NSW)", or with the end of a term
 *  "Labor Member for Richmond until the Assembly expired on 3 November (Vic)". */
export function roleLine(r: PersonRole): string {
  const line = roleLead(r, true, true).slice(r.name.length + 2)
  return r.until ? `${line.slice(0, line.length - r.tag.length)} ${r.until.phrase}${r.tag}` : line
}

/**
 * The longest title that fits: the role with what the page holds, then the
 * role alone, then without the state tag, then without the party.
 */
export function personTitle(display: string, r: PersonRole | null, suffix: string, max = TITLE_MAX): string {
  if (!r) return `${display} · OPAX`
  // An ended term is dated in the title's own short forms, never past the limit: the full sentence
  // is in the description and on the page.
  if (r.until) return [
    `${roleLead(r, true, false)} ${r.until.title} · OPAX`,
    `${roleLead(r, false, false)} ${r.until.title} · OPAX`,
    `${roleLead(r, false, false)} ${r.until.short} · OPAX`,
  ].find(t => t.length <= max) ?? `${display} · OPAX`
  const candidates = [
    `${roleLead(r, true, true)} · ${suffix} · OPAX`,
    `${roleLead(r, true, true)} · OPAX`,
    `${roleLead(r, true, false)} · OPAX`,
    `${roleLead(r, false, true)} · OPAX`,
    `${roleLead(r, false, false)} · OPAX`,
  ]
  return candidates.find(t => t.length <= max) ?? candidates[candidates.length - 1]
}

/**
 * A bill's search title is its full official name, never cut: people search
 * bills by typing the whole name ("fair work amendment (disqualified officers)
 * bill 2026"), and Google matches and bolds the whole title even where it
 * displays only the first ~60 characters. The masthead follows only when the
 * two together fit in BILL_TITLE_MAX.
 */
export function billTitle(name: string): string {
  const full = name.replace(/\s+/g, ' ').trim()
  const branded = `${full} · OPAX`
  return branded.length <= BILL_TITLE_MAX ? branded : full
}
