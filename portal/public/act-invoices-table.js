import {actInvoiceEntityName} from './act-invoices-context.js?v=61d4f9572c';
/** Supplier identity is source-record text only. No links, facets or name search. */
import {dataTableHTML,guardTableURL,serializeQuery} from './datatable.js?v=a8472268da';
export const ACT_INVOICES_ID='kzmf-7uhp';
export const ACT_INVOICES_SOURCE='https://www.data.act.gov.au/Government-and-Transparency/Notifiable-Invoices-Register/'+ACT_INVOICES_ID;
export const ACT_INVOICES_SEARCH=['publish_description','reporting_entity'];
export const ACT_INVOICES_FILTERS=['reporting_entity','financial_year','month','amount'];
export const actInvoicesColumns=[
 {key:'supplier_name',label:'Supplier',type:'text',primary:true,sortable:false},
 {key:'payment_day',label:'Date',type:'date'},
 {key:'amount',label:'Amount',type:'money',format:'exact',facet:'range',align:'end'},
 {key:'reporting_entity',label:'Reporting entity',type:'category',facet:'multi',hideWhenConstant:false},
 {key:'publish_description',label:'Description',type:'text',sortable:false},
 {key:'financial_year',label:'Financial year',type:'category',facet:'multi'},
 {key:'month',label:'Payment month',type:'category',facet:'multi'},
 {key:'supplier_abn',label:'Supplier ABN',type:'text',sortable:false},
 {key:'date_invoice_received',label:'Invoice received as published',type:'text',sortable:false},
 {key:'payment_date',label:'Payment date as published',type:'text',sortable:false},
 {key:'payment_amount',label:'Payment amount as published',type:'text',sortable:false},
 {key:'contract_number',label:'Contract number',type:'text',sortable:false},
 ...['id','source_row_position','socrata_id','socrata_sid','socrata_position','snapshot','snapshot_sha256','dataset_id','source_url','licence','licence_url','attribution'].map(key=>({key,label:({id:'Snapshot record',source_row_position:'Source row position',socrata_id:'Socrata row ID',socrata_sid:'Socrata SID',socrata_position:'Socrata position',snapshot_sha256:'Snapshot SHA-256',dataset_id:'Dataset ID'})[key]||key.replaceAll('_',' '),type:key==='source_row_position'?'count':'text',sortable:false})),
];
/** @returns {import('./datatable.js?v=a8472268da').DataTableConfig} */
export const actInvoicesConfig=()=>({id:'act-invoices',caption:'Published invoice records',pageType:'act-invoices',urlKey:'t',pageSize:50,
 columns:actInvoicesColumns,columnsVisible:['supplier_name','payment_day','amount','reporting_entity','publish_description'],
 defaultSort:{key:'payment_day',dir:'desc'},source:{endpoint:'/api/table/act-invoices'},export:{filename:'act-invoices.csv'}});
/** Only this table's supported URL state survives into HTML, CSV links or history. */
export function actInvoicesURL(input){
 const url=input instanceof URL?input:new URL(input,'https://local.invalid');
 const config=actInvoicesConfig(),guard=guardTableURL(config,url);
 const allowed=new Set(['t.q','t.sort','t.page','t.pageSize',...ACT_INVOICES_FILTERS.map(k=>'t.f.'+k)]);
 const query=guard.query;
 let rejected=guard.rejected||[...url.searchParams.keys()].some(k=>!allowed.has(k));
 if(query.sort&&!config.columns.some(c=>c.key===query.sort.key&&c.sortable!==false&&c.type!=='category'))rejected=true;
 if(Object.keys(query.filters||{}).some(k=>!ACT_INVOICES_FILTERS.includes(k)))rejected=true;
 if(rejected){url.search='';return {url,query:{},rejected:true};}
 url.search=serializeQuery(query,'t');
 return {url,query,rejected:false};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const withoutZeroCents=value=>value.replace(/(\$[\d,]+)\.00(?=["<]|$)/g,'$1');
const phone={'Supplier':'supplier','Date':'date','Amount':'amount'};
export function actInvoicesTableHTML(config,page,url,definitions={}){
 return dataTableHTML(config,page,url)
 .replace(/<td\b[^>]*data-label="Amount"[^>]*>[\s\S]*?<\/td>/g,withoutZeroCents)
 .replace(/<td\b[^>]*data-label="Reporting entity"[^>]*>[\s\S]*?<\/td>/g,cell=>cell.replace(/(<span class="dt-value">)([\s\S]*?)(<\/span>)/,(all,open,code,close)=>{const raw=Object.keys(definitions).find(k=>esc(k)===code);const name=raw&&actInvoiceEntityName(raw,definitions);return name?open+code+' · '+esc(name)+close:all;}))
 .replace(/<th\b([^>]*)>([\s\S]*?)<\/th>/g,(html,attrs,body)=>{
  const key=phone[body.replace(/<[^>]*>/g,'').trim()];return key?`<th${attrs} data-act-column="${key}">${body}</th>`:html;
 }).replace('placeholder="Search"','placeholder="Description or reporting entity"');
}
export function decorateActInvoices(root,definitions={}){
 for(const th of root.querySelectorAll('thead th')){const key=phone[th.textContent.trim()];if(key)th.dataset.actColumn=key;}
 for(const cell of root.querySelectorAll('td[data-label="Amount"]')){const value=cell.querySelector('.dt-value');if(value){const clean=withoutZeroCents(value.textContent);if(value.textContent!==clean)value.textContent=clean;}cell.title=withoutZeroCents(cell.title);}
 for(const cell of root.querySelectorAll('td[data-label="Reporting entity"]')){const value=cell.querySelector('.dt-value');if(!value)continue;const code=cell.dataset.actEntityCode||value.textContent.split(' · ')[0];cell.dataset.actEntityCode=code;const name=actInvoiceEntityName(code,definitions),label=code+(name?' · '+name:'');if(value.textContent!==label)value.textContent=label;}
 const input=root.querySelector('[data-search]');if(input){input.placeholder='Description or reporting entity';input.setAttribute('aria-label','Search description or reporting entity');}
}
