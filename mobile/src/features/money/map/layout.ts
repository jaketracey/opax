import type { MoneyGraph } from '../data';
import { clusterOf, HUB_RADIUS, nodeRadius, PARTIES } from './scales';

/**
 * A deterministic 2D force layout on typed arrays: the d3-force physics the
 * 3D scene ported (charge, link, positional pull to a cluster centre,
 * collide; d3's alpha and velocity decay), with one axis fewer, a spatial
 * grid for the two pairwise forces and no dependency on Math.random(). Two
 * layouts built from identical input tick to identical positions.
 *
 * The layout holds every node of a jurisdiction's graph, whatever the view
 * shows: a filter hides a node, it never moves one.
 */
export interface LayoutNode {
  id: string;
  cluster: string;
  radius: number;
}
export interface LayoutLink {
  a: number;
  b: number;
}
export interface Centre {
  x: number;
  y: number;
  r: number;
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 300);
const ALPHA_MIN = 0.012;
const MAX_TICKS = 320;
const VELOCITY_RETAIN = 0.6;
const CHARGE = -165;
const CHARGE_MAX = 300;
const COLLIDE_STRENGTH = 0.9;
/** Room around every disc, so a name can sit beside it. */
const COLLIDE_PADDING = 7;
const PULL = 0.2;
/** A flow to another cluster barely tugs: position is the cluster. */
const CROSS_STRENGTH = 0.004;
const SAME_STRENGTH = 0.5;

class Lcg {
  private state = 7;
  next() {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
  jiggle() {
    return (this.next() - 0.5) * 1e-6;
  }
}

/** Points spaced evenly along an ellipse's perimeter, as the 3D port did. */
function ellipseAngles(n: number, sx: number, sy: number): number[] {
  const steps = 720;
  const cumulative = new Float64Array(steps + 1);
  let prevX = sx,
    prevY = 0;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = Math.cos(t) * sx,
      y = Math.sin(t) * sy;
    cumulative[i] = cumulative[i - 1]! + Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  const total = cumulative[steps]!;
  const angles: number[] = [];
  for (let k = 0; k < n; k++) {
    const target = ((k / n + 0.75) % 1) * total;
    let cursor = 0;
    while (cursor < steps && cumulative[cursor + 1]! < target) cursor++;
    angles.push((cursor / steps) * Math.PI * 2);
  }
  return angles;
}

/**
 * The radius a cluster settles into: the greater of the 2D map's empirical
 * formula and the packing radius of its discs (density 0.68), since discs
 * here are sized by amount and a party cluster holds a few large ones.
 */
export function blobRadius(radii: readonly number[]) {
  const packed = Math.sqrt(
    radii.reduce((sum, r) => sum + (r + COLLIDE_PADDING) ** 2, 0) / 0.68,
  );
  // Two large discs side by side need the sum of their diameters.
  const [first = 0, second = 0] = [...radii].sort((a, b) => b - a);
  return Math.max(
    30 * Math.sqrt(Math.max(1, radii.length)) + 34,
    packed,
    first + second + 2 * COLLIDE_PADDING,
  );
}

/**
 * Where each cluster sits: the parties at the origin, the others on an
 * ellipse stretched to the viewport's aspect and spaced along its
 * perimeter, grown until no two blobs overlap and none meets the centre.
 * `groups` is iterated in the caller's order (largest first).
 */
export function clusterCentres(
  groups: ReadonlyMap<string, readonly number[]>,
  aspect: number,
): Map<string, Centre> {
  const centres = new Map<string, Centre>();
  let entries = [...groups.entries()];
  if (!entries.length) return centres;
  let centralR = 0;
  if (groups.has(PARTIES) && entries.length > 1) {
    centralR = blobRadius(groups.get(PARTIES)!);
    centres.set(PARTIES, { x: 0, y: 0, r: centralR });
    entries = entries.filter(([key]) => key !== PARTIES);
  }
  if (entries.length === 1) {
    const [key, radii] = entries[0]!;
    const r = blobRadius(radii);
    centres.set(key, { x: centralR ? centralR + r : 0, y: 0, r });
    return centres;
  }
  const n = entries.length;
  const stretch = Math.pow(Math.max(0.7, Math.min(2.2, aspect)), 0.85);
  const angles = ellipseAngles(n, stretch, 1 / stretch);
  const unit = angles.map((a) => ({
    x: Math.cos(a) * stretch,
    y: Math.sin(a) / stretch,
  }));
  const blobs = entries.map(([, radii]) => blobRadius(radii));
  let ring = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const gap = Math.hypot(unit[i]!.x - unit[j]!.x, unit[i]!.y - unit[j]!.y);
      if (gap > 0) ring = Math.max(ring, (blobs[i]! + blobs[j]!) / gap);
    }
  ring *= 1.08;
  if (centralR > 0)
    unit.forEach((point, i) => {
      const len = Math.hypot(point.x, point.y);
      if (len > 0) ring = Math.max(ring, ((centralR + blobs[i]!) * 1.1) / len);
    });
  entries.forEach(([key], i) => {
    centres.set(key, {
      x: unit[i]!.x * ring,
      y: unit[i]!.y * ring,
      r: blobs[i]!,
    });
  });
  return centres;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class ForceLayout {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: Float32Array;
  readonly centres: Map<string, Centre>;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly cx: Float32Array;
  private readonly cy: Float32Array;
  private readonly linkA: Int32Array;
  private readonly linkB: Int32Array;
  private readonly linkDistance: Float32Array;
  private readonly linkStrength: Float32Array;
  private readonly linkBias: Float32Array;
  private readonly rng = new Lcg();
  private alpha = 1;
  private ticks = 0;
  readonly count: number;
  private readonly maxRadius: number;

  constructor(
    nodes: readonly LayoutNode[],
    links: readonly LayoutLink[],
    aspect: number,
  ) {
    const n = (this.count = nodes.length);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.cx = new Float32Array(n);
    this.cy = new Float32Array(n);
    this.radius = new Float32Array(n);
    const groups = new Map<string, number[]>();
    nodes.forEach((node, i) => {
      this.radius[i] = node.radius;
      const list = groups.get(node.cluster) ?? [];
      list.push(node.radius);
      groups.set(node.cluster, list);
    });
    const ordered = new Map(
      [...groups.entries()].sort(
        ([ka, a], [kb, b]) =>
          (ka === PARTIES ? -1 : kb === PARTIES ? 1 : 0) ||
          b.length - a.length ||
          ka.localeCompare(kb, 'en-AU'),
      ),
    );
    this.centres = clusterCentres(ordered, aspect);
    this.maxRadius = Math.max(0, ...nodes.map((node) => node.radius));
    // Initial placement: d3's node-init spiral, per cluster, from its centre.
    const counters = new Map<string, number>();
    nodes.forEach((node, i) => {
      const centre = this.centres.get(node.cluster) ?? { x: 0, y: 0, r: 60 };
      const k = counters.get(node.cluster) ?? 0;
      counters.set(node.cluster, k + 1);
      const rho = 9 * Math.sqrt(k + 0.5),
        theta = k * GOLDEN_ANGLE;
      this.x[i] = centre.x + rho * Math.cos(theta);
      this.y[i] = centre.y + rho * Math.sin(theta);
      this.cx[i] = centre.x;
      this.cy[i] = centre.y;
    });
    const degree = new Int32Array(n);
    const valid = links.filter(
      (l) => l.a >= 0 && l.a < n && l.b >= 0 && l.b < n && l.a !== l.b,
    );
    for (const l of valid) {
      degree[l.a] = degree[l.a]! + 1;
      degree[l.b] = degree[l.b]! + 1;
    }
    this.linkA = new Int32Array(valid.length);
    this.linkB = new Int32Array(valid.length);
    this.linkDistance = new Float32Array(valid.length);
    this.linkStrength = new Float32Array(valid.length);
    this.linkBias = new Float32Array(valid.length);
    valid.forEach((l, i) => {
      const same = nodes[l.a]!.cluster === nodes[l.b]!.cluster;
      this.linkA[i] = l.a;
      this.linkB[i] = l.b;
      // A link to a large disc keeps clear of it: distance from the rims.
      const rims = nodes[l.a]!.radius + nodes[l.b]!.radius;
      this.linkDistance[i] = (same ? 62 : 190) + rims;
      this.linkStrength[i] = same ? SAME_STRENGTH : CROSS_STRENGTH;
      this.linkBias[i] = degree[l.a]! / (degree[l.a]! + degree[l.b]!);
    });
  }

  get settled() {
    return this.alpha < ALPHA_MIN || this.ticks >= MAX_TICKS;
  }
  get energy() {
    return this.alpha;
  }

  /** Advance up to n ticks; returns true once settled. */
  tick(n = 1): boolean {
    for (let i = 0; i < n && !this.settled; i++) this.step();
    return this.settled;
  }

  private step() {
    this.ticks++;
    this.alpha += (0 - this.alpha) * ALPHA_DECAY;
    this.applyCharge();
    this.applyLinks();
    this.applyPull();
    this.applyCollide();
    const { x, y, vx, vy, count } = this;
    for (let i = 0; i < count; i++) {
      vx[i] = vx[i]! * VELOCITY_RETAIN;
      vy[i] = vy[i]! * VELOCITY_RETAIN;
      x[i] = x[i]! + vx[i]!;
      y[i] = y[i]! + vy[i]!;
    }
  }

  // Scratch buffers for the spatial grid: a counting sort into cells, so a
  // tick allocates nothing (Hermes pays for every small array).
  private cellOf = new Int32Array(0);
  private cellStart = new Int32Array(0);
  private cellItems = new Int32Array(0);
  private gridCols = 0;
  private gridRows = 0;
  private gridMinX = 0;
  private gridMinY = 0;

  /** Nodes bucketed into square cells, for the two pairwise forces. */
  private grid(cell: number) {
    const { x, y, count } = this;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      if (x[i]! < minX) minX = x[i]!;
      if (x[i]! > maxX) maxX = x[i]!;
      if (y[i]! < minY) minY = y[i]!;
      if (y[i]! > maxY) maxY = y[i]!;
    }
    const cols = Math.max(1, Math.floor((maxX - minX) / cell) + 1);
    const rows = Math.max(1, Math.floor((maxY - minY) / cell) + 1);
    const cells = cols * rows;
    if (this.cellOf.length !== count) this.cellOf = new Int32Array(count);
    if (this.cellItems.length !== count) this.cellItems = new Int32Array(count);
    if (this.cellStart.length < cells + 1)
      this.cellStart = new Int32Array(cells + 1);
    const { cellOf, cellStart, cellItems } = this;
    cellStart.fill(0, 0, cells + 1);
    for (let i = 0; i < count; i++) {
      const c =
        Math.floor((y[i]! - minY) / cell) * cols +
        Math.floor((x[i]! - minX) / cell);
      cellOf[i] = c;
      cellStart[c + 1] = cellStart[c + 1]! + 1;
    }
    for (let c = 0; c < cells; c++)
      cellStart[c + 1] = cellStart[c + 1]! + cellStart[c]!;
    const cursor = this.cellStart.slice(0, cells);
    for (let i = 0; i < count; i++) {
      const c = cellOf[i]!;
      cellItems[cursor[c]!] = i;
      cursor[c] = cursor[c]! + 1;
    }
    this.gridCols = cols;
    this.gridRows = rows;
    this.gridMinX = minX;
    this.gridMinY = minY;
  }

  /** Visit every j > i within one cell of i (after grid()). */
  private near(i: number, visit: (j: number) => void) {
    const { cellOf, cellStart, cellItems, gridCols, gridRows } = this;
    const c = cellOf[i]!;
    const col = c % gridCols,
      row = (c - col) / gridCols;
    for (let dy = -1; dy <= 1; dy++) {
      const r = row + dy;
      if (r < 0 || r >= gridRows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const q = col + dx;
        if (q < 0 || q >= gridCols) continue;
        const cellIndex = r * gridCols + q;
        for (
          let k = cellStart[cellIndex]!;
          k < cellStart[cellIndex + 1]!;
          k++
        ) {
          const j = cellItems[k]!;
          if (j > i) visit(j);
        }
      }
    }
  }

  private applyCharge() {
    const { x, y, vx, vy, count, alpha } = this;
    const dMax2 = CHARGE_MAX * CHARGE_MAX;
    this.grid(CHARGE_MAX);
    for (let i = 0; i < count; i++)
      this.near(i, (j) => {
        let dx = x[j]! - x[i]!,
          dy = y[j]! - y[i]!;
        let d2 = dx * dx + dy * dy;
        if (d2 === 0) {
          dx = this.rng.jiggle();
          dy = this.rng.jiggle();
          d2 = dx * dx + dy * dy;
        }
        if (d2 >= dMax2) return;
        if (d2 < 1) d2 = Math.sqrt(d2);
        const w = (CHARGE * alpha) / d2;
        vx[i] = vx[i]! + dx * w;
        vy[i] = vy[i]! + dy * w;
        vx[j] = vx[j]! - dx * w;
        vy[j] = vy[j]! - dy * w;
      });
  }

  private applyLinks() {
    const { x, y, vx, vy, alpha } = this;
    for (let i = 0; i < this.linkA.length; i++) {
      const a = this.linkA[i]!,
        b = this.linkB[i]!;
      let dx = x[b]! + vx[b]! - x[a]! - vx[a]!,
        dy = y[b]! + vy[b]! - y[a]! - vy[a]!;
      let l = Math.sqrt(dx * dx + dy * dy);
      if (l === 0) {
        dx = this.rng.jiggle();
        dy = this.rng.jiggle();
        l = Math.sqrt(dx * dx + dy * dy);
      }
      const scale =
        ((l - this.linkDistance[i]!) / l) * alpha * this.linkStrength[i]!;
      dx *= scale;
      dy *= scale;
      const bias = this.linkBias[i]!;
      vx[b] = vx[b]! - dx * bias;
      vy[b] = vy[b]! - dy * bias;
      vx[a] = vx[a]! + dx * (1 - bias);
      vy[a] = vy[a]! + dy * (1 - bias);
    }
  }

  private applyPull() {
    const { x, y, vx, vy, cx, cy, count, alpha } = this;
    for (let i = 0; i < count; i++) {
      vx[i] = vx[i]! + (cx[i]! - x[i]!) * PULL * alpha;
      vy[i] = vy[i]! + (cy[i]! - y[i]!) * PULL * alpha;
    }
  }

  private applyCollide() {
    const { x, y, vx, vy, radius, count } = this;
    this.grid(Math.max(16, 2 * (this.maxRadius + COLLIDE_PADDING)));
    for (let i = 0; i < count; i++) {
      const ri = radius[i]! + COLLIDE_PADDING,
        ri2 = ri * ri;
      const xi = x[i]! + vx[i]!,
        yi = y[i]! + vy[i]!;
      this.near(i, (j) => {
        const rj = radius[j]! + COLLIDE_PADDING,
          r = ri + rj;
        let dx = xi - (x[j]! + vx[j]!),
          dy = yi - (y[j]! + vy[j]!);
        let l = dx * dx + dy * dy;
        if (l >= r * r) return;
        if (dx === 0) {
          dx = this.rng.jiggle();
          l += dx * dx;
        }
        if (dy === 0) {
          dy = this.rng.jiggle();
          l += dy * dy;
        }
        l = Math.sqrt(l);
        const scale = ((r - l) / l) * COLLIDE_STRENGTH;
        const dxs = dx * scale,
          dys = dy * scale;
        const rj2 = rj * rj;
        const weightA = rj2 / (ri2 + rj2);
        vx[i] = vx[i]! + dxs * weightA;
        vy[i] = vy[i]! + dys * weightA;
        vx[j] = vx[j]! - dxs * (1 - weightA);
        vy[j] = vy[j]! - dys * (1 - weightA);
      });
    }
  }
}

/** The box around a set of discs (every node when `active` is omitted). */
export function layoutBounds(
  layout: Pick<ForceLayout, 'x' | 'y' | 'radius' | 'count'>,
  active?: ArrayLike<number> | null,
): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (i: number) => {
    const r = layout.radius[i]!;
    minX = Math.min(minX, layout.x[i]! - r);
    maxX = Math.max(maxX, layout.x[i]! + r);
    minY = Math.min(minY, layout.y[i]! - r);
    maxY = Math.max(maxY, layout.y[i]! + r);
  };
  if (active) for (let k = 0; k < active.length; k++) visit(active[k]!);
  else for (let i = 0; i < layout.count; i++) visit(i);
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** The layout's nodes for a graph: every node, sized by its all-years figure. */
export function layoutNodes(graph: MoneyGraph): LayoutNode[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    cluster: clusterOf(n),
    radius: n.kind === 'grantor' ? HUB_RADIUS : nodeRadius(n.total),
  }));
}
export function layoutLinks(graph: MoneyGraph, nodes: readonly LayoutNode[]) {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  return graph.edges.flatMap((e) => {
    const a = index.get(e.source),
      b = index.get(e.target);
    return a === undefined || b === undefined ? [] : [{ a, b }];
  });
}

const layouts = new WeakMap<MoneyGraph, ForceLayout>();
/** One layout per loaded graph, kept while the graph is: Back finds it settled. */
export function layoutFor(graph: MoneyGraph, aspect: number): ForceLayout {
  let layout = layouts.get(graph);
  if (!layout) {
    const nodes = layoutNodes(graph);
    layout = new ForceLayout(nodes, layoutLinks(graph, nodes), aspect);
    layouts.set(graph, layout);
  }
  return layout;
}
/** Tests start each case without a cached layout. */
export function forgetLayouts() {
  // A WeakMap cannot be cleared; callers pass fresh graph objects instead.
}
