import type { MoneyFigures, MoneyGraph, MoneyNode, MoneyEdge } from './data';
import { cpiMultiplier } from './ported/cpi';

export interface MoneyFilters {
  from: number;
  to: number;
  industry: string | null;
  donations: boolean;
  grants: boolean;
  contracts: boolean;
  inflation: boolean;
}
export function yearExtent(graph: MoneyGraph) {
  const years = graph.edges
    .flatMap((e) => [e.firstYear, e.lastYear])
    .filter((x): x is number => x !== null);
  return {
    from: years.length ? Math.min(...years) : 0,
    to: years.length ? Math.max(...years) : 0,
  };
}
export function defaultMoneyFilters(graph: MoneyGraph): MoneyFilters {
  return {
    ...yearExtent(graph),
    industry: null,
    donations: true,
    grants: true,
    contracts: true,
    inflation: false,
  };
}
/** Port of portal/graph/index.ts windowFigures: undated disclosures stay in every window. */
export function windowFigures<T extends MoneyFigures>(
  x: T,
  lo: number,
  hi: number,
  inflation = false,
): T {
  if (!x.byYear) return x;
  let total = x.undated?.[0] ?? 0;
  let count = x.undated?.[1] ?? 0;
  let firstYear: number | null = null;
  let lastYear: number | null = null;
  for (const [key, [dollars, n]] of Object.entries(x.byYear)) {
    const year = Number(key);
    if (year < lo || year > hi) continue;
    total += inflation ? dollars * cpiMultiplier(year) : dollars;
    count += n;
    if (firstYear === null || year < firstYear) firstYear = year;
    if (lastYear === null || year > lastYear) lastYear = year;
  }
  return { ...x, total, count, firstYear, lastYear };
}
/** Same direction/type rules as portal/public/money-records.js. */
export function moneyFlowType(edge: MoneyEdge, nodes: Map<string, MoneyNode>) {
  const from = nodes.get(edge.source),
    to = nodes.get(edge.target);
  if (!from || !to || edge.total <= 0) return null;
  if (from.kind === 'grantor' && to.kind === 'donor')
    return edge.flow === 'contracts' ||
      from.flow === 'contracts' ||
      from.explorer === 'contracts'
      ? 'contracts'
      : 'grants';
  if (
    from.kind === 'agency' &&
    to.kind === 'supplier' &&
    edge.flow === 'contracts'
  )
    return 'contracts';
  if (from.kind === 'donor' && to.kind === 'party' && !edge.grant && !edge.flow)
    return 'donations';
  return null;
}
export function moneyWindowNodes(
  raw: MoneyGraph,
  f: MoneyFilters,
): MoneyNode[] {
  const extent = yearExtent(raw);
  const recalculate = f.from > extent.from || f.to < extent.to || f.inflation;
  return recalculate
    ? raw.nodes.map((n) => ({
        ...windowFigures(n, f.from, f.to, f.inflation),
        ...(n.grants
          ? { grants: windowFigures(n.grants, f.from, f.to, f.inflation) }
          : {}),
        ...(n.contracts
          ? { contracts: windowFigures(n.contracts, f.from, f.to, f.inflation) }
          : {}),
      }))
    : raw.nodes;
}
export function moneyView(raw: MoneyGraph, f: MoneyFilters): MoneyGraph {
  const extent = yearExtent(raw);
  const recalculate = f.from > extent.from || f.to < extent.to || f.inflation;
  const nodes = moneyWindowNodes(raw, f);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (
    recalculate
      ? raw.edges.map((e) => windowFigures(e, f.from, f.to, f.inflation))
      : raw.edges
  ).filter((e) => {
    const type = moneyFlowType(e, byId);
    if (!type || !f[type]) return false;
    return (
      !f.industry ||
      [byId.get(e.source)!, byId.get(e.target)!].some(
        (n) =>
          n.kind === 'donor' &&
          (n.group === f.industry || n.industry === f.industry),
      )
    );
  });
  const active = new Set(edges.flatMap((e) => [e.source, e.target]));
  return {
    meta: raw.meta,
    nodes: nodes.filter((n) => active.has(n.id)),
    edges,
  };
}
export function rankedDonors(view: MoneyGraph) {
  return view.nodes
    .filter((n) => n.kind === 'donor')
    .sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'en-AU'),
    );
}

/** Only the exporter-selected donation cohort can have a donation rank; an
 * "Individual donors (N)" aggregate is not one donor and has none. */
export function donationRanks(donors: MoneyNode[]) {
  return new Map(
    donors
      .filter((n) => n.via !== 'public_money' && !n.withheld)
      .map((n, i) => [n.id, i + 1]),
  );
}
