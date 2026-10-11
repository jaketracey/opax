import {applyQuery, dataTableHTML, mountDataTable} from './datatable.js?v=f799267242';
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
export function interestTableData(register, withheld = () => true, privacyCheck) {
  const rows = [];
  let omitted = 0;
  for (const [category,bucket] of Object.entries(register.buckets || {})) for (const item of bucket.items || []) {
    if (withheld(item.description, item.holder || '', item.url || '')) { omitted++; continue; }
    const source = href(item.url) || href(register.source_url);
    const row = {category:categoryLabels[category] || category.replaceAll('_',' '),item:item.description,
      date:date(item.date) || date(register.as_at),source:source && item.page ? `${source.split('#')[0]}#page=${Number(item.page) || 1}` : source};
    if (privacyCheck) {
      try {
        if (privacyCheck(JSON.stringify({description:item.description,holder:item.holder || '',url:item.url || ''})) !== true || privacyCheck(JSON.stringify(row)) !== true) { omitted++; continue; }
      } catch { omitted++; continue; }
    }
    rows.push(row);
  }
  return {rows,omitted};
}

const interestRow = row => typeof row.item === 'string' && typeof row.category === 'string' && !row.aggregate;

export function interestTableConfig(rows, privacyCheck) {
  return {id:'interests-table',caption:'Register entries',pageType:'person',urlKey:'interests',pageSize:50,
    rows,privacy:'donors',rowPrivacyCheck:interestRow,privacyCheck,defaultSort:{key:'category',dir:'asc'},export:{filename:'declared-interests.csv'},
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

export function partyMoneyTableConfig(rows, aggregate, id = 'party-money-table', urlKey = 'partyMoney', pageType = 'party', privacyCheck) {
  rows = aggregate?.donors ? [...rows,{aggregate:{kind:'individual-donors',count:aggregate.donors},total:aggregate.total,count:aggregate.count}] : rows;
  return {id,caption:'Disclosed donations',pageType,urlKey,pageSize:50,privacy:'donors',rowPrivacyCheck:isOrganisationDonor,privacyCheck,rows,
    defaultSort:{key:'total',dir:'desc'},export:{filename:'party-donations.csv'},
    columns:[{key:'label',label:'Donor',type:'text',primary:true},{key:'industry',label:'Industry',type:'category',facet:'multi'},
      {key:'total',label:'Given',type:'money',bar:true,format:'compact',facet:'range'},
      {key:'count',label:'Receipts',type:'count',facet:'range'},{key:'firstYear',label:'First year',type:'year'},
      {key:'lastYear',label:'Last year',type:'year'}],primaryLink:row=>isOrganisationDonor(row) ? `/subject/donor/${encodeURIComponent(row.label)}` : null};
}

/** The shared core owns query validation, pending states, history and CSV checks. */
export function registerTableHTML(config, query = {}) {
  const page = applyQuery(config.rows || [],config,query);
  const payload = JSON.stringify({config}).replace(/</g,'\\u003c');
  return `<div data-register-table="${esc(config.id)}">${dataTableHTML(config,page)}<script type="application/json" data-register-config>${payload}</script></div>`;
}

export function mountRegisterTable(el, config) {
  return mountDataTable(el,config);
}

async function registerPrivacy(text, interests = false) {
  try {
    const response = await fetch('/api/table/privacy' + (interests ? '?context=interests' : ''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});
    return response.ok && (await response.json()).safe === true;
  } catch { return false; }
}

export function hydrateRegisterTables(root = document) {
  for (const el of root.querySelectorAll('[data-register-table]')) {
    const script = el.querySelector('[data-register-config]');
    if (!script) continue;
    const {config} = JSON.parse(script.textContent);
    if (config.id === 'instruments-table') Object.assign(config,instrumentTableConfig());
    else if (config.id === 'audit-table') config.primaryLink = row=>`/audit/${row.id}`;
    else if (config.urlKey === 'interests') Object.assign(config,{rowPrivacyCheck:interestRow,privacyCheck:text=>registerPrivacy(text,true),primaryLink:row=>href(row.source)});
    else Object.assign(config,{rowPrivacyCheck:isOrganisationDonor,privacyCheck:registerPrivacy,primaryLink:row=>isOrganisationDonor(row) ? `/subject/donor/${encodeURIComponent(row.label)}` : null});
    script.remove();
    const mounted = mountRegisterTable(el,config);
    // The existing app replaces SSR and subject sections during navigation.
    const observer = new MutationObserver(()=>{if (!el.isConnected) {mounted.destroy();observer.disconnect();}});
    observer.observe(el.ownerDocument.body,{childList:true,subtree:true});
  }
}
