import { applyQuery, dataTableHTML, mountDataTable, parseQuery, serializeQuery } from './datatable.js?v=3ab724d532';
import {isOrganisationRecipient} from './recipient-entity.js?v=33f5c5486d';
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
  const subjects = new Set();
  let amount = 0;
  const rows = contracts.flatMap(contract => {
    const texts = Object.values(contract).filter(v => typeof v === 'string' && !/^(?:\d+|CN[\d.-]+|\d{4}-\d{2}-\d{2})$/.test(v));
    const decoded = texts.map(value => {try {return decodeURIComponent(value);} catch {return value;}});
    if (placeholderContract(contract)) return [];
    const recipient=contract.recipient || {id:contract.supplier_id,name:contract.supplier,kind:contract.recipient_kind,abn_type:contract.abn_type};
    const hidden=!isOrganisationRecipient(recipient) || (withheld.recipientCheck ? !withheld.recipientCheck(decoded.join(' ')) : withheld(...decoded));
    if (hidden) {
      const ids=withheld.subjects?.(...decoded) || [];
      for(const id of ids.length ? ids : [String(recipient.id || 'withheld')]) subjects.add(id);
      amount += Number(contract.amount) || 0;
      return [];
    }
    const row = {id: String(contract.id || ''), title: contractTitle(contract), agency: String(contract.agency || 'Not recorded'),
      amount: Number(contract.amount) || 0, start_date: Number(String(contract.start_date).slice(0, 4)) > 1900 ? String(contract.start_date).slice(0, 10) : null,
      recipient_kind:'organisation', supplier_id: contract.supplier_id || null, url: contract.url || null, link_scope: contract.link_scope || null};
    row.url = ausTenderURL(row);
    return [row];
  });
  if (subjects.size) rows.push({aggregate: {kind: 'individual-donors', count: subjects.size}, amount});
  return rows;
}
export function isPublicContractRow(row) {
  return isOrganisationRecipient(row) && /^CN[\w.-]+$/i.test(String(row?.id || '')) && typeof row.title === 'string' && typeof row.agency === 'string' && Number.isFinite(row.amount);
}
export async function remotePrivacyCheck(text, surface = 'query') {
  try {
    const response = await fetch('/api/table/privacy', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({text,surface})});
    return response.ok && (await response.json()).safe === true;
  } catch {return false;}
}
export function contractsTableConfig({supplierId, rows, count = rows?.length || 0, privacyCheck, dataPrivacyCheck} = {}) {
  const client = Boolean(supplierId) && count <= 2000 && Array.isArray(rows);
  return {
    id: supplierId ? 'supplier-contracts-table' : 'contracts-table', caption: 'Contracts', pageType: supplierId ? 'supplier' : 'contracts',
    privacy: 'donors', privacyCheck: privacyCheck || remotePrivacyCheck,
    dataPrivacyCheck: dataPrivacyCheck || (text=>remotePrivacyCheck(text,'data')),
    rowPrivacyCheck: row => isPublicContractRow(row) && (!dataPrivacyCheck || dataPrivacyCheck(JSON.stringify(row)) === true),
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
function queryTexts(params) {
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
  return texts;
}
function rejectedState(params, withheld) {return withheld(...queryTexts(params));}
export function supplierContractsHTML(contracts, id, params, withheld, recipient) {
  const rows = contractRows(contracts.map(c=>({...c,recipient,supplier_id:id})), withheld).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || Number(b.amount) - Number(a.amount));
  const config = contractsTableConfig({supplierId: id, rows, count: contracts.length, privacyCheck: text => !withheld(text),dataPrivacyCheck:withheld.recipientCheck || (text=>!withheld(text))});
  const rejected = rejectedState(params, withheld);
  return contractsTableHTML(config, applyQuery(rejected ? [] : rows, config, publicContractQuery(params, withheld)), {supplierId: id, count: contracts.length, stateRejected: rejected});
}
export async function contractsHubHTML(loadPage, params, withheld) {
  const config=contractsTableConfig({privacyCheck:text=>!withheld(text),dataPrivacyCheck:withheld.recipientCheck});
  const rejected=rejectedState(params,withheld);
  const page=rejected ? {rows:[],total:0,page:1,pageSize:50,facets:{}} : await loadPage(publicContractQuery(params,withheld));
  return contractsTableHTML(config,page,{stateRejected:rejected});
}
export function contractsTableHTML(config, page, {supplierId, count, stateRejected = false} = {}) {
  // The payload contains only guarded rows and query-free configuration identity.
  const seed = {supplierId: supplierId || null, count, rows: config.rows, page, stateRejected};
  return `<div data-contracts-table>${dataTableHTML(config, page).replace('<section ',`<section ${stateRejected ? 'data-dt-rejected ' : ''}`)}<script type="application/json" data-contracts-seed>${json(seed)}</script></div>`;
}
const mountedRows = new WeakMap();
/** The actual guarded client input, used by the shared browser privacy gate. */
export function contractsClientRows(host) {return mountedRows.get(host) || [];}

/** Mount the real core; it owns validation, URL state, downloads and analytics. */
export async function mountContractsTable(el, {supplierId, count, seed, signal, params} = {}) {
  if (seed) {
    const node = el.ownerDocument.querySelector('#prerender [data-contracts-seed]');
    if (node && JSON.parse(node.textContent).supplierId === (supplierId || null)) node.closest('[data-contracts-table]')?.remove();
  }
  const state = new URLSearchParams(params || location.search);
  // Unknown prefixed fields are outside the core's URL ownership. Preserve safe
  // fields, but never leave a withheld value in ignored table state.
  const known = new Set(['t.q','t.sort','t.page','t.pageSize','t.f.agency','t.f.amount']);
  const extra = new URLSearchParams([...state].filter(([key]) => key.startsWith('t.') && !known.has(key)));
  let stateRejected=seed?.stateRejected === true;
  if (extra.size && !await remotePrivacyCheck(JSON.stringify(queryTexts(extra)))) {
    stateRejected=true;
    for (const key of [...state.keys()]) if(key.startsWith('t.') || key==='contract') state.delete(key);
    history.replaceState(history.state, '', location.pathname + (state.size ? `?${state}` : '') + location.hash);
  }
  if (signal?.aborted) return {destroy() {}};
  if (state.has('contract')) {
    state.set('t.q', state.get('contract')); state.delete('contract');
    history.replaceState(history.state, '', location.pathname + `?${state}` + location.hash);
  }
  if (!seed) {
    const query=new URLSearchParams(supplierId && count<=2000 ? '' : serializeQuery(parseQuery(state,'t')));
    if(supplierId) query.set('supplier',supplierId);
    query.set('pageSize','200');
    const response=await fetch(`/api/table/contracts?${query}`,{signal});
    if(!response.ok) throw Error('The contract records could not be loaded.');
    const page=await response.json();
    seed={page};
    if(supplierId && count<=2000) {
      const rows=[...page.rows];
      for(let n=2;rows.length<page.total;n++) {
        query.set('page',String(n));
        const response=await fetch(`/api/table/contracts?${query}`,{signal});
        if(!response.ok) throw Error('The contract records could not be loaded.');
        const next=await response.json();
        if(!next.rows.length) break;
        rows.push(...next.rows);
      }
      seed.rows=rows;
    }
  }
  if (signal?.aborted) return {destroy() {}};
  const config = contractsTableConfig({supplierId, rows: seed.rows, count});
  // The shared core validates these records before painting or exporting them.
  el.innerHTML = dataTableHTML({...config, privacyCheck: () => false}, seed.page || {rows: [], total: 0, page: 1, pageSize: config.pageSize});
  const root = el.querySelector('[data-datatable]');
  if(stateRejected) root.setAttribute('data-dt-rejected','');
  mountedRows.set(root, config.rows || []);
  const handle = mountDataTable(root, config);
  return {destroy() {mountedRows.delete(root); handle.destroy();}};
}
