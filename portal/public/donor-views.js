import {donorPrivacyIndex, donorNameWithheld, foldDonorName, MONEY_GRAPHS} from './donor-entity.js?v=ebb2c972d5';
export {donorNameWithheld, donorPrivacyIndex};
let memo;
const graphs = new Map();
/** One read of a money graph per page: the privacy index and the views share it (read-only). */
export function loadMoneyGraph(path) {
  if (!graphs.has(path)) graphs.set(path, fetch(path,{cache:"no-cache"}).then(r => { if (!r.ok) throw Error('Money data unavailable'); return r.json(); }));
  return graphs.get(path);
}
/** The index the first render waits for: the published file (scripts/build_donor_index.mjs,
 *  ~4 KB) rather than every money graph. Without it, computed from the graphs as before;
 *  failing that, every donor is withheld. */
export function loadDonorViewIndex() {
  return memo ??= fetch('/graph/donor-index.json',{cache:"no-cache"})
    .then(r => { if (!r.ok) throw Error('Donor index unavailable'); return r.json(); })
    .then(d => {
      // The file names organisations only; anything else is withheld by donorNameWithheld.
      if (!Array.isArray(d?.organisations)) throw Error('Donor index malformed');
      return {organisations:new Set(d.organisations),withheld:new Set(Array.isArray(d.withheld) ? d.withheld : [])};
    })
    .catch(() => Promise.all(MONEY_GRAPHS.map(loadMoneyGraph)).then(donorPrivacyIndex))
    .catch(() => ({organisations:new Set(),withheld:new Set()}));
}
export const unnamedDonorLabel = n => `Donors not named (${n})`;
export const isUnnamedAggregate = label => /^Donors not named \(\d+\)$/.test(label);
export const donorsNotNamedDetail = "OPAX names organisations only. Donors it can't confirm are organisations are counted here, not named.";
export function donorAggregateDetail(label, doc = globalThis.document) {
  const detail = doc.createElement('details'); detail.className = 'donor-aggregate';
  const summary = doc.createElement('summary'); summary.textContent = label;
  const explanation = doc.createElement('p'); explanation.textContent = donorsNotNamedDetail;
  detail.append(summary,explanation); return detail;
}
/** Preserve totals while drawing only organisations and one unlinked aggregate. */
export function donorRows(rows, index, limit = Infinity) {
  const organisations = [], withheld = [];
  for (const row of rows || []) (donorNameWithheld(index || {organisations:new Set(),withheld:new Set()},row[0]) ? withheld : organisations).push(row);
  organisations.sort((a,b) => b[1]-a[1]);
  const out = organisations.slice(0,limit);
  if (withheld.length) out.push([unnamedDonorLabel(withheld.length),withheld.reduce((s,r)=>s+r[1],0)]);
  return out;
}
export function withheldDonorTotals(nodes, edges, index = donorPrivacyIndex([{nodes}])) {
  const hidden = new Set(nodes.filter(n => n.kind === 'donor' && donorNameWithheld(index,n.label)).map(n=>n.id));
  const active = new Set();let amount=0;
  for (const e of edges) if (hidden.has(e.source) && !e.grant && !e.flow) { active.add(e.source); amount += e.total || 0; }
  return {count:nodes.filter(n=>n.kind==='donor'&&hidden.has(n.id)&&active.has(n.id)).length,amount};
}

/** A withheld alias can look like a company acronym after public aliases are
 * removed. Ask only the public profile's HEAD metadata; never a model route. */
export async function donorRouteWithheld(name,index) {
 if(donorNameWithheld(index,name))return true;
 if(index.organisations.has(foldDonorName(name)) || !/^[A-Z]{3,7}$/.test(name.trim()))return false;
 try {
  const response=await fetch('/subject/donor/'+encodeURIComponent(name),{method:'HEAD',cache:'no-cache'});
  return !response.ok || /noindex/i.test(response.headers.get('x-robots-tag') || '');
 }catch{return true;}
}
