import {mountDataTable} from './datatable.js?v=a8472268da';
import {saGrantsConfig,decorateSAGrants} from './sa-grants-table.js?v=38e59b1355';
for(const root of document.querySelectorAll('[data-sa-grants-table]')){
  const rows=JSON.parse(root.querySelector('[data-sa-grants-rows]').textContent);
  new MutationObserver(()=>decorateSAGrants(root)).observe(root,{childList:true});
  mountDataTable(root,saGrantsConfig(rows,root.dataset.saGrantsTable));
  decorateSAGrants(root);
}
