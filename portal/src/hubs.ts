import { sourceLineHTML, machineLabelHTML, statusLabelHTML } from '../public/labels.js'
import { shortDate, shortMoney } from '../public/format.js'
import { houseName, orderedWeeks, day, sydneyDay } from '../public/hubs-data.js'
import { sponsorPerson, type SponsorCandidate } from '../public/sponsor-person.js'
import { divisionPlain } from '../public/division-markdown.js'
import { escapeHtml as esc, safeHref, crumbsHTML, type Crumb, type ReadAsset } from './seo-content'

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
const WEEKS: Crumb = {label:'Sitting weeks',href:'/sitting'}
/** The page's one title and the one line under it: a lead sentence on the
 *  index, a meta line (chambers, programme status) on a week or estimates. */
const header = (title: string, line: string, kind: 'lead' | 'meta' = 'lead') => `<h1>${esc(title)}</h1><p class="hub-${kind}">${esc(line)}</p>`

export function renderSittingIndex(data: HubIndex, today: string, footer: HubFooterConfig = {}) {
  const weeks = orderedWeeks(data.weeks,today)
  const title = 'Federal sitting weeks'
  const description = 'Bills introduced and divisions held during each sitting week, from the published parliamentary record.'
  const rows = weeks.map(w => {
    const active = today >= w.start && today <= w.end
    const state = active ? 'Current' : today < w.start ? 'Upcoming' : 'Past'
    return `<li><div><h2>${link(`/sitting/${w.start}`,range(w.start,w.end))}</h2><p>${esc(w.houses.map(houseName).join(' and '))}</p>${w.estimates ? `<p>${link(`/estimates/${w.estimates}`,'Senate Supplementary Budget Estimates')}</p>` : ''}</div>${statusLabelHTML(state,active ? 'active' : 'ended')}</li>`
  }).join('')
  const html = shell(header(title,description)+sourceLineHTML({updated:data.updated,source:'APH sitting calendar',originals:data.sources.map(s => ({href:s.url,label:s.label}))})+`<ul class="hub-weeks">${rows}</ul>`,footer,[{label:'Sitting weeks'}])
  return {title,description,html,jsonLd:{'@graph':[itemList('/sitting',weeks.map(w => ({href:`/sitting/${w.start}`,name:range(w.start,w.end)})))]}}
}
export function renderSittingWeek(data: HubIndex, week: Week, people: SponsorCandidate[], slugs: Map<string,string>, today = sydneyDay(), footer: HubFooterConfig = {}) {
  const path = `/sitting/${week.start}`
  const title = `Sitting week: ${range(week.start,week.end)}`
  const description = 'Bills introduced and divisions held in the federal parliamentary record during this period.'
  const sources = sourceLineHTML({updated:data.updated,source:'APH sitting calendar',originals:data.sources.map(s => ({href:s.url,label:s.label}))})
  // Chambers are the week's meta line, not tags; the cut-off is one plain sentence.
  let body = header(title,week.houses.map(houseName).join(' and '),'meta')
  if (week.senate_cutoff) body += `<p>Senate two-thirds cut-off: ${date(week.senate_cutoff)}.</p>`
  body += sources
  if (week.estimates) body += `<p>${link(`/estimates/${week.estimates}`,'Senate Supplementary Budget Estimates')} takes place alongside this House sitting week.</p>`
  const rows: {href:string;name:string}[] = []
  if (!week.bills.length && !week.divisions.length) body += '<p>Bills and divisions appear here the morning after each sitting day.</p>'
  if (week.bills.length) {
    body += `<section class="hub-section"><h2>Bills introduced <span class="hub-count">${week.bills.length}</span></h2><ul class="hub-records">` + week.bills.map(b => {
      const href = `/bill/${b.key}`
      rows.push({href,name:b.title})
      const sponsor = b.sponsor ? sponsorPerson(b.sponsor,b.sponsor_person_id,people) : null
      const sponsorText = sponsor && slugs.has(sponsor.name) ? link(`/subject/person/${slugs.get(sponsor.name)}`,sponsor.name) : esc(b.sponsor?.trim() || b.portfolio?.trim() || 'Sponsor not recorded')
      const summaryDate = day(b.summary?.generated_at) || day(b.summary?.as_of)
      const summary = b.summary?.sentences?.length && summaryDate ? `<div class="hub-summary">${machineLabelHTML({pill:true})}<span class="hub-date">${day(b.summary.generated_at) ? 'Written' : 'As at'} ${date(summaryDate)}</span><p>${esc(b.summary.sentences.join(' '))}</p></div>` : ''
      return `<li><h3>${link(href,b.title)}</h3><p class="hub-meta">Introduced ${date(b.introduced)} · ${esc(houseName(b.originating_house))} · ${sponsorText}</p>${summary}</li>`
    }).join('')+'</ul>'
    // One dated source line closes the block; each bill's ParlInfo record is in its sheet.
    const originals = week.bills.flatMap(b => (b.sources || []).filter(s => s.kind === 'billhome').slice(0,1).map(s => ({href:s.url,label:b.title})))
    body += sourceLineHTML({updated:data.snapshotDate,source:'ParlInfo bill records',originals})+'</section>'
  }
  if (week.divisions.length) {
    body += `<section class="hub-section"><h2>Divisions held <span class="hub-count">${week.divisions.length}</span></h2><ul class="hub-records">` + week.divisions.map(d => {
      const name = divisionPlain(d.title || d.name || d.question || 'Division')
      const href = `/doc/${d.slug}`
      rows.push({href,name})
      const result = ({affirmative:'Agreed',negative:'Not agreed'} as Record<string,string>)[d.result || ''] || d.result || 'Outcome not recorded'
      return `<li><h3>${link(href,name)}</h3><p class="hub-meta">${date(d.date)} · ${esc(houseName(d.house))}</p><p>${esc(result)} · ${esc(d.ayes ?? 'Unrecorded')} ayes · ${esc(d.noes ?? 'Unrecorded')} noes</p></li>`
    }).join('')+'</ul>'
    const originals = week.divisions.filter(d => d.source_url).map(d => ({href:d.source_url!,label:`${divisionPlain(d.title || d.name || d.question || 'Division')}, ${date(d.date)}`}))
    body += sourceLineHTML({updated:data.snapshotDate,dateLabel:'Published snapshot',source:'Exported division records',originals})+'</section>'
  } else if (today >= week.start) {
    const coverage = data.latestFederalDivision ? `Federal divisions in OPAX's published record currently run to ${date(data.latestFederalDivision)}; divisions held after that date will appear here once the record is updated.` : 'Federal divisions are not available in this OPAX export; they will appear here once the record is updated.'
    body += `<section class="hub-section"><h2>Divisions</h2><p>${esc(coverage)}</p>${sourceLineHTML({updated:data.snapshotDate,dateLabel:'Published snapshot',source:'Exported division records',originals:[{href:'https://theyvoteforyou.org.au/divisions',label:'They Vote For You divisions'}],notes:['Absence from this export does not establish that no divisions were held.']})}</section>`
  }
  return {title,description,html:shell(body,footer,[WEEKS,{label:range(week.start,week.end)}]),jsonLd:{'@graph':[event(path,title,week.start,week.end,data.sources[0].url),itemList(path,rows)]}}
}
export function renderEstimates(data: Estimates, footer: HubFooterConfig = {}) {
  const title = `Senate ${data.name}: ${range(data.start,data.end)}`
  const description = 'Committee dates and portfolio agencies, with recent AusTender contracts and GrantConnect awards.'
  const unconfirmed = data.committees.some(c => !c.program)
  // The hearing dates' source line; which agencies a committee lists, and why, sit in its sheet.
  let body = header(title,data.published_status,'meta')+sourceLineHTML({updated:data.updated,dateLabel:'Checked',source:'APH next hearings',
    originals:[{href:data.source_url,label:'Dates and hearing programs'},{href:data.portfolio_source_url,label:'Portfolio allocations'}],
    notes:[...(unconfirmed ? ['Portfolio agencies are listed until a committee publishes its hearing program; they are not confirmed hearing appearances.'] : []),
      `Portfolio allocations checked ${esc(date(data.portfolio_checked))} on the Australian Government Organisations Register.`,esc(data.portfolio_note)]})
  body += `<nav class="hub-toc" aria-labelledby="hub-toc-head"><p class="hub-toc-head" id="hub-toc-head">On this page</p><ul role="list">${data.groups.map(g => `<li><a href="#group-${esc(g.id)}"><span>Group ${esc(g.id)}</span><span class="hub-meta">${esc(range(g.start,g.end))}</span></a></li>`).join('')}</ul></nav>`
  // The money block: its one inline caveat, then one source line for both registers.
  const moneyUpdated = [data.contractUpdated,data.grantUpdated].filter(Boolean).sort()[0] || ''
  body += `<div class="hub-coverage"><p>Contract and grant figures are recorded award values, not payments.</p>${sourceLineHTML({updated:moneyUpdated,source:'AusTender and GrantConnect',
    originals:[{href:'https://www.tenders.gov.au/',label:'AusTender register'},{href:'https://www.grants.gov.au/Ga/List',label:'GrantConnect register'}],
    notes:[`Period covered: contracts published ${esc(range(data.contractWindow.start,data.contractWindow.end))}; grants agreed ${esc(range(data.grantWindow.start,data.grantWindow.end))}. Counts cover the available exports; gaps in those exports remain.`,
      `AusTender, updated ${esc(date(data.contractUpdated))}: one latest notice per contract; amendments are not added together. Dates are publication dates. A register link is labelled when a notice URL is unavailable.`,
      `GrantConnect, updated ${esc(date(data.grantUpdated))}: dates are agreement dates. Future agreements beyond the export date are excluded. No donor records are used.`]})}</div>`
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
        // Award rows are titled by what was bought or funded; the notice id is meta.
        if (a.contracts.largest.length || a.grants.largest.length) body += `<details class="hub-largest"><summary>Largest recorded awards, by value</summary>${a.contracts.largest.length ? `<h5>Contracts</h5><ul>${a.contracts.largest.map(r => `<li><p>${link(r.url,r.title || r.id)}${r.link_scope === 'source_register' ? ' (AusTender register)' : ''}</p><p class="hub-meta">${esc(r.supplier)} · ${money(r.amount)} · Published ${date(r.published)} · ${esc(r.id)}</p></li>`).join('')}</ul>` : ''}${a.grants.largest.length ? `<h5>Grants</h5><ul>${a.grants.largest.map(r => `<li><p>${link(r.url,r.title || r.id)}${r.link_scope === 'source_register' ? ' (GrantConnect register)' : ''}</p><p class="hub-meta">${esc(r.recipient)} · ${money(r.value)} · Agreement ${date(r.date)} · ${esc(r.id)}</p></li>`).join('')}</ul>` : ''}</details>`
        body += '</article>'
      }
      body += '</div></details>'
    }
    body += '</section>'
  }
  return {title,description,html:shell(body,footer,[WEEKS,{label:data.name}]),jsonLd:{'@graph':[event(`/estimates/${data.id}`,title,data.start,data.end,data.source_url),itemList(`/estimates/${data.id}`,[...list.values()])]}}
}
export async function hubPage(kind: 'sitting' | 'estimates', id: string | null, read: ReadAsset, people: SponsorCandidate[], slugs: Map<string,string>, today = sydneyDay(), footer: HubFooterConfig = {}) {
  const missing = {title:'Hub not found',description:'This period is not in the published calendar.',html:shell(header('Hub not found','Browse the published sitting weeks.'),footer,[WEEKS,{label:'Not found'}]),jsonLd:null,status:404}
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
