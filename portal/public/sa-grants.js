import {mountDataTable} from './datatable.js?v=893767f2bd';
import {saGrantsConfig,decorateSAGrants} from './sa-grants-table.js?v=b438d3b14f';
for(const root of document.querySelectorAll('[data-sa-grants-table]')){
  const rows=JSON.parse(root.querySelector('[data-sa-grants-rows]').textContent);
  new MutationObserver(()=>decorateSAGrants(root)).observe(root,{childList:true});
  mountDataTable(root,saGrantsConfig(rows,root.dataset.saGrantsTable));
  decorateSAGrants(root);
}
