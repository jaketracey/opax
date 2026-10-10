import {sourceLineHTML, tagHTML} from '../public/labels.js'
import {shortDate} from '../public/format.js'
import {VIC_ELECTION_PATH, VIC_ELECTION_ASSET, vicElectionEnabled} from '../public/vic-election.js'
import {escapeHtml as esc, safeHref, type ReadAsset} from './seo-content'
import {hubShell, type HubFooterConfig} from './hubs'

interface Division { date: string; title: string; href: string; vote: string; source_url: string }
interface Member {
  name: string; href: string; source_url: string;
  speeches: {count: number; first: number; last: number; within_term: boolean} | null;
  speech_gap: string | null; votes: {count: number; ayes: number; noes: number} | null;
  detailed_count: number; divisions: Division[];
}
interface Seat {
  name: string; kind: 'district' | 'region'; path: string; source_url: string; region: string | null;
  districts: string[]; boundary_note: string | null; electorate_url: string; roster_date: string; members: Member[];
}
export interface VicElection {
  updated: string; checked: string; election_day: string; term_start: string; term_end: string; nominations_close: string;
  sources: Record<string,string>; licence: {name: string; attribution: string; exceptions: string};
  boundaries: {summary: string; created: string[]; abolished: string[]};
  speech_updated: string; division_start: string | null; division_end: string; interests_available: false;
  seats: Seat[]; pages: {path: string; lastmod: string}[];
}
const ORIGIN = 'https://opax.com.au'
const link = (href: string, label: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)
const count = (n: number) => n.toLocaleString('en-AU')
const dates = (d: VicElection) => `<section class="hub-section" id="key-dates"><h2>Key dates</h2><dl class="vic-dates"><div><dt>Caretaker period</dt><dd>6 pm Tuesday 3 November 2026, unless the Legislative Assembly is dissolved earlier. ${link(d.sources.caretaker,'Victorian caretaker guidelines')}</dd></div><div><dt>Early voting</dt><dd>18–27 November 2026; closed Sunday 22 November. ${link(d.sources.voting,'VEC voting options')}</dd></div><div><dt>Election day</dt><dd>Saturday 28 November 2026, 8 am to 6 pm. ${link(d.sources.timeline,'VEC election timeline')}</dd></div></dl></section>`
const candidates = (d: VicElection, now: Date) => `<section class="hub-section" id="candidates"><h2>Candidate information</h2><p>${now.getTime() < Date.parse(d.nominations_close) ? 'VEC nominations close at noon on Monday 9 November 2026. The final field can be confirmed only after nominations close; consult the VEC for its published candidates.' : 'Nominations closed at noon on Monday 9 November 2026. Consult the VEC for its published candidate lists.'} ${link(d.sources.election,'VEC election information')}</p></section>`
const grants = () => '<section class="hub-section" id="grants"><h2>Grants by state electorate</h2><p>Not available. OPAX holds no Victorian state grants. Federal electorates are different from state districts and regions, so federal grant records cannot be assigned here. No approximate mapping is used.</p><p class="hub-meta">An association does not prove influence.</p></section>'
const coverage = (d: VicElection) => `<section class="hub-section hub-coverage" id="coverage"><h2>What OPAX holds for Victoria</h2><ul><li>Hansard: partial coverage from 2018–2026. Member counts describe the available export, with its recorded years; an annual aggregate cannot separate speeches before and after the November 2022 election. A mixed federal and Victorian aggregate cannot establish a Victorian total. No complete 2022–2026 term total is available.</li><li>Victorian divisions: the vote export covers 2026 only. Detailed division pages in this snapshot cover ${d.division_start ? shortDate(d.division_start) + ' to ' + shortDate(d.division_end) : 'no dated records'}. Participation totals and detailed pages are separate exports and can differ. Missing records do not mean a member did not speak or vote.</li><li>Declared interests: no Victorian register in OPAX’s interests export.</li><li>Grants: no Victorian state grants. Federal electorates ≠ state districts; federal grants are not mapped to these pages.</li><li>Victorian Hansard and divisions are copyright material with limited permitted uses and no open licence. Further reuse can require permission. These pages reproduce counts and links, without Hansard passages. ${link('/methods','Sources and methods')}</li></ul>${sourceLineHTML({updated:d.speech_updated,dateLabel:'Speech export',source:'Existing OPAX exports',originals:[{href:'/parliamentarians.json',label:'Parliamentarian export'},{href:'/votes.json',label:'Vote export'},{href:'/interests/index.json',label:'Interests coverage'}]})}</section>`
const boundary = (d: VicElection, s?: Seat) => `<section class="hub-section" id="boundaries"><h2>Electoral boundaries</h2><p>${esc(d.boundaries.summary)}</p>${s?.boundary_note ? `<p>${esc(s.boundary_note)}</p>` : ''}${!s ? `<p>Districts created for 2022: ${esc(d.boundaries.created.join(', '))}.</p><p>Districts abolished for 2022: ${esc(d.boundaries.abolished.join(', '))}.</p>` : ''}${sourceLineHTML({updated:d.checked,dateLabel:'Checked',source:'VEC boundary review',originals:[{href:d.sources.boundaries,label:'VEC state boundary reviews'},{href:d.sources.report,label:'EBC final boundaries report'}]})}</section>`
const licence = (d: VicElection) => `<p class="hub-meta">District and region names and election dates: ${esc(d.licence.attribution)}. ${link(d.sources.licence,d.licence.name)}. ${esc(d.licence.exceptions)}</p>`
const structured = (path: string, d: VicElection, rows: {href: string; name: string}[]) => ({'@graph':[
  {'@type':'Event','@id':ORIGIN+VIC_ELECTION_PATH+'#election',name:'2026 Victorian state election',url:ORIGIN+VIC_ELECTION_PATH,
    startDate:'2026-11-28T08:00:00+11:00',endDate:'2026-11-28T18:00:00+11:00',eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
    location:{'@type':'Place',name:'Victoria, Australia',address:{'@type':'PostalAddress',addressRegion:'VIC',addressCountry:'AU'}},
    organizer:{'@type':'GovernmentOrganization',name:'Victorian Electoral Commission',url:'https://www.vec.vic.gov.au/'},sameAs:d.sources.election},
  {'@type':'ItemList','@id':ORIGIN+path+'#records',numberOfItems:rows.length,itemListElement:rows.map((r,i)=>({'@type':'ListItem',position:i+1,name:r.name,url:ORIGIN+r.href}))},
]})
const member = (m: Member) => {
  const speeches = m.speeches
    ? `${count(m.speeches.count)} Victorian Hansard speeches in the ${m.speeches.first}–${m.speeches.last} export.${m.speeches.within_term ? ' These exported years fall within this term; earlier term records can be missing.' : m.speeches.first === 2022 ? ' This annual aggregate cannot separate records before and after the November 2022 election; a term-only count is not available.' : ' This aggregate includes years outside this term; a term-only count is not available.'}`
    : m.speech_gap || 'No speech count is available in this export.'
  const vote = (v: string) => ({aye:'Aye',no:'No',abstain:'Abstained',absent:'Absent'} as Record<string,string>)[v] || v
  return `<article class="vic-member"><h3>${link(m.href,m.name)}</h3><h4>Hansard speeches</h4><p>${esc(speeches)} ${link(m.href,'Browse recorded speeches')}</p><h4>Victorian divisions · 2026 only</h4><p>${m.votes ? `${count(m.votes.count)} recorded vote participations: ${count(m.votes.ayes)} ayes, ${count(m.votes.noes)} noes.` : 'No participation total for this member in the vote export.'} Earlier term divisions are not available.</p>${m.divisions.length ? `<details class="hub-largest"><summary>Latest detailed divisions (${Math.min(5,m.detailed_count)} of ${m.detailed_count} recorded)</summary><ul>${m.divisions.map(r=>`<li>${link(r.href,r.title)}<p class="hub-meta">${shortDate(r.date)} · ${esc(vote(r.vote))} · ${link(r.source_url,'Original division')}</p></li>`).join('')}</ul></details>` : '<p class="hub-meta">No detailed division rows for this member in this export.</p>'}<h4>Declared interests</h4><p>Not available: OPAX holds no Victorian register of interests.</p><p class="hub-meta">${link(m.source_url,'Official member profile')}</p></article>`
}
export function renderVicElection(d: VicElection, s: Seat | null, footer: HubFooterConfig = {}, now = new Date()) {
  const path = s?.path || VIC_ELECTION_PATH
  const title = s ? `${s.name} ${s.kind} · Victorian election 2026` : 'Victorian election 2026'
  const description = s ? `Sitting ${s.kind === 'district' ? 'member' : 'members'} and the available parliamentary record for ${s.name}, with coverage limits and official election dates.` : 'The 88 Victorian state districts and 8 regions, sitting members and their available parliamentary records.'
  let body = `${s ? `<nav class="hub-trail" aria-label="Breadcrumb">${link(VIC_ELECTION_PATH,'Victorian election 2026')}</nav>` : tagHTML('State election · 28 November 2026')}<h1>${esc(title)}</h1><p class="hub-lead">${esc(description)}</p><p>Public records for the 2022–2026 parliamentary term, with gaps stated below.</p>`
  body += sourceLineHTML({updated:d.checked,dateLabel:'VEC information checked',source:'Victorian Electoral Commission',originals:[{href:s?.source_url || d.sources.districts,label:s ? 'Official electorate' : 'Official districts'},{href:d.sources.regions,label:'Official regions'}]})
  body += `<nav class="hub-pills" aria-label="On this page">${(s ? [['#members','Members and records']] : [['#districts','88 districts'],['#regions','8 regions']]).concat([['#key-dates','Key dates'],['#coverage','Coverage']]).map(([href,label])=>tagHTML(label,href)).join('')}</nav>`
  if (s) {
    if (s.region) { const region = d.seats.find(r=>r.name === s.region && r.kind === 'region')!; body += `<p>Legislative Assembly district in ${link(region.path,region.name+' Region')}.</p>` }
    body += `<p>${link(s.electorate_url,'Existing OPAX electorate page')}</p><section class="hub-section" id="members"><h2>${s.kind === 'district' ? 'Sitting member' : 'Sitting members'}</h2><p class="hub-meta">Validated parliamentary roster as at ${shortDate(s.roster_date)}. Membership can change; check the official profiles. These are parliamentary representatives in that snapshot.</p>${s.members.map(member).join('')}</section>`
    if (s.districts.length) body += `<section class="hub-section"><h2>Districts in this region</h2><ul class="vic-seats">${s.districts.map(name=>{const row=d.seats.find(r=>r.kind === 'district' && r.name === name)!;return `<li>${link(row.path,name)}</li>`}).join('')}</ul></section>`
  } else {
    for (const kind of ['district','region'] as const) {
      const seats = d.seats.filter(s=>s.kind === kind)
      body += `<section class="hub-section" id="${kind}s"><h2>${kind === 'district' ? 'Legislative Assembly districts' : 'Legislative Council regions'} <span class="hub-count">${seats.length}</span></h2><ul class="vic-seats">${seats.map(s=>`<li>${link(s.path,s.name)}</li>`).join('')}</ul></section>`
    }
  }
  body += dates(d)+candidates(d,now)+boundary(d,s || undefined)+grants()+coverage(d)+licence(d)
  return {title,description,html:hubShell(body,footer),jsonLd:structured(path,d,s ? s.members.map(m=>({href:m.href,name:m.name})) : d.seats.map(s=>({href:s.path,name:s.name})))}
}
export async function vicElectionPage(id: string | null, read: ReadAsset, config: HubFooterConfig & {VIC_ELECTION_HUB_ENABLED?: string} = {}) {
  const missing = {title:'Hub not found',description:'This hub is not available.',html:hubShell('<h1>Hub not found</h1><p>This hub is not available.</p>',config),jsonLd:null,status:404}
  if (!vicElectionEnabled(config.VIC_ELECTION_HUB_ENABLED) || (id !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) return missing
  const d = await read<VicElection>(VIC_ELECTION_ASSET)
  if (id === null) return {...renderVicElection(d,null,config),status:200}
  const s = d.seats.find(s=>s.path === `${VIC_ELECTION_PATH}/${id}`)
  return s ? {...renderVicElection(d,s,config),status:200} : missing
}
