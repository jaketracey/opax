import {applyQuery, dataTableHTML, guardTableURL, mountDataTable, parseQuery} from './datatable.js?v=6a075a1958';
import {isOrganisationDonor} from './donor-entity.js?v=ebb2c972d5';
import {privacyTexts,privacyCSVFields} from './datatable-privacy-fields.js?v=7a6c85a822';
import {queryValues} from './datatable-query.js?v=91898b0c1f';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
const href = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; } };
const approvedRow = (row,check) => {
  if(!check)return true;
  const values=[...queryValues(row)];
  return check(JSON.stringify(row))===true && check(values.join('\n'))===true && values.every(value=>check(value)===true);
};
const categoryLabels = {shareholdings:'Shareholdings',real_estate:'Real estate',trusts:'Trusts',directorships:'Directorships',gifts:'Gifts',travel:'Sponsored travel and hospitality',memberships:'Memberships and offices',liabilities:'Liabilities',other:'Other (savings, income, assets, partnerships)'};

export function instrumentTableConfig(privacyCheck, privacyRowCheck = privacyCheck) {
  return {id:'instruments-table',caption:'Instrument titles',pageType:'instruments',urlKey:'instruments',pageSize:50,
    privacy:'donors',privacyCheck,privacyRowCheck,rowPrivacyCheck:instrumentRow,source:{endpoint:'/api/table/instruments'},defaultSort:{key:'title',dir:'asc'},export:{filename:'instruments.csv'},
    columnsVisible:['title','type','portfolios','registered','status'],
    columns:[{key:'title',label:'Title',type:'text',primary:true},{key:'type',label:'Type',type:'category',facet:'multi'},
      {key:'portfolios',label:'Portfolio',type:'category',facet:'multi'},{key:'registered',label:'Registered',type:'date'},
      {key:'status',label:'Status',type:'category',facet:'chips'},{key:'year',label:'Registration year',type:'year',facet:'range'}],
    primaryLink:row=>/^([CF]\d{4}[A-Z]\d{5})$/.test(String(row.id)) ? `/instrument/${row.id}` : null};
}

export function auditTableConfig(records, privacyCheck, privacyRowCheck = privacyCheck) {
  return {privacyFields:['entities'],id:'audit-table',caption:'Tabled reports',pageType:'audit',urlKey:'audit',pageSize:50,
    privacy:'donors',privacyCheck,privacyRowCheck,rowPrivacyCheck:auditRow,defaultSort:{key:'tabled_date',dir:'desc'},export:{filename:'audit-reports.csv'},
    columnsVisible:['title','tabled_date','sectors','entities'],
    columns:[{key:'title',label:'Title',type:'text',primary:true},{key:'tabled_date',label:'Tabled',type:'date'},
      {key:'sectors',label:'Sector',type:'category',facet:'multi'},{key:'entities',label:'Entities',type:'text',facet:'multi'},
      {key:'year',label:'Report year',type:'year',facet:'range'},
      {key:'responses',label:'Has entity responses',type:'category',facet:'multi',facetOptions:['Yes','No']}],
    rows:records.map(row=>({id:row.id,title:row.title,tabled_date:date(row.tabled_date),year:Number(String(row.year).slice(0,4)) || null,sectors:categoryMembers(row.sectors),entities:row.entities,responses:row.has_responses || Number(row.response_count)>0 ? 'Yes':'No'})),
    primaryLink:row=>/^qao-\d{4}(?:-\d{2})?-\d+$/.test(String(row.id)) ? `/audit/${row.id}` : null};
}

/** An entry is omitted whole, including its holder and source URL. Never rewrite source words. */
export const interestEntryOmitted = item => [item.description,item.holder,item.url].some(value=>/Donor \d+ \(name withheld\)/i.test(String(value || '')));
export function interestTableData(register, withheld = () => true, privacyCheck) {
  const rows = [];
  let omitted = 0;
  for (const [category,bucket] of Object.entries(register.buckets || {})) for (const item of bucket.items || []) {
    if (interestEntryOmitted(item) || withheld(item.description, item.holder || '', item.url || '')) { omitted++; continue; }
    const source = href(item.url) || href(register.source_url);
    const row = {category:categoryLabels[category] || category.replaceAll('_',' '),item:item.description,
      date:date(item.date) || date(register.as_at),source:source && item.page ? `${source.split('#')[0]}#page=${Number(item.page) || 1}` : source};
    if (privacyCheck) {
      try {
        if (!approvedRow({description:item.description,holder:item.holder || '',url:item.url || ''},privacyCheck) || !approvedRow(row,privacyCheck)) { omitted++; continue; }
      } catch { omitted++; continue; }
    }
    rows.push(row);
  }
  return {rows,omitted};
}

const instrumentRow = row => typeof row.title === 'string' && /^([CF]\d{4}[A-Z]\d{5})$/.test(String(row.id)) && !row.aggregate;
const auditRow = row => typeof row.title === 'string' && /^qao-\d{4}(?:-\d{2})?-\d+$/.test(String(row.id)) && !row.aggregate;
export const categoryMembers = values => [...new Set(values.flatMap(value=>String(value).split(';').map(v=>v.trim()).filter(Boolean)))];
const interestRow = row => typeof row.item === 'string' && typeof row.category === 'string' && !row.aggregate;

export function interestTableConfig(rows, privacyCheck, privacyRowCheck = privacyCheck) {
  return {id:'interests-table',caption:'Register entries',pageType:'person',urlKey:'interests',pageSize:50,
    rows,privacy:'donors',privacyRowCheck,rowPrivacyCheck:interestRow,privacyCheck,defaultSort:{key:'category',dir:'asc'},export:{filename:'declared-interests.csv'},
    columns:[{key:'category',label:'Category',type:'category',facet:'multi'},{key:'item',label:'Item',type:'text',primary:true},
      {key:'date',label:'Date',type:'date'}],primaryLink:row=>href(row.source)};
}

/** Party transfers and grants are excluded. Distinct withheld sources contribute only to totals. */
export function partyMoneyData(graph, partyId, withheld = () => true, privacyCheck) {
  const donors = new Map(graph.nodes.filter(node=>node.kind === 'donor').map(node=>[node.id,node]));
  const rows = new Map(), individualIds = new Set();
  const aggregate = {donors:0,total:0,count:0};
  for (const edge of graph.edges) {
    const donor = donors.get(edge.source);
    if (edge.target !== partyId || edge.flow || edge.grant || !donor) continue;
    // Keep only aliases that independently prove organisation status. Browser
    // approvals cover labels, so requiring alias approval would drop valid rows.
    const publicDonor = {label:donor.label,aliases:(donor.aliases || []).filter(label=>isOrganisationDonor({label}))};
    if (!isOrganisationDonor(donor) || !isOrganisationDonor(publicDonor) || withheld(donor.label) || !approvedRow({id:donor.id,...publicDonor,industry:donor.industry || 'Not supplied'},privacyCheck)) {
      individualIds.add(edge.source); aggregate.total += Number(edge.total) || 0; aggregate.count += Number(edge.count) || 0;
      continue;
    }
    const row = rows.get(donor.id) || {...publicDonor,industry:donor.industry || 'Not supplied',total:0,count:0,firstYear:null,lastYear:null};
    row.total += Number(edge.total) || 0; row.count += Number(edge.count) || 0;
    if (Number.isFinite(edge.firstYear)) row.firstYear = row.firstYear == null ? edge.firstYear : Math.min(row.firstYear,edge.firstYear);
    if (Number.isFinite(edge.lastYear)) row.lastYear = row.lastYear == null ? edge.lastYear : Math.max(row.lastYear,edge.lastYear);
    rows.set(donor.id,row);
  }
  for(const [id,row]of rows)if(!approvedRow(row,privacyCheck)){
    individualIds.add(id);aggregate.total+=row.total;aggregate.count+=row.count;rows.delete(id);
  }
  aggregate.donors = individualIds.size;
  return {rows:[...rows.values()],aggregate};
}

export function partyMoneyTableConfig(rows, aggregate, id = 'party-money-table', urlKey = 'partyMoney', pageType = 'party', privacyCheck, privacyRowCheck = privacyCheck) {
  rows = aggregate?.donors ? [...rows,{aggregate:{kind:'individual-donors',count:aggregate.donors},total:aggregate.total,count:aggregate.count}] : rows;
  return {id,caption:'Disclosed donations',pageType,urlKey,pageSize:50,privacy:'donors',privacyRowCheck,rowPrivacyCheck:isOrganisationDonor,privacyCheck,rows,
    defaultSort:{key:'total',dir:'desc'},export:{filename:'party-donations.csv'},
    columns:[{key:'label',label:'Donor',type:'text',primary:true},{key:'industry',label:'Industry',type:'category',facet:'multi'},
      {key:'total',label:'Given',type:'money',bar:true,format:'compact',facet:'range'},
      {key:'count',label:'Receipts',type:'count',facet:'range'},{key:'firstYear',label:'First year',type:'year'},
      {key:'lastYear',label:'Last year',type:'year'}],primaryLink:row=>isOrganisationDonor(row) ? `/subject/donor/${encodeURIComponent(row.label)}` : null};
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

async function registerPrivacy(text, mode = 'query') {
  try {
    const response = await fetch('/api/table/privacy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,mode})});
    return response.ok && (await response.json()).safe === true;
  } catch { return false; }
}

export function hydrateRegisterTables(root = document) {
  for (const el of root.querySelectorAll('[data-register-table]')) {
    const script = el.querySelector('[data-register-config]');
    if (!script) continue;
    const {config} = JSON.parse(script.textContent);
    if (config.id === 'instruments-table') Object.assign(config,instrumentTableConfig(registerPrivacy,text=>registerPrivacy(text,'row')));
    else if (config.id === 'audit-table') Object.assign(config,{columns:auditTableConfig([],registerPrivacy).columns,privacyFields:['entities'],privacy:'donors',rowPrivacyCheck:auditRow,privacyCheck:registerPrivacy,privacyRowCheck:text=>registerPrivacy(text,'row'),primaryLink:row=>`/audit/${row.id}`});
    else if (config.urlKey === 'interests') Object.assign(config,{rowPrivacyCheck:interestRow,privacyCheck:registerPrivacy,privacyRowCheck:text=>registerPrivacy(text,'row'),primaryLink:row=>href(row.source)});
    else Object.assign(config,{rowPrivacyCheck:isOrganisationDonor,privacyCheck:registerPrivacy,privacyRowCheck:text=>registerPrivacy(text,'row'),primaryLink:row=>isOrganisationDonor(row) ? `/subject/donor/${encodeURIComponent(row.label)}` : null});
    config.privacyCSVCheck=async csv=>{
      try {
        const texts=[...privacyCSVFields(csv,config)];
        const response=await fetch('/api/table/privacy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({texts,mode:'row'})});
        return response.ok && (await response.json()).safe === true;
      } catch { return false; }
    };
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
