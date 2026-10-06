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
/** Reject corrupt cache/network data before allocating GL resources or summing cells. */
export function decodeMoneyGraph(value: unknown): MoneyGraph {
  const graph = value as MoneyGraph;
  if (
    !graph ||
    typeof graph.meta?.generated !== 'string' ||
    typeof graph.meta.coverage !== 'string' ||
    typeof graph.meta.source !== 'string' ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 1000 ||
    graph.edges.length > 10000
  )
    throw new Error('Invalid money graph');
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      ids.has(node.id) ||
      typeof node.label !== 'string' ||
      typeof node.group !== 'string' ||
      typeof node.kind !== 'string' ||
      typeof node.industry !== 'string' ||
      !figures(node) ||
      (node.colour !== undefined && !/^#[a-f\d]{6}$/i.test(node.colour)) ||
      (node.grants !== undefined && !publicMoney(node.grants)) ||
      (node.contracts !== undefined && !publicMoney(node.contracts))
    )
      throw new Error('Invalid money node');
    ids.add(node.id);
  }
  for (const edge of graph.edges)
    if (
      !edge ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      !figures(edge)
    )
      throw new Error('Invalid money edge');
  return graph;
}
export const moneyCatalogs = {
  federal: { label: 'Federal', path: '/graph/money.json' },
  qld: { label: 'Queensland', path: '/graph/money.qld.json' },
  vic: { label: 'Victoria', path: '/graph/money.vic.json' },
  tas: { label: 'Tasmania', path: '/graph/money.tas.json' },
} as const;
export type MoneyJurisdiction = keyof typeof moneyCatalogs;
