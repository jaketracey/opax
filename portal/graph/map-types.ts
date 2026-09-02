// ---------------------------------------------------------------------------
// The types and pure helpers the 3D engine needs, extracted from corpuskit's
// KnowledgeMap.tsx (the React 2D map was NOT ported - only its contract).
// Extended for the money map: nodes carry the donation attributes the info
// card shows, and an optional per-node colour override for party nodes.
// ---------------------------------------------------------------------------

export type MapNode = {
  id: string
  label: string
  /** Cluster key - the territory the node lives in (industry, or 'parties'). */
  group: string
  /** Drives node radius via radiusFor(measure, weight). */
  weight: number
  /** 'donor' | 'party'. */
  kind?: string
  /** Raw industry classification (finer than group) - shown on the card. */
  industry?: string
  /** Lifetime dollars. */
  total?: number
  /** Donation rows aggregated into this node. */
  count?: number
  firstYear?: number | null
  lastYear?: number | null
  /** Overrides the group colour (party nodes carry their party's colour). */
  colour?: string
}

export type MapEdge = {
  source: string
  target: string
  /** Shown on the emphasised edge (formatted dollars). */
  label: string
  /** Drives tube width, log scaled. */
  weight: number
  total?: number
  count?: number
  firstYear?: number | null
  lastYear?: number | null
  /**
   * Set on an AGGREGATED flow the engine synthesises while an industry
   * cluster is collapsed into a hub: the cluster's group. Its `source` is the
   * hub id (`hub:<group>`), not a donor, and `count` is the number of donors
   * folded into it.
   */
  hub?: string
}

export type MapLayout = 'grouped' | 'free'
export type MapMeasure = 'links' | 'resources'

export type GroupStyle = {
  /** Index into the palette's colour list. */
  slot: number
  /** Fill for marks (hex). */
  colour: string
  /** The same hue darkened to clear 4.5:1 on the surface - safe for text. */
  ink: string
  /** True when hues are reused as rings; unused here (unique hue per group). */
  hollow: boolean
  count: number
}

/**
 * How much of the canvas floating panels are covering, in canvas pixels:
 * the legend on the left, the find box along the top, the zoom buttons on
 * the right, the scrub and hint along the bottom, and the info card when it
 * is open. The fit and every focus move centre the scene in what is left.
 */
export type Insets = { left: number; right: number; top: number; bottom: number }

/** Canvas label - long donor names get an ellipsis; the card shows the full name. */
export function shortLabel(label: string): string {
  return label.length > 34 ? `${label.slice(0, 32)}…` : label
}

/** Dollars for labels and cards: $1.2b / $12.3m / $46k / $123. */
export function formatMoney(value: number): string {
  const v = Math.abs(value)
  if (v >= 1e9) return `$${(value / 1e9).toFixed(1)}b`
  if (v >= 1e6) return `$${(value / 1e6).toFixed(1)}m`
  if (v >= 1e3) return `$${Math.round(value / 1e3)}k`
  return `$${Math.round(value)}`
}

/**
 * Node radius. The money map sizes by dollars on a log scale ('resources'
 * measure): weight = dollars / 10,000 puts a $10k donor at ~7.5 and caps
 * around $100m, so four orders of magnitude stay readable side by side.
 */
export function radiusFor(measure: MapMeasure, value: number): number {
  const safe = Math.max(0, value)
  return measure === 'links'
    ? Math.min(26, 5.5 + 3.6 * Math.sqrt(safe))
    : Math.max(7, Math.min(26, 6 + 5.2 * Math.log10(1 + safe)))
}

/** Edges touching each node - the engine's measure of connectedness. */
export function buildDegrees(edges: MapEdge[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1)
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1)
  }
  return degrees
}
