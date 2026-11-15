import {mountDataTable} from './datatable.js?v=05186fc3d9';
import {saGrantsConfig,decorateSAGrants} from './sa-grants-table.js?v=5f83d933a4';
for(const root of document.querySelectorAll('[data-sa-grants-table]')){
  const rows=JSON.parse(root.querySelector('[data-sa-grants-rows]').textContent);
  new MutationObserver(()=>decorateSAGrants(root)).observe(root,{childList:true});
  mountDataTable(root,saGrantsConfig(rows,root.dataset.saGrantsTable));
  decorateSAGrants(root);
}
