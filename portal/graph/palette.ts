// ---------------------------------------------------------------------------
// The money map's palette. The corpuskit engine resolved its colours from
// tenant CSS tokens (--rp-cat-*); the portal has no such tokens, so this
// module is the single self-contained source of truth: one hue per industry
// cluster, plus an ink (darkened for 4.5:1 text on the paper surface), the
// paper surface itself, and the selection accent.
//
// Party nodes override their cluster hue with their party's conventional
// colour (carried per-node in money.json), so the central 'parties'
// territory is a neutral grey holding individually coloured spheres.
// ---------------------------------------------------------------------------

export type ClusterColour = { colour: string; ink: string }

export const SURFACE = '#FAF9F6'
export const ACCENT = '#C28E0E'
/** The grantor node and its flows: public money, a teal no industry uses. */
export const GRANTOR_COLOUR = '#2A7F76'

/**
 * Cluster order fixes palette slots AND the legend order. Largest clusters
 * first (mirroring the source engine's largest-set-first hue assignment);
 * 'parties' leads because it is the map's centre.
 */
export const CLUSTER_COLOURS: ReadonlyMap<string, ClusterColour> = new Map([
  ['parties', { colour: '#9AA0A8', ink: '#5A616B' }],
  ['unions', { colour: '#E15759', ink: '#A93843' }],
  ['finance', { colour: '#4E79A7', ink: '#365F86' }],
  ['individuals', { colour: '#79706E', ink: '#57504E' }],
  ['property', { colour: '#F28E2B', ink: '#A85A0F' }],
  ['mining & energy', { colour: '#9C755F', ink: '#6E4F3D' }],
  ['hospitality', { colour: '#EDC948', ink: '#7A6414' }],
  ['media & tech', { colour: '#76B7B2', ink: '#3E7A75' }],
  ['health & pharma', { colour: '#59A14F', ink: '#3B7134' }],
  ['gambling', { colour: '#B07AA1', ink: '#7D5273' }],
  ['legal & lobbying', { colour: '#6A51A3', ink: '#4A3775' }],
  ['defence & security', { colour: '#37474F', ink: '#263238' }],
  ['agriculture', { colour: '#6B8E23', ink: '#4A6318' }],
  ['retail', { colour: '#FF9DA7', ink: '#B04A56' }],
  ['tobacco & alcohol', { colour: '#A65628', ink: '#7A3C1B' }],
  ['other', { colour: '#999966', ink: '#6B6B3D' }],
])

const FALLBACK: ClusterColour = { colour: '#999966', ink: '#6B6B3D' }

export function clusterColour(group: string): ClusterColour {
  return CLUSTER_COLOURS.get(group) ?? FALLBACK
}
