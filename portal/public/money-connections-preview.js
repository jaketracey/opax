// Temporary lane preview while datatable.js is the frozen stub. The money lane
// switches to the shared core as soon as serializeQuery implements the contract.
import {dataTableHTML} from './datatable.js';
import {shortMoney} from './format.js';
import {cleanMoneyConnectionsQuery, cleanMoneyConnectionsParams} from './money-connections.js?v=24a0d122be';
const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=value=>Number(value || 0).toLocaleString('en-AU');
const exact=value=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:20}).format(value);
const button=(label,attributes='')=>`<button type="button" class="ui-button" data-ui-size="compact" ${attributes}>${label}</button>`;
const focusIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4"/><circle cx="10" cy="10" r="3"/></svg>';
const densityIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg>';

export function previewParseQuery(params) {
  const query={q:params.get('c.q') || '',filters:{},page:Number(params.get('c.page')) || 1,pageSize:Number(params.get('c.pageSize')) || 50};
  const sort=/^(\w+):(asc|desc)$/.exec(params.get('c.sort') || '');
  if(sort)query.sort={key:sort[1],dir:sort[2]};
  for(const [key,value] of params) {
    const match=/^c\.f\.(\w+)(?:\.(min|max))?$/.exec(key);if(!match)continue;
    if(match[2]) {if(Number.isFinite(Number(value)))query.filters[match[1]]={...query.filters[match[1]],[match[2]]:Number(value)};}
    else {if(!Array.isArray(query.filters[match[1]]))query.filters[match[1]]=[];query.filters[match[1]].push(value);}
  }
  return query;
}
export function previewSerializeQuery(query) {
  const params=new URLSearchParams();
  if(query.q)params.set('c.q',query.q);
  for(const [key,value] of Object.entries(query.filters || {})) {
    if(Array.isArray(value))for(const v of value)params.append(`c.f.${key}`,v);
    else for(const edge of ['min','max'])if(Number.isFinite(value[edge]))params.set(`c.f.${key}.${edge}`,String(value[edge]));
  }
  if(query.sort)params.set('c.sort',`${query.sort.key}:${query.sort.dir}`);
  if(query.page>1)params.set('c.page',query.page);
  if(query.pageSize && query.pageSize!==50)params.set('c.pageSize',query.pageSize);
  return params.toString();
}
export function previewApplyQuery(rows,config,query={}) {
  const facets={};
  for(const col of config.columns.filter(c=>c.facet)) {
    if(col.facet==='range')facets[col.key]={min:rows.length?Math.min(...rows.map(r=>Number(r[col.key]))):0,max:rows.length?Math.max(...rows.map(r=>Number(r[col.key]))):0};
    else {const values=new Map();for(const r of rows)values.set(r[col.key],(values.get(r[col.key]) || 0)+1);facets[col.key]=[...values].map(([value,count])=>({value,count}));}
  }
  const filtered=previewFilteredRows(rows,config,query);
  const pageSize=Math.max(1,Math.min(200,query.pageSize || config.pageSize || 50)),page=Math.max(1,Math.min(Math.ceil(filtered.length/pageSize) || 1,query.page || 1));
  return {rows:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,facets};
}
export function previewFilteredRows(rows,config,query={}) {
  const q=String(query.q || '').trim().toLocaleLowerCase('en-AU');
  const filtered=rows.filter(row=>(!q || config.columns.some(col=>String(row[col.key] ?? '').toLocaleLowerCase('en-AU').includes(q)))
    && Object.entries(query.filters || {}).every(([key,value])=>Array.isArray(value)?!value.length || value.includes(String(row[key]))
      : (!Number.isFinite(value.min) || Number(row[key])>=value.min) && (!Number.isFinite(value.max) || Number(row[key])<=value.max)));
  const sort=query.sort || config.defaultSort;
  if(sort)filtered.sort((a,b)=>(typeof a[sort.key]==='number'?a[sort.key]-b[sort.key]:String(a[sort.key]).localeCompare(String(b[sort.key]),'en-AU',{numeric:true}))*(sort.dir==='asc'?1:-1));
  return filtered;
}
export function previewCSV(rows,config) {
  const cell=value=>'"'+String(value ?? '').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  return [config.columns.map(c=>c.label),...rows.map(row=>config.columns.map(col=>row[col.key]))].map(row=>row.map(cell).join(',')).join('\r\n');
}

export function mountMoneyConnectionsPreview(el,config,graph,{blocked=false,onBlockedChange=()=>{}}={}) {
  let query=previewParseQuery(new URLSearchParams(location.search)),hidden=new Set(),density=config.density;
  let page,all,columns,constants;
  const track=event=>dispatchEvent(new CustomEvent('opax:analytics',{detail:{event,properties:{table_id:config.id,page_type:config.pageType}}}));
  function save() {
    const url=new URL(location.href);
    for(const key of [...url.searchParams.keys()])if(key.startsWith('c.'))url.searchParams.delete(key);
    for(const [key,value] of new URLSearchParams(previewSerializeQuery(query)))url.searchParams.append(key,value);
    const clean=cleanMoneyConnectionsParams(url.searchParams,graph);
    history.replaceState(history.state,'',url.pathname+(clean.params.size?'?'+clean.params:'')+url.hash);
  }
  function render() {
    const safe=cleanMoneyConnectionsQuery(query,graph);query=safe.query;blocked ||= safe.blocked;
    const rows=blocked?[]:config.rows;
    page=previewApplyQuery(rows,config,query);query.page=page.page;query.pageSize=page.pageSize;
    all={rows:previewFilteredRows(rows,config,query)};
    const sort=query.sort || config.defaultSort;
    constants=config.columns.filter(c=>c.hideWhenConstant && new Set(rows.map(r=>r[c.key])).size===1);
    columns=config.columns.filter(c=>!hidden.has(c.key) && !constants.includes(c));
    const search=`<label class="visually-hidden" for="c-search">Search connections</label><input id="c-search" class="ui-input" type="search" placeholder="Search connections" maxlength="200" value="${esc(query.q)}">`;
    const filters=config.columns.filter(c=>c.facet && !constants.includes(c)).map(col=>col.facet==='range'
      ? `<label>${esc(col.label)}<span class="mc-range"><input class="ui-input" type="number" min="0" placeholder="Min" aria-label="Minimum ${esc(col.label.toLowerCase())}" data-range="${col.key}" data-bound="min" value="${esc(query.filters?.[col.key]?.min)}"><input class="ui-input" type="number" min="0" placeholder="Max" aria-label="Maximum ${esc(col.label.toLowerCase())}" data-range="${col.key}" data-bound="max" value="${esc(query.filters?.[col.key]?.max)}"></span></label>`
      : `<label>${esc(col.label)}<select class="ui-input" data-facet="${col.key}" ${col.facet==='multi'?'multiple size="4"':''}><option value="">Any</option>${(page.facets[col.key] || []).map(f=>`<option value="${esc(f.value)}" ${(query.filters?.[col.key] || []).includes(f.value)?'selected':''}>${esc(f.value)} (${count(f.count)})</option>`).join('')}</select></label>`).join('');
    const chips=constants.map(col=>`<span class="mc-chip" title="${esc(col.label)}">${esc(rows[0][col.key])}</span>`).join('')
      + Object.entries(query.filters || {}).flatMap(([key,value])=>Array.isArray(value)?value.map(v=>button(`${esc(v)} ×`,`data-clear="${key}" aria-label="Remove ${esc(config.columns.find(c=>c.key===key)?.label)} filter"`))
        : [button(`${esc(config.columns.find(c=>c.key===key)?.label)} ${value.min ?? 'Any'}–${value.max ?? 'Any'} ×`,`data-clear="${key}"`)]).join('')
      + (query.q?button(`${esc(query.q)} ×`,'data-clear="q" aria-label="Remove search"'):'');
    el.innerHTML=`<div class="mc-toolbar" role="toolbar" aria-label="Connection table tools">${search}<details><summary>Filters</summary><div class="mc-filter-panel">${filters || '<p>No filters available.</p>'}</div></details><details><summary>Columns</summary><div class="mc-column-panel">${config.columns.filter(c=>!constants.includes(c)).map(col=>`<label><input type="checkbox" data-column="${col.key}" ${hidden.has(col.key)?'':'checked'} ${col.primary?'disabled':''}>${esc(col.label)}</label>`).join('')}</div></details>${button(densityIcon,`data-density aria-label="Compact rows" title="Compact rows" aria-pressed="${density==='compact'}"`)}${button('Export','data-export'+(!page.total?' disabled':''))}</div>
      <div class="mc-chips" aria-label="Table filters">${chips}${blocked || query.q || Object.keys(query.filters || {}).length?button('Clear all','data-clear-all'):''}</div><label class="mc-mobile-sort">Sort<select class="ui-input" data-sort-select>${config.columns.flatMap(col=>['desc','asc'].map(dir=>`<option value="${col.key}:${dir}" ${sort.key===col.key && sort.dir===dir?'selected':''}>${esc(col.label)} ${dir==='asc'?'↑':'↓'}</option>`)).join('')}</select></label><div class="mc-table">${dataTableHTML({...config,columns},page)}</div>
      <div class="mc-footer"><p role="status" aria-live="polite">${page.total?`Showing ${count((page.page-1)*page.pageSize+1)}–${count(Math.min(page.page*page.pageSize,page.total))} of ${count(page.total)}`:'No connections match these filters.'}</p><div>${button('Previous',`data-page="${page.page-1}" ${page.page===1?'disabled':''}`)}${button('Next',`data-page="${page.page+1}" ${page.page*page.pageSize>=page.total?'disabled':''}`)}</div><label>Rows<select class="ui-input" data-page-size>${[25,50,100,200].map(n=>`<option ${n===page.pageSize?'selected':''}>${n}</option>`).join('')}</select></label></div><span class="fineprint" data-feedback role="status"></span>`;
    el.dataset.density=density;
    const table=el.querySelector('table');table.setAttribute('aria-labelledby','money-connections-heading');
    table.querySelector('caption').className='visually-hidden';
    table.querySelectorAll('th').forEach((th,i)=>{const col=columns[i];th.dataset.key=col.key;th.setAttribute('aria-sort',sort.key===col.key?sort.dir==='asc'?'ascending':'descending':'none');th.innerHTML=button(`${esc(col.label)}${sort.key===col.key?sort.dir==='asc'?' ↑':' ↓':''}`,`data-sort="${col.key}"`);});
    const heading=document.createElement('th');heading.scope='col';heading.innerHTML='<span class="visually-hidden">Actions</span>';table.querySelector('thead tr').append(heading);
    const max=Math.max(1,...all.rows.map(r=>r.value));
    table.querySelectorAll('tbody tr').forEach((tr,index)=>{
      const row=page.rows[index];tr.querySelectorAll('td').forEach((td,i)=>{
        const col=columns[i];td.dataset.label=col.label;td.dataset.key=col.key;
        if(col.primary){td.classList.add('mc-primary');td.innerHTML=`<a href="${esc(config.primaryLink(row))}">${esc(row[col.key])}</a>`;}
        if(col.type==='money') {td.classList.add('mc-value');td.title=exact(row[col.key]);td.innerHTML=`<strong>${shortMoney(row[col.key])}</strong><span class="mc-bar" aria-hidden="true"><span style="width:${100*row[col.key]/max}%"></span></span>`;}
        if(col.type==='count') {td.classList.add('mc-number');td.textContent=count(row[col.key]);}
      });
      const action=document.createElement('td');action.className='mc-action';action.innerHTML=button(focusIcon,`data-focus="${esc(row.focusId)}" title="Focus in map" aria-label="Focus in map"`);tr.append(action);
    });
    save();
  }
  function updateQuery(event) {
    const target=event.target;let changed=false;
    if(target.id==='c-search'){query.q=target.value;changed=true;}
    if(target.dataset.facet){const key=target.dataset.facet,values=[...target.selectedOptions].map(o=>o.value).filter(Boolean);query.filters ||= {};if(values.length)query.filters[key]=values;else delete query.filters[key];changed=true;}
    if(target.dataset.range){const key=target.dataset.range;query.filters ||= {};const range=query.filters[key] ||= {};if(target.value!=='' && Number.isFinite(target.valueAsNumber))range[target.dataset.bound]=target.valueAsNumber;else delete range[target.dataset.bound];if(!Object.keys(range).length)delete query.filters[key];changed=true;}
    if(target.hasAttribute('data-page-size')){query.pageSize=Number(target.value);changed=true;}
    if(target.hasAttribute('data-sort-select')){const [key,dir]=target.value.split(':');query.sort={key,dir};query.page=1;save();render();track('table_sort');return;}
    if(target.dataset.column){target.checked?hidden.delete(target.dataset.column):hidden.add(target.dataset.column);render();return;}
    if(changed){blocked=false;query.page=1;const safe=cleanMoneyConnectionsQuery(query,graph);query=safe.query;blocked=safe.blocked;onBlockedChange(blocked);save();render();track('table_filter');}
  }
  function click(event) {
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.sort){const old=query.sort || config.defaultSort;query.sort={key:b.dataset.sort,dir:old.key===b.dataset.sort && old.dir==='desc'?'asc':'desc'};query.page=1;save();render();track('table_sort');}
    if(b.dataset.page){query.page=Number(b.dataset.page);save();render();}
    if(b.hasAttribute('data-density')){density=density==='compact'?'comfortable':'compact';render();}
    if(b.dataset.clear || b.hasAttribute('data-clear-all')){if(b.hasAttribute('data-clear-all')){query.q='';query.filters={};}else if(b.dataset.clear==='q')query.q='';else delete query.filters[b.dataset.clear];blocked=false;onBlockedChange(false);query.page=1;save();render();track('table_filter');}
    if(b.hasAttribute('data-export')) {const blob=new Blob([previewCSV(all.rows,config)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=config.export.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);el.querySelector('[data-feedback]').textContent='Connections exported.';track('table_export');}
  }
  const pop=()=>{const clean=cleanMoneyConnectionsParams(new URLSearchParams(location.search),graph);query=previewParseQuery(clean.params);blocked=clean.blocked;onBlockedChange(blocked);render();};
  // Apply search on change/Enter to keep the focused field stable while typing.
  const keydown=e=>{if(e.key==='Enter' && e.target.id==='c-search'){e.preventDefault();updateQuery(e);}};
  el.addEventListener('change',updateQuery);el.addEventListener('keydown',keydown);el.addEventListener('click',click);window.addEventListener('popstate',pop);
  render();
  return {destroy(){el.removeEventListener('change',updateQuery);el.removeEventListener('keydown',keydown);el.removeEventListener('click',click);window.removeEventListener('popstate',pop);}};
}
