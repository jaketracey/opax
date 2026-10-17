import {dataTableHTML,mountDataTable} from './datatable.js?v=ab73c21d90';
export function suppliersTableConfig({donor,rows}={}) {
  return {id:'suppliers-table',caption:'Suppliers',pageType:'suppliers',    columns:[{key:'name',label:'Name',type:'text',primary:true},{key:'total',label:'Value',type:'money',bar:true,facet:'range'},
      {key:'count',label:'Contracts',type:'count'},{key:'agency_count',label:'Agencies',type:'count'},
      {key:'jurisdiction',label:'Jurisdiction',type:'category',facet:'multi'},{key:'abn',label:'ABN',type:'text'}],
    ...(rows ? {rows} : {source:{endpoint:'/api/table/suppliers',...(typeof donor==='string' ? {params:{donor}} : {})}}),columnsVisible:['name','total','count','agency_count'],
    primaryLink:row=>/^s-[a-f0-9]{20}$/.test(String(row.id)) ? `/subject/supplier/${row.id}` : null,
    pageSize:50,defaultSort:{key:'total',dir:'desc'},urlKey:'t',export:{filename:'suppliers.csv'}};
}
export function suppliersTableHTML(page, params = new URLSearchParams()) {
  const config = suppliersTableConfig({donor: params.get('donor') ?? undefined});
  return `<div data-suppliers-table>${dataTableHTML(config, page)}<script type="application/json" data-suppliers-seed>${JSON.stringify({page}).replace(/</g, '\\u003c')}</script></div>`;
}
export async function mountSuppliersTable(el, {params, signal} = {}) {
  const node = el.ownerDocument.querySelector('#prerender [data-suppliers-seed]');
  const seed = node ? JSON.parse(node.textContent) : null;
  node?.closest('[data-suppliers-table]')?.remove();
  const state = new URLSearchParams(params || location.search);
  if (state.has('q')) {state.set('t.q', state.get('q')); state.delete('q');}
  history.replaceState(history.state, '', location.pathname + (state.size ? '?' + state : '') + location.hash);
  if (signal?.aborted) return {destroy() {}};
  const config = suppliersTableConfig({donor: state.get('donor') ?? undefined});
  el.innerHTML = dataTableHTML(config, seed?.page || {rows: [], total: 0, page: 1, pageSize: 50});
  return mountDataTable(el.querySelector('[data-datatable]'), config);
}
