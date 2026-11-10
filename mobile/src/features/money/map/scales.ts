import type { MoneyNode } from '../data';

/**
 * How a figure becomes a size, stated in the legend. Disc area is
 * proportional to the amount: radius = NODE_SCALE · √amount, never below a
 * floor (a disc under about $400,000 is drawn at the floor), so a $1bn party
 * and a $1m donor sit on one scale. Line width = EDGE_SCALE · √amount with a
 * floor and a cap. The public-money hubs are a different measure, never
 * summed with donations, and are drawn as a fixed ring.
 */
export const NODE_SCALE = 70 / Math.sqrt(1.12e9);
export const NODE_FLOOR = 1.4;
export const HUB_RADIUS = 16;
export const EDGE_SCALE = 10 / Math.sqrt(1.28e8);
export const EDGE_FLOOR = 0.3;
export const EDGE_CAP = 24;

export function nodeRadius(amount: number) {
  return Math.max(NODE_FLOOR, NODE_SCALE * Math.sqrt(Math.max(0, amount)));
}
export function edgeWidth(amount: number) {
  return Math.min(
    EDGE_CAP,
    Math.max(EDGE_FLOOR, EDGE_SCALE * Math.sqrt(Math.max(0, amount))),
  );
}
/**
 * Public money lines are their own, lighter register: the same square-root
 * law, but a $1bn contract line is six units wide, where $1bn of donations
 * would be at the cap. Contracts run a hundred times the size of donations,
 * so on one scale they would bury the donations they sit beside. The legend
 * states both scales; neither is ever added to the other.
 */
export const PUBLIC_EDGE_SCALE = 6 / Math.sqrt(1e9);
export const PUBLIC_EDGE_CAP = 8;
export function publicEdgeWidth(amount: number) {
  return Math.min(
    PUBLIC_EDGE_CAP,
    Math.max(EDGE_FLOOR, PUBLIC_EDGE_SCALE * Math.sqrt(Math.max(0, amount))),
  );
}
/** The amount at which a disc leaves the floor. */
export const nodeFloorAmount = () => (NODE_FLOOR / NODE_SCALE) ** 2;
/** The amount at which a line reaches the cap. */
export const edgeCapAmount = () => (EDGE_CAP / EDGE_SCALE) ** 2;
/** The amount at which a public money line reaches its cap. */
export const publicEdgeCapAmount = () =>
  (PUBLIC_EDGE_CAP / PUBLIC_EDGE_SCALE) ** 2;
/** The donation flow drawn as wide as a public money flow of `amount`. */
export const publicEdgeEquivalent = (amount: number) =>
  (publicEdgeWidth(amount) / EDGE_SCALE) ** 2;
/** Reference amounts the legend draws. */
export const LEGEND_NODES = [1e6, 1e8, 1e9] as const;
export const LEGEND_EDGES = [1e6, 1e7, 1e8] as const;
export const LEGEND_PUBLIC_EDGES = [1e8, 1e9, 1e10] as const;

/** Parties sit at the centre; the public-money hubs share one cluster. */
export const PARTIES = 'parties';
export const PUBLIC_MONEY = 'public money';
export function clusterOf(node: Pick<MoneyNode, 'kind' | 'group'>) {
  return node.kind === 'party'
    ? PARTIES
    : node.kind === 'grantor'
      ? PUBLIC_MONEY
      : node.group;
}
