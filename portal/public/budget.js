import {mountDataTable} from './datatable.js?v=4533f522af';
import {aggregateConfig} from './budget-table.js?v=b8bb2657ef';
const root=document.querySelector('[data-datatable="budget-aggregates"]');
if(root) {
  const data=root.parentElement.querySelector('[data-budget-rows]');
  if(data) mountDataTable(root.parentElement,{...aggregateConfig,rows:JSON.parse(data.textContent)});
}
