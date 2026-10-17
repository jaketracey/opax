import {mountDataTable} from './datatable.js?v=ab73c21d90';
import {aggregateConfig} from './budget-table.js?v=0611aafd79';
const root=document.querySelector('[data-datatable="budget-aggregates"]');
if(root) {
  const data=root.parentElement.querySelector('[data-budget-rows]');
  if(data) mountDataTable(root.parentElement,{...aggregateConfig,rows:JSON.parse(data.textContent)});
}
