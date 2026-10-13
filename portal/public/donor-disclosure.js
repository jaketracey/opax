// Disclosure spelling and identity resolution are separate facts. An absent or
// uncertain match never supplies a person or organisation link.
import {foldDonorName} from './donor-entity.js?v=3fd3e51b56';

const safeHref = value => typeof value === 'string' && /^(?:\/(?!\/)|https?:\/\/)/i.test(value) ? value : null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export function confidentDonorMatch(record) {
  const match = record?.match;
  return match?.confidence === 1 && ['exact','curated'].includes(match.method) && Boolean(safeHref(match.href));
}
export function returnReference(record) {
  return [record?.return_type || record?.type, record?.year, record?.return_id || record?.transaction_id || record?.id || record?.url].filter(v=>v != null && v !== '').join(' · ');
}
export function donorDisclosure(record, fallback = {}) {
  if (typeof record === 'string') record = {label:record};
  const name = String(record?.source_name ?? record?.label ?? record?.name ?? record?.n ?? '');
  const returns = Array.isArray(record?.returnReferences) ? record.returnReferences : Array.isArray(fallback.returnReferences) ? fallback.returnReferences : [];
  const references = [...new Set(returns.map(returnReference).filter(Boolean))];
  const reference = (references.slice(0,3).join('; ') + (references.length>3 ? `; ${references.length-3} more return references in the data export` : '')) || returnReference(fallback);
  return {name, href:confidentDonorMatch(record) ? safeHref(record.match.href) : null, reference, returns};
}
export function donorLabelHTML(record, fallback) {
  const {name,href,reference} = donorDisclosure(record,fallback);
  return (href ? `<a href="${escape(href)}">${escape(name)}</a>` : escape(name))
    + (reference ? ` <span class="donor-return-reference">${escape(reference)}</span>` : '');
}
export function donorDisplayText(record, fallback) {
  const {name,reference} = donorDisclosure(record,fallback);
  return [name,reference].filter(Boolean).join(' — ');
}
export function donorLookup(records) {
  const index=new Map();
  for(const record of records || [])for(const name of [record.source_name,record.label,record.name,...record.aliases || [],...record.lookup_names || []].filter(Boolean)){
    const folded=foldDonorName(name);
    for(const key of [folded,...(record.jurisdiction?[record.jurisdiction+':'+folded]:[])]){
      const prior=index.get(key);
      const sameConfirmedEntity=prior?.match?.entity_id && prior.match.entity_id===record.match?.entity_id && confidentDonorMatch(prior) && confidentDonorMatch(record);
      if(sameConfirmedEntity)index.set(key,prior);
      else if(prior && (prior.id!==record.id || prior.source_name!==record.source_name))index.set(key,{label:name,returnReferences:[...prior.returnReferences || [],...record.returnReferences || []]});
      else index.set(key,record);
    }
  }
  return index;
}
