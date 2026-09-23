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

const LOWER_HOUSES = new Set(['representatives', 'nsw_la', 'vic_la', 'qld_la', 'sa_ha'])
const COUNCILS = new Set(['nsw_lc', 'vic_lc', 'sa_lc'])
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
}

/**
 * The seat a person is best known by and whether they still hold it. Federal
 * sitting status comes from the APH roster (`current`); the state files carry
 * no roster flag, so a state member who spoke this year or last is taken as
 * sitting, and anyone else as former.
 */
export function personRole(p: RolePerson, year: number): PersonRole | null {
  const seats = p.representation ?? []
  if (!seats.length) return null
  const federalSeat = seats.find(s => s.jurisdiction === 'federal')
  const stateSeat = seats.find(s => s.jurisdiction !== 'federal')
  const stateSitting = !!stateSeat && (p.last ?? 0) >= year - 1
  const seat = p.current && federalSeat ? federalSeat : stateSitting ? stateSeat! : (federalSeat ?? stateSeat!)
  const federal = seat.jurisdiction === 'federal'
  const sitting = federal ? !!p.current : stateSitting
  const party = (sitting ? p.party_now : null) ?? p.party ?? ''
  const senate = seat.chamber === 'senate'
  // Some state rosters append the member's portfolios ("Williamstown – Minister for Ports").
  const place = seat.electorate.split(/\s+[–—-]\s+/)[0].trim()
  // NSW and SA elect their upper houses statewide: no seat to name.
  const statewide = COUNCILS.has(seat.chamber) && seat.chamber !== 'vic_lc'
  const role = senate ? `Senator for ${TERRITORIES[place] ?? place}`
    : statewide ? 'MLC'
    : COUNCILS.has(seat.chamber) ? `MLC for ${place}`
    : LOWER_HOUSES.has(seat.chamber) ? `Member for ${place}`
    : `representative for ${place}`
  const stateTag = STATE_TAGS[String(seat.state ?? seat.jurisdiction).toUpperCase()] ?? ''
  return {
    name: sitting && LOWER_HOUSES.has(seat.chamber) ? `${p.name} MP` : p.name,
    former: sitting ? '' : 'former ',
    party,
    role,
    // A Senate seat is already a state; a federal or state electorate is not.
    tag: !senate && stateTag ? ` (${stateTag})` : '',
    federal,
  }
}

/** "Anthony Albanese MP, Labor Member for Grayndler (NSW)" and its shorter forms. */
function roleLead(r: PersonRole, withParty: boolean, withTag: boolean): string {
  const party = withParty && r.party ? `${r.party} ` : ''
  return `${r.name}, ${r.former}${party}${r.role}${withTag ? r.tag : ''}`
}

/** The role in a sentence: "Labor Member for Grayndler (NSW)". */
export function roleLine(r: PersonRole): string {
  return roleLead(r, true, true).slice(r.name.length + 2)
}

/**
 * The longest title that fits: the role with what the page holds, then the
 * role alone, then without the state tag, then without the party.
 */
export function personTitle(display: string, r: PersonRole | null, suffix: string, max = TITLE_MAX): string {
  if (!r) return `${display} · OPAX`
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
