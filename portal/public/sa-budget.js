import {mountDataTable} from './datatable.js?v=5c09aecf9c';
import {saBudgetConfig} from './sa-budget-table.js?v=c5a3a25416';
for(const node of document.querySelectorAll('[data-sa-budget-table]')){
  const data=node.querySelector('[data-sa-budget-rows]');
  if(data)mountDataTable(node,saBudgetConfig(JSON.parse(data.textContent),node.dataset.saBudgetTable));
}
