// ---------------------------------------------------------------------------
// A 3D port of the d3-force setup in KnowledgeMap.tsx's useLiveSimulation, for
// the three.js knowledge-graph scene. Same integration scheme, same forces,
// same constants - just one more axis, and no DOM/React dependency so it can
// be ticked synchronously from a render loop. Three's convention (Y is up)
// governs every coordinate this module produces.
//
// This is deliberately NOT built on d3-force: d3's forces are 2D-only (no z),
// and a from-scratch port keeps the physics in one auditable place rather
// than fighting the library's types for a dimension it doesn't have. Pairwise
// passes are plain O(n^2) loops throughout - fine at the graph sizes this map
// draws (n <= ~500) and it avoids a quadtree with no established 3D analogue
// for the many-body force to lean on.
// ---------------------------------------------------------------------------

export type MapLayout3D = 'grouped' | 'free'

export type SimNode3D = {
  id: string
  group: string
  /** Collision radius in simulation units. */
  radius: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Pinned position while dragging; null when free. */
  fx: number | null
  fy: number | null
  fz: number | null
}

export type SimLink3D = { source: string; target: string }

export type Centre3D = { x: number; y: number; z: number; r: number }

// ---------------------------------------------------------------------------
// Integration constants, ported verbatim from d3-force's defaults (see
// forceSimulation and the .velocityDecay(0.4) d3 assumes unless overridden -
// KnowledgeMap.tsx never touches either, so both are d3's stock values).
// ---------------------------------------------------------------------------

const ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 300)
/** velocityDecay 0.4 -> retain (1 - 0.4) of velocity each tick. */
const VELOCITY_RETAIN = 0.6
const REHEAT_ALPHA_TARGET = 0.25
const REHEAT_ALPHA_MIN = 0.25

/** The origin, and the fallback centre for a group clusterCentres3D never sized. */
const ORIGIN_CENTRE: Centre3D = { x: 0, y: 0, z: 0, r: 120 }

// ---------------------------------------------------------------------------
// A tiny seeded LCG - the same generator MapConstellation uses (seed 7,
// Numerical-Recipes constants) - so every random touch in this module is
// reproducible. Each ForceSim3D gets its own instance, seeded the same way,
// so two sims built from identical input tick to bit-identical positions.
// ---------------------------------------------------------------------------

class Lcg {
  private state = 7

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296
    return this.state / 4294967296
  }

  /** d3's own jiggle: a near-zero nudge that breaks an exact coincidence. */
  jiggle(): number {
    return (this.next() - 0.5) * 1e-6
  }
}

// ---------------------------------------------------------------------------
// Cluster centres - a 3D port of clusterCentres (KnowledgeMap.tsx:242-287).
// Categories sit on an ellipse in the ground (XZ) plane, aspect-stretched the
// same way the 2D map stretches to the viewport, with alternating Y offsets
// so the ring isn't flat and orbiting the map actually reveals depth. The
// ring radius is grown - exactly like the 2D version - by solving for the
// smallest scale at which no two blobs overlap, using the UNIT-ellipse
// points: every coordinate here (x, z from the ellipse, y from the fixed
// +-0.18 offset) scales linearly with the ring, so the closed-form division
// that works in 2D carries over unchanged into 3D.
// ---------------------------------------------------------------------------

/**
 * Points spaced evenly along the ellipse's PERIMETER, not evenly in angle -
 * ported unchanged from KnowledgeMap.tsx's ellipseAngles. On a stretched
 * ring, equal angles bunch categories at the flat ends; equal arc length
 * keeps them apart. Plane-agnostic: the caller decides which two axes sx/sy
 * address (here, X and Z).
 */
function ellipseAngles(n: number, sx: number, sy: number): number[] {
  const steps = 720
  const cumulative = new Float64Array(steps + 1)
  let prevX = sx
  let prevY = 0
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const x = Math.cos(t) * sx
    const y = Math.sin(t) * sy
    cumulative[i] = (cumulative[i - 1] ?? 0) + Math.hypot(x - prevX, y - prevY)
    prevX = x
    prevY = y
  }
  const total = cumulative[steps] ?? 1
  const angles: number[] = []
  let cursor = 0
  for (let k = 0; k < n; k++) {
    // Same three-quarter-perimeter offset as the 2D version, so the largest
    // category lands at a consistent, predictable point on the ring.
    const target = ((k / n + 0.75) % 1) * total
    cursor = 0
    while (cursor < steps && (cumulative[cursor + 1] ?? total) < target) cursor++
    angles.push((cursor / steps) * Math.PI * 2)
  }
  return angles
}

/** Empirical blob radius a category settles into - identical formula to the 2D map. */
function blobR(count: number): number {
  return 30 * Math.sqrt(Math.max(1, count)) + 34
}

/**
 * Where each category sits in 3D. Groups are laid out on an ellipse in the
 * XZ (ground) plane whose x-stretch follows the viewport aspect, with
 * alternating vertical (Y) offsets so orbiting the map reveals depth. The
 * ring is grown until no two group blobs overlap, checked over every pair.
 * `groups` maps group name -> node count; this function trusts the caller's
 * iteration order (largest-first, as buildGroupStyles produces for the 2D
 * map) rather than re-sorting it.
 */
export function clusterCentres3D(
  groups: Map<string, number>,
  aspect: number,
  /**
   * Money-map addition: a group pinned to the origin (the parties), with the
   * remaining groups ringed around it and the ring grown until none of them
   * overlaps the central blob either.
   */
  centralGroup?: string,
): Map<string, Centre3D> {
  let entries = [...groups.entries()]
  const centres = new Map<string, Centre3D>()
  if (entries.length === 0) return centres
  let centralR = 0
  if (centralGroup !== undefined && groups.has(centralGroup) && entries.length > 1) {
    centralR = blobR(groups.get(centralGroup) ?? 1)
    centres.set(centralGroup, { x: 0, y: 0, z: 0, r: centralR })
    entries = entries.filter(([group]) => group !== centralGroup)
  }
  if (entries.length === 1) {
    const only = entries[0]
    if (only) {
      const off = centralR > 0 ? centralR + blobR(only[1]) : 0
      centres.set(only[0], { x: off, y: 0, z: 0, r: blobR(only[1]) })
    }
    return centres
  }
  const n = entries.length
  const stretch = Math.pow(Math.max(0.7, Math.min(2.2, aspect)), 0.85)
  const angles = ellipseAngles(n, stretch, 1 / stretch)
  // Unit (ring = 1) points. Y is a fixed +-0.26 rather than derived from the
  // ellipse, but it still scales linearly with the ring below, so it can
  // share the same closed-form solve as x and z. The alternation is what
  // separates ring-adjacent clusters on screen when the camera looks along
  // the ring - without it they stack straight behind one another.
  const unit = angles.map((a, i) => ({
    x: Math.cos(a) * stretch,
    y: i % 2 === 0 ? 0.26 : -0.26,
    z: Math.sin(a) / stretch,
  }))
  let ring = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = unit[i]
      const b = unit[j]
      const ea = entries[i]
      const eb = entries[j]
      if (!a || !b || !ea || !eb) continue
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
      if (gap <= 0) continue
      ring = Math.max(ring, (blobR(ea[1]) + blobR(eb[1])) / gap)
    }
  }
  // A wider margin than the 2D map's 1.04: a 3D ring is seen in projection,
  // where clusters that merely touch read as one merged mass.
  ring *= 1.18
  // The ring must also clear the central blob: each unit point sits at
  // |unit_i| * ring from the origin, and that distance has to exceed the
  // central radius plus the ring blob's own.
  if (centralR > 0) {
    entries.forEach(([, count], i) => {
      const point = unit[i]
      if (!point) return
      const len = Math.hypot(point.x, point.y, point.z)
      if (len <= 0) return
      ring = Math.max(ring, ((centralR + blobR(count)) * 1.12) / len)
    })
  }
  entries.forEach(([group, count], i) => {
    const point = unit[i] ?? { x: 0, y: 0, z: 0 }
    centres.set(group, { x: point.x * ring, y: point.y * ring, z: point.z * ring, r: blobR(count) })
  })
  return centres
}

// ---------------------------------------------------------------------------
// Initial placement. A node whose caller already knows a position (surviving
// a data change) keeps it exactly - that is how the renderer avoids nodes
// jumping when the data set changes underneath it. Everything else gets a
// deterministic starting point so the sim never depends on Math.random():
// d3's own node-init spiral (radius growing as 9*sqrt(i+0.5), the same shape
// KnowledgeMap.tsx inherits from d3-force's defaults) generalised from a flat
// circle to a sphere via the golden-angle (Fibonacci sphere) construction, so
// points spread in 3D instead of stacking in a plane. `i` and `total` are
// both scoped per GROUP, counting only the nodes that actually need placing.
// ---------------------------------------------------------------------------

type NodeInit3D = {
  id: string
  group: string
  radius: number
  x?: number
  y?: number
  z?: number
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function isPlaced(node: NodeInit3D): node is NodeInit3D & { x: number; y: number; z: number } {
  return node.x !== undefined && node.y !== undefined && node.z !== undefined
}

function placeNodes(
  inputs: NodeInit3D[],
  layout: MapLayout3D,
  centres: Map<string, Centre3D>,
): SimNode3D[] {
  const totals = new Map<string, number>()
  let globalTotal = 0
  for (const node of inputs) {
    if (!isPlaced(node)) {
      totals.set(node.group, (totals.get(node.group) ?? 0) + 1)
      globalTotal += 1
    }
  }
  const counters = new Map<string, number>()
  // The free layout spirals every group around the SAME origin, so the index
  // must be global there - a per-group index puts the i-th node of two
  // equal-sized groups at identical coordinates, and coincident nodes turn
  // the charge force into an explosion.
  let globalIndex = 0
  return inputs.map((node) => {
    if (isPlaced(node)) {
      return {
        id: node.id,
        group: node.group,
        radius: node.radius,
        x: node.x,
        y: node.y,
        z: node.z,
        vx: 0,
        vy: 0,
        vz: 0,
        fx: null,
        fy: null,
        fz: null,
      }
    }
    const groupI = counters.get(node.group) ?? 0
    counters.set(node.group, groupI + 1)
    const i = layout === 'grouped' ? groupI : globalIndex++
    const total = (layout === 'grouped' ? totals.get(node.group) : globalTotal) ?? 1
    const centre = layout === 'grouped' ? centres.get(node.group) ?? ORIGIN_CENTRE : ORIGIN_CENTRE
    const rho = 9 * Math.sqrt(i + 0.5)
    const theta = i * GOLDEN_ANGLE
    // Standard Fibonacci-sphere z: spreads the i-th of `total` points evenly
    // over a unit sphere's surface without ever repeating a direction.
    const zu = 1 - (2 * (i + 0.5)) / total
    const ringXZ = Math.sqrt(Math.max(0, 1 - zu * zu))
    return {
      id: node.id,
      group: node.group,
      radius: node.radius,
      x: centre.x + rho * ringXZ * Math.cos(theta),
      y: centre.y + rho * zu,
      z: centre.z + rho * ringXZ * Math.sin(theta),
      vx: 0,
      vy: 0,
      vz: 0,
      fx: null,
      fy: null,
      fz: null,
    }
  })
}

// ---------------------------------------------------------------------------
// Links - resolved once at construction (ids -> node refs, distance/strength
// from group membership, and the degree-weighted bias d3-force's forceLink
// uses to split a link's correction unevenly between its two ends). None of
// this depends on position, so it never needs recomputing per tick.
// ---------------------------------------------------------------------------

type ResolvedLink3D = {
  source: SimNode3D
  target: SimNode3D
  distance: number
  strength: number
  bias: number
}

function buildLinks3D(
  links: SimLink3D[],
  byId: Map<string, SimNode3D>,
  layout: MapLayout3D,
): ResolvedLink3D[] {
  const valid: SimLink3D[] = []
  const degree = new Map<string, number>()
  for (const link of links) {
    if (!byId.has(link.source) || !byId.has(link.target)) continue
    valid.push(link)
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
  }
  const resolved: ResolvedLink3D[] = []
  for (const link of valid) {
    const source = byId.get(link.source)
    const target = byId.get(link.target)
    if (!source || !target) continue
    const sameGroup = source.group === target.group
    const distance = layout === 'grouped' ? (sameGroup ? 62 : 190) : 76
    const strength = layout === 'grouped' ? (sameGroup ? 0.5 : 0.015) : 0.6
    const sourceDeg = degree.get(link.source) ?? 0
    const targetDeg = degree.get(link.target) ?? 0
    resolved.push({ source, target, distance, strength, bias: sourceDeg / (sourceDeg + targetDeg) })
  }
  return resolved
}

// ---------------------------------------------------------------------------
// The simulation itself.
// ---------------------------------------------------------------------------

export class ForceSim3D {
  /** Live nodes - the renderer reads x/y/z from these every frame. */
  readonly nodes: SimNode3D[]
  private readonly nodesById: Map<string, SimNode3D>
  private readonly links: ResolvedLink3D[]
  private readonly layout: MapLayout3D
  private readonly centres: Map<string, Centre3D>
  private readonly rng = new Lcg()
  private simAlpha = 1
  private simAlphaTarget = 0

  constructor(opts: {
    nodes: NodeInit3D[]
    links: SimLink3D[]
    layout: MapLayout3D
    /** Cluster centre per group; ignored for the 'free' layout. */
    centres: Map<string, Centre3D>
  }) {
    this.layout = opts.layout
    this.centres = opts.centres
    this.nodes = placeNodes(opts.nodes, opts.layout, opts.centres)
    this.nodesById = new Map(this.nodes.map((node) => [node.id, node]))
    this.links = buildLinks3D(opts.links, this.nodesById, opts.layout)
  }

  byId(id: string): SimNode3D | undefined {
    return this.nodesById.get(id)
  }

  alpha(): number {
    return this.simAlpha
  }

  /** Wake for an interaction (drag): alphaTarget 0.25 and alpha at least 0.25. */
  reheat(): void {
    this.simAlphaTarget = REHEAT_ALPHA_TARGET
    this.simAlpha = Math.max(this.simAlpha, REHEAT_ALPHA_MIN)
  }

  /** Let it cool back down: alphaTarget 0. */
  cool(): void {
    this.simAlphaTarget = 0
  }

  /** Pin a node (drag) - takes effect at the next tick's integrate step, like d3's fx/fy. */
  pin(id: string, x: number, y: number, z: number): void {
    const node = this.nodesById.get(id)
    if (!node) return
    node.fx = x
    node.fy = y
    node.fz = z
  }

  unpin(id: string): void {
    const node = this.nodesById.get(id)
    if (!node) return
    node.fx = null
    node.fy = null
    node.fz = null
  }

  /** Advance the simulation n ticks (default 1) synchronously. */
  tick(n = 1): void {
    for (let i = 0; i < n; i++) this.stepOnce()
  }

  private stepOnce(): void {
    this.simAlpha += (this.simAlphaTarget - this.simAlpha) * ALPHA_DECAY
    // Force order matches KnowledgeMap.tsx's useLiveSimulation exactly:
    // charge, link, (free layout's forceCenter equivalent), positional pull,
    // collide last - each force is registered once and d3 runs them in
    // registration order, so the order here is the order that matters.
    this.applyCharge()
    this.applyLink()
    if (this.layout === 'free') this.applyCenterMeanShift()
    this.applyPositional()
    this.applyCollide()
    for (const node of this.nodes) {
      if (node.fx !== null && node.fy !== null && node.fz !== null) {
        node.x = node.fx
        node.y = node.fy
        node.z = node.fz
        node.vx = 0
        node.vy = 0
        node.vz = 0
      } else {
        node.vx *= VELOCITY_RETAIN
        node.vy *= VELOCITY_RETAIN
        node.vz *= VELOCITY_RETAIN
        node.x += node.vx
        node.y += node.vy
        node.z += node.vz
      }
    }
  }

  private centreOf(group: string): Centre3D {
    return this.centres.get(group) ?? ORIGIN_CENTRE
  }

  /** Many-body repulsion - grouped: -165/300; free: -150/520 (KnowledgeMap.tsx constants). */
  private applyCharge(): void {
    const strength = this.layout === 'grouped' ? -165 : -150
    const distanceMax = this.layout === 'grouped' ? 300 : 520
    const dMax2 = distanceMax * distanceMax
    const nodes = this.nodes
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (!a) continue
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        if (!b) continue
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dz = b.z - a.z
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 === 0) {
          dx = this.rng.jiggle()
          dy = this.rng.jiggle()
          dz = this.rng.jiggle()
          d2 = dx * dx + dy * dy + dz * dz
        }
        if (d2 >= dMax2) continue
        // d3-manyBody's distanceMin clamp (distanceMin = 1): without it, two
        // near-coincident nodes get a near-infinite kick and the layout
        // detonates instead of separating.
        if (d2 < 1) d2 = Math.sqrt(d2)
        const w = (strength * this.simAlpha) / d2
        a.vx += dx * w
        a.vy += dy * w
        a.vz += dz * w
        b.vx -= dx * w
        b.vy -= dy * w
        b.vz -= dz * w
      }
    }
  }

  /** d3-force's exact link formula (distance/strength per link, degree-weighted bias). */
  private applyLink(): void {
    for (const link of this.links) {
      const { source, target, distance, strength, bias } = link
      let dx = target.x + target.vx - source.x - source.vx
      let dy = target.y + target.vy - source.y - source.vy
      let dz = target.z + target.vz - source.z - source.vz
      let l = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (l === 0) {
        dx = this.rng.jiggle()
        dy = this.rng.jiggle()
        dz = this.rng.jiggle()
        l = Math.sqrt(dx * dx + dy * dy + dz * dz)
      }
      const scale = ((l - distance) / l) * this.simAlpha * strength
      dx *= scale
      dy *= scale
      dz *= scale
      target.vx -= dx * bias
      target.vy -= dy * bias
      target.vz -= dz * bias
      const inv = 1 - bias
      source.vx += dx * inv
      source.vy += dy * inv
      source.vz += dz * inv
    }
  }

  /**
   * The 'free' layout's forceCenter equivalent - exactly d3.forceCenter: a
   * direct position shift (not a velocity nudge) that mean-shifts the whole
   * node set so its centroid sits at the origin. Runs where KnowledgeMap.tsx
   * registers 'center', before the positional pull.
   */
  private applyCenterMeanShift(): void {
    const nodes = this.nodes
    const count = nodes.length
    if (count === 0) return
    let sx = 0
    let sy = 0
    let sz = 0
    for (const node of nodes) {
      sx += node.x
      sy += node.y
      sz += node.z
    }
    const dx = sx / count
    const dy = sy / count
    const dz = sz / count
    for (const node of nodes) {
      node.x -= dx
      node.y -= dy
      node.z -= dz
    }
  }

  /** forceX/Y/Z equivalent - grouped pulls to the group centre (0.15); free pulls to the origin (0.055). */
  private applyPositional(): void {
    const strength = this.layout === 'grouped' ? 0.15 : 0.055
    for (const node of this.nodes) {
      const target = this.layout === 'grouped' ? this.centreOf(node.group) : ORIGIN_CENTRE
      node.vx += (target.x - node.x) * strength * this.simAlpha
      node.vy += (target.y - node.y) * strength * this.simAlpha
      node.vz += (target.z - node.z) * strength * this.simAlpha
    }
  }

  /** d3-force's exact collide scheme (1 iteration): radius + 5, strength 0.9, rj^2/(ri^2+rj^2) weighting. */
  private applyCollide(): void {
    const nodes = this.nodes
    const strength = 0.9
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (!a) continue
      const ri = a.radius + 5
      const ri2 = ri * ri
      const xi = a.x + a.vx
      const yi = a.y + a.vy
      const zi = a.z + a.vz
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        if (!b) continue
        const rj = b.radius + 5
        const r = ri + rj
        let dx = xi - (b.x + b.vx)
        let dy = yi - (b.y + b.vy)
        let dz = zi - (b.z + b.vz)
        let l = dx * dx + dy * dy + dz * dz
        if (l >= r * r) continue
        if (dx === 0) {
          dx = this.rng.jiggle()
          l += dx * dx
        }
        if (dy === 0) {
          dy = this.rng.jiggle()
          l += dy * dy
        }
        if (dz === 0) {
          dz = this.rng.jiggle()
          l += dz * dz
        }
        l = Math.sqrt(l)
        const scale = ((r - l) / l) * strength
        const dxs = dx * scale
        const dys = dy * scale
        const dzs = dz * scale
        const rj2 = rj * rj
        const weightA = rj2 / (ri2 + rj2)
        const weightB = 1 - weightA
        a.vx += dxs * weightA
        a.vy += dys * weightA
        a.vz += dzs * weightA
        b.vx -= dxs * weightB
        b.vy -= dys * weightB
        b.vz -= dzs * weightB
      }
    }
  }
}
