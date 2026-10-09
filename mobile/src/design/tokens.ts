import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';
import {
  light,
  lightHighContrast,
  partyColors,
  partyWashes,
  type Palette,
  type Role,
} from './palette';
import {
  border,
  categories as accentCategories,
  fonts,
  radii,
  rhythm,
  size,
  typeRoles,
} from './tokens.generated';

export { light, partyColors, partyWashes };
export type { Palette, Role };
// Values come from docs/design/design-tokens.json through tokens.generated.ts;
// this file resolves them for the platform. Old names are aliases (see
// docs/design/TOKENS.md) and carry @deprecated.
export {
  border,
  breakpoints,
  chartIndustry,
  chartRoles,
  elevation,
  fonts,
  motion,
  radii,
  rhythm,
  rhythmRegular,
  size,
  spacing,
  splitPane,
  statusTones,
  typeRolesRegular,
} from './tokens.generated';

// Every colour goes through a role. iOS resolves Increase Contrast natively;
// the app is light-only in v1, so `dark` repeats light until a dark palette
// is approved (decision 2). The proposed one is `dark` in palette.ts.
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

export const layout = {
  screenMargin: rhythm.screen,
  // 10pt either side of a hairline between rows.
  rowGap: rhythm.row,
  // A second list within a section.
  subGap: rhythm.group,
  // Sections start 36pt down.
  sectionGap: rhythm.section,
};

/**
 * Category accents for symbols, figures, tinted tiles and section headers:
 * money (green), votes (indigo), interests (plum), bills (teal), people
 * (navy), leads (bronze). `ink` is text-safe on paper, raised and the
 * accent's own `wash`. `places` is a deprecated alias of `people`.
 */
export type Accent =
  | 'money'
  | 'votes'
  | 'interests'
  | 'bills'
  | 'people'
  | 'places'
  | 'leads';
export const accents: Record<Accent, { ink: Role; wash: Role }> =
  accentCategories;
// One CSS pixel is one point: rules are 1pt, not the device hairline.
export const hairline = border.hairline;
/** @deprecated Use `radii.sm` (read), `radii.md` (hold) or `radii.pill` (press). */
export const radius = radii.sm;
export const minimumTarget =
  Platform.OS === 'android' ? size.targetAndroid : size.target;
// Minimum heights; controls grow with their text rather than clipping.
export const controlHeight = {
  compact: minimumTarget,
  default: size.control,
  large: size.controlLarge,
} as const;
export type ControlSize = keyof typeof controlHeight;

// Static upstream instances, registered under these names in app/_layout.tsx.
// Merriweather has no static SemiBold upstream; Bold stands in for the web's 600.
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
// Every size scales to AX5 with no cap; nothing sets a line limit. Eleven
// roles are current; the rest are deprecated aliases (tokens.generated.ts).
type GeneratedRole = (typeof typeRoles)[keyof typeof typeRoles];
const textRole = (role: GeneratedRole): TextRole => ({
  fontFamily: fonts[role.font],
  fontSize: role.fontSize,
  lineHeight: role.lineHeight,
  dynamicTypeRamp: role.dynamicTypeRamp,
  color: role.color,
  ...('tabular' in role ? { tabular: role.tabular } : {}),
});
export const textStyles = Object.fromEntries(
  Object.entries(typeRoles).map(([name, role]) => [name, textRole(role)]),
) as { readonly [Variant in keyof typeof typeRoles]: TextRole };
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
