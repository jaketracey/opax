import { paletteFor } from '../../../design/palette';
import type { MoneyGraph, MoneyNode } from '../data';
import { clusterColour } from '../ported/palette';
import { industryLabel } from '../records';
import { moneyFlowType } from '../view';
import {
  clusterOf,
  HUB_RADIUS,
  nodeRadius,
  edgeWidth,
  PARTIES,
  PUBLIC_MONEY,
  publicEdgeWidth,
} from './scales';
import { partyDot } from '../../../design/party';

/**
 * The map's model: the graph as marks. Every number here is the record's
 * own figure for the window the map shows; the scales below say how a figure
 * becomes a size, and the legend states them.
 */
export type MapNodeKind = 'donor' | 'party' | 'hub';
export type MapFlowType = 'donations' | 'grants' | 'contracts';
export interface MapNode extends Pick<
  MoneyNode,
  'associatedTag' | 'associatedWith'
> {
  index: number;
  id: string;
  label: string;
  kind: MapNodeKind;
  /** The cluster the node sits in: an industry, 'parties' or 'public money'. */
  cluster: string;
  /** The node's own figure in the window: donations, receipts or public money. */
  amount: number;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  /** World units; area is proportional to the amount above the floor. */
  radius: number;
  colour: string;
  ink: string;
  flow?: 'grants' | 'contracts';
}
export interface MapEdge {
  index: number;
  /** Node indices: the money goes from `a` to `b`. */
  a: number;
  b: number;
  amount: number;
  count: number;
  /** World units; proportional to the square root of the amount above the floor. */
  width: number;
  colour: string;
  type: MapFlowType;
  firstYear: number | null;
  lastYear: number | null;
}
export interface MapCluster {
  key: string;
  label: string;
  colour: string;
  ink: string;
  nodes: number[];
}
export interface MapModel {
  nodes: MapNode[];
  edges: MapEdge[];
  clusters: MapCluster[];
  byId: Map<string, number>;
  /** Each node's edges, strongest first. */
  flows: number[][];
  totals: Record<MapFlowType, number>;
}

export {
  clusterOf,
  EDGE_CAP,
  EDGE_FLOOR,
  EDGE_SCALE,
  edgeCapAmount,
  edgeWidth,
  HUB_RADIUS,
  LEGEND_EDGES,
  LEGEND_NODES,
  LEGEND_PUBLIC_EDGES,
  NODE_FLOOR,
  NODE_SCALE,
  nodeFloorAmount,
  nodeRadius,
  PARTIES,
  PUBLIC_EDGE_CAP,
  PUBLIC_EDGE_SCALE,
  PUBLIC_MONEY,
  publicEdgeCapAmount,
  publicEdgeEquivalent,
  publicEdgeWidth,
} from './scales';
/** Whether an edge is public money (a hub's grants or contracts), not a donation. */
export function isPublicEdge(edge: Pick<MapEdge, 'type'>) {
  return edge.type !== 'donations';
}
export function clusterLabel(key: string) {
  return key === PARTIES
    ? 'Parties'
    : key === PUBLIC_MONEY
      ? 'Public money'
      : industryLabel(key);
}

/**
 * The model for a view (`moneyView`). Nodes outside the view are not in it;
 * the layout keeps every node of the full graph, so switching a filter never
 * moves a node, only shows or hides it.
 */
export function buildModel(view: MoneyGraph): MapModel {
  const palette = paletteFor('light');
  const sourceById = new Map(view.nodes.map((n) => [n.id, n]));
  const nodes: MapNode[] = view.nodes.map((n, index) => {
    const cluster = clusterOf(n);
    const kind: MapNodeKind =
      n.kind === 'party' ? 'party' : n.kind === 'grantor' ? 'hub' : 'donor';
    const colour =
      kind === 'hub'
        ? (n.colour ?? palette.moneyInk)
        : kind === 'party'
          ? // A party's disc takes its own colour (the app's party dots;
            // TestFlight AA8AR3Xv). Labels keep the neutral ink, and the
            // largest parties are named, so colour is never the only cue.
            (partyDot(n.label) ?? clusterColour(PARTIES).colour)
          : (n.colour ?? clusterColour(n.group).colour);
    const ink =
      kind === 'hub'
        ? palette.moneyInk
        : kind === 'party'
          ? clusterColour(PARTIES).ink
          : clusterColour(n.group).ink;
    return {
      index,
      id: n.id,
      label: n.label,
      kind,
      cluster,
      amount: n.total,
      count: n.count,
      firstYear: n.firstYear,
      lastYear: n.lastYear,
      radius: kind === 'hub' ? HUB_RADIUS : nodeRadius(n.total),
      colour,
      ink,
      ...(kind === 'donor'
        ? {
            ...(n.associatedTag ? { associatedTag: n.associatedTag } : {}),
            ...(n.associatedWith ? { associatedWith: n.associatedWith } : {}),
          }
        : {}),
      ...(kind === 'hub'
        ? { flow: n.flow === 'contracts' ? 'contracts' : 'grants' }
        : {}),
    } satisfies MapNode;
  });
  const byId = new Map(nodes.map((n) => [n.id, n.index]));
  const totals: Record<MapFlowType, number> = {
    donations: 0,
    grants: 0,
    contracts: 0,
  };
  const edges: MapEdge[] = [];
  for (const e of view.edges) {
    const a = byId.get(e.source),
      b = byId.get(e.target);
    const type = moneyFlowType(e, sourceById);
    if (a === undefined || b === undefined || !type) continue;
    const source = nodes[a]!;
    edges.push({
      index: edges.length,
      a,
      b,
      amount: e.total,
      count: e.count,
      // Donations on the map's scale; public money on its own, lighter one.
      width:
        type === 'donations' ? edgeWidth(e.total) : publicEdgeWidth(e.total),
      // A flow takes its source's colour: a donor's industry, or the hub's.
      colour: source.colour,
      type,
      firstYear: e.firstYear,
      lastYear: e.lastYear,
    });
    totals[type] += e.total;
  }
  const flows: number[][] = nodes.map(() => []);
  for (const e of edges) {
    flows[e.a]!.push(e.index);
    flows[e.b]!.push(e.index);
  }
  for (const list of flows)
    list.sort((x, y) => edges[y]!.amount - edges[x]!.amount);
  const grouped = new Map<string, number[]>();
  for (const n of nodes) {
    const list = grouped.get(n.cluster) ?? [];
    list.push(n.index);
    grouped.set(n.cluster, list);
  }
  const clusters: MapCluster[] = [...grouped.entries()]
    .sort(
      ([ka, a], [kb, b]) =>
        (ka === PARTIES ? -1 : kb === PARTIES ? 1 : 0) ||
        b.length - a.length ||
        ka.localeCompare(kb, 'en-AU'),
    )
    .map(([key, members]) => ({
      key,
      label: clusterLabel(key),
      colour:
        key === PUBLIC_MONEY ? palette.moneyInk : clusterColour(key).colour,
      ink: key === PUBLIC_MONEY ? palette.moneyInk : clusterColour(key).ink,
      nodes: members,
    }));
  return { nodes, edges, clusters, byId, flows, totals };
}

/** The other end of an edge from a node. */
export function otherEnd(edge: MapEdge, node: number) {
  return edge.a === node ? edge.b : edge.a;
}

/**
 * The strongest flow from a node that does not lead back along the trail:
 * "Next" walks the money; "Previous" retraces it.
 */
export function nextAlongFlows(
  model: MapModel,
  from: number,
  trail: readonly number[],
): number | null {
  for (const index of model.flows[from] ?? []) {
    const other = otherEnd(model.edges[index]!, from);
    if (!trail.includes(other)) return other;
  }
  return null;
}
