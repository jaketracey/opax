import {dataTableHTML, mountDataTable, parseQuery, serializeQuery} from './datatable.js';
import {isOrganisationDonor} from './donor-entity.js?v=2b8d45a50d';
import {isOrganisationRecipient} from './recipient-privacy.js?v=ac68efe771';

export const GRANTS_COVERAGE = 'Preview: selected published awards from GrantConnect. Values are commitments, not payments. Only organisations are named.';
export const GRANTS_SEARCH_KEYS = ['recipient', 'program', 'agency'];

/** @returns {import('./datatable.js').DataTableConfig} */
export function grantsTableConfig(params = new URLSearchParams()) {
  const jur = params.get('jur');
  return {
    id: 'grants', caption: 'Awards', pageType: 'grants', urlKey: 't',
    source: {endpoint: '/api/table/grants', params: jur === 'federal' || jur === 'qld' ? {jur} : {}},
    privacy: 'donors', pageSize: 50, defaultSort: {key: 'value', dir: 'desc'},
    rowPrivacyCheck: isOrganisationRecipient,
    privacyCheck: async text => {
      try {
        const response = await fetch('/api/table/grants/privacy', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({text})});
        return response.ok && (await response.json()).safe === true;
      } catch {return false;}
    },
    columns: [
      {key: 'recipient', label: 'Recipient', type: 'text', primary: true},
      {key: 'program', label: 'Program', type: 'category', facet: 'multi'},
      {key: 'agency', label: 'Agency', type: 'category', facet: 'multi'},
      {key: 'value', label: 'Value', type: 'money', bar: true, facet: 'range'},
      {key: 'date', label: 'Date', type: 'date'},
      {key: 'electorate', label: 'Electorate', type: 'category', facet: 'multi'},
    ],
    primaryLink: row => row.recipientAvailable === true && isOrganisationRecipient(row)
      && ['federal', 'qld'].includes(row.jurisdiction) && /^(?:abn|name):/.test(row.recipientId || '')
      ? `/money/grants/${row.jurisdiction}/recipient/${encodeURIComponent(row.recipientId)}` : null,
    export: {filename: 'grants.csv'},
  };
}

// Only the public endpoint's names may substantiate a shareable search. No
// private recipient set is delivered to the browser, even for URL cleaning.
export function sanitizeGrantsState(query, page) {
  const clean = {...query};
  const names = GRANTS_SEARCH_KEYS.flatMap(key => [
    ...page.rows.map(row => String(row[key] || '')),
    ...(Array.isArray(page.facets?.[key]) ? page.facets[key].map(f => f.value) : []),
  ]);
  if (clean.q && !names.some(name => name.toLowerCase().includes(clean.q.toLowerCase()))) delete clean.q;
  const filters = {};
  for (const [key, filter] of Object.entries(clean.filters || {})) {
    if (key === 'value' && filter && !Array.isArray(filter)) {
      const range = Object.fromEntries(['min', 'max'].filter(k => Number.isFinite(filter[k])).map(k => [k, filter[k]]));
      if (Object.keys(range).length) filters[key] = range;
    } else if (['recipient', 'program', 'agency', 'electorate'].includes(key) && Array.isArray(filter)) {
      const allowed = new Set([...page.rows.map(row => row[key]), ...(Array.isArray(page.facets?.[key]) ? page.facets[key].map(f => f.value) : [])]);
      const values = filter.filter(value => allowed.has(value) && (key !== 'recipient' || isOrganisationDonor({label: value})));
      if (values.length) filters[key] = values;
    }
  }
  if (Object.keys(filters).length) clean.filters = filters; else delete clean.filters;
  if (clean.sort && !['recipient', 'value', 'date'].includes(clean.sort.key)) delete clean.sort;
  return clean;
}

export function grantsTableHTML(page, params = new URLSearchParams()) {
  return `<div data-grants-table>${dataTableHTML(grantsTableConfig(params), page)}</div>`;
}

export async function mountGrantsTable(el, params = new URLSearchParams(), options = {}) {
  const config = grantsTableConfig(params), win = el.ownerDocument.defaultView;
  if (!el.ownerDocument.querySelector('link[data-grants-table-style]')) {
    const style = el.ownerDocument.createElement('link');
    style.rel = 'stylesheet'; style.href = '/grants-table.css'; style.dataset.grantsTableStyle = '';
    el.ownerDocument.head.append(style);
  }
  const controller = new win.AbortController();
  const endpoint = new URL(config.source.endpoint, win.location.href);
  for (const [key, value] of Object.entries(config.source.params)) endpoint.searchParams.set(key, value);
  const query = parseQuery(params, config.urlKey);
  for (const [key, value] of new URLSearchParams(serializeQuery(query))) endpoint.searchParams.set(key, value);
  const signal = options.signal || controller.signal;
  const response = await win.fetch(endpoint, {signal});
  if (!response.ok) throw new Error('Grant table unavailable');
  const page = await response.json();
  signal.throwIfAborted();
  // Core privacy validation owns the original query and its safe URL/echo.
  el.innerHTML = '<h1>Government grants</h1><p></p>' + grantsTableHTML(page, params);
  el.querySelector('p').textContent = GRANTS_COVERAGE;
  const root = el.querySelector('[data-grants-table]');
  const handle = mountDataTable(root, config);
  return {destroy() {controller.abort(); handle.destroy();}};
}
