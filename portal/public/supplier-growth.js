/* Client-side agency records, from the same published exports as their pages. */
import {sourceLineHTML} from './labels.js';
import {moduleAttrs, donationRegisterHTML, exactOrganisationDonors} from './growth-modules.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n).toLocaleString('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0});
async function json(url,signal) {const r=await fetch(url,{signal});if(!r.ok)throw new Error('Records unavailable');return r.json();}
export function agencySuppliers(agency,supplierId) {
  return (agency?.suppliers || []).filter(s=>s.id && s.id!==supplierId).sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,5);
}
/** The largest source awards held in the published recipient sample, not all GrantConnect awards. */
export function agencyGrants(shards,agency) {
  const awards = new Map();
  for (const shard of shards) for (const recipient of Object.values(shard)) {
    if (['individual','person','undisclosed'].includes(recipient.k)) continue;
    for (const grant of recipient.grants || []) if (grant.ag===agency && /^GA\d+(?:-A\d+)?$/.test(grant.id || '') && Number(grant.v)>0 && recipient.id) {
      awards.set(grant.id,{...grant,recipient:recipient.n,recipientId:recipient.id});
    }
  }
  return [...awards.values()].sort((a,b)=>Number(b.v)-Number(a.v)).slice(0,5);
}
export function supplierRecordsHTML(agency,supplierId,updated) {
  const rows=agencySuppliers(agency,supplierId);
  if (!rows.length) return '';
  return `<section class="growth-records supplier-section" ${moduleAttrs('agency_suppliers','supplier',1)}><h3 class="subject-section-title">Other suppliers to ${esc(agency.name)}</h3><ul class="subject-list" role="list">${rows.map(s=>`<li><a href="/subject/supplier/${encodeURIComponent(s.id)}">${esc(s.name)}</a><span class="result-meta">${esc(money(s.total))} in recorded contract values</span></li>`).join('')}</ul>${sourceLineHTML({source:'AusTender',updated,originals:[{label:'Agency records',href:`/subject/agency/${encodeURIComponent(agency.id)}`}],notes:['Largest other suppliers in this agency export, by recorded award value. Commitments, not verified payments.']})}</section>`;
}
export function agencyGrantsHTML(agency,rows,meta) {

  return `<section class="growth-records supplier-section" ${moduleAttrs('agency_grants','supplier',2)}><h3 class="subject-section-title">Largest grants from ${esc(agency)}</h3><p>Largest awards in the published sample.</p>${rows.length?`<ul class="subject-list" role="list">${rows.map(g=>`<li><a href="/money/grants/federal/recipient/${encodeURIComponent(g.recipientId)}?award=${encodeURIComponent(g.id)}">${esc(g.n || g.id)}</a><span class="result-meta">${esc(g.recipient)} · ${esc(money(g.v))}</span></li>`).join('')}</ul>`:'<p>No awards from this agency in the published sample.</p>'}${sourceLineHTML({source:'GrantConnect',updated:meta?.generated,state:'sample',originals:[{label:'GrantConnect awards',href:meta?.source_url || 'https://www.grants.gov.au/Ga/List'}],notes:['Each listed recipient’s largest exported awards only; this is not a complete agency ranking. Award values, not payments. '+(meta?.coverage || '')]})}</section>`;
}
export async function mountSupplierGrowth(root,profile,meta,life) {
  const top=[...(profile.agencies || [])].sort((a,b)=>Number(b.total)-Number(a.total))[0];
  if (!top) return;
  try {
    const directory=await json('/agencies.json',life.signal);
    const entry=(directory.agencies || []).find(a=>a.name===top.name);
    if (!entry || !/^\/agencies\/[a-z0-9-]+\.json$/.test(entry.profile_path)) return;
    const agency=await json(entry.profile_path,life.signal);
    if (!life.alive()) return;
    root.innerHTML=supplierRecordsHTML(agency,profile.id,meta?.generated_at);
    const slot=document.createElement('div');root.appendChild(slot);
    // Load the larger grant export only as this module approaches the viewport.
    const load=async()=>{
      try {
        const graph=await json('/graph/grants.federal.json',life.signal);
        const index=(graph.agencies || []).indexOf(top.name);
        if(index<0) {if(life.alive()) slot.innerHTML=agencyGrantsHTML(top.name,[],graph.meta);return;}
        const numbers=[...new Set((graph.recipients || []).filter(r=>(r.ag || []).includes(index)).map(r=>r.sh))].filter(n=>Number.isInteger(n)&&n>=0&&n<Number(graph.meta?.shards));
        const shards=[];
        // Limit concurrent requests and retain failure as a failed module, never a partial ranking.
        for(let i=0;i<numbers.length;i+=4) shards.push(...await Promise.all(numbers.slice(i,i+4).map(n=>json(`/grants/federal/shard-${String(n).padStart(2,'0')}.json`,life.signal))));
        if(life.alive()) slot.innerHTML=agencyGrantsHTML(top.name,agencyGrants(shards,top.name),graph.meta);
      } catch {if(life.alive()) slot.innerHTML='<p role="status">This agency’s grant records could not be opened.</p>';}
    };
    if(typeof IntersectionObserver==='undefined') await load();
    else {const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'400px'});observer.observe(slot);life.cleanup(()=>observer.disconnect());}
  } catch { /* Optional records collapse when their export is unavailable. */ }
}
/** Existing supplier-to-donor hints cannot bypass exact organisation matching. */
export async function supplierDonations(profile,life) {
  const graph=await json('/graph/money.json?v=suppliers-1',life.signal);
  const html=donationRegisterHTML(profile,graph.nodes || []);
  if(!html) return {html:'',links:[]};
  const donor=exactOrganisationDonors(profile,graph.nodes || [])[0];
  return {html,links:[{id:donor.id,name:donor.label,url:`/subject/donor/${encodeURIComponent(donor.label)}`,method:'exact_normalized_name'}]};
}
