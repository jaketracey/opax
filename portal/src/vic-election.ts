import {partyLabelHTML, partyShortName} from '../public/party-page.js'
import {shortDate} from '../public/format.js'
import {VIC_ELECTION_PATH, VIC_ELECTION_POLLS_OPEN, VIC_ELECTION_POLLS_CLOSE, VIC_ELECTION_DAY_START, VIC_ELECTION_EARLY_OPEN, VIC_ELECTION_EARLY_CLOSE, VIC_ELECTION_RESULTS_URL, VIC_ELECTION_ASSET, VIC_ELECTION_PLACES, VIC_ELECTION_AUTHORISATION_LINE, VIC_ELECTION_CORRECTIONS_EMAIL, VIC_ELECTION_CORRECTIONS_RESPONSE, vicElectionEnabled} from '../public/vic-election.js'
import {escapeHtml as esc, safeHref, type Crumb, type ReadAsset} from './seo-content'
import {hubShell, type HubFooterConfig} from './hubs'
import {trail} from './nav-model.mjs'

interface Division { date: string; title: string; href: string; vote: string; source_url: string }
export interface Member {
  name: string; party: string | null; href: string; source_url: string;
  speeches: {count: number; first: number; last: number; within_term: boolean} | null;
  speech_gap: string | null; votes: {count: number; ayes: number; noes: number} | null;
  detailed_count: number; divisions: Division[];
}
export interface Contest { date: string; kind: 'general' | 'by-election' | 'supplementary'; party: string; share: number; against: string; against_share: number; margin: number; url: string }
interface Candidate {name: string; party: string; group?: string | null; group_name?: string | null}
export interface Seat {
  name: string; kind: 'district' | 'region'; path: string; source_url: string; region: string | null;
  districts: string[]; boundary_note: string | null; formerly: string | null; created: boolean;
  result: {general: Contest; since: Contest | null} | null;
  candidates: {published: string; url: string; list: Candidate[]} | null;
  electorate_url: string; roster_date: string; members: Member[];
}
export interface VicElection {
  current_results?: VicResults | null;
  notice?: {text: string; link: {label: string; url: string} | null} | null;
  authorisation: string; corrections: {email: string; response: string};
  updated: string; checked: string; election_day: string; term_start: string; term_end: string;
  nominations_close: string; enrolment_close: string; postal_close: string; results_fetched: string;
  sources: Record<string,string>; licence: {name: string; attribution: string; exceptions: string};
  boundaries: {summary: string; created: string[]; abolished: string[]};
  speech_updated: string; division_start: string | null; division_end: string; interests_available: false;
  seats: Seat[]; pages: {path: string; lastmod: string}[];
}
/** Declared district counts only. Partial means some districts are still absent. */
export interface VicResults {
  election_day: string; fetched: string; status: 'partial' | 'final'; url: string;
  districts: {name: string; result: Contest}[];
}
export type VicElectionState = 'pre_poll' | 'early_voting' | 'election_day' | 'polls_closed' | 'results' | 'results_final'
/** Suburb, postcode and council rows: [name, [[district index, share in tenths of a percent]], usual residents]. */
type PlaceRow = [string, [number, number][], number]
export interface VicPlaces { attribution: string; note: string; districts: string[]; suburb: PlaceRow[]; postcode: PlaceRow[]; council: PlaceRow[] }
export interface PlaceHit { name: string; kind: 'District' | 'Region' | 'Member' | 'Suburb' | 'Postcode' | 'Council area'; seats: {seat: Seat; share: number | null}[] }

const ORIGIN = 'https://opax.com.au'
const approvedFooter = (footer: HubFooterConfig): HubFooterConfig => ({...footer,
  AUTHORISATION_LINE:VIC_ELECTION_AUTHORISATION_LINE,
  CORRECTION_CONTACT:`mailto:${VIC_ELECTION_CORRECTIONS_EMAIL}`, CORRECTION_RESPONSE:VIC_ELECTION_CORRECTIONS_RESPONSE})
const link = (href: string, label: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)
const count = (n: number) => n.toLocaleString('en-AU')
const pct = (n: number) => `${n.toFixed(1)}%`
const points = (n: number) => n.toFixed(1)
const past = (iso: string, now: Date) => now.getTime() >= Date.parse(iso)
/** All boundaries are explicit AEDT instants, independent of the Worker's UTC clock. */
export function vicElectionState(d: VicElection, now = new Date()): VicElectionState {
  if (past(VIC_ELECTION_POLLS_CLOSE,now)) {
    if (d.current_results?.districts.length) return d.current_results.status === 'final' ? 'results_final' : 'results'
    return 'polls_closed'
  }
  if (past(VIC_ELECTION_DAY_START,now)) return 'election_day'
  if (past(VIC_ELECTION_EARLY_OPEN,now) && !past(VIC_ELECTION_EARLY_CLOSE,now)) return 'early_voting'
  return 'pre_poll'
}
export const pollsClosed = (now: Date) => past(VIC_ELECTION_POLLS_CLOSE,now)
export const visibleResults = (d: VicElection, now: Date) => pollsClosed(now) ? d.current_results ?? null : null

/** Plain text shared by SSR and the app, including voting links and finder labels. */
export function vicElectionCopy(d: VicElection, now = new Date()) {
  const state = vicElectionState(d,now), closed = pollsClosed(now)
  const title = 'Victorian election 2026' + (state === 'results_final' ? ': final lower house results' : state === 'results' ? ': results' : closed ? ': polls closed' : '')
  const lede = closed
    ? `Voting closed at 6 pm AEDT on Saturday 28 November.${state === 'results_final' ? ' Final lower house district results are available.' : state === 'results' ? ' Published lower house district results are available.' : ' Check the VEC for count updates.'}`
    : state === 'election_day'
      ? past(VIC_ELECTION_POLLS_OPEN,now) ? 'Election day is today. Voting is open until 6 pm AEDT.' : 'Election day is today. Voting runs from 8 am to 6 pm AEDT.'
      : `Victorians vote on Saturday 28 November. ${past(d.enrolment_close,now) ? 'Enrolment closed at 8 pm on Tuesday 3 November.' : 'Enrol or update your details by 8 pm on Tuesday 3 November.'}`
  const voting = closed
    ? {title:'After voting',text:'Voting has closed. Check the VEC for postal vote requirements and count updates.',links:[{label:'VEC election information',url:d.sources.election},{label:'VEC state election results',url:visibleResults(d,now)?.url ?? VIC_ELECTION_RESULTS_URL}]}
    : {title:'How and where to vote',text:state === 'election_day' ? 'Election day voting is from 8 am to 6 pm AEDT. Check voting locations with the VEC.' : past(VIC_ELECTION_EARLY_CLOSE,now) ? 'Early voting has closed. Election day voting is Saturday 28 November, 8 am to 6 pm AEDT.' : 'Early voting runs 18–27 November, 9 am to 6 pm, except Sunday 22 November. Check locations and hours with the VEC.',links:[{label:'VEC voting options and locations',url:d.sources.voting}]}
  return {state,title,lede,voting,finder:{title:closed ? 'Find a seat and its records' : 'Which seat am I in?',button:closed ? 'Find seat records' : 'Find my seat'}}
}
const party = (name: string | null) => name ? partyLabelHTML(name) : ''
/** A section in the site's shared shape (ui-section): its rule, its title, an optional note. */
const section = (id: string, title: string, body: string, note = '') => `<section class="ui-section hub-section" id="${id}"><h2 class="ui-section-title">${title}</h2>${note ? `<p class="ui-section-note">${note}</p>` : ''}${body}</section>`
/** A block's onward links on one wrapping row, each a full touch target. */
const links = (items: string[]) => `<ul class="hub-links">${items.map(x=>`<li>${x}</li>`).join('')}</ul>`

/** The result a reader asks about: the latest contest for the seat. */
export const latest = (s: Seat) => s.result ? s.result.since || s.result.general : null
export const contestName = (c: Contest) => `${c.date.slice(0,4)} ${c.kind === 'general' ? 'election' : c.kind === 'supplementary' ? 'supplementary election' : 'by-election'}`
const memberOf = (d: VicElection, name: string) => d.seats.find(s => s.kind === 'district' && s.name === name)!

export interface KeyDate {
  id: 'enrolment' | 'caretaker' | 'nominations' | 'postal' | 'early' | 'election_day';
  label: string; when: string; passes_at: string | null; passed_label: string | null; passed_when: string | null;
  link: {label: string; url: string} | null;
}

// One source for the page's wording and the app's deadline switches.
export function keyDateRows(d: VicElection, now = new Date()): KeyDate[] {
  const rows: KeyDate[] = [
    {id:'enrolment',label:'Enrol or update your details by',when:'8 pm Tuesday 3 November 2026',passes_at:d.enrolment_close,passed_label:'Enrolment closed',passed_when:null,link:{label:'Check your enrolment',url:d.sources.enrolment}},
    {id:'caretaker',label:'Caretaker period begins',when:'6 pm Tuesday 3 November 2026',passes_at:'2026-11-03T18:00:00+11:00',passed_label:'Caretaker period began',passed_when:null,link:null},
    {id:'nominations',label:'Candidates confirmed',when:'After nominations close at noon on Monday 9 November 2026',passes_at:d.nominations_close,passed_label:null,passed_when:'Nominations closed at noon on Monday 9 November 2026',link:{label:'VEC election page',url:d.sources.election}},
    {id:'postal',label:'Apply for a postal vote by',when:'6 pm Wednesday 25 November 2026',passes_at:d.postal_close,passed_label:'Postal vote applications closed',passed_when:null,link:null},
    {id:'early',label:'Early voting',when:'18–27 November 2026, 9 am to 6 pm. Closed Sunday 22 November',passes_at:VIC_ELECTION_EARLY_CLOSE,passed_label:'Early voting closed',passed_when:'6 pm Friday 27 November 2026',link:pollsClosed(now) ? null : {label:'Where and how to vote',url:d.sources.voting}},
    {id:'election_day',label:'Election day',when:'Saturday 28 November 2026, 8 am to 6 pm AEDT',passes_at:VIC_ELECTION_POLLS_CLOSE,passed_label:'Voting closed',passed_when:'6 pm AEDT on Saturday 28 November 2026',link:null},
  ]
  return rows.map(r=>r.passes_at && past(r.passes_at,now) ? {...r,label:r.passed_label ?? r.label,when:r.passed_when ?? r.when} : r)
}

function keyDates(d: VicElection, now: Date) {
  return section('key-dates','Key dates',`<dl class="vic-dates">${keyDateRows(d,now).map(r=>{
    const more = r.link ? link(r.link.url,r.link.label) : ''
    return `<div><dt>${esc(r.label)}</dt><dd>${esc(r.when)}${more ? `<span class="vic-date-link">${more}</span>` : ''}</dd></div>`
  }).join('')}</dl>`)
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

function finder(d: VicElection, place: string | null, hits: PlaceHit[] | null, copy: ReturnType<typeof vicElectionCopy>['finder']) {
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
  return `<section class="vic-finder" id="find" aria-labelledby="find-title"><h2 id="find-title">${esc(copy.title)}</h2>
<form class="vic-find-form" action="${VIC_ELECTION_PATH}#find" method="get" role="search"><label for="vic-place">Suburb, postcode or district</label><div class="vic-find-row"><input class="ui-input" id="vic-place" name="place" type="search" inputmode="search" autocomplete="address-level2" maxlength="60" required${value}><button class="ui-button" type="submit" data-variant="primary">${esc(copy.button)}</button></div></form>${results}</section>`
}

/** Only titled questions, without duplicate titles, in the source order. */
export const titledVotes = (m: Member) => m.divisions.filter((r,i,all)=>!/^(?:assembly|council) divided on /i.test(r.title) && all.findIndex(x=>x.title === r.title) === i).slice(0,3)

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
  const titled = titledVotes(m)
  const votes = opts.search && titled.length
    ? `<h3 class="ui-subsection-title">Recent votes</h3><ul class="vic-votes">${titled.map(r=>`<li><a href="${esc(r.href)}">${esc(r.title)}</a><span class="hub-meta">${esc(shortDate(r.date))} · ${esc(voteWord(r.vote))}</span></li>`).join('')}</ul>`
    : ''
  return `<article class="vic-member">${opts.heading}${stats.length ? `<ul class="vic-stats">${stats.join('')}</ul>` : ''}${search}${votes}${links([link(m.href,'Full profile'),...opts.search ? [] : [link(speeches,'Speeches')],link(m.source_url,'Parliament of Victoria profile')])}</article>`
}

/** Candidates as the VEC publishes them after nominations close: ballot paper order, no other ordering. */
function candidates(s: Seat) {
  if (!s.candidates?.list.length) return ''
  const row = (c: Candidate, number?: number) => `<li>${number === undefined ? '' : `<span class="vic-candidate-no" aria-hidden="true">${number}</span>`}<span class="vic-candidate"><span class="vic-candidate-name">${esc(c.name)}</span>${c.party && c.party.toLowerCase() !== 'independent' ? party(c.party) : ''}</span></li>`
  let body: string
  if (s.kind === 'region') {
    const groups: {letter: Candidate['group']; name: string; list: Candidate[]}[] = []
    for (const c of s.candidates.list) {
      if (!groups.length || groups.at(-1)!.letter !== c.group) groups.push({letter:c.group,name:c.group_name || '',list:[]})
      groups.at(-1)!.list.push(c)
    }
    body = groups.map((g,i) => {
      const heading = g.letter === null ? 'Ungrouped' : g.letter ? `Group ${g.letter}${g.name ? ', '+partyShortName(g.name) : ''}` : ''
      const id = `candidate-group-${i}`
      return `${heading ? `<h3 class="ui-subsection-title" id="${id}">${esc(heading)}</h3>` : ''}<ul class="vic-candidates vic-candidates-region" role="list"${heading ? ` aria-labelledby="${id}"` : ''}>${g.list.map(c=>row(c)).join('')}</ul>`
    }).join('')
  } else {
    body = `<ol class="vic-candidates" role="list">${s.candidates.list.map((c,i)=>row(c,i+1)).join('')}</ol>`
  }
  return section('candidates','Candidates',body,
    `In ballot paper order, as published by the VEC on ${esc(shortDate(s.candidates.published))}. ${link(s.candidates.url,'VEC candidate list')}`)
}

function resultFacts(s: Seat) {
  const r = s.result
  if (!r) return ''
  const line = (c: Contest) => `${esc(c.party)} ${pct(c.share)}, ${esc(c.against)} ${pct(c.against_share)} after preferences`
  const now = r.since || r.general
  const rows = [[`${contestName(now).replace(/^./,c=>c.toUpperCase())}`, `${line(now)}. ${link(now.url,'VEC result')}`],['Winning margin',`${points(now.margin)} points`]]
  if (r.since) rows.push([`${contestName(r.general).replace(/^./,c=>c.toUpperCase())}`, `${line(r.general)}. ${link(r.general.url,'VEC result')}`])
  return rows.map(([dt,dd])=>`<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')
}

function electionResults(d: VicElection, s: Seat | null, now: Date) {
  const results = visibleResults(d,now)
  if (!results) return ''
  const rows = results.districts.filter(r=>!s || (s.kind === 'district' ? r.name === s.name : s.districts.includes(r.name)))
  if (!rows.length) return ''
  const body = rows.map(({name,result:r})=>{
    const seat = memberOf(d,name)
    return `<li><a class="vic-seat" href="${esc(s?.kind === 'district' ? r.url : seat.path+'#results')}"><span class="vic-seat-name">${esc(name)}</span><span class="vic-seat-figure">${esc(r.party)} by ${points(r.margin)}</span><span class="vic-seat-held">${esc(r.party)} ${pct(r.share)}, ${esc(r.against)} ${pct(r.against_share)} after preferences</span></a></li>`
  }).join('')
  return section('results',results.status === 'final' ? 'Final lower house results' : 'Lower house results',seatList(body,'Published district results'),
    `${esc(results.election_day.slice(0,4))} election. ${results.districts.length} of 88 district results published here. Winning margins are in percentage points. Updated ${esc(shortDate(results.fetched))}. ${link(results.url,'All VEC results, including the upper house')}`)
}

export const VIC_ELECTION_ABOUT = 'Dates, boundaries and results © Victorian Electoral Commission; suburb and postcode splits from the Australian Bureau of Statistics (both CC BY 4.0); speeches and votes from OPAX’s parliamentary record.'
const about = () => `<p class="vic-about">About this data: ${VIC_ELECTION_ABOUT.replace(/^D/,'d')} ${link('/methods#vic-election','How this page is built')}</p>`

const structured = (path: string, d: VicElection, rows: {href: string; name: string}[]) => ({'@graph':[
  {'@type':'Event','@id':ORIGIN+VIC_ELECTION_PATH+'#election',name:'2026 Victorian state election',url:ORIGIN+VIC_ELECTION_PATH,
    startDate:VIC_ELECTION_POLLS_OPEN,endDate:VIC_ELECTION_POLLS_CLOSE,eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
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
  const copy = vicElectionCopy(d,now), closed = pollsClosed(now)
  const rosterNote = closed ? `Members are from the published roster dated ${shortDate(d.seats.map(s=>s.roster_date).sort().at(-1)!)}. ` : ''
  const districtNote = rosterNote + 'Each row shows the member and the winning margin at the 2022 election, in percentage points, unless a later by-election is named.'
  const districts = d.seats.filter(x=>x.kind === 'district'), regions = d.seats.filter(x=>x.kind === 'region')
  let title: string, description: string, body: string, crumbs: Crumb[]
  if (!s) {
    title = copy.title
    description = `Find your Victorian state seat by suburb or postcode, previous results and parliamentary records. ${copy.lede}`
    crumbs = trail(VIC_ELECTION_PATH)
    body = `<div class="ui-page-head"><h1>${esc(title)}</h1>`
      + `<p class="ui-lede">${esc(copy.lede)}${!past(d.enrolment_close,now) ? ' '+link(d.sources.enrolment,'Check your enrolment') : ''}</p></div>`
      // Side by side on wide screens, so the seat list starts in the first screen.
      + `<div class="vic-top">${finder(d,find?.place ?? null,find?.hits ?? null,copy.finder)}${keyDates(d,now)}</div>`
      + electionResults(d,null,now)
      + section('districts','Lower house: 88 districts',seatList(districts.map(x=>seatRow(x)).join(''),'Districts'),districtNote)
      + section('regions','Upper house: 8 regions',`<ul class="vic-regions">${regions.map(r=>`<li><a class="vic-region" href="${esc(r.path)}"><span class="vic-seat-name">${esc(r.name)}</span><span class="vic-region-members">${r.members.map(m=>`<span>${esc(m.name)} ${party(m.party)}</span>`).join('')}</span></a></li>`).join('')}</ul>`,rosterNote+'Each region elects five members.')
  } else if (s.kind === 'district') {
    const m = s.members[0], region = d.seats.find(r=>r.kind === 'region' && r.name === s.region)!
    title = `${s.name} district · Victorian election 2026`
    const r = latest(s)
    description = `${closed ? 'Published member records for' : 'Who holds'} ${s.name}, ${r ? `the ${contestName(r)} result and winning margin, ` : ''}and what ${m.name} has done in Parliament. ${copy.lede}`
    crumbs = trail(VIC_ELECTION_PATH, s.name)
    body = `<div class="ui-page-head"><h1>${esc(s.name)}</h1><p class="ui-page-meta">Lower house district in ${link(region.path,region.name+' Region')}${s.formerly ? `. Called ${esc(s.formerly)} before 2022` : s.created ? '. First contested in 2022' : ''}.</p></div>`
      + `<p class="ui-lede">${esc(copy.lede)}</p>`
      + electionResults(d,s,now)
      + `<dl class="vic-facts"><div><dt>${closed ? 'Member in published roster dated '+esc(shortDate(s.roster_date)) : 'Held by'}</dt><dd>${link(m.href,m.name)} ${party(m.party)}</dd></div>${resultFacts(s)}</dl>`
      + candidates(s)
      + section('record',`What ${esc(m.name)} has done`,record(m,{search:true,heading:''}))
      + section('region',`Upper house: ${esc(region.name)} Region`,`<ul class="vic-people">${region.members.map(x=>`<li>${link(x.href,x.name)} ${party(x.party)}</li>`).join('')}</ul>${links([link(region.path,`${region.name} Region: members and their records`)])}`,`${esc(s.name)} is part of this upper house region, which elects five members.`)
      + keyDates(d,now)
      + `<div class="vic-elsewhere">${links([link(s.source_url,'District map and profile (VEC)'),link(VIC_ELECTION_PATH+'#find','Find another seat')])}</div>`
  } else {
    title = `${s.name} Region · Victorian election 2026`
    description = `The five upper house members ${closed ? 'in the published roster for' : 'for'} ${s.name} Region, what they have done in Parliament, and its 11 districts. ${copy.lede}`
    crumbs = trail(VIC_ELECTION_PATH, s.name+' Region')
    body = `<div class="ui-page-head"><h1>${esc(s.name)} Region</h1><p class="ui-page-meta">Upper house region with five members and 11 districts${s.formerly ? `. Called ${esc(s.formerly)} Region before 2022` : ''}.</p></div>`
      + `<p class="ui-lede">${esc(copy.lede)}</p>`
      + electionResults(d,s,now)
      + candidates(s)
      + section('members',closed ? 'Members in the published roster' : 'Members',`<div class="vic-members">${s.members.map(m=>record(m,{search:false,heading:`<h3>${link(m.href,m.name)} ${party(m.party)}</h3>`})).join('')}</div>`,closed ? `Roster dated ${esc(shortDate(s.roster_date))}.` : '')
      + section('districts','Districts in this region',seatList(s.districts.map(name=>seatRow(memberOf(d,name))).join(''),'Districts'),districtNote)
      + keyDates(d,now)
      + `<div class="vic-elsewhere">${links([link(s.source_url,'Region map and profile (VEC)'),link(VIC_ELECTION_PATH+'#find','Find your seat')])}</div>`
  }
  body += section('voting',esc(copy.voting.title),`<p>${esc(copy.voting.text)}</p>${links(copy.voting.links.map(x=>link(x.url,x.label)))}`) + about()
  return {state:copy.state,title,description,html:hubShell(`<div class="vic-hub" data-election-state="${copy.state}">${body}</div>`,approvedFooter(footer),crumbs),jsonLd:structured(path,d,s ? s.members.map(m=>({href:m.href,name:m.name})) : d.seats.map(x=>({href:x.path,name:x.name}))),
    card:{kicker:'Victorian election · 28 November 2026',title,lines:[description],authorisation:VIC_ELECTION_AUTHORISATION_LINE}}
}
export async function vicElectionPage(id: string | null, read: ReadAsset, config: HubFooterConfig & {VIC_ELECTION_HUB_ENABLED?: string} = {}, place: string | null = null, now = new Date()) {
  const missing = {title:'Hub not found',description:'This hub is not available.',html:hubShell('<h1>Hub not found</h1><p>This hub is not available.</p>',vicElectionEnabled(config.VIC_ELECTION_HUB_ENABLED) ? approvedFooter(config) : {},vicElectionEnabled(config.VIC_ELECTION_HUB_ENABLED) ? trail(VIC_ELECTION_PATH,'Not found') : []),jsonLd:null,status:404}
  if (!vicElectionEnabled(config.VIC_ELECTION_HUB_ENABLED) || (id !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) return missing
  const d = await read<VicElection>(VIC_ELECTION_ASSET)
  if (id === null) {
    const q = place?.trim().slice(0,60) || null
    // Seat and member names answer without the place index; suburbs and postcodes need it.
    const find = q ? {place:q,hits:findSeats(q,d,await read<VicPlaces>(VIC_ELECTION_PLACES).catch(()=>null))} : null
    return {...renderVicElection(d,null,config,now,find),status:200,noindex:Boolean(q)}
  }
  const s = d.seats.find(s=>s.path === `${VIC_ELECTION_PATH}/${id}`)
  return s ? {...renderVicElection(d,s,config,now),status:200} : missing
}
