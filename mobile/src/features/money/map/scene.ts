import type { MapModel } from './model';
import { isPublicEdge, otherEnd } from './model';

/**
 * What the map draws, as calls on a painter. The stage records each layer
 * into a Skia picture once (on settle, filter or focus); the tests record
 * into a counting painter. Nothing here touches Skia.
 */
export interface Painter {
  circle(x: number, y: number, r: number, colour: string, alpha: number): void;
  ring(
    x: number,
    y: number,
    r: number,
    width: number,
    colour: string,
    alpha: number,
  ): void;
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    colour: string,
    alpha: number,
  ): void;
}
export interface Positions {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
}

/** Discs below this radius and lines below this width are the faint tier. */
export const SMALL_NODE = 3.2;
export const THIN_EDGE = 1.0;
const EDGE_ALPHA = 0.42;
/** Public money lines sit beneath the donations, as a quieter register. */
const PUBLIC_EDGE_ALPHA = 0.22;
const NODE_ALPHA = 0.94;
const HUB_RING = 3.5;

export type NodeTier = 'small' | 'large';
/**
 * Donations are thin or thick by width; every public money line is its own
 * tier, drawn first, however wide.
 */
export type EdgeTier = 'thin' | 'thick' | 'public';

/** `at(i)` is a node's layout index; the model's index is for the view. */
export type PositionOf = (modelIndex: number) => { x: number; y: number };

export function paintEdges(
  painter: Painter,
  model: MapModel,
  at: PositionOf,
  tier: EdgeTier,
  skip?: ReadonlySet<number>,
) {
  let drawn = 0;
  for (const edge of model.edges) {
    if (isPublicEdge(edge) !== (tier === 'public')) continue;
    if (tier !== 'public' && edge.width < THIN_EDGE !== (tier === 'thin'))
      continue;
    if (skip?.has(edge.index)) continue;
    const a = at(edge.a),
      b = at(edge.b);
    painter.line(
      a.x,
      a.y,
      b.x,
      b.y,
      edge.width,
      edge.colour,
      tier === 'public' ? PUBLIC_EDGE_ALPHA : EDGE_ALPHA,
    );
    drawn++;
  }
  return drawn;
}

export function paintNodes(
  painter: Painter,
  model: MapModel,
  at: PositionOf,
  tier: NodeTier,
  paper: string,
  skip?: ReadonlySet<number>,
) {
  let drawn = 0;
  for (const node of model.nodes) {
    if (node.radius < SMALL_NODE !== (tier === 'small')) continue;
    if (skip?.has(node.index)) continue;
    const p = at(node.index);
    if (node.kind === 'hub') {
      painter.ring(p.x, p.y, node.radius, HUB_RING, node.colour, 1);
      painter.circle(p.x, p.y, node.radius - HUB_RING, paper, 1);
    } else {
      painter.circle(p.x, p.y, node.radius, node.colour, NODE_ALPHA);
      // A hairline of paper keeps touching discs apart.
      if (node.radius >= SMALL_NODE)
        painter.ring(p.x, p.y, node.radius, 0.5, paper, 0.9);
    }
    drawn++;
  }
  return drawn;
}

/** The focus layer: the node, its flows and the other ends, at full strength. */
export function paintFocus(
  painter: Painter,
  model: MapModel,
  at: PositionOf,
  focus: number,
  ink: string,
  paper: string,
) {
  const node = model.nodes[focus];
  if (!node) return { nodes: 0, edges: 0 };
  const neighbours = new Set<number>();
  let edges = 0;
  for (const index of model.flows[focus] ?? []) {
    const edge = model.edges[index]!;
    const a = at(edge.a),
      b = at(edge.b);
    painter.line(a.x, a.y, b.x, b.y, edge.width, edge.colour, 0.9);
    neighbours.add(otherEnd(edge, focus));
    edges++;
  }
  for (const other of neighbours) {
    const n = model.nodes[other]!;
    const p = at(other);
    if (n.kind === 'hub') {
      painter.ring(p.x, p.y, n.radius, HUB_RING, n.colour, 1);
      painter.circle(p.x, p.y, n.radius - HUB_RING, paper, 1);
    } else {
      painter.circle(p.x, p.y, n.radius, n.colour, 1);
      painter.ring(p.x, p.y, n.radius, 0.5, paper, 0.9);
    }
  }
  const p = at(focus);
  if (node.kind === 'hub') {
    painter.ring(p.x, p.y, node.radius, HUB_RING, node.colour, 1);
    painter.circle(p.x, p.y, node.radius - HUB_RING, paper, 1);
  } else painter.circle(p.x, p.y, node.radius, node.colour, 1);
  // The halo: ink, a little outside the rim.
  painter.ring(p.x, p.y, node.radius + 2.5, 1.6, ink, 1);
  return { nodes: neighbours.size + 1, edges };
}

/** The overview's blobs: one soft disc a cluster, sized as the layout sized it. */
export function paintOverview(
  painter: Painter,
  clusters: readonly { x: number; y: number; r: number; colour: string }[],
) {
  for (const c of clusters) painter.circle(c.x, c.y, c.r, c.colour, 0.55);
  return clusters.length;
}

/** A painter that counts, for tests and the e2e probe. */
export function countingPainter() {
  const counts = { circles: 0, rings: 0, lines: 0 };
  const painter: Painter = {
    circle: () => void counts.circles++,
    ring: () => void counts.rings++,
    line: () => void counts.lines++,
  };
  return { painter, counts };
}
