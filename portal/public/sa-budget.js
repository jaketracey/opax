import {mountDataTable} from './datatable.js?v=5c09aecf9c';
import {saBudgetConfig,decorateSABudgetTable} from './sa-budget-table.js?v=bd3da41857';
for(const node of document.querySelectorAll('[data-sa-budget-table]')){
  const data=node.querySelector('[data-sa-budget-rows]');
  if(data){
    new MutationObserver(()=>decorateSABudgetTable(node)).observe(node,{childList:true});
    mountDataTable(node,saBudgetConfig(JSON.parse(data.textContent),node.dataset.saBudgetTable));
    decorateSABudgetTable(node);
  }
}
