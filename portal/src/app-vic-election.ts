/** Anonymous projections of the same offline assets used by the election pages. */
import {appJson, appRead, readOnly, validDate} from './app-http'
import {findSeats, keyDateRows, latest, titledVotes, VIC_ELECTION_ABOUT, type Contest, type Member, type Seat, type VicElection, type VicPlaces} from './vic-election'
import {VIC_ELECTION_PATH, VIC_ELECTION_ASSET, VIC_ELECTION_PLACES, VIC_ELECTION_POLLS_OPEN, VIC_ELECTION_POLLS_CLOSE, vicElectionEnabled} from '../public/vic-election.js'

type ElectionEnv = Pick<Env, 'ASSETS' | 'VIC_ELECTION_HUB_ENABLED'>
const ROOT = '/api/app/v1/vic-election'
const ORIGIN = 'https://opax.com.au'
const slug = (path: string) => path.split('/').at(-1)!
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SOURCE_KEYS = ['election','voting','enrolment','address','results','licence'] as const
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
const nullableText = (v: unknown) => v === null || text(v)
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const integer = (v: unknown) => number(v) && Number.isInteger(v) && (v as number) >= 0
const https = (v: unknown) => { try { return text(v) && new URL(v).protocol === 'https:' } catch { return false } }
const instant = (v: unknown) => text(v) && /T\d{2}:\d{2}:\d{2}\+11:00$/.test(v) && Number.isFinite(Date.parse(v))
const fields = (v: unknown, keys: string[], check: (value: unknown) => boolean) => object(v) && keys.every(k=>check(v[k]))

function validContest(c: Contest): boolean {
  return object(c) && validDate(c.date) && ['general','by-election','supplementary'].includes(c.kind)
    && fields(c,['party','against'],text) && fields(c,['share','against_share','margin'],number) && https(c.url)
}

function validMember(m: Member): boolean {
  return object(m) && text(m.name) && nullableText(m.party) && text(m.href) && /^\/subject\/person\/[a-z0-9-]+$/.test(m.href)
    && https(m.source_url) && nullableText(m.speech_gap)
    && (m.speeches === null || fields(m.speeches,['count','first','last'],integer) && typeof m.speeches?.within_term === 'boolean')
    && (m.votes === null || fields(m.votes,['count','ayes','noes'],integer))
    && Array.isArray(m.divisions) && m.divisions.every(v=>object(v) && validDate(v.date)
      && fields(v,['title','vote'],text) && text(v.href) && v.href.startsWith('/doc/') && https(v.source_url))
}

function validSeat(s: Seat): boolean {
  return object(s) && ['district','region'].includes(s.kind) && text(s.name) && text(s.path)
    && s.path === `${VIC_ELECTION_PATH}/${slug(s.path)}` && SLUG.test(slug(s.path)) && https(s.source_url)
    && text(s.electorate_url) && s.electorate_url.startsWith('/subject/electorate/') && validDate(s.roster_date)
    && nullableText(s.region) && nullableText(s.formerly) && nullableText(s.boundary_note) && typeof s.created === 'boolean'
    && Array.isArray(s.districts) && s.districts.every(text)
    && Array.isArray(s.members) && s.members.length === (s.kind === 'district' ? 1 : 5) && s.members.every(validMember)
    && (s.result === null || s.kind === 'district' && object(s.result) && validContest(s.result.general) && (s.result.since === null || validContest(s.result.since)))
    && (s.candidates === null || object(s.candidates) && validDate(s.candidates.published) && https(s.candidates.url)
      && Array.isArray(s.candidates.list) && s.candidates.list.every(c=>fields(c,['name','party'],text)))
}

function electionAsset(value: unknown): VicElection {
  const d = value as VicElection
  if (!object(d) || !fields(d,['updated','election_day','term_start','term_end','results_fetched','speech_updated','division_end'],validDate)
    || !(d.division_start === null || validDate(d.division_start))
    || !fields(d,['enrolment_close','nominations_close','postal_close'],instant)
    || !text(d.authorisation) || !fields(d.corrections,['email','response'],text)
    || !fields(d.sources,[...SOURCE_KEYS],https) || !Array.isArray(d.seats) || !d.seats.every(validSeat)
    || d.seats.filter(s=>s.kind === 'district').length !== 88 || d.seats.filter(s=>s.kind === 'region').length !== 8
    || new Set(d.seats.map(s=>s.path)).size !== 96
    || d.seats.some(s=>s.kind === 'district'
      ? !d.seats.some(r=>r.kind === 'region' && r.name === s.region)
      : s.districts.length !== 11 || s.districts.some(name=>!d.seats.some(x=>x.kind === 'district' && x.name === name)))
    || d.notice != null && (!object(d.notice) || !text(d.notice.text) || !d.notice.text.trim() || d.notice.text.length > 200
      || /[<>\r\n]/.test(d.notice.text) || !(d.notice.link === null || fields(d.notice.link,['label'],text) && https(d.notice.link?.url)))) {
    throw new Error('Invalid election asset')
  }
  return d
}

function placesAsset(value: unknown, d: VicElection): VicPlaces {
  const p = value as VicPlaces
  if (!fields(p,['attribution','note'],text) || !Array.isArray(p.districts) || !p.districts.every(text)
    || p.districts.length !== 88 || new Set(p.districts).size !== 88
    || p.districts.some(name=>!d.seats.some(s=>s.kind === 'district' && s.name === name))
    || !['suburb','postcode','council'].every(key=>{
      const rows = p[key as 'suburb' | 'postcode' | 'council']
      return Array.isArray(rows) && rows.every(r=>Array.isArray(r) && r.length === 3 && text(r[0]) && integer(r[2])
        && Array.isArray(r[1]) && r[1].length > 0 && r[1].every(part=>Array.isArray(part) && part.length === 2
          && integer(part[0]) && part[0] < p.districts.length && integer(part[1]) && part[1] <= 1000))
    })) throw new Error('Invalid places asset')
  return p
}

async function assetJson(env: ElectionEnv, path: string): Promise<unknown> {
  const res = await env.ASSETS.fetch(new Request(ORIGIN + path))
  if (!res.ok) throw new Error('Election asset unavailable')
  return res.json()
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

function overview(d: VicElection) {
  return {schema_version:1, title:'Victorian election 2026', web_url:ORIGIN + VIC_ELECTION_PATH,
    updated:d.updated, election_day:d.election_day, polls_open:VIC_ELECTION_POLLS_OPEN, polls_close:VIC_ELECTION_POLLS_CLOSE,
    term_start:d.term_start, term_end:d.term_end, key_dates:keyDateRows(d),
    notice:d.notice ? {text:d.notice.text, link:d.notice.link ? {label:d.notice.link.label, url:d.notice.link.url} : null} : null,
    candidates_published:d.seats.find(s=>s.candidates)?.candidates?.published ?? null,
    results_fetched:d.results_fetched, roster_date:d.seats.map(s=>s.roster_date).sort().at(-1)!,
    districts:d.seats.filter(s=>s.kind === 'district').map(seatRow), regions:d.seats.filter(s=>s.kind === 'region').map(seatRow),
    sources:Object.fromEntries(SOURCE_KEYS.map(k=>[k,d.sources[k]])), about:VIC_ELECTION_ABOUT,
    methods_url:ORIGIN + '/methods#vic-election', authorisation:d.authorisation,
    corrections:{email:d.corrections.email, response:d.corrections.response}}
}

function seatDetail(d: VicElection, s: Seat) {
  const r = s.kind === 'district' ? d.seats.find(r=>r.kind === 'region' && r.name === s.region)! : null
  return {schema_version:1, updated:d.updated, kind:s.kind, slug:slug(s.path), name:s.name, web_url:ORIGIN + s.path,
    source_url:s.source_url, electorate_url:s.electorate_url, roster_date:s.roster_date,
    formerly:s.formerly, created:s.created, boundary_note:s.boundary_note,
    region:r ? {slug:slug(r.path), name:r.name, members:r.members.map(memberRef)} : null,
    districts:s.kind === 'region' ? s.districts.map(name=>seatRow(d.seats.find(x=>x.kind === 'district' && x.name === name)!)) : [],
    result:s.result ? {general:contest(s.result.general), since:s.result.since ? contest(s.result.since) : null} : null,
    candidates:s.candidates ? {published:s.candidates.published, url:s.candidates.url,
      list:s.candidates.list.map(c=>({name:c.name, party:c.party || null}))} : null,
    members:s.members.map(m=>({...memberRef(m), source_url:m.source_url,
      speeches:m.speeches ? {count:m.speeches.count, first:m.speeches.first, last:m.speeches.last, within_term:m.speeches.within_term} : null,
      speech_gap:m.speech_gap, votes:m.votes ? {count:m.votes.count, ayes:m.votes.ayes, noes:m.votes.noes} : null,
      recent_votes:titledVotes(m).map(v=>({date:v.date, title:v.title, href:v.href, vote:v.vote, source_url:v.source_url}))})),
    results_fetched:d.results_fetched, speech_updated:d.speech_updated, division_start:d.division_start, division_end:d.division_end}
}

export async function appVicElection(req: Request, env: ElectionEnv): Promise<Response> {
  const json = (body: unknown, status: number, headers: Record<string,string> = {}) => appJson(req,body,status,{'x-robots-tag':'noindex',...headers})
  if (!vicElectionEnabled(env.VIC_ELECTION_HUB_ENABLED)) return json({error:'not_published'},404)
  const method = readOnly(req)
  if (method) { method.headers.set('x-robots-tag','noindex'); return method }
  const url = new URL(req.url)
  const find = url.pathname === ROOT + '/find'
  const q = url.searchParams.get('q')?.trim().slice(0,60)
  if (find ? !q || [...url.searchParams.keys()].length !== 1 : Boolean(url.search)) return json({error:'invalid_query'},400)
  const id = url.pathname.startsWith(ROOT + '/seat/') ? url.pathname.slice((ROOT + '/seat/').length) : null
  if (!find && url.pathname !== ROOT && (id === null || !SLUG.test(id))) return json({error:'not_found'},404)
  try {
    const d = electionAsset(await assetJson(env,VIC_ELECTION_ASSET))
    let body: unknown
    if (find) {
      const places = await assetJson(env,VIC_ELECTION_PLACES).then(value=>placesAsset(value,d)).catch(()=>null)
      const hits = findSeats(q!,d,places).map(h=>({name:h.name, kind:h.kind,
        seats:h.seats.map(x=>({...seatRow(x.seat), share:h.seats.length > 1 ? x.share : null}))}))
      body = {schema_version:1, q:q!, places_searched:places !== null, hits, split:hits.some(h=>h.seats.length > 1),
        empty:hits.length ? null : /^\d{4}$/.test(q!) ? 'postcode' : 'place', address_url:d.sources.address,
        attribution:places?.attribution ?? '', note:places?.note ?? ''}
    } else if (id !== null) {
      const s = d.seats.find(s=>s.path === `${VIC_ELECTION_PATH}/${id}`)
      if (!s) return json({error:'not_found'},404)
      body = seatDetail(d,s)
    } else body = overview(d)
    const response = await appRead(req,body)
    response.headers.set('x-robots-tag','noindex')
    return response
  } catch {
    return json({error:'vic_election_unavailable'},503,{'retry-after':'60'})
  }
}
