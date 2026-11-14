/** Public MCP: member profiles, electorate lookup and declared interests, read from the same exports as the member pages. */
import { personUrl } from '../../public/party-page.js'
import { VIC_ELECTION_ASSET, VIC_ELECTION_PATH, VIC_ELECTION_PLACES, vicElectionEnabled } from '../../public/vic-election.js'
import { findSeats, type VicPlaces } from '../vic-election'
import { validateVicElection, validateVicPlaces } from '../vic-election-data'
import { findPeople } from './speech-data'
import { tool as declaredInterests } from './interests'
import { clip, fold, siteUrl } from './record-common'
import { object, records, sourceUrl, validWindow, type RecordRow } from './published-records'
import { cursorProp, DATE, detailProp, full, limitProp, outputSchema, page, result } from './mcp-common'
import { readToolAsset, type ToolDefinition, type ToolEnv } from './types'

const JURISDICTIONS = ['federal', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt']
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const slugOf = (name: string) => /^\/subject\/person\/([a-z0-9-]+)$/.exec(personUrl(name))?.[1] ?? null
const personLink = (env: ToolEnv, name: string) => siteUrl(env, personUrl(name))
const deps = (env: ToolEnv) => ({ asset: (path: string) => readToolAsset(env, path), kb: env.kb ?? (async () => { throw new Error('Corpus unavailable') }), origin: env.origin, signal: env.signal })

const PROFILE_NOTES = [
  'party is the latest party the roster records. current is true only where the roster records a sitting member; null means not recorded, not a former member.',
  'speech_years are the first and last years with indexed speeches, not service dates. Dated service is in service (detail=full).',
]
async function memberItem(env: ToolEnv, name: string, detailed: boolean) {
  const found = await findPeople(deps(env), { name }), data = object(found.data)
  const person = records(data.people)[0]
  if (!person) return { item: null, candidates: records(data.candidates), status: String(data.match_status ?? 'no_match'), clarification: text(data.clarification) }
  const known = String(person.name), years = Array.isArray(person.years) ? person.years : [null, null]
  const item = { type: 'member', name: known, slug: slugOf(known), url: personLink(env, known), party: person.party ?? null, current: person.current === true ? true : null,
    jurisdictions: person.states ?? [], chambers: person.chambers ?? [],
    seats: records(person.representation).map(seat => ({ jurisdiction: seat.jurisdiction ?? null, chamber: seat.chamber ?? null, electorate: seat.electorate ?? null, state: seat.state ?? null })),
    speech_years: { first: years[0] ?? null, last: years[1] ?? null }, speeches_indexed: person.speeches_indexed ?? null,
    ...(detailed ? { service: records(person.service).map(s => ({ jurisdiction: s.jurisdiction, chamber: s.chamber, electorate: s.electorate ?? null, start: s.start, end: s.end ?? null, ongoing: s.ongoing ?? null, as_of: s.as_of ?? null, source: s.source, url: s.url })),
      next: { voting_record: { tool: 'member_voting_record', arguments: { person: known } }, interests: { tool: 'member_interests', arguments: { person: known } }, hansard: { tool: 'hansard_search', arguments: { speaker: known } }, sponsored_bills: { tool: 'bill_search', arguments: { sponsor: known } } } } : {}) }
  return { item, candidates: [], status: 'matched', clarification: null }
}

interface SeatRow extends RecordRow { name: string; slug: string; jurisdiction: string; chamber: string; url: string; status?: string }
async function electorateItems(env: ToolEnv, name: string, jurisdiction: unknown) {
  const manifest = object(await readToolAsset(env, '/electorates/manifest.json')), release = String(manifest.release_id ?? '')
  if (!/^[a-f0-9]+$/.test(release) || manifest.index_url !== `/electorates/releases/${release}/index.json`) throw new Error('Electorate release unavailable')
  const index = object(await readToolAsset(env, String(manifest.index_url)))
  if (!Array.isArray(index.electorates)) throw new Error('Electorate index unavailable')
  const want = fold(name), seats = records(index.electorates).filter((seat): seat is SeatRow => typeof seat.name === 'string' && typeof seat.slug === 'string' && /^\/subject\/electorate\/[a-z0-9-]+$/.test(String(seat.url)))
    .filter(seat => !jurisdiction || seat.jurisdiction === jurisdiction)
  const exact = seats.filter(seat => fold(seat.name) === want || seat.slug === name || seat.electorate_id === name)
  // An exact name wins outright; otherwise every seat whose name starts with the words given.
  const matches = (exact.length ? exact : seats.filter(seat => fold(seat.name).startsWith(want)))
    .sort((a, b) => Number(b.status === 'current') - Number(a.status === 'current') || Number(b.jurisdiction === 'federal') - Number(a.jurisdiction === 'federal') || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
  return matches.map(seat => ({ type: 'electorate', name: seat.name, slug: seat.slug, url: siteUrl(env, seat.url), jurisdiction: seat.jurisdiction, chamber: seat.chamber, state: seat.state_code ?? null,
    status: seat.status ?? null, seats: seat.capacity ?? null, representation_status: seat.representation_status ?? 'unknown', representation_as_of: seat.representation_as_of ?? null,
    representatives: records(seat.representatives).flatMap(rep => {
      const known = text(object(rep.person).name)
      return known ? [{ name: known, party: rep.party ?? null, slug: slugOf(known), url: personLink(env, known) }] : []
    }) }))
}
const POSTCODE_SCOPE = 'OPAX publishes postcode matches for Victorian state districts only (ABS postal areas against VEC boundaries). Federal seats and other states cannot be looked up by postcode here: give the electorate name, or use the AEC electorate finder at https://electorate.aec.gov.au/.'
async function postcodeItems(env: ToolEnv, postcode: string) {
  if (!vicElectionEnabled(env.VIC_ELECTION_HUB_ENABLED)) return { items: [], notes: [POSTCODE_SCOPE, 'The Victorian district lookup is not published in this environment.'] }
  let places: VicPlaces
  const election = validateVicElection(await readToolAsset(env, VIC_ELECTION_ASSET))
  try { places = validateVicPlaces(await readToolAsset(env, VIC_ELECTION_PLACES), election) } catch { env.signal?.throwIfAborted(); throw new Error('Place index unavailable') }
  const hit = findSeats(postcode, election, places).find(h => h.kind === 'Postcode')
  if (!hit) return { items: [], notes: [`No Victorian postal area matches ${postcode}. PO box postcodes have no residents and are not included.`, POSTCODE_SCOPE] }
  const items = hit.seats.map(({ seat, share }) => ({ type: 'electorate', name: seat.name, slug: seat.path.replace(/^.*\//, ''), url: siteUrl(env, seat.path), jurisdiction: 'vic', chamber: seat.kind === 'district' ? 'vic_la' : 'vic_lc', state: 'vic',
    status: 'current', seats: seat.members.length || null, representation_status: 'verified', representation_as_of: seat.roster_date,
    postcode_share_percent: share, representatives: seat.members.map(m => ({ name: m.name, party: m.party ?? null, slug: slugOf(m.name), url: personLink(env, m.name) })) }))
  return { items, notes: [
    ...(items.length > 1 ? [`Postcode ${postcode} is split across ${items.length} districts. postcode_share_percent is the share of the postal area's usual residents in each district, not a probability for one address. Ask for the suburb or district before naming one member.`] : []),
    'These are Victorian state districts (Legislative Assembly), not federal seats.', POSTCODE_SCOPE, places.attribution, places.note] }
}

const seat = { type: 'object', properties: { jurisdiction: { type: ['string', 'null'] }, chamber: { type: ['string', 'null'] }, electorate: { type: ['string', 'null'] }, state: { type: ['string', 'null'] } } }
export const memberProfile: ToolDefinition = {
  name: 'member_profile', title: 'Member profile and electorate lookup', mcpOnly: true,
  description: 'Who a parliamentarian is, or who represents a place. Give exactly one of: name (typos, nicknames and titles are resolved), slug (from an opax.com.au/subject/person/ address), electorate (seat name, federal or state) or postcode (Victorian state districts only). Returns party, chamber, seat and the OPAX profile link; an electorate or postcode returns the seat with its current representatives. Start here to get the exact name the other member tools expect: member_voting_record, member_interests, hansard_search and bill_search. An ambiguous name returns candidates to choose from rather than a guess.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 2, maxLength: 120, description: 'A parliamentarian\'s name, e.g. "Penny Wong" or "Senator Wong".' },
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,119}$', description: 'Profile slug, e.g. "penny-wong".' },
    electorate: { type: 'string', minLength: 2, maxLength: 120, description: 'Electorate name, e.g. "Grayndler", or its OPAX electorate slug.' },
    postcode: { type: 'string', pattern: '^\\d{4}$', description: 'Four-digit postcode. Victorian state districts only.' },
    jurisdiction: { type: 'string', enum: JURISDICTIONS, description: 'With electorate: only seats of this parliament. Seat names repeat across parliaments.' },
    detail: detailProp('dated service periods and ready-made follow-up calls for a member.'),
    limit: limitProp(10, 5), cursor: cursorProp,
  }, examples: [{ name: 'Penny Wong' }, { slug: 'anthony-albanese', detail: 'full' }, { electorate: 'Grayndler', jurisdiction: 'federal' }, { postcode: '3056' }] },
  outputSchema: outputSchema({ properties: {
    type: { type: 'string', enum: ['member', 'candidate', 'electorate'], description: 'member: one resolved person. candidate: a possible match to confirm. electorate: a seat with its representatives.' },
    name: { type: 'string' }, slug: { type: ['string', 'null'] }, url: { type: 'string', description: 'OPAX profile or electorate page.' },
    party: { type: ['string', 'null'] }, current: { type: ['boolean', 'null'], description: 'true where the roster records a sitting member; null when not recorded.' },
    jurisdictions: { type: 'array', items: { type: 'string' } }, chambers: { type: 'array', items: { type: 'string' } },
    seats: { description: 'Member: recorded seats. Electorate: number of members the seat returns.', anyOf: [{ type: 'array', items: seat }, { type: 'integer' }, { type: 'null' }] },
    speech_years: { type: 'object', properties: { first: { type: ['integer', 'null'] }, last: { type: ['integer', 'null'] } } }, speeches_indexed: { type: ['integer', 'null'] },
    service: { type: 'array', items: { type: 'object' }, description: 'detail=full: dated service periods with their source.' }, next: { type: 'object', description: 'detail=full: follow-up tool calls for this member.' },
    jurisdiction: { type: 'string' }, chamber: { type: 'string' }, state: { type: ['string', 'null'] }, status: { type: ['string', 'null'] },
    representation_status: { type: 'string', description: 'verified, or unknown where OPAX holds no dated roster for the seat.' }, representation_as_of: { type: ['string', 'null'] },
    postcode_share_percent: { type: ['number', 'null'], description: 'Share of the postal area\'s residents in this district.' },
    representatives: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, party: { type: ['string', 'null'] }, slug: { type: ['string', 'null'] }, url: { type: 'string' } }, required: ['name', 'url'] } },
  }, required: ['type', 'name', 'url'] }, { match: { type: 'string', enum: ['matched', 'ambiguous', 'no_match'], description: 'Whether the request resolved to one person or at least one seat.' } }),
  identifierFields: ['electorate'],
  validate: args => ['name', 'slug', 'electorate', 'postcode'].filter(key => args[key] !== undefined).length === 1 && (!args.jurisdiction || !!args.electorate),
  stepLabel: args => ({ label: args.electorate || args.postcode ? 'Finding an electorate' : 'Reading a member profile', arg: clip(args.name ?? args.slug ?? args.electorate ?? args.postcode, 40) }),
  async handler(env, args) {
    if (args.postcode) {
      const { items, notes } = await postcodeItems(env, String(args.postcode))
      return result({ ...page('member_profile', args, items, 5), notes, match: items.length ? 'matched' : 'no_match', url: siteUrl(env, items.length ? VIC_ELECTION_PATH : '/subject/electorate') })
    }
    if (args.electorate) {
      const items = await electorateItems(env, String(args.electorate), args.jurisdiction), paged = page('member_profile', args, items, 5)
      return result({ ...paged, match: items.length ? 'matched' : 'no_match', url: items.length === 1 ? items[0].url : siteUrl(env, '/subject/electorate'), notes: [
        ...(items.length ? [] : [`No published electorate is named "${clip(args.electorate, 80)}"${args.jurisdiction ? ' in that parliament' : ''}. Unknown names are not matched to a nearby seat.`]),
        ...(items.length > 1 ? ['Several seats share this name. Use jurisdiction, or the seat slug, to choose one.'] : []),
        ...(paged.items.some(item => item.representation_status !== 'verified') ? ['Where representation_status is unknown, OPAX holds no dated roster for that seat: an empty representatives list does not mean the seat is vacant.'] : []),
        ...(paged.items.some(item => item.representation_as_of) ? ['Representatives are a dated roster observation (representation_as_of), not a live membership check.'] : [])] })
    }
    let name = text(args.name)
    if (args.slug) {
      const roster = object(await readToolAsset(env, '/parliamentarians.json'))
      if (!Array.isArray(roster.people)) throw new Error('Member roster unavailable')
      name = records(roster.people).map(p => text(p.name)).find(known => known && slugOf(known) === args.slug) ?? null
      if (!name) return result({ items: [], total: 0, match: 'no_match', url: siteUrl(env, '/subject/person'), notes: [`No profile has the slug "${args.slug}". Look the member up by name.`] })
    }
    const found = await memberItem(env, name!, full(args))
    if (found.item) return result({ items: [found.item], total: 1, match: 'matched', url: found.item.url, notes: PROFILE_NOTES })
    const candidates = found.candidates.slice(0, Number(args.limit) || 5).map(c => ({ type: 'candidate', name: String(c.name), slug: slugOf(String(c.name)), url: personLink(env, String(c.name)), party: c.party ?? null,
      current: c.current === true ? true : null, jurisdictions: c.states ?? [], chambers: c.chambers ?? [] }))
    return result({ items: candidates, total: candidates.length, match: candidates.length ? 'ambiguous' : 'no_match', url: siteUrl(env, '/subject/person'), notes: [
      found.clarification ?? (candidates.length ? 'No single person matches. These are the closest roster names: confirm one before using it in another tool.' : `OPAX has no parliamentarian named "${clip(name, 80)}" in its roster. Do not substitute someone who matches only part of the name.`)] })
  },
}

const CATEGORIES = ['shareholdings', 'real_estate', 'directorships', 'trusts', 'gifts', 'travel', 'liabilities', 'memberships', 'other']
export const memberInterests: ToolDefinition = {
  name: 'member_interests', title: 'Member declared interests', mcpOnly: true,
  description: 'One member\'s entries in the federal or Queensland register of interests: shareholdings, real estate, directorships, trusts, gifts, sponsored travel, liabilities and memberships. Filter by category, words in the declaration, or lodgement dates. Each entry links to the register source and the member\'s OPAX page. Dates are lodgement or alteration dates, or the register date, never the date a gift was received. A declaration is not evidence of a conflict of interest, and an entry is not necessarily a current holding. For interests across many members (for example all ministers holding shares) use declared_interests.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120, description: 'The member\'s full name, as member_profile returns it.' },
    category: { type: 'string', enum: CATEGORIES, description: 'travel is sponsored travel or hospitality.' },
    query: { type: 'string', minLength: 2, maxLength: 120, description: 'Words in the declaration, e.g. a company name.' },
    since: { type: 'string', pattern: DATE, description: 'Lodged or altered on or after, YYYY-MM-DD.' }, until: { type: 'string', pattern: DATE, description: 'Lodged or altered on or before, YYYY-MM-DD.' },
    detail: detailProp('the full declaration text, register page number and both declaration and register dates.'),
    limit: limitProp(50, 20), cursor: cursorProp,
  }, required: ['person'], examples: [{ person: 'Penny Wong' }, { person: 'Anthony Albanese', category: 'gifts', since: '2025-01-01' }] },
  outputSchema: outputSchema({ properties: {
    category: { type: 'string' }, description: { type: 'string', description: 'The declaration as published (shortened unless detail=full).' },
    holder: { type: ['string', 'null'], description: 'Who holds it where the register says: self, spouse or children.' },
    kind: { type: 'string', description: 'statement, addition or deletion.' }, date: { type: ['string', 'null'], description: 'Lodgement or alteration date, else the register date.' },
    url: { type: 'string', description: 'The member\'s OPAX page.' }, source_url: { type: ['string', 'null'], description: 'The register document, at the page where known.' },
    declaration_date: { type: ['string', 'null'] }, register_date: { type: ['string', 'null'] }, page: { type: ['integer', 'null'] },
  }, required: ['category', 'description', 'kind', 'url'] }, {
    member: { type: ['string', 'null'] }, register: { type: ['object', 'null'], description: 'Jurisdiction, chamber and dates of the register read.' },
    categories: { type: 'array', description: 'Per category: entries the register declares and how many OPAX publishes.', items: { type: 'object', properties: { category: { type: 'string' }, declared_entries: { type: 'integer' }, published_items: { type: 'integer' } } } },
  }),
  identifierFields: ['person'], validate: validWindow,
  stepLabel: args => ({ label: 'Reading declared interests', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const { cursor: _cursor, detail: _detail, limit: _limit, ...filters } = args
    // The register tool owns the directory, merging and date rules; only paging and shape differ here.
    const data = await declaredInterests.handler(env, { ...filters, limit: 100_000 }), rows = records(data.rows), first = rows[0]
    if (data.error) throw new Error(String(data.error))
    const profile = first ? personLink(env, String(first.name)) : siteUrl(env, '/register/interests')
    const paged = page('member_interests', args, rows, 20)
    return result({ ...paged, total: rows.length, url: profile,
      items: paged.items.map(r => ({ category: r.category, description: clip(r.description, full(args) ? 2000 : 280), holder: r.holder ?? null, kind: r.kind, date: r.date ?? null,
        url: profile, source_url: sourceUrl(r.url), ...(full(args) ? { declaration_date: r.declaration_date ?? null, register_date: r.register_date ?? null, page: r.page ?? null } : {}) })),
      member: first ? String(first.name) : null,
      register: first ? { jurisdiction: first.jurisdiction, chamber: first.chamber, register_date: data.register_date ?? null, statement_date: data.statement_date ?? null } : null,
      categories: records(data.categories), notes: data.notes })
  },
}
