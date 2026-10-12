import { readMoneyFilters } from './money-records.js?v=ia-ux-20260908-2';
import {mountDataTable, guardTableURL} from './datatable.js?v=39ece8c488';
import {prepareMoneyConnectionsConfig} from './money-connections.js?v=c49726045c';
import {createTablePrivacyValidator} from './datatable-privacy.js?v=de6469a26a';
import {rawQueryValues} from './datatable-query.js?v=6dd55aab38';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountMapResearch(container, data, options = {}) {
  const cancelled=()=>options.signal?.aborted || options.isCurrent?.() === false;
  if(cancelled())return null;
  const validator=createTablePrivacyValidator({privacyCheck:options.privacyCheck,fetch:(...args)=>fetch(...args)}),permit=validator.permit;
  const initialURL=new URL(location.href);
  await validator.permitSet([...rawQueryValues(initialURL.searchParams)]);
  // Validation can finish after the reader has switched jurisdictions.
  // Check before the first history or DOM write, while this setup owns neither.
  if(cancelled())return null;
  const guarded=guardTableURL({id:'money-connections',caption:'',pageType:'money',privacy:'donors',privacyCheck:validator.approved,urlKey:'c',columns:[]},initialURL);
  const initial=guarded.url.searchParams;
  let rejectedQuery=guarded.rejected;
  history.replaceState(history.state,'',guarded.url);
  let current=data,filters=readMoneyFilters(initial),tableHandle,timer,destroyed=false,inputRevision=0,tableRevision=0;
  const partyOptions = data.nodes.filter(n=>n.kind==='party').sort((a,b)=>a.label.localeCompare(b.label));
  const industries = [...new Set(data.nodes.filter(n=>n.kind==='donor').map(n=>n.group).filter(Boolean))].sort();
  const resultsHost = options.resultsContainer || container;
  container.innerHTML=`<details class="research-filters" name="money-tools"><summary>Filters</summary><div class="research-filter-panel"><form class="research-controls" aria-label="Map research filters"><label>Name<input name="query" type="search" placeholder="Find an organisation or party" maxlength="200"></label><label>Record type<select name="type"><option value="all">All record types</option><option value="receipts">Political receipts</option><option value="contracts">Government contracts</option><option value="grants">Grants</option></select></label><label>Industry<select name="industry"><option value="">All industries</option>${industries.map(g=>`<option value="${esc(g)}">${esc(g[0].toUpperCase()+g.slice(1))}</option>`).join('')}</select></label><label>Recipient party<select name="party"><option value="">All parties</option>${partyOptions.map(n=>`<option value="${esc(n.id)}">${esc(n.label)}</option>`).join('')}</select></label><label>Minimum connection<select name="min"><option value="0">Any value</option><option value="100000">$100,000</option><option value="1000000">$1 million</option><option value="10000000">$10 million</option></select></label><button class="ui-button" data-ui-size="compact" type="reset">Reset</button><button class="ui-button" data-ui-size="compact" type="submit">Apply</button></form><p class="fineprint">Use the year controls inside the map to compare periods. A party filter selects political receipts. Values remain separate by record type; undated amounts remain included. Entity cards show their full totals for the selected years.</p></div></details><button class="ui-button" data-ui-size="compact" type="button" data-records aria-expanded="false">List</button><section class="research-records" aria-labelledby="money-connections-heading" hidden><h2 id="money-connections-heading">Connections matching the map filters</h2><p class="fineprint mc-explainer">Aggregated connections for the map’s selected years; open an entity for its records.</p><p class="research-period fineprint" role="status"></p><div class="money-connections-table"></div></section>`;
  const records=container.querySelector('.research-records');
  if (resultsHost !== container) resultsHost.replaceChildren(records);
  const form=container.querySelector('form'), period=records.querySelector('.research-period'), tableHost=records.querySelector('.money-connections-table');
  for(const href of ['/money-connections.css?v=dt-money-2','/datatable.css']) {
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
  async function renderRows(){
    const version=++tableRevision,view=current;
    tableHandle?.destroy();tableHandle=null;
    const config=await prepareMoneyConnectionsConfig(view,validator);
    if(destroyed || version !== tableRevision)return;
    config.initialRejected=rejectedQuery;
    recordButton.textContent=`List (${rejectedQuery?0:config.rows.length.toLocaleString('en-AU')})`;
    // The core validates its own URL/search state against the shared server index.
    // SSR-like paint has no search echo while asynchronous validation is pending.
    tableHost.innerHTML='';
    tableHandle=mountDataTable(tableHost,config);
  }
  function update(graph, nextFilters, years){
    if(destroyed)return;
    current=graph; filters={...nextFilters};controls();
    period.textContent=years?`${years.from}–${years.to}${years.cpi?' · Inflation adjusted':' · Nominal values'}`:'Available years';
    renderRows();
  }
  async function apply(){
    clearTimeout(timer); if(destroyed)return;
    const version=++inputRevision,next=Object.fromEntries(new FormData(form));
    const safe=!next.query || await permit(next.query);
    if(destroyed || version!==inputRevision)return;
    rejectedQuery=!safe;next.query=safe?next.query:'';form.elements.query.value=next.query;
    filters=next;filters.min=Number(filters.min)||0;
    if(['contracts','grants'].includes(filters.type))filters.party='';
    if(filters.party)filters.type='receipts';
    options.onChange?.(filters);
    const u=new URL(location.href);
    if(u.pathname==='/money' || u.pathname==='/map'){
      for(const [key,value] of Object.entries({q:filters.query,type:filters.type==='all'?'':filters.type,party:filters.party,industry:filters.industry,min:filters.min||''})) value?u.searchParams.set(key,String(value)):u.searchParams.delete(key);
      history.replaceState(history.state,'',u.pathname+(u.searchParams.size?'?'+u.searchParams:''));
    }
    controls();
  }
  const input=e=>{if(e.target.name==='query'){++inputRevision;clearTimeout(timer);timer=setTimeout(apply,180)}};
  const track=(action,properties={})=>{try{dispatchEvent(new CustomEvent('opax:analytics',{detail:{event:'opax_map_action',properties:{action,...properties}}}))}catch{}};
  const change=e=>{if(e.target.name!=='query'){apply();track('filter_changed',{filter:e.target.name})}};
  const submit=e=>{e.preventDefault();apply();track('filters_applied');filterPanel.open=false};
  const reset=e=>{e.preventDefault();++inputRevision;clearTimeout(timer);filters={type:'all',min:0};for(const key of ['query','party','industry'])form.elements[key].value='';form.elements.type.value='all';form.elements.min.value='0';apply()};
  form.addEventListener('input',input);form.addEventListener('change',change);form.addEventListener('submit',submit);form.addEventListener('reset',reset);
  const click=e=>{
    const focus=e.target.closest('a[href^="#money-focus="]');
    if(focus){e.preventDefault();options.onFocus?.(current.nodes[Number(focus.getAttribute('href').slice('#money-focus='.length))]?.id);return;}
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-records')){records.hidden=!records.hidden;if(!records.hidden)track('records_opened');b.setAttribute('aria-expanded',String(!records.hidden));if(!tableHandle)renderRows();if(!records.hidden)records.scrollIntoView({block:'nearest',behavior:'instant'})}

  };
  container.addEventListener('click',click);if(resultsHost !== container) records.addEventListener('click',click);controls();
  return {update,destroy(){destroyed=true;tableHandle?.destroy();clearTimeout(timer);container.removeEventListener('click',click);records.removeEventListener('click',click);document.removeEventListener('click',closeMenus);document.removeEventListener('keydown',closeMenus);records.remove();if(container.contains(form))container.replaceChildren()}};
}
