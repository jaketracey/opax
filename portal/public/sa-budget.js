import {mountDataTable} from './datatable.js?v=05186fc3d9';
import {saBudgetConfig,decorateSABudgetTable} from './sa-budget-table.js?v=a1646cdb0b';
for(const node of document.querySelectorAll('[data-sa-budget-table]')){
  const data=node.querySelector('[data-sa-budget-rows]');
  if(data){
    new MutationObserver(()=>decorateSABudgetTable(node)).observe(node,{childList:true});
    mountDataTable(node,saBudgetConfig(JSON.parse(data.textContent),node.dataset.saBudgetTable));
    decorateSABudgetTable(node);
  }
}
