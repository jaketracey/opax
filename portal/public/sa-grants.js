import {mountDataTable} from './datatable.js?v=5c09aecf9c';
import {saGrantsConfig,decorateSAGrants} from './sa-grants-table.js?v=e70f764f0f';
for(const root of document.querySelectorAll('[data-sa-grants-table]')){
  const rows=JSON.parse(root.querySelector('[data-sa-grants-rows]').textContent);
  new MutationObserver(()=>decorateSAGrants(root)).observe(root,{childList:true});
  mountDataTable(root,saGrantsConfig(rows,root.dataset.saGrantsTable));
  decorateSAGrants(root);
}
