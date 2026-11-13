import {supplierContractsHTML} from '../public/contracts-table.js'
import {decodeHTMLStrict} from 'entities'
import {donorDisclosure,donorLabelHTML,type DonorDisclosureRecord} from '../public/donor-disclosure.js'
import { shortDate } from '../public/format.js'
import { personUrl, partyUrl } from '../public/party-page.js'
import {sponsorPerson} from '../public/sponsor-person.js'
import sponsorParties from '../public/facts/sponsor-parties.json' with {type:'json'}
import {rosterSeatParty, rosterListParty, type RosterSeatParty, type RosterListObservation} from '../public/roster-party.js'
import {currentSittingPath, sydneyDay} from '../public/hubs-data.js'
import {renderDivisionMarkdown, divisionPlain, billNoteRepair, billStripTitle, billStripStage} from '../public/division-markdown.js'
import {guardTableURL,parseQuery,serializeQuery,type DataTableConfig} from '../public/datatable.js'
import {interestTableData,interestTableConfig,partyMoneyData,partyMoneyTableConfig,registerTableHTML} from '../public/register-tables.js'
import {chamberLabel, machineLabelHTML} from '../public/party-page.js'
import {heldBackTranscriptsHTML, chairRoleTranscriptsHTML} from '../public/held-back-transcripts.js'
import {divisionTableConfig, voteTableConfig, personVoteKeys, personVoteRecords, divisionRows, votingRows, voteTablePage, voteTableHTML} from '../public/vote-tables.js'
import type {Query} from '../public/datatable.js'
import {personVideos, videoSectionHTML, type VideoRow} from '../public/video-card.js'
import {agencyTopRows, type AgencyTopRow} from '../public/agency-top-suppliers.js'
import {recentVotesBucket, recentVotesBucketPath, votesBucketPath, VOTES_NAMES_PATH} from '../public/recent-votes-buckets.js'
import {partyFold, partyMoneyBucket, partyMoneyBucketPath} from '../public/party-money-buckets.js'
import {SUPPLIER_ID_RE, supplierRowsPath, SUPPLIERS_META_PATH} from '../public/supplier-row-buckets.js'
import {BILL_TITLES_PATH} from '../public/bill-titles.js'
import {readPartyPages, partyPageCoverage} from '../public/party-page.js'
/** Crawlable answers from the same static projections the application reads.
 * All lists are bounded; source strings and URLs cross one escaping boundary. */
export type ReadAsset = <T>(path: string) => Promise<T>
export interface RenderedContent { html: string; description?: string; prev?: string; next?: string; page?: number; party?: string }
interface Person {
  name: string; full?: string; pid?: string; party?: string | null; party_now?: string | null;
  current?: boolean; states: string[]; chambers: string[]; speeches?: number | null;
  speech_scope?: unknown;
  representation?: { electorate: string; jurisdiction: string; chamber: string }[];
}
interface Seat {
  slug: string; name: string; url: string; jurisdiction: string; chamber: string
  representation_status?: string; representation_as_of?: string
  representatives?: { party?: string | null; person?: { name?: string; legacy_person_id?: string; aliases?: string[]; source_url?: string } }[]
}
interface Bill {
  key: string; title: string; short_title?: string; status?: string; status_as_of?: string;
  sponsor?: string; sponsor_person_id?: string; sponsor_party?: string; portfolio?: string; introduced?: string;
  sponsors?: { name: string; person_id?: string | null; party?: string | null }[];
  sources?: { kind: string; url: string }[];
  key_dates?: { stage: string; date: string; house: string | null; url: string; event_raw?: string; negatived?: boolean }[];
  divisions?: Division[];
  summary?: { attribution?: string; sentences?: string[]; changes?: string[]; affected?: string; as_of?: string };
}
export interface Division {
  key: string; slug?: string; name?: string; question?: string; date?: string; house?: string | null;
  jurisdiction?: string; ayes?: number; noes?: number; result?: string; outcome?: string;
  source_url?: string; url?: string; stage?: string;
  party_tallies?: { party: string; votes: Record<string,number> }[];
  recorded_ayes?: number; recorded_noes?: number; unknown_party_count?: number;
  members?: { name: string; person_id?: string; person_slug?: string; party?: string; vote: string; party_source?: { basis: string; url?: string | null } }[];
  bills?: { key: string; title: string; url?: string }[];
}
interface Vote { question?: string; name?: string; title?: string; stage?: string; date?: string; vote?: string; division_slug?: string; source_url?: string }
interface Votes { name: string; jurisdiction: string; for?: Vote[]; against?: Vote[] }
interface RecentVotes { _meta: { schema: number; source: string; coverage: string }; people: Record<string, { name: string; jurisdiction: string; recent: Vote[] }> }
interface Interest {
  source_url?: string; total: number; as_at?: string; ocr_rows?: number; unread_pages?: number;
  buckets: Record<string, { count: number; items: { description: string; holder?: string | null; kind?: string; page?: number; date?: string; url?: string }[] }>;
}
interface MoneyNode { id: string; label: string; kind: string; industry?: string; aliases?: string[]; total: number }
interface MoneyGraph { meta: { sourceShort?: string; source?: string; coverage?: string; source_url?: string }; nodes: MoneyNode[]; edges: { source: string; target: string; total: number; grant?: boolean; flow?: string }[] }
const PAGE_SIZE = 50
export const escapeHtml = (value: unknown): string => String(value ?? '').slice(0,5000).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const fold = (s: string) => s.normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g,' ').trim().toLowerCase()
const human = (s: string | null | undefined) => String(s ?? '').replace(/_/g,' ')
const count = (n: number) => n.toLocaleString('en-AU')
const currency = (n: number) => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n)
// A chamber code by name (labels.js); a written-out stage house ("Assent") as written, never a code.
const chamber = (s: string | null | undefined = '') => !s ? 'Chamber not recorded' : chamberLabel(s) || (/^[a-z_]+$/.test(s) ? 'Chamber not recorded' : s)
export function safeHref(value: string): string | null {
  if(value.length>2048) return null
  if (/^\/(?!\/)/.test(value)) return value
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null } catch { return null }
}
const link = (href: string, label: string, rel = '') => {
  const safe = safeHref(href)
  return safe ? `<a href="${escapeHtml(safe)}"${rel ? ` rel="${rel}"` : ''}>${escapeHtml(label)}</a>` : escapeHtml(label)
}
const original = (url?: string) => url && safeHref(url) ? `<p>${link(url,'View original','noopener noreferrer')}</p>` : ''
/** One step of a breadcrumb trail after Home; the last step is the page itself. */
export interface Crumb { label: string; href?: string }
const CRUMB_SEP = '<svg class="crumb-sep" viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
/** The app's breadcrumb strip (`setCrumbs` in app.js), written by the server for
 *  pages the app never boots on. It sits ahead of the page's own block, directly
 *  under the masthead; once the app takes a page over it is hidden with
 *  #prerender and the app's own #crumbs speaks instead. No trail, no strip. */
export function crumbsHTML(items: Crumb[] = []): string {
  const trail = crumbSteps(items)
  if (!trail.length) return ''
  const steps = trail.map((it, i) => {
    const here = i === trail.length - 1
    const text = escapeHtml(it.label)
    const el = it.href ? `<a class="crumb-label" href="${escapeHtml(it.href)}">${text}</a>` : `<span class="crumb-label">${text}</span>`
    return `<li${here ? ' class="crumb-here" aria-current="page"' : ''}>${i ? CRUMB_SEP : ''}${el}</li>`
  }).join('')
  return `<nav class="crumbs prerender-crumbs" aria-label="Breadcrumb"><ol class="wrap crumbs-list">${steps}</ol></nav>`
}
/** A trail as it is shown, Home first: each label on one line (60 characters
 *  at most), each ancestor's address checked, the page itself unlinked. The
 *  strip and the page's BreadcrumbList both read it, so they cannot differ. */
export function crumbSteps(items: Crumb[] = []): { label: string; href: string | null }[] {
  if (!items.length) return []
  const trail: Crumb[] = [{ label: 'Home', href: '/' }, ...items]
  const label = (s: string) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t }
  return trail.map((it, i) => ({ label: label(it.label), href: i < trail.length - 1 && it.href ? safeHref(it.href) || null : null }))
}
/** The trail a renderer already printed into its block (server-only pages
 *  write their own strip), after Home; null when the block has none. */
export function printedTrail(html: string | null | undefined): Crumb[] | null {
  const strip = /<nav class="crumbs prerender-crumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html || '')?.[1]
  if (!strip) return null
  const steps = [...strip.matchAll(/<(a|span) class="crumb-label"(?: href="([^"]*)")?>([\s\S]*?)<\/\1>/g)]
    .map(([, , href, text]) => ({ label: decodeHTMLStrict(text.replace(/<[^>]+>/g, '')), ...(href ? { href: decodeHTMLStrict(href) } : {}) }))
  return steps.slice(1)
}
/** The text of a block's first heading: the name the page gives itself. */
export function headingOf(html: string | null | undefined): string {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html || '')?.[1]
  return h1 ? decodeHTMLStrict(h1.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : ''
}
/** The crawlable answer: one title, one sentence, the body. No kicker: the
 *  title says what the page is once (principle 3), and a server-only page's
 *  breadcrumb says where it sits. */
export function answerBlock(title: string, description: string, body = '', crumbs: Crumb[] = []): string {
  body = associationCaveat(body, `${description} ${body}`)
  return `${crumbsHTML(crumbs)}<section id="prerender" class="wrap"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${body}</section>`
}
/** Pages whose whole text is served by the Worker, copied from their panel in index.html. */
export const SERVER_PANELS: ReadonlySet<string> = new Set(['privacy', 'support', 'methods', 'about', 'stats'])
/**
 * The server-rendered copy of an information or policy page: the inner
 * markup of its panel in the shell (index.html), so the page a crawler or a
 * reader without scripts gets and the app's panel have one source. It keeps the
 * section anchors for readers without scripts; spa-shell.js drops the copy's
 * ids once the panel is back, and `.spa-ready #prerender` hides it. Section
 * depth keeps the nested coverage sections whole. Null for an unclosed panel.
 */
export function panelPrerender(shell: string, name: string): string | null {
  if (!SERVER_PANELS.has(name)) return null
  const start = new RegExp(`<section id="panel-${name}"[^>]*>`).exec(shell)
  if (!start) return null
  const bodyStart = start.index + start[0].length
  let depth = 1
  const tags = /<\/?section\b[^>]*>/g
  tags.lastIndex = bodyStart
  for (let tag; (tag = tags.exec(shell));) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (!depth) return `<section id="prerender" class="wrap policy-page" data-panel-copy="${name}">${shell.slice(bodyStart, tag.index)}</section>`
  }
  return null
}
export const ASSOCIATION_CAVEAT = 'An association does not prove influence.'
export function associationCaveat(body: string, facts: string): string {
  const money = /\$|\bmoney\b|receipts|donations|funding|contracts|grants|expenditure/i.test(facts)
  const politics = /politic|parliamentarian|member|party|parties|vote|electoral|Labor|Liberal/i.test(facts)
  if(!money || !politics || body.includes(ASSOCIATION_CAVEAT)) return body
  const line=`<p>${ASSOCIATION_CAVEAT}</p>`
  return /<\/section>\s*$/.test(body) ? body.replace(/<\/section>\s*$/,line+'</section>') : body+line
}
/** Dated official chamber lists for full-name profiles (public/data/roster-list-parties.json). */
export const ROSTER_LIST_PARTIES_PATH = '/data/roster-list-parties.json'
export type RosterLists = readonly RosterListObservation[] | null | undefined
/** A verified seat roster's party, else the latest dated official list's (public/roster-party.js). */
const rosterParty = (p: Person, seats?: readonly Seat[] | null, lists?: RosterLists): RosterSeatParty | null =>
  rosterSeatParty(p, seats) || rosterListParty(p, lists)
/** The party a person's own record carries, else the one a verified seat roster
 *  or a dated official chamber list records for them (public/roster-party.js), else nothing. */
export function personParty(p: Person, seats?: readonly Seat[] | null, lists?: RosterLists): {party: string; roster: RosterSeatParty | null} | null {
  const own = p.party_now || p.party
  if (own) return {party: own, roster: null}
  const roster = rosterParty(p, seats, lists)
  return roster ? {party: roster.party, roster} : null
}
export function partyLine(p: Person, seats?: readonly Seat[] | null, lists?: RosterLists): string {
  // Preserve the roster's tri-state: false is former; missing is not evidence of retirement.
  const party = p.party_now || p.party
  if (!party) {
    // Said of the roster on its date, not of the person's career.
    const roster = rosterParty(p, seats, lists)
    return roster ? `${roster.party} (parliamentary roster as at ${shortDate(roster.as_of)})` : 'Party not recorded'
  }
  if (p.current === false) return `Formerly ${party}`
  const former = p.party_now && p.party && fold(p.party_now) !== fold(p.party) ? `; formerly ${p.party}` : ''
  return `${party}${former}${p.current === undefined ? ' (recorded affiliation)' : ''}`
}
const personHref = (p: Person, slugs: Map<string,string>) => slugs.has(p.name) ? `/subject/person/${slugs.get(p.name)}` : personUrl(p.name)
function paginate(url: URL, rows: { href: string; label: string; detail?: string }[], title: string, description: string): RenderedContent {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const requested = Number(url.searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested,pageCount) : 1
  const href = (n: number) => { const next = new URL(url); next.searchParams.set('page', String(n)); return next.pathname + next.search }
  const prev = page > 1 ? href(page - 1) : undefined, next = page < pageCount ? href(page + 1) : undefined
  const body = `<p>${count(rows.length)} entries. Page ${page} of ${pageCount}.</p><ul>${rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(r => `<li>${link(r.href,r.label)}${r.detail ? `: ${escapeHtml(r.detail)}` : ''}</li>`).join('')}</ul>` +
    `<nav aria-label="Directory pages">${prev ? link(prev,'Previous page','prev') : ''}${prev && next ? ' · ' : ''}${next ? link(next,'Next page','next') : ''}</nav>`
  return { html: answerBlock(title,description,body), prev, next, page }
}
const optional = async <T>(read: ReadAsset, path: string): Promise<T | null> => read<T>(path).catch(() => null)

type PartyReceipts = { meta: MoneyGraph['meta']; label: string; rows: ReturnType<typeof partyMoneyData>['rows'] }
/**
 * A party's disclosed-receipt rows from one money graph: its bucket (public/party-money-buckets.js),
 * or the whole graph when the bucket is unreadable. Null when the graph has no such party.
 */
async function partyReceipts(read: ReadAsset, path: string, party: string): Promise<PartyReceipts | null> {
  const key = partyFold(party)
  const bucket = await optional<{meta: MoneyGraph['meta']; parties: Record<string, {label: string; rows: PartyReceipts['rows']}>}>(read,partyMoneyBucketPath(path,partyMoneyBucket(key)))
  if (bucket?.parties && bucket.meta) return Object.hasOwn(bucket.parties,key) ? {meta: bucket.meta, ...bucket.parties[key]} : null
  const graph = await optional<MoneyGraph>(read,path)
  const node = graph?.nodes.find(n=>n.kind==='party' && fold(n.label)===fold(party))
  return graph && node ? {meta: graph.meta, label: node.label, rows: partyMoneyData(graph,node.id).rows} : null
}
type VoteData = Record<string, Votes | Record<string,string[]>>
/**
 * A member's vote keys and the votes.json records under them: votes.json's name index and the
 * member's buckets (public/recent-votes-buckets.js), or the whole file when any is unreadable.
 */
async function personVotesFor(read: ReadAsset, p: Person): Promise<{keys: string[]; voteData: VoteData | null}> {
  const names = await optional<{_names: Record<string,string[]>}>(read,VOTES_NAMES_PATH)
  if (names?._names) {
    const keys = personVoteKeys(p.name,p.pid,names)
    const parts = await Promise.all([...new Set(keys.map(recentVotesBucket))].map(bucket => optional<{people: VoteData}>(read,votesBucketPath(bucket))))
    if (parts.every(part => part?.people)) return {keys, voteData: Object.fromEntries(parts.flatMap(part => Object.entries(part!.people)))}
  }
  const voteData = await optional<VoteData>(read,'/votes.json')
  return {keys: personVoteKeys(p.name,p.pid,voteData), voteData}
}
/**
 * The recorded votes for these person keys: their buckets of /seo/recent-votes.json
 * (public/recent-votes-buckets.js), or the whole file when a bucket is unreadable.
 */
async function recentVotesFor(read: ReadAsset, keys: string[]): Promise<RecentVotes | null> {
  if (!keys.length) return null
  const parts = await Promise.all([...new Set(keys.map(recentVotesBucket))].map(bucket => optional<RecentVotes>(read,recentVotesBucketPath(bucket))))
  if (!parts.every(part => part?.people)) return optional<RecentVotes>(read,'/seo/recent-votes.json')
  if (parts.length === 1) return parts[0]
  return {_meta: parts[0]!._meta, people: Object.fromEntries(parts.flatMap(part => Object.entries(part!.people)))}
}
export async function renderPersonAnswer(p: Person, read: ReadAsset, slugs: Map<string,string>, profileUrl?: string, tableState: URLSearchParams | Query = {}): Promise<RenderedContent> {
  const tableParams=tableState instanceof URLSearchParams ? tableState : new URLSearchParams(serializeQuery(tableState,'vr'))
  const tableQuery=parseQuery(tableParams,'vr')
  const registerHTML=(config:DataTableConfig)=>registerTableHTML(config,undefined,new URL('https://local.invalid/?'+tableParams))
  const [interests, seats, bills, sponsored, heldBackCounts, chairRoleCounts, video, rosterLists] = await Promise.all([
    optional<{people: Record<string,unknown>; _by_name: Record<string,string>}>(read,'/interests/index.json'),
    optional<{index_url: string}>(read,'/electorates/manifest.json').then(m => m ? optional<{electorates: Seat[]}>(read,m.index_url) : null),
    // The bill fields profiles use (public/bill-titles.js), else the whole index.
    optional<{bills: Bill[]}>(read,BILL_TITLES_PATH).then(titles => Array.isArray(titles?.bills) ? titles : optional<{bills: Bill[]}>(read,'/bills/index.json')),
    optional<{sponsored: Record<string,string[]>}>(read,'/seo-links.json'),
    optional<Record<string, number>>(read,'/data/held-back-transcripts.json'),
    optional<Record<string, number>>(read,'/data/chair-role-transcripts.json'),
    optional<{videos: VideoRow[]}>(read,'/video/senate.json'),
    optional<{observations: RosterListObservation[]}>(read,ROSTER_LIST_PARTIES_PATH),
  ])
  const lists = rosterLists?.observations
  const display = p.full && p.speech_scope ? p.full : p.name
  const seatList = seats?.electorates || null
  const description = `${display}. ${partyLine(p,seatList,lists)}. ${(p.representation || []).map(r=>`${r.electorate}, ${chamber(r.chamber)}`).join('; ') || p.chambers.map(chamber).join(', ')}.`
  let body = heldBackTranscriptsHTML(p.pid, heldBackCounts) + chairRoleTranscriptsHTML(p.pid, chairRoleCounts) + '<h2>Party and representation</h2><ul>'
  const party = personParty(p,seatList,lists)?.party
  body += `<li>${party ? link(partyUrl(party),partyLine(p,seatList,lists)) : 'Party not recorded'}</li>`
  for (const r of p.representation || []) {
    const seat = seats?.electorates.find(e=>fold(e.name)===fold(r.electorate) && e.jurisdiction===r.jurisdiction && e.chamber===r.chamber)
    body += `<li>${seat ? link(seat.url,r.electorate) : escapeHtml(r.electorate)} — ${escapeHtml(chamber(r.chamber))}</li>`
  }
  body += `</ul>${original(profileUrl)}<p>${link('/parliamentarians.json','Parliamentarian data (JSON)')}. Recorded representation can include historical seats; affiliation with no current-roster flag is not verified as current or former.</p>`
  // The Senate's own video of a first speech, matched to this roster row by the fetcher; nothing when there is none.
  body += videoSectionHTML('First speech',personVideos(video?.videos,slugs.get(p.name),p),{id:'ssr-first-speech',note:'Video published by the Senate Public Information Office on YouTube.',after:`<p class="video-more">${link('/video/senate?kind=first-speech','All first speeches')}</p>`})
  if (!p.speech_scope) {
    const {keys, voteData} = await personVotesFor(read,p)
    const {rows, recorded: hasRecent} = personVoteRecords(keys,voteData,await recentVotesFor(read,keys))
    const votes = (rows as Vote[]).sort((a,b)=>String(b.date || '').localeCompare(String(a.date || '')))
    if (votes.length) {
      const config = voteTableConfig(keys, hasRecent ? 'Recorded votes' : 'Latest bill votes')
      config.id += '-ssr'
      body += voteTableHTML(config,voteTablePage(votingRows(votes,bills?.bills || []),config,tableQuery))
      body += '<p>This list covers the votes in OPAX’s published data. Only formal divisions leave a per-member record. Party position is shown only when the vote source records it.</p>'
      body += `<p>Source: ${hasRecent ? link('/seo/recent-votes.json','OPAX recorded-vote data') : `${link('/votes.json','OPAX bill-vote data')} (They Vote For You and state Hansard)`}.</p>`
    }
    const id = p.pid && interests?.people[p.pid] ? p.pid : interests?._by_name[fold(p.name)]
    const register = id && /^[\w-]+$/.test(id) ? await optional<Interest>(read,`/interests/${id}.json`) : null
    if (register) {
      body += '<h2>Declared interests</h2>'
      if (register.as_at) body += `<p>Updated ${escapeHtml(shortDate(register.as_at))}</p>`
      body += `<p>${count(register.total)} recorded entries${register.as_at ? ` in the latest register snapshot, as at ${escapeHtml(register.as_at)}` : ''}.</p>`
      const {rows} = interestTableData(register)
      const config = interestTableConfig(rows)
      config.id = 'ssr-interests-table'
      body += registerHTML(config)
      body += '<p>Entries include statements and notified changes; they do not establish current holdings. Date is the notification date where supplied, otherwise the register snapshot date. Check the official entry.</p>'
      body += original(register.source_url)
      if (register.ocr_rows || register.unread_pages) body += `<p>Some entries use OCR. ${register.unread_pages || 0} unread source pages; check the original register.</p>`
    }
  }
  body += '<h2>Receipt sources to their party</h2><p>Receipts to a party are not personal payments to this member. An association does not prove influence.</p>'
  const graphs = [['/graph/money.json','AEC'],['/graph/money.qld.json','ECQ'],['/graph/money.vic.json','VEC']] as const
  const received = party ? await Promise.all(graphs.map(([path]) => partyReceipts(read,path,party))) : []
  for (const [i,found] of received.entries()) {
    const source = graphs[i][1]
    if (!found) continue
    const {meta, label, rows} = found
    const config = partyMoneyTableConfig(rows,`person-party-money-${source.toLowerCase()}`,`partyMoney${source}`,'person',{party:label,jurisdiction:({AEC:'federal',ECQ:'qld',VEC:'vic'} as Record<string,string>)[source]})
    body += `<h3>${escapeHtml(source)} disclosed receipts</h3><p>${escapeHtml(meta.coverage || '')}</p>${registerHTML(config)}`
    body += `<p>Source: ${escapeHtml(meta.sourceShort || meta.source || source)}. Federal and state returns are shown separately and never summed.</p>${original(meta.source_url || (source==='AEC' ? 'https://transparency.aec.gov.au/' : source==='ECQ' ? 'https://disclosures.ecq.qld.gov.au/' : 'https://disclosures.vec.vic.gov.au/'))}`
  }
  const owned = sponsored?.sponsored[p.pid || p.name] || []
  if (owned.length) body += `<h2>Bills sponsored</h2><ul>${owned.slice(0,30).map(key=>`<li>${link(`/bill/${key}`,bills?.bills.find(b=>b.key===key)?.title || key)}</li>`).join('')}</ul>`
  return {html:answerBlock(display,description,body),description,party:party || undefined}
}

/** The roster row a bill's printed sponsor opens: public/sponsor-person.js, never a surname print. */
export function sponsorFor(b: Bill, people: Person[]): Person | null {
  return b.sponsor ? sponsorPerson(b.sponsor, b.sponsor_person_id, people) : null
}
const STAGE_LABELS: Record<string,string> = {introduced:'Introduced',second_reading:'Second reading',third_reading:'Third reading',passed_one_house:'Passed one house',passed_both:'Passed both houses',assented:'Assented',withdrawn:'Withdrawn',lapsed:'Lapsed',negatived:'Negatived'}
/** Recorded stages as shown: the source's own wording where the export kept it
 * (bills-005), a negatived question marked as such (bills-004), and rows that
 * would read identically shown once. */
export function billStageLines(rows: NonNullable<Bill['key_dates']>) {
  const seen = new Set<string>()
  return rows.flatMap(d=>{
    let label = d.event_raw || STAGE_LABELS[d.stage] || human(d.stage)
    if (d.negatived && !/negatived/i.test(label)) label += ' (negatived)'
    const line = {label, date: d.date, house: d.house, url: d.url}
    const id = JSON.stringify([line.label, line.date, line.house, line.url])
    if (seen.has(id)) return []
    seen.add(id)
    return [line]
  })
}
export function renderBillAnswer(b: Bill, people: Person[], slugs: Map<string,string>, related: Bill[] = [], tableQuery: Query = {}): RenderedContent {
  const title = b.short_title || b.title
  const sponsor = sponsorFor(b,people)
  // Only the party the export recorded for the sponsor on the day (bills-001):
  // the roster's current party is not evidence for an earlier bill.
  const party = b.sponsor_party && sponsorParties.includes(b.sponsor_party) ? b.sponsor_party : null
  // A private member's "(s) ..." sponsor print is not a portfolio (bills-007).
  const portfolio = b.portfolio && !/^\s*\(s\)/.test(b.portfolio) ? b.portfolio : ''
  const description = `${human(b.status || 'Status not recorded')}${b.status_as_of ? `, as at ${b.status_as_of}` : ''}. ${portfolio ? `${portfolio} portfolio.` : ''}`
  const coSponsors = (b.sponsors || []).slice(1).map(s=>{
    const person = sponsorPerson(s.name, s.person_id ?? undefined, people) as Person | null
    return (person ? link(personHref(person,slugs),person.name) : escapeHtml(s.name)) + (s.party && sponsorParties.includes(s.party) ? ` (${escapeHtml(s.party)})` : '')
  })
  let body = `<dl><dt>Sponsor</dt><dd>${sponsor ? link(personHref(sponsor,slugs),sponsor.name) : escapeHtml(b.sponsor || 'Not recorded')}</dd>${party ? `<dt>Sponsor's recorded party</dt><dd>${link(partyUrl(party),party)}</dd>` : ''}${coSponsors.length ? `<dt>Co-sponsors</dt><dd>${coSponsors.join(', ')}</dd>` : ''}<dt>Portfolio</dt><dd>${escapeHtml(portfolio || 'Not recorded')}</dd></dl>`
  const stages = billStageLines(b.key_dates || []).map(d=>`<li>${escapeHtml(d.label)} — ${escapeHtml(d.date)} (${escapeHtml(chamber(d.house))})${original(d.url)}</li>`)
  if (stages.length) body += `<h2>Recorded stages</h2><ul>${stages.join('')}</ul>`
  const divisions = b.divisions || []
  const divisionSlot = '<!--bill-divisions-->'
  body += divisionSlot

  if (b.summary) body += `<h2>Plain-language summary</h2><p>${machineLabelHTML({pill:true,notRecord:true})} ${b.summary.as_of ? `As at ${escapeHtml(b.summary.as_of)}` : 'Date not recorded'}.</p>${(b.summary.sentences || []).slice(0,10).map(s=>`<p>${escapeHtml(s)}</p>`).join('')}<ul>${(b.summary.changes || []).slice(0,10).map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>${b.summary.affected ? `<p>${escapeHtml(b.summary.affected)}</p>` : ''}`
  const sameSponsor = related.filter(r=>r.key!==b.key && !!b.sponsor && fold(r.sponsor || '')===fold(b.sponsor)).slice(0,20)
  const samePortfolio = related.filter(r=>r.key!==b.key && !!b.portfolio && fold(r.portfolio || '')===fold(b.portfolio)).slice(0,20)
  for(const [label,rows] of [['Other bills from this sponsor',sameSponsor],['Other bills in this portfolio',samePortfolio]] as const) {
    if (rows.length) body += `<h2>${label}</h2><ul>${rows.map(r=>`<li>${link(`/bill/${r.key}`,r.short_title || r.title)} — introduced ${escapeHtml(r.introduced || 'date not recorded')}, ${escapeHtml(human(r.status || 'status not recorded'))}</li>`).join('')}</ul>`
  }
  body += `<p>Stage dates describe the parliamentary progress recorded by the source. They do not establish when provisions commence. A bill before parliament is a proposal; its text can change before passage. Division totals describe the recorded question on that date. A procedural division does not necessarily establish support for every provision of a bill. Check the official bill text and explanatory memorandum for the wording.</p><p>${link(`/bills/${b.key}.json`,'Bill data export')} · ${link('/bills','Browse bills')} · ${link('/ask','Ask about the parliamentary record')} · ${link('/methods','Sources and methods')}</p>`
  body += `<h2>Sources</h2>${(b.sources || []).map(s=>`<p>${escapeHtml(human(s.kind))}</p>${original(s.url)}`).join('')}`
  const config = divisionTableConfig({bill:b.key}, 'Divisions', 'bill')
  config.id += '-ssr'
  const rows = divisionRows(divisions,true)
  const block = () => rows.length ? voteTableHTML(config,voteTablePage(rows,config,tableQuery)) : '<h2>Divisions</h2><p>No divisions recorded. Most questions are decided on the voices; this does not establish that a bill was unopposed.</p>'
  const output = () => answerBlock(title,description,body.replace(divisionSlot,block()))
  return {html:output()}
}
export const internalLinkCount = (html: string) => (html.match(/<a\b[^>]*href="(?:\/(?!\/)|https:\/\/opax\.com\.au\/)/g) || []).length
function divisionVotes(d: Division, people: Person[], slugs: Map<string,string>, full=true, partyLinks=true): string {
  const members=d.members || []
  const parties=d.party_tallies || [...new Set(members.filter(m=>m.party).map(m=>m.party!))].map(party=>({party,votes:Object.fromEntries([...new Set(members.filter(m=>m.party===party).map(m=>m.vote))].map(vote=>[vote,members.filter(m=>m.party===party && m.vote===vote).length]))}))
  const ayes=d.recorded_ayes ?? members.filter(m=>m.vote==='aye').length, noes=d.recorded_noes ?? members.filter(m=>m.vote==='no').length
  if(!members.length && !parties.length) return '<p>No per-member votes or party tallies here. See the original division record.</p>'
  // Rows the division source lists without a party can take one from a dated roster (scripts/vote_parties.py).
  const fromRoster=members.filter(m=>m.party && m.party_source).length
  const rosterNote=fromRoster ? ` The division record gives no party for ${count(fromRoster)} of these members; their labels are the ones a dated parliamentary roster records for them on this date.` : ''
  let html=`<h3>How each party voted</h3><p>Party labels are those recorded for this division, rather than current affiliations.${rosterNote}${ayes!==d.ayes || noes!==d.noes ? ` The member list is partial: ${ayes} recorded ayes and ${noes} recorded noes; the official tally above remains the source total.` : ''}</p>`
  html+=parties.length ? `<ul>${parties.map(({party,votes})=>`<li>${partyLinks ? link(partyUrl(party),party) : escapeHtml(party)}: ${Object.entries(votes).map(([vote,n])=>`${human(vote)} ${n}`).join(', ')}</li>`).join('')}</ul>` : ''
  const missing=d.unknown_party_count ?? members.filter(m=>!m.party).length
  if(!parties.length && !missing) html+='<p>Party affiliation on the division date is not recorded in the member export.</p>'
  // Said in words, never as a party line: an "Unknown" total would read as a party.
  if(missing) html+=`<p>${parties.length ? `No party is recorded for ${count(missing)} ${missing===1 ? 'member' : 'members'} on this date; they are not counted in any party line above.` : `No party is recorded for any of the ${count(missing)} members on this date.`}</p>`
  if(full) for(const side of [...new Set(members.map(m=>m.vote))]) {
    html+=`<h3>${side==='aye' ? 'Ayes' : side==='no' ? 'Noes' : human(side)}</h3><ul>${members.filter(m=>m.vote===side).map(m=>`<li>${link(personUrl(m.name),m.name)}${m.party ? ` (${escapeHtml(m.party)})` : ''} — ${escapeHtml(side)}</li>`).join('')}</ul>`
  }
  return html
}

export function renderDivisionAnswer(d: Division, people: Person[], slugs: Map<string,string>): RenderedContent {
  const title = divisionPlain(d.name || d.question || 'Parliamentary division').split(/(?<=[.!?])\s/)[0]
  const description = `${chamber(d.house)}, ${d.date || 'Date not recorded'}. ${d.result || d.outcome || 'Result not recorded'}: ayes ${d.ayes ?? 'not recorded'}, noes ${d.noes ?? 'not recorded'}.`
  let body = `<h2>Question</h2><div class="division-markdown">${renderDivisionMarkdown(d.question || d.name || 'Question not recorded')}</div>${original(d.source_url || d.url)}<h2>How each member voted</h2>`
  body += divisionVotes(d,people,slugs)
  body += `<h2>Related bills</h2><ul>${(d.bills || []).map(b=>`<li>${link(`/bill/${b.key}`,b.title)}</li>`).join('')}</ul><p>Only formal divisions leave a per-member record. A procedural vote is not necessarily a vote for or against a bill.</p>`
  return {html:answerBlock(title,description,body),description}
}


export async function renderDirectory(dir: string, url: URL, read: ReadAsset, people: Person[], slugs: Map<string,string>, topics: Record<string,string>): Promise<RenderedContent | null> {
  if (dir==='person') {
    const [seats, lists] = await Promise.all([
      optional<{index_url: string}>(read,'/electorates/manifest.json').then(m => m ? optional<{electorates: Seat[]}>(read,m.index_url) : null).then(r => r?.electorates),
      optional<{observations: RosterListObservation[]}>(read,ROSTER_LIST_PARTIES_PATH).then(r => r?.observations),
    ])
    return paginate(url,people.map(p=>({href:personHref(p,slugs),label:p.name,detail:partyLine(p,seats,lists)})),'Parliamentarians','Parliamentarians in the parliamentary record, with speeches, votes and declared interests.')
  }
  if (dir==='topic') return paginate(url,Object.entries(topics).map(([slug,name])=>({href:`/subject/topic/${slug}`,label:name})),'Topics','Browse topics in the parliamentary record.')
  if (dir==='electorate') {
    const manifest = await read<{index_url: string}>('/electorates/manifest.json')
    const data = await read<{electorates:Seat[]}>(manifest.index_url)
    return paginate(url,data.electorates.map(e=>({href:e.url,label:e.name,detail:chamber(e.chamber)})),'Electorates','Electorates, recorded representation and dated sources.')
  }
  if (dir==='bills') {
    const data = await read<{bills:Bill[]}>('/bills/index.json')
    const hubs = await read<{weeks:{start:string;end:string}[]}>('/hubs/index.json')
    const content = paginate(url,data.bills.map(b=>({href:`/bill/${b.key}`,label:b.short_title || b.title,detail:human(b.status || '')})),'Bills','Australian parliamentary bills: recorded stages, sponsors, divisions and machine-written summaries where available.')
    content.html = content.html.replace('</h1>',`</h1><p>${link(currentSittingPath(hubs.weeks,sydneyDay()),'This sitting week')}</p>`)
    return content
  }
  if (dir==='grants') {
    const jurisdictions = url.searchParams.get('jur') === 'qld' ? ['qld'] : url.searchParams.get('jur') === 'federal' ? ['federal'] : ['federal','qld']
    const rows = (await Promise.all(jurisdictions.map(async jur=>{
      const data = await read<{recipients:{id:string;n:string;t:number;c:number}[]}>(`/graph/grants.${jur}.json`)
      return data.recipients.filter(r=>r.id && !r.id.startsWith('person:')).map(r=>({href:`/money/grants/${jur}/recipient/${encodeURIComponent(r.id)}`,label:r.n,detail:`${jur}, ${count(r.c)} awards, ${currency(r.t)} awarded value`}))
    }))).flat()
    return paginate(url,rows,'Grant recipients','Published grants by recipient. Awarded values are commitments, not payments. Source: GrantConnect and Queensland published grant records.')
  }
  if (dir==='party') {
    const pages = await readPartyPages(read)
    return paginate(url,pages.map(p=>({href:p.href,label:p.name,detail:partyPageCoverage(p)})),'Parties and independents','Party affiliations in the parliamentary and political receipts records. Coverage differs by affiliation.')
  }
  if (dir==='donor') {
    const graphs = await Promise.all(['/graph/money.json','/graph/money.qld.json','/graph/money.vic.json'].map(path=>read<MoneyGraph>(path)))
    const rows = new Map<string,{href:string;label:string;detail?:string}>()
    for (const graph of graphs) for (const n of graph.nodes) if (n.kind===dir) rows.set(fold(n.label),{href:donorDisclosure(n).href || '',label:n.label})
    return paginate(url,[...rows.values()],'Disclosed donors','Published political receipts from AEC, ECQ and VEC; federal and state returns remain separate.')
  }
  const sources: Record<string,[string,string,string]> = {supplier:['/suppliers.json','suppliers','Government suppliers'],agency:['/agencies.json','agencies','Government agencies'],campaigner:['/graph/campaigners.json','entities','Campaigners']}
  const source = sources[dir]
  if (source) {
    const data = await read<Record<string,{id?:string;name:string}[]>>(source[0])
    return paginate(url,(data[source[1]] || []).map(n=>({href:`/subject/${dir}/${encodeURIComponent(n.id || n.name)}`,label:n.name})),source[2],'Entries from published records, with original sources on each profile.')
  }
  return null
}

interface Contract { id: string; title?: string; description?: string; agency?: string; amount: number; start_date?: string; published?: string; url?: string; link_scope?: string }
interface SupplierProfile { id: string; name: string; total: number; count: number; agencies: {name:string;total:number;count:number}[]; contracts: Contract[] }
interface AgencyProfile { id: string; name: string; profile_path: string }
type AgencySupplier = AgencyTopRow
/** An agency's largest suppliers, largest first (stable), enough to fill "Other suppliers" after removing the page's own supplier. */
export type AgencyTopSuppliers = (path: string) => Promise<AgencySupplier[] | null>
export const agencyTopSuppliers = (read: ReadAsset): AgencyTopSuppliers => async path => {
  const data=await optional<{suppliers:AgencySupplier[]}>(read,path)
  return data ? agencyTopRows(data.suppliers) : null
}
type SupplierIndex = {meta:{generated_at:string;source:string};suppliers:{id:string;profile_path:string}[]}
/**
 * The supplier's index row with the index's date and source: its id's bucket of /suppliers.json
 * (public/supplier-row-buckets.js), or the whole index when the bucket is unreadable or lacks it.
 */
async function supplierIndexEntry(read: ReadAsset, id: string): Promise<{meta: SupplierIndex['meta']; row?: SupplierIndex['suppliers'][number]}> {
  if (SUPPLIER_ID_RE.test(id)) {
    const bucket=await optional<SupplierIndex>(read,supplierRowsPath(id))
    const row=bucket?.meta ? bucket.suppliers?.find(s=>s.id===id) : undefined
    if(row) return {meta:bucket!.meta,row}
  }
  const index=await read<SupplierIndex>('/suppliers.json')
  return {meta:index.meta,row:index.suppliers.find(s=>s.id===id)}
}
export async function renderSupplierAnswer(id: string, read: ReadAsset, params = new URLSearchParams(), topSuppliers: AgencyTopSuppliers = agencyTopSuppliers(read)): Promise<RenderedContent | null> {
  const [{meta:indexMeta,row},agencies] = await Promise.all([
    supplierIndexEntry(read,id),
    read<{agencies:AgencyProfile[]}>('/agencies.json'),
  ])
  if(!row) return null
  const profile=(await read<{profiles:Record<string,SupplierProfile>}>(row.profile_path)).profiles[id]
  if(!profile) return null
  const description=`${profile.name}: ${currency(profile.total)} in recorded Commonwealth contract awards across ${count(profile.count)} contracts and ${profile.agencies.length} agencies.`
  let body=`<p>Updated ${escapeHtml(indexMeta.generated_at.slice(0,10))}. Source: ${escapeHtml(indexMeta.source)}. Award values are not expenditure. One contract is counted at its latest recorded notice value; amendments are not added together. Coverage is limited to the available notices.</p><h2>Agencies contracted</h2><ul>`
  const matches=profile.agencies.map(a=>({a,record:agencies.agencies.find(r=>r.name===a.name)}))
  body+=matches.map(({a,record})=>`<li>${record ? link(`/subject/agency/${record.id}`,a.name) : escapeHtml(a.name)} — ${count(a.count)} contracts, ${currency(a.total)}</li>`).join('')+'</ul>'
  body+=supplierContractsHTML(profile.contracts as unknown as Record<string, unknown>[],id,params)+'<details><summary>Notice details for the largest awards</summary><ol>'
  body+=[...profile.contracts].sort((a,b)=>b.amount-a.amount).slice(0,10).map(c=>{
    const agency=agencies.agencies.find(a=>a.name===c.agency)
    const notice=c.link_scope==='source_register' ? `https://www.tenders.gov.au/Search/KeywordSearch?keyword=${encodeURIComponent(c.id)}` : c.url
    return `<li>${escapeHtml(c.title || c.id)}${c.description ? ` — ${escapeHtml(c.description)}` : ''}. ${currency(c.amount)}. Start date: ${escapeHtml(c.start_date || 'Not recorded')}. Published: ${escapeHtml(c.published || 'Not recorded')}. Agency: ${agency ? link(`/subject/agency/${agency.id}`,agency.name) : escapeHtml(c.agency || 'Not recorded')}. ${notice ? link(notice,`AusTender notice ${c.id}`,'noopener noreferrer') : escapeHtml(c.id)}.</li>`
  }).join('')+'</ol></details><h2>Other suppliers to these agencies</h2>'
  for(const {a,record} of matches.slice(0,10)) {
    if(!record) continue
    const rows=((await topSuppliers(record.profile_path)) || []).filter(s=>s.id!==id).slice(0,10)
    body+=`<h3>${escapeHtml(a.name)}</h3><ul>${rows.map(s=>`<li>${link(`/subject/supplier/${s.id}`,s.name)} — ${currency(s.total)} in recorded awards from this agency</li>`).join('')}</ul>`
  }
  body+=`<p>An association does not prove influence.</p><p>${link('/subject/supplier','Browse suppliers')} · ${link('/methods','Sources and methods')}</p>`
  return {html:answerBlock(profile.name,description,body),description}
}

/** No map boot state is exposed to crawlers. Totals retain separate jurisdictions. */
export async function renderMoneyAnswer(title: string, read: ReadAsset): Promise<RenderedContent> {
  let body='<p>Published political receipts, Commonwealth contracts and grant awards are separate records. Award values are not verified expenditure, and an association does not prove influence.</p>'
  for(const [path,label] of [['/graph/money.json','Federal'],['/graph/money.qld.json','Queensland'],['/graph/money.vic.json','Victoria']]) {
    const graph=await read<MoneyGraph & {meta:{generated:string}}>(path)
    const parties=graph.nodes.filter(n=>n.kind==='party')
    // Count donation edges, excluding public contracts, grants and other flow kinds.
    const ids=new Set(graph.nodes.filter(n=>n.kind==='donor').map(n=>n.id))
    const receipts=graph.edges.filter(e=>ids.has(e.source) && !e.grant && !e.flow)
    body+=`<h2>${label} disclosed receipts</h2><p>${currency(receipts.reduce((sum,e)=>sum+e.total,0))} across ${count(receipts.length)} donor-to-party totals on this map. ${parties.length} parties. Updated ${escapeHtml(graph.meta.generated)}. Coverage: ${escapeHtml(graph.meta.coverage || 'See the source')}. Source: ${escapeHtml(graph.meta.sourceShort || graph.meta.source || label)}.</p><ul>${parties.map(p=>`<li>${link(partyUrl(p.label),p.label)}</li>`).join('')}</ul><p>${link(path,`${label} map data export`)}</p>`
  }
  // The index's meta from its own small file (public/supplier-row-buckets.js), else the 7.6 MB index.
  type SuppliersMeta = {meta:{generated_at:string;total:number;contract_count:number;source:string;published_from:string;published_to:string}}
  const small=await optional<SuppliersMeta>(read,SUPPLIERS_META_PATH)
  const suppliers=small?.meta ? small : await read<SuppliersMeta>('/suppliers.json')
  const m=suppliers.meta
  body+=`<h2>Commonwealth contracts</h2><p>${currency(m.total)} in recorded awards across ${count(m.contract_count)} contracts. Notices published ${escapeHtml(m.published_from)} to ${escapeHtml(m.published_to)}. Exported ${escapeHtml(m.generated_at.slice(0,10))}. Source: ${escapeHtml(m.source)}.</p><p>${link('/subject/supplier','Government suppliers')} · ${link('/subject/agency','Government agencies')} · ${link('/money/grants','Grant records')} · ${link('/ask','Ask about the record')} · ${link('/methods','Sources and methods')}</p>`
  return {html:answerBlock(title,'Public disclosure records, dated totals and original sources. Federal and state returns are never summed.',body)}
}
