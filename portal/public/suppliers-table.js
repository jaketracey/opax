import {dataTableHTML,mountDataTable,parseQuery,serializeQuery} from './datatable.js?v=3ab724d532';
import {remotePrivacyCheck,publicContractQuery} from './contracts-table.js?v=f252eada22';
import {isOrganisationRecipient} from './recipient-entity.js?v=33f5c5486d';
export function suppliersTableConfig({rows,privacyCheck,dataPrivacyCheck}={}) {
  return {id:'suppliers-table',caption:'Suppliers',pageType:'suppliers',privacy:'donors',
    privacyCheck:privacyCheck || remotePrivacyCheck,dataPrivacyCheck:dataPrivacyCheck || (text=>remotePrivacyCheck(text,'data')),
    rowPrivacyCheck:row=>/^s-[a-f0-9]{20}$/.test(String(row.id)) && isOrganisationRecipient(row) && typeof row.name==='string' && Number.isFinite(row.total),
    columns:[{key:'name',label:'Name',type:'text',primary:true},{key:'total',label:'Value',type:'money',bar:true,facet:'range'},
      {key:'count',label:'Contracts',type:'count'},{key:'agency_count',label:'Agencies',type:'count'},
      {key:'jurisdiction',label:'Jurisdiction',type:'category',facet:'multi'},{key:'abn',label:'ABN',type:'text'}],
    ...(rows ? {rows} : {source:{endpoint:'/api/table/suppliers'}}),columnsVisible:['name','total','count','agency_count'],
    primaryLink:row=>/^s-[a-f0-9]{20}$/.test(String(row.id)) ? `/subject/supplier/${row.id}` : null,
    pageSize:50,defaultSort:{key:'total',dir:'desc'},urlKey:'t',export:{filename:'suppliers.csv'}};
}
export function suppliersTableHTML(page,withheld,params) {
  const config=suppliersTableConfig({privacyCheck:text=>!withheld(text),dataPrivacyCheck:withheld.recipientCheck});
  const stateRejected=[...params].some(([key,value])=>(key.startsWith('t.') || key==='q') && withheld(value));
  const safe=stateRejected ? {rows:[],total:0,page:1,pageSize:50,facets:{}} : page;
  return `<div data-suppliers-table>${dataTableHTML(config,safe).replace('<section ',`<section ${stateRejected ? 'data-dt-rejected ' : ''}`)}<script type="application/json" data-suppliers-seed>${JSON.stringify({page:safe,stateRejected}).replace(/</g,'\\u003c')}</script></div>`;
}
const inputs=new WeakMap();
export function suppliersClientRows(host) {return inputs.get(host) || [];}
export async function mountSuppliersTable(el,{params,signal}={}) {
  const node=el.ownerDocument.querySelector('#prerender [data-suppliers-seed]');
  const seed=node ? JSON.parse(node.textContent) : null;
  node?.closest('[data-suppliers-table]')?.remove();
  const state=new URLSearchParams(params || location.search);
  if(state.has('q')) {state.set('t.q',state.get('q'));state.delete('q');}
  const values=[...state].filter(([key])=>key.startsWith('t.')).flatMap(([,value])=>{try{return [value,...Object.values(JSON.parse(value))].flat()}catch{return [value]}});
  const rejected=seed?.stateRejected || values.length>0 && !await remotePrivacyCheck(JSON.stringify(values));
  if(rejected) for(const key of [...state.keys()]) if(key.startsWith('t.')) state.delete(key);
  history.replaceState(history.state,'',location.pathname+(state.size ? '?'+state : '')+location.hash);
  if(signal?.aborted) return {destroy(){}};
  const config=suppliersTableConfig();
  el.innerHTML=dataTableHTML({...config,privacyCheck:()=>false,dataPrivacyCheck:()=>false},seed?.page || {rows:[],total:0,page:1,pageSize:50});
  const root=el.querySelector('[data-datatable]');
  if(rejected) root.setAttribute('data-dt-rejected','');
  inputs.set(root,config.rows || []);
  const handle=mountDataTable(root,config);
  return {destroy(){inputs.delete(root);handle.destroy();}};
}
