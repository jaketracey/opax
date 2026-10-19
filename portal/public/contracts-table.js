import { applyQuery, dataTableHTML, mountDataTable, mountTableLoaders, parseQuery, pendingPage, serializeQuery } from './datatable.js?v=2c49a89556';
/** The contracts page's note under its title (index.html carries it word for
 *  word; the Worker prints it before scripts). From suppliers.json meta: AusTender
 *  notices, one per contract at its latest amendment ("Amendments are not added
 *  together"), awards not expenditure, and a publication window that opens on
 *  8 July 2025 (older notices are only the earlier loader's sample). */
export const CONTRACTS_COVERAGE = 'Commonwealth contract notices from AusTender, each at its latest amended value. Values are commitments, not payments; most notices date from July 2025.';
// Pass 5 lane B: references read by what was bought, then by the counterpart.
const referenceTitle = value => !/\s/.test(value) && (/\d/.test(value) || value === value.toUpperCase());
export function contractTitle(contract) {
  const title = String(contract?.title || '').trim();
  const description = String(contract?.description || '').trim();
  const counterpart = contract?.supplier || contract?.agency;
  return description || (title && !referenceTitle(title) ? title : counterpart ? `Contract with ${counterpart}` : 'Untitled contract');
}
export function placeholderContract(contract) {
  const date = String(contract?.start_date || '');
  return (!/^\d{4}-\d{2}-\d{2}/.test(date) || Number(date.slice(0, 4)) <= 1900) && !(Number(contract?.amount) > 0);
}
export function ausTenderURL(row) {
  if (!/^CN[\w.-]+$/i.test(String(row.id || ''))) return null;
  if (row.link_scope !== 'source_register' && typeof row.url === 'string') {
    try {
      const url = new URL(row.url);
      if (url.protocol === 'https:' && /^(?:www\.)?tenders\.gov\.au$/.test(url.hostname)) return url.href;
    } catch {}
  }
  return `https://www.tenders.gov.au/Search/KeywordSearch?keyword=${encodeURIComponent(row.id)}`;
}
/** Procurement projection uses the source identity and readable title. */
export function contractRows(contracts) {
  return contracts.filter(contract => !placeholderContract(contract)).map(contract => {
    const row = {id: String(contract.id || ''), title: contractTitle(contract), agency: String(contract.agency || 'Not recorded'),
      amount: Number(contract.amount) || 0, start_date: Number(String(contract.start_date).slice(0, 4)) > 1900 ? String(contract.start_date).slice(0, 10) : null,
      supplier_id: contract.supplier_id || null, url: contract.url || null, link_scope: contract.link_scope || null};
    row.url = ausTenderURL(row);
    return row;
  });
}
export function contractsTableConfig({supplierId, rows, count = rows?.length || 0} = {}) {
  const client = Boolean(supplierId) && count <= 2000 && Array.isArray(rows);
  return {
    id: supplierId ? 'supplier-contracts-table' : 'contracts-table', caption: 'Contracts', pageType: supplierId ? 'supplier' : 'contracts',
    columns: [
      {key: 'title', label: 'Title', type: 'text', primary: true},
      {key: 'agency', label: 'Agency', type: 'category', facet: 'multi'},
      {key: 'amount', label: 'Value', type: 'money', bar: true, facet: 'range'},
      {key: 'start_date', label: 'Start date', type: 'date'},
      {key: 'id', label: 'CN id', type: 'text'},
    ],
    ...(client ? {rows} : {source: {endpoint: '/api/table/contracts', ...(supplierId ? {params: {supplier: supplierId}} : {})}}),
    columnsVisible: ['title', 'agency', 'amount', 'start_date'], pageSize: 50,
    defaultSort: {key: supplierId ? 'start_date' : 'amount', dir: 'desc'}, urlKey: 't',
    actions: [{icon: '↗', label: 'Open on AusTender', href: ausTenderURL}],
    export: {filename: supplierId ? 'supplier-contracts.csv' : 'contracts.csv'},
  };
}
export function publicContractQuery(params) {
  const query = parseQuery(params, 't');
  if (params.get('contract') && !query.q) query.q = params.get('contract');
  return query;
}
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
export function supplierContractsHTML(contracts, id, params) {
  const rows = contractRows(contracts.map(c => ({...c, supplier_id: id}))).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || Number(b.amount) - Number(a.amount));
  const config = contractsTableConfig({supplierId: id, rows, count: contracts.length});
  return contractsTableHTML(config, applyQuery(rows, config, publicContractQuery(params)), {supplierId: id, count: contracts.length});
}
export async function contractsHubHTML(loadPage, params) {
  const config = contractsTableConfig();
  return contractsTableHTML(config, await loadPage(publicContractQuery(params)));
}
export function contractsTableHTML(config, page, {supplierId, count} = {}) {
  const seed = {supplierId: supplierId || null, count, rows: config.rows, page};
  return `<div data-contracts-table>${dataTableHTML(config, page)}<script type="application/json" data-contracts-seed>${json(seed)}</script></div>`;
}
export async function mountContractsTable(el, {supplierId, count, seed, signal, params} = {}) {
  if (seed) {
    const node = el.ownerDocument.querySelector('#prerender [data-contracts-seed]');
    if (node && JSON.parse(node.textContent).supplierId === (supplierId || null)) node.closest('[data-contracts-table]')?.remove();
  }
  const state = new URLSearchParams(params || location.search);
  const legacy = state.get('contract');
  state.delete('contract');
  if (legacy && !state.has('t.q')) state.set('t.q', legacy);
  history.replaceState(history.state, '', location.pathname + (state.size ? '?' + state : '') + location.hash);
  if (signal?.aborted) return {destroy() {}};
  if (!seed) {
    // The table's frame and loader hold the place while the records are fetched (a supplier's run may take several pages).
    const waiting = contractsTableConfig({supplierId});
    el.innerHTML = dataTableHTML(waiting, pendingPage(waiting));
    el.querySelector('[data-datatable]')?.setAttribute('aria-busy', 'true');
    mountTableLoaders(el);
    const query = new URLSearchParams(supplierId && count <= 2000 ? '' : serializeQuery(parseQuery(state, 't')));
    if (supplierId) query.set('supplier', supplierId);
    query.set('pageSize', '200');
    const response = await fetch(`/api/table/contracts?${query}`, {signal});
    if (!response.ok) throw Error('The contract records could not be loaded.');
    const page = await response.json();
    seed = {page};
    if (supplierId && count <= 2000) {
      const rows = [...page.rows];
      for (let n = 2; rows.length < page.total; n++) {
        query.set('page', String(n));
        const response = await fetch(`/api/table/contracts?${query}`, {signal});
        if (!response.ok) throw Error('The contract records could not be loaded.');
        const next = await response.json();
        if (!next.rows.length) break;
        rows.push(...next.rows);
      }
      seed.rows = rows;
    }
  }
  if (signal?.aborted) return {destroy() {}};
  const config = contractsTableConfig({supplierId, rows: seed.rows, count});
  el.innerHTML = dataTableHTML(config, seed.page || {rows: [], total: 0, page: 1, pageSize: config.pageSize});
  return mountDataTable(el.querySelector('[data-datatable]'), config);
}
