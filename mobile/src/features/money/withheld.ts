import { individualDonorsLabel } from '../../privacy/donorEntity';
import type {
  MoneyEdge,
  MoneyFigures,
  MoneyGraph,
  MoneyNode,
  PublicMoneyBlock,
} from './data';

/** Sums figures; byYear only when every part has one, so windows stay true. */
function sumFigures<T extends MoneyFigures>(parts: T[]): MoneyFigures {
  const years = (pick: (x: T) => number | null) =>
    parts.map(pick).filter((y): y is number => y !== null);
  const first = years((x) => x.firstYear),
    last = years((x) => x.lastYear);
  const out: MoneyFigures = {
    total: parts.reduce((n, x) => n + x.total, 0),
    count: parts.reduce((n, x) => n + x.count, 0),
    firstYear: first.length ? Math.min(...first) : null,
    lastYear: last.length ? Math.max(...last) : null,
  };
  if (parts.every((x) => x.byYear)) {
    const byYear: Record<string, [number, number]> = {};
    for (const x of parts)
      for (const [year, [dollars, n]] of Object.entries(x.byYear!)) {
        const cell = (byYear[year] ??= [0, 0]);
        cell[0] += dollars;
        cell[1] += n;
      }
    out.byYear = byYear;
  }
  const undated = parts.filter((x) => x.undated);
  if (undated.length)
    out.undated = [
      undated.reduce((n, x) => n + x.undated![0], 0),
      undated.reduce((n, x) => n + x.undated![1], 0),
    ];
  return out;
}
// Only the figures: a block's top list and record id belong to one recipient.
function sumBlocks(parts: (PublicMoneyBlock | undefined)[]) {
  const held = parts.filter((b): b is PublicMoneyBlock => !!b);
  return held.length ? sumFigures(held) : undefined;
}

/**
 * The money map with its withheld donors (see withholdIndividualDonors) folded
 * into one "Individual donors (N)" node per industry cluster and cohort, with
 * every flow and amount kept. The aggregate has no profile, rank or name.
 */
export function aggregateWithheldDonors(graph: MoneyGraph): MoneyGraph {
  const buckets = new Map<string, MoneyNode[]>();
  for (const n of graph.nodes)
    if (n.kind === 'donor' && n.withheld) {
      const key = [n.group, n.industry, n.via ?? ''].join('|');
      buckets.set(key, [...(buckets.get(key) ?? []), n]);
    }
  if (!buckets.size) return graph;
  const into = new Map<string, string>();
  const aggregates: MoneyNode[] = [];
  for (const [key, members] of buckets) {
    const id = `donor:individual-donors:${key}`;
    for (const m of members) into.set(m.id, id);
    const lead = members[0]!;
    const grants = sumBlocks(members.map((m) => m.grants)),
      contracts = sumBlocks(members.map((m) => m.contracts)),
      publicMoney = members.filter((m) => m.publicMoney !== undefined);
    aggregates.push({
      ...sumFigures(members),
      id,
      label: individualDonorsLabel(members.length),
      kind: 'donor',
      group: lead.group,
      industry: lead.industry,
      aliases: [],
      withheld: true,
      withheldCount: members.length,
      ...(lead.via ? { via: lead.via } : {}),
      ...(grants ? { grants } : {}),
      ...(contracts ? { contracts } : {}),
      ...(publicMoney.length
        ? { publicMoney: publicMoney.reduce((s, m) => s + m.publicMoney!, 0) }
        : {}),
    });
  }
  const flows = new Map<string, MoneyEdge[]>();
  const edges: MoneyEdge[] = [];
  for (const e of graph.edges) {
    if (!into.has(e.source) && !into.has(e.target)) {
      edges.push(e);
      continue;
    }
    const source = into.get(e.source) ?? e.source,
      target = into.get(e.target) ?? e.target;
    const key = JSON.stringify([source, target, e.flow ?? '', !!e.grant]);
    flows.set(key, [...(flows.get(key) ?? []), { ...e, source, target }]);
  }
  for (const parts of flows.values()) {
    const lead = parts[0]!;
    edges.push({
      ...sumFigures(parts),
      source: lead.source,
      target: lead.target,
      ...(lead.flow ? { flow: lead.flow } : {}),
      ...(lead.grant ? { grant: lead.grant } : {}),
    });
  }
  const nodes = [...graph.nodes.filter((n) => !into.has(n.id)), ...aggregates];
  return { ...graph, nodes, edges };
}
