/** Member voting history from source division files, not the recent-vote sample. */
import { isDivisionParty } from './division-aggregates'
import { memberResolutionNotes, resolveMember } from './member-records'
import { clip, fold, siteUrl } from './record-common'
import { inWindow, object, publishedResult, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, ToolInputError, type ToolCitation, type ToolDefinition } from './types'

const CHAMBERS = ['senate', 'representatives', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'qld_la', 'sa_ha', 'sa_lc', 'act_la', 'nt_la', 'wa_la', 'wa_lc', 'tas_ha', 'tas_lc']
const KEY = /^(?:federal-(?:senate|representatives)|(?:nsw|vic|sa|qld|act|nt|wa|tas)-(?:la|lc|ha))-[a-z0-9-]+$/
const chamberOf = (d: RecordRow) => typeof d.house === 'string' ? d.house : String(d.key).startsWith('federal-') ? String(d.key).split('-')[1] : String(d.key).split('-').slice(0, 2).join('_')
const pidOf = (value: unknown) => String(value ?? '').replace(/^tvfy_/, '')
const keyName = (value: unknown) => fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 24)
const direction = (aye: number, no: number) => aye === no ? null : aye > no ? 'aye' : 'no'

export const tool: ToolDefinition = {
  name: 'member_divisions',
  description: 'Read how a resolved member voted across the published federal or state divisions, with aye/no/explicit absent/paired counts and votes against an eligible published party majority. Filter date range, chamber, jurisdiction, topic title words or bill keyword/key. Each row has division_id and a follow_up for the division tool. Recent votes.json and the D1 votes table are samples, so this tool scans the authoritative division files instead. operation=list returns up to 8 rows; operation=count scans up to scan_limit divisions without listing rows. Counts cover the disjoint scanned segment. Follow next_call until next_cursor=null and combine segment counts from the same scan_id for a full selection. A complete count follows the final cursor. A missing member row is unrecorded, not absent. Dissent uses reconciled complete lists, a strict majority and at least five party aye/no votes; published labels may not reflect historical affiliation.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120 }, operation: { type: 'string', enum: ['list', 'count'] },
    topic: { type: 'string', minLength: 2, maxLength: 200, description: 'Words in division title/question or linked bill titles, not machine topic labels.' },
    bill: { type: 'string', minLength: 2, maxLength: 200, description: 'Bill title keyword or exact published federal bill key.' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    chamber: { type: 'string', enum: CHAMBERS }, jurisdiction: { type: 'string', enum: ['all', 'federal', 'nsw', 'vic', 'qld', 'sa', 'act', 'nt', 'wa', 'tas'] },
    cursor: { type: 'string', pattern: '^[a-f0-9]{24}-[0-9]{1,6}$', description: 'Copy next_cursor or next_call; bound to the member, filters, operation and index snapshot.' },
    scan_limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum division files examined in one call, default 100.' },
    limit: { type: 'integer', minimum: 1, maximum: 8 },
  }, required: ['person'], examples: [{ person: 'David Shoebridge', since: '2026-10-15', until: '2026-10-15', chamber: 'senate' }, { person: 'Christopher Back', topic: 'housing', since: '2015-03-18', until: '2015-03-18' }] },
  identifierFields: ['person'],
  validate: args => validWindow(args) && ['topic', 'bill'].every(k => !args[k] || /[\p{L}\p{N}]/u.test(String(args[k]))) &&
    (!args.jurisdiction || args.jurisdiction === 'all' || !args.chamber || (['senate', 'representatives'].includes(String(args.chamber)) ? args.jurisdiction === 'federal' : String(args.chamber).startsWith(args.jurisdiction + '_'))),
  stepLabel: args => ({ label: 'Checking member voting history', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const { people, person, resolution } = await resolveMember(env, String(args.person))
    if (!person) return { rows: [], citations: [], notes: memberResolutionNotes, candidates: resolution.candidates.slice(0, 5).map(c => c.person.name) }
    const index = object(await readToolAsset(env, '/divisions/index.json'))
    if (!Array.isArray(index.divisions)) throw new Error('Division index unavailable')
    const names = new Set([person.name, person.full, ...(Array.isArray(person.prints) ? person.prints : [])].filter(Boolean).map(keyName))
    if (person.pid) for (const p of people.filter(p => p.pid === person.pid)) names.add(keyName(p.name))
    const states = Array.isArray(person.states) ? person.states : []
    // A division TheyVoteForYou marks as a repeat of another (duplicate_of) records the same votes again: count it once.
    let candidates = records(index.divisions).filter(d => typeof d.key === 'string' && KEY.test(d.key) && !d.duplicate_of && inWindow(d.date, args) &&
      (!args.chamber || chamberOf(d) === args.chamber) && (!args.jurisdiction || args.jurisdiction === 'all' ? !states.length || states.includes(String(d.key).split('-')[0]) : String(d.key).startsWith(args.jurisdiction + '-')))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.key).localeCompare(String(b.key)))
    let linked: Set<string> | undefined, billTitle = ''
    if (args.bill && /^au-federal-[a-z0-9-]+$/.test(String(args.bill))) {
      const bills = object(await readToolAsset(env, '/bills/index.json'))
      if (!Array.isArray(bills.bills)) throw new Error('Bill index unavailable')
      const b = records(bills.bills).find(b => b.key === args.bill)
      if (b) {
        const detail = object(await readToolAsset(env, `/bills/${b.key}.json`))
        if (detail.key !== b.key || !Array.isArray(detail.divisions)) throw new Error('Bill division links unavailable')
        linked = new Set(records(detail.divisions).map(d => String(d.key)))
        billTitle = String(b.title ?? '')
        candidates = candidates.filter(d => linked!.has(String(d.key)))
      } else candidates = []
    }
    const scan_id = await digest({ person: person.pid ?? person.name, filters: Object.fromEntries(['operation', 'topic', 'bill', 'since', 'until', 'chamber', 'jurisdiction'].map(k => [k, args[k] ?? null])), index: candidates.map(d => [d.key, d.date, d.member_count, d.party_tallies]), coverage: index.coverage })
    const start = args.cursor ? Number(String(args.cursor).split('-')[1]) : 0
    if (args.cursor && (!String(args.cursor).startsWith(scan_id + '-') || start > candidates.length)) throw new ToolInputError('member_divisions')
    const rows: RecordRow[] = [], citations: ToolCitation[] = []
    const counts = { aye: 0, no: 0, absent: 0, paired: 0, other: 0, member_unrecorded: 0, ambiguous_member: 0, against_party_majority: 0, party_comparisons: 0, party_comparison_unavailable: 0, matching_divisions: 0 }
    // max_bytes is for other tools that page this scan; it is not in the public schema.
    const scanLimit = Number(args.scan_limit) || 100, rowLimit = Number(args.limit) || 5, budget = Number(args.max_bytes) || 10_500
    let position = start, stop = false
    while (position < candidates.length && position - start < scanLimit && !stop) {
      env.signal?.throwIfAborted()
      const batch = candidates.slice(position, Math.min(position + 6, start + scanLimit))
      const loaded = await Promise.all(batch.map(d => readToolAsset(env, `/divisions/division-${d.key}.json`).then(object)))
      for (let i = 0; i < loaded.length; i++) {
        const d = loaded[i], selected = batch[i]
        if (d.key !== selected.key || d.date !== selected.date || !Array.isArray(d.members)) throw new Error('Division detail missing or inconsistent')
        position++
        const text = [d.name, d.question, ...records(d.bills).flatMap(b => [b.title, b.key]), ...records(selected.bills).flatMap(b => [b.title, b.key])]
        if (args.topic && !wordsMatch(args.topic, text) || args.bill && !linked && !wordsMatch(args.bill, text)) continue
        counts.matching_divisions++
        const members = records(d.members)
        const found = members.filter(m => {
          const sameName = names.has(keyName(m.name)), pid = pidOf(m.person_id)
          return sameName && (!person.pid || !pid || pid === person.pid)
        })
        if (!found.length) { counts.member_unrecorded++; continue }
        if (found.length > 1) { counts.ambiguous_member++; continue }
        const member = found[0], vote = String(member.vote ?? 'unknown'), party = typeof member.party === 'string' ? member.party : null
        const countKey = ['aye', 'no', 'absent', 'paired'].includes(vote) ? vote as 'aye' | 'no' | 'absent' | 'paired' : 'other'
        counts[countKey]++
        const partyMembers = party ? members.filter(m => m.party === party) : []
        const aye = partyMembers.filter(m => m.vote === 'aye').length, no = partyMembers.filter(m => m.vote === 'no').length
        const complete = object(d._meta).member_coverage === 'recorded' && members.filter(m => m.vote === 'aye').length === d.ayes && members.filter(m => m.vote === 'no').length === d.noes
        const majority = party && isDivisionParty(party) && aye + no >= 5 && complete ? direction(aye, no) : null
        const compared = !!majority && ['aye', 'no'].includes(vote), against = compared ? vote !== majority : null
        if (compared) { counts.party_comparisons++; if (against) counts.against_party_majority++ } else counts.party_comparison_unavailable++
        if (args.operation !== 'count') {
          const division_id = String(d.key), url = siteUrl(env, '/doc/division-' + division_id), source_url = sourceUrl(d.source_url)
          const row = { division_id, title: clip(d.name ?? d.question, 350), date: d.date, chamber: d.house, jurisdiction: d.jurisdiction,
            person: person.name, vote, party, party_majority: majority, against_party_majority: against, party_ayes: aye, party_noes: no,
            member_list_complete: complete, source_url, source_status: source_url ? 'original division source' : 'original URL not recorded; cite OPAX division', url,
            follow_up: { tool: 'division', arguments: { division_id, person: person.name } } }
          const citation: ToolCitation = { kind: 'record', url: source_url ?? url, text: `${person.name} ${vote === 'aye' || vote === 'no' ? 'voted ' : 'was explicitly recorded as '}${vote} in ${row.title} (${d.date}, ${d.house}, division ${division_id}).${compared ? ` ${party} recorded ${aye} ayes and ${no} noes; ${against ? 'against' : 'with'} the published party majority.` : ' No eligible party-majority comparison is established.'}` }
          // Stop before committing a row that cannot fit. This division is scanned next call.
          if (rows.length && new TextEncoder().encode(JSON.stringify({ rows: [...rows, row], citations: [...citations, citation] })).length > budget) {
            position--; counts.matching_divisions--; counts[countKey]--
            if (compared) { counts.party_comparisons--; if (against) counts.against_party_majority-- } else counts.party_comparison_unavailable--
            stop = true; break
          }
          rows.push(row); citations.push(citation)
          if (rows.length >= rowLimit) { stop = true; break }
        }
      }
    }
    const next_cursor = position < candidates.length ? `${scan_id}-${position}` : null
    const scope = [args.chamber ?? args.jurisdiction ?? 'published member jurisdictions', args.since ? 'since ' + args.since : '', args.until ? 'until ' + args.until : '', args.bill ? 'bill ' + (billTitle || args.bill) : '', args.topic ? 'title words ' + args.topic : ''].filter(Boolean).join(', ')
    const countCite: ToolCitation = { kind: 'count', url: siteUrl(env, '/divisions/index.json'), text: `${person.name} (${scope}), scanned segment ${start}-${position} of ${candidates.length} scoped division records: ${counts.aye} aye, ${counts.no} no, ${counts.absent} explicitly absent, ${counts.paired} paired; ${counts.against_party_majority} against a party majority out of ${counts.party_comparisons} eligible comparisons. ${counts.member_unrecorded} matching divisions have no member row, not an absence.${next_cursor || start ? ' These are segment counts; combine all disjoint segments from this scan_id before stating a full selection total.' : ' This call examined the complete scoped index selection.'}` }
    return publishedResult(rows, [countCite, ...citations], { person: person.name, counts, scan_id, segment: { start, end: position, examined: position - start },
      scoped_divisions: candidates.length, scan_complete: next_cursor === null, counts_complete_for_scope: start === 0 && next_cursor === null,
      counts_scope: 'this scanned segment only', next_cursor, next_call: next_cursor ? { ...args, person: person.name, cursor: next_cursor } : null,
      coverage: index.coverage, notes: ['Missing member rows do not establish absence. Absent and paired counts require explicit source votes.',
        'Dissent is calculated from published party labels in reconciled complete lists, with at least five party aye/no votes and a strict majority. It is not independently verified historical floor crossing.',
        ...(next_cursor ? ['More divisions remain. Continue with next_call and combine disjoint segment counts; these counts are not a whole-history total.'] : []),
        ...(counts.member_unrecorded || counts.ambiguous_member ? ['Some matching divisions have no unambiguous member row; their voting direction cannot be established.'] : [])] })
  },
}
