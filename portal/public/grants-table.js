import {dataTableHTML, mountDataTable} from './datatable.js?v=2b14267bc6';
import {isOrganisationRecipient} from './recipient-privacy.js?v=33f5c5486d';

export const GRANTS_COVERAGE = 'Federal award values are commitments, not payments; Queensland rows record expenditure. Only organisations are named.';
export const GRANTS_SEARCH_KEYS = ['recipient', 'program', 'agency'];

/** @returns {import('./datatable.js?v=2b14267bc6').DataTableConfig} */
export function grantsTableConfig(params = new URLSearchParams()) {
  const jur = params.get('jur');
  return {
    id: 'grants', caption: 'Awards', pageType: 'grants', urlKey: 't',
    source: {endpoint: '/api/table/grants', params: ['federal', 'qld'].includes(jur) ? {'f.jurisdiction': JSON.stringify([jur])} : {}},
    privacy: 'donors', pageSize: 50, defaultSort: {key: 'amount', dir: 'desc'},
    rowPrivacyCheck: isOrganisationRecipient,
    columns: [
      {key: 'recipient', label: 'Recipient', type: 'text', primary: true},
      {key: 'program', label: 'Program', type: 'category', facet: 'multi'},
      {key: 'agency', label: 'Agency', type: 'category', facet: 'multi'},
      {key: 'amount', label: 'Value', type: 'money', bar: true, facet: 'range'},
      {key: 'start_date', label: 'Date', type: 'date'},
      {key: 'electorate', label: 'Electorate', type: 'category', facet: 'multi'},
    ],
    primaryLink: row => row.recipientAvailable === 1 && isOrganisationRecipient(row)
      && ['federal', 'qld'].includes(row.jurisdiction) && /^(?:abn|name):/.test(row.recipientId || '')
      ? `/money/grants/${row.jurisdiction}/recipient/${encodeURIComponent(row.recipientId)}` : null,
    export: {filename: 'grants.csv'},
  };
}

export function grantsTableHTML(page, params = new URLSearchParams(), privacyCheck, requestURL) {
  const config = grantsTableConfig(params);
  if (privacyCheck) config.privacyCheck = privacyCheck;
  return `<div data-grants-table>${dataTableHTML(config, page, requestURL)}</div>`;
}

export async function mountGrantsTable(el, params = new URLSearchParams(), options = {}) {
  const config = grantsTableConfig(params), win = el.ownerDocument.defaultView;
  if (!el.ownerDocument.querySelector('link[data-grants-table-style]')) {
    const style = el.ownerDocument.createElement('link');
    style.rel = 'stylesheet'; style.href = '/grants-table.css'; style.dataset.grantsTableStyle = '';
    el.ownerDocument.head.append(style);
  }
  options.signal?.throwIfAborted();
  // Preserve the original URL until core hydration has validated all raw pairs.
  // Its initial request and shared /api/table/privacy guard own rejected state.
  const seed = {rows: [], total: 0, page: 1, pageSize: 50, facets: {}};
  el.innerHTML = '<h1>Government grants</h1><p></p>' + grantsTableHTML(seed, params, undefined, new URL(win.location.href));
  el.querySelector('p').textContent = GRANTS_COVERAGE;
  const handle = mountDataTable(el.querySelector('[data-grants-table]'), config);
  const destroy = () => handle.destroy();
  options.signal?.addEventListener('abort', destroy, {once: true});
  return {destroy() {options.signal?.removeEventListener('abort', destroy); destroy();}};
}
