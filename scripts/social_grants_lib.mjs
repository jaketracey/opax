// Pure functions behind the grants files the daily edition reads (build_social_catalog.mjs
// writes them; portal/test/social-grants-catalog.test.mjs pins them). Every figure is read
// from files the site already publishes: the GrantConnect program files (whose seat holders
// and blocs export_grants.py reads, since 29 Sep 2026, from the member's party on the grant
// date) and recipient shards, and the electorates release (AEC results plus parliamentary
// service records with dated party periods), which gives the House on a day for the
// share-of-seats baseline. Nothing here is estimated or inferred beyond what those files say.

/** Party spellings the electorates release and the grants files use for the same party. */
const PARTY_CANON = [
  [/^liberal national party( of queensland)?$/i, 'LNP'],
  [/^(australian labor party.*|a\.?l\.?p\.?|labor)$/i, 'Labor'],
  [/^(lp|liberal( party)?( of australia)?)$/i, 'Liberal'],
  [/^(np|nat|nats|the nationals|national party|nationals)$/i, 'Nationals'],
  [/^(clp|country liberal party)$/i, 'Country Liberal Party'],
  [/^(the )?(australian |queensland )?greens( \(vic\))?$/i, 'Greens'],
  [/^katter'?s australian party( \(kap\))?$|^kap$/i, "Katter's Australian Party"],
  [/^(ca|centre alliance)$/i, 'Centre Alliance'],
  [/^(ind|independent|independent members)$/i, 'Independent'],
  [/^(phon|one nation|pauline hanson's one nation)$/i, 'One Nation'],
]
export function canonParty (raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  for (const [re, name] of PARTY_CANON) if (re.test(text)) return name
  return text
}

/** The three groups every seat figure is shown in, always all three, always in this order. */
export const PARTY_GROUPS = ['Labor', 'Coalition', 'Crossbench']
/** Labor and the Coalition by the grants file's own bloc table; every other party and independent is crossbench. */
export function partyGroup (party, blocs) {
  const p = canonParty(party)
  if (!p) return null
  const bloc = blocs?.[p]
  return bloc === 'Labor' || bloc === 'Coalition' ? bloc : 'Crossbench'
}

/** Whole percentages that add up to exactly 100 (largest remainder), so a reader's sum checks out. */
export function wholePercents (values) {
  const total = values.reduce((s, v) => s + v, 0)
  if (!total) return values.map(() => 0)
  const raw = values.map(v => v / total * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((s, v) => s + v, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left-- }
  return out
}

/** The government on a day, from the grants file's meta.government ([[from, to|null, bloc], ...]). */
export function governmentOn (day, government) {
  for (const [from, to, bloc] of government ?? []) if (from <= day && (!to || day < to)) return bloc
  return null
}

/**
 * Every federal House seat's holders over time from the electorates release:
 * dated party periods from the parliamentary service records, and the AEC
 * contest winners to fill a seat the service records leave empty.
 * `details` is the list of electorate detail files (federal, representatives).
 */
export function seatTimelines (details) {
  const seats = new Map()
  for (const d of details) {
    if (d?.jurisdiction !== 'federal' || d?.chamber !== 'representatives' || !d.name) continue
    const people = d.people ?? {}
    const terms = [...(d.terms ?? [])].sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')))
    const periods = []
    for (const t of terms) {
      let own = (t.party_periods ?? []).filter(p => p?.start)
      if (!own.length && t.source_party_label === 'SPK') {
        // A Speaker's term carries no party: the member's party once out of the Chair, else the one before
        // (the same rule as export_grants.py seat_periods_from_release).
        const same = terms.filter(u => u.person_id === t.person_id && (u.party_periods ?? []).length)
        const after = same.filter(u => String(u.start ?? '') >= String(t.end ?? '9999'))
        const before = same.filter(u => String(u.end ?? '9999') <= String(t.start ?? ''))
        const src = after.length ? after[0].party_periods[0] : before.length ? before.at(-1).party_periods.at(-1) : null
        if (src) own = [{ start: t.start, end: t.end ?? null, party: src.party }]
      }
      for (const p of own) periods.push({ start: p.start, end: p.end ?? null, party: canonParty(p.party), person: people[t.person_id]?.name ?? null })
    }
    periods.sort((a, b) => a.start.localeCompare(b.start))
    const contests = []
    for (const e of d.elections ?? []) {
      const day = e.election?.poll_date
      const contest = (d.contests ?? []).find(c => c.contest_id === e.contest_id) ?? e
      const winner = (contest.candidates ?? []).find(c => c.elected)
      if (day && winner) contests.push({ day, party: canonParty(winner.party), person: winner.name ?? null })
    }
    contests.sort((a, b) => a.day.localeCompare(b.day))
    seats.set(seatKey(d.name), { name: d.name, periods, contests })
  }
  return seats
}
export const seatKey = (name) => String(name ?? '').trim().toLowerCase()

const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

/**
 * The member holding a seat on a day and their party that day, or null, by the
 * same rules as export_grants.py seat_holder: a service-record period covering
 * the day decides (a period ending the day before the next begins covers its
 * end day); a gap closed by a general election (`elections`) is the campaign
 * after a dissolution and stays with the last member; any other gap is a
 * vacancy. Before the first period or after the last, the latest AEC winner.
 */
export function holderOn (seat, day, elections = []) {
  if (!seat || !day) return null
  const starts = new Set(seat.periods.map(p => p.start))
  const hit = seat.periods.find(p => p.start <= day && (!p.end || day < p.end || (day === p.end && starts.has(nextDay(p.end)))))
  if (hit) return { person: hit.person, party: hit.party }
  const ended = seat.periods.filter(p => p.end && p.end <= day)
  const later = seat.periods.filter(p => p.start > day)
  if (ended.length && later.length) {
    const next = later.reduce((a, b) => (b.start < a.start ? b : a))
    if (!elections.includes(next.start)) return null
    const prev = ended.reduce((a, b) => (b.end > a.end ? b : a))
    return { person: prev.person, party: prev.party }
  }
  const won = seat.contests.filter(c => c.day <= day).at(-1)
  return won ? { person: won.person, party: won.party } : null
}

/** The share of House seats each group held on a day; null when the record covers too few seats to say. */
export function houseShares (seats, day, blocs, minSeats = 140, elections = []) {
  const counts = { Labor: 0, Coalition: 0, Crossbench: 0 }
  let n = 0
  for (const seat of seats.values()) {
    const h = holderOn(seat, day, elections)
    const g = h && partyGroup(h.party, blocs)
    if (!g) continue
    counts[g]++
    n++
  }
  if (n < minSeats) return null
  return { n, shares: Object.fromEntries(PARTY_GROUPS.map(g => [g, counts[g] / n])) }
}

/** The grant date the program files use: the agreement start, else the approval date. */
export const grantDay = (g) => g?.s || g?.a || ''

/**
 * GrantConnect categories whose awards pay for something at a place (a hall, a
 * pool, a road, a sports ground). A seat means something for these. A service
 * program's award is mapped to where its provider is registered, which is
 * mostly a capital-city head office, so a seat split of one would mislead.
 */
export const PLACE_CATEGORIES = new Set(['Regional Development', 'Recreation and Sport', 'Infrastructure', 'Local Government', 'Rural Development', 'Community Safety', 'Heritage', 'Commemorative'])
const HEAD_OFFICE_KINDS = new Set(['university', 'government', 'undisclosed', 'individual', 'super fund'])

/**
 * One program's money by the party holding the seat on each grant's date,
 * against the share of House seats each group held on those dates. The member,
 * their party and the government / opposition / crossbench side on the grant
 * date are the program file's own (export_grants.py: dated party periods), so
 * the post and the program page read one set of figures; this adds the
 * three-group split and the House baseline. Only a program whose file lists
 * every award can be summed from its grants; the rest return null.
 */
export function programSeatSplit (program, seats, meta, { memo = new Map() } = {}) {
  if (!program || !Array.isArray(program.grants) || program.grants_listed !== program.grants_total) return null
  const blocs = meta?.blocs ?? {}
  const elections = meta?.elections ?? []
  const groups = Object.fromEntries(PARTY_GROUPS.map(g => [g, [0, 0]]))
  const blocSplit = { gov: [0, 0], opp: [0, 0], cross: [0, 0] }
  const expected = Object.fromEntries(PARTY_GROUPS.map(g => [g, 0]))
  const governed = {}
  const bySeat = new Map()
  let mapped = 0, mappedCount = 0, first = '', last = ''
  for (const g of program.grants) {
    const v = Number(g.v)
    if (!Number.isFinite(v) || v <= 0) continue
    const day = grantDay(g)
    if (!day) continue
    const gov = governmentOn(day, meta?.government)
    if (gov) governed[gov] = (governed[gov] ?? 0) + v
    const holder = g.el && Array.isArray(g.holder) && g.holder[1] ? { person: g.holder[0] ?? null, party: g.holder[1] } : null
    const group = holder ? partyGroup(holder.party, blocs) : null
    if (!group) continue
    const key = `${day}`
    if (!memo.has(key)) memo.set(key, houseShares(seats, day, blocs, 140, elections))
    const house = memo.get(key)
    if (!house) continue
    groups[group][0] += v
    groups[group][1] += 1
    const side = ['gov', 'opp', 'cross'].includes(g.bloc) ? g.bloc : null
    if (side) { blocSplit[side][0] += v; blocSplit[side][1] += 1 }
    for (const k of PARTY_GROUPS) expected[k] += v * house.shares[k]
    mapped += v
    mappedCount++
    if (!first || day < first) first = day
    if (!last || day > last) last = day
    const row = bySeat.get(g.el) ?? { n: g.el, st: g.elst ?? null, t: 0, c: 0, gov: 0, opp: 0, cross: 0, holders: new Map() }
    row.t += v
    row.c += 1
    if (side) row[side] += v
    const hk = `${holder.person ?? ''}|${holder.party ?? ''}`
    const h = row.holders.get(hk) ?? { person: holder.person, party: holder.party, t: 0 }
    h.t += v
    row.holders.set(hk, h)
    bySeat.set(g.el, row)
  }
  if (!mapped) return null
  const seatsOut = [...bySeat.values()].sort((a, b) => b.t - a.t || a.n.localeCompare(b.n)).map(r => ({
    n: r.n, st: r.st, t: r.t, c: r.c, gov: r.gov, opp: r.opp, cross: r.cross,
    holders: [...r.holders.values()].sort((a, b) => b.t - a.t).map(h => [h.person, h.party, h.t]),
  }))
  return {
    mapped: [mapped, mappedCount],
    groups,
    blocSplit,
    seatShare: Object.fromEntries(PARTY_GROUPS.map(k => [k, expected[k] / mapped])),
    governed,
    first, last,
    seatCount: seatsOut.length,
    seats: seatsOut,
  }
}

/** Whether a program is one the edition can fairly tell by seat. The reasons it is not are returned for the build log. */
export function programEligible (program, split, { minTotal = 20e6, minMappedShare = 0.5, minSeats = 8, maxTopSeat = 0.5, minLocalShare = 0.5 } = {}) {
  if (!program || !split) return 'no seat split'
  if (program.jur !== 'federal') return 'not federal'
  if (!PLACE_CATEGORIES.has(program.cats?.[0]?.[0])) return 'not a place-based category'
  if (!(program.t >= minTotal)) return 'too small'
  if (split.mapped[0] / program.t < minMappedShare) return 'too few dollars placed in a seat'
  if (split.seatCount < minSeats) return 'too few seats'
  if (split.seats[0].t / split.mapped[0] > maxTopSeat) return 'one seat dominates'
  // Head offices sit in capital-city seats: a program paid mostly to universities
  // and state departments says where they are registered, not where the money lands.
  const recipients = program.recipients ?? []
  const all = recipients.reduce((s, r) => s + (Number(r[3]) || 0), 0)
  const local = recipients.filter(r => !HEAD_OFFICE_KINDS.has(r[2])).reduce((s, r) => s + (Number(r[3]) || 0), 0)
  if (!all || local / all < minLocalShare) return 'mostly head-office recipients'
  return null
}

/** Which government awarded most of it: a bloc with at least `share` of the dollars, else "both". */
export function programEra (governed, share = 0.7) {
  const total = Object.values(governed ?? {}).reduce((s, v) => s + v, 0)
  if (!total) return 'both'
  for (const [bloc, v] of Object.entries(governed)) if (v / total >= share) return bloc
  return 'both'
}

/** The program row the edition and the program page both read. */
export function programRecord (program, split) {
  const sel = Object.entries(program.sel ?? {}).map(([k, [d, c]]) => [k, d, c]).sort((a, b) => b[1] - a[1])
  return {
    id: program.id, key: program.key, n: program.n, ag: program.ag ?? null,
    t: program.t, c: program.c, r: program.r ?? null, y0: program.y0 ?? null, y1: program.y1 ?? null,
    sel, selKnown: program.sel_known ?? [0, 0], adhoc: program.adhoc ?? 0,
    mapped: split.mapped, groups: split.groups, seatShare: split.seatShare, governed: split.governed,
    // The whole percentages the post and the program page both print, computed once so they cannot disagree.
    split: splitPercents(split),
    blocSplit: split.blocSplit,
    era: programEra(split.governed), first: split.first, last: split.last, seatCount: split.seatCount,
    seats: split.seats.slice(0, 8),
    recipients: (program.recipients ?? []).slice(0, 5).map(r => [r[0], r[1], r[2], r[3], r[4]]),
    timing: program.timing?.months_to_election ?? null,
  }
}

/** [{group, d, c, pct, seatPct}] in PARTY_GROUPS order: the placed dollars and the House, as whole percentages. */
export function splitPercents (split) {
  const pcts = wholePercents(PARTY_GROUPS.map(g => split.groups[g][0]))
  const seatPcts = wholePercents(PARTY_GROUPS.map(g => split.seatShare[g]))
  return PARTY_GROUPS.map((group, i) => ({ group, d: split.groups[group][0], c: split.groups[group][1], pct: pcts[i], seatPct: seatPcts[i] }))
}

/** A month is complete once every award in it must have been published: 21 days after its last day. */
export function monthComplete (month, asOf, days = 21) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = Date.UTC(y, m, 0)
  return Date.parse(`${asOf}T00:00:00Z`) >= lastDay + days * 86400000
}

/**
 * The largest awards to organisations whose agreements start in each complete
 * month, one row per recipient (its largest award that month, with a count of
 * the rest). `awards` rows: {id, v, s, rid, rn, k, pr, ag, desc|n, sel, el, elst, guid}.
 */
export function largestByMonth (awards, asOf, { months = 12, perMonth = 10 } = {}) {
  const byMonth = new Map()
  for (const g of awards) {
    if (!/^GA\d+(?:-A\d+)?$/.test(g.id ?? '') || !/^abn:\d{11}$/.test(g.rid ?? '') || !g.guid) continue
    if (g.k === 'person' || g.k === 'individual') continue
    const v = Number(g.v)
    if (!Number.isFinite(v) || v <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(g.s ?? '') || g.s > asOf) continue
    const month = g.s.slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, new Map())
    const rows = byMonth.get(month)
    const prev = rows.get(g.rid)
    if (!prev) rows.set(g.rid, { best: g, more: 0 })
    else {
      prev.more++
      if (v > prev.best.v || (v === prev.best.v && g.id < prev.best.id)) prev.best = g
    }
  }
  const out = {}
  const keys = [...byMonth.keys()].filter(m => monthComplete(m, asOf)).sort().reverse().slice(0, months)
  for (const month of keys) {
    const rows = [...byMonth.get(month).values()].sort((a, b) => b.best.v - a.best.v || a.best.id.localeCompare(b.best.id)).slice(0, perMonth)
    // No seat or member: the largest awards go to national bodies whose postcode is a head office.
    out[month] = rows.map(({ best: g, more }) => ({
      id: g.id, recipientId: g.rid, recipient: g.rn, amount: g.v, start: g.s,
      purpose: String(g.desc || g.n || '').replace(/\s+/g, ' ').trim(),
      program: g.pr ?? null, agency: g.ag ?? null, selection: g.sel ?? null, more,
      sourceUrl: `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(g.guid)}`,
    }))
  }
  return out
}
