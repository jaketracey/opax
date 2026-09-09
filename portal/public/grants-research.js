const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
const compact=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',notation:'compact',maximumFractionDigits:1}).format(n);
const stateNames={NSW:'New South Wales',VIC:'Victoria',QLD:'Queensland',SA:'South Australia',WA:'Western Australia',TAS:'Tasmania',NT:'Northern Territory',ACT:'ACT'};
export function activeProjects(data){return data.projects.filter(p=>p.status!=='Withdrawn');}
export function byState(projects){return Object.entries(stateNames).map(([id,name])=>({id,name,value:projects.filter(p=>p.state===id).reduce((s,p)=>s+p.value,0)}));}
export function selectProjects(data,{query='',state='',stage='invitations'}={}){
  const rows=stage==='awards'?data.awards.map(p=>({id:p.ga_id,title:p.activity,value:p.value,state:p.delivery_state||'',status:'Published award',date:p.publish_date,source_url:p.source_url})):activeProjects(data);
  return rows.filter(p=>(!state||p.state===state)&&(!query||[p.title,p.id,p.lga].join(' ').toLowerCase().includes(query.toLowerCase())));
}
function chart(rows,{baseline=false}={}){
  const max=Math.max(1,...rows.flatMap(r=>[r.value??r.actual,r.expected||0]));
  return `<div class="allocation-bars">${rows.map(r=>`<div class="allocation-bar-row"><div class="allocation-bar-label"><span>${esc(r.name)}</span><strong>${compact(r.value??r.actual)}</strong></div><div class="allocation-track" aria-hidden="true"><span style="width:${100*(r.value??r.actual)/max}%"></span>${baseline?`<i style="left:${100*r.expected/max}%"></i>`:''}</div>${baseline?`<small>${money(r.expected)} if shared in proportion to seat numbers · ${compact(r.actual-r.expected)} difference</small>`:''}</div>`).join('')}</div>`;
}
export async function mountGrantsResearch(root,{focus=false}={}){
  root.innerHTML='<p role="status">Opening grant records…</p>';
  let data;
  try{const response=await fetch('/research/mlci.json');if(!response.ok)throw new Error();data=await response.json();}
  catch{root.innerHTML='<p role="alert">The grant records could not be loaded. Please reload to try again.</p>';return;}
  if(root.hidden)return;
  document.title='Where community funding goes · Reports · OPAX';
  const active=activeProjects(data), total=active.reduce((s,p)=>s+p.value,0);
  root.innerHTML=`<div class="allocation-intro"><h1 tabindex="-1">Where community funding goes</h1><p>Follow the Major and Local Community Infrastructure Program, from invitations to published awards.</p><div class="allocation-source"><a href="${esc(data.sources.cpi_landing)}" target="_blank" rel="noopener">Public money, political advantage? ↗</a><span>Centre for Public Integrity · 8 September 2026</span></div></div>
    <div class="allocation-summary"><div><strong>${compact(total)}</strong><span>${active.length} active invitations · 14 Nov 2025</span></div><div><strong>${compact(data.awards.reduce((s,p)=>s+p.value,0))}</strong><span>${data.awards.length} published awards in Opax · 9 Sep 2026</span></div></div>
    <p class="allocation-note">These are different stages and snapshots. An invitation is not an award or payment. The totals should not be added together.</p>
    <section class="allocation-section"><h2>Compare the distribution</h2><div class="allocation-controls"><label>View<select id="allocation-lens"><option value="states">By state and territory</option><option value="seats">By seat competitiveness</option></select></label></div><div id="allocation-chart"></div><p id="allocation-chart-note" class="fineprint"></p></section>
    <section class="allocation-section"><h2>Look through the projects</h2><div class="allocation-controls"><label>Funding stage<select id="allocation-stage"><option value="invitations">Active invitations</option><option value="awards">Published awards</option></select></label><label>State or territory<select id="allocation-state"><option value="">All states and territories</option>${Object.entries(stateNames).map(([id,n])=>`<option value="${id}">${n}</option>`).join('')}</select></label><label class="allocation-search">Find a project<input id="allocation-query" type="search" placeholder="Project, council or record number"></label></div><p id="allocation-result-count" role="status" aria-live="polite"></p><button class="secondary" id="allocation-export">Download these records</button><div id="allocation-projects"></div><button class="secondary" id="allocation-more" hidden>Show more projects</button></section>
    <section class="allocation-section"><h2>Explore the seat baseline</h2><p>The AEC’s starting margins for the 2025 election. These describe the contest before that election, not who holds each seat today.</p><label class="allocation-seat-picker">Electorate<select id="allocation-seat">${data.seats.map(s=>`<option value="${esc(s.name)}">${esc(s.name)} · ${s.state}</option>`).join('')}</select></label><div id="allocation-seat-detail"></div></section>
    <details class="allocation-method"><summary>Sources and how to read this</summary><p>Opax extracted ${data.projects.length} project rows from the department’s list. One withdrawn proposal worth $1,656,000 is excluded. State totals are calculated from the remaining rows. Each project links to its source page.</p><p>The seat comparison reproduces CPI’s published Table 3. It has not been independently reproduced from project-level electorate matches. CPI applies four by-election results and a Brisbane exception; our seat picker shows the AEC’s unadjusted notional baseline.</p><p>More funding in a group of seats does not establish that an individual project lacked merit. The government describes the program as delivering election commitments. Assessment scores and unsuccessful applications would be needed to test merit directly.</p><p>Opax does not assign grants to electorates using a recipient’s postcode: an address can differ from the project site, and postcodes can cross seat boundaries. Awards without a recorded delivery state appear only under “All states and territories”.</p><ul><li><a href="${esc(data.sources.department)}#page=160" target="_blank" rel="noopener">Departmental project list, 14 November 2025</a></li><li><a href="${esc(data.sources.cpi)}#page=11" target="_blank" rel="noopener">CPI report and comparison table</a></li><li><a href="${esc(data.sources.aec)}" target="_blank" rel="noopener">AEC national seat status fact sheet</a></li><li><a href="/money/grants">GrantConnect awards in Opax</a></li></ul></details>`;
  const get=id=>root.querySelector('#'+id);
  function drawChart(){
    const seats=get('allocation-lens').value==='seats';
    get('allocation-chart').innerHTML=chart(seats?data.cpi_comparison:byState(active),{baseline:seats});
    get('allocation-chart-note').innerHTML=seats?`Navy: invitation value. Gold mark: share based on seat numbers. <a href="${esc(data.sources.cpi)}#page=11" target="_blank" rel="noopener">CPI analysis, Table 3 ↗</a>. A comparison baseline is not an entitlement to funding.`:`Calculated by Opax from the department’s active invitation list. <a href="${esc(data.sources.department)}#page=160" target="_blank" rel="noopener">Read the source ↗</a>`;
  }
  let shown=20,filtered=[];
  function drawProjects(reset=true){
    if(reset)shown=20;
    filtered=selectProjects(data,{query:get('allocation-query').value,state:get('allocation-state').value,stage:get('allocation-stage').value});
    get('allocation-result-count').textContent=`${filtered.length} records · ${money(filtered.reduce((s,p)=>s+p.value,0))}`;
    get('allocation-projects').innerHTML=filtered.length?filtered.slice(0,shown).map(p=>`<article class="allocation-project"><div><h3><a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(p.title)} ↗</a></h3><p>${esc([stateNames[p.state]||p.state||'Delivery state not recorded',p.lga,p.status,p.date,p.id.startsWith('GA')?p.id:null].filter(Boolean).join(' · '))}</p></div><strong>${money(p.value)}</strong></article>`).join(''):'<p>No projects match these filters.</p>';
    get('allocation-more').hidden=shown>=filtered.length;
  }
  function drawSeat(){const s=data.seats.find(s=>s.name===get('allocation-seat').value);get('allocation-seat-detail').innerHTML=`<div class="allocation-seat-facts"><strong>${esc(s.name)}</strong><span>${esc(stateNames[s.state])}</span><span>${esc({M:'Marginal',FS:'Fairly safe',S:'Safe'}[s.status])} · ${s.margin.toFixed(2)} percentage-point margin</span><span>${esc({ALP:'Labor',LP:'Liberal',NP:'Nationals',LNP:'LNP',IND:'Independent',GRN:'Greens',CA:'Centre Alliance',KAP:"Katter’s Australian Party"}[s.party])} · AEC notional baseline</span><a href="${esc(data.sources.aec)}#page=${s.page}" target="_blank" rel="noopener">Read this seat’s source ↗</a></div>`;}
  get('allocation-lens').onchange=drawChart;
  for(const id of ['allocation-state','allocation-stage'])get(id).onchange=()=>drawProjects();
  get('allocation-query').oninput=()=>drawProjects();
  get('allocation-more').onclick=()=>{shown+=20;drawProjects(false);};
  get('allocation-seat').onchange=drawSeat;
  get('allocation-export').onclick=()=>{
    const cell=s=>'"'+String(s??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
    const csv=[['Record','Project','State','Value AUD','Status','Source'],...filtered.map(p=>[p.id,p.title,p.state,p.value,p.status,p.source_url])].map(r=>r.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`opax-mlci-${get('allocation-stage').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const params=new URLSearchParams(location.search);get('allocation-query').value=params.get('q')||'';
  if(data.seats.some(s=>s.name===params.get('seat')))get('allocation-seat').value=params.get('seat');
  drawChart();drawProjects();drawSeat();
  if(focus)root.querySelector('h1').focus();
}
