import { applyQuery, dataTableHTML, mountDataTable, parseQuery, serializeQuery } from './datatable.js';
import {namesWithheldPhrase} from './donor-entity.js?v=2b8d45a50d';

/** Index candidates, then use the existing fail-closed donor matcher unchanged.
 * Server/build only: neither this index nor its names enter table payloads. */
export function compileContractGuard(phrases) {
  const byFirst = new Map();
  for (const entry of phrases.withheld) {
    const first = entry[0].split(' ')[0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(entry);
  }
  return (...texts) => texts.some(value => {
    const words = String(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
    const candidates = [...new Set(words)].flatMap(word => byFirst.get(word) || []);
    return candidates.length > 0 && namesWithheldPhrase({withheld: candidates}, value);
  });
}

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
/** Project only public procurement fields. The caller supplies the shared donor guard. */
export function contractRows(contracts, withheld = () => true) {
  return contracts.flatMap(contract => {
    const texts = Object.values(contract).filter(v => typeof v === 'string' && !/^(?:\d+|CN[\d.-]+|\d{4}-\d{2}-\d{2})$/.test(v));
    const decoded = texts.map(value => {try {return decodeURIComponent(value);} catch {return value;}});
    if (placeholderContract(contract) || withheld(...decoded)) return [];
    const row = {id: String(contract.id || ''), title: contractTitle(contract), agency: String(contract.agency || 'Not recorded'),
      amount: Number(contract.amount) || 0, start_date: Number(String(contract.start_date).slice(0, 4)) > 1900 ? String(contract.start_date).slice(0, 10) : null,
      supplier_id: contract.supplier_id || null, url: contract.url || null, link_scope: contract.link_scope || null};
    row.url = ausTenderURL(row);
    return [row];
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
/** Never return or serialise a query naming a withheld donor, including hidden fields. */
export function publicContractQuery(params, withheld) {
  const query = parseQuery(params, 't');
  if (rejectedState(params, withheld)) return {};
  if (params.get('contract') && !query.q) query.q = params.get('contract');
  return query;
}
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
let hubRows;
/** Snapshot-backed SSR until DT-api merges; all reads use the asset binding. */
export async function contractsHubRows(read, withheld) {
  hubRows ??= (async () => {
    const index = await read('/suppliers.json');
    const rows = [];
    for (const path of new Set(index.suppliers.map(s => s.profile_path))) {
      const shard = await read(path);
      for (const profile of Object.values(shard.profiles)) rows.push(...contractRows(profile.contracts.map(c => ({...c, supplier_id: profile.id})), withheld));
    }
    return rows.sort((a, b) => Number(b.amount) - Number(a.amount) || String(a.id).localeCompare(String(b.id)));
  })().catch(error => {hubRows = null; throw error;});
  return hubRows;
}
function rejectedState(params, withheld) {
  const texts = [];
  const collect = value => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => {texts.push(key); collect(item);});
  };
  for (const [key, value] of params) if (key.startsWith('t.') || key === 'contract') {
    texts.push(key, value);
    // Facets are JSON in the frozen query contract. Inspect decoded strings,
    // including Unicode escapes, as well as the raw URL values.
    try {collect(JSON.parse(value));} catch {}
  }
  return withheld(...texts);
}
export function supplierContractsHTML(contracts, id, params, withheld) {
  const rows = contractRows(contracts, withheld).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || Number(b.amount) - Number(a.amount));
  const config = contractsTableConfig({supplierId: id, rows, count: contracts.length});
  const rejected = rejectedState(params, withheld);
  return contractsTableHTML(config, applyQuery(rejected ? [] : rows, config, publicContractQuery(params, withheld)), {supplierId: id, count: contracts.length, stateRejected: rejected});
}
export async function contractsHubHTML(read, params, withheld) {
  const config = contractsTableConfig();
  const rows = await contractsHubRows(read, withheld);
  const rejected = rejectedState(params, withheld);
  return contractsTableHTML(config, applyQuery(rejected ? [] : rows, config, publicContractQuery(params, withheld)), {stateRejected: rejected});
}
export function contractsTableHTML(config, page, {supplierId, count, stateRejected = false} = {}) {
  // The payload contains only guarded rows and query-free configuration identity.
  const seed = {supplierId: supplierId || null, count, rows: config.rows, page, stateRejected};
  return `<div data-contracts-table>${dataTableHTML(config, page)}<script type="application/json" data-contracts-seed>${json(seed)}</script></div>`;
}
/** Mount through the frozen core; the route lifecycle owns and destroys the handle. */
export async function mountContractsTable(el, {supplierId, count, seed, signal, params} = {}) {
  // The SPA keeps the crawl answer hidden. Consume its table once so the
  // hydrated controls have unique ids and accessible label associations.
  if (seed) {
    const node = el.ownerDocument.querySelector('#prerender [data-contracts-seed]');
    if (node && JSON.parse(node.textContent).supplierId === (supplierId || null)) node.closest('[data-contracts-table]')?.remove();
  }
  if (seed?.stateRejected) {
    const url = new URL(location.href);
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('t.') || key === 'contract') url.searchParams.delete(key);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  const state = new URLSearchParams(params || location.search);
  if (seed?.stateRejected) for (const key of [...state.keys()]) if (key.startsWith('t.') || key === 'contract') state.delete(key);
  if (state.has('contract') && !seed?.stateRejected) {
    state.set('t.q', state.get('contract'));
    state.delete('contract');
    history.replaceState(history.state, '', location.pathname + `?${state}` + location.hash);
  }
  if (!seed) {
    // Client mode needs its entire guarded dataset so clearing a filter restores
    // every row, even when the arrival URL requests a later page or a search.
    const params = new URLSearchParams(supplierId && count <= 2000 ? '' : serializeQuery(parseQuery(state, 't')));
    if (supplierId) { params.set('supplier', supplierId); if (count <= 2000) params.set('pageSize', '2000'); }
    const response = await fetch(`/api/table/contracts?${params}`, {signal});
    if (!response.ok) throw Error('The contract records could not be loaded.');
    const page = await response.json();
    if (!page.total) {
      const url = new URL(location.href);
      for (const key of [...url.searchParams.keys()]) if (key.startsWith('t.')) url.searchParams.delete(key);
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    seed = {page, ...(supplierId && count <= 2000 ? {rows: page.rows} : {})};
  }
  if (signal?.aborted) return {destroy() {}};
  const config = contractsTableConfig({supplierId, rows: seed.rows, count});
  const arrival = parseQuery(state, 't');
  let initialEmpty = Boolean(seed.stateRejected);
  if (arrival.q || arrival.filters) {
    const query = new URLSearchParams(serializeQuery({...arrival, page: 1, pageSize: 1}));
    if (supplierId) query.set('supplier', supplierId);
    const response = await fetch(`/api/table/contracts?${query}`, {signal});
    initialEmpty = !response.ok || !(await response.json()).total;
  }
  if (signal?.aborted) return {destroy() {}};
  if (initialEmpty) {
    const url = new URL(location.href);
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('t.') || key === 'contract') url.searchParams.delete(key);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  const initialConfig = initialEmpty ? {...config, rows: [], source: undefined} : config;
  el.innerHTML = dataTableHTML(initialConfig, initialEmpty ? {rows: [], total: 0, page: 1, pageSize: config.pageSize} : seed.page || applyQuery(config.rows || [], config, {}));
  let handle = mountDataTable(el, initialConfig), controller, timer, revision = 0, active = true, replay = false, empty = initialEmpty;
  const win = el.ownerDocument.defaultView;
  // Procurement rows are already guarded. The core's donors-only mode expects
  // donor identities, so procurement search is verified by the money endpoint
  // before the core can put it into shareable state. Zero-result text is never
  // echoed; its empty view still exports an empty CSV. No donor index is shipped.
  function forward(value) {
    const field = el.querySelector('[data-search]');
    if (!field) return;
    field.value = value; replay = true;
    field.dispatchEvent(new win.Event('input', {bubbles: true}));
    replay = false;
  }
  function input(event) {
    if (replay || !event.target.matches('[data-search]')) return;
    event.stopImmediatePropagation();
    clearTimeout(timer); controller?.abort();
    const value = event.target.value.trim(), version = ++revision;
    timer = win.setTimeout(async () => {
      let approved = !value;
      if (value) {
        controller = new win.AbortController();
        const query = new URLSearchParams(serializeQuery({q: value, pageSize: 1}));
        if (supplierId) query.set('supplier', supplierId);
        try {
          const response = await fetch(`/api/table/contracts?${query}`, {signal: controller.signal});
          if (!response.ok) throw Error('Contract search unavailable');
          approved = (await response.json()).total > 0;
        } catch (error) {
          if (error.name === 'AbortError') return;
          // Fail closed while leaving a useful, guarded empty view.
        }
      }
      if (!active || version !== revision) return;
      if (!approved || empty) {
        handle.destroy();
        const url = new URL(location.href); url.searchParams.delete('t.q'); url.searchParams.delete('t.page');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        const view = approved ? config : {...config, rows: [], source: undefined};
        el.innerHTML = dataTableHTML(view, approved ? seed.page : {rows: [], total: 0, page: 1, pageSize: config.pageSize});
        handle = mountDataTable(el, view); empty = !approved;
      }
      forward(approved ? value : '');
    }, 200);
  }
  // Capture runs before the core's delegated input and submit listeners.
  const submit = event => { if (event.target.matches('form[role="search"]')) {event.preventDefault(); event.stopImmediatePropagation();} };
  el.addEventListener('input', input, true); el.addEventListener('submit', submit, true);
  return {destroy() {active = false; revision++; clearTimeout(timer); controller?.abort(); handle.destroy(); el.removeEventListener('input', input, true); el.removeEventListener('submit', submit, true);}};
}
