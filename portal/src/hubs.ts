import { sourceLineHTML, machineLabelHTML, statusLabelHTML, tagHTML } from '../public/labels.js'
import { shortDate } from '../public/format.js'
import { houseName, orderedWeeks, day, sydneyDay } from '../public/hubs-data.js'
import { sponsorPerson, type SponsorCandidate } from '../public/sponsor-person.js'
import { divisionPlain } from '../public/division-markdown.js'
import { escapeHtml as esc, safeHref, type ReadAsset } from './seo-content'

interface Bill {
  key: string; title: string; introduced: string; originating_house: string; sponsor?: string; sponsor_person_id?: string; portfolio?: string;
  summary?: { sentences?: string[]; generated_at?: string; as_of?: string }; sources?: {kind: string; url: string}[];
}
interface Division { key: string; slug: string; title?: string; name?: string; question?: string; date: string; house: string; result?: string; ayes?: number; noes?: number; source_url?: string }
interface Week { start: string; end: string; houses: string[]; senate_cutoff?: string; estimates?: string; bills: Bill[]; divisions: Division[]; lastmod: string }
export interface HubIndex { updated: string; snapshotDate: string; latestFederalDivision: string; sources: { label: string; url: string }[]; weeks: Week[]; pages: {path: string; lastmod: string}[] }
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
// Pending Jake's decision. Set to the approved contact path or URL to enable.
export const CORRECTION_CONTACT: string | null = null
export const AUTHORISATION_LINE: string | null = null
export interface HubFooterConfig { AUTHORISATION_LINE?: string | null; CORRECTION_CONTACT?: string | null }
const date = shortDate
const range = (start: string, end: string) => `${date(start)} – ${date(end)}`
const count = (n: number) => n.toLocaleString('en-AU')
const money = (n: number) => n.toLocaleString('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0})
const link = (href: string, text: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text)
const itemList = (path: string, rows: {href: string; name: string}[]) => ({'@type':'ItemList','@id':ORIGIN + path + '#records',numberOfItems:rows.length,itemListElement:rows.map((r,i) => ({'@type':'ListItem',position:i+1,name:r.name,url:ORIGIN+r.href}))})
const event = (path: string, name: string, start: string, end: string, source: string) => ({'@type':'Event','@id':ORIGIN+path+'#event',url:ORIGIN+path,name,startDate:start,endDate:end,eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',location:{'@type':'Place',name:'Australian Parliament House',address:'Canberra ACT, Australia'},organizer:{'@type':'GovernmentOrganization',name:'Parliament of Australia',url:'https://www.aph.gov.au/'},sameAs:source})
const correctionLine = (contact: string | null) => contact ? `<p class="hub-corrections">${link(contact,'Report a correction')}</p>` : ''
export const hubShell = (body: string, config: HubFooterConfig = {}) => {
  const authorisation = config.AUTHORISATION_LINE ?? AUTHORISATION_LINE
  const correction = correctionLine(config.CORRECTION_CONTACT ?? CORRECTION_CONTACT)
  const lines = (authorisation ? `<p class="hub-authorisation">${esc(authorisation)}</p>` : '') + correction
  return `<section id="prerender" class="wrap hub-page">${body}${lines ? `<footer class="hub-footer">${lines}</footer>` : ''}</section>`
}
const shell = hubShell
const header = (title: string, description: string, back = true) => `${back ? '<nav class="hub-trail" aria-label="Breadcrumb"><a href="/sitting">Sitting weeks</a></nav>' : ''}<h1>${esc(title)}</h1><p class="hub-lead">${esc(description)}</p>`

export function renderSittingIndex(data: HubIndex, today: string, footer: HubFooterConfig = {}) {
  const weeks = orderedWeeks(data.weeks,today)
  const title = 'Federal sitting weeks'
  const description = 'Bills introduced and divisions held during each sitting week, from the published parliamentary record.'
  const rows = weeks.map(w => {
    const active = today >= w.start && today <= w.end
    const state = active ? 'Current' : today < w.start ? 'Upcoming' : 'Past'
    return `<li><div><h2>${link(`/sitting/${w.start}`,range(w.start,w.end))}</h2><p>${esc(w.houses.map(houseName).join(' and '))}</p>${w.estimates ? `<p>${link(`/estimates/${w.estimates}`,'Senate Supplementary Budget Estimates')}</p>` : ''}</div>${statusLabelHTML(state,active ? 'active' : 'ended')}</li>`
  }).join('')
  const html = shell(header(title,description,false)+sourceLineHTML({updated:data.updated,source:'APH sitting calendar',originals:data.sources.map(s => ({href:s.url,label:s.label}))})+`<ul class="hub-weeks">${rows}</ul>`,footer)
  return {title,description,html,jsonLd:{'@graph':[itemList('/sitting',weeks.map(w => ({href:`/sitting/${w.start}`,name:range(w.start,w.end)})))]}}
}
export function renderSittingWeek(data: HubIndex, week: Week, people: SponsorCandidate[], slugs: Map<string,string>, today = sydneyDay(), footer: HubFooterConfig = {}) {
  const path = `/sitting/${week.start}`
  const title = `Sitting week: ${range(week.start,week.end)}`
  const description = 'Bills introduced and divisions held in the federal parliamentary record during this period.'
  const sources = sourceLineHTML({updated:data.updated,source:'APH sitting calendar',originals:data.sources.map(s => ({href:s.url,label:s.label}))})
  let body = header(title,description)+`<div class="hub-pills">${week.houses.map(h => tagHTML(houseName(h))).join('')}</div>`
  if (week.senate_cutoff) body += `<p class="hub-cutoff">Senate two-thirds cut-off: <strong>${date(week.senate_cutoff)}</strong>. ${link(data.sources[0].url,'APH sitting calendar')}</p>`
  body += sources
  if (week.estimates) body += `<p>${link(`/estimates/${week.estimates}`,'Senate Supplementary Budget Estimates')} takes place alongside this House sitting week.</p>`
  const rows: {href:string;name:string}[] = []
  if (!week.bills.length && !week.divisions.length) body += '<p class="hub-arrival">Bills and divisions appear here the morning after each sitting day.</p>'
  if (week.bills.length) {
    body += `<section class="hub-section"><h2>Bills introduced <span class="hub-count">${week.bills.length}</span></h2><ul class="hub-records">` + week.bills.map(b => {
      const href = `/bill/${b.key}`
      rows.push({href,name:b.title})
      const sponsor = b.sponsor ? sponsorPerson(b.sponsor,b.sponsor_person_id,people) : null
      const sponsorText = sponsor && slugs.has(sponsor.name) ? link(`/subject/person/${slugs.get(sponsor.name)}`,sponsor.name) : esc(b.sponsor?.trim() || b.portfolio?.trim() || 'Sponsor not recorded')
      const summaryDate = day(b.summary?.generated_at) || day(b.summary?.as_of)
      const summary = b.summary?.sentences?.length && summaryDate ? `<div class="hub-summary">${machineLabelHTML({pill:true})}<span class="hub-date">${day(b.summary.generated_at) ? 'Written' : 'As at'} ${date(summaryDate)}</span><p>${esc(b.summary.sentences.join(' '))}</p></div>` : ''
      return `<li><h3>${link(href,b.title)}</h3><p class="hub-meta">Introduced ${date(b.introduced)} · ${esc(houseName(b.originating_house))} · ${sponsorText}</p>${summary}${sourceLineHTML({source:'ParlInfo bill record',originals:(b.sources || []).map(s => ({href:s.url,label:s.kind === 'billhome' ? 'Original bill record' : s.kind}))})}</li>`
    }).join('')+'</ul></section>'
  }
  if (week.divisions.length) {
    body += `<section class="hub-section"><h2>Divisions held <span class="hub-count">${week.divisions.length}</span></h2><ul class="hub-records">` + week.divisions.map(d => {
      const name = divisionPlain(d.title || d.name || d.question || 'Division')
      const href = `/doc/${d.slug}`
      rows.push({href,name})
      const result = ({affirmative:'Agreed',negative:'Not agreed'} as Record<string,string>)[d.result || ''] || d.result || 'Outcome not recorded'
      return `<li><h3>${link(href,name)}</h3><p class="hub-meta">${date(d.date)} · ${esc(houseName(d.house))}</p><p>${esc(result)} · ${esc(d.ayes ?? 'Unrecorded')} ayes · ${esc(d.noes ?? 'Unrecorded')} noes</p>${sourceLineHTML({updated:d.date,dateLabel:'Division',source:'Exported division record',originals:d.source_url ? [{href:d.source_url,label:'Original division'}] : []})}</li>`
    }).join('')+'</ul></section>'
  } else if (today >= week.start) {
    const coverage = data.latestFederalDivision ? `Federal divisions in OPAX's published record currently run to ${date(data.latestFederalDivision)}; divisions held after that date will appear here once the record is updated.` : 'Federal divisions are not available in this OPAX export; they will appear here once the record is updated.'
    body += `<section class="hub-section"><h2>Divisions</h2><p>${esc(coverage)}</p>${sourceLineHTML({updated:data.snapshotDate,dateLabel:'Published snapshot',source:'Exported division records',originals:[{href:'https://theyvoteforyou.org.au/divisions',label:'They Vote For You divisions'}],notes:['Absence from this export does not establish that no divisions were held.']})}</section>`
  }
  return {title,description,html:shell(body,footer),jsonLd:{'@graph':[event(path,title,week.start,week.end,data.sources[0].url),itemList(path,rows)]}}
}
export function renderEstimates(data: Estimates, footer: HubFooterConfig = {}) {
  const title = `Senate ${data.name}: ${range(data.start,data.end)}`
  const description = 'Committee dates and portfolio agencies, with recent AusTender contracts and GrantConnect awards.'
  let body = header(title,description)+`<p class="hub-cutoff">${esc(data.published_status)}.${data.committees.some(c => !c.program) ? ' Portfolio agencies below are not confirmed hearing appearances.' : ''}</p>`+sourceLineHTML({updated:data.updated,dateLabel:'Checked',source:'APH next hearings',originals:[{href:data.source_url,label:'Dates and hearing programs'}]})
  body += `<div class="hub-coverage"><p><strong>Period covered:</strong> contracts published ${range(data.contractWindow.start,data.contractWindow.end)}; grants agreed ${range(data.grantWindow.start,data.grantWindow.end)}.</p><p>Recorded award values, not payments. Counts cover the available exports; gaps in those exports remain.</p>${sourceLineHTML({updated:data.contractUpdated,source:'AusTender',originals:[{href:'https://www.tenders.gov.au/',label:'AusTender register'}],notes:['One latest notice per contract; amendments are not added together. Dates below are publication dates. A register link is labelled when a notice URL is unavailable.']})}${sourceLineHTML({updated:data.grantUpdated,source:'GrantConnect',originals:[{href:'https://www.grants.gov.au/Ga/List',label:'GrantConnect register'}],notes:['Dates below are agreement dates. Future agreements beyond the export date are excluded. No donor records are used.']})}</div>`
  body += `<nav class="hub-pills" aria-label="Hearing groups">${data.groups.map(g => tagHTML(`Group ${g.id} · ${range(g.start,g.end)}`,`#group-${g.id}`)).join('')}</nav>`
  const list = new Map<string,{href:string;name:string}>()
  for (const group of data.groups) {
    body += `<section class="hub-section" id="group-${group.id}"><h2>Group ${group.id}</h2><p class="hub-meta">${range(group.start,group.end)}</p>`
    for (const c of data.committees.filter(c => c.group === group.id)) {
      const names = c.program?.agencies || c.portfolios.flatMap(p => p.agencies)
      const agencies = [...new Set(names)].map(n => data.agencies.find(a => a.name === n)!).sort((a,b) => a.name.localeCompare(b.name,'en'))
      body += `<details class="hub-committee"${c === data.committees[0] ? ' open' : ''}><summary><h3>${esc(c.name)}</h3><span class="hub-meta">${agencies.length} agencies</span></summary><div class="hub-committee-body"><p>${esc(c.portfolios.map(p => p.name).join(' · '))}</p><p class="hub-fallback">${c.program ? link(c.program.source_url,'Published hearing program') : 'Portfolio agencies (program not yet published)'}</p>`
      for (const a of agencies) {
        const href = `/subject/agency/${a.id}`
        list.set(a.id,{href,name:a.name})
        body += `<article class="hub-agency"><h4>${link(href,a.name)}</h4><dl class="hub-totals"><div><dt>Contracts</dt><dd>${count(a.contracts.count)} · ${money(a.contracts.total)}</dd></div><div><dt>Grants</dt><dd>${a.grants.count ? `${count(a.grants.count)} · ${money(a.grants.total)}` : 'No grants in this period'}</dd></div></dl>`
        if (a.contracts.largest.length || a.grants.largest.length) body += `<details class="hub-largest"><summary>Largest recorded awards, by value</summary>${a.contracts.largest.length ? `<h5>Contracts</h5><ul>${a.contracts.largest.map(r => `<li><p>${link(r.url,`${r.id}: ${r.title || r.id}`)}${r.link_scope === 'source_register' ? ' (AusTender register)' : ''}</p><p class="hub-meta">${esc(r.supplier)} · ${money(r.amount)} · Published ${date(r.published)}</p></li>`).join('')}</ul>` : ''}${a.grants.largest.length ? `<h5>Grants</h5><ul>${a.grants.largest.map(r => `<li><p>${link(r.url,`${r.id}: ${r.title}`)}${r.link_scope === 'source_register' ? ' (GrantConnect register)' : ''}</p><p class="hub-meta">${esc(r.recipient)} · ${money(r.value)} · Agreement ${date(r.date)}</p></li>`).join('')}</ul>` : ''}</details>`
        body += '</article>'
      }
      body += '</div></details>'
    }
    body += '</section>'
  }
  body += sourceLineHTML({updated:data.portfolio_checked,dateLabel:'Checked',source:'Australian Government Organisations Register',originals:[{href:data.portfolio_source_url,label:'Portfolio allocations'}],notes:[esc(data.portfolio_note)]})
  return {title,description,html:shell(body,footer),jsonLd:{'@graph':[event(`/estimates/${data.id}`,title,data.start,data.end,data.source_url),itemList(`/estimates/${data.id}`,[...list.values()])]}}
}
export async function hubPage(kind: 'sitting' | 'estimates', id: string | null, read: ReadAsset, people: SponsorCandidate[], slugs: Map<string,string>, today = sydneyDay(), footer: HubFooterConfig = {}) {
  const missing = {title:'Hub not found',description:'This period is not in the published calendar.',html:shell(header('Hub not found','Browse the published sitting weeks.'),footer),jsonLd:null,status:404}
  if (kind === 'estimates') {
    if (id !== '2026-10') return missing
    const data = await read<Estimates>(`/hubs/estimates-${id}.json`)
    return {...renderEstimates(data,footer),status:200}
  }
  if (id !== null && !/^\d{4}-\d{2}-\d{2}$/.test(id)) return missing
  const data = await read<HubIndex>('/hubs/index.json')
  if (id === null) return {...renderSittingIndex(data,today,footer),status:200}
  const week = data.weeks.find(w => w.start === id)
  return week ? {...renderSittingWeek(data,week,people,slugs,today,footer),status:200} : missing
}
