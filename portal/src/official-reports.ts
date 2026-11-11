import { REPORT_COLLECTIONS, reportRoot, reportOptions, reportState, queryReports, reportResultsHTML, reportCount, reportFilterCount, reportFilterLabel, jurisdictionName, escapeReportHTML as esc } from '../public/official-reports-model.js'
import { shortDate } from '../public/format.js'
import type { ReportSummary as Summary, ReportIndex as Index } from '../public/official-reports-model.js'
import type { ReportType } from './report-records'

const span = (s: Summary) => s.from ? s.from === s.to ? s.from : `${s.from}–${s.to}` : 'Dates not held'
const source = (s: Summary, text: string) => `<p class="or-source">Source: ${esc(text)}. Record snapshot: <time datetime="${esc(s.snapshot_at?.slice(0, 10))}">${esc(shortDate(s.snapshot_at))}</time>. <a href="/methods">Sources and methods</a></p>`
export async function officialReportsPage(type: ReportType | null, url: URL, assets: Fetcher) {
  const read = async <T extends { schema: number }>(name: string): Promise<T> => {
    const response = await assets.fetch(new Request(`https://opax.com.au/report-records/${name}.json`))
    if (!response.ok) throw new Error('Official report index unavailable')
    const index = await response.json<T>()
    if (index.schema !== 1) throw new Error('Invalid official report index')
    return index
  }
  const title = type ? REPORT_COLLECTIONS[type].title : 'Official reports'
  const description = type ? REPORT_COLLECTIONS[type].description : 'Explore Australian public reports, from royal commissions and integrity bodies to annual reports and agency records.'
  let html = `<section id="prerender" class="wrap or-page"><header class="ui-page-head or-head"><h1>${title}</h1><p class="or-lede">${description}</p>`
  let countLine = ''
  if (!type) {
    const summary = await read<{ schema: number; collections: Summary[] }>('index')
    const newest = [...summary.collections].sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))[0]
    html += source(newest, 'Official publishers and parliamentary report records') + '</header>'
    html += `<div class="or-collections">${summary.collections.map(s => {
      const c = REPORT_COLLECTIONS[s.type]
      return `<a class="ui-card or-collection" href="${reportRoot(s.type)}"><h2 class="ui-card-title">${c.title}</h2><p class="or-coverage">${s.count.toLocaleString('en-AU')} ${s.type === 'royal_commission' ? 'inquiries' : 'reports'}${s.type === 'annual_report' ? ` across ${s.bodies} bodies` : ''}<span>Record dates ${span(s)}</span></p><p class="ui-card-text">${c.description}</p></a>`
    }).join('')}</div><p class="or-scope">Coverage reflects the records held by OPAX. Collections have different date ranges and gaps. Each record links to its official source.</p>`
    countLine = `${summary.collections.reduce((n, s) => n + s.count, 0).toLocaleString('en-AU')} report records in four collections`
  } else {
    const index = await read<Index>('index-' + type)
    if (index.type !== type || !Array.isArray(index.rows)) throw new Error('Invalid official report index')
    html += source(index, REPORT_COLLECTIONS[type].source) + '</header>'
    const state = reportState(url.searchParams, type), result = queryReports(index, state)
    const select = (key: string, label: string) => {
      const options = reportOptions(index, key)
      if (state[key] && !options.includes(state[key])) options.push(state[key])
      const all: Record<string, string> = { body: 'bodies', body_type: 'body types', year: 'years', status: 'statuses', jurisdiction: 'jurisdictions', portfolio: 'portfolios' }
      return `<label class="ui-filter-field"><span class="ui-filter-key">${label}</span><select class="ui-input" name="${key}"><option value="">All ${all[key]}</option>${options.map(value => `<option value="${esc(value)}"${state[key] === value ? ' selected' : ''}>${esc(key === 'jurisdiction' ? jurisdictionName(value) : key === 'year' ? value.replace('-', '–') : value)}</option>`).join('')}</select></label>`
    }
    const activeFilters = Boolean(state.q?.trim() || reportFilterCount(state, type))
    html += `<nav class="or-tabs" aria-label="Official report collections"><a href="/official-reports">All official reports</a>${Object.entries(REPORT_COLLECTIONS).map(([key, c]) => `<a href="${reportRoot(key)}"${key === type ? ' aria-current="page"' : ''}>${c.title}</a>`).join('')}</nav>`
    const sort = `<label class="ui-filter-field"><span class="ui-filter-key">Sort by</span><select class="ui-input" name="sort">${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['title', 'Name A–Z']].map(([value, label]) => `<option value="${value}"${(state.sort || 'newest') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`
    html += `<div data-official-reports="${type}" data-or-index="/report-records/index-${type}.json"><form class="or-finder" method="get" action="${reportRoot(type)}" role="search" aria-label="Search ${title.toLowerCase()}" data-ui-size="large"><label class="ui-filter-field or-search"><span class="ui-filter-key">Search ${title.toLowerCase()}</span><input class="ui-input" type="search" name="q" value="${esc(state.q)}" placeholder="${type === 'annual_report' ? 'Body, acronym or reporting year' : 'Report title, body, acronym or year'}" autocomplete="off"></label><button class="ui-button" data-variant="primary" type="submit">Search reports</button><details class="or-more" open><summary>${reportFilterLabel(state, type)}</summary><div class="or-filters">${REPORT_COLLECTIONS[type].filters.map(([key, label]) => select(key, label)).join('')}${sort}</div></details></form><div class="or-results-head"><h2 id="or-results-title">${type === 'annual_report' ? 'Bodies and reporting years' : 'Report records'}</h2><p data-or-count role="status" aria-live="polite" aria-atomic="true">${reportCount(result, type)}</p><a href="${reportRoot(type)}" data-or-clear${activeFilters ? '' : ' hidden'}>Clear filters</a></div><section data-or-results aria-labelledby="or-results-title">${reportResultsHTML(result, type, state)}</section></div>`
    html += `<p class="or-scope">${type === 'annual_report' ? 'Select a year to open that body’s annual report record. Portfolio filters use the portfolio recorded for each reporting year. Only body-years with an official source link are listed. ' : type === 'integrity_report' || type === 'royal_commission' ? 'Hearing transcripts record evidence, not findings. ' : ''}Coverage reflects the records held by OPAX, with gaps. Dates are shown where held in the source record.</p>`
    countLine = `${index.count.toLocaleString('en-AU')} ${type === 'royal_commission' ? 'inquiry' : 'report'} records, ${span(index)}`
  }
  html += '</section>'
  return { title: title + ' · OPAX', description, prerender: html, noindex: Boolean(url.search), status: 200,
    trail: type ? [{ label: 'Official reports', href: '/official-reports' }, { label: title }] : [{ label: title }],
    card: { kicker: 'Official reports', title, lines: [countLine, description] } }
}
