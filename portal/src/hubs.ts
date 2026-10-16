import { sourceLineHTML, machineLabelHTML, statusLabelHTML } from '../public/labels.js'
import { shortDate, shortMoney } from '../public/format.js'
import { houseName, orderedWeeks, day, sydneyDay } from '../public/hubs-data.js'
import { sponsorPerson, type SponsorCandidate } from '../public/sponsor-person.js'
import {divisionTableConfig, divisionRows, voteTableHTML, voteTablePage} from '../public/vote-tables.js'
import type {Query} from '../public/datatable.js'
import { escapeHtml as esc, safeHref, crumbsHTML, type Crumb, type ReadAsset } from './seo-content'
import { trail } from './nav-model.mjs'
import { sittingVideos, videoSectionHTML } from '../public/video-card.js'

interface Bill {
  key: string; title: string; introduced: string; originating_house: string; sponsor?: string; sponsor_person_id?: string; portfolio?: string;
  summary?: { sentences?: string[]; generated_at?: string; as_of?: string }; sources?: {kind: string; url: string}[];
}
interface Division { key: string; slug: string; title?: string; name?: string; stage?:string; question?: string; date: string; house: string; result?: string; ayes?: number; noes?: number; source_url?: string }
interface Week { start: string; end: string; houses: string[]; senate_cutoff?: string; estimates?: string; bills: Bill[]; divisions: Division[]; lastmod: string }
export interface HubIndex { updated: string; snapshotDate: string; billUpdated: string; latestFederalDivision: string; sources: { label: string; url: string }[]; weeks: Week[]; pages: {path: string; lastmod: string}[] }
/** A row of /video/senate.json (scripts/senate_video/): the Senate's own upload, linked and embedded, never hosted. */
export interface Video { id: string; title: string; published: string | null; kind: 'question_time' | 'first_speech' | 'other'; date: string | null; chamber: 'senate'; person_slug?: string | null; person_pid?: string | null; url: string }
interface Window { start: string; end: string }
interface Totals<T> { count: number; total: number; largest: T[] }
interface Contract { id: string; title: string; supplier: string; amount: number; published: string; start_date?: string; url: string; link_scope?: string }
interface Grant { id: string; title: string; recipient: string; value: number; date: string; url: string; link_scope?: string }
interface Agency { id: string; name: string; contracts: Totals<Contract>; grants: Totals<Grant> }
interface Committee { id: string; name: string; group: string; program: {source_url: string; agencies: string[]} | null; portfolios: { name: string; agencies: string[] }[] }
export interface Estimates {
  id: string; name: string; start: string; end: string; updated: string; source_url: string; published_status: string;
  portfolio_source_url: string; portfolio_checked: string; portfolio_note: string;
  groups: {id: string; start: string; end: string}[]; committees: Committee[]; agencies: Agency[];
  contractWindow: Window; grantWindow: Window; contractUpdated: string; grantUpdated: string;
}
const ORIGIN = 'https://opax.com.au'
// Optional footer defaults for federal hubs. Victoria supplies its approved values.
export const CORRECTION_CONTACT: string | null = null
export const AUTHORISATION_LINE: string | null = null
export interface HubFooterConfig { AUTHORISATION_LINE?: string | null; CORRECTION_CONTACT?: string | null; CORRECTION_RESPONSE?: string | null }
const date = shortDate
const range = (start: string, end: string) => `${date(start)} – ${date(end)}`
const count = (n: number) => n.toLocaleString('en-AU')
const money = (n: number) => shortMoney(n)
const link = (href: string, text: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text)
const itemList = (path: string, rows: {href: string; name: string}[]) => ({'@type':'ItemList','@id':ORIGIN + path + '#records',numberOfItems:rows.length,itemListElement:rows.map((r,i) => ({'@type':'ListItem',position:i+1,name:r.name,url:ORIGIN+r.href}))})
const event = (path: string, name: string, start: string, end: string, source: string) => ({'@type':'Event','@id':ORIGIN+path+'#event',url:ORIGIN+path,name,startDate:start,endDate:end,eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',location:{'@type':'Place',name:'Australian Parliament House',address:'Canberra ACT, Australia'},organizer:{'@type':'GovernmentOrganization',name:'Parliament of Australia',url:'https://www.aph.gov.au/'},sameAs:source})
const correctionLine = (contact: string | null, response?: string | null) => {
  if (!contact) return ''
  // Mail links accept only a bare address; URLs continue through the shared safeHref gate.
  const email = /^mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i.exec(contact)?.[1]
  const report = email ? `<a href="mailto:${esc(email)}">Report a correction: ${esc(email)}</a>` : link(contact,'Report a correction')
  return `<p class="hub-corrections">${report}${response ? `<span>${esc(response)}</span>` : ''}</p>`
}
/** A hub page: the breadcrumb strip (the trail after Home), then the page. */
export const hubShell = (body: string, config: HubFooterConfig = {}, crumbs: Crumb[] = []) => {
  const authorisation = config.AUTHORISATION_LINE ?? AUTHORISATION_LINE
  const correction = correctionLine(config.CORRECTION_CONTACT ?? CORRECTION_CONTACT, config.CORRECTION_RESPONSE)
  const lines = (authorisation ? `<p class="hub-authorisation">${esc(authorisation)}</p>` : '') + correction
  return `${crumbsHTML(crumbs)}<section id="prerender" class="wrap hub-page">${body}${lines ? `<div class="hub-footer">${lines}</div>` : ''}</section>`
}
const shell = hubShell
/** The page's one title and the one line under it (a ui-page-head): a lede on
 *  the index, a meta line (chambers, programme status) on a week or estimates.
 *  What dates the page (its source line, a cut-off) stays in the head. */
const header = (title: string, line: string, kind: 'lead' | 'meta' = 'lead', after = '') => `<div class="ui-page-head"><h1>${esc(title)}</h1><p class="${kind === 'lead' ? 'ui-lede' : 'ui-page-meta'}">${esc(line)}</p>${after}</div>`

// The index row's small marker: the week has the Senate's Question Time on video.
const videoMark = (n: number) => n ? ` · <span class="hub-video-mark">Video<span class="visually-hidden">: Senate Question Time on ${n} sitting ${n === 1 ? 'day' : 'days'}</span></span>` : ''
export function renderSittingIndex(data: HubIndex, today: string, footer: HubFooterConfig = {}, videos: Video[] = []) {
  const weeks = orderedWeeks(data.weeks,today)
  const title = 'Federal sitting weeks'
  const description = 'Bills introduced and divisions held during each sitting week, from the published parliamentary record.'
  const rows = weeks.map(w => {
    const active = today >= w.start && today <= w.end
    const state = active ? 'Current' : today < w.start ? 'Upcoming' : 'Past'
    return `<li><div><h2 class="ui-row-title">${link(`/sitting/${w.start}`,range(w.start,w.end))}</h2><p class="ui-row-meta">${esc(w.houses.map(houseName).join(' and '))}${videoMark(sittingVideos(videos,w.start,w.end).length)}</p>${w.estimates ? `<p class="ui-row-meta">${link(`/estimates/${w.estimates}`,'Senate Supplementary Budget Estimates')}</p>` : ''}</div>${statusLabelHTML(state,active ? 'active' : 'ended')}</li>`
  }).join('')
  // Every Senate upload, including the Question Time of weeks before this calendar starts.
  const allVideo = videos.length ? `<p class="hub-more">${link('/video/senate','All Senate videos')}</p>` : ''
  const html = shell(header(title,description,'lead',sourceLineHTML({updated:data.updated,source:'APH sitting calendar',originals:data.sources.map(s => ({href:s.url,label:s.label}))})+allVideo)+`<ul class="ui-list hub-weeks" role="list">${rows}</ul>`,footer,trail('/sitting'))
  return {title,description,html,jsonLd:{'@graph':[itemList('/sitting',weeks.map(w => ({href:`/sitting/${w.start}`,name:range(w.start,w.end)})))]}}
}
export function renderSittingWeek(data: HubIndex, week: Week, people: SponsorCandidate[], slugs: Map<string,string>, today = sydneyDay(), footer: HubFooterConfig = {}, tableQuery: Query = {}, videos: Video[] = []) {
  const path = `/sitting/${week.start}`
  const title = `Sitting week: ${range(week.start,week.end)}`
  const description = 'Bills introduced and divisions held in the federal parliamentary record during this period.'
  const sources = sourceLineHTML({updated:data.updated,source:'APH sitting calendar',originals:data.sources.map(s => ({href:s.url,label:s.label}))})
  // Chambers are the week's meta line, not tags; the cut-off is one plain sentence.
  let head = ''
  if (week.senate_cutoff) head += `<p class="ui-page-meta">Senate two-thirds cut-off: ${date(week.senate_cutoff)}.</p>`
  head += sources
  if (week.estimates) head += `<p class="ui-lede">${link(`/estimates/${week.estimates}`,'Senate Supplementary Budget Estimates')} takes place alongside this House sitting week.</p>`
  head += `<p class="ui-lede">Bill details update when Parliament's site allows our crawler</p>`
  let body = header(title,week.houses.map(houseName).join(' and '),'meta',head)
  const rows: {href:string;name:string}[] = []
  if (!week.bills.length) body += sourceLineHTML({updated:data.billUpdated,source:'ParlInfo bill records'})
  if (week.bills.length) {
    body += `<section class="ui-section hub-section"><h2 class="ui-section-title">Bills introduced <span class="hub-count">${week.bills.length}</span></h2><ul class="ui-list hub-records" role="list">` + week.bills.map(b => {
      const href = `/bill/${b.key}`
      rows.push({href,name:b.title})
      const sponsor = b.sponsor ? sponsorPerson(b.sponsor,b.sponsor_person_id,people) : null
      const sponsorText = sponsor && slugs.has(sponsor.name) ? link(`/subject/person/${slugs.get(sponsor.name)}`,sponsor.name) : esc(b.sponsor?.trim() || b.portfolio?.trim() || 'Sponsor not recorded')
      const summaryDate = day(b.summary?.generated_at) || day(b.summary?.as_of)
      const summary = b.summary?.sentences?.length && summaryDate ? `<div class="hub-summary">${machineLabelHTML({pill:true})}<span class="hub-date">${day(b.summary.generated_at) ? 'Written' : 'As at'} ${date(summaryDate)}</span><p>${esc(b.summary.sentences.join(' '))}</p></div>` : ''
      return `<li><h3 class="ui-row-title">${link(href,b.title)}</h3><p class="ui-row-meta">Introduced ${date(b.introduced)} · ${esc(houseName(b.originating_house))} · ${sponsorText}</p>${summary}</li>`
    }).join('')+'</ul>'
    // One dated source line closes the block; each bill's ParlInfo record is in its sheet.
    const originals = week.bills.flatMap(b => (b.sources || []).filter(s => s.kind === 'billhome').slice(0,1).map(s => ({href:s.url,label:b.title})))
    body += sourceLineHTML({updated:data.billUpdated,source:'ParlInfo bill records',originals})+'</section>'
  }
  // The Senate's own Question Time video for each day it sat: a card that plays only when pressed.
  const days = sittingVideos(videos,week.start,week.end)
  if (days.length) body += videoSectionHTML('Senate Question Time',days,{id:'senate-video',
    note:'Video published by the Senate Public Information Office on YouTube. The player loads from YouTube only when you press play.',
    after:`<p class="video-more">${link(`/video/senate#m${days[0].date!.slice(0,7)}`,'More Senate video')}</p>`+sourceLineHTML({updated:days.map(d => d.published?.slice(0,10) || '').sort().at(-1) || '',dateLabel:'Published',source:'AuSenate YouTube channel',originals:[{href:'https://www.youtube.com/@AuSenate',label:'AuSenate: The Senate Public Information Office'}]})})
  {
    const config = divisionTableConfig({jurisdiction:'federal', start:week.start, end:week.end}, 'Divisions held', 'sitting')
    const divisions = divisionRows(week.divisions)
    const page = voteTablePage(divisions,config,tableQuery)
    for (const d of page.rows) if (typeof d.href === 'string') rows.push({href:d.href,name:String(d.title)})
    body += `<section class="ui-section hub-section">${voteTableHTML(config,page)}${sourceLineHTML({updated:data.snapshotDate,dateLabel:'Published snapshot',source:'Exported division records',notes:['Only formal divisions leave a per-member record. Open a division for its question, party tallies, members and original source.']})}</section>`
  }
  if (!week.divisions.length && today >= week.start) {
    const coverage = data.latestFederalDivision ? `Federal divisions in OPAX's published record currently run to ${date(data.latestFederalDivision)}; divisions held after that date will appear here once the record is updated.` : 'Federal divisions are not available in this OPAX export; they will appear here once the record is updated.'
    body += `<section class="hub-section"><p>${esc(coverage)}</p>${sourceLineHTML({originals:[{href:'https://theyvoteforyou.org.au/divisions',label:'They Vote For You divisions'}],notes:['Absence from this export does not establish that no divisions were held.']})}</section>`
  }
  return {title,description,html:shell(body,footer,trail('/sitting',range(week.start,week.end))),jsonLd:{'@graph':[event(path,title,week.start,week.end,data.sources[0].url),itemList(path,rows)]}}
}
export function renderEstimates(data: Estimates, footer: HubFooterConfig = {}) {
  const title = `Senate ${data.name}: ${range(data.start,data.end)}`
  const description = 'Committee dates and portfolio agencies, with recent AusTender contracts and GrantConnect awards.'
  const unconfirmed = data.committees.some(c => !c.program)
  // The hearing dates' source line; which agencies a committee lists, and why, sit in its sheet.
  let body = header(title,data.published_status,'meta',sourceLineHTML({updated:data.updated,dateLabel:'Checked',source:'APH next hearings',
    originals:[{href:data.source_url,label:'Dates and hearing programs'},{href:data.portfolio_source_url,label:'Portfolio allocations'}],
    notes:[...(unconfirmed ? ['Portfolio agencies are listed until a committee publishes its hearing program; they are not confirmed hearing appearances.'] : []),
      `Portfolio allocations checked ${esc(date(data.portfolio_checked))} on the Australian Government Organisations Register.`,esc(data.portfolio_note)]}))
  body += `<nav class="hub-toc" aria-labelledby="hub-toc-head"><p class="ui-toc-head" id="hub-toc-head">On this page</p><ul class="ui-toc-list" role="list">${data.groups.map(g => `<li><a href="#group-${esc(g.id)}"><span>Group ${esc(g.id)}</span><span class="hub-meta">${esc(range(g.start,g.end))}</span></a></li>`).join('')}</ul></nav>`
  // The money block: its one inline caveat, then one source line for both registers.
  const moneyUpdated = [data.contractUpdated,data.grantUpdated].filter(Boolean).sort()[0] || ''
  body += `<div class="hub-coverage"><p>Contract and grant figures are recorded award values, not payments.</p>${sourceLineHTML({updated:moneyUpdated,source:'AusTender and GrantConnect',
    originals:[{href:'https://www.tenders.gov.au/',label:'AusTender register'},{href:'https://www.grants.gov.au/Ga/List',label:'GrantConnect register'}],
    notes:[`Period covered: contracts published ${esc(range(data.contractWindow.start,data.contractWindow.end))}; grants agreed ${esc(range(data.grantWindow.start,data.grantWindow.end))}. Counts cover the available exports; gaps in those exports remain.`,
      `AusTender, updated ${esc(date(data.contractUpdated))}: one latest notice per contract; amendments are not added together. Dates are publication dates. A register link is labelled when a notice URL is unavailable.`,
      `GrantConnect, updated ${esc(date(data.grantUpdated))}: dates are agreement dates. Future agreements beyond the export date are excluded. No donor records are used.`]})}</div>`
  const list = new Map<string,{href:string;name:string}>()
  for (const group of data.groups) {
    body += `<section class="ui-section hub-section" id="group-${group.id}"><h2 class="ui-section-title">Group ${group.id}</h2><p class="hub-meta">${range(group.start,group.end)}</p>`
    for (const c of data.committees.filter(c => c.group === group.id)) {
      const names = c.program?.agencies || c.portfolios.flatMap(p => p.agencies)
      const agencies = [...new Set(names)].map(n => data.agencies.find(a => a.name === n)!).sort((a,b) => a.name.localeCompare(b.name,'en'))
      body += `<details class="ui-disclosure hub-committee"${c === data.committees[0] ? ' open' : ''}><summary><h3>${esc(c.name)}</h3><span class="hub-meta">${agencies.length} agencies</span></summary><div class="ui-disclosure-body hub-committee-body"><p>${esc(c.portfolios.map(p => p.name).join(' · '))}</p><p class="hub-fallback">${c.program ? link(c.program.source_url,'Published hearing program') : 'Portfolio agencies (program not yet published)'}</p>`
      for (const a of agencies) {
        const href = `/subject/agency/${a.id}`
        list.set(a.id,{href,name:a.name})
        body += `<article class="hub-agency"><h4>${link(href,a.name)}</h4><dl class="hub-totals"><div><dt>Contracts</dt><dd>${count(a.contracts.count)} · ${money(a.contracts.total)}</dd></div><div><dt>Grants</dt><dd>${a.grants.count ? `${count(a.grants.count)} · ${money(a.grants.total)}` : 'No grants in this period'}</dd></div></dl>`
        // Award rows are titled by what was bought or funded; the notice id is meta.
        if (a.contracts.largest.length || a.grants.largest.length) body += `<details class="ui-disclosure hub-largest"><summary>Largest recorded awards, by value</summary>${a.contracts.largest.length ? `<h5>Contracts</h5><ul>${a.contracts.largest.map(r => `<li><p>${link(r.url,r.title || r.id)}${r.link_scope === 'source_register' ? ' (AusTender register)' : ''}</p><p class="hub-meta">${esc(r.supplier)} · ${money(r.amount)} · Published ${date(r.published)} · ${esc(r.id)}</p></li>`).join('')}</ul>` : ''}${a.grants.largest.length ? `<h5>Grants</h5><ul>${a.grants.largest.map(r => `<li><p>${link(r.url,r.title || r.id)}${r.link_scope === 'source_register' ? ' (GrantConnect register)' : ''}</p><p class="hub-meta">${esc(r.recipient)} · ${money(r.value)} · Agreement ${date(r.date)} · ${esc(r.id)}</p></li>`).join('')}</ul>` : ''}</details>`
        body += '</article>'
      }
      body += '</div></details>'
    }
    body += '</section>'
  }
  return {title,description,html:shell(body,footer,trail(`/estimates/${data.id}`,data.name)),jsonLd:{'@graph':[event(`/estimates/${data.id}`,title,data.start,data.end,data.source_url),itemList(`/estimates/${data.id}`,[...list.values()])]}}
}
export async function hubPage(kind: 'sitting' | 'estimates', id: string | null, read: ReadAsset, people: SponsorCandidate[], slugs: Map<string,string>, today = sydneyDay(), footer: HubFooterConfig = {}, tableQuery: Query = {}) {
  const missing = {title:'Hub not found',description:'This period is not in the published calendar.',html:shell(header('Hub not found','Browse the published sitting weeks.'),footer),jsonLd:null,status:404}
  if (kind === 'estimates') {
    if (id !== '2026-10') return missing
    const data = await read<Estimates>(`/hubs/estimates-${id}.json`)
    return {...renderEstimates(data,footer),status:200}
  }
  if (id !== null && !/^\d{4}-\d{2}-\d{2}$/.test(id)) return missing
  const [data, video] = await Promise.all([read<HubIndex>('/hubs/index.json'), read<{videos: Video[]}>('/video/senate.json').catch(() => null)])
  const videos = Array.isArray(video?.videos) ? video.videos : []
  if (id === null) return {...renderSittingIndex(data,today,footer,videos),status:200}
  const week = data.weeks.find(w => w.start === id)
  return week ? {...renderSittingWeek(data,week,people,slugs,today,footer,tableQuery,videos),status:200} : missing
}
