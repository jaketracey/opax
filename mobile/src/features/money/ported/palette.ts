// ---------------------------------------------------------------------------
// The money map's palette. The 16 industry hues (and the neutral 'parties'
// grey) come from the design tokens (chart.industry), the map's only
// multi-colour element: each hue with an ink for 4.5:1 text on the map's
// surface. The two public-money hubs carry their own colour in the export.
//
// Party discs carry their party's colour (the dot the rest of the app draws
// beside a party's name), with an ink for their labels; the largest are
// named beside their discs and the panel names any the reader taps, so a
// party is never told apart by colour alone (TestFlight build 43: "the
// parties dots [have] their colors").
//
// The map has two appearances (dark mode, 19 Nov 2026). Skia takes plain
// hex, so nothing here is a dynamic colour: `useMapTheme()` gives the
// theme on screen and everything drawn is built from it, and built again
// when the system changes. On dark the surface is the app's dark paper,
// the hues are the token's dark set (each 3:1 as a mark, its ink 4.5:1 as
// text), parties take the dark party dots, and a colour from the export
// is lifted until it reads as a mark.
// ---------------------------------------------------------------------------

import { useColorScheme } from 'react-native';
import {
  useHighTextContrast,
  useIncreaseContrast,
} from '../../../design/accessibility';
import { contrastRatio } from '../../../design/contrast';
import {
  darkHighContrast,
  lightHighContrast,
  paletteFor,
} from '../../../design/palette';
import { partyDot } from '../../../design/party';
import { chartIndustry, chartIndustryDark } from '../../../design/tokens';

export type ClusterColour = { colour: string; ink: string };
export type MapAppearance = 'light' | 'dark';

/**
 * What the map does when the system is dark. `dark` is the full dark map.
 * `sheet` is the fallback: the map stays a light sheet of paper inside the
 * dark app (the stage paints the sheet; every mark keeps its light colour).
 * Changing this one word is the whole switch.
 */
export type DarkMap = 'dark' | 'sheet';
export const DARK_MAP: DarkMap = 'dark';

/** The map's own colours, as hex: what Skia draws with. */
export interface MapTheme {
  /** Which set of marks is drawn. */
  appearance: MapAppearance;
  /** The ground the marks sit on (the paper role). */
  surface: string;
  /** Names, the focus halo and the overview's frame. */
  ink: string;
  /** The second line under a focused name. */
  inkSoft: string;
  /** The public-money register. */
  moneyInk: string;
  /** The map is a light sheet on a dark page: the stage paints `surface`. */
  sheet: boolean;
}

const themes = new Map<string, MapTheme>();

/**
 * The theme for a scheme. One object per answer, so it is safe in a
 * dependency list: a memo keyed on it is rebuilt exactly when the map's
 * colours change.
 */
export function mapTheme(
  scheme: 'light' | 'dark' | null | undefined = 'light',
  highContrast = false,
  darkMap: DarkMap = DARK_MAP,
): MapTheme {
  const sheet = scheme === 'dark' && darkMap === 'sheet';
  const appearance: MapAppearance =
    scheme === 'dark' && !sheet ? 'dark' : 'light';
  const key = `${appearance}:${highContrast}:${sheet}`;
  let theme = themes.get(key);
  if (!theme) {
    const palette = {
      ...paletteFor(appearance),
      ...(highContrast
        ? appearance === 'dark'
          ? darkHighContrast
          : lightHighContrast
        : null),
    };
    theme = {
      appearance,
      surface: palette.paper,
      ink: palette.ink,
      inkSoft: palette.inkSoft,
      moneyInk: palette.moneyInk,
      sheet,
    };
    themes.set(key, theme);
  }
  return theme;
}

/** The map's theme for the appearance on screen; follows a live switch. */
export function useMapTheme(): MapTheme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highText = useHighTextContrast();
  return mapTheme(scheme, contrast || highText);
}

/** The paper role (light), as GL needs a plain hex. */
export const SURFACE = mapTheme('light').surface;
/** The dark paper role. */
export const SURFACE_DARK = mapTheme('dark', false, 'dark').surface;
const surfaceOf = (appearance: MapAppearance) =>
  appearance === 'dark' ? SURFACE_DARK : SURFACE;

/**
 * Cluster order fixes palette slots AND the legend order. Largest clusters
 * first (mirroring the source engine's largest-set-first hue assignment);
 * 'parties' leads because it is the map's centre.
 */
export const CLUSTER_COLOURS: ReadonlyMap<string, ClusterColour> = new Map(
  chartIndustry,
);
export const CLUSTER_COLOURS_DARK: ReadonlyMap<string, ClusterColour> = new Map(
  chartIndustryDark,
);

export function clusterColour(
  group: string,
  appearance: MapAppearance = 'light',
): ClusterColour {
  const set = appearance === 'dark' ? CLUSTER_COLOURS_DARK : CLUSTER_COLOURS;
  return set.get(group) ?? set.get('other')!;
}

const toHex = (rgb: number[]) =>
  `#${rgb
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const luminanceOf = (hex: string) => contrastRatio(hex, '#000000');

/**
 * The colour moved in even steps away from the ground until it reaches the
 * ratio: darkened on a light ground, lightened on a dark one. A colour that
 * already reaches it comes back unchanged.
 */
function reach(hex: string, ground: string, ratio: number): string {
  let rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lighten = luminanceOf(ground) < luminanceOf('#777777');
  for (
    let step = 0;
    step < 48 && contrastRatio(toHex(rgb), ground) < ratio;
    step++
  )
    rgb = rgb.map((c) =>
      lighten ? c + Math.max(1, (255 - c) * 0.08) : Math.floor(c * 0.94),
    );
  return toHex(rgb);
}

/** The colour as text on the ground (4.5:1): darker on paper, lighter on dark. */
export function inkOn(hex: string, paper: string = SURFACE): string {
  return reach(hex, paper, 4.5);
}

/** The colour as a mark on the ground (3:1), for a colour the export chose. */
export function markOn(hex: string, paper: string = SURFACE): string {
  return reach(hex, paper, 3);
}

const partyColours = new Map<string, ClusterColour>();

/**
 * A party disc's colour and its label's ink: the party's own colour (the
 * app's party dot for the appearance), or the neutral 'parties' grey for a
 * label the app does not know as a party.
 */
export function partyMapColour(
  label: string,
  appearance: MapAppearance = 'light',
): ClusterColour {
  const key = `${appearance}:${label}`;
  let found = partyColours.get(key);
  if (!found) {
    const colour =
      partyDot(label, appearance) ??
      clusterColour('parties', appearance).colour;
    found = { colour, ink: inkOn(colour, surfaceOf(appearance)) };
    partyColours.set(key, found);
  }
  return found;
}

/**
 * A node's colour on the map: its industry's hue, a public-money hub's own
 * colour, and a party's own colour (named beside it). On dark a colour from
 * the export is lifted until it reads as a mark; on paper it is drawn as
 * sent.
 */
export function nodeColour(
  node: {
    kind: string;
    group: string;
    label?: string;
    colour?: string;
  },
  appearance: MapAppearance = 'light',
): string {
  if (node.kind === 'party')
    return partyMapColour(node.label ?? '', appearance).colour;
  if (!node.colour) return clusterColour(node.group, appearance).colour;
  return appearance === 'dark'
    ? markOn(node.colour, SURFACE_DARK)
    : node.colour;
}
