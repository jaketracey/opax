/** Topic-wide party voting from the published tallies, never from a member's row window. */
import { normalize } from '../catalog-query.mjs'
import { partyMajority, resolveDivisionParty, isDivisionParty, type DivisionSummary } from './division-aggregates'
import { siteUrl, tableRows } from './record-common'
import { readToolAsset, type ToolArgs, type ToolEnv, type StructuredToolResult } from './types'

export function policyTerms(title: string): string[] {
  // Disclose this expansion in the result so it defines a reproducible title selection.
  return normalize(title) === 'climate' || normalize(title) === 'climate change'
    ? ['climate', 'carbon', 'greenhouse', 'emissions', 'clean energy', 'renewable energy'] : [title]
}
const matches = (title: string, term: string) => {
  const words = normalize(title).split(' ')
  return normalize(term).split(' ').filter(Boolean).every(t => words.some(w => w === t || w === t + 's'))
}
type Selected = DivisionSummary & { title: string; category: 'bill' | 'motion' }

export async function policyVotes(env: ToolEnv, args: ToolArgs, candidates: DivisionSummary[]): Promise<StructuredToolResult> {
  const terms = policyTerms(String(args.title)), names = new Map<string, string>(), wanted = new Set(candidates.map(d => d.key))
  const complete = await Promise.all(terms.map(async term => {
    let seen = 0, total = Infinity
    for (let page = 1; seen < total && page <= 5; page++) {
      env.signal?.throwIfAborted()
      const result = await tableRows(env, 'divisions', { q: term, sort: 'date:desc', pageSize: '200', page: String(page),
        ...(args.jurisdiction && args.jurisdiction !== 'all' ? { 'f.jurisdiction': JSON.stringify([args.jurisdiction]) } : {}),
        ...(args.chamber ? { 'f.house': JSON.stringify([args.chamber]) } : {}) })
      total = result.total; seen += result.rows.length
      for (const row of result.rows) {
        const key = String(row.id ?? '').replace(/^division-/, ''), title = String(row.name ?? row.title ?? '')
        if (wanted.has(key) && matches(title, term)) names.set(key, title)
      }
      if (!result.rows.length) break
    }
    return seen >= total
  }))
  const selected: Selected[] = candidates.filter(d => !d.duplicate_of && (names.has(d.key) || d.bills?.some(b => terms.some(t => matches(b.title, t)))))
    .map<Selected>(d => ({ ...d, title: names.get(d.key) ?? d.bills!.map(b => b.title).join(', '), category: d.bills?.length || /\bbills?\b/i.test(names.get(d.key) ?? '') ? 'bill' : 'motion' }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
  const party = resolveDivisionParty(args.party, selected)
  if (!party || !isDivisionParty(party)) return { rows: [], citations: [], notes: [], error: 'Choose a named party for a policy voting aggregate.' }
  const tally = (d: Selected) => d.party_tallies.find(p => p.party.toLowerCase() === party.toLowerCase())
  const direction = (d: Selected) => {
    const p = tally(d), aye = p?.votes.aye ?? 0, no = p?.votes.no ?? 0
    return !aye && !no ? 'unrecorded' : partyMajority(p) ?? 'tied'
  }
  const summarise = (rows: Selected[]) => ({ divisions: rows.length, aye: rows.filter(d => direction(d) === 'aye').length,
    no: rows.filter(d => direction(d) === 'no').length, tied: rows.filter(d => direction(d) === 'tied').length,
    unrecorded: rows.filter(d => direction(d) === 'unrecorded').length,
    split: rows.filter(d => (tally(d)?.votes.aye ?? 0) > 0 && (tally(d)?.votes.no ?? 0) > 0).length,
    partial: rows.filter(d => d.member_coverage !== 'recorded').length })
  const summary = summarise(selected), byKind = (['bill', 'motion'] as const).map(category => ({ category, ...summarise(selected.filter(d => d.category === category)) }))
  const dates = selected.map(d => d.date).sort(), period = `${args.since ?? dates[0] ?? 'the start of the record'} to ${args.until ?? dates.at(-1) ?? 'the end of the record'}`
  const wording = (s: ReturnType<typeof summarise>) => `an aye majority in ${s.aye}, a no majority in ${s.no}, a tied aye/no vote in ${s.tied} and no party-labelled aye/no vote in ${s.unrecorded}`
  const lead = `${party} recorded ${wording(summary)} across ${summary.divisions} matching divisions for ${args.title} (${period}).`
  const breakdown = byKind.map(s => `${party} recorded ${wording(s)} across ${s.divisions} matching ${s.category === 'bill' ? 'bill divisions (including amendments and procedural votes)' : 'motions and other non-bill divisions'}.`)
  const representatives: Selected[] = []
  const add = (d: Selected | undefined) => { if (d && representatives.length < 6 && !representatives.some(r => r.key === d.key)) representatives.push(d) }
  for (const category of ['bill', 'motion']) for (const side of ['aye', 'no']) add(selected.find(d => d.category === category && direction(d) === side))
  add(selected.at(-1)); add(selected[0])
  const rows = await Promise.all(representatives.map(async d => {
    const detail = await readToolAsset(env, `/divisions/division-${d.key}.json`) as { name?: string; source_url?: string } | null
    return { id: d.key, date: d.date, title: detail?.name ?? d.title, category: d.category, party, majority: direction(d),
      ayes: tally(d)?.votes.aye ?? 0, noes: tally(d)?.votes.no ?? 0, url: siteUrl(env, '/doc/division-' + d.key), source_url: detail?.source_url ?? null }
  }))
  const selection = `Title selection: ${terms.join('; ')}. Linked bill titles are also matched. Repeat divisions are counted once. This is a title-matched selection, not every vote on the policy area. An aye or no is the side of the specific question, not support for or opposition to the policy.`
  const qualifications = `Party majorities use published party labels, which may reflect later affiliations. ${summary.split} divisions had both aye and no votes within the party; ${summary.partial} had partial member lists. Missing votes do not establish absence.`
  const url = siteUrl(env, '/divisions/index.json'), related = rows.map(r => ({ label: `${r.date}: ${r.title}`, url: r.url }))
  return { operation: 'policy_votes', rows, total: selected.length, summary, by_kind: byKind, search_complete: complete.every(Boolean),
    coverage: { since: dates[0] ?? null, until: dates.at(-1) ?? null, as_of: null },
    citations: [{ kind: 'count', text: lead, url, related }, ...breakdown.map(text => ({ kind: 'count' as const, text, url, related })),
      ...rows.map(r => ({ kind: 'record' as const, text: `On ${r.date}, ${party} recorded ${r.ayes} ${r.ayes === 1 ? 'aye' : 'ayes'} and ${r.noes} ${r.noes === 1 ? 'no' : 'noes'} on ${r.title.replace(/\s*—\s*/g, ', ')}.`, url: r.url }))],
    notes: [selection, qualifications, ...(!complete.every(Boolean) ? ['The title search reached a search window; these counts are lower bounds for that selection.'] : [])] }
}
