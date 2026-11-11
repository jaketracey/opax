// Disclosure spelling and identity resolution are separate facts. Every published
// donor name links to its donor page (Jake, 16 Oct): a confident match opens the
// matched entity's page; any other record opens the page for its own exact
// disclosure spelling, which claims no identity beyond that string. A bare name
// no record holds stays plain text: its page would be a 404.
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
  return {name, href:confidentDonorMatch(record) ? safeHref(record.match.href) : donorPageHref(record, name), reference, returns, ...donorAssociated(record)};
}
const ASSOCIATED_REGISTER = 'https://transparency.aec.gov.au/RegisterOfEntities?clientType=associatedentity';
/** The AEC associated-entity line a money export puts on a donor (rule 9 of export_money_graph.py):
 *  {associated, associatedUrl}, or nothing for a donor the register does not tie to a party it gives to.
 *  Shown with the name wherever it appears, the same way for every party. */
export function donorAssociated(record) {
  const tag = typeof record?.associatedTag === 'string' ? record.associatedTag.trim() : '';
  if (!tag) return {};
  return {associated: tag, associatedUrl: safeHref(record.associatedWith?.[0]?.url) || ASSOCIATED_REGISTER};
}
/** The register line for a row about one recipient party: only when the register ties the donor to that
 *  party (any branch or division), so a donor's tag never rides on its receipts to a different party. */
export function donorAssociatedTo(record, party) {
  const linked = Array.isArray(record?.associatedWith) && record.associatedWith.some(a => a?.party === party);
  return linked ? donorAssociated(record).associated : undefined;
}
const sentenceCase = text => text.charAt(0).toUpperCase() + text.slice(1);
/** The page for a published record's own spelling: /subject/donor/<name>. A record is published when
 *  the index or a money graph holds it (an id, a kind, match evidence, or merged return references). */
export function donorPageHref(record, name = record?.source_name ?? record?.label ?? record?.name ?? record?.n) {
  const published = record && typeof record === 'object' && (record.id || record.kind || record.match || Array.isArray(record.returnReferences));
  const spelled = String(name ?? '').trim();
  return published && spelled ? `/subject/donor/${encodeURIComponent(spelled)}` : null;
}
// Display is the name alone, linked to its donor page. Return references stay
// data (Sources, CSV, table API, tool fields), never inline text.
// An AEC associated entity also carries its register line, linked to the register.
export function donorLabelHTML(record, fallback) {
  const {name,href,associated,associatedUrl} = donorDisclosure(record,fallback);
  const label = href ? `<a href="${escape(href)}">${escape(name)}</a>` : escape(name);
  return associated ? `${label} <span class="donor-assoc"><a href="${escape(associatedUrl)}" rel="external noopener" target="_blank">${escape(sentenceCase(associated))}</a></span>` : label;
}
export function donorDisplayText(record, fallback) {
  const {name,associated} = donorDisclosure(record,fallback);
  return associated ? `${name} (${associated})` : name;
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
