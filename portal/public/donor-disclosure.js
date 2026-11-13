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

// One figure for a donor-to-party flow, so the map card, the donor page, the
// party table, /api/register/party-money and "Explain this money" agree.
//
// The money graph's typed cells (by_type, by_type_year) sum each receipt once,
// from the party's own return, across all receipt types. The older
// total/count/byYear also add the donor's own declarations of the same gifts,
// so one gift can appear twice there (docs/reports/2026-11-12-aec-receipt-types.md).
// They are used only for a graph with no typed cells (the state graphs), and
// the scope line says so.

// Event periods count at their polling year, as on the map (graph/index.ts).
const RECEIPT_EVENT_YEARS = {'braddon by-election':2018,'wentworth by-election':2018,'eden-monaro by-election':2020,'fadden by-election':2023};

/**
 * A flow's figures: total, count, first and last year, dollars by year
 * (`byYear`), [dollars, receipts] by year (`cells`), what carries no year
 * (`undated`, [dollars, receipts]) and dollars by receipt type (`byType`, typed only).
 */
export function receiptFigures(x) {
  if (!x?.by_type) {
    const byYear = {}, cells = {};
    for (const [year, cell] of Object.entries(x?.byYear || {})) {
      const dollars = Number(Array.isArray(cell) ? cell[0] : cell) || 0;
      byYear[year] = dollars;
      cells[year] = [dollars, Array.isArray(cell) ? Number(cell[1]) || 0 : 0];
    }
    const undated = [Number(x?.undated?.[0]) || 0, Number(x?.undated?.[1]) || 0];
    return {total:Number(x?.total) || 0, count:Number(x?.count) || 0, firstYear:x?.firstYear ?? null, lastYear:x?.lastYear ?? null,
      byYear, cells, undated, byType:null, typed:false};
  }
  let count = 0, firstYear = null, lastYear = null;
  const byYear = {}, cells = {}, undated = [0, 0];
  for (const [period, types] of Object.entries(x.by_type_year || {})) {
    // Financial years count at their first year ("2020-21" is 2020), as on the map.
    const year = Number(String(period).match(/\b(?:19|20)\d{2}\b/)?.[0]) || RECEIPT_EVENT_YEARS[String(period).toLowerCase()];
    let dollars = 0, n = 0;
    for (const cell of Object.values(types || {})) { dollars += Number(cell?.[0]) || 0; n += Number(cell?.[1]) || 0; }
    count += n;
    if (n <= 0) continue;
    if (!year) { undated[0] += dollars; undated[1] += n; continue; }
    byYear[year] = (byYear[year] || 0) + dollars;
    const cell = cells[year] || (cells[year] = [0, 0]);
    cell[0] += dollars; cell[1] += n;
    firstYear = firstYear === null ? year : Math.min(firstYear, year);
    lastYear = lastYear === null ? year : Math.max(lastYear, year);
  }
  const byType = {};
  for (const [type, amount] of Object.entries(x.by_type)) byType[type] = Number(amount) || 0;
  const total = Object.values(byType).reduce((sum, amount) => sum + amount, 0);
  return {total, count, firstYear, lastYear, byYear, cells, undated, byType, typed:true};
}

const financialYear = year => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

/** The scope of a receiptFigures result, in a reader's words, for its own line under the figure. */
export function receiptScopeLabel(figures) {
  if (!figures?.typed) return 'All federal disclosure records, as given by both donor and party, so a gift can appear twice';
  const span = figures.firstYear == null ? '' : figures.firstYear === figures.lastYear
    ? `, ${financialYear(figures.firstYear)}` : `, ${financialYear(figures.firstYear)} to ${financialYear(figures.lastYear)}`;
  return `All receipt types${span}, as the parties reported them in federal returns`;
}

/**
 * The graph with every donor-to-party edge and every donor node read the way
 * the map card, the donor page and the party table read them (receiptFigures):
 * the typed cells, each receipt once from the party's own return, all receipt
 * types. The older total/byYear cells also hold the donor's own declaration of
 * the same gift and stay only where a graph has no typed cells (the state graphs).
 * Each typed edge and node keeps its shape (total, count, byYear as [dollars, receipts],
 * firstYear, lastYear, undated), so a sum written for the old cells reads it unchanged;
 * an edge or node without typed cells is returned as it is.
 * A typed edge with no receipts is left out: the party reported none. Party
 * nodes keep their own received totals (they include transfers; a different
 * measure), and grants and public-money flows are untouched.
 */
const isReceiptEdge = edge => edge && !edge.grant && !edge.flow;
// Not cached: a few milliseconds for the federal graph, and a cache keyed on the
// object would hand back a stale view of a graph changed after its first read.
export function receiptGraph(graph) {
  if (!graph || graph.receiptMeasure || !Array.isArray(graph.edges)) return graph;
  const read = (x, f) => ({...x, total:f.total, count:f.count, byYear:f.cells, firstYear:f.firstYear, lastYear:f.lastYear,
    undated:f.undated, byType:f.byType, typed:f.typed});
  const edges = [];
  for (const edge of graph.edges) {
    // An edge without typed cells (every edge of a state graph) keeps its record figures as they are.
    if (!isReceiptEdge(edge) || !edge.by_type) { edges.push(edge); continue; }
    const f = receiptFigures(edge);
    if (f.count <= 0 && f.total === 0) continue;
    edges.push(read(edge, f));
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.map(node => node?.kind === 'donor' && node.by_type ? read(node, receiptFigures(node)) : node) : graph.nodes;
  return {...graph, nodes, edges, receiptMeasure:true};
}

/**
 * The scope line for a receiptGraph's donor figures, spanning its typed edges
 * (optionally only those `keep` accepts); empty for a graph without typed cells.
 */
export function receiptGraphScope(graph, keep = () => true) {
  let typed = false, firstYear = null, lastYear = null;
  for (const edge of receiptGraph(graph)?.edges || []) {
    if (!isReceiptEdge(edge) || !edge.typed || !keep(edge)) continue;
    typed = true;
    if (edge.firstYear != null) firstYear = firstYear == null ? edge.firstYear : Math.min(firstYear, edge.firstYear);
    if (edge.lastYear != null) lastYear = lastYear == null ? edge.lastYear : Math.max(lastYear, edge.lastYear);
  }
  return typed ? receiptScopeLabel({typed, firstYear, lastYear}) : '';
}
