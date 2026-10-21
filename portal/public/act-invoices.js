import {mountDataTable} from './datatable.js?v=5c09aecf9c';
import {actInvoicesConfig,actInvoicesURL,decorateActInvoices} from './act-invoices-table.js?v=6d847c98a7';
for(const root of document.querySelectorAll('[data-act-invoices-table]')){
 const guard=actInvoicesURL(new URL(location.href));
 history.replaceState(history.state,'',guard.url.pathname+guard.url.search);
 new MutationObserver(()=>decorateActInvoices(root)).observe(root,{childList:true});
 mountDataTable(root,actInvoicesConfig());
 decorateActInvoices(root);
}
