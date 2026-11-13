import Constants from 'expo-constants';
import {
  Appearance,
  DynamicColorIOS,
  Platform,
  useColorScheme,
  type ColorSchemeName,
  type ColorValue,
} from 'react-native';
import {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
  paletteFor,
  partyColors,
  partyWashes,
  type Palette,
  type Role,
} from './palette';
import {
  categories as accentCategories,
  border,
  headingFace as defaultHeadingFace,
  fonts as registeredFonts,
  rhythm,
  size,
  statusTones,
  typeRoles,
} from './tokens.generated';

export { light, partyColors, partyWashes };
export type { Palette, Role };
// Values come from docs/design/design-tokens.json through tokens.generated.ts;
// this file resolves only the canonical mobile roles for the platform.
export {
  border,
  breakpoints,
  chartIndustry,
  chartRoles,
  elevation,
  motion,
  radii,
  rhythm,
  rhythmRegular,
  size,
  splitPane,
  statusTones,
  typeRolesRegular,
} from './tokens.generated';

// iOS resolves appearance and Increase Contrast natively. Release builds
// remain light through app.config.ts; capture builds can follow the system.
function resolve(role: Role): ColorValue {
  const base = paletteFor('light')[role];
  if (Platform.OS !== 'ios') return base;
  return DynamicColorIOS({
    light: base,
    dark: dark[role],
    highContrastLight: lightHighContrast[role] ?? base,
    highContrastDark: darkHighContrast[role] ?? dark[role],
  });
}
export const colors = Object.fromEntries(
  (Object.keys(light) as Role[]).map((role) => [role, resolve(role)]),
) as Record<Role, ColorValue>;

/**
 * A role in the app's own appearance, wherever it is drawn. UIKit resolves
 * `colors` in the view's interface style, and the navigation bar takes its
 * style from the navigation theme rather than the system: dark ink then
 * resolved for a dark page under the glass bar (11b-3). Increase Contrast
 * still resolves natively.
 */
export function schemeColour(role: Role, scheme: ColorSchemeName): ColorValue {
  if (Platform.OS !== 'ios') return colors[role];
  const palette = scheme === 'dark' ? dark : paletteFor('light');
  const contrast = scheme === 'dark' ? darkHighContrast : lightHighContrast;
  const value = palette[role];
  const high = contrast[role] ?? value;
  return DynamicColorIOS({
    light: value,
    dark: value,
    highContrastLight: high,
    highContrastDark: high,
  });
}

/** Current hex colours for imperative native APIs. */
export function currentChromeColours() {
  const palette = paletteFor(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );
  return { tint: palette.navy, inactive: palette.inkSoft, title: palette.ink };
}
export const chromeColours = {
  tint: colors.navy,
  inactive: colors.inkSoft,
  title: colors.ink,
};
/** Hex colours for native APIs that reject DynamicColorIOS values. */
export function useChromeColours() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? dark : light;
  return { tint: palette.navy, inactive: palette.inkSoft, title: palette.ink };
}

export type HeadingFace = 'system' | 'serif';
const extra = Constants.expoConfig?.extra;
export const headingFace: HeadingFace =
  (extra?.variant === 'development' || extra?.variant === 'e2e') &&
  (extra?.headingFace === 'system' || extra?.headingFace === 'serif')
    ? extra.headingFace
    : defaultHeadingFace;

// Unset family means UIKit's SF Pro. Android keeps its bundled Public Sans.
// Registered names remain available to the existing useFonts loader.
export const interfaceFonts = {
  ...registeredFonts,
  sans: Platform.OS === 'ios' ? undefined : registeredFonts.sans,
  sansSemiBold:
    Platform.OS === 'ios' ? undefined : registeredFonts.sansSemiBold,
  sansBold: Platform.OS === 'ios' ? undefined : registeredFonts.sansBold,
} as const;

export const layout = {
  screenMargin: rhythm.screen,
  // 11pt either side of a hairline between rows.
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
  | 'leads';
export const accents: Record<Accent, { ink: Role; wash: Role }> = {
  money: accentCategories.money,
  votes: accentCategories.votes,
  interests: accentCategories.interests,
  bills: accentCategories.bills,
  people: accentCategories.people,
  leads: accentCategories.leads,
};

/**
 * A subject's colours as role values, for a surface that carries its accent
 * (Today's edition, a lead): `base` marks (dots, rules, the stage line),
 * `deep` a header ground under `onDeep` text with `softOnDeep` for its
 * secondary lines, `wash` a light ground, `ink` accent text on that wash.
 * Roles resolve Increase Contrast natively, so nothing here is computed.
 * Party colour is never a ground: a party is a dot beside its name.
 */
export interface AccentTint {
  base: ColorValue;
  deep: ColorValue;
  onDeep: ColorValue;
  softOnDeep: ColorValue;
  wash: ColorValue;
  ink: ColorValue;
}
export function accentTint(accent: Accent): AccentTint {
  const { ink, wash } = accents[accent];
  return {
    base: colors[ink],
    deep: colors[ink],
    onDeep: colors.onNavy,
    // onNavySoft is AA on navy only; the other inks take full white.
    softOnDeep: accent === 'people' ? colors.onNavySoft : colors.onNavy,
    wash: colors[wash],
    ink: colors[ink],
  };
}
/** A status tone's colours (statusTones): the word always beside them. */
export function statusTint(tone: StatusTone): AccentTint {
  const { ink, wash } = statusTones[tone];
  return {
    base: colors[ink],
    deep: colors[ink],
    onDeep: colors.onNavy,
    softOnDeep: colors.onNavy,
    wash: colors[wash],
    ink: colors[ink],
  };
}
export type StatusTone = keyof typeof statusTones;

// One CSS pixel is one point: rules are 1pt, not the device hairline.
export const hairline = border.hairline;
export const minimumTarget =
  Platform.OS === 'android' ? size.targetAndroid : size.target;
// Minimum heights; controls grow with their text rather than clipping.
export const controlHeight = {
  compact: minimumTarget,
  default: size.control,
  large: size.controlLarge,
} as const;
export type ControlSize = keyof typeof controlHeight;

// Merriweather has no bundled SemiBold; Bold supplies serif inline titles.
export type FontFamily = string | undefined;
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
  fontWeight: '400' | '600' | '700';
  fontSize: number;
  lineHeight: number;
  dynamicTypeRamp: DynamicTypeRamp;
  color: Role;
  tabular?: boolean;
}
export type CurrentTextVariant =
  | 'largeTitle'
  | 'inlineTitle'
  | 'pageTitle'
  | 'recordTitle'
  | 'recordHeading'
  | 'sectionTitle'
  | 'subsectionTitle'
  | 'groupHeader'
  | 'name'
  | 'rowRecord'
  | 'recordText'
  | 'body'
  | 'strong'
  | 'secondary'
  | 'footnote'
  | 'capsule'
  | 'figure'
  | 'tileFigure';

/** Resolve both D1 faces without changing the record's typeface or figures. */
export function textStylesFor(
  face: HeadingFace,
): Record<CurrentTextVariant, TextRole> {
  return Object.fromEntries(
    Object.entries(typeRoles).map(([name, role]) => {
      const font =
        role.font === 'heading'
          ? face === 'serif'
            ? 'serifBold'
            : role.fontWeight === '700'
              ? 'sansBold'
              : 'sansSemiBold'
          : role.font;
      return [
        name,
        {
          fontFamily: interfaceFonts[font],
          fontWeight: role.fontWeight,
          fontSize: role.fontSize,
          lineHeight: role.lineHeight,
          dynamicTypeRamp: role.dynamicTypeRamp,
          color: role.color,
          ...('tabular' in role ? { tabular: role.tabular } : {}),
        },
      ];
    }),
  ) as Record<keyof typeof typeRoles, TextRole>;
}
export const textStyles = textStylesFor(headingFace);
export type TextVariant = keyof typeof textStyles;

// SF handles Bold Text natively. Only bundled families need a manual step.
export const boldStep: Readonly<Record<string, string>> = {
  [registeredFonts.serif]: registeredFonts.serifBold,
  [registeredFonts.serifBold]: registeredFonts.serifBold,
  ...(Platform.OS === 'ios'
    ? {}
    : {
        [registeredFonts.sans]: registeredFonts.sansSemiBold,
        [registeredFonts.sansSemiBold]: registeredFonts.sansBold,
        [registeredFonts.sansBold]: registeredFonts.sansBold,
      }),
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
export const largeTitleSizes: Record<ContentSizeCategory, number> = {
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

/** Headline ramp. Inline bar titles cap at xxxLarge to keep the bar height. */
export const headlineSizes: Record<ContentSizeCategory, number> = {
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

/** Material geometry and state layers, used only by Android branches. */
const androidPalette = paletteFor('light');
export const androidControls = {
  target: 48,
  buttonHeight: 48,
  fieldHeight: 56,
  chipRadius: 8,
  fieldRadius: 4,
  menuRadius: 12,
  ripple: `${androidPalette.navy}29`,
  rippleHighContrast: `${androidPalette.navy}52`,
  rippleOnFilled: `${androidPalette.onNavy}1F`,
} as const;
