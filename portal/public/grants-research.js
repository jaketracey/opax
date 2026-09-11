const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('en-AU', {style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
const compact = n => new Intl.NumberFormat('en-AU', {style:'currency',currency:'AUD',notation:'compact',maximumFractionDigits:1}).format(n);
const date = s => s ? new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s)) : '';
const stateNames = {NSW:'New South Wales',VIC:'Victoria',QLD:'Queensland',SA:'South Australia',WA:'Western Australia',TAS:'Tasmania',NT:'Northern Territory',ACT:'ACT'};
const pinIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const mounts = new WeakMap();
export function activeProjects(data) { return data.projects.filter(p => p.status !== 'Withdrawn'); }
export function byState(projects) { return Object.entries(stateNames).map(([id,name]) => ({id,name,value:projects.filter(p=>p.state===id).reduce((s,p)=>s+p.value,0)})); }
export function selectProjects(data, {query='',state='',stage='invitations'} = {}) {
  const rows = stage === 'awards' ? data.awards.map(p => ({id:p.ga_id,title:p.activity,value:p.value,state:p.delivery_state||'',status:'Published award',date:p.publish_date,recipient:p.recipient||'',source_url:p.source_url})) : activeProjects(data);
  return rows.filter(p => (!state || p.state===state) && (!query || [p.title,p.id,p.lga].join(' ').toLowerCase().includes(query.toLowerCase())));
}
export function recordsWithLocations(data, locations, stage='awards') {
  const evidence = new Map((locations?.records || []).map(p => [p.id,p]));
  return selectProjects(data,{stage}).map(p => {
    const candidate = evidence.get(p.id);
    const verified = candidate?.verification?.status==='verified' && candidate.record_type===(stage==='awards'?'award':'invitation') ? candidate : null;
    const sites = (verified?.sites || []).filter(verifiedSite);
    return {...p, original_title:p.title, record_type:stage==='awards'?'award':'invitation',
      title:verified?.title || p.title, source_url:verified?.source_url || p.source_url,
      recipient:verified?.recipient || p.recipient || '', state:verified?.state || p.state, locality:verified?.locality || '', sites, verification:verified?.verification,
      linked_invitation_ids:verified?.invitation_ids || [], linked_award_ids:verified?.award_ids || []};
  });
}
export function filterRecords(records,{query='',state=''}={}) {
  const words = query.trim().toLocaleLowerCase('en-AU').split(/\s+/).filter(Boolean);
  return records.filter(p => (!state || p.state===state || p.sites.some(s=>s.state===state)) &&
    words.every(word => [p.title,p.original_title,p.id,p.lga,p.locality,p.recipient,p.program,...p.sites.flatMap(s=>[s.site_name,s.address,s.electorate_2025])].join(' ').toLocaleLowerCase('en-AU').includes(word)));
}
export function locationCoverage(records) {
  const mapped = records.filter(p=>p.sites.length);
  return {records:records.length,mapped:mapped.length,sites:mapped.reduce((n,p)=>n+p.sites.length,0),value:mapped.reduce((n,p)=>n+p.value,0)};
}
export function historicalRecords(history) {
  const seen=new Set();
  return (history?.records||[]).filter(p=>p.record_type==='award' && p.verification?.status==='verified' && !seen.has(p.id) && seen.add(p.id)).map(p=>({
    ...p, original_title:p.activity||p.title, date:p.publish_date, state:p.state||'', locality:p.locality||'',
    sites:(p.sites||[]).filter(verifiedSite), linked_award_ids:[], linked_invitation_ids:[],
  }));
}
export function publicationYears(records) {
  const years=records.map(p=>/^\d{4}-\d{2}-\d{2}/.test(p.date||'')?Number(p.date.slice(0,4)):NaN).filter(Number.isFinite);
  return years.length?{min:Math.min(...years),max:Math.max(...years)}:null;
}
export function publishedThrough(records,year) {
  if(!year)return records;
  return records.filter(p=>/^\d{4}-\d{2}-\d{2}/.test(p.date||'') && p.date.slice(0,10)<=`${year}-12-31`);
}
export function yearDiscovery(records, year) {
  const visible=publishedThrough(records,year);
  return {visible, firstPublished:visible.filter(p=>Number(p.date?.slice(0,4))===year),
    later:records.filter(p=>/^\d{4}-\d{2}-\d{2}/.test(p.date||'') && Number(p.date.slice(0,4))>year).length};
}
export function projectToShow(records, selectedId, preferredId) {
  return records.find(p=>p.id===selectedId) || records.find(p=>p.id===preferredId) ||
    records.find(p=>p.sites.length) || records[0] || null;
}
function chart(rows,{baseline=false}={}) {
  const max=Math.max(1,...rows.flatMap(r=>[r.value??r.actual,r.expected||0]));
  return `<div class="allocation-bars">${rows.map(r=>`<div class="allocation-bar-row"><div class="allocation-bar-label"><span>${esc(r.name)}</span><strong>${compact(r.value??r.actual)}</strong></div><div class="allocation-track" aria-hidden="true"><span style="width:${100*(r.value??r.actual)/max}%"></span>${baseline?`<i style="left:${100*r.expected/max}%"></i>`:''}</div>${baseline?`<small>${money(r.expected)} if shared in proportion to seat numbers</small>`:''}</div>`).join('')}</div>`;
}
function verifiedSite(s) {
  return s.verification?.status==='verified' && Number.isFinite(s.latitude) && Math.abs(s.latitude)<=90 && Number.isFinite(s.longitude) && Math.abs(s.longitude)<=180 && /^https:\/\//.test(s.location_source_url||'');
}
export function mountGrantsResearch(root,{focus=false}={}) {
  mounts.get(root)?.destroy();
  const controller = new AbortController(); let map=null, destroyed=false, searchTimer;
  const instance = {ready:null,destroy(){if(destroyed)return;destroyed=true;controller.abort();clearTimeout(searchTimer);map?.destroy();}};
  mounts.set(root,instance);
  instance.ready=(async()=>{
  root.innerHTML='<p role="status">Opening community projects…</p>';
  let data, locations=null, historyData=null;
  try {
    const results=await Promise.all([
      fetch('/research/mlci.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}),
      fetch('/research/grant-locations.json',{signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/research/grants-history.json',{signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]); [data,locations,historyData]=results;
  } catch { if(!destroyed)root.innerHTML='<p role="alert">The grant records could not be loaded. Please reload to try again.</p>';return instance; }
  if(destroyed || root.closest('[hidden]'))return;
  document.title='Where community funding goes · Reports · OPAX';
  root.innerHTML=`<div class="allocation-intro"><h1 tabindex="-1">Where community funding goes</h1><p>See what a grant was for, who it was awarded to and where the project is.</p></div>
    <section class="allocation-start" aria-label="Start with a real project"><h2>Start with a real project</h2><div id="allocation-examples"></div></section>
    <section class="allocation-explorer" aria-label="Find community funding">
      <div class="allocation-map-layout" id="allocation-map-layout"><aside class="allocation-detail" id="allocation-detail" aria-label="Selected project"></aside><div class="allocation-map-column"><p id="allocation-map-caption" class="allocation-map-caption"></p><div class="allocation-map-frame"><div id="allocation-map" aria-label="Map of verified project sites"></div><div class="allocation-map-actions"><button class="secondary" id="allocation-fit" type="button">Show all sites</button><button class="secondary" id="allocation-move" type="button" aria-pressed="false">Move map</button></div><div id="allocation-map-empty" class="allocation-map-empty" hidden><h3>No project sites mapped here yet</h3><p>You can still explore the funding records for this view.</p><button class="secondary" type="button" data-action="list">See matching records</button></div></div><p id="allocation-map-status" class="allocation-map-status" role="status" hidden></p></div></div>
      <h2 class="allocation-browse-heading">Explore more projects</h2>
      <label class="allocation-collection">Explore<select id="allocation-collection"><option value="community">Community infrastructure</option><option value="history">Earlier grants</option><option value="invitations">Invited projects</option></select></label>
      <p id="allocation-stage-note" class="allocation-stage-note"></p>
      <div class="allocation-controls"><label class="allocation-search">Find a place or project<input id="allocation-query" type="search" placeholder="Town, project or council" autocomplete="off"></label><label class="allocation-state">State or territory<select id="allocation-state"><option value="">Across Australia</option>${Object.entries(stateNames).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><div class="allocation-view-switch" role="group" aria-label="Display"><button type="button" data-view="map" aria-pressed="true">Map</button><button type="button" data-view="list" aria-pressed="false">List</button></div></div>
      <div class="allocation-viewbar"><p id="allocation-result-count" role="status" aria-live="polite"></p></div>
      <p id="allocation-coverage" class="allocation-coverage"></p>

      <div class="allocation-timeline" id="allocation-timeline"><div><label for="allocation-year">Show grants published by the end of <output id="allocation-year-label" for="allocation-year"></output></label><button type="button" class="text-link" id="allocation-latest">All years</button></div><input id="allocation-year" type="range" step="1" aria-describedby="allocation-time-note allocation-year-summary"><div class="allocation-year-ends" aria-hidden="true"><span id="allocation-first-year"></span><span id="allocation-last-year"></span></div><div class="allocation-year-navigation"><button type="button" class="secondary" id="allocation-year-previous">Previous year</button><button type="button" class="secondary" id="allocation-year-next">Next year</button></div><div id="allocation-year-summary" role="status" aria-live="polite" aria-atomic="true"></div><div id="allocation-year-projects"></div><p id="allocation-time-note">These are selected examples. Amounts are the latest recorded award values, including any later updates; they do not show payments made that year.</p></div>

      <div id="allocation-projects"></div><div class="allocation-list-actions"><button class="secondary" id="allocation-more" hidden>Show more projects</button><button class="text-link" id="allocation-export">Download these records</button></div>
    </section>
    <details class="allocation-comparison"><summary>Compare the wider picture<span>States and closely contested seats</span></summary><div class="allocation-comparison-body"><h2>How invitations were shared</h2><p>These comparisons use the department’s November 2025 invitation list.</p><div class="allocation-controls"><label>Compare by<select id="allocation-lens"><option value="states">State and territory</option><option value="seats">How close the election was</option></select></label></div><div id="allocation-chart"></div><p id="allocation-chart-note" class="fineprint"></p><details class="allocation-seat-fold"><summary>Look up an electorate’s election margin</summary><p>These margins describe seats before the 2025 federal election.</p><label class="allocation-seat-picker">Electorate<select id="allocation-seat">${data.seats.map(s=>`<option value="${esc(s.name)}">${esc(s.name)} · ${s.state}</option>`).join('')}</select></label><div id="allocation-seat-detail"></div></details></div></details>
    <details class="allocation-method"><summary>About the data and sources</summary><p>This report follows the Major and Local Community Infrastructure Program. It includes ${activeProjects(data).length} active invitations from 14 November 2025 and ${data.awards.length} published awards collected ${date(data.as_of?.slice(0,10)||'2026-09-09')}. They are separate snapshots: invitations and awards must not be added together.</p><p>Map pins identify project venues checked against original sources. Some venue geometry is from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>; individual records identify these sources. Each pin opens its location evidence. Records with unconfirmed sites remain in the list. For a grant covering several places, the amount is the whole grant and is counted once. The map does not show payments or confirm that construction is complete.</p><p>A recipient’s office address or postcode is not treated as the project site. Some awards have no recorded delivery state and appear only when viewing all states.</p><p>The seat comparison reproduces the Centre for Public Integrity’s published Table 3, including its by-election adjustments and Brisbane exception. Opax has not independently reproduced it from every project’s location. The electorate picker uses the AEC’s unadjusted 2025 baseline.</p><p>The earlier-grants view is a selection of sourced project examples from other programs, not a complete national or state total. Its year slider uses each notice’s original publication year, with the latest known award value. It does not reconstruct the record as it stood that year.</p><p>A difference in funding does not establish that a project lacked merit. The government describes this program as delivering election commitments. Assessment scores and unsuccessful applications would be needed to test merit.</p><ul><li><a href="${esc(data.sources.department)}#page=160" target="_blank" rel="noopener">Departmental invitation list</a> (one withdrawn project excluded)</li><li><a href="${esc(data.sources.cpi_landing)}" target="_blank" rel="noopener">Centre for Public Integrity report</a></li><li><a href="${esc(data.sources.aec)}" target="_blank" rel="noopener">AEC seat status, 2025 election</a></li><li><a href="/money/grants">All GrantConnect awards in Opax</a></li></ul></details>`;
  const get=id=>root.querySelector('#'+id);
  const params=new URLSearchParams(location.search);
  let collection=params.get('stage')==='invitations'?'invitations':params.get('collection')==='history'?'history':'community';
  let stage=collection==='invitations'?'invitations':'awards', view=params.get('view')==='list'?'list':'map';
  let cutoffYear=/^\d{4}$/.test(params.get('through')||'')?Number(params.get('through')):null;
  let shown=12, filtered=[], selectedId=params.get('project'), selectedOrigin='row', mapReady=false, overview=false;
  const preferred=()=>collection==='history'?'GA6602':collection==='community'?'GA575257':null;
  const examples=[['GA6602','history','Basketball courts in Willetton'],['GA34203','history','An aircraft museum in Longreach'],['GA575257','community','Playgrounds in Pambula']].map(([id,group,label])=>({group,label,record:(group==='history'?historicalRecords(historyData):recordsWithLocations(data,locations)).find(p=>p.id===id)})).filter(p=>p.record?.sites.length);
  get('allocation-examples').innerHTML=examples.map(({record,label})=>`<button type="button" class="allocation-example" data-example="${esc(record.id)}"><span>${esc(label)}</span><strong>${compact(record.value)} award</strong><small>See the project and source</small></button>`).join('');
  root.querySelector('.allocation-start').hidden=!examples.length;
  const historicYears=publicationYears(historicalRecords(historyData));
  if(historicYears)get('allocation-collection').querySelector('[value=history]').textContent=`Earlier grants (${historicYears.min}–${historicYears.max})`;
  get('allocation-query').value=params.get('q')||'';
  if(stateNames[params.get('state')])get('allocation-state').value=params.get('state');
  function updateUrl() {
    if(destroyed)return;
    const next=new URL(location.href);
    for(const key of ['q','state','stage','view','collection','through','project'])next.searchParams.delete(key);
    if(get('allocation-query').value.trim())next.searchParams.set('q',get('allocation-query').value.trim());
    if(get('allocation-state').value)next.searchParams.set('state',get('allocation-state').value);
    if(stage!=='awards')next.searchParams.set('stage',stage);
    if(view!=='map')next.searchParams.set('view',view);
    if(collection==='history')next.searchParams.set('collection','history');
    if(cutoffYear&&stage==='awards')next.searchParams.set('through',String(cutoffYear));
    if(selectedId)next.searchParams.set('project',selectedId);
    history.replaceState(history.state,'',next);
  }
  const stageName=()=>stage==='invitations'?'invited projects':collection==='history'?'featured grants':'published grants';
  function drawDetail(record) {
    const panel=get('allocation-detail');
    panel.classList.toggle('has-project',!!record);
    get('allocation-map-caption').textContent=record?.sites.length
      ? `Project location: ${record.sites.map(s=>s.site_name).join(' and ')}` : 'Verified project locations';
    if(!record){panel.innerHTML=`<div class="allocation-detail-intro">${pinIcon}<h2>${filtered.length?'Choose a project to see its funding':'No matching projects'}</h2><p>${filtered.length?'Open a named project below or choose a pin on the map.':'Try another place, state or year.'}</p></div>`;return;}
    const place=[record.locality || record.lga,stateNames[record.state]||record.state].filter(Boolean).join(', ');
    panel.innerHTML=`<button type="button" class="allocation-detail-close" aria-label="Close project details">×</button>
      <p class="allocation-detail-place">${esc(place||'Project location being checked')}</p>
      <h2 tabindex="-1">${esc(record.title)}</h2>
      <div class="allocation-detail-money"><strong>${money(record.value)}</strong><span>${stage==='awards'?'Latest recorded grant award':'Invitation to apply for funding'}${record.sites.length>1?' · whole grant':''}</span>${record.sites.length>1?'<small>The amount covers all sites; individual shares are not recorded.</small>':''}</div>
      <div class="allocation-purpose"><h3>What ${stage==='awards'?'the grant was':'the funding would be'} for</h3><p class="allocation-description">${esc(record.original_title||record.title)}</p></div>
      <dl class="allocation-facts">${record.recipient?`<div><dt>${stage==='awards'?'Awarded to':'Applicant'}</dt><dd>${esc(record.recipient)}</dd></div>`:''}${record.date?`<div><dt>First published</dt><dd>${date(record.date)}</dd></div>`:''}${record.program?`<div><dt>Grant program</dt><dd>${esc(record.program)}</dd></div>`:''}</dl>
      <p class="allocation-stage-caution">${stage==='awards'?'An award records approved funding. It does not confirm payment or completed works.':'An invitation is a chance to apply, not an awarded grant.'}</p>
      <a class="allocation-source-link" href="${esc(record.source_url)}" target="_blank" rel="noopener">Read the original ${stage==='awards'?'grant award':'invitation'} <span aria-hidden="true">↗</span></a>
      ${record.sites.length?`<details class="allocation-site-fold"><summary>${record.sites.length>1?record.sites.length+' project locations':'Project location and evidence'}</summary><div class="allocation-sites">${record.sites.map(s=>`<div>${pinIcon}<div><strong>${esc(s.site_name)}</strong><p>${esc(s.address)}</p>${s.electorate_2025?`<p>${esc(s.electorate_2025)} electorate (2025)</p>`:''}<a href="${esc(s.location_source_url)}" target="_blank" rel="noopener">Check the location</a></div></div>`).join('')}</div></details>`:'<p class="allocation-unlocated">The project site has not been verified yet. This record is not pinned to an office address.</p>'}`;
    panel.querySelector('.allocation-detail-close').onclick=()=>{const previous=selectedId;selectedId=null;overview=true;map?.select(null,false);map?.fitAll();drawDetail(null);drawRows();updateUrl();panel.hidden=view==='list';if(selectedOrigin==='pin'&&view==='map')map?.focus(previous);else root.querySelector(`[data-record="${CSS.escape(previous)}"]`)?.focus({preventScroll:true});};
  }
  function choose(id,origin='row') {
    const record=filtered.find(p=>p.id===id); if(!record)return;
    selectedId=id;overview=false;selectedOrigin=origin;drawDetail(record);map?.select(id);drawRows();updateUrl();
    get('allocation-detail').hidden=false;
    const heading=get('allocation-detail').querySelector('h2'), box=heading?.getBoundingClientRect();
    const headerHeight=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'))||96;
    if(box&&(box.top<headerHeight+16||box.bottom>innerHeight-80))heading.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    heading?.focus({preventScroll:true});
  }
  function drawRows() {
    const rows=view==='map'?filtered.filter(p=>p.sites.length):filtered;
    for(const button of root.querySelectorAll('[data-example]'))button.setAttribute('aria-pressed',String(button.dataset.example===selectedId));
    for(const button of root.querySelectorAll('[data-year-project]'))button.setAttribute('aria-pressed',String(button.dataset.yearProject===selectedId));
    get('allocation-projects').innerHTML=rows.length?`<h2 class="allocation-results-heading">${view==='map'?'Projects on this map':'Matching records'}</h2><div class="allocation-results-grid">${rows.slice(0,shown).map(p=>`<button type="button" class="allocation-project${p.id===selectedId?' is-selected':''}" data-record="${esc(p.id)}" aria-pressed="${p.id===selectedId}"><span><strong>${esc(p.title)}</strong><small>${esc([p.locality||p.lga,stateNames[p.state]||p.state].filter(Boolean).join(', ') )||'Delivery state not recorded'}</small><span class="allocation-location-label">${p.sites.length?`${pinIcon}${p.sites.length>1?p.sites.length+' sites':'Site located'}`:'Location being checked'}</span></span><b>${compact(p.value)}</b></button>`).join('')}</div>`:(view==='list'?'<p class="allocation-no-results">No records match. Try a different place, project or state.</p>':'');
    for(const button of get('allocation-projects').querySelectorAll('[data-record]'))button.onclick=()=>choose(button.dataset.record);
    get('allocation-more').hidden=shown>=rows.length;
  }
  function draw(reset=true,animate=false,preserveMap=false) {
    if(destroyed)return;
    if(reset)shown=12;
    const fullRecords=collection==='history'?historicalRecords(historyData):recordsWithLocations(data,locations,stage);
    const years=stage==='awards'?publicationYears(fullRecords):null;
    if(years&&cutoffYear)cutoffYear=Math.max(years.min,Math.min(years.max,cutoffYear));
    if(!years||cutoffYear===years.max)cutoffYear=null;
    const records=stage==='awards'?publishedThrough(fullRecords,cutoffYear):fullRecords;
    get('allocation-collection').value=collection;
    get('allocation-timeline').hidden=!years||years.min===years.max;
    if(years){const slider=get('allocation-year');slider.min=years.min;slider.max=years.max;slider.value=cutoffYear||years.max;slider.disabled=years.min===years.max;slider.setAttribute('aria-valuetext',`Grants published through ${slider.value}`);get('allocation-year-label').textContent=slider.value;get('allocation-first-year').textContent=years.min;get('allocation-last-year').textContent=years.max;get('allocation-latest').disabled=!cutoffYear;}
    filtered=filterRecords(records,{query:get('allocation-query').value,state:get('allocation-state').value});
    if(!filtered.some(p=>p.id===selectedId))selectedId=overview?null:projectToShow(filtered,null,preferred())?.id||null;
    if(years){
      const chosenYear=cutoffYear||years.max, scoped=filterRecords(fullRecords,{query:get('allocation-query').value,state:get('allocation-state').value});
      const discovery=yearDiscovery(scoped,chosenYear);
      get('allocation-year-previous').disabled=chosenYear<=years.min;get('allocation-year-next').disabled=chosenYear>=years.max;
      get('allocation-year-summary').innerHTML=`<strong>${discovery.firstPublished.length?`${discovery.firstPublished.length} ${discovery.firstPublished.length===1?'award first appeared':'awards first appeared'} in ${chosenYear}`:`No matching awards first appeared in ${chosenYear}`}</strong><p>${filtered.length} ${collection==='history'?'selected examples':'matching awards'} published by then.${discovery.later?` ${discovery.later} later ${discovery.later===1?'award is':'awards are'} hidden.`:''}</p>`;
      get('allocation-year-projects').innerHTML=discovery.firstPublished.slice(0,4).map(p=>`<button type="button" class="allocation-year-project" data-year-project="${esc(p.id)}"><span>${esc(p.title)}</span><strong>${compact(p.value)}</strong><small>See this project</small></button>`).join('')+(discovery.firstPublished.length>4?`<p>${discovery.firstPublished.length-4} more awards from this year are in the records below.</p>`:'');
    }
    const coverage=locationCoverage(filtered), unknown=records.filter(p=>!p.state).length;
    for(const b of root.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
    get('allocation-stage-note').textContent=collection==='history'?(historyData?'A selection from other grant programs, with verified project sites.':'The earlier records could not load. Please reload to try again.'):stage==='awards'?'Published funding awards, not payments or completed works.':'Projects invited to apply in November 2025. An invitation does not confirm a grant.';
    get('allocation-result-count').innerHTML=`<strong>${compact(filtered.reduce((n,p)=>n+p.value,0))}</strong> across ${collection==='history'?'':'all '}${filtered.length} ${stageName()}`;
    get('allocation-coverage').innerHTML=`${view==='map'?`${coverage.mapped<coverage.records?compact(coverage.value)+' mapped: ':''}${coverage.mapped} ${stage==='awards'?'grants':'invitations'} at ${coverage.sites} sites. <button type="button" class="text-link" data-action="list">See all records</button>`:`${coverage.mapped} records have a verified site.`}${get('allocation-state').value&&unknown?`<span class="allocation-unknown-state">${unknown} records have no recorded state. <button type="button" class="text-link" data-action="all-states">Include all states</button></span>`:''}`;
    if(!locations&&collection!=='history')get('allocation-coverage').textContent='Location data could not be loaded. The funding records are still available in the list.';
    get('allocation-map-layout').classList.toggle('is-list-view',view==='list');
    get('allocation-detail').hidden=view==='list'&&!selectedId;
    get('allocation-map-empty').hidden=coverage.mapped>0;
    if(mapReady){map.resize();map.update(filtered.filter(p=>p.sites.length),animate,preserveMap);if(selectedId)map.select(selectedId,false,preserveMap);}
    drawDetail(filtered.find(p=>p.id===selectedId));drawRows();
    updateUrl();
  }
  get('allocation-collection').onchange=()=>{overview=false;collection=get('allocation-collection').value;stage=collection==='invitations'?'invitations':'awards';cutoffYear=null;selectedId=null;draw(true,true);};
  const changeYear=(year,preview=false)=>{
    cutoffYear=year;overview=false;
    const all=collection==='history'?historicalRecords(historyData):recordsWithLocations(data,locations,stage);
    const scoped=filterRecords(all,{query:get('allocation-query').value,state:get('allocation-state').value});
    const finding=yearDiscovery(scoped,year);
    selectedId=(finding.firstPublished[0]||projectToShow(finding.visible,selectedId,preferred()))?.id||null;
    draw(true,!preview,preview);
  };
  get('allocation-year').oninput=()=>changeYear(Number(get('allocation-year').value),true);
  get('allocation-year').onchange=()=>draw(true,true);
  const stepYear=delta=>changeYear(Number(get('allocation-year').value)+delta);
  get('allocation-year-previous').onclick=()=>stepYear(-1);get('allocation-year-next').onclick=()=>stepYear(1);
  for(const b of root.querySelectorAll('[data-example]'))b.onclick=()=>{const example=examples.find(p=>p.record.id===b.dataset.example);collection=example.group;stage='awards';cutoffYear=null;overview=false;selectedId=example.record.id;get('allocation-query').value='';get('allocation-state').value='';view='map';draw(true,true);choose(selectedId);};
  get('allocation-year-projects').onclick=e=>{const b=e.target.closest('[data-year-project]');if(b)choose(b.dataset.yearProject);};
  get('allocation-latest').onclick=()=>{cutoffYear=null;draw(true,true);};
  for(const b of root.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;draw();};
  root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='list'){view='list';draw();}if(b.dataset.action==='all-states'){get('allocation-state').value='';draw();}},{signal:controller.signal});
  get('allocation-state').onchange=()=>{overview=false;draw(true,true);};
  get('allocation-query').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(!destroyed){overview=false;draw();}},180);};
  get('allocation-more').onclick=()=>{shown+=12;drawRows();};
  get('allocation-fit').onclick=()=>{selectedId=null;overview=true;drawDetail(null);drawRows();updateUrl();map?.fitAll();map?.select(null,false);};
  get('allocation-move').onclick=()=>{const b=get('allocation-move'),enabled=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(enabled));b.textContent=enabled?'Done moving':'Move map';map?.setMovable(enabled);};
  get('allocation-export').onclick=()=>{
    const cell=s=>'"'+String(s??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
    const csv=[['Record','Project','State','Value AUD (current record)','Stage','Published','Program','Project sites','Location sources','Source'],...filtered.map(p=>[p.id,p.title,p.state,p.value,stage==='awards'?'Published grant':'Invitation',p.date,p.program||'Major and Local Community Infrastructure Program',p.sites.map(s=>s.site_name).join('; '),p.sites.map(s=>s.location_source_url).join('; '),p.source_url])].map(row=>row.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`opax-grants-${collection}${cutoffYear?'-through-'+cutoffYear:''}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function drawChart(){const seats=get('allocation-lens').value==='seats';get('allocation-chart').innerHTML=chart(seats?data.cpi_comparison:byState(activeProjects(data)),{baseline:seats});get('allocation-chart-note').innerHTML=seats?`Navy bars show invitation amounts. Gold marks show a share based on seat numbers. <a href="${esc(data.sources.cpi)}#page=11" target="_blank" rel="noopener">CPI comparison, Table 3</a>.`:`Calculated from the department’s active invitations. <a href="${esc(data.sources.department)}#page=160" target="_blank" rel="noopener">Read the list</a>.`;}
  function drawSeat(){const s=data.seats.find(s=>s.name===get('allocation-seat').value);get('allocation-seat-detail').innerHTML=`<div class="allocation-seat-facts"><strong>${esc(s.name)}</strong><span>${esc(stateNames[s.state])}</span><span>${esc({M:'Marginal',FS:'Fairly safe',S:'Safe'}[s.status])} · ${s.margin.toFixed(2)} percentage-point margin</span><a href="${esc(data.sources.aec)}#page=${s.page}" target="_blank" rel="noopener">Read the AEC record</a></div>`;}
  get('allocation-lens').onchange=drawChart;get('allocation-seat').onchange=drawSeat;
  if(data.seats.some(s=>s.name===params.get('seat')))get('allocation-seat').value=params.get('seat');
  draw();drawChart();drawSeat();
  if(focus)root.querySelector('h1').focus();
  try {
    if(!document.querySelector('link[data-grants-map]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/grants-map.css?v=20260909-2';link.dataset.grantsMap='';document.head.appendChild(link);}
    const {mountGrantMap}=await import('/grants-map.js?v=20260909-2');
    if(destroyed)return instance;
    map=mountGrantMap(get('allocation-map'),{onSelect:id=>choose(id,'pin'),onTileError:()=>{get('allocation-map-status').hidden=false;get('allocation-map-status').textContent='The background map is unavailable. Project details and source links still work.';}});mapReady=true;draw();
  } catch {if(destroyed)return;get('allocation-map-status').hidden=false;get('allocation-map-status').textContent='The map could not open. Switch to List to explore the project records.';}
  })();
  return instance;
}
