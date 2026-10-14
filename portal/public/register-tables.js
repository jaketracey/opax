import {applyQuery, dataTableHTML, guardTableURL, mountDataTable, parseQuery} from './datatable.js?v=80ef910041';
import {donorDisclosure} from './donor-disclosure.js?v=abb5e417dd';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
const href = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; } };
const categoryLabels = {shareholdings:'Shareholdings',real_estate:'Real estate',trusts:'Trusts',directorships:'Directorships',gifts:'Gifts',travel:'Sponsored travel and hospitality',memberships:'Memberships and offices',liabilities:'Liabilities',other:'Other (savings, income, assets, partnerships)'};

export function instrumentTableConfig() {
  return {id:'instruments-table',caption:'Instrument titles',pageType:'instruments',urlKey:'instruments',pageSize:50,
    source:{endpoint:'/api/table/instruments'},defaultSort:{key:'title',dir:'asc'},export:{filename:'instruments.csv'},
    columnsVisible:['title','type','portfolios','registered','status'],
    columns:[{key:'title',label:'Title',type:'text',primary:true},{key:'type',label:'Type',type:'category',facet:'multi'},
      {key:'portfolios',label:'Portfolio',type:'category',facet:'multi'},{key:'registered',label:'Registered',type:'date'},
      {key:'status',label:'Status',type:'category',facet:'chips'},{key:'year',label:'Registration year',type:'year',facet:'range'}],
    primaryLink:row=>/^([CF]\d{4}[A-Z]\d{5})$/.test(String(row.id)) ? `/instrument/${row.id}` : null};
}

export function auditTableConfig(records) {
  return {id:'audit-table',caption:'Tabled reports',pageType:'audit',urlKey:'audit',pageSize:50,
    defaultSort:{key:'tabled_date',dir:'desc'},export:{filename:'audit-reports.csv'},
    columnsVisible:['title','tabled_date','sectors','entities'],
    columns:[{key:'title',label:'Title',type:'text',primary:true},{key:'tabled_date',label:'Tabled',type:'date'},
      {key:'sectors',label:'Sector',type:'category',facet:'multi'},{key:'entities',label:'Entities',type:'text',facet:'multi'},
      {key:'year',label:'Report year',type:'year',facet:'range'},
      {key:'responses',label:'Has entity responses',type:'category',facet:'multi',facetOptions:['Yes','No']}],
    rows:records.map(row=>({id:row.id,title:row.title,tabled_date:date(row.tabled_date),year:Number(String(row.year).slice(0,4)) || null,sectors:categoryMembers(row.sectors),entities:row.entities,responses:row.has_responses || Number(row.response_count)>0 ? 'Yes':'No'})),
    primaryLink:row=>/^qao-\d{4}(?:-\d{2})?-\d+$/.test(String(row.id)) ? `/audit/${row.id}` : null};
}

/** The register's source words are retained verbatim. */
export function interestTableData(register) {
  const rows = [];
  for (const [category,bucket] of Object.entries(register.buckets || {})) for (const item of bucket.items || []) {
    if (typeof item.description !== 'string') continue;
    const source = href(item.url) || href(register.source_url);
    rows.push({category:categoryLabels[category] || category.replaceAll('_',' '),item:item.description,
      date:date(item.date) || date(register.as_at),source:source && item.page ? `${source.split('#')[0]}#page=${Number(item.page) || 1}` : source});
  }
  return {rows,omitted:0};
}

export const categoryMembers = values => [...new Set((values || []).flatMap(value=>String(value).split(';').map(v=>v.trim()).filter(Boolean)))];

export function interestTableConfig(rows) {
  return {id:'interests-table',caption:'Register entries',pageType:'person',urlKey:'interests',pageSize:50,
    rows,defaultSort:{key:'category',dir:'asc'},export:{filename:'declared-interests.csv'},
    columns:[{key:'category',label:'Category',type:'category',facet:'multi'},{key:'item',label:'Item',type:'text',primary:true},
      {key:'date',label:'Date',type:'date'}],primaryLink:row=>href(row.source)};
}

/** This source keeps givers record-only. Its endpoint searches official fields. */
export function vicGiftsTableConfig(params = {}, populatedFields = []) {
  return {id:'vic-gifts-table',caption:'Published gifts, benefits and hospitality',pageType:'vic-gifts',urlKey:'vicGifts',pageSize:25,
    source:{endpoint:'/api/register/vic-gifts',params},defaultSort:{key:'office_holder',dir:'asc'},export:{filename:'vic-gifts.csv'},
    columnsVisible:['office_holder','role','portfolio','description','giver','source_locator'],
    columns:[{key:'office_holder',label:'Office holder',type:'text',primary:true},
      {key:'role',label:'Role',type:'category',facet:'multi'},
      {key:'portfolio',label:'Portfolio',type:'text'},
      {key:'period',label:'Period',type:'category',facet:'multi'},
      {key:'description',label:'Description',type:'text',sortable:false},
      {key:'giver',label:'Giver as published',type:'text',sortable:false},
      {key:'date',label:'Date as published',type:'text',sortable:false},
      {key:'estimated_value',label:'Estimated value as published',type:'text',sortable:false},
      {key:'action_taken',label:'Action taken as published',type:'text',sortable:false},
      {key:'source_locator',label:'Source row',type:'text',href:row=>href(row.source_url)},
      {key:'source_url',label:'Source URL',type:'text',sortable:false},
      {key:'snapshot',label:'Snapshot',type:'text',sortable:false},
      {key:'sha256',label:'SHA-256',type:'text',sortable:false},
      {key:'licence',label:'Licence',type:'text',sortable:false},
      {key:'licence_url',label:'Licence URL',type:'text',sortable:false}]
      .filter(column=>!['date','estimated_value','action_taken'].includes(column.key) || populatedFields.includes(column.key)),
    primaryLink:row=>row.href || null};
}

/** No giver, description or action text participates in search or facets. */
export function vicGiftsQuery(rows, config, query = {}) {
  const searched = query.q ? applyQuery(rows,{...config,columns:config.columns.filter(c=>['office_holder','role','portfolio','period','date'].includes(c.key))},{q:query.q,pageSize:50000}).rows : rows;
  return applyQuery(searched,config,{...query,q:undefined});
}

/** Keep every disclosed donor; party transfers and grants are excluded. */
export function partyMoneyData(graph, partyId) {
  const donors = new Map(graph.nodes.filter(node=>node.kind === 'donor').map(node=>[node.id,node]));
  const rows = new Map();
  for (const edge of graph.edges) {
    const donor = donors.get(edge.source);
    if (edge.target !== partyId || edge.flow || edge.grant || !donor) continue;
    const disclosure=donorDisclosure(donor,{return_type:graph.meta?.source || 'Electoral disclosure return',url:graph.meta?.source_url});
    const row = rows.get(donor.id) || {label:disclosure.name,href:disclosure.href,return_reference:disclosure.reference,
      industry:donor.industry || 'Not supplied',total:0,count:0,firstYear:null,lastYear:null};
    row.total += Number(edge.total) || 0; row.count += Number(edge.count) || 0;
    if (Number.isFinite(edge.firstYear)) row.firstYear = row.firstYear == null ? edge.firstYear : Math.min(row.firstYear,edge.firstYear);
    if (Number.isFinite(edge.lastYear)) row.lastYear = row.lastYear == null ? edge.lastYear : Math.max(row.lastYear,edge.lastYear);
    rows.set(donor.id,row);
  }
  return {rows:[...rows.values()]};
}

// The table's rows (and so the page's hydration JSON) leave out return_reference;
// partyMoneyData keeps it for /api/register/party-money and the table API CSV.
export function partyMoneyTableConfig(rows, id = 'party-money-table', urlKey = 'partyMoney', pageType = 'party') {
  return {id,caption:'Disclosed donations',pageType,urlKey,pageSize:50,rows:rows.map(({return_reference,...row})=>row),
    defaultSort:{key:'total',dir:'desc'},export:{filename:'party-donations.csv'},
    columns:[{key:'label',label:'Donor',type:'text',primary:true},{key:'industry',label:'Industry',type:'category',facet:'multi'},
      {key:'total',label:'Given',type:'money',bar:true,format:'compact',facet:'range'},
      {key:'count',label:'Receipts',type:'count',facet:'range'},{key:'firstYear',label:'First year',type:'year'},
      {key:'lastYear',label:'Last year',type:'year'}],primaryLink:row=>row.href || null};
}

/** The shared core owns query validation, pending states, history and CSV checks. */
export function registerTableHTML(config, query, requestURL) {
  if (requestURL) {
    const guarded=guardTableURL(config,requestURL);
    if (guarded.rejected || query == null) query=guarded.query;
  }
  const page = applyQuery(config.rows || [],config,query || {});
  const {initialQuery,...clientConfig}=config;
  const payload = JSON.stringify({config:clientConfig}).replace(/</g,'\\u003c');
  return `<div data-register-table="${esc(config.id)}">${dataTableHTML(config,page)}<script type="application/json" data-register-config>${payload}</script></div>`;
}

export function mountRegisterTable(el, config) {
  if (['instruments','audit'].includes(config.urlKey)) {
    const url=new URL(el.ownerDocument.defaultView.location.href),query=registerTableQuery(url.searchParams,config);
    config={...config,initialQuery:query,initialQueryKeys:['q','portfolio','type','status','sector','entity','year','responses']};
  }
  return mountDataTable(el,config);
}

export function hydrateRegisterTables(root = document) {
  for (const el of root.querySelectorAll('[data-register-table]')) {
    const script = el.querySelector('[data-register-config]');
    if (!script) continue;
    const {config} = JSON.parse(script.textContent);
    if (config.id === 'instruments-table') Object.assign(config,instrumentTableConfig());
    else if (config.id === 'audit-table') Object.assign(config,{columns:auditTableConfig([]).columns,primaryLink:row=>`/audit/${row.id}`});
    else if (config.urlKey === 'interests') Object.assign(config,{primaryLink:row=>href(row.source)});
    else if (config.urlKey === 'vicGifts') { const factory=vicGiftsTableConfig(config.source?.params,config.columns.map(column=>column.key)); Object.assign(config,{columns:factory.columns,primaryLink:factory.primaryLink}); }
    else Object.assign(config,{primaryLink:row=>row.href || null});
    script.remove();
    const mounted = mountRegisterTable(el,config);
    // The existing app replaces SSR and subject sections during navigation.
    const observer = new MutationObserver(()=>{if (!el.isConnected) {mounted.destroy();observer.disconnect();}});
    observer.observe(el.ownerDocument.body,{childList:true,subtree:true});
  }
}

/** Legacy links become core state against the complete catalogue. */
export function registerTableQuery(params,config) {
 const query=parseQuery(params,config.urlKey);
 if(!query.q && params.get('q'))query.q=params.get('q').trim();
 const aliases=config.urlKey==='instruments'?{portfolio:'portfolios',type:'type',status:'status'}:{sector:'sectors',entity:'entities'};
 for(const [legacy,column] of Object.entries(aliases))if(params.get(legacy) && !query.filters?.[column]){
  query.filters ||= {};query.filters[column]=[params.get(legacy)==='unknown'?'Not supplied':params.get(legacy)];
 }
 if(config.urlKey==='audit' && params.get('responses')==='yes' && !query.filters?.responses){
  query.filters ||= {};query.filters.responses=['Yes'];
 }
 if(params.get('year') && !query.filters?.year){
  const value=params.get('year');query.filters ||= {};
  query.filters.year=/^\d{4}(?:-\d{2})?$/.test(value) ? {min:Number(value.slice(0,4)),max:Number(value.slice(0,4))} : [value];
 }
 return query;
}
