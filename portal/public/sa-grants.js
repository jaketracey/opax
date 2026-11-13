import {mountDataTable} from './datatable.js?v=f055b6abe2';
import {saGrantsConfig,decorateSAGrants} from './sa-grants-table.js?v=18cabd3879';
for(const root of document.querySelectorAll('[data-sa-grants-table]')){
  const rows=JSON.parse(root.querySelector('[data-sa-grants-rows]').textContent);
  new MutationObserver(()=>decorateSAGrants(root)).observe(root,{childList:true});
  mountDataTable(root,saGrantsConfig(rows,root.dataset.saGrantsTable));
  decorateSAGrants(root);
}
