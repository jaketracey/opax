export interface MoneyFigures {
  total: number;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  byYear?: Record<string, [number, number]>;
  undated?: [number, number];
}
export interface PublicMoneyBlock extends MoneyFigures {
  top?: [string, number][];
  rid?: string;
  sh?: number;
  jur?: string;
}
export interface MoneyNode extends MoneyFigures {
  id: string;
  label: string;
  kind: string;
  group: string;
  industry: string;
  colour?: string;
  profileUrl?: string;
  grants?: PublicMoneyBlock;
  contracts?: PublicMoneyBlock;
  flow?: string;
  explorer?: string;
  via?: string;
  publicMoney?: number;
}
export interface MoneyEdge extends MoneyFigures {
  source: string;
  target: string;
  grant?: boolean;
  flow?: string;
}
export interface MoneyGraph {
  meta: {
    generated: string;
    coverage: string;
    source: string;
    jurisdiction?: string;
    commission?: string;
    sourceShort?: string;
    source_url?: string;
    licence?: string;
    threshold?: string;
    not_summed?: string;
    grants_source?: string;
    contracts_source?: string;
    contracts_coverage?: string;
    [key: string]: unknown;
  };
  nodes: MoneyNode[];
  edges: MoneyEdge[];
}
const money = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;
const year = (n: unknown) =>
  n === null || (Number.isInteger(n) && Number(n) >= 1900 && Number(n) <= 2100);
function figures(x: MoneyFigures): boolean {
  if (
    !x ||
    !money(x.total) ||
    !money(x.count) ||
    !year(x.firstYear) ||
    !year(x.lastYear)
  )
    return false;
  if (x.firstYear !== null && x.lastYear !== null && x.firstYear > x.lastYear)
    return false;
  const cell = (v: unknown) =>
    Array.isArray(v) && v.length === 2 && money(v[0]) && money(v[1]);
  if (x.undated !== undefined && !cell(x.undated)) return false;
  if (x.byYear !== undefined) {
    if (!x.byYear || typeof x.byYear !== 'object' || Array.isArray(x.byYear))
      return false;
    for (const [key, value] of Object.entries(x.byYear))
      if (!/^\d{4}$/.test(key) || !year(Number(key)) || !cell(value))
        return false;
  }
  return true;
}
function publicMoney(x: PublicMoneyBlock): boolean {
  return (
    figures(x) &&
    (x.top === undefined ||
      (Array.isArray(x.top) &&
        x.top.every(
          (row) =>
            Array.isArray(row) &&
            row.length === 2 &&
            typeof row[0] === 'string' &&
            money(row[1]),
        )))
  );
}
export interface MoneyDecodeLoss {
  nodes: number;
  edges: number;
  fields: number;
}
// Keep validation metadata outside the source's published facts, as robustness does.
const losses = new WeakMap<MoneyGraph, MoneyDecodeLoss>();
export const moneyDecodeLoss = (graph: MoneyGraph): MoneyDecodeLoss =>
  losses.get(graph) ?? { nodes: 0, edges: 0, fields: 0 };
function identity(value: unknown): string {
  const ordered = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(ordered)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, ordered(v)]),
          )
        : x;
  return JSON.stringify(ordered(value));
}
/** One bad row cannot blank a jurisdiction. No synthetic sums for duplicate IDs.
 * Identical records may differ only in total: retain the larger. Otherwise omit
 * every row for that identity, including all dangling edges, and count the loss.
 */
export function decodeMoneyGraph(value: unknown): MoneyGraph {
  const graph = value as MoneyGraph;
  if (
    !graph ||
    typeof graph.meta?.generated !== 'string' ||
    typeof graph.meta.coverage !== 'string' ||
    typeof graph.meta.source !== 'string' ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  )
    throw new Error('Invalid money graph');
  let fields = 0;
  const buckets = new Map<string, MoneyNode[]>();
  const invalidIds = new Set<string>();
  for (const original of graph.nodes.slice(0, 1000)) {
    const node = original && { ...original };
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id.trim() ||
      typeof node.label !== 'string' ||
      !node.label.trim() ||
      typeof node.group !== 'string' ||
      typeof node.industry !== 'string' ||
      !['donor', 'party', 'grantor', 'agency', 'supplier'].includes(
        node.kind,
      ) ||
      !figures(node)
    ) {
      if (typeof node?.id === 'string') invalidIds.add(node.id);
      continue;
    }
    if (node.colour !== undefined && !/^#[a-f\d]{6}$/i.test(node.colour)) {
      delete node.colour;
      fields++;
    }
    for (const key of ['grants', 'contracts'] as const) {
      if (node[key] !== undefined && !publicMoney(node[key]!)) {
        delete node[key];
        fields++;
      }
    }
    const rows = buckets.get(node.id) ?? [];
    rows.push(node);
    buckets.set(node.id, rows);
  }
  const nodes: MoneyNode[] = [];
  for (const [id, rows] of buckets) {
    if (invalidIds.has(id)) continue;
    const signatures = new Set(
      rows.map(({ total: _total, ...rest }) => identity(rest)),
    );
    if (signatures.size !== 1) continue;
    nodes.push(rows.reduce((a, b) => (b.total > a.total ? b : a)));
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edgeBuckets = new Map<string, MoneyEdge[]>();
  for (const edge of graph.edges.slice(0, 10000)) {
    if (
      !edge ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      !figures(edge)
    )
      continue;
    const key = identity([
      edge.source,
      edge.target,
      edge.flow ?? '',
      edge.grant ?? false,
    ]);
    const rows = edgeBuckets.get(key) ?? [];
    rows.push(edge);
    edgeBuckets.set(key, rows);
  }
  const edges: MoneyEdge[] = [];
  for (const rows of edgeBuckets.values()) {
    const signatures = new Set(
      rows.map(({ total: _total, ...rest }) => identity(rest)),
    );
    if (signatures.size !== 1) continue;
    edges.push(rows.reduce((a, b) => (b.total > a.total ? b : a)));
  }
  const result = { ...graph, nodes, edges };
  losses.set(result, {
    nodes: graph.nodes.length - nodes.length,
    edges: graph.edges.length - edges.length,
    fields,
  });
  return result;
}
export const moneyCatalogs = {
  federal: { label: 'Federal', path: '/graph/money.json' },
  qld: { label: 'Queensland', path: '/graph/money.qld.json' },
  vic: { label: 'Victoria', path: '/graph/money.vic.json' },
  tas: { label: 'Tasmania', path: '/graph/money.tas.json' },
} as const;
export type MoneyJurisdiction = keyof typeof moneyCatalogs;
