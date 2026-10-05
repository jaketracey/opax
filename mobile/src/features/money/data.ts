export interface MoneyNode {
  id: string;
  label: string;
  kind: string;
  group: string;
  industry: string;
  colour?: string;
  total: number;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  byYear?: Record<string, [number, number]>;
}
export interface MoneyEdge {
  source: string;
  target: string;
  total: number;
  count: number;
  grant?: boolean;
  flow?: string;
  byYear?: Record<string, [number, number]>;
}
export interface MoneyGraph {
  meta: { generated: string; coverage: string; source: string };
  nodes: MoneyNode[];
  edges: MoneyEdge[];
}
/** Reject corrupt cache/network data before allocating GL resources. */
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
      !Number.isFinite(node.total) ||
      node.total < 0 ||
      !Number.isFinite(node.count) ||
      node.count < 0 ||
      (node.colour !== undefined && !/^#[a-f\d]{6}$/i.test(node.colour))
    )
      throw new Error('Invalid money node');
    ids.add(node.id);
  }
  for (const edge of graph.edges) {
    if (
      !edge ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      !Number.isFinite(edge.total) ||
      edge.total < 0 ||
      !Number.isFinite(edge.count) ||
      edge.count < 0
    )
      throw new Error('Invalid money edge');
  }
  return graph;
}
