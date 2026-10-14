import {applyQuery, dataTableHTML, mountDataTable, parseQuery, serializeQuery, toCSV} from './datatable.js?v=0f070cd345';
import {workbenchConfig, workbenchRows} from './datatable-workbench-data.js';

const nativeFetch = window.fetch.bind(window);
// Stub only the fixture endpoint. All other requests use the normal local asset server.
window.fetch = async (input, options = {}) => {
  const url = new URL(input,location.href);
  if (url.pathname !== '/__fixtures/table/receipts') return nativeFetch(input,options);
  if (options.signal?.aborted) throw new DOMException('Aborted','AbortError');
  const query = parseQuery(url.searchParams);
  const page = applyQuery(workbenchRows,{...workbenchConfig},query);
  if (url.searchParams.get('format') === 'csv') {
    const all = applyQuery(workbenchRows,{...workbenchConfig},{...query,page:1,pageSize:50000});
    return new Response(toCSV(all.rows,workbenchConfig),{headers:{'content-type':'text/csv'}});
  }
  return Response.json(page);
};
const host = document.querySelector('#table-example');
let mounted;
function show(example, reset = false) {
  mounted?.destroy();
  const url = new URL(location.href);
  if (reset) {
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('t.')) url.searchParams.delete(key);
    const query = example === 'filtered' ? {filters:{region:['Victoria']}} : example === 'empty' ? {q:'No matching records'} : {};
    for (const [key,value] of new URLSearchParams(serializeQuery(query,'t'))) url.searchParams.set(key,value);
    url.searchParams.set('example',example); history.replaceState(null,'',url);
  }
  const config = example === 'server' ? {...workbenchConfig,rows:undefined,source:{endpoint:'/__fixtures/table/receipts',params:{dataset:'fixture'}}} : workbenchConfig;
  // Keep the first server page visible while hydration fetches the stub endpoint.
  if (reset) host.innerHTML = dataTableHTML({...config},applyQuery(workbenchRows,{...workbenchConfig},{}));
  mounted = mountDataTable(host,config);
  for (const button of document.querySelectorAll('[data-example]')) button.setAttribute('aria-pressed',String(button.dataset.example === example));
  document.querySelector('#example-note').textContent = example === 'server' ? 'Server mode · fixture fetch' : 'Client mode · fixture records';
}
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click',()=>show(button.dataset.example,true));
window.addEventListener('opax:analytics',event => {
  const list = document.querySelector('#event-log');
  list.textContent = `${event.detail.event} · ${event.detail.properties.table_id} · ${event.detail.properties.page_type}`;
});
show(new URL(location.href).searchParams.get('example') || 'default');
