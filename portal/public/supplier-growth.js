/* Client-side agency records, from the same published exports as their pages. */
import {sourceLineHTML} from './labels.js?v=804befe8de';
import {moduleAttrs, donationRegisterHTML, exactOrganisationDonors, growthSummaryPath, normalisedName} from './growth-modules.js?v=097cceba9a';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n).toLocaleString('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0});
async function json(url,signal) {const r=await fetch(url,{signal});if(!r.ok)throw new Error('Records unavailable');return r.json();}
/** The supplier directory is the publication authority, not the donor classifier.
 * Match the supplier sitemap's non-empty id/name and exported-profile requirement. */
export function publishedSupplierIndex(suppliers) {
  const valid = value => typeof value==='string' && !!value.trim() && !/^(null|undefined)$/i.test(value.trim());
  return new Map((suppliers || []).filter(s=>valid(s.id) && valid(s.name) && s.profile_path).map(s=>[s.id,s]));
}
export function publishedAgencySuppliers(agency,published=new Map()) {
  return (agency?.suppliers || []).flatMap(s=>{
    const entry=published.get(s.id);
    // Use the published page's name; raw agency labels and donor hints stay out.
    return entry ? [{id:entry.id,name:entry.name,total:s.total}] : [];
  });
}
export function agencySuppliers(agency,supplierId,published) {
  return publishedAgencySuppliers(agency,published).filter(s=>s.id!==supplierId).sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,5);
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
export function supplierRecordsHTML(agency,supplierId,updated,published) {
  const rows=agencySuppliers(agency,supplierId,published);
  if (!rows.length) return '';
  return `<section class="growth-records supplier-section" ${moduleAttrs('agency_suppliers','supplier',1)}><h3 class="subject-section-title">Other suppliers to ${esc(agency.name)}</h3><ul class="subject-list" role="list">${rows.map(s=>`<li><a href="/subject/supplier/${encodeURIComponent(s.id)}">${esc(s.name)}</a><span class="result-meta">${esc(money(s.total))} in recorded contract values</span></li>`).join('')}</ul>${sourceLineHTML({source:'AusTender',updated,originals:[{label:'Agency records',href:`/subject/agency/${encodeURIComponent(agency.id)}`}],notes:['Largest other suppliers in this agency export, by recorded award value. Commitments, not verified payments.']})}</section>`;
}
export function agencyGrantsHTML(agency,rows,meta) {

  return `<section class="growth-records supplier-section" ${moduleAttrs('agency_grants','supplier',2)}><h3 class="subject-section-title">Largest grants from ${esc(agency)}</h3><p>Largest awards in the published sample.</p>${rows.length?`<ul class="subject-list" role="list">${rows.map(g=>`<li><a href="/money/grants/federal/recipient/${encodeURIComponent(g.recipientId)}?award=${encodeURIComponent(g.id)}">${esc(g.n || g.id)}</a><span class="result-meta">${esc(g.recipient)} · ${esc(money(g.v))}</span></li>`).join('')}</ul>`:'<p>No awards from this agency in the published sample.</p>'}${sourceLineHTML({source:'GrantConnect',updated:meta?.generated,state:'sample',originals:[{label:'GrantConnect awards',href:meta?.source_url || 'https://www.grants.gov.au/Ga/List'}],notes:['Each listed recipient’s largest exported awards only; this is not a complete agency ranking. Award values, not payments. '+(meta?.coverage || '')]})}</section>`;
}
export async function mountSupplierGrowth(root,profile,meta,life,suppliers) {
  const top=[...(profile.agencies || [])].sort((a,b)=>Number(b.total)-Number(a.total))[0];
  if (!top) return;
  const load=async()=>{
    try {
      const summary=await json(await growthSummaryPath('agencies',normalisedName(top.name)),life.signal);
      if (!life.alive() || summary.agency?.name!==top.name) return;
      root.innerHTML=supplierRecordsHTML(summary.agency,profile.id,summary.contracts_updated || meta?.generated_at,publishedSupplierIndex(suppliers))
        +agencyGrantsHTML(top.name,summary.grants || [],summary.meta);
      root.dataset.recordsReady='true';
    } catch {if(life.alive()) root.innerHTML='<p role="status">This agency’s related records could not be opened.</p>';}
  };
  if(typeof IntersectionObserver==='undefined') await load();
  else {
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'200px'});
    observer.observe(root);life.cleanup(()=>observer.disconnect());
  }
}
/** Existing supplier-to-donor hints cannot bypass exact organisation matching. */
export async function supplierDonations(profile,life) {
  const index=await json('/growth/organisation-donors.json',life.signal);
  const html=donationRegisterHTML(profile,index.donors || []);
  if(!html) return {html:'',links:[]};
  const donor=exactOrganisationDonors(profile,index.donors || [])[0];
  return {html,links:[{id:donor.id,name:donor.label,url:`/subject/donor/${encodeURIComponent(donor.label)}`,method:'exact_normalized_name'}]};
}
