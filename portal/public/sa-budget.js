import {mountDataTable} from './datatable.js?v=939d14e6a8';
import {saBudgetConfig,decorateSABudgetTable} from './sa-budget-table.js?v=633ad19bc5';
for(const node of document.querySelectorAll('[data-sa-budget-table]')){
  const data=node.querySelector('[data-sa-budget-rows]');
  if(data){
    new MutationObserver(()=>decorateSABudgetTable(node)).observe(node,{childList:true});
    mountDataTable(node,saBudgetConfig(JSON.parse(data.textContent),node.dataset.saBudgetTable));
    decorateSABudgetTable(node);
  }
}
