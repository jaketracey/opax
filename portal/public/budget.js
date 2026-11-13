import {mountDataTable} from './datatable.js?v=5ca04bccb3';
import {aggregateConfig} from './budget-table.js?v=4c2e84e9d1';
const root=document.querySelector('[data-datatable="budget-aggregates"]');
if(root) {
  const data=root.parentElement.querySelector('[data-budget-rows]');
  if(data) mountDataTable(root.parentElement,{...aggregateConfig,rows:JSON.parse(data.textContent)});
}
