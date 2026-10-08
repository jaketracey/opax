import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';
import {
  light,
  lightHighContrast,
  partyColors,
  partyWashes,
  type Palette,
  type Role,
} from './palette';

export { light, partyColors, partyWashes };
export type { Palette, Role };

// Every colour goes through a role. iOS resolves Increase Contrast natively;
// the app is light-only in v1, so `dark` repeats light until a dark palette
// is approved (decision 2).
function resolve(role: Role): ColorValue {
  const base = light[role];
  if (Platform.OS !== 'ios') return base;
  return DynamicColorIOS({
    light: base,
    dark: base,
    highContrastLight: lightHighContrast[role] ?? base,
    highContrastDark: lightHighContrast[role] ?? base,
  });
}
export const colors = Object.fromEntries(
  (Object.keys(light) as Role[]).map((role) => [role, resolve(role)]),
) as Record<Role, ColorValue>;

// Native chrome (tab bar, navigation bar, symbols) takes plain hex values.
export const chrome = {
  tint: light.navy,
  inactive: light.inkSoft,
  title: light.ink,
};

// The web's phone spacing scale, rounded to points (IOS-UX section 5).
export const spacing = { s1: 4, s2: 6, s3: 8, s4: 16, s5: 26, s6: 32, s7: 52 };

/**
 * Vertical rhythm: one scale, applied everywhere (UI sweep, Oct 2026).
 * Section → heading → body → rows always step by these, never ad hoc gaps.
 */
export const rhythm = {
  /** A line bound to the line above: a date under a title, a value's label. */
  line: 4,
  /** Inside a row or group: a name to its party line, a label to its value. */
  tight: 8,
  /** A section heading to its first block. */
  heading: 12,
  /** Between blocks inside a section. */
  block: 16,
  /** A second list or group inside a section. */
  group: 24,
  /** Between sections (the rule sits at the top of each). */
  section: 36,
  /** Screen edge to content. */
  screen: 20,
} as const;

export const layout = {
  screenMargin: rhythm.screen,
  // 10pt either side of a hairline between rows.
  rowGap: 10,
  // A second list within a section.
  subGap: rhythm.group,
  // Sections start 36pt down.
  sectionGap: rhythm.section,
};

/**
 * Category accents for symbols, figures, tinted tiles and section headers:
 * money (green), votes (indigo), interests (plum), bills (teal), people and
 * places (navy), leads (bronze). `ink` is text-safe on paper, raised and the
 * accent's own `wash`.
 */
export type Accent =
  | 'money'
  | 'votes'
  | 'interests'
  | 'bills'
  | 'people'
  | 'places'
  | 'leads';
export const accents: Record<Accent, { ink: Role; wash: Role }> = {
  money: { ink: 'moneyInk', wash: 'moneyWash' },
  votes: { ink: 'votesInk', wash: 'votesWash' },
  interests: { ink: 'interestsInk', wash: 'interestsWash' },
  bills: { ink: 'billsInk', wash: 'billsWash' },
  people: { ink: 'navy', wash: 'navyWash' },
  places: { ink: 'navy', wash: 'navyWash' },
  leads: { ink: 'bronzeInk', wash: 'bronzeWash' },
};
// One CSS pixel is one point: rules are 1pt, not the device hairline.
export const hairline = 1;
export const radius = 4;
export const minimumTarget = Platform.OS === 'android' ? 48 : 44;
// Minimum heights; controls grow with their text rather than clipping.
export const controlHeight = {
  compact: minimumTarget,
  default: 48,
  large: 56,
} as const;
export type ControlSize = keyof typeof controlHeight;

// Static upstream instances, registered under these names in app/_layout.tsx.
// Merriweather has no static SemiBold upstream; Bold stands in for the web's 600.
export const fonts = {
  serif: 'Merriweather',
  serifBold: 'Merriweather-Bold',
  sans: 'PublicSans',
  sansSemiBold: 'PublicSans-SemiBold',
  sansBold: 'PublicSans-Bold',
} as const;
export type FontFamily = (typeof fonts)[keyof typeof fonts];

export type DynamicTypeRamp =
  | 'caption2'
  | 'caption1'
  | 'footnote'
  | 'subheadline'
  | 'callout'
  | 'body'
  | 'headline'
  | 'title3'
  | 'title2'
  | 'title1'
  | 'largeTitle';
export interface TextRole {
  fontFamily: FontFamily;
  fontSize: number;
  lineHeight: number;
  dynamicTypeRamp: DynamicTypeRamp;
  color: Role;
  tabular?: boolean;
}
// Type roles mapped to iOS Dynamic Type ramps (IOS-UX section 5, "Type").
// Every size scales to AX5 with no cap; nothing sets a line limit.
export const textStyles = {
  // In-content page title (a profile's name). Root screens use the native large title.
  title: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 42,
    dynamicTypeRamp: 'largeTitle',
    color: 'ink',
  },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    lineHeight: 30,
    dynamicTypeRamp: 'title2',
    color: 'ink',
  },
  subheading: {
    fontFamily: fonts.serifBold,
    fontSize: 18,
    lineHeight: 24,
    dynamicTypeRamp: 'title3',
    color: 'ink',
  },
  // Record text (P1 reader, reports): line spacing near 1.7.
  record: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 29,
    dynamicTypeRamp: 'body',
    color: 'ink',
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 25,
    dynamicTypeRamp: 'body',
    color: 'ink',
  },
  // Emphasised interface text: names in rows, values in key-value lists.
  strong: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    lineHeight: 25,
    dynamicTypeRamp: 'body',
    color: 'ink',
  },
  lede: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    dynamicTypeRamp: 'callout',
    color: 'ink',
  },
  metadata: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    dynamicTypeRamp: 'subheadline',
    color: 'inkSoft',
  },
  // Fine print, source and as-at lines.
  fine: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    dynamicTypeRamp: 'footnote',
    color: 'inkSoft',
  },
  // The number a block is about ("$1,284,310"): Merriweather, display size.
  display: {
    fontFamily: fonts.serifBold,
    fontSize: 34,
    lineHeight: 42,
    dynamicTypeRamp: 'largeTitle',
    color: 'ink',
    tabular: true,
  },
  // Figures in tiles: tabular so columns of numbers align.
  figure: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    lineHeight: 34,
    dynamicTypeRamp: 'title1',
    color: 'ink',
    tabular: true,
  },
  // Figures inside rows and running lists.
  figureInline: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    lineHeight: 25,
    dynamicTypeRamp: 'body',
    color: 'ink',
    tabular: true,
  },
  tag: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    dynamicTypeRamp: 'footnote',
    color: 'bronzeInk',
  },
  kicker: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    dynamicTypeRamp: 'footnote',
    color: 'inkSoft',
  },
  // One quiet line per block: "Updated 4 Oct 2026".
  caption: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    dynamicTypeRamp: 'caption1',
    color: 'inkSoft',
  },
  // Party chips and small labels in tinted capsules.
  chip: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 17,
    dynamicTypeRamp: 'footnote',
    color: 'ink',
  },
  // Button and control labels.
  control: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    lineHeight: 22,
    dynamicTypeRamp: 'body',
    color: 'ink',
  },
  // Voice countdown (voice lane).
  countdown: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    lineHeight: 22,
    dynamicTypeRamp: 'body',
    color: 'ink',
    tabular: true,
  },
} as const satisfies Record<string, TextRole>;
export type TextVariant = keyof typeof textStyles;

// Bold Text (iOS accessibility setting) steps each family one weight up.
export const boldStep: Record<FontFamily, FontFamily> = {
  [fonts.serif]: fonts.serifBold,
  [fonts.serifBold]: fonts.serifBold,
  [fonts.sans]: fonts.sansSemiBold,
  [fonts.sansSemiBold]: fonts.sansBold,
  [fonts.sansBold]: fonts.sansBold,
};

// React Native's iOS font-scale multipliers (RCTAccessibilityManager), by
// content size category. Accessibility categories start at AX1 (1.786).
const categories = [
  ['xSmall', 0.823],
  ['small', 0.882],
  ['medium', 0.941],
  ['large', 1],
  ['xLarge', 1.118],
  ['xxLarge', 1.235],
  ['xxxLarge', 1.353],
  ['ax1', 1.786],
  ['ax2', 2.143],
  ['ax3', 2.643],
  ['ax4', 3.143],
  ['ax5', 3.571],
] as const;
export type ContentSizeCategory = (typeof categories)[number][0];
export function contentSizeCategory(fontScale: number): ContentSizeCategory {
  let best: ContentSizeCategory = 'large';
  let distance = Infinity;
  for (const [name, scale] of categories) {
    const d = Math.abs(scale - fontScale);
    if (d < distance) {
      best = name;
      distance = d;
    }
  }
  return best;
}
export const isAccessibilityCategory = (fontScale: number) =>
  contentSizeCategory(fontScale).startsWith('ax');

// Apple's Dynamic Type sizes for the ramps the navigation bar uses. Custom
// header fonts do not scale natively, so the layouts pass these sizes.
const largeTitleSizes: Record<ContentSizeCategory, number> = {
  xSmall: 31,
  small: 32,
  medium: 33,
  large: 34,
  xLarge: 36,
  xxLarge: 38,
  xxxLarge: 40,
  ax1: 44,
  ax2: 48,
  ax3: 52,
  ax4: 56,
  ax5: 60,
};
const headlineSizes: Record<ContentSizeCategory, number> = {
  xSmall: 14,
  small: 15,
  medium: 16,
  large: 17,
  xLarge: 19,
  xxLarge: 21,
  xxxLarge: 23,
  ax1: 28,
  ax2: 33,
  ax3: 40,
  ax4: 47,
  ax5: 53,
};
// Inline bar titles stop at xxxLarge, as the system's do: the bar keeps its
// height, and the Large Content Viewer covers larger sizes.
export function navigationTitleSizes(fontScale: number) {
  const category = contentSizeCategory(fontScale);
  return {
    largeTitle: largeTitleSizes[category],
    title: Math.min(headlineSizes[category], headlineSizes.xxxLarge),
  };
}
