import {
  decodeAssociatedTag,
  decodeAssociatedWith,
} from '../../api/associated';

export interface MoneyFigures {
  total: number;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  byYear?: Record<string, [number, number]>;
  undated?: [number, number];
  /**
   * The figures come from the graph's typed receipt cells: every receipt type,
   * once, from the party's own return (see typedReceipts). Absent, they are
   * the older all-record cells, which also hold the donor's own declaration
   * of the same gift.
   */
  typed?: true;
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
  aliases?: string[];
  /** AEC register wording and party ties, supplied by the money export. */
  associatedTag?: string;
  associatedWith?: { party: string; url?: string }[];
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
const plain = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
// By-elections name no year; these are the ones the federal returns hold.
const RECEIPT_EVENT_YEARS: Record<string, number> = {
  'braddon by-election': 2018,
  'wentworth by-election': 2018,
  'eden-monaro by-election': 2020,
  'fadden by-election': 2023,
};
/** "2020-21" is 2020 (as byYear keys it); "2022 Federal Election" is 2022. */
function periodYear(period: string): number | null {
  const found = /\b(?:19|20)\d{2}\b/.exec(period);
  const year = found
    ? Number(found[0])
    : RECEIPT_EVENT_YEARS[period.trim().toLowerCase()];
  return year !== undefined && year >= 1900 && year <= 2100 ? year : null;
}
/**
 * One flow's figures from the money graph's typed receipt cells, the measure
 * the web's receiptFigures and the map card use. `by_type` holds dollars by
 * AEC receipt type and `by_type_year` holds [dollars, rows] by financial year
 * or event, each receipt counted once, from the party's return. The older
 * total/count/byYear also add the donor's own declarations, so one gift can
 * be counted twice there (meta.receipt_types.legacy_totals). Null when the
 * cells are absent or do not hold together; the caller keeps the older cells.
 */
export function typedReceipts(x: {
  by_type?: unknown;
  by_type_year?: unknown;
}): MoneyFigures | null {
  const types = x.by_type,
    periods = x.by_type_year;
  if (!plain(types) || !plain(periods)) return null;
  const amounts = Object.values(types);
  if (!amounts.every(money)) return null;
  const total = (amounts as number[]).reduce((sum, n) => sum + n, 0);
  const byYear: Record<string, [number, number]> = {};
  const undated: [number, number] = [0, 0];
  let count = 0,
    firstYear: number | null = null,
    lastYear: number | null = null;
  for (const [period, cells] of Object.entries(periods)) {
    if (!plain(cells)) return null;
    let dollars = 0,
      rows = 0;
    for (const cell of Object.values(cells)) {
      if (
        !Array.isArray(cell) ||
        cell.length !== 2 ||
        !money(cell[0]) ||
        !Number.isInteger(cell[1]) ||
        !money(cell[1])
      )
        return null;
      dollars += cell[0];
      rows += cell[1];
    }
    count += rows;
    const at = periodYear(period);
    if (at === null) {
      undated[0] += dollars;
      undated[1] += rows;
      continue;
    }
    if (rows <= 0) continue;
    const cell = (byYear[String(at)] ??= [0, 0]);
    cell[0] += dollars;
    cell[1] += rows;
    firstYear = firstYear === null ? at : Math.min(firstYear, at);
    lastYear = lastYear === null ? at : Math.max(lastYear, at);
  }
  // Year windows re-sum the cells, so they must give the same total.
  const cells =
    undated[0] + Object.values(byYear).reduce((sum, [n]) => sum + n, 0);
  if (Math.abs(cells - total) > 1) return null;
  return {
    total,
    count,
    firstYear,
    lastYear,
    byYear,
    ...(undated[1] || undated[0] ? { undated } : {}),
    typed: true,
  };
}
/** The typed figures in place of the older ones, when the row carries them. */
function preferTyped<T extends MoneyFigures>(row: T): [T, boolean] {
  const raw = row as T & { by_type?: unknown; by_type_year?: unknown };
  if (raw.by_type === undefined && raw.by_type_year === undefined)
    return [row, false];
  const {
    by_type: _types,
    by_type_year: _years,
    byYear: _byYear,
    undated: _undated,
    ...rest
  } = raw;
  const typed = typedReceipts(raw);
  if (!typed) {
    const { by_type: _t, by_type_year: _y, ...legacy } = raw;
    return [legacy as T, true];
  }
  return [{ ...rest, ...typed } as T, false];
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
    let node = original && { ...original };
    // A party's own typed cells sum only the donors on the map, so its
    // figures stay the party's whole return (meta.party_totals_note).
    if (node?.kind === 'donor') {
      const [preferred, lost] = preferTyped(node);
      node = preferred;
      if (lost) fields++;
    } else if (node) {
      delete (node as { by_type?: unknown }).by_type;
      delete (node as { by_type_year?: unknown }).by_type_year;
    }
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
    // Optional register metadata must never hide an otherwise valid donor.
    if (node.associatedTag !== undefined) {
      const tag = decodeAssociatedTag(node.associatedTag);
      if (tag) node.associatedTag = tag;
      else {
        delete node.associatedTag;
        fields++;
      }
    }
    if (node.associatedWith !== undefined) {
      const ties = decodeAssociatedWith(node.associatedWith);
      if (ties) node.associatedWith = ties;
      else {
        delete node.associatedWith;
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
  for (const original of graph.edges.slice(0, 10000)) {
    if (!original) continue;
    const [edge, lost] = preferTyped({ ...original });
    if (lost) fields++;
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
  // Every donor keeps the name its graph gives it, as the web shows it.
  const result: MoneyGraph = { ...graph, nodes, edges };
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
