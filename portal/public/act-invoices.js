import {mountDataTable} from './datatable.js?v=893767f2bd';
import {actInvoicesConfig,actInvoicesURL,decorateActInvoices} from './act-invoices-table.js?v=f9777cb5f6';
for(const root of document.querySelectorAll('[data-act-invoices-table]')){
 const definitions=JSON.parse(root.querySelector('[data-act-entity-definitions]')?.textContent||'{}');
 const guard=actInvoicesURL(new URL(location.href));
 history.replaceState(history.state,'',guard.url.pathname+guard.url.search);
 new MutationObserver(()=>decorateActInvoices(root,definitions)).observe(root,{childList:true,subtree:true});
 mountDataTable(root,actInvoicesConfig());
 decorateActInvoices(root,definitions);
}
