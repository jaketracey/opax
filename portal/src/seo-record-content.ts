import {escapeHtml as esc, safeHref} from './seo-content.ts'
import {isOrganisationRecipient} from '../public/recipient-privacy.js'

export interface GrantRecord {
  id: string; n?: string; v?: number; desc?: string; s?: string; fy?: string; ag?: string; pr?: string
  guid?: string; rid?: string; rn?: string; k?: string
}
export interface GrantDetail {
  id: string; n: string; t: number; c: number; r?: number; ag?: string; y0?: string; y1?: string
  grants?: GrantRecord[]; more?: number; grants_total?: number
}
export interface AgencyDetail {
  id: string; name: string; total: number; count: number; supplier_count?: number
  suppliers: {id: string; name: string; total: number; count: number}[]
  contracts: {id: string; title?: string; supplier?: string; supplier_id?: string; amount?: number; start_date?: string; url?: string}[]
}
export interface TopicCounts {count: number; labelled: number; parties?: [string, number][]}
export interface TopicSpeech {slug: string; title?: string; speaker?: string; date?: string; url?: string; source_url?: string}

const number = (n: number) => n.toLocaleString('en-AU')
const amount = new Intl.NumberFormat('en-AU', {style:'currency',currency:'AUD',maximumFractionDigits:2})
const dollars = (n?: number) => typeof n === 'number' && Number.isFinite(n)
  ? amount.format(n) : 'Value not recorded'
const link = (href: string, label: string) => safeHref(href) ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)
const localPath = (canonical: string) => {const url = new URL(canonical, 'https://opax.com.au'); return url.pathname + url.search}
const table = (caption: string, headings: string[], rows: string[][]) => `<div class="record-core-scroll"><table><caption>${esc(caption)}</caption><thead><tr>${headings.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const figures = (rows: [string, string][]) => `<dl class="record-core-figures">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`
export const grantSource = (jur: string, grant?: GrantRecord) => jur === 'qld'
  ? 'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964'
  : grant?.guid ? `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(grant.guid)}`
    : grant ? `https://www.grants.gov.au/Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId=${encodeURIComponent(grant.id)}` : 'https://www.grants.gov.au/'

/** First twenty exported records, in the same order as the interactive page. */
export function grantCoreBody(detail: GrantDetail, jur: string, canonical: string, program = false, dataPath?: string): string {
  const rows = (detail.grants || []).slice(0,20)
  const countLabel = jur === 'qld' ? 'Expenditure rows' : 'Award records'
  let body = figures([[jur === 'qld' ? 'Recorded expenditure' : 'Published award value', dollars(detail.t)], [countLabel, number(detail.c)],
    ...(detail.r != null ? [['Recipients', number(detail.r)] as [string,string]] : [])])
  if(detail.ag) body += `<p>Agency: ${esc(detail.ag)}</p>`
  body += table(jur === 'qld' ? 'Recorded expenditure' : 'Grant awards', ['Record', program ? 'Recipient' : 'Program', 'Value', 'Date / financial year', 'Agency', 'Source'], rows.map(g=>[
    esc(g.id), program
      ? g.rid && isOrganisationRecipient(g as unknown as Record<string,unknown>) ? link(`/money/grants/${jur}/recipient/${encodeURIComponent(g.rid)}`, g.rn || g.rid) : 'Recipient not publicly named'
      : esc(g.pr || g.n || ''),
    esc(dollars(g.v)), esc([g.s, g.fy].filter(Boolean).join(' · ')), esc(g.ag || detail.ag || ''), link(grantSource(jur,g), jur === 'qld' ? 'Source dataset' : 'Original award'),
  ]))
  const listed = detail.grants?.length || 0
  body += `<p>${number(rows.length)} of ${number(listed)} listed records shown; ${number(detail.c)} ${countLabel.toLowerCase()} in the total. ${link(localPath(canonical) + '#'+(program ? 'program-records' : 'recipient-records'), 'Explore the full list')}.</p>`
  if(dataPath) body += `<p>${link(dataPath, 'Read the full exported list (JSON)')}</p>`
  body += `<p class="source-line">Source: ${link(grantSource(jur), jur === 'qld' ? 'Queensland Government Investment Portal' : 'GrantConnect, Department of Finance')}. ${jur === 'qld' ? 'A multi-year funding agreement can appear in several financial years; rows are not distinct grants.' : 'Published award values do not establish payments received.'}</p>`
  return body
}

const supplierNames = new Intl.Collator('en-AU', {sensitivity:'base',numeric:true})
/** The agency client's default value order, including its name and ID tie breaks. */
export function firstAgencySuppliers(suppliers: AgencyDetail['suppliers']): AgencyDetail['suppliers'] {
  return [...suppliers].sort((a,b)=>b.total-a.total || supplierNames.compare(a.name,b.name) || a.id.localeCompare(b.id)).slice(0,20)
}

export function agencyCoreBody(profile: AgencyDetail, canonical: string, meta?: {source?: string; source_url?: string}): string {
  const suppliers = firstAgencySuppliers(profile.suppliers)
  const contracts = profile.contracts.filter(c=> !((!c.start_date || !/^\d{4}-\d{2}-\d{2}/.test(c.start_date) || Number(c.start_date.slice(0,4))<=1900) && !(Number(c.amount)>0))).slice(0,20)
  return figures([['Recorded contract value', dollars(profile.total)], ['Contracts', number(profile.count)], ['Suppliers', number(profile.supplier_count ?? profile.suppliers.length)]])
    + table('Who receives the contracts', ['Supplier','Recorded value','Contracts'], suppliers.map(s=>[link(`/subject/supplier/${encodeURIComponent(s.id)}`,s.name),esc(dollars(s.total)),esc(number(s.count))]))
    + table('The contract record', ['Contract','Supplier','Value','Start date','Source'], contracts.map(c=>[esc(c.title || c.id),c.supplier_id ? link(`/subject/supplier/${encodeURIComponent(c.supplier_id)}`,c.supplier || c.supplier_id) : esc(c.supplier || ''),esc(dollars(c.amount)),esc(c.start_date || ''),link(c.url || '',c.id)]))
    + `<p>${link(`/agencies/${profile.id}.json`,'Read the full exported lists (JSON)')}</p>`
    + `<p>${link(localPath(canonical)+'#agency-suppliers','Explore all suppliers')} · ${link(localPath(canonical)+'#agency-contracts','Explore the full contract list')}</p><p class="source-line">Source: ${link(meta?.source_url || 'https://www.tenders.gov.au/',meta?.source || 'AusTender, Department of Finance')}. Award values are not expenditure. Agency names remain separate as recorded.</p>`
}

export function topicSummary(name: string, counts: TopicCounts): string {
  return `${name}: ${number(counts.count)} speeches carry this label so far, of ${number(counts.labelled)} speeches labelled to date. Not every speech has a topic label yet, so this count is a floor.`
}
export function topicCoreBody(slug: string, counts: TopicCounts, speeches: TopicSpeech[], dataPath?: string): string {
  const phrase = dataPath ? new URL(dataPath,'https://opax.com.au').searchParams.get('q') || slug : slug
  const search = '/ask?'+new URLSearchParams({view:'search',q:phrase,kind:'speech',topic:slug,sort:'newest'})
  return figures([['Speeches labelled with this topic',number(counts.count)],['Speeches labelled to date',number(counts.labelled)]])
    + table('Newest retrieved speeches', ['Speech','Speaker','Date','Source'], speeches.filter(s=>s.slug).slice(0,20).map(s=>[
      link('/doc/'+encodeURIComponent(s.slug),s.title || s.slug),esc(s.speaker || ''),esc(s.date?.slice(0,10) || ''),safeHref(s.source_url || s.url || '') ? link(s.source_url || s.url || '', 'Official record') : 'Source link not recorded',
    ]))
    + `<p>${link(search,'Explore the full speech list')}${dataPath ? ' · '+link(dataPath,'Read retrieved speeches (JSON)') : ''}</p><p class="source-line">Source: the parliamentary records linked above. Topic labels are machine applied. This list is the newest part of the retrieved search window.</p>`
}
