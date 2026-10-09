// ---------------------------------------------------------------------------
// The money map's palette. The 16 industry hues (and the neutral 'parties'
// grey) come from the design tokens (chart.industry), the map's only
// multi-colour element: each hue with an ink darkened for 4.5:1 text on
// paper. The two public-money hubs carry their own colour in the export.
//
// Party nodes are drawn in the neutral 'parties' grey and named beside
// their node: a party's colour is never drawn without its name.
// ---------------------------------------------------------------------------

import { chartIndustry } from '../../../design/tokens';

export type ClusterColour = { colour: string; ink: string };

/** The paper role (light), as GL needs a plain hex. */
export const SURFACE = '#FAF9F6';

/**
 * Cluster order fixes palette slots AND the legend order. Largest clusters
 * first (mirroring the source engine's largest-set-first hue assignment);
 * 'parties' leads because it is the map's centre.
 */
export const CLUSTER_COLOURS: ReadonlyMap<string, ClusterColour> = new Map(
  chartIndustry,
);

const FALLBACK = CLUSTER_COLOURS.get('other')!;

export function clusterColour(group: string): ClusterColour {
  return CLUSTER_COLOURS.get(group) ?? FALLBACK;
}

/**
 * A node's colour on the map: its industry's hue, a public-money hub's own
 * colour, and the neutral 'parties' grey for every party (named beside it).
 */
export function nodeColour(node: {
  kind: string;
  group: string;
  colour?: string;
}): string {
  if (node.kind === 'party') return clusterColour('parties').colour;
  return node.colour ?? clusterColour(node.group).colour;
}
