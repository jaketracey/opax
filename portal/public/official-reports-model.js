import { shortDate } from './format.js';
// The server and browser use this same catalogue query and row renderer.
export const REPORT_COLLECTIONS = {
  royal_commission: { path: 'royal-commissions', title: 'Royal commissions', description: 'Reports, recommendations and hearing transcripts from royal commissions and other public inquiries.', source: 'Commission publishers and parliamentary report records', filters: [['jurisdiction', 'Jurisdiction'], ['status', 'Report status']] },
  integrity_report: { path: 'integrity', title: 'Integrity reports', description: 'Published reports from Australian integrity bodies, with case and operation names and hearing transcripts where held.', source: 'Integrity body publishers and parliamentary report records', filters: [['jurisdiction', 'Jurisdiction'], ['body', 'Integrity body']] },
  annual_report: { path: 'annual-reports', title: 'Annual reports', description: 'Commonwealth annual reports, arranged by body with each reporting year linked to its record.', source: 'Commonwealth Transparency Portal', filters: [['portfolio', 'Portfolio'], ['body_type', 'Body type'], ['year', 'Reporting year']] },
  agency_report: { path: 'agency-reports', title: 'Agency reports', description: 'Agency report records from Commonwealth, state and territory publishers, with reporting years and source documents.', source: 'Agency publishers and parliamentary report records', filters: [['jurisdiction', 'Jurisdiction'], ['year', 'Reporting year']] },
};
export const reportRoot = type => '/official-reports/' + REPORT_COLLECTIONS[type].path;
export const jurisdictionName = value => ({ Cth: 'Commonwealth', NSW: 'New South Wales', Vic: 'Victoria', Qld: 'Queensland', WA: 'Western Australia', SA: 'South Australia', Tas: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory' }[value] || value);
export const escapeReportHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const esc = escapeReportHTML;
const fold = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim();
const words = value => fold(value).split(/\s+/).filter(Boolean);
export const PAGE_SIZE = 24;
export function reportState(params, type) {
  return Object.fromEntries(['q', ...REPORT_COLLECTIONS[type].filters.map(([key]) => key), 'sort', 'page'].map(key => [key, (params.get(key) || '').slice(0, 240)]));
}
export function reportFilterCount(state, type) {
  return REPORT_COLLECTIONS[type].filters.filter(([key]) => state[key]).length + (state.sort && state.sort !== 'newest' ? 1 : 0);
}
export function reportFilterLabel(state, type) {
  const count = reportFilterCount(state, type);
  return `Filters and sort${count ? ` (${count})` : ''}`;
}
export function reportOptions(index, key) {
  const values = index.rows.flatMap(r => key === 'year' && index.type === 'annual_report' ? r.years.map(y => y.year) : key === 'portfolio' ? r.years.map(y => y.portfolio) : [r[key]]).filter(Boolean);
  return [...new Set(values)].sort((a, b) => key === 'year' ? b.localeCompare(a) : a.localeCompare(b));
}
const dateKey = row => row.years && Array.isArray(row.years) ? row.years.map(y => y.year + (y.date || '')).sort().at(-1) || '' : row.date || row.year || '';
export function queryReports(index, state) {
  const needles = words(state.q);
  const annual = index.type === 'annual_report';
  let rows = index.rows.flatMap(row => {
    let r = row;
    if (annual) {
      const years = row.years.filter(y => (!state.year || y.year === state.year) && (!state.portfolio || y.portfolio === state.portfolio) && needles.every(w => words([row.title, ...row.aliases, row.body_type, y.year, y.portfolio].join(' ')).some(token => token.includes(w))));
      if (!years.length || state.body_type && row.body_type !== state.body_type) return [];
      r = { ...row, years };
    } else {
      if (REPORT_COLLECTIONS[index.type].filters.some(([key]) => state[key] && row[key] !== state[key])) return [];
      const haystack = fold([row.title, row.body, ...row.aliases, row.year, row.years, row.date, jurisdictionName(row.jurisdiction), row.operation].join(' '));
      if (!needles.every(w => haystack.includes(w))) return [];
    }
    return [r];
  });
  rows.sort((a, b) => (state.sort === 'title' ? 0 : state.sort === 'oldest' ? dateKey(a).localeCompare(dateKey(b)) : dateKey(b).localeCompare(dateKey(a))) || a.title.localeCompare(b.title) || (a.slug || a.id).localeCompare(b.slug || b.id));
  const total = rows.length, reports = annual ? rows.reduce((sum, r) => sum + r.years.length, 0) : total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(state.page, 10) || 1));
  const filtered = Boolean(state.q?.trim() || REPORT_COLLECTIONS[index.type].filters.some(([key]) => state[key]));
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, reports, pages, page, filtered, available: index.rows.length, availableReports: index.count };
}
export function reportCount(result, type) {
  const n = value => value.toLocaleString('en-AU');
  const count = (value, all, singular, plural = singular + 's') => `${n(value)}${result.filtered ? ` of ${n(all)}` : ''} ${(result.filtered ? all : value) === 1 ? singular : plural}`;
  return type === 'annual_report' ? `${count(result.total, result.available, 'body', 'bodies')}, ${count(result.reports, result.availableReports, 'report')}` : count(result.total, result.available, type === 'royal_commission' ? 'inquiry' : 'report', type === 'royal_commission' ? 'inquiries' : 'reports');
}
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? shortDate(value) : value;
const metaHTML = values => values.filter(Boolean).map(esc).join(' · ');
function rowHTML(r, type) {
  if (type === 'annual_report') {
    const newest = r.years.reduce((latest, y) => y.year > latest.year ? y : latest, r.years[0]);
    return `<li class="or-row or-body"><h3>${esc(r.title)}</h3><p class="or-row-meta">${metaHTML([newest.portfolio, r.body_type])}</p><ul class="or-years" aria-label="Reporting years for ${esc(r.title)}" role="list">${r.years.map(y => `<li><a href="/report/${esc(y.slug)}"><span class="visually-hidden">${esc(r.title)} annual report </span>${esc(y.year.replace('-', '–'))}</a></li>`).join('')}</ul></li>`;
  }
  let meta;
  if (type === 'royal_commission') {
    const years = r.years.split(', ').filter(Boolean);
    const inquiry = r.inquiry_type && r.inquiry_type !== 'royal_commission' ? r.inquiry_type.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()) : '';
    meta = [jurisdictionName(r.jurisdiction), years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0], r.final_date ? `Final report ${day(r.final_date)}` : r.status, inquiry];
  } else {
    meta = [type === 'integrity_report' ? r.body : '', jurisdictionName(r.jurisdiction), r.year?.replace('-', '–'), r.date ? day(r.date) : '', r.operation ? `Case / operation: ${r.operation}` : ''];
  }
  return `<li class="or-row"><h3><a href="/report/${esc(r.slug)}">${esc(r.title)}</a></h3><p class="or-row-meta">${metaHTML(meta)}</p>${r.transcripts ? `<p class="or-transcripts">${r.transcripts.toLocaleString('en-AU')} hearing ${r.transcripts === 1 ? 'transcript' : 'transcripts'} held</p>` : ''}</li>`;
}
export function reportPageHref(type, state, page) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...state, page: String(page) })) if (value && !(key === 'page' && page === 1) && !(key === 'sort' && value === 'newest')) params.set(key, value);
  return reportRoot(type) + (params.size ? '?' + params : '');
}
export function reportResultsHTML(result, type, state) {
  if (!result.total) return `<div class="or-empty"><h3>No ${type === 'royal_commission' ? 'inquiries' : 'reports'} match ${state.q?.trim() ? `&quot;${esc(state.q.trim())}&quot;` : 'these filters'}</h3><p>Try a shorter name, another year or fewer filters.</p><a href="${reportRoot(type)}" data-or-clear>Clear search and filters</a></div>`;
  const pageLink = (label, page) => `<a href="${esc(reportPageHref(type, state, page))}" data-or-page>${label}</a>`;
  const pager = result.pages > 1 ? `<nav class="or-pagination" aria-label="Report results pages">${result.page > 1 ? pageLink('First', 1) + pageLink('Previous', result.page - 1) : ''}<span>Page ${result.page} of ${result.pages}</span>${result.page < result.pages ? pageLink('Next', result.page + 1) + pageLink('Last', result.pages) : ''}</nav>` : '';
  return `<ul class="ui-list or-results" data-density="airy" role="list">${result.rows.map(r => rowHTML(r, type)).join('')}</ul>${pager}`;
}
