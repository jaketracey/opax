import {mountDataTable} from './datatable.js?v=5ca04bccb3';
import {actInvoicesConfig,actInvoicesURL,decorateActInvoices} from './act-invoices-table.js?v=233c16d059';
for(const root of document.querySelectorAll('[data-act-invoices-table]')){
 const definitions=JSON.parse(root.querySelector('[data-act-entity-definitions]')?.textContent||'{}');
 const guard=actInvoicesURL(new URL(location.href));
 history.replaceState(history.state,'',guard.url.pathname+guard.url.search);
 new MutationObserver(()=>decorateActInvoices(root,definitions)).observe(root,{childList:true,subtree:true});
 mountDataTable(root,actInvoicesConfig());
 decorateActInvoices(root,definitions);
}
