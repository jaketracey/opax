// ---------------------------------------------------------------------------
// The money map's palette. The 16 industry hues (and the neutral 'parties'
// grey) come from the design tokens (chart.industry), the map's only
// multi-colour element: each hue with an ink darkened for 4.5:1 text on
// paper. The two public-money hubs carry their own colour in the export.
//
// Party discs carry their party's colour (the dot the rest of the app draws
// beside a party's name), darkened for their labels; the largest are named
// beside their discs and the panel names any the reader taps, so a party is
// never told apart by colour alone (TestFlight build 43: "the parties dots
// [have] their colors").
// ---------------------------------------------------------------------------

import { contrastRatio } from '../../../design/contrast';
import { partyDot } from '../../../design/party';
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

const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;

/** The colour darkened in even steps until it reads as text on paper (4.5:1). */
export function inkOn(hex: string, paper: string = SURFACE): string {
  let rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (
    let step = 0;
    step < 48 && contrastRatio(toHex(rgb), paper) < 4.5;
    step++
  )
    rgb = rgb.map((c) => Math.floor(c * 0.94));
  return toHex(rgb);
}

const partyColours = new Map<string, ClusterColour>();

/**
 * A party disc's colour and its label's ink: the party's own colour (the
 * app's party dot), or the neutral 'parties' grey for a label the app does
 * not know as a party.
 */
export function partyMapColour(label: string): ClusterColour {
  let found = partyColours.get(label);
  if (!found) {
    const colour = partyDot(label, 'light') ?? clusterColour('parties').colour;
    found = { colour, ink: inkOn(colour) };
    partyColours.set(label, found);
  }
  return found;
}

/**
 * A node's colour on the map: its industry's hue, a public-money hub's own
 * colour, and a party's own colour (named beside it).
 */
export function nodeColour(node: {
  kind: string;
  group: string;
  label?: string;
  colour?: string;
}): string {
  if (node.kind === 'party') return partyMapColour(node.label ?? '').colour;
  return node.colour ?? clusterColour(node.group).colour;
}
