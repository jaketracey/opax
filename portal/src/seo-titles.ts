/**
 * Search-result titles for people and bills: the words an Australian types
 * into Google ("anthony albanese labor grayndler", "anti-doping bill 2026")
 * up front, inside the ~60 characters a results page shows.
 *
 * A person's title names their role the way the parliament does ("MP",
 * "Senator for", "MLC for") and their seat. A bill's official title often runs
 * past 100 characters ("Child Support and Family Assistance Legislation
 * Amendment (Ending Financial Abuse in the Child Support Scheme No. 1) Bill
 * 2026"); the part in brackets is what the bill is about, so the search title
 * leads with that purpose and the year, and cuts at a word.
 */

/** How long a title may run before the lower-value pieces are dropped. */
export const TITLE_MAX = 65
/** A long bill title drops the masthead and may run a little past TITLE_MAX. */
export const BILL_TITLE_MAX = 72

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

/** Cut at a word, never mid-word, with an ellipsis when anything was cut. */
function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${cut.slice(0, at > max / 2 ? at : cut.length).replace(/[,;:(\s]+$/, '')}…`
}

/**
 * A bill's search title. Short official titles stand as they are (without the
 * masthead when that makes them fit). A long amending bill
 * "<Act> [Legislation] Amendment (<purpose>) Bill <year>" becomes
 * "<purpose> · Amendment Bill <year>": the words in brackets are what the
 * bill does and what people search for. A bracket that says nothing ("2026
 * Measures No. 1") keeps the Act; a new Act keeps its name and drops the
 * bracket. The official title stays in the description and on the page.
 */
export function billTitle(name: string, max = TITLE_MAX): string {
  const room = max - ' · OPAX'.length
  const full = name.replace(/\s+/g, ' ').trim()
  if (full.length <= room) return `${full} · OPAX`
  // Nearly short enough: the official title whole beats any rewrite.
  if (full.length <= BILL_TITLE_MAX) return full
  const open = full.indexOf(' (')
  const m = /\) (?:Amendment )?Bill (\d{4})(.*)$/.exec(full)
  if (open > 0 && m && m.index > open) {
    const purpose = full.slice(open + 2, m.index)
    const before = full.slice(0, open)
    const amends = /\bAmendment$/.test(before) || /^\) Amendment /.test(full.slice(m.index))
    // "(Ending Financial Abuse in the Child Support Scheme No. 1)" is what a
    // reader searches for; "(2026 Measures No. 1)" is not, so keep the Act there.
    // "Amendment Bill" keeps an amending bill apart from a new Act of the same
    // name (the TEQSA amendment and the National Student Ombudsman Levy Bill).
    // Only an amending bill's Act is boilerplate. "Automated Decision-Making
    // (Safeguards and Transparency) Bill" is about automated decisions.
    if (amends && !/^(?:\d{4} )?Measures\b|^No\. \d/.test(purpose)) {
      const lead = `${purpose} · ${amends ? 'Amendment ' : ''}Bill ${m[1]}`
      // The masthead is the first thing to give way: the bill's own words
      // are what a search matches.
      if (lead.length <= room) return `${lead} · OPAX`
      const label = lead.slice(purpose.length)
      return cutAtWord(purpose, BILL_TITLE_MAX - label.length) + label
    }
    const rest = m[2].trim()
    if (!amends) {
      // A new Act: its name is the subject, the bracket a qualifier to drop.
      const named = `${before} Bill ${m[1]}${rest ? ` ${rest}` : ''}`
      if (named.length <= BILL_TITLE_MAX) return named
    }
    const act = before.replace(/\s+(?:Legislation\s+)?Amendment$/, '')
    const head = `${act}${amends ? ' Amendment' : ''} Bill ${m[1]}${rest ? ` ${rest}` : ''}`
    return `${cutAtWord(`${head}: ${purpose}`, room)} · OPAX`
  }
  return `${cutAtWord(full, room)} · OPAX`
}
