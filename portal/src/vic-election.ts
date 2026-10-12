import {partyLabelHTML} from '../public/labels.js'
import {shortDate} from '../public/format.js'
import {VIC_ELECTION_PATH, VIC_ELECTION_ASSET, VIC_ELECTION_PLACES, VIC_ELECTION_AUTHORISATION_LINE, VIC_ELECTION_CORRECTIONS_EMAIL, VIC_ELECTION_CORRECTIONS_RESPONSE, vicElectionEnabled} from '../public/vic-election.js'
import {escapeHtml as esc, safeHref, type Crumb, type ReadAsset} from './seo-content'
import {hubShell, type HubFooterConfig} from './hubs'

interface Division { date: string; title: string; href: string; vote: string; source_url: string }
interface Member {
  name: string; party: string | null; href: string; source_url: string;
  speeches: {count: number; first: number; last: number; within_term: boolean} | null;
  speech_gap: string | null; votes: {count: number; ayes: number; noes: number} | null;
  detailed_count: number; divisions: Division[];
}
interface Contest { date: string; kind: 'general' | 'by-election' | 'supplementary'; party: string; share: number; against: string; against_share: number; margin: number; url: string }
interface Seat {
  name: string; kind: 'district' | 'region'; path: string; source_url: string; region: string | null;
  districts: string[]; boundary_note: string | null; formerly: string | null; created: boolean;
  result: {general: Contest; since: Contest | null} | null;
  candidates: {published: string; url: string; list: {name: string; party: string}[]} | null;
  electorate_url: string; roster_date: string; members: Member[];
}
export interface VicElection {
  authorisation: string; corrections: {email: string; response: string};
  updated: string; checked: string; election_day: string; term_start: string; term_end: string;
  nominations_close: string; enrolment_close: string; postal_close: string; results_fetched: string;
  sources: Record<string,string>; licence: {name: string; attribution: string; exceptions: string};
  boundaries: {summary: string; created: string[]; abolished: string[]};
  speech_updated: string; division_start: string | null; division_end: string; interests_available: false;
  seats: Seat[]; pages: {path: string; lastmod: string}[];
}
/** Suburb, postcode and council rows: [name, [[district index, share in tenths of a percent]], usual residents]. */
type PlaceRow = [string, [number, number][], number]
export interface VicPlaces { attribution: string; note: string; districts: string[]; suburb: PlaceRow[]; postcode: PlaceRow[]; council: PlaceRow[] }
export interface PlaceHit { name: string; kind: 'District' | 'Region' | 'Member' | 'Suburb' | 'Postcode' | 'Council area'; seats: {seat: Seat; share: number | null}[] }

const ORIGIN = 'https://opax.com.au'
const HUB: Crumb = {label:'Victorian election 2026',href:VIC_ELECTION_PATH}
const approvedFooter = (footer: HubFooterConfig): HubFooterConfig => ({...footer,
  AUTHORISATION_LINE:VIC_ELECTION_AUTHORISATION_LINE,
  CORRECTION_CONTACT:`mailto:${VIC_ELECTION_CORRECTIONS_EMAIL}`, CORRECTION_RESPONSE:VIC_ELECTION_CORRECTIONS_RESPONSE})
const link = (href: string, label: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)
const count = (n: number) => n.toLocaleString('en-AU')
const pct = (n: number) => `${n.toFixed(1)}%`
const points = (n: number) => n.toFixed(1)
const past = (iso: string, now: Date) => now.getTime() >= Date.parse(iso)
const party = (name: string | null) => name ? partyLabelHTML(name) : ''

/** The result a reader asks about: the latest contest for the seat. */
const latest = (s: Seat) => s.result ? s.result.since || s.result.general : null
const contestName = (c: Contest) => `${c.date.slice(0,4)} ${c.kind === 'general' ? 'election' : c.kind === 'supplementary' ? 'supplementary election' : 'by-election'}`
const memberOf = (d: VicElection, name: string) => d.seats.find(s => s.kind === 'district' && s.name === name)!

// One line per date, in the order a voter needs them. Deadlines that have passed say so.
function keyDates(d: VicElection, now: Date) {
  const rows: [string, string, string][] = [
    [past(d.enrolment_close,now) ? 'Enrolment closed' : 'Enrol or update your details by', '8 pm Tuesday 3 November 2026', link(d.sources.enrolment,'Check your enrolment')],
    [past(d.enrolment_close,now) ? 'Caretaker period began' : 'Caretaker period begins', '6 pm Tuesday 3 November 2026', ''],
    ['Candidates confirmed', past(d.nominations_close,now) ? 'Nominations closed at noon on Monday 9 November 2026' : 'After nominations close at noon on Monday 9 November 2026', link(d.sources.election,'VEC election page')],
    [past(d.postal_close,now) ? 'Postal vote applications closed' : 'Apply for a postal vote by', '6 pm Wednesday 25 November 2026', ''],
    ['Early voting', '18–27 November 2026, 9 am to 6 pm. Closed Sunday 22 November', link(d.sources.voting,'Where and how to vote')],
    ['Election day', 'Saturday 28 November 2026, 8 am to 6 pm', ''],
  ]
  return `<section class="hub-section" id="key-dates"><h2>Key dates</h2><dl class="vic-dates">${rows.map(([label,when,more])=>`<div><dt>${esc(label)}</dt><dd>${esc(when)}${more ? `<span class="vic-date-link">${more}</span>` : ''}</dd></div>`).join('')}</dl></section>`
}

/** A seat as one tappable row: name, who holds it, and the last winning margin
 *  (or, in finder results for a split place, the share of its residents). */
function seatRow(s: Seat, share: number | null = null) {
  const r = latest(s)
  const held = s.kind === 'district' ? `${esc(s.members[0].name)} ${party(s.members[0].party)}` : `${s.members.length} members`
  const [figure, when] = share !== null ? [share >= 99.95 ? 'All' : share < 1 ? 'Under 1%' : `${Math.round(share)}%`, 'of residents']
    // The caption says 2022; only a later by-election names its contest.
    : r ? [`${r.party} by ${points(r.margin)}`, r.kind === 'general' ? '' : contestName(r)] : ['','']
  return `<li><a class="vic-seat" href="${esc(s.path)}"><span class="vic-seat-name">${esc(s.name)}</span>${figure ? `<span class="vic-seat-figure">${esc(figure)}</span>` : ''}<span class="vic-seat-held">${held}</span>${when ? `<span class="vic-seat-when">${esc(when)}</span>` : ''}</a></li>`
}
const seatList = (seats: string, label: string) => `<ul class="vic-seats" aria-label="${esc(label)}">${seats}</ul>`

function finder(d: VicElection, place: string | null, hits: PlaceHit[] | null) {
  const value = place ? ` value="${esc(place)}"` : ''
  let results = ''
  if (place !== null && hits) {
    results = hits.length
      ? `<div class="vic-hits"><h3 class="visually-hidden">Results</h3>${hits.map(h=>`<div class="vic-hit">${h.kind === 'District' || h.kind === 'Region' ? '' : `<p class="vic-hit-place"><strong>${esc(h.name)}</strong> <span>${esc(h.kind)}</span></p>`}${seatList(h.seats.map(x=>seatRow(x.seat,h.seats.length > 1 ? x.share : null)).join(''),h.name)}</div>`).join('')}${hits.some(h=>h.seats.length > 1) ? `<p class="hub-meta">Some places cross district lines. ${link(d.sources.address,'Check your exact address with the VEC')}.</p>` : ''}</div>`
      : /^\d{4}$/.test(place.trim())
        // PO box postcodes have no residents, so the ABS postal areas don't include them.
        ? `<p class="vic-hits">No Victorian postcode area matches “${esc(place)}”. PO box postcodes aren’t included: try your suburb, or ${link(d.sources.address,'check your address with the VEC')}.</p>`
        : `<p class="vic-hits">No suburb, postcode or district matches “${esc(place)}”. Try a nearby suburb, or ${link(d.sources.address,'check your address with the VEC')}.</p>`
  }
  return `<section class="vic-finder" id="find" aria-labelledby="find-title"><h2 id="find-title">Which seat am I in?</h2>
<form class="vic-find-form" action="${VIC_ELECTION_PATH}#find" method="get" role="search"><label for="vic-place">Suburb, postcode or district</label><div class="vic-find-row"><input class="ui-input" id="vic-place" name="place" type="search" inputmode="search" autocomplete="address-level2" maxlength="60" required${value}><button class="ui-button" type="submit" data-variant="primary">Find my seat</button></div></form>${results}</section>`
}

/** What a member has done: counts that are held, a speech search, recent votes. */
function record(m: Member, opts: {search: boolean; heading: string}) {
  const stats: string[] = []
  if (m.speeches) stats.push(`<li><b>${count(m.speeches.count)}</b> ${m.speeches.count === 1 ? 'speech' : 'speeches'} in Parliament, ${m.speeches.first === m.speeches.last ? m.speeches.first : `${m.speeches.first}–${m.speeches.last}`}</li>`)
  if (m.votes) stats.push(`<li><b>${count(m.votes.count)}</b> ${m.votes.count === 1 ? 'vote' : 'votes'} recorded in 2026: ${count(m.votes.ayes)} aye, ${count(m.votes.noes)} no</li>`)
  const voteWord = (v: string) => ({aye:'Aye',no:'No',abstain:'Abstained',absent:'Absent'} as Record<string,string>)[v] || v
  const speeches = `/ask?${new URLSearchParams({view:'search',speaker:m.name,kind:'speech'})}`
  const search = opts.search
    ? `<form class="vic-speech-search" action="/ask" method="get" role="search"><input type="hidden" name="view" value="search"><input type="hidden" name="speaker" value="${esc(m.name)}"><input type="hidden" name="kind" value="speech"><label for="vic-speech-q">Search ${esc(m.name)}’s speeches</label><div class="vic-find-row"><input class="ui-input" id="vic-speech-q" name="q" type="search" placeholder="Housing, health, schools" maxlength="120" required><button class="ui-button" type="submit">Search</button></div></form>`
    : ''
  // "Assembly divided on motion" says nothing about what was decided: only titled questions are listed.
  const titled = m.divisions.filter((r,i,all)=>!/^(?:assembly|council) divided on /i.test(r.title) && all.findIndex(x=>x.title === r.title) === i).slice(0,3)
  const votes = opts.search && titled.length
    ? `<h3 class="vic-subhead">Recent votes</h3><ul class="vic-votes">${titled.map(r=>`<li><a href="${esc(r.href)}">${esc(r.title)}</a><span class="hub-meta">${esc(shortDate(r.date))} · ${esc(voteWord(r.vote))}</span></li>`).join('')}</ul>`
    : ''
  return `<article class="vic-member">${opts.heading}${stats.length ? `<ul class="vic-stats">${stats.join('')}</ul>` : ''}${search}${votes}<p class="vic-more">${link(m.href,'Full profile')}${opts.search ? '' : ` · ${link(speeches,'Speeches')}`} · ${link(m.source_url,'Parliament of Victoria profile')}</p></article>`
}

/** Candidates as the VEC publishes them after nominations close: ballot paper order, no other ordering. */
const candidates = (s: Seat) => s.candidates?.list.length
  ? `<section class="hub-section" id="candidates"><h2>Candidates</h2><p class="hub-meta">In ballot paper order, as published by the VEC on ${esc(shortDate(s.candidates.published))}. ${link(s.candidates.url,'VEC candidate list')}</p><ol class="vic-candidates">${s.candidates.list.map(c=>`<li>${esc(c.name)} ${c.party ? party(c.party) : ''}</li>`).join('')}</ol></section>`
  : ''

function resultFacts(s: Seat) {
  const r = s.result
  if (!r) return ''
  const line = (c: Contest) => `${esc(c.party)} ${pct(c.share)}, ${esc(c.against)} ${pct(c.against_share)} after preferences`
  const now = r.since || r.general
  const rows = [[`${contestName(now).replace(/^./,c=>c.toUpperCase())}`, `${line(now)}. ${link(now.url,'VEC result')}`],['Winning margin',`${points(now.margin)} points`]]
  if (r.since) rows.push([`${contestName(r.general).replace(/^./,c=>c.toUpperCase())}`, `${line(r.general)}. ${link(r.general.url,'VEC result')}`])
  return rows.map(([dt,dd])=>`<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')
}

const about = () => `<p class="vic-about">About this data: dates, boundaries and results © Victorian Electoral Commission; suburb and postcode splits from the Australian Bureau of Statistics (both CC BY 4.0); speeches and votes from OPAX’s parliamentary record. ${link('/methods#vic-election','How this page is built')}</p>`

const structured = (path: string, d: VicElection, rows: {href: string; name: string}[]) => ({'@graph':[
  {'@type':'Event','@id':ORIGIN+VIC_ELECTION_PATH+'#election',name:'2026 Victorian state election',url:ORIGIN+VIC_ELECTION_PATH,
    startDate:'2026-11-28T08:00:00+11:00',endDate:'2026-11-28T18:00:00+11:00',eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
    location:{'@type':'Place',name:'Victoria, Australia',address:{'@type':'PostalAddress',addressRegion:'VIC',addressCountry:'AU'}},
    organizer:{'@type':'GovernmentOrganization',name:'Victorian Electoral Commission',url:'https://www.vec.vic.gov.au/'},sameAs:d.sources.election},
  {'@type':'ItemList','@id':ORIGIN+path+'#records',numberOfItems:rows.length,itemListElement:rows.map((r,i)=>({'@type':'ListItem',position:i+1,name:r.name,url:ORIGIN+r.href}))},
]})

// ---- the seat finder -----------------------------------------------------------------

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[’'.]/g,'')
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\b(?:vic|victoria)$/,'').trim()
  .replace(/^mt\b/,'mount').replace(/\bmt\b/g,'mount').replace(/^saint\b/,'st')
// Folding ~3,700 place names is the costly part of a search: once per parsed index.
const folded = new WeakMap<PlaceRow[], string[]>()
const foldedNames = (rows: PlaceRow[]) => { let names = folded.get(rows); if (!names) folded.set(rows, names = rows.map(r=>fold(r[0]))); return names }
/** Places matching a reader's words: exact names first, then names that start with them. */
export function findSeats(q: string, d: VicElection, places: VicPlaces | null): PlaceHit[] {
  const want = fold(q.slice(0,60))
  if (!want) return []
  const seatByName = new Map(d.seats.map(s=>[s.kind+':'+s.name,s]))
  const hits: (PlaceHit & {score: number; order: number; people: number})[] = []
  const score = (name: string, n = fold(name)) => { return n === want ? 0 : n.startsWith(want + ' ') || n.startsWith(want) && want.length >= 3 ? 1 : n.split(' ').some(w=>w.startsWith(want)) && want.length >= 3 ? 2 : -1 }
  for (const s of d.seats) {
    const own = score(s.name)
    if (own >= 0) hits.push({name:s.name,kind:s.kind === 'district' ? 'District' : 'Region',seats:[{seat:s,share:null}],score:own,order:0,people:0})
    for (const m of s.members) if (s.kind === 'district' && fold(m.name).split(' ').concat(fold(m.name)).includes(want))
      hits.push({name:m.name,kind:'Member',seats:[{seat:s,share:null}],score:fold(m.name) === want ? 0 : 2,order:3,people:0})
  }
  if (places) {
    const rows: [PlaceHit['kind'], PlaceRow[], number][] = /^\d{4}$/.test(want) ? [['Postcode',places.postcode,1]] : [['Suburb',places.suburb,1],['Council area',places.council,2]]
    for (const [kind,list,order] of rows) for (const [index,[name,parts,people]] of list.entries()) {
      const own = kind === 'Postcode' ? (name === want ? 0 : -1) : score(name,foldedNames(list)[index])
      if (own < 0) continue
      const seats = parts.map(([i,share])=>({seat:seatByName.get('district:'+places.districts[i])!,share:share/10})).filter(x=>x.seat)
      hits.push({name,kind,seats,score:own,order,people})
    }
  }
  hits.sort((a,b)=>a.score - b.score || a.order - b.order || b.people - a.people || a.name.localeCompare(b.name))
  // "Bass" the district, suburb and council area are one answer: a place wholly inside a
  // district already listed by name adds nothing. Other suburbs keep their own row.
  const named = new Set(hits.filter(h=>h.kind === 'District').map(h=>h.seats[0].seat.path))
  return hits.filter(h=>h.kind === 'District' || h.seats.length > 1 || !named.has(h.seats[0].seat.path))
    .slice(0,8).map(({name,kind,seats})=>({name,kind,seats}))
}

// ---- pages -----------------------------------------------------------------------------

export function renderVicElection(d: VicElection, s: Seat | null, footer: HubFooterConfig = {}, now = new Date(), find: {place: string; hits: PlaceHit[]} | null = null) {
  const path = s?.path || VIC_ELECTION_PATH
  const districts = d.seats.filter(x=>x.kind === 'district'), regions = d.seats.filter(x=>x.kind === 'region')
  let title: string, description: string, body: string, crumbs: Crumb[]
  if (!s) {
    title = 'Victorian election 2026'
    description = 'Find your Victorian state seat by suburb or postcode, see who holds it, the last winning margin and what they have done in Parliament. Election day is Saturday 28 November 2026.'
    crumbs = [{label:HUB.label}]
    body = `<h1>${esc(title)}</h1>`
      + `<p class="hub-lead">Victorians vote on Saturday 28 November. ${past(d.enrolment_close,now) ? 'Enrolment closed at 8 pm on Tuesday 3 November.' : `Enrol or update your details by 8 pm on Tuesday 3 November. ${link(d.sources.enrolment,'Check your enrolment')}`}</p>`
      // Side by side on wide screens, so the seat list starts in the first screen.
      + `<div class="vic-top">${finder(d,find?.place ?? null,find?.hits ?? null)}${keyDates(d,now)}</div>`
      + `<section class="hub-section" id="districts"><h2>Lower house: 88 districts</h2><p class="hub-meta">Each row shows the member and the winning margin at the 2022 election, in percentage points, unless a later by-election is named.</p>${seatList(districts.map(x=>seatRow(x)).join(''),'Districts')}</section>`
      + `<section class="hub-section" id="regions"><h2>Upper house: 8 regions</h2><p class="hub-meta">Each region elects five members.</p><ul class="vic-regions">${regions.map(r=>`<li><a class="vic-region" href="${esc(r.path)}"><span class="vic-seat-name">${esc(r.name)}</span><span class="vic-region-members">${r.members.map(m=>`<span>${esc(m.name)} ${party(m.party)}</span>`).join('')}</span></a></li>`).join('')}</ul></section>`
  } else if (s.kind === 'district') {
    const m = s.members[0], region = d.seats.find(r=>r.kind === 'region' && r.name === s.region)!
    title = `${s.name} district · Victorian election 2026`
    const r = latest(s)
    description = `Who holds ${s.name}, ${r ? `the ${contestName(r)} result and winning margin, ` : ''}and what ${m.name} has done in Parliament. Victorian election, Saturday 28 November 2026.`
    crumbs = [HUB,{label:s.name}]
    body = `<h1>${esc(s.name)}</h1><p class="vic-kind">Lower house district in ${link(region.path,region.name+' Region')}${s.formerly ? `. Called ${esc(s.formerly)} before 2022` : s.created ? '. First contested in 2022' : ''}.</p>`
      + `<dl class="vic-facts"><div><dt>Held by</dt><dd>${link(m.href,m.name)} ${party(m.party)}</dd></div>${resultFacts(s)}</dl>`
      + candidates(s)
      + `<section class="hub-section" id="record"><h2>What ${esc(m.name)} has done</h2>${record(m,{search:true,heading:''})}</section>`
      + `<section class="hub-section" id="region"><h2>Upper house: ${esc(region.name)} Region</h2><p class="hub-meta">Voters in ${esc(s.name)} also elect this region’s five upper house members.</p><ul class="vic-people">${region.members.map(x=>`<li>${link(x.href,x.name)} ${party(x.party)}</li>`).join('')}</ul><p class="vic-more">${link(region.path,`${region.name} Region: members and their records`)}</p></section>`
      + keyDates(d,now)
      + `<p class="vic-more vic-elsewhere">${link(s.source_url,'District map and profile (VEC)')} · ${link(VIC_ELECTION_PATH+'#find','Find another seat')}</p>`
  } else {
    title = `${s.name} Region · Victorian election 2026`
    description = `The five upper house members for ${s.name} Region, what they have done in Parliament, and its 11 districts. Victorian election, Saturday 28 November 2026.`
    crumbs = [HUB,{label:s.name+' Region'}]
    body = `<h1>${esc(s.name)} Region</h1><p class="vic-kind">Upper house region with five members and 11 districts${s.formerly ? `. Called ${esc(s.formerly)} Region before 2022` : ''}.</p>`
      + candidates(s)
      + `<section class="hub-section" id="members"><h2>Members</h2><div class="vic-members">${s.members.map(m=>record(m,{search:false,heading:`<h3>${link(m.href,m.name)} ${party(m.party)}</h3>`})).join('')}</div></section>`
      + `<section class="hub-section" id="districts"><h2>Districts in this region</h2><p class="hub-meta">Each row shows the member and the winning margin at the 2022 election, in percentage points, unless a later by-election is named.</p>${seatList(s.districts.map(name=>seatRow(memberOf(d,name))).join(''),'Districts')}</section>`
      + keyDates(d,now)
      + `<p class="vic-more vic-elsewhere">${link(s.source_url,'Region map and profile (VEC)')} · ${link(VIC_ELECTION_PATH+'#find','Find your seat')}</p>`
  }
  body += about()
  return {title,description,html:hubShell(`<div class="vic-hub">${body}</div>`,approvedFooter(footer),crumbs),jsonLd:structured(path,d,s ? s.members.map(m=>({href:m.href,name:m.name})) : d.seats.map(x=>({href:x.path,name:x.name}))),
    card:{kicker:'Victorian election · 28 November 2026',title,lines:[description],authorisation:VIC_ELECTION_AUTHORISATION_LINE}}
}
export async function vicElectionPage(id: string | null, read: ReadAsset, config: HubFooterConfig & {VIC_ELECTION_HUB_ENABLED?: string} = {}, place: string | null = null) {
  const missing = {title:'Hub not found',description:'This hub is not available.',html:hubShell('<h1>Hub not found</h1><p>This hub is not available.</p>',vicElectionEnabled(config.VIC_ELECTION_HUB_ENABLED) ? approvedFooter(config) : {}),jsonLd:null,status:404}
  if (!vicElectionEnabled(config.VIC_ELECTION_HUB_ENABLED) || (id !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) return missing
  const d = await read<VicElection>(VIC_ELECTION_ASSET)
  if (id === null) {
    const q = place?.trim().slice(0,60) || null
    // Seat and member names answer without the place index; suburbs and postcodes need it.
    const find = q ? {place:q,hits:findSeats(q,d,await read<VicPlaces>(VIC_ELECTION_PLACES).catch(()=>null))} : null
    return {...renderVicElection(d,null,config,new Date(),find),status:200,noindex:Boolean(q)}
  }
  const s = d.seats.find(s=>s.path === `${VIC_ELECTION_PATH}/${id}`)
  return s ? {...renderVicElection(d,s,config),status:200} : missing
}
