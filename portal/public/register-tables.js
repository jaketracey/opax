import {applyQuery, dataTableHTML, guardTableURL, mountDataTable, parseQuery} from './datatable.js?v=5c09aecf9c';
import {donorDisclosure} from './donor-disclosure.js?v=800932e746';

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

/** Only licence-cleared campaign facts reach this shared register adapter. */
export function govAdvertisingTableConfig(rows) {
  if(rows.some(row=>row.jurisdiction==='VIC'))return {id:'gov-advertising-table',caption:'Published advertising expenditure cells (overlapping table scopes)',pageType:'gov-advertising',urlKey:'advertising',pageSize:25,rows,defaultSort:{key:'financial_year',dir:'desc'},export:{filename:'government-advertising.csv'},
    columnsVisible:['campaign','category','financial_year','entity','total','source_display','record_kind','basis','source_locator','licence'],
    columns:[{key:'campaign',label:'Campaign examples / category',type:'text',primary:true},{key:'financial_year',label:'Financial year',type:'category',sortable:true,facet:'multi',hideWhenConstant:false},
      {key:'entity',label:'Department / agency',type:'category',facet:'multi',href:row=>/^\/subject\/agency\/a-[a-f0-9]{20}$/.test(row.agency_href||'')?row.agency_href:null},
      {key:'total',label:'Reported expenditure (AUD)',type:'money'},
      ...['record_kind','media_type','jurisdiction','report_year'].map(key=>({key,label:{record_kind:'Type',media_type:'Media channel',jurisdiction:'Jurisdiction',report_year:'Source report year'}[key],type:'category',facet:'multi'})),
      ...['category','basis','measure','source_display','source_value','unit','table_heading','campaign_period','period_note','source_locator','snapshot','licence','attribution','sha256','table_sha256','source_url','licence_url'].map(key=>({key,label:{table_heading:'Source table heading',source_display:'Published amount / unit',category:'Cost category',campaign_period:'Campaign period as published',period_note:'Reporting period note',basis:'GST basis',measure:'Published scope',source_value:'Published amount',unit:'Source unit',source_locator:'Original source / table',snapshot:'Source snapshot',licence:'Licence',attribution:'Attribution',sha256:'Document SHA-256',table_sha256:'Table SHA-256',source_url:'Source URL',licence_url:'Licence URL'}[key],type:key==='snapshot'?'date':'text',...(['source_locator','licence'].includes(key)?{href:row=>href(row[key==='licence'?'licence_url':'source_url'])}:{})})),
      ...(rows.some(r=>r.supplier)?[{key:'supplier',label:'Supplier',type:'text'}]:[])],primaryLink:()=>null};
  const categoryColumns = ['media','campaign_development','gst','other'].filter(key=>rows.some(row=>row[key]!=null));
  return {id:'gov-advertising-table',caption:'Reported campaign expenditure',pageType:'gov-advertising',urlKey:'advertising',pageSize:25,rows,
    defaultSort:{key:'financial_year',dir:'desc'},export:{filename:'government-advertising.csv'},
    columnsVisible:['campaign','financial_year','entity','total',...categoryColumns,'basis','measure','source_locator','snapshot','licence'],
    columns:[{key:'campaign',label:'Campaign',type:'text',primary:true},
      {key:'financial_year',label:'Financial year',type:'category',sortable:true,facet:'multi',hideWhenConstant:false},
      {key:'entity',label:'Entity as published',type:'category',facet:'multi',hideWhenConstant:false,href:row=>/^\/subject\/agency\/a-[a-f0-9]{20}$/.test(row.agency_href || '')?row.agency_href:null},
      {key:'total',label:'Reported total (AUD)',type:'money',format:'exact'},
      ...categoryColumns.map(key=>({key,label:{media:'Media (AUD)',campaign_development:'Campaign development (AUD)',gst:'GST (AUD)',other:'Other (AUD)'}[key],type:'money',format:'exact'})),
      {key:'basis',label:'GST basis',type:'text'},{key:'measure',label:'Expenditure scope',type:'text'},
      {key:'source_locator',label:'Original source / table',type:'text',href:row=>href(row.source_url)},
      {key:'snapshot',label:'Source snapshot',type:'text'},
      {key:'licence',label:'Licence',type:'text',href:row=>href(row.licence_url)},
      {key:'source_url',label:'Source URL',type:'text'},{key:'sha256',label:'Document SHA-256',type:'text'},
      {key:'table_sha256',label:'Table SHA-256',type:'text'},{key:'licence_url',label:'Licence URL',type:'text'}],
    primaryLink:row=>href(row.source_url)};
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

/** Factual state bill metadata; bodies remain outside the table/CSV projection. */
export function stateBillsTableConfig(rows) {
  return {id:'state-bills-table',caption:'State bill registry entries',pageType:'state-bills',urlKey:'stateBills',pageSize:25,rows,
    defaultSort:{key:'introduced_date',dir:'desc'},export:{filename:'state-bills.csv'},
    columnsVisible:['title','jurisdiction','parliament','introduced_date','sponsor_name','status','status_as_of','last_action','publisher','snapshot','licence'],
    columns:[{key:'title',label:'Bill title',type:'text',primary:true},
      {key:'jurisdiction',label:'Jurisdiction',type:'category',facet:'multi'},
      {key:'parliament',label:'Parliament / Assembly',type:'category',facet:'multi',sortable:true},
      {key:'introduced_date',label:'Introduced',type:'date'},
      {key:'sponsor_name',label:'Sponsor as published',type:'text'},
      {key:'status',label:'Status',type:'category',facet:'multi'},
      {key:'status_as_of',label:'Source status date',type:'date'},
      {key:'last_action',label:'Last dated action',type:'text'},
      {key:'publisher',label:'Source / attribution',type:'text',href:row=>href(row.source_url)},
      {key:'snapshot',label:'Source snapshot',type:'text'},
      {key:'licence',label:'Licence',type:'text',href:row=>href(row.licence_url)},
      {key:'source_id',label:'Publisher bill ID',type:'text'},
      {key:'source_notes',label:'Source notes',type:'text'},
      {key:'source_url',label:'Source URL',type:'text'},
      {key:'sha256',label:'SHA-256',type:'text'},
      {key:'licence_url',label:'Licence URL',type:'text'}],primaryLink:row=>row.href || null};
}

/** Retain existing bookmarked register URLs while the shared core owns state. */
export function stateBillsTableQuery(params, config) {
  const query=parseQuery(params,config.urlKey);
  if(!query.q && params.get('q'))query.q=params.get('q').trim();
  if(!query.page && /^[1-9]\d{0,4}$/.test(params.get('page') || ''))query.page=Number(params.get('page'));
  for(const key of ['jurisdiction','parliament'])if(params.get(key) && !query.filters?.[key]){
    query.filters ||= {};
    query.filters[key]=[key==='jurisdiction'?({tas:'Tasmania',act:'ACT'}[params.get(key)] || params.get(key)):params.get(key)];
  }
  return query;
}

/** Source cells only: no calculated jurisdiction, level or sector totals. */
export function taxExpendituresTableConfig(rows) {
  return {id:'tax-expenditures-table',caption:'Treasury published revenue forgone estimates',pageType:'tax-expenditures',urlKey:'tax',pageSize:25,rows,
    defaultSort:{key:'measure_year',dir:'desc'},export:{filename:'tax-expenditures.csv'},
    columnsVisible:['title','item_id','measure_year','estimate_display','estimate_status','source_locator'],
    columns:[{key:'title',label:'Tax expenditure',type:'text',primary:true},
      {key:'item_id',label:'ID',type:'text'},
      {key:'measure_year',label:'Measure year',type:'category',facet:'multi',sortable:true},
      {key:'estimate_display',label:'Estimate (AUD)',type:'text',align:'end',sortable:false},
      {key:'estimate_status',label:'Estimate status',type:'category',facet:'multi'},
      {key:'source_locator',label:'Original cell',type:'text',href:row=>href(row.source_url)},
      {key:'category',label:'Tax category',type:'category',facet:'multi'},
      {key:'record_kind',label:'Record kind',type:'category',facet:'multi'},
      {key:'statement',label:'Statement year',type:'text'},
      {key:'benchmark',label:'Benchmark',type:'text'},{key:'benchmark_locator',label:'Benchmark reference',type:'text'},
      {key:'tax_expenditure_type',label:'Tax expenditure type',type:'text'},{key:'reliability',label:'Treasury reliability',type:'text'},
      {key:'estimate_basis',label:'Estimate basis',type:'text'},
      {key:'value',label:'Published value (AUD million)',type:'count'},
      {key:'source_value',label:'Original published value or code',type:'text'},
      {key:'unit',label:'Original unit',type:'text'},{key:'amount',label:'Estimate in AUD',type:'money'},
      {key:'publisher',label:'Source / attribution',type:'text'},{key:'source_url',label:'Source URL',type:'text'},
      {key:'snapshot',label:'Snapshot',type:'text'},{key:'sha256',label:'SHA-256',type:'text'},
      {key:'licence',label:'Licence',type:'text'},{key:'licence_url',label:'Licence URL',type:'text'}],primaryLink:()=>null};
}

export function governmentFinanceTableConfig(rows) {
  return {id:'government-finance-table',caption:'ABS published annual figures',pageType:'government-finance',urlKey:'gfs',pageSize:25,rows,
    defaultSort:{key:'reference_year',dir:'desc'},export:{filename:'government-finance.csv'},
    columnsVisible:['jurisdiction','reference_year','measure','amount','release','source_locator'],
    columns:[{key:'jurisdiction',label:'Jurisdiction',type:'text',primary:true},
      {key:'reference_year',label:'Reference year',type:'category',facet:'multi',sortable:true},
      {key:'measure',label:'Measure',type:'category',facet:'multi'},
      {key:'amount',label:'Amount (AUD)',type:'money',format:'compact'},
      {key:'release',label:'Release',type:'text'},
      {key:'source_locator',label:'Original cell',type:'text',href:row=>href(row.source_url)},
      {key:'level',label:'Level of government',type:'text'},{key:'sector',label:'Sector',type:'text'},
      {key:'consolidation',label:'ABS consolidation group',type:'text'},
      {key:'value_million',label:'Published value (AUD million)',type:'count'},
      {key:'source_marker',label:'Source missing-value marker',type:'text'},
      {key:'unit',label:'Original unit',type:'text'},{key:'prices_basis',label:'Prices basis',type:'text'},
      {key:'series_basis',label:'Series basis',type:'text'},{key:'release_date',label:'Release date',type:'date'},
      {key:'publisher',label:'Source / attribution',type:'text'},
      {key:'source_url',label:'Source URL',type:'text'},
      {key:'snapshot',label:'Snapshot',type:'text'},{key:'sha256',label:'SHA-256',type:'text'},
      {key:'licence',label:'Licence',type:'text'},{key:'licence_url',label:'Licence URL',type:'text'}],
    primaryLink:()=>null};
}

export function governmentFunctionTableConfig(rows) {
  const core=governmentFinanceTableConfig(rows);
  return {...core,id:'government-function-table',caption:'ABS published spending by function',urlKey:'gfsFunction',
    export:{filename:'government-spending-by-function.csv'},
    columnsVisible:['jurisdiction','reference_year','function','function_level','amount','source_locator'],
    columns:[...core.columns.filter(c=>['jurisdiction','reference_year'].includes(c.key)),
      {key:'function',label:'Function as published',type:'text'},
      {key:'function_level',label:'Published row level',type:'category',facet:'multi'},
      ...core.columns.filter(c=>!['jurisdiction','reference_year','measure'].includes(c.key)),
      {key:'measure',label:'Series',type:'category',facet:'multi'},
      {key:'division',label:'Division',type:'category',facet:'multi'},
      {key:'group',label:'Group as published',type:'text'},
      {key:'classification',label:'Classification',type:'text'},
      {key:'division_code',label:'Division code as published',type:'text'},
      {key:'group_code',label:'Group code as published',type:'text'},
      {key:'code_status',label:'Code availability',type:'text'}],primaryLink:()=>null};
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
// The page's CSV comes from the table API for this party, so it keeps the return references the rows leave out.
export function partyMoneyTableConfig(rows, id = 'party-money-table', urlKey = 'partyMoney', pageType = 'party', scope = null) {
  const exportEndpoint = scope?.party ? '/api/table/party-money?' + new URLSearchParams({'f.to':JSON.stringify([scope.party]),...(scope.jurisdiction ? {'f.jurisdiction':JSON.stringify([scope.jurisdiction])} : {})}) : null;
  return {id,caption:'Disclosed donations',pageType,urlKey,pageSize:50,rows:rows.map(({return_reference,...row})=>row),
    defaultSort:{key:'total',dir:'desc'},export:{filename:'party-donations.csv',...(exportEndpoint ? {endpoint:exportEndpoint} : {})},
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
  if(config.urlKey === 'stateBills') {
    const query=stateBillsTableQuery(new URL(el.ownerDocument.defaultView.location.href).searchParams,config);
    config={...config,initialQuery:query,initialQueryKeys:['q','jurisdiction','parliament','page']};
  }
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
    else if (config.urlKey === 'stateBills') Object.assign(config,stateBillsTableConfig(config.rows));
    else if (config.urlKey === 'gfs') Object.assign(config,governmentFinanceTableConfig(config.rows));
    else if (config.urlKey === 'gfsFunction') Object.assign(config,governmentFunctionTableConfig(config.rows));
    else if (config.urlKey === 'advertising') Object.assign(config,govAdvertisingTableConfig(config.rows));
    else if (config.urlKey === 'tax') Object.assign(config,taxExpendituresTableConfig(config.rows));
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
