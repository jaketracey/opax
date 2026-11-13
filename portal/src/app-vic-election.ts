/** Anonymous projections of the same offline assets used by the election pages. */
import {appJson, appRead, readOnly} from './app-http'
import {findSeats, keyDateRows, latest, titledVotes, vicElectionCopy, vicElectionState, visibleResults, VIC_ELECTION_ABOUT, type Contest, type Member, type Seat, type VicElection, type VicPlaces} from './vic-election'
import {VIC_ELECTION_PATH, VIC_ELECTION_ASSET, VIC_ELECTION_PLACES, VIC_ELECTION_POLLS_OPEN, VIC_ELECTION_POLLS_CLOSE, VIC_ELECTION_CACHE, vicElectionEnabled} from '../public/vic-election.js'
import {validateVicElection, validateVicPlaces, VIC_ELECTION_SOURCE_KEYS as SOURCE_KEYS} from './vic-election-data'

type ElectionEnv = Pick<Env, 'ASSETS' | 'VIC_ELECTION_HUB_ENABLED'>
const ROOT = '/api/app/v1/vic-election'
const ORIGIN = 'https://opax.com.au'
const slug = (path: string) => path.split('/').at(-1)!
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type StoredAsset<T> = {etag: string | null; encoded?: string; value: T}
type AssetCache<T> = {stored?: StoredAsset<T>; pending?: Promise<T>}
type Snapshot = {election: AssetCache<VicElection>; places?: {election: VicElection; asset: AssetCache<VicPlaces>}}
const snapshots = new WeakMap<Fetcher, Snapshot>()

function snapshot(assets: Fetcher): Snapshot {
  let value = snapshots.get(assets)
  if (!value) snapshots.set(assets,value = {election:{}})
  return value
}

/** Revalidate every read; unchanged assets retain their parsed, validated identity. */
function cachedAsset<T>(assets: Fetcher, path: string, cache: AssetCache<T>, validate: (value: unknown) => T): Promise<T> {
  if (cache.pending) return cache.pending
  cache.pending = (async () => {
    const previous = cache.stored
    const res = await assets.fetch(new Request(ORIGIN + path, {headers:previous?.etag ? {'if-none-match':previous.etag} : {}}))
    if (res.status === 304 && previous) return previous.value
    if (!res.ok) throw new Error('Election asset unavailable')
    const etag = res.headers.get('etag')
    if (etag && previous?.etag === etag) {
      await res.body?.cancel()
      return previous.value
    }
    // Local readers without ETags still detect changed bytes without reparsing
    // an unchanged file. Production ASSETS supplies content ETags.
    const encoded = etag ? undefined : await res.text()
    if (encoded !== undefined && previous?.encoded === encoded) return previous.value
    const value = validate(encoded === undefined ? await res.json() : JSON.parse(encoded))
    cache.stored = {etag, encoded, value}
    return value
  })().catch(error => {
    // A bad read is retryable on the next request, never a cached 503 or stale success.
    cache.stored = undefined
    throw error
  }).finally(() => {cache.pending = undefined})
  return cache.pending
}

const memberName = (m: Member) => ({name:m.name, party:m.party})
const memberRef = (m: Member) => ({...memberName(m), slug:slug(m.href), href:m.href})
const contest = (c: Contest) => ({date:c.date, kind:c.kind, party:c.party, share:c.share,
  against:c.against, against_share:c.against_share, margin:c.margin, url:c.url})

function seatRow(s: Seat) {
  const base = {kind:s.kind, slug:slug(s.path), name:s.name, electorate_url:s.electorate_url}
  const candidates = s.candidates?.list.length ?? 0
  const r = latest(s)
  return s.kind === 'district'
    ? {...base, kind:'district' as const, region:s.region!, member:memberName(s.members[0]),
      result:r ? {date:r.date, kind:r.kind, party:r.party, margin:r.margin} : null, candidates}
    : {...base, kind:'region' as const, members:s.members.map(memberName), districts:s.districts.length, candidates}
}

function overview(d: VicElection, now: Date) {
  const copy = vicElectionCopy(d,now)
  const results = visibleResults(d,now)
  return {schema_version:1, ...copy, current_results:results ? {election_day:results.election_day,fetched:results.fetched,status:results.status,url:results.url,
    districts:results.districts.map(r=>({name:r.name,result:contest(r.result)}))} : null, web_url:ORIGIN + VIC_ELECTION_PATH,
    updated:d.updated, election_day:d.election_day, polls_open:VIC_ELECTION_POLLS_OPEN, polls_close:VIC_ELECTION_POLLS_CLOSE,
    term_start:d.term_start, term_end:d.term_end, key_dates:keyDateRows(d,now),
    notice:d.notice ? {text:d.notice.text, link:d.notice.link ? {label:d.notice.link.label, url:d.notice.link.url} : null} : null,
    candidates_published:d.seats.find(s=>s.candidates)?.candidates?.published ?? null,
    results_fetched:d.results_fetched, roster_date:d.seats.map(s=>s.roster_date).sort().at(-1)!,
    districts:d.seats.filter(s=>s.kind === 'district').map(seatRow), regions:d.seats.filter(s=>s.kind === 'region').map(seatRow),
    sources:Object.fromEntries(SOURCE_KEYS.map(k=>[k,d.sources[k]])), about:VIC_ELECTION_ABOUT,
    methods_url:ORIGIN + '/methods#vic-election', authorisation:d.authorisation,
    corrections:{email:d.corrections.email, response:d.corrections.response}}
}

function seatDetail(d: VicElection, s: Seat, now: Date) {
  const r = s.kind === 'district' ? d.seats.find(r=>r.kind === 'region' && r.name === s.region)! : null
  const current = visibleResults(d,now)?.districts.find(row=>row.name === s.name)?.result
  return {schema_version:1, state:vicElectionState(d,now), current_result:current ? contest(current) : null,
    updated:d.updated, kind:s.kind, slug:slug(s.path), name:s.name, web_url:ORIGIN + s.path,
    source_url:s.source_url, electorate_url:s.electorate_url, roster_date:s.roster_date,
    formerly:s.formerly, created:s.created, boundary_note:s.boundary_note,
    region:r ? {slug:slug(r.path), name:r.name, members:r.members.map(memberRef)} : null,
    districts:s.kind === 'region' ? s.districts.map(name=>seatRow(d.seats.find(x=>x.kind === 'district' && x.name === name)!)) : [],
    result:s.result ? {general:contest(s.result.general), since:s.result.since ? contest(s.result.since) : null} : null,
    candidates:s.candidates ? {published:s.candidates.published, url:s.candidates.url,
      list:s.candidates.list.map(c=>({name:c.name, party:c.party || null,
        ...s.kind === 'region' ? {group:c.group ?? null, group_name:c.group_name?.trim() || null} : {}}))} : null,
    members:s.members.map(m=>({...memberRef(m), source_url:m.source_url,
      speeches:m.speeches ? {count:m.speeches.count, first:m.speeches.first, last:m.speeches.last, within_term:m.speeches.within_term} : null,
      speech_gap:m.speech_gap, votes:m.votes ? {count:m.votes.count, ayes:m.votes.ayes, noes:m.votes.noes} : null,
      recent_votes:titledVotes(m).map(v=>({date:v.date, title:v.title, href:v.href, vote:v.vote, source_url:v.source_url}))})),
    results_fetched:d.results_fetched, speech_updated:d.speech_updated, division_start:d.division_start, division_end:d.division_end}
}

export async function appVicElection(req: Request, env: ElectionEnv, now = new Date()): Promise<Response> {
  const json = (body: unknown, status: number, headers: Record<string,string> = {}) => appJson(req,body,status,{'x-robots-tag':'noindex',...headers})
  if (!vicElectionEnabled(env.VIC_ELECTION_HUB_ENABLED)) return json({error:'not_published'},404)
  const method = readOnly(req)
  if (method) { method.headers.set('x-robots-tag','noindex'); return method }
  const url = new URL(req.url)
  const find = url.pathname === ROOT + '/find'
  const id = url.pathname.startsWith(ROOT + '/seat/') ? url.pathname.slice((ROOT + '/seat/').length) : null
  if (!find && url.pathname !== ROOT && (id === null || !SLUG.test(id))) return json({error:'not_found'},404)
  const q = url.searchParams.get('q')?.trim().slice(0,60).trim()
  if (find ? !q || [...url.searchParams.keys()].length !== 1 : Boolean(url.search)) return json({error:'invalid_query'},400)
  try {
    const cached = snapshot(env.ASSETS)
    const d = await cachedAsset(env.ASSETS,VIC_ELECTION_ASSET,cached.election,validateVicElection)
    // The places validator also checks district names against this hub version.
    if (cached.places?.election !== d) cached.places = {election:d, asset:{}}
    let body: unknown
    if (find) {
      const places = await cachedAsset(env.ASSETS,VIC_ELECTION_PLACES,cached.places.asset,value=>validateVicPlaces(value,d)).catch(()=>null)
      const hits = findSeats(q!,d,places).map(h=>({name:h.name, kind:h.kind,
        seats:h.seats.map(x=>({...seatRow(x.seat), share:h.seats.length > 1 ? x.share : null}))}))
      body = {schema_version:1, state:vicElectionState(d,now), q:q!, places_searched:places !== null, hits, split:hits.some(h=>h.seats.length > 1),
        empty:hits.length ? null : /^\d{4}$/.test(q!) ? 'postcode' : 'place', address_url:d.sources.address,
        attribution:places?.attribution ?? '', note:places?.note ?? ''}
    } else if (id !== null) {
      const s = d.seats.find(s=>s.path === `${VIC_ELECTION_PATH}/${id}`)
      if (!s) return json({error:'not_found'},404)
      body = seatDetail(d,s,now)
    } else body = overview(d,now)
    const response = await appRead(req,body,VIC_ELECTION_CACHE)
    response.headers.set('x-robots-tag','noindex')
    return response
  } catch {
    return json({error:'vic_election_unavailable'},503,{'retry-after':'60'})
  }
}
