import type { StructuredToolResult, ToolArgs, ToolEnv } from './types'

export interface DivisionSummary {
  key: string
  slug: string
  date: string
  bills?: { key: string; title: string; url: string }[]
  house?: string
  member_coverage: string
  party_tallies: { party: string; votes: Record<string, number> }[]
  unknown_party_count?: number
  recorded_ayes?: number
  recorded_noes?: number
  /** Set when TheyVoteForYou marks this division as a repeat of that one (same named votes). */
  duplicate_of?: string
}

type PartyTally = DivisionSummary['party_tallies'][number]
type Direction = 'aye' | 'no'

/** Independents and presiding-officer labels do not describe a coherent party. The export no longer
 * publishes office codes as parties (scripts/division_rules.py); this still refuses them. */
export function isDivisionParty(party: string): boolean {
  return !!party.trim() && !/^(independents?|unknown(?: party)?|unaffiliated|none|n\/a|[adt]?spk|sdspk|[adt]?pres|[adt]?cwm|speaker|president|deputy president|acting president|(?:second |acting )?deputy speaker|acting speaker|(?:deputy )?chair(?:man)? of committees|(?:deputy )?chairman of ways and means)$/i.test(party.trim())
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function partyMajority(tally: PartyTally | undefined): Direction | null {
  if (!tally) return null
  const ayes = count(tally.votes.aye), noes = count(tally.votes.no)
  return ayes === noes ? null : ayes > noes ? 'aye' : 'no'
}

const aliases: Record<string, string> = {
  alp: 'Labor', 'australian labor party': 'Labor', 'australian labour party': 'Labor', 'labor party': 'Labor', 'labour party': 'Labor', labour: 'Labor',
  'liberal party': 'Liberal', 'liberal party of australia': 'Liberal',
  national: 'Nationals', 'the nationals': 'Nationals', 'national party': 'Nationals', 'national party of australia': 'Nationals',
  'australian greens': 'Greens', 'the greens': 'Greens',
  'liberal national party': 'LNP', 'liberal national party of queensland': 'LNP',
  'one nation': 'One Nation', "pauline hanson's one nation": 'One Nation',
}

// A party recorded under more than one name (labels.js PARTY_RENAMES): either name finds the tallies, and the
// answer keeps the label the division records carry (the name the party voted under).
const renamed: string[][] = [['Libertarian Party', 'Liberal Democratic Party', 'Liberal Democrats', 'Libertarian', 'LDP']]

export function resolveDivisionParty(value: unknown, divisions: DivisionSummary[]): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const requested = value.trim()
  const family = renamed.find(names => names.some(n => n.toLowerCase() === requested.toLowerCase()))
  if (family) {
    const held = new Set(family.map(n => n.toLowerCase()))
    for (const division of divisions) {
      const tally = division.party_tallies.find(t => held.has(t.party.toLowerCase()))
      if (tally) return tally.party
    }
    return family[0]
  }
  const canonical = aliases[requested.toLowerCase()] ?? requested
  for (const division of divisions) {
    const tally = division.party_tallies.find(t => t.party.toLowerCase() === canonical.toLowerCase())
    if (tally) return tally.party
  }
  return canonical
}

function scope(args: ToolArgs, divisions: DivisionSummary[]): string {
  const jurisdictions: Record<string, string> = { federal: 'Federal', nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', act: 'Australian Capital Territory', nt: 'Northern Territory', wa: 'Western Australia', tas: 'Tasmania', all: 'All published jurisdictions' }
  const chambers: Record<string, string> = {
    senate: 'Federal Senate', representatives: 'Federal House of Representatives',
    nsw_la: 'New South Wales Legislative Assembly', nsw_lc: 'New South Wales Legislative Council',
    vic_la: 'Victorian Legislative Assembly', vic_lc: 'Victorian Legislative Council',
    qld_la: 'Queensland Legislative Assembly',
    sa_la: 'South Australian House of Assembly', sa_ha: 'South Australian House of Assembly', sa_lc: 'South Australian Legislative Council',
    tas_la: 'Tasmanian House of Assembly', tas_ha: 'Tasmanian House of Assembly', tas_lc: 'Tasmanian Legislative Council',
    wa_la: 'Western Australian Legislative Assembly', wa_lc: 'Western Australian Legislative Council',
    act_la: 'Australian Capital Territory Legislative Assembly', nt_la: 'Northern Territory Legislative Assembly',
  }
  const chamber = chambers[String(args.chamber)] ?? jurisdictions[String(args.jurisdiction ?? 'federal')] ?? String(args.jurisdiction ?? args.chamber ?? 'Federal')
  const dates = divisions.map(d => d.date).sort()
  const period = args.date ? `on ${String(args.date)}` : args.since || args.until
    ? `from ${String(args.since ?? dates[0] ?? 'the start of the published record')} to ${String(args.until ?? dates.at(-1) ?? 'the end of the published record')}`
    : dates.length ? `from ${dates[0]} to ${dates.at(-1)}` : 'in the selected period'
  const bill = typeof args.bill === 'string' && args.bill ? ` matching bill ${args.bill}` : ''
  return `${chamber} divisions ${period}${bill}`
}

function sourceUrl(env: ToolEnv): string {
  return new URL('/divisions/index.json', env.origin ?? env.COMMUNITY_ORIGIN ?? 'https://opax.com.au').href
}

/** Aggregate already selected index rows without loading individual division files. */
export function aggregateDivisions(env: ToolEnv, args: ToolArgs, selected: DivisionSummary[]): StructuredToolResult {
  // A division TheyVoteForYou marks as a repeat records the same votes again; count it once.
  const divisions = selected.filter(d => !d.duplicate_of)
  const repeats = selected.length - divisions.length
  const repeatCoverage = repeats ? { excluded_duplicate_divisions: repeats } : {}
  const repeatNotes = repeats ? [`${repeats} selected divisions are marked by TheyVoteForYou as repeats of another published division with the same named votes, and are counted once.`] : []
  const party = resolveDivisionParty(args.party, divisions)
  const otherParty = resolveDivisionParty(args.other_party, divisions)
  const period = scope(args, divisions)
  if (party && !isDivisionParty(party) || otherParty && !isDivisionParty(otherParty)) {
    return { rows: [], citations: [], notes: ['Independents, unknown parties and presiding-officer groups have no coherent party majority.'], error: 'Choose a named party for this aggregate.' }
  }
  if (args.operation === 'party_agreement') {
    if (!party || !otherParty || party.toLowerCase() === otherParty.toLowerCase()) {
      return { rows: [], citations: [], notes: [], error: 'Party agreement requires two different named parties: party and other_party.' }
    }
    let same = 0, both = 0, excludedMissing = 0, excludedTies = 0, partialIncluded = 0, partialExcluded = 0, reportedUnknown = 0
    for (const division of divisions) {
      reportedUnknown += count(division.unknown_party_count)
      const a = division.party_tallies.find(t => t.party === party)
      const b = division.party_tallies.find(t => t.party === otherParty)
      const missing = !a || !b || count(a.votes.aye) + count(a.votes.no) === 0 || count(b.votes.aye) + count(b.votes.no) === 0
      const ma = partyMajority(a), mb = partyMajority(b)
      if (missing || !ma || !mb) {
        if (missing) excludedMissing++
        else excludedTies++
        if (division.member_coverage !== 'recorded') partialExcluded++
        continue
      }
      both++
      if (ma === mb) same++
      if (division.member_coverage !== 'recorded') partialIncluded++
    }
    const percentage = both ? Math.round(same / both * 10000) / 100 : null
    const row = { party, other_party: otherParty, same, both, percentage }
    const coverage = {
      total_divisions: divisions.length,
      excluded_missing_party_divisions: excludedMissing,
      excluded_tied_party_divisions: excludedTies,
      partial_member_list_divisions_included: partialIncluded,
      partial_member_list_divisions_excluded: partialExcluded,
      reported_unknown_party_members: reportedUnknown,
      ...repeatCoverage,
    }
    return {
      operation: 'party_agreement', rows: [row], total: both,
      summary: { ...row, ...coverage }, coverage,
      citations: [{
        text: `${period}: ${party} and ${otherParty} had the same party majority in ${same} of ${both} divisions where both parties had a strict aye/no majority${percentage === null ? ' (percentage unavailable: no eligible divisions)' : ` (${percentage}%)`}. Of ${divisions.length} selected divisions, ${excludedMissing} had missing party aye/no votes and ${excludedTies} had a tied party majority; ${partialIncluded} eligible divisions had partial member lists.`,
        url: sourceUrl(env), value: `${same}/${both}`, kind: 'count',
      }],
      notes: [
        'Party agreement compares each named party\'s strict majority of recorded aye and no votes. The denominator includes only divisions with a non-tied majority for both parties; there is no minimum party-size threshold.',
        'Published party tallies are used even when individual member lists are partial. Partial member-list coverage is reported separately and is not treated as a complete roll call.',
        'Independents, unknown parties and presiding-officer groups are excluded. Agreement describes recorded party majorities, not every member or a party policy position.',
        'Published party affiliations may reflect later affiliations. Comparisons use the published labels, not independently verified party membership on the division date.',
        'The unknown-party coverage count sums published index metadata. Unknown affiliations are not assigned to a named party and do not invalidate otherwise recorded party-majority comparisons.',
        ...repeatNotes,
      ],
    }
  }

  const totals = new Map<string, { party: string; member_votes: number; divisions: number }>()
  if (party) totals.set(party, { party, member_votes: 0, divisions: 0 })
  let full = 0, partial = 0, excludedSmall = 0, excludedTies = 0, excludedGroups = 0, reportedUnknown = 0
  const crossingDivisions = new Set<string>()
  for (const division of divisions) {
    if (division.member_coverage !== 'recorded') { partial++; continue }
    full++
    reportedUnknown += count(division.unknown_party_count)
    for (const tally of division.party_tallies) {
      if (party && tally.party !== party) continue
      if (!isDivisionParty(tally.party)) { excludedGroups++; continue }
      const ayes = count(tally.votes.aye), noes = count(tally.votes.no)
      if (ayes + noes < 5) { excludedSmall++; continue }
      if (ayes === noes) { excludedTies++; continue }
      const row = totals.get(tally.party) ?? { party: tally.party, member_votes: 0, divisions: 0 }
      const minority = Math.min(ayes, noes)
      row.member_votes += minority
      if (minority > 0) { row.divisions++; crossingDivisions.add(division.key) }
      totals.set(tally.party, row)
    }
  }
  const rows = [...totals.values()].sort((a, b) => b.member_votes - a.member_votes || a.party.localeCompare(b.party))
  const memberVotes = rows.reduce((sum, row) => sum + row.member_votes, 0)
  const coverage = {
    total_divisions: divisions.length,
    full_member_list_divisions: full,
    excluded_partial_member_list_divisions: partial,
    excluded_small_party_division_groups: excludedSmall,
    excluded_tied_party_division_groups: excludedTies,
    excluded_non_party_division_groups: excludedGroups,
    reported_unknown_party_members: reportedUnknown,
    ...repeatCoverage,
  }
  return {
    operation: 'floor_crossing', rows, total: memberVotes,
    summary: { member_votes: memberVotes, divisions: crossingDivisions.size, ...coverage }, coverage,
    citations: [{
      text: `${period}: ${memberVotes} member-votes against a party's strict majority across ${crossingDivisions.size} divisions${party ? ` for ${party}` : ''}. ${rows.length ? rows.map(row => `${row.party}: ${row.member_votes} member-votes in ${row.divisions} divisions`).join('; ') + '. ' : ''}${full} divisions had full member lists; ${partial} partial member-list divisions, ${excludedSmall} party-division groups with fewer than five aye/no voters and ${excludedTies} tied party-division groups were excluded.`,
      url: sourceUrl(env), value: memberVotes, kind: 'count',
    }],
    notes: [
      'Floor crossings count minority member-votes against their own party\'s strict aye/no majority, using only divisions with full recorded member lists and parties with at least five recorded aye/no votes in that division.',
      'Counts are member-votes, not unique members. A division with three minority party members contributes three crossings. The divisions column counts divisions with at least one crossing for that party.',
      'Tied parties, abstentions, absences, Independents, unknown parties and presiding-officer groups are excluded. A zero means no eligible recorded crossings under this definition, not proof that no political dissent occurred.',
      'The unknown-party coverage count sums the published index metadata for full member-list divisions; those members cannot be assigned a party majority from unknown affiliation alone.',
      'Published party affiliations may reflect later affiliations. Floor crossing here is calculated dissent from published party labels, not independently verified historical floor crossing.',
      ...repeatNotes,
    ],
  }
}
