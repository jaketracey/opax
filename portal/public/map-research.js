import { readMoneyFilters, moneyTotals, moneyRecordsCSV, moneyFlowType } from './money-records.js?v=ia-ux-20260908-2';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:1,notation:'compact'}).format(value);
const exactMoney = value => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(value);
const labels = { receipts:'Political receipts', contracts:'Contract values', grants:'Grant awards' };
export function mountMapResearch(container, data, options = {}) {
  let current = data, filters = readMoneyFilters(new URLSearchParams(location.search)), rowsShown=30, timer, destroyed=false;
  const partyOptions = data.nodes.filter(n=>n.kind==='party').sort((a,b)=>a.label.localeCompare(b.label));
  const industries = [...new Set(data.nodes.filter(n=>n.kind==='donor').map(n=>n.group).filter(Boolean))].sort();
  const resultsHost = options.resultsContainer || container;
  container.innerHTML=`<details class="research-filters" name="money-tools"><summary>Filters</summary><div class="research-filter-panel"><form class="research-controls" aria-label="Map research filters"><label>Name<input name="query" type="search" placeholder="Find an organisation or party" maxlength="200"></label><label>Record type<select name="type"><option value="all">All record types</option><option value="receipts">Political receipts</option><option value="contracts">Government contracts</option><option value="grants">Grants</option></select></label><label>Industry<select name="industry"><option value="">All industries</option>${industries.map(g=>`<option value="${esc(g)}">${esc(g[0].toUpperCase()+g.slice(1))}</option>`).join('')}</select></label><label>Recipient party<select name="party"><option value="">All parties</option>${partyOptions.map(n=>`<option value="${esc(n.id)}">${esc(n.label)}</option>`).join('')}</select></label><label>Minimum connection<select name="min"><option value="0">Any value</option><option value="100000">$100,000</option><option value="1000000">$1 million</option><option value="10000000">$10 million</option></select></label><button class="action-btn" type="reset">Reset</button><button class="action-btn" type="submit">Done</button></form><p class="fineprint">Use the year controls inside the map to compare periods. A party filter selects political receipts. Values remain separate by record type; undated amounts remain included. Entity cards show their full totals for the selected years.</p></div></details><button class="action-btn" type="button" data-records aria-expanded="false">Records</button><section class="research-records" aria-label="Matching map records" hidden><div class="research-summary" role="status" aria-live="polite"></div><button class="action-btn" type="button" data-export>Export connections</button><span class="fineprint" data-feedback role="status"></span><p class="fineprint">These are aggregated connections in the selected map, not every source notice. Open an entity to inspect its records. Export includes every matching connection.</p><div class="table-scroll" tabindex="0"><table><caption>Connections matching the map filters</caption><thead><tr><th>Record type</th><th>From</th><th>To</th><th>Value</th><th>Records</th><th>Years</th><th>Explore</th></tr></thead><tbody></tbody></table></div><button type="button" class="action-btn" data-more>Show more records</button></section>`;
  const records=container.querySelector('.research-records');
  if (resultsHost !== container) resultsHost.replaceChildren(records);
  const form=container.querySelector('form'), summary=records.querySelector('.research-summary'), tbody=records.querySelector('tbody'), feedback=records.querySelector('[data-feedback]');
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
    if(records.hidden)return;
    const nodes=new Map(current.nodes.map(n=>[n.id,n]));
    const edges=[...current.edges].sort((a,b)=>b.total-a.total);
    tbody.innerHTML=edges.slice(0,rowsShown).map(e=>`<tr><td>${labels[moneyFlowType(e,nodes)] || 'Record'}</td><td>${esc(nodes.get(e.source)?.label)}</td><td>${esc(nodes.get(e.target)?.label)}</td><td>${exactMoney(e.total)}</td><td>${esc(e.count)}</td><td>${esc(e.firstYear || 'Undated')}${e.lastYear && e.lastYear!==e.firstYear?'–'+e.lastYear:''}</td><td><button class="text-link" type="button" data-focus="${esc(e.target)}">Focus in map</button></td></tr>`).join('');
    records.querySelector('[data-more]').hidden=edges.length<=rowsShown;
  }
  function update(graph, nextFilters, years){
    if(destroyed)return;
    current=graph; filters={...nextFilters};controls();
    const totals=moneyTotals(graph);
    summary.innerHTML=`<strong>${graph.edges.length.toLocaleString('en-AU')} connections</strong>${Object.entries(totals).map(([type,value])=>`<span>${labels[type]} <b>${money(value)}</b></span>`).join('')}<span class="research-period">${years?`${years.from}–${years.to}${years.cpi?' · Inflation adjusted':' · Nominal values'}`:'Available years'}</span>${!graph.edges.length?'<p>No connections match these filters. Try a broader name, industry or value range.</p>':''}`;
    records.querySelector('[data-export]').disabled=!graph.edges.length;
    recordButton.textContent = `Records (${graph.edges.length.toLocaleString('en-AU')})`;
    renderRows();
  }
  function apply(){
    clearTimeout(timer); if(destroyed)return;
    filters=Object.fromEntries(new FormData(form));filters.min=Number(filters.min)||0;
    if(['contracts','grants'].includes(filters.type))filters.party='';
    if(filters.party)filters.type='receipts';
    rowsShown=30;options.onChange?.(filters);
    const u=new URL(location.href);
    if(u.pathname==='/money' || u.pathname==='/map'){
      for(const [key,value] of Object.entries({q:filters.query,type:filters.type==='all'?'':filters.type,party:filters.party,industry:filters.industry,min:filters.min||''})) value?u.searchParams.set(key,String(value)):u.searchParams.delete(key);
      history.replaceState(history.state,'',u.pathname+u.search);
    }
    controls();
  }
  const input=e=>{if(e.target.name==='query'){clearTimeout(timer);timer=setTimeout(apply,180)}};
  const change=e=>{if(e.target.name!=='query')apply()};
  const submit=e=>{e.preventDefault();apply();filterPanel.open=false};
  const reset=e=>{e.preventDefault();clearTimeout(timer);filters={type:'all',min:0};for(const key of ['query','party','industry'])form.elements[key].value='';form.elements.type.value='all';form.elements.min.value='0';apply()};
  form.addEventListener('input',input);form.addEventListener('change',change);form.addEventListener('submit',submit);form.addEventListener('reset',reset);
  const click=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-records')){records.hidden=!records.hidden;b.setAttribute('aria-expanded',String(!records.hidden));renderRows();if(!records.hidden)records.scrollIntoView({block:'nearest',behavior:'instant'})}
    if(b.hasAttribute('data-more')){rowsShown+=50;renderRows()}
    if(b.dataset.focus)options.onFocus?.(b.dataset.focus);
    if(b.hasAttribute('data-export')){const blob=new Blob(['# OPAX selected map connections; record types are separate. Undated amounts included.\r\n# View: '+location.href+'\r\n'+moneyRecordsCSV(current)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='opax-map-connections.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback.textContent='Connections exported.'}
  };
  container.addEventListener('click',click);if(resultsHost !== container) records.addEventListener('click',click);controls();
  return {update,destroy(){destroyed=true;clearTimeout(timer);container.removeEventListener('click',click);records.removeEventListener('click',click);document.removeEventListener('click',closeMenus);document.removeEventListener('keydown',closeMenus);records.remove();container.replaceChildren()}};
}
