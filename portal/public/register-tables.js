import {applyQuery, dataTableHTML, mountDataTable, parseQuery, serializeQuery} from './datatable.js';
import {isOrganisationDonor} from './donor-entity.js?v=2b8d45a50d';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
const href = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; } };
const categoryLabels = {shareholdings:'Shareholdings',real_estate:'Real estate',trusts:'Trusts',directorships:'Directorships',gifts:'Gifts',travel:'Sponsored travel and hospitality',memberships:'Memberships and offices',liabilities:'Liabilities',other:'Other (savings, income, assets, partnerships)'};

export function instrumentTableConfig() {
  return {id:'instruments-table',caption:'Instrument titles',pageType:'instruments',urlKey:'instruments',pageSize:50,
    source:{endpoint:'/api/table/instruments'},defaultSort:{key:'title',dir:'asc'},export:{filename:'instruments.csv'},
    columns:[{key:'title',label:'Title',type:'text',primary:true},{key:'type',label:'Type',type:'category',facet:'multi'},
      {key:'portfolios',label:'Portfolio',type:'category',facet:'multi'},{key:'registered',label:'Registered',type:'date'},
      {key:'status',label:'Status',type:'category',facet:'chips'}],
    primaryLink:row=>/^([CF]\d{4}[A-Z]\d{5})$/.test(String(row.id)) ? `/instrument/${row.id}` : null};
}

export function auditTableConfig(records) {
  return {id:'audit-table',caption:'Tabled reports',pageType:'audit',urlKey:'audit',pageSize:50,
    defaultSort:{key:'tabled_date',dir:'desc'},export:{filename:'audit-reports.csv'},
    columns:[{key:'title',label:'Title',type:'text',primary:true},{key:'tabled_date',label:'Tabled',type:'date'},
      {key:'sectors',label:'Sector',type:'category',facet:'multi'},{key:'entities',label:'Entities',type:'text'}],
    rows:records.map(row=>({id:row.id,title:row.title,tabled_date:date(row.tabled_date),sectors:row.sectors.join('; '),entities:row.entities.join('; ')})),
    primaryLink:row=>/^qao-\d{4}(?:-\d{2})?-\d+$/.test(String(row.id)) ? `/audit/${row.id}` : null};
}

/** An entry is omitted whole, including its holder and source URL. Never rewrite source words. */
export function interestTableData(register, withheld = () => true) {
  const rows = [];
  let omitted = 0;
  for (const [category,bucket] of Object.entries(register.buckets || {})) for (const item of bucket.items || []) {
    if (withheld(item.description, item.holder || '', item.url || '')) { omitted++; continue; }
    const source = href(item.url) || href(register.source_url);
    rows.push({category:categoryLabels[category] || category.replaceAll('_',' '),item:item.description,
      date:date(item.date) || date(register.as_at),source:source && item.page ? `${source.split('#')[0]}#page=${Number(item.page) || 1}` : source});
  }
  return {rows,omitted};
}

export function interestTableConfig(rows) {
  return {id:'interests-table',caption:'Register entries',pageType:'person',urlKey:'interests',pageSize:50,
    rows,defaultSort:{key:'category',dir:'asc'},export:{filename:'declared-interests.csv'},
    columns:[{key:'category',label:'Category',type:'category',facet:'multi'},{key:'item',label:'Item',type:'text',primary:true},
      {key:'date',label:'Date',type:'date'}],primaryLink:row=>href(row.source)};
}

/** Party transfers and grants are excluded. Distinct withheld sources contribute only to totals. */
export function partyMoneyData(graph, partyId, withheld = () => true) {
  const donors = new Map(graph.nodes.filter(node=>node.kind === 'donor').map(node=>[node.id,node]));
  const rows = new Map(), individualIds = new Set();
  const aggregate = {donors:0,total:0,count:0};
  for (const edge of graph.edges) {
    const donor = donors.get(edge.source);
    if (edge.target !== partyId || edge.flow || edge.grant || !donor) continue;
    // Keep only aliases that independently prove organisation status. Browser
    // approvals cover labels, so requiring alias approval would drop valid rows.
    const publicDonor = {label:donor.label,aliases:(donor.aliases || []).filter(label=>isOrganisationDonor({label}))};
    if (!isOrganisationDonor(donor) || !isOrganisationDonor(publicDonor) || withheld(donor.label)) {
      individualIds.add(edge.source); aggregate.total += Number(edge.total) || 0; aggregate.count += Number(edge.count) || 0;
      continue;
    }
    const row = rows.get(donor.id) || {...publicDonor,industry:donor.industry || 'Not supplied',total:0,count:0,firstYear:null,lastYear:null};
    row.total += Number(edge.total) || 0; row.count += Number(edge.count) || 0;
    if (Number.isFinite(edge.firstYear)) row.firstYear = row.firstYear == null ? edge.firstYear : Math.min(row.firstYear,edge.firstYear);
    if (Number.isFinite(edge.lastYear)) row.lastYear = row.lastYear == null ? edge.lastYear : Math.max(row.lastYear,edge.lastYear);
    rows.set(donor.id,row);
  }
  aggregate.donors = individualIds.size;
  return {rows:[...rows.values()],aggregate};
}

export function partyMoneyTableConfig(rows, id = 'party-money-table', urlKey = 'partyMoney', pageType = 'party') {
  return {id,caption:'Organisation donors',pageType,urlKey,pageSize:50,privacy:'donors',rows,
    defaultSort:{key:'total',dir:'desc'},export:{filename:'party-donations.csv'},
    columns:[{key:'label',label:'Donor',type:'text',primary:true},{key:'industry',label:'Industry',type:'category',facet:'multi'},
      {key:'total',label:'Given',type:'money',bar:true,format:'compact',facet:'range'},
      {key:'count',label:'Receipts',type:'count',facet:'range'},{key:'firstYear',label:'First year',type:'year'},
      {key:'lastYear',label:'Last year',type:'year'}],primaryLink:row=>isOrganisationDonor(row) ? `/subject/donor/${encodeURIComponent(row.label)}` : null};
}

export function individualDonorsHTML(aggregate) {
  if (!aggregate.donors) return '';
  const money = new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:2}).format(aggregate.total);
  return `<p data-donor-aggregate="">Individual donors (${aggregate.donors.toLocaleString('en-AU')}): ${esc(money)} across ${aggregate.count.toLocaleString('en-AU')} receipts. Includes donors without recorded organisation evidence.</p>`;
}

/** Public rows are the only vocabulary allowed in protected URL state. Unknown text has no matches and no echo. */
export function guardRegisterQuery(query, config) {
  const clean = {...query,filters:{...query.filters}}, rows = config.rows || [];
  let blocked = false;
  if (clean.sort && !config.columns.some(column=>column.key === clean.sort.key && column.sortable !== false)) {
    delete clean.sort; blocked = true;
  }
  if (clean.q) {
    const text = clean.q.trim().toLocaleLowerCase('en-AU');
    const matches = rows.some(row=>config.columns.some(c=>String(row[c.key] ?? '').toLocaleLowerCase('en-AU').includes(text)));
    const exact = rows.some(row=>config.columns.some(c=>String(row[c.key] ?? '').trim().toLocaleLowerCase('en-AU') === text));
    const organisation = isOrganisationDonor({label:clean.q}) || rows.some(row=>String(row.label ?? '').trim().toLocaleLowerCase('en-AU') === text);
    // A bare name can be a substring of a longer approved organisation. It
    // cannot substantiate a donor search; other registers require whole public
    // phrases or organisation evidence for searches containing several words.
    if (!matches || (config.privacy === 'donors' ? !organisation : /\s/.test(text) && !exact && !organisation)) {
      delete clean.q; blocked = true;
    }
  }
  for (const [key,values] of Object.entries(clean.filters)) {
    const column = config.columns.find(c=>c.key === key);
    if (!column?.facet) { delete clean.filters[key]; blocked = true; continue; }
    if (Array.isArray(values)) {
      const allowed = new Set(rows.map(row=>String(row[key] ?? '')));
      const safe = values.filter(value=>allowed.has(value));
      if (safe.length !== values.length) blocked = true;
      if (safe.length) clean.filters[key] = safe; else delete clean.filters[key];
    }
  }
  if (blocked) { delete clean.q; clean.filters = {}; }
  return {query:clean,blocked};
}

export function registerTableHTML(config, query = {}, protectedSearch = false) {
  const guarded = protectedSearch ? guardRegisterQuery(query,config) : {query,blocked:false};
  const page = applyQuery(guarded.blocked ? [] : config.rows || [],config,guarded.query);
  const payload = JSON.stringify({config,protectedSearch}).replace(/</g,'\\u003c');
  return `<div data-register-table="${esc(config.id)}">${dataTableHTML(config,page)}<script type="application/json" data-register-config>${payload}</script></div>`;
}

function replaceQuery(config, query) {
  const url = new URL(location.href), prefix = `${config.urlKey}.`;
  for (const key of [...url.searchParams.keys()]) if (key.startsWith(prefix)) url.searchParams.delete(key);
  for (const [key,value] of new URLSearchParams(serializeQuery(query,config.urlKey))) url.searchParams.append(key,value);
  history.replaceState(history.state,'',url);
}

/** Keep removed entries out of search fields and history, including typing and browser navigation. */
export function mountRegisterTable(el, config, protectedSearch = false) {
  if (!protectedSearch) return mountDataTable(el,config);
  let mounted, blocked = false;
  const mount = query => {
    const guard = guardRegisterQuery(query,config);
    replaceQuery(config,guard.query);
    mounted?.destroy(); blocked = guard.blocked;
    mounted = mountDataTable(el,blocked ? {...config,rows:[]} : config);
    if (blocked && !el.querySelector('[data-clear]')) el.querySelector('.dt-chips')?.insertAdjacentHTML('beforeend','<button type="button" class="dt-button" data-clear>Clear all</button>');
  };
  mount(parseQuery(new URL(location.href).searchParams,config.urlKey));
  const input = event => {
    if (!event.target.matches?.('[data-search]')) return;
    const query = {...parseQuery(new URL(location.href).searchParams,config.urlKey),q:event.target.value,page:1};
    const guard = guardRegisterQuery(query,config);
    if (guard.blocked || blocked) {
      const value = event.target.value, cursor = event.target.selectionStart;
      event.stopImmediatePropagation(); mount(query);
      const search = el.querySelector('[data-search]');
      search.value = value; search.focus();
      // Search inputs do not support setSelectionRange in every browser.
      if (search.type !== 'search' && cursor != null) search.setSelectionRange(cursor,cursor);
    }
  };
  const clear = event => {
    if (blocked && event.target.closest?.('[data-clear]')) { event.stopImmediatePropagation(); mount({}); }
  };
  const popstate = () => mount(parseQuery(new URL(location.href).searchParams,config.urlKey));
  el.addEventListener('input',input,true); el.addEventListener('click',clear,true);
  window.addEventListener('popstate',popstate);
  return {destroy(){mounted.destroy();el.removeEventListener('input',input,true);el.removeEventListener('click',clear,true);window.removeEventListener('popstate',popstate);}};
}

export function hydrateRegisterTables(root = document) {
  for (const el of root.querySelectorAll('[data-register-table]')) {
    const script = el.querySelector('[data-register-config]');
    if (!script) continue;
    const {config,protectedSearch} = JSON.parse(script.textContent);
    if (config.id === 'instruments-table') Object.assign(config,instrumentTableConfig());
    else if (config.id === 'audit-table') config.primaryLink = row=>`/audit/${row.id}`;
    else if (config.id === 'interests-table') config.primaryLink = row=>href(row.source);
    else config.primaryLink = row=>isOrganisationDonor(row) ? `/subject/donor/${encodeURIComponent(row.label)}` : null;
    script.remove();
    const mounted = mountRegisterTable(el,config,protectedSearch);
    // The existing app replaces SSR and subject sections during navigation.
    const observer = new MutationObserver(()=>{if (!el.isConnected) {mounted.destroy();observer.disconnect();}});
    observer.observe(el.ownerDocument.body,{childList:true,subtree:true});
  }
}
