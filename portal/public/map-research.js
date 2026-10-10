import { readMoneyFilters } from './money-records.js?v=ia-ux-20260908-2';
import {dataTableHTML, mountDataTable, applyQuery, parseQuery, serializeQuery} from './datatable.js';
import {moneyConnectionsConfig, cleanMoneyConnectionsParams} from './money-connections.js?v=24a0d122be';
import {mountMoneyConnectionsPreview} from './money-connections-preview.js?v=0ad7fdc3c7';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountMapResearch(container, data, options = {}) {
  const privacyData=options.privacyGraph || data;
  const initial=cleanMoneyConnectionsParams(new URLSearchParams(location.search),privacyData);
  if(initial.params.toString()!==new URLSearchParams(location.search).toString())history.replaceState(history.state,'',location.pathname+(initial.params.size?'?'+initial.params:'')+location.hash);
  let current = data, filters = readMoneyFilters(initial.params), tableHandle, timer, destroyed=false, rejectedQuery=initial.blocked;
  const partyOptions = data.nodes.filter(n=>n.kind==='party').sort((a,b)=>a.label.localeCompare(b.label));
  const industries = [...new Set(data.nodes.filter(n=>n.kind==='donor').map(n=>n.group).filter(Boolean))].sort();
  const resultsHost = options.resultsContainer || container;
  container.innerHTML=`<details class="research-filters" name="money-tools"><summary>Filters</summary><div class="research-filter-panel"><form class="research-controls" aria-label="Map research filters"><label>Name<input name="query" type="search" placeholder="Find an organisation or party" maxlength="200"></label><label>Record type<select name="type"><option value="all">All record types</option><option value="receipts">Political receipts</option><option value="contracts">Government contracts</option><option value="grants">Grants</option></select></label><label>Industry<select name="industry"><option value="">All industries</option>${industries.map(g=>`<option value="${esc(g)}">${esc(g[0].toUpperCase()+g.slice(1))}</option>`).join('')}</select></label><label>Recipient party<select name="party"><option value="">All parties</option>${partyOptions.map(n=>`<option value="${esc(n.id)}">${esc(n.label)}</option>`).join('')}</select></label><label>Minimum connection<select name="min"><option value="0">Any value</option><option value="100000">$100,000</option><option value="1000000">$1 million</option><option value="10000000">$10 million</option></select></label><button class="ui-button" data-ui-size="compact" type="reset">Reset</button><button class="ui-button" data-ui-size="compact" type="submit">Apply</button></form><p class="fineprint">Use the year controls inside the map to compare periods. A party filter selects political receipts. Values remain separate by record type; undated amounts remain included. Entity cards show their full totals for the selected years.</p></div></details><button class="ui-button" data-ui-size="compact" type="button" data-records aria-expanded="false">List</button><section class="research-records" aria-labelledby="money-connections-heading" hidden><h2 id="money-connections-heading">Connections matching the map filters</h2><p class="fineprint mc-explainer">Aggregated connections for the map’s selected years; open an entity for its records.</p><p class="research-period fineprint" role="status"></p><div class="money-connections-table"></div></section>`;
  const records=container.querySelector('.research-records');
  if (resultsHost !== container) resultsHost.replaceChildren(records);
  const form=container.querySelector('form'), period=records.querySelector('.research-period'), tableHost=records.querySelector('.money-connections-table');
  const isStub=serializeQuery({q:'table-contract'},'c')==='';
  for(const href of ['/money-connections.css?v=dt-money-1',...(!isStub?['/datatable.css']:[])]) {
    if(!document.querySelector(`link[href="${href}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
  }
  const filterPanel=container.querySelector('details');
  const recordButton=container.querySelector('[data-records]');
  const closeMenus=e=>{ if(e.key === 'Escape' || e.type === 'click' && !e.target.closest('.money-workspace-toolbar')) { for (const menu of document.querySelectorAll('.money-workspace-toolbar details[open]')) menu.open=false; } };
  document.addEventListener('click',closeMenus);document.addEventListener('keydown',closeMenus);
  function controls() {
    for(const key of ['query','type','industry','party','min']) if(document.activeElement!==form.elements[key]) form.elements[key].value=String(filters[key] || (key==='type'?'all':key==='min'?'0':''));
    form.elements.party.disabled=['contracts','grants'].includes(filters.type);
    const count = [filters.query, filters.type && filters.type !== 'all', filters.industry, filters.party, filters.min].filter(Boolean).length;
    filterPanel.querySelector('summary').textContent = count ? `Filters (${count})` : 'Filters';
  }
  function renderRows(){
    tableHandle?.destroy();tableHandle=null;
    const clean=cleanMoneyConnectionsParams(new URLSearchParams(location.search),privacyData);
    if(clean.params.toString()!==new URLSearchParams(location.search).toString())history.replaceState(history.state,'',location.pathname+(clean.params.size?'?'+clean.params:'')+location.hash);
    const blocked=rejectedQuery || clean.blocked;rejectedQuery=blocked;
    if(records.hidden)return;
    const config=moneyConnectionsConfig(current);
    if(isStub){tableHandle=mountMoneyConnectionsPreview(tableHost,config,privacyData,{blocked,onBlockedChange:value=>{rejectedQuery=value;}});return;}
    if(blocked)config.rows=[];
    const query=parseQuery(clean.params,'c');
    tableHost.innerHTML=dataTableHTML(config,applyQuery(config.rows,config,query));
    tableHandle=mountDataTable(tableHost,config);
  }
  function update(graph, nextFilters, years){
    if(destroyed)return;
    current=graph; filters={...nextFilters};controls();
    period.textContent=years?`${years.from}–${years.to}${years.cpi?' · Inflation adjusted':' · Nominal values'}`:'Available years';
    recordButton.textContent = `List (${moneyConnectionsConfig(graph).rows.length.toLocaleString('en-AU')})`;
    renderRows();
  }
  function apply(){
    clearTimeout(timer); if(destroyed)return;
    filters=Object.fromEntries(new FormData(form));filters.min=Number(filters.min)||0;
    if(['contracts','grants'].includes(filters.type))filters.party='';
    if(filters.party)filters.type='receipts';
    options.onChange?.(filters);
    const u=new URL(location.href);
    if(u.pathname==='/money' || u.pathname==='/map'){
      for(const [key,value] of Object.entries({q:filters.query,type:filters.type==='all'?'':filters.type,party:filters.party,industry:filters.industry,min:filters.min||''})) value?u.searchParams.set(key,String(value)):u.searchParams.delete(key);
      const clean=cleanMoneyConnectionsParams(u.searchParams,privacyData);rejectedQuery ||= clean.blocked;
      history.replaceState(history.state,'',u.pathname+(clean.params.size?'?'+clean.params:''));
    }
    controls();
  }
  const input=e=>{if(e.target.name==='query'){clearTimeout(timer);timer=setTimeout(apply,180)}};
  const track=(action,properties={})=>{try{dispatchEvent(new CustomEvent('opax:analytics',{detail:{event:'opax_map_action',properties:{action,...properties}}}))}catch{}};
  const change=e=>{if(e.target.name!=='query'){apply();track('filter_changed',{filter:e.target.name})}};
  const submit=e=>{e.preventDefault();apply();track('filters_applied');filterPanel.open=false};
  const reset=e=>{e.preventDefault();clearTimeout(timer);filters={type:'all',min:0};for(const key of ['query','party','industry'])form.elements[key].value='';form.elements.type.value='all';form.elements.min.value='0';apply()};
  form.addEventListener('input',input);form.addEventListener('change',change);form.addEventListener('submit',submit);form.addEventListener('reset',reset);
  const click=e=>{
    const focus=e.target.closest('a[href^="#money-focus="]');
    if(focus){e.preventDefault();options.onFocus?.(decodeURIComponent(focus.getAttribute('href').slice('#money-focus='.length)));return;}
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-records')){records.hidden=!records.hidden;if(!records.hidden)track('records_opened');b.setAttribute('aria-expanded',String(!records.hidden));renderRows();if(!records.hidden)records.scrollIntoView({block:'nearest',behavior:'instant'})}
    if(b.dataset.focus){track('record_focused');options.onFocus?.(b.dataset.focus);}

  };
  const restoreCore=e=>{if(!isStub && rejectedQuery && (e.target.matches('input[type="search"]') || e.target.closest('button')?.textContent.trim()==='Clear all')){rejectedQuery=false;renderRows();}};
  tableHost.addEventListener('change',restoreCore);tableHost.addEventListener('click',restoreCore);
  container.addEventListener('click',click);if(resultsHost !== container) records.addEventListener('click',click);controls();
  return {update,destroy(){destroyed=true;tableHandle?.destroy();clearTimeout(timer);tableHost.removeEventListener('change',restoreCore);tableHost.removeEventListener('click',restoreCore);container.removeEventListener('click',click);records.removeEventListener('click',click);document.removeEventListener('click',closeMenus);document.removeEventListener('keydown',closeMenus);records.remove();container.replaceChildren()}};
}
