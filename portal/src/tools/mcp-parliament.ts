/** Public MCP: divisions, voting records, bills and Hansard, read through the same handlers as Ask and the record pages. */
import { tokens, normalize } from '../catalog-query.mjs'
import { tool as division, DIVISION_NOTES } from './division'
import { tool as memberDivisions } from './member-divisions'
import { resolveMember } from './member-records'
import { tool as sponsoredBills } from './sponsored-bills'
import { tool as corpus } from './corpus-records'
import { billFields, clip, siteUrl } from './record-common'
import { inWindow, object, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { cursorProp, DATE, detailProp, full, limitProp, badCursor, outputSchema, page, readCursor, result, writeCursor } from './mcp-common'
import { readToolAsset, ToolInputError, type ToolDefinition } from './types'

const CHAMBERS = ['senate', 'representatives', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'qld_la', 'sa_ha', 'sa_lc', 'act_la', 'nt_la', 'wa_la', 'wa_lc', 'tas_ha', 'tas_lc']
const DIVISION_ID = '^(division-)?(federal-(senate|representatives)|(nsw|vic|sa|qld|act|nt|wa|tas)-(la|lc|ha))-[a-z0-9-]+$'
const since = { type: 'string', pattern: DATE, description: 'On or after this date, YYYY-MM-DD.' } as const
const until = { type: 'string', pattern: DATE, description: 'On or before this date, YYYY-MM-DD.' } as const
const nullable = (type: string) => ({ type: [type, 'null'] })
const vote = { type: 'object', properties: { name: { type: 'string' }, party: nullable('string'), vote: { type: 'string', description: 'aye, no, absent, paired or another recorded value.' } }, required: ['name', 'vote'] }

export const divisionVotes: ToolDefinition = {
  name: 'division_votes', title: 'Division result and member votes', mcpOnly: true,
  description: 'A recorded vote (division) in federal or state parliament: the result, ayes and noes, how each party voted, who voted against their party, and each member\'s vote. Give division_id for one division, or find divisions by title words, bill, date, chamber or period (newest first). Set member to read one person\'s vote in each division. detail=full lists every member\'s vote. For one member\'s votes across many divisions use member_voting_record; for counts of divisions or floor-crossing totals over a period use count_records or division. A division result does not establish that a bill became law: see bill_detail.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    division_id: { type: 'string', pattern: DIVISION_ID, maxLength: 160, description: 'From a previous result or an opax.com.au/doc/division-... address.' },
    title: { type: 'string', minLength: 2, maxLength: 300, description: 'Words from the division title, e.g. "housing affordability".' },
    bill: { type: 'string', minLength: 2, maxLength: 300, description: 'Bill title or bill_id: only divisions linked to that bill.' },
    date: { type: 'string', pattern: DATE, description: 'Exact sitting date, YYYY-MM-DD.' }, since, until,
    chamber: { type: 'string', enum: CHAMBERS }, jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'vic', 'qld', 'sa', 'act', 'nt', 'wa', 'tas'] },
    member: { type: 'string', minLength: 2, maxLength: 120, description: 'A member\'s name: adds their vote to each division.' },
    detail: detailProp('every member\'s vote (at most 3 divisions per page).'),
    limit: limitProp(10, 5), cursor: cursorProp,
  }, examples: [{ division_id: 'federal-senate-3719', detail: 'full' }, { title: 'housing affordability', chamber: 'senate', since: '2025-01-01' }, { bill: 'au-federal-r7534', member: 'David Pocock' }] },
  outputSchema: outputSchema({ properties: {
    division_id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, chamber: { type: 'string' },
    outcome: { ...nullable('string'), description: 'passed or defeated; null when not recorded.' }, ayes: nullable('integer'), noes: nullable('integer'),
    url: { type: 'string', description: 'OPAX division page.' }, source_url: nullable('string'),
    party_votes: { type: 'array', items: { type: 'object', properties: { party: { type: 'string' }, ayes: { type: 'integer' }, noes: { type: 'integer' }, majority: { ...nullable('string'), description: 'aye or no; null for a tie, independents and unlabelled groups.' } } } },
    against_party: { type: 'array', description: 'Members whose aye or no differed from their party\'s majority.', items: { type: 'object', properties: { name: { type: 'string' }, party: nullable('string'), vote: { type: 'string' }, party_vote: { type: 'string' } } } },
    member_list_complete: { type: 'boolean', description: 'false when the published member list is partial: a missing member is then not an absence.' },
    member_votes: { type: 'array', items: vote, description: 'With member: that person\'s recorded vote; empty when they have no row in this division.' },
    votes: { type: 'array', items: vote, description: 'detail=full: every recorded member vote.' },
  }, required: ['division_id', 'title', 'date', 'chamber', 'url'] }),
  identifierFields: ['member'],
  validate: args => division.validate!({ ...args, member: undefined, detail: undefined, cursor: undefined, person: args.member }) && (!args.division_id || !['title', 'bill', 'date', 'since', 'until'].some(key => args[key] !== undefined)),
  stepLabel: args => ({ label: 'Reading a division', arg: clip(args.title ?? args.bill ?? args.division_id ?? args.date ?? '', 60) }),
  async handler(env, args) {
    const state = readCursor('division_votes', args), offset = state ? Number(state.o) : 0
    if (!Number.isSafeInteger(offset) || offset < 0) throw badCursor('division_votes')
    const size = Math.min(Number(args.limit) || 5, full(args) ? 3 : 10)
    const { member, detail: _detail, cursor: _cursor, limit: _limit, ...filters } = args
    const data = await division.handler(env, { ...filters, ...(member ? { person: member } : {}), limit: size, offset, max_bytes: 150_000 })
    if (data.error) throw new Error(String(data.error))
    const rows = records(data.rows), total = Number(data.total) || 0
    // Several bills matched the bill words: nothing was looked up, and the caller must choose one.
    if (rows.length && rows.every(row => row.bill_id && !row.id)) return result({ items: [], total: null, url: siteUrl(env, '/bills'), bill_candidates: rows.map(row => ({ bill_id: row.bill_id, title: row.title, url: siteUrl(env, '/bill/' + row.bill_id) })), notes: data.notes })
    const items = rows.map(row => ({ division_id: row.id, title: clip(row.title, 400), date: row.date, chamber: row.chamber, outcome: row.outcome ?? null, ayes: row.ayes ?? null, noes: row.noes ?? null,
      url: row.url, source_url: row.source_url ?? null, party_votes: row.party_majorities, against_party: row.crossed_floor, member_list_complete: object(row.coverage).complete === true,
      ...(member ? { member_votes: row.person_votes ?? [] } : {}), ...(full(args) ? { votes: row.members } : {}) }))
    const end = offset + items.length
    return result({ items, total: data.search_complete === false ? null : total, next_cursor: items.length && end < total ? writeCursor('division_votes', args, { o: end }) : null,
      url: items.length === 1 ? String(items[0].url) : siteUrl(env, '/search?' + new URLSearchParams({ kind: 'division', q: String(args.title ?? args.bill ?? '') })),
      ...(data.bill ? { bill: data.bill } : {}),
      notes: [...(total ? [] : ['No recorded division matches. This does not establish that no vote was held: voice votes and unpublished divisions are not recorded.']),
        ...(items.some(item => (item.against_party as unknown[]).length) ? DIVISION_NOTES : DIVISION_NOTES.slice(1)),
        ...(data.notes as string[]).filter(note => !DIVISION_NOTES.includes(note) && !note.startsWith('Showing ')),
        ...(member && items.some(item => !(item.member_votes as unknown[]).length) ? [`Where member_votes is empty, ${clip(member, 80)} has no recorded row in that division. That is not an absence or an abstention.`] : []),
        ...(full(args) ? [] : ['Each member\'s vote is listed with detail=full.'])] })
  },
}

export const memberVotingRecord: ToolDefinition = {
  name: 'member_voting_record', title: 'Member voting record', mcpOnly: true,
  description: 'How one member voted across recorded divisions, newest first, with whether each vote was against their party\'s majority. Filter by topic (words in the division or bill title), bill, chamber and dates. view=tally returns counts only (ayes, noes, absences, votes against party) without listing divisions. Long records are read in segments: follow next_cursor until it is null and add the tallies before stating a whole-period total. A division with no row for the member is unrecorded, not an absence. Resolve the name first with member_profile if unsure. For one division\'s full result use division_votes.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'The member\'s full name, as member_profile returns it.' },
    topic: { type: 'string', minLength: 2, maxLength: 200, description: 'Words in the division title or linked bill titles, e.g. "climate".' },
    bill: { type: 'string', minLength: 2, maxLength: 200, description: 'Bill title words, or a bill_id for exactly that bill\'s divisions.' },
    since, until, chamber: { type: 'string', enum: CHAMBERS }, jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'vic', 'qld', 'sa', 'act', 'nt', 'wa', 'tas'] },
    view: { type: 'string', enum: ['votes', 'tally'], description: 'votes (default) lists divisions; tally counts without listing.' },
    detail: detailProp('the party\'s ayes and noes and whether the member list was complete.'),
    limit: limitProp(20, 8), cursor: cursorProp,
  }, required: ['person'], examples: [{ person: 'David Pocock', topic: 'gambling' }, { person: 'Penny Wong', since: '2025-07-01', view: 'tally' }] },
  outputSchema: outputSchema({ properties: {
    division_id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, chamber: nullable('string'),
    vote: { type: 'string', description: 'aye, no, absent, paired or another recorded value.' }, party: { ...nullable('string'), description: 'The member\'s party label in that division.' },
    against_party_majority: { ...nullable('boolean'), description: 'null when no comparison is possible (independent, small party, tie or partial list).' },
    url: { type: 'string', description: 'OPAX division page.' }, source_url: nullable('string'),
    party_majority: nullable('string'), party_ayes: { type: 'integer' }, party_noes: { type: 'integer' }, member_list_complete: { type: 'boolean' },
  }, required: ['division_id', 'title', 'date', 'vote', 'url'] }, {
    member: nullable('string'),
    tally: { type: 'object', description: 'Counts for the scanned segment only: aye, no, absent, paired, against_party_majority, party_comparisons, member_unrecorded, matching_divisions.' },
    tally_complete: { type: 'boolean', description: 'true when this one call scanned the whole selection, so tally is the full total.' },
    scanned: { type: 'object', description: 'Position in the scoped division list: start, end and of.' },
    candidates: { type: 'array', items: { type: 'string' }, description: 'Roster names to choose from when the person did not resolve.' },
  }),
  identifierFields: ['person'], validate: args => memberDivisions.validate!(args),
  stepLabel: args => ({ label: 'Reading a voting record', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const { view, detail: _detail, ...filters } = args
    // A member recorded in one voting chamber never appears in another's divisions: skip those files.
    // The same narrowing applies on every page, so the cursor stays bound to one selection.
    if (!filters.chamber) {
      const { person } = await resolveMember(env, String(args.person))
      const sat = [...new Set((Array.isArray(person?.chambers) ? person.chambers : []).filter((c): c is string => typeof c === 'string' && CHAMBERS.includes(c)))]
      if (sat.length === 1 && (!filters.jurisdiction || memberDivisions.validate!({ ...filters, chamber: sat[0] }))) filters.chamber = sat[0]
    }
    let data
    try { data = await memberDivisions.handler(env, { ...filters, limit: Number(args.limit) || 8, scan_limit: 200, max_bytes: 60_000, ...(view === 'tally' ? { operation: 'count' } : {}) }) }
    catch (error) { if (error instanceof ToolInputError) throw badCursor('member_voting_record'); throw error }
    const member = typeof data.person === 'string' ? data.person : null, rows = records(data.rows), segment = object(data.segment)
    const profile = siteUrl(env, '/subject/person')
    if (!member) return result({ items: [], total: 0, url: profile, member: null, candidates: data.candidates ?? [], notes: [...data.notes as string[], 'Use member_profile to find the exact roster name.'] })
    return result({ member, url: rows.length === 1 ? String(rows[0].url) : siteUrl(env, '/search?' + new URLSearchParams({ kind: 'division', q: String(args.topic ?? args.bill ?? member) })),
      items: rows.map(row => ({ division_id: row.division_id, title: row.title, date: row.date, chamber: row.chamber ?? null, vote: row.vote, party: row.party ?? null, against_party_majority: row.against_party_majority ?? null,
        url: row.url, source_url: row.source_url ?? null,
        ...(full(args) ? { party_majority: row.party_majority ?? null, party_ayes: row.party_ayes, party_noes: row.party_noes, member_list_complete: row.member_list_complete === true } : {}) })),
      // A whole-selection count exists only once every division in scope has been scanned.
      total: data.counts_complete_for_scope === true ? Number(object(data.counts).matching_divisions) : null,
      next_cursor: typeof data.next_cursor === 'string' ? data.next_cursor : null,
      tally: data.counts, tally_complete: data.counts_complete_for_scope === true, scanned: { start: segment.start, end: segment.end, of: data.scoped_divisions },
      notes: [...(data.next_cursor ? [`Scanned divisions ${segment.start} to ${segment.end} of ${data.scoped_divisions}, newest first${rows.length || view === 'tally' ? '' : ', with no match yet'}. Continue with next_cursor, or narrow with since, until or a bill_id to finish sooner.`] : []),
        ...(data.notes as string[]).filter(note => !note.startsWith('More divisions remain.'))] })
  },
}

const STATUSES = ['before_parliament', 'passed', 'lapsed', 'exposure_draft']
const stageName = (stage: unknown) => String(stage).replaceAll('_', ' ')
export const billSearch: ToolDefinition = {
  name: 'bill_search', title: 'Search federal bills', mcpOnly: true,
  description: 'Find federal bills by title words, status, originating chamber, introduction dates or sponsor, newest first. Returns each bill\'s bill_id, status and OPAX page. Follow with bill_detail for the dated stage history, sponsors, Act number and linked divisions. Sponsor matches use recorded sponsor metadata, which is often missing for government bills, so a sponsor list can undercount. For ACT and Tasmanian bills or federal legislative instruments use legislation; for exact counts of bills by period or status use count_records.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 200, description: 'Words from the bill title, or a bill_id.' },
    sponsor: { type: 'string', minLength: 2, maxLength: 120, description: 'A member\'s name: bills that record them as sponsor.' },
    status: { type: 'string', enum: STATUSES, description: 'passed means passed both houses; lapsed includes bills defeated or not proceeded with.' },
    chamber: { type: 'string', enum: ['representatives', 'senate'], description: 'Originating chamber.' },
    since: { ...since, description: 'Introduced on or after, YYYY-MM-DD.' }, until: { ...until, description: 'Introduced on or before, YYYY-MM-DD.' },
    detail: detailProp('the parliament number, portfolio and counts of linked divisions, speeches and Acts.'),
    limit: limitProp(20, 10), cursor: cursorProp,
  }, examples: [{ query: 'interactive gambling' }, { status: 'before_parliament', chamber: 'senate', since: '2026-07-01' }, { sponsor: 'David Pocock' }] },
  outputSchema: outputSchema({ properties: {
    bill_id: { type: 'string' }, title: { type: 'string' }, introduced: nullable('string'), chamber: { ...nullable('string'), description: 'Originating chamber.' },
    status: nullable('string'), status_as_of: { ...nullable('string'), description: 'When the status was last observed; not a passage or assent date.' },
    sponsor: nullable('string'), url: { type: 'string', description: 'OPAX bill page.' },
    parliament: nullable('integer'), portfolio: nullable('string'), divisions: nullable('integer'), speeches: nullable('integer'), acts: nullable('integer'),
  }, required: ['bill_id', 'title', 'url'] }, { as_at: { ...nullable('string'), description: 'When the bill index was generated.' }, candidates: { type: 'array', items: { type: 'string' } } }),
  identifierFields: ['sponsor'],
  validate: args => validWindow(args) && ['query', 'sponsor', 'status', 'chamber', 'since', 'until'].some(key => args[key] !== undefined) && (!args.query || /[\p{L}\p{N}]/u.test(String(args.query))),
  stepLabel: args => ({ label: 'Searching bills', arg: clip(args.query ?? args.sponsor ?? args.status ?? '', 40) }),
  async handler(env, args) {
    const index = object(await readToolAsset(env, '/bills/index.json'))
    if (!Array.isArray(index.bills)) throw new Error('Bill index unavailable')
    const as_at = typeof index.generated_at === 'string' ? index.generated_at.slice(0, 10) : null
    const item = (b: RecordRow, sponsor: unknown) => ({ bill_id: b.key, title: b.title, introduced: b.introduced ?? null, chamber: b.originating_house ?? null, status: b.status ?? null, status_as_of: b.status_as_of ?? null,
      sponsor: sponsor ?? null, url: siteUrl(env, '/bill/' + b.key),
      ...(full(args) ? { parliament: b.parliament ?? null, portfolio: b.portfolio ?? null, divisions: b.divisions ?? null, speeches: b.speeches ?? null, acts: b.acts ?? null } : {}) })
    const byKey = new Map(records(index.bills).map(b => [String(b.key), b]))
    if (args.sponsor) {
      // Sponsorship has its own attribution rules (IDs and printed names must agree): that tool owns them.
      const state = readCursor('bill_search', args), offset = state ? Number(state.o) : 0
      if (!Number.isSafeInteger(offset) || offset < 0) throw badCursor('bill_search')
      const data = await sponsoredBills.handler(env, { person: args.sponsor, ...Object.fromEntries(['query', 'since', 'until', 'chamber', 'status'].filter(key => args[key] !== undefined).map(key => [key, args[key]])), limit: Number(args.limit) || 10, offset })
      const rows = records(data.rows), total = Number(data.total) || 0, end = offset + rows.length
      return result({ items: rows.map(row => item(byKey.get(String(row.bill_id)) ?? { key: row.bill_id, title: row.title, introduced: row.introduced, originating_house: row.originating_house, status: row.status, status_as_of: row.status_as_of }, data.person)),
        total, next_cursor: rows.length && end < total ? writeCursor('bill_search', args, { o: end }) : null, as_at, url: siteUrl(env, '/bills'),
        ...(data.candidates ? { candidates: data.candidates } : {}), notes: data.notes })
    }
    const query = typeof args.query === 'string' ? args.query : '', exact = query ? byKey.get(query) : undefined, seen = new Set<string>()
    const matches = (exact ? [exact] : records(index.bills).filter(b => {
      if (typeof b.key !== 'string' || !/^au-federal-[a-z0-9-]+$/.test(b.key) || seen.has(b.key)) return false
      seen.add(b.key)
      return (!query || wordsMatch(query, [b.title, b.short_title])) && (!args.status || b.status === args.status) && (!args.chamber || b.originating_house === args.chamber) && inWindow(b.introduced, args)
    })).sort((a, b) => Number(normalize(b.title) === normalize(query)) - Number(normalize(a.title) === normalize(query)) || String(b.introduced ?? '').localeCompare(String(a.introduced ?? '')) || String(a.key).localeCompare(String(b.key)))
    const paged = page('bill_search', args, matches, 10)
    return result({ ...paged, items: paged.items.map(b => item(b, b.sponsor)), as_at, url: siteUrl(env, '/bills'), notes: [
      ...(matches.length ? [] : ['No federal bill in the published index matches. State bills are not in this index.']),
      'status is the latest recorded status; status_as_of is when it was observed, not a passage or assent date. Open bill_detail for dated stages.'] })
  },
}

export const billDetail: ToolDefinition = {
  name: 'bill_detail', title: 'Bill detail and stage history', mcpOnly: true,
  description: 'One federal bill: status, sponsors with their parties, portfolio, the dated stage history (introduction, readings in each house, passage, royal assent), Act number and links to the source record. items are the dated stage events in order. detail=full adds the divisions linked to the bill and the plain-language summary, which is written by a model from the explanatory memorandum and is not the record. Give bill_id from bill_search, or the full bill title. Passing a house, passing both houses, assent and commencement are different events: report the one the record shows. To read how members voted use division_votes with bill.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    bill_id: { type: 'string', pattern: '^au-federal-[a-z0-9-]{1,180}$', description: 'From bill_search, or an opax.com.au/bill/... address.' },
    title: { type: 'string', minLength: 4, maxLength: 300, description: 'The bill\'s full title, used when no bill_id is known.' },
    detail: detailProp('linked divisions and the model-written summary.'),
    limit: limitProp(100, 50), cursor: cursorProp,
  }, examples: [{ bill_id: 'au-federal-r7534' }, { title: 'Interactive Gambling (Cost Recovery Levy) Bill 2026', detail: 'full' }] },
  outputSchema: outputSchema({ properties: {
    stage: { type: 'string', description: 'e.g. introduced, second reading, third reading, passed both houses, royal assent.' },
    date: { ...nullable('string'), description: 'YYYY-MM-DD; null when the record gives no date.' }, chamber: nullable('string'),
    url: { type: 'string', description: 'OPAX bill page.' }, source_url: nullable('string'), source_wording: { type: 'string', description: 'The event as the source words it, where recorded.' },
  }, required: ['stage', 'date', 'url'] }, {
    bill: { ...nullable('object'), description: 'bill_id, title, status, status_as_of, introduced, chamber, sponsors, portfolio, passed_both_houses, royal_assent, act_number, acts, url and source_url. detail=full adds divisions and summary.' },
    candidates: { type: 'array', items: { type: 'object' }, description: 'Bills to choose from when the title matched several.' },
  }),
  validate: args => (args.bill_id === undefined) !== (args.title === undefined) && (!args.title || tokens(args.title).length > 0),
  stepLabel: args => ({ label: 'Reading a bill', arg: clip(args.bill_id ?? args.title, 60) }),
  async handler(env, args) {
    let key = typeof args.bill_id === 'string' ? args.bill_id : null
    if (!key) {
      const index = object(await readToolAsset(env, '/bills/index.json'))
      if (!Array.isArray(index.bills)) throw new Error('Bill index unavailable')
      const all = records(index.bills).filter(b => typeof b.key === 'string' && /^au-federal-[a-z0-9-]+$/.test(b.key)), wanted = normalize(String(args.title))
      const exact = all.filter(b => [b.title, b.short_title].some(t => t && normalize(t) === wanted)), matches = [...new Map((exact.length ? exact : all.filter(b => wordsMatch(args.title, [b.title]))).map(b => [b.key, b])).values()]
      if (matches.length !== 1) return result({ items: [], total: 0, bill: null, url: siteUrl(env, '/bills'), candidates: matches.slice(0, 10).map(b => ({ bill_id: b.key, title: b.title, introduced: b.introduced ?? null, url: siteUrl(env, '/bill/' + b.key) })),
        notes: [matches.length ? `${matches.length} bills match that title. Choose a bill_id from candidates.` : 'No federal bill in the published index has that title. Try bill_search with fewer words.'] })
      key = String(matches[0].key)
    }
    const path = `/bills/${key}.json`, raw = object(await readToolAsset(env, path)), url = siteUrl(env, '/bill/' + key)
    if (raw.key !== key) return result({ items: [], total: 0, bill: null, url: siteUrl(env, '/bills'), notes: [`OPAX has no federal bill with the id ${key}.`] })
    // The same lifecycle reading as the bill page and Ask; the file is not fetched twice.
    const life = await billFields({ ...env, asset: p => p === path ? Promise.resolve(raw) : readToolAsset(env, p) }, key)
    const source_url = records(raw.sources).map(s => sourceUrl(s.url)).find(Boolean) ?? null
    const stages = life.key_dates.map(event => ({ stage: stageName(event.stage), date: event.date, chamber: ['passed', 'passed_both', 'passed_both_houses', 'royal_assent', 'assent', 'assented'].includes(event.stage) ? null : event.house,
      url, source_url: sourceUrl(event.url), ...(event.event_raw ? { source_wording: clip(event.event_raw, 300) } : {}) }))
    const summary = object(raw.summary), divisions = records(raw.divisions)
    const bill = { bill_id: key, title: raw.title, status: life.status, status_as_of: life.status_as_of, introduced: life.introduced, chamber: life.originating_house,
      sponsors: life.sponsors.map((name, i) => ({ name, party: life.sponsor_parties[i] ?? (life.sponsors.length === 1 ? life.sponsor_party : null) })), portfolio: life.portfolio,
      passed_both_houses: life.passed_both_houses === true, passed_both_houses_date: life.passed_both_houses_date, royal_assent: life.royal_assent, act_number: life.act_number,
      acts: life.acts.map(act => ({ title: act.title, act_number: act.act_number, assent_date: act.assent_date, source_url: sourceUrl(act.frl_uri) })), url, source_url,
      linked_divisions: divisions.length,
      ...(full(args) ? {
        divisions: divisions.slice(0, 40).map(d => ({ division_id: d.key, date: d.date ?? null, chamber: d.house ?? null, stage: d.stage ?? null, question: clip(d.question, 240), ayes: d.ayes ?? null, noes: d.noes ?? null, outcome: d.outcome === 'affirmative' ? 'passed' : d.outcome === 'negative' ? 'defeated' : null, url: siteUrl(env, '/doc/division-' + d.key) })),
        summary: Array.isArray(summary.sentences) && summary.sentences.length ? { text: clip(summary.sentences.join(' '), 1500), written_by: clip(summary.attribution ?? 'Written by a model; not the record', 200), as_of: summary.as_of ?? null } : null,
      } : {}) }
    return result({ ...page('bill_detail', args, stages, 50), bill, url, notes: [
      ...(stages.length ? [] : ['No dated stage is recorded for this bill.']),
      ...(life.status ? [`Status ${stageName(life.status)}${life.status_as_of ? ' as observed on ' + life.status_as_of : ''}. status_as_of is not an introduction, passage or assent date.`] : []),
      ...(life.sponsors.length ? [] : ['No sponsor is recorded. Government bills often carry no sponsor name.']),
      ...(full(args) && divisions.length > 40 ? [`Showing 40 of ${divisions.length} linked divisions. Use division_votes with bill for the rest.`] : []),
      ...(full(args) && bill.summary ? ['summary is written by a model from the explanatory memorandum. Quote the stages and the source documents, not the summary, as the record.'] : [])] })
  },
}

const HANSARD_CHAMBERS = ['representatives', 'senate', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'qld_la', 'sa_ha', 'sa_lc', 'act_la']
export const hansardSearch: ToolDefinition = {
  name: 'hansard_search', title: 'Search Hansard speeches', mcpOnly: true,
  description: 'Find what was said in parliament: Hansard speeches by speaker, subject words, dates, chamber or party, with a verbatim excerpt, the speaker, date and links to the OPAX record and the original source. Give speaker for one member\'s own words, query for a subject, or both. Excerpts are checked against the original text and come from the member\'s own speaking turn. Give record_id to read more of one speech (up to 4,000 characters per page; next_cursor continues the text). Results are a ranked sample, not every speech: for how many speeches, or who spoke most, use count_speeches or speech_trend. venue=committee searches committee hearings, including witnesses. For press releases use corpus_records.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 250, description: 'Subject words or a phrase, e.g. "negative gearing".' },
    speaker: { type: 'string', minLength: 2, maxLength: 120, description: 'A parliamentarian\'s name.' },
    since: { ...since, description: 'Spoken on or after, YYYY-MM-DD.' }, until: { ...until, description: 'Spoken on or before, YYYY-MM-DD.' },
    jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'vic', 'sa', 'qld', 'act'] }, chamber: { type: 'string', enum: HANSARD_CHAMBERS },
    party: { type: 'string', minLength: 2, maxLength: 60, description: 'The speaker\'s party on the day, e.g. Labor, Coalition or Greens.' },
    venue: { type: 'string', enum: ['chamber', 'committee', 'all'], description: 'chamber (default), committee hearings, or both.' },
    record_id: { type: 'string', pattern: '^speech-[0-9]+$', description: 'Read one speech from a previous result. Not combined with other filters.' },
    detail: detailProp('longer excerpts with their position in the speech and how the speaker was attributed.'),
    limit: limitProp(5, 3), cursor: cursorProp,
  }, examples: [{ speaker: 'Andrew Wilkie', query: 'gambling advertising', since: '2025-01-01' }, { query: 'negative gearing', chamber: 'senate' }, { record_id: 'speech-1205524' }] },
  outputSchema: outputSchema({ properties: {
    record_id: { type: 'string' }, title: { type: 'string' }, speaker: nullable('string'), party: nullable('string'), date: nullable('string'), chamber: nullable('string'), jurisdiction: nullable('string'),
    excerpt: { type: 'string', description: 'Verbatim from the source. May end mid-speech: see text_truncated.' }, text_truncated: { type: 'boolean' },
    url: { type: 'string', description: 'OPAX record page.' }, source_url: { ...nullable('string'), description: 'The original Hansard record, where known.' },
    speaker_attribution: nullable('string'), text_scope: nullable('string'), text_offset: nullable('integer'), text_length: nullable('integer'),
  }, required: ['record_id', 'title', 'excerpt', 'url'] }, { candidates: { type: 'array', items: { type: 'string' }, description: 'Roster names to choose from when the speaker did not resolve.' } }),
  identifierFields: ['speaker'],
  validate: args => validWindow(args) && (args.record_id !== undefined ? !['query', 'speaker', 'since', 'until', 'jurisdiction', 'chamber', 'party', 'venue', 'limit'].some(key => args[key] !== undefined) : !!(args.query || args.speaker)),
  stepLabel: args => ({ label: 'Searching Hansard', arg: clip(args.speaker ?? args.query ?? args.record_id, 40) }),
  async handler(env, args) {
    const state = readCursor('hansard_search', args), seen = state && Array.isArray(state.x) ? state.x.map(String) : [], textOffset = state ? Number(state.t) : NaN
    if (state && (args.record_id ? !Number.isSafeInteger(textOffset) || textOffset < 0 : !seen.every(slug => /^speech-[0-9]+$/.test(slug)))) throw badCursor('hansard_search')
    const { detail: _detail, cursor: _cursor, ...filters } = args
    const data = await corpus.handler(env, args.record_id
      ? { kind: 'speech', record_id: args.record_id, ...(state ? { text_offset: textOffset } : {}) }
      : { ...filters, kind: 'speech', limit: Number(args.limit) || 3, exclude: seen })
    if (data.error) return result({ items: [], total: null, url: siteUrl(env, '/search'), notes: [data.error] })
    const rows = records(data.rows), checked = [...seen, ...(Array.isArray(data.checked_ids) ? data.checked_ids.map(String) : [])]
    const next_cursor = args.record_id
      ? rows[0] && Number.isSafeInteger(rows[0].next_text_offset) ? writeCursor('hansard_search', args, { t: rows[0].next_text_offset }) : null
      // The corpus search has no offsets: a later page excludes every record already examined.
      : rows.length && data.truncated === true && checked.length <= 36 ? writeCursor('hansard_search', args, { x: checked }) : null
    return result({ next_cursor, total: null, url: rows.length === 1 ? String(rows[0].url) : siteUrl(env, '/search?' + new URLSearchParams({ kind: 'speech', q: String(args.query ?? args.speaker ?? '') })),
      items: rows.map(row => {
        const excerpt = String(row.excerpt ?? ''), short = !full(args) && !args.record_id && excerpt.length > 360
        return { record_id: row.record_id, title: row.title, speaker: row.speaker ?? null, party: row.party ?? null, date: row.date ?? null, chamber: row.chamber ?? null, jurisdiction: row.jurisdiction ?? null,
          excerpt: short ? clip(excerpt, 360) : excerpt, text_truncated: short || row.text_truncated === true, url: row.url, source_url: row.source_url ?? null,
          ...(full(args) || args.record_id ? { speaker_attribution: row.speaker_attribution ?? null, text_scope: row.text_scope ?? null, text_offset: row.text_offset ?? null, text_length: row.text_length ?? null } : {}) }
      }),
      ...(data.candidates ? { candidates: data.candidates } : {}),
      notes: [...data.notes as string[], ...(args.record_id ? [] : ['A ranked sample of matching speeches, not a complete list or a count.']),
        ...(!args.record_id && rows.length && !next_cursor && data.truncated === true ? ['Paging stops here. Narrow the dates, speaker or words to read further.'] : [])] })
  },
}
