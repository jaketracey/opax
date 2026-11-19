import { useMemo, useSyncExternalStore } from 'react';
import {
  Appearance,
  AppState,
  Platform,
  type ColorSchemeName,
  type ColorValue,
} from 'react-native';
import { highTextContrastNow, useHighTextContrast } from './accessibility';
import {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
  paletteFor,
  type Role,
} from './palette';
import { colors as dynamicColors } from './tokens';

/**
 * Colour roles for the appearance on screen (dark mode, 19 Nov 2026).
 *
 * iOS needs nothing from this file: `colors` in tokens.ts is a
 * DynamicColorIOS value per role, and UIKit resolves light, dark and both
 * Increase Contrast sets wherever it is drawn. `useColors()` returns that
 * same object on iOS, every time.
 *
 * Android has no dynamic colour value, so a role must be chosen in
 * JavaScript and the component drawn again when the system changes. There
 * `useColors()` returns the plain hex palette for the system's scheme, with
 * the Increase Contrast set laid over it while High contrast text is on.
 *
 * A module-level `StyleSheet.create` that holds a role is read once, at
 * import, and would stay light on Android for good. Such a block moves
 * behind `makeStyles`:
 *
 *     const useStyles = makeStyles((colors) =>
 *       StyleSheet.create({ card: { backgroundColor: colors.raised } }),
 *     );
 *     function Card() {
 *       const styles = useStyles();
 *       ...
 *     }
 *
 * `scripts/codemod-use-colors.ts` makes both changes; the lint rule
 * `opax/static-colors` finds what is left.
 */
export type Colors = Readonly<Record<Role, ColorValue>>;
export type ColorTheme =
  | 'light'
  | 'dark'
  | 'lightHighContrast'
  | 'darkHighContrast';

const lightPalette = paletteFor('light');
const androidPalettes: Record<ColorTheme, Colors> = {
  light,
  dark,
  lightHighContrast: { ...light, ...lightHighContrast },
  darkHighContrast: { ...dark, ...darkHighContrast },
};

/** The four themes by name, as the token source defines them. */
export function colorTheme(
  scheme: ColorSchemeName | null | undefined,
  highContrast: boolean,
): ColorTheme {
  if (scheme === 'dark') return highContrast ? 'darkHighContrast' : 'dark';
  return highContrast ? 'lightHighContrast' : 'light';
}

/**
 * Every role in one theme. On iOS the dynamic set already holds all four, so
 * it is returned whatever the theme; on Android it is that theme's hex set.
 * The object for a theme is always the same one, so it is safe in a
 * dependency list.
 */
export function colorsFor(theme: ColorTheme): Colors {
  return Platform.OS === 'ios' ? dynamicColors : androidPalettes[theme];
}

// The system's scheme, for Android only. iOS takes a constant and never
// subscribes: its roles are dynamic, so nothing has to draw again there, and
// UIKit reports both appearances in turn whenever the app goes to the
// background, which would otherwise redraw every Text twice for nothing.
const idle = () => () => undefined;
const constantScheme = () => 'light' as const;
const watchScheme = (changed: () => void) => {
  const subscription = Appearance.addChangeListener(changed);
  return () => subscription.remove();
};
const readScheme = () => Appearance.getColorScheme();

/** The theme on screen now, for a component. Always `light` on iOS. */
export function useColorTheme(): ColorTheme {
  const ios = Platform.OS === 'ios';
  const scheme = useSyncExternalStore(
    ios ? idle : watchScheme,
    ios ? constantScheme : readScheme,
    ios ? constantScheme : readScheme,
  );
  return colorTheme(scheme, useHighTextContrast());
}

/** Colour roles for the appearance on screen. See the note at the top. */
export function useColors(): Colors {
  return colorsFor(useColorTheme());
}

// The system's scheme for `useIsDark`, held while the app is not active.
// One pair of system listeners serves every component, kept only while
// something is drawn with it.
const darkWatchers = new Set<() => void>();
let heldDark: boolean | undefined;
let stopDarkWatch: (() => void) | undefined;
const systemDark = () => Appearance.getColorScheme() === 'dark';
const appActive = () => AppState.currentState === 'active';
// Active: the system's answer, remembered. Not active: the one remembered,
// whatever UIKit reports while it takes its two snapshots.
function readDark() {
  if (appActive() || heldDark === undefined) heldDark = systemDark();
  return heldDark;
}
function syncDark() {
  // Each watcher reads again and draws only if its answer changed. While
  // the app is not active nobody is told; the return to active tells them.
  if (!appActive()) return;
  for (const changed of [...darkWatchers]) changed();
}
function watchDark(changed: () => void) {
  if (!darkWatchers.size) {
    const scheme = Appearance.addChangeListener(syncDark);
    const state = AppState.addEventListener('change', syncDark);
    stopDarkWatch = () => {
      scheme.remove();
      state.remove();
    };
  }
  darkWatchers.add(changed);
  return () => {
    darkWatchers.delete(changed);
    if (darkWatchers.size) return;
    stopDarkWatch?.();
    stopDarkWatch = undefined;
  };
}

/**
 * Whether the appearance on screen is dark: the system's real scheme, on
 * both platforms. For what a role cannot draw, such as a Skia picture, a
 * shadow that is dropped in dark, or a hex set chosen by hand.
 *
 * Use this, not `useColorScheme()`. UIKit reports both appearances in turn
 * each time the app goes to the background (it takes a snapshot of each),
 * and every `useColorScheme()` subscriber then draws twice for nothing; the
 * money map rebuilt its model and recorded its pictures twice. This hook
 * ignores a change while `AppState.currentState` is not `active` and reads
 * the scheme again when the app becomes active, so a change made in
 * Settings while the app was behind shows on return.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(watchDark, readDark, readDark);
}

/**
 * The same answer outside render: an event handler, a navigation option
 * built in a callback, a one-shot native call. A component that draws with
 * the result must also call `useColors()` (or `useIsDark()`), or it
 * will not draw again when the system changes.
 */
export function currentColors(): Colors {
  // iOS asks the system nothing: its set is the same in every theme. (A
  // bar helper may be called while a module loads, before anything draws.)
  if (Platform.OS === 'ios') return dynamicColors;
  return colorsFor(
    colorTheme(Appearance.getColorScheme(), highTextContrastNow()),
  );
}

/**
 * Material state layers in the colours on screen: navy at 16% (32% with
 * High contrast text) over a page, and the filled control's own text colour
 * at 12% over a filled control. Android only; iOS draws no ripple, and its
 * dynamic roles are not hex, so it gets the light values it never uses.
 */
export function androidRipples(colors: Colors) {
  const hex = (role: 'navy' | 'onNavy') => {
    const value = colors[role];
    return typeof value === 'string' ? value : lightPalette[role];
  };
  return {
    ripple: `${hex('navy')}29`,
    rippleHighContrast: `${hex('navy')}52`,
    rippleOnFilled: `${hex('onNavy')}1F`,
  };
}

/**
 * A style sheet that holds roles. The factory runs once per theme (once in
 * all on iOS), and the hook it returns gives every component the same sheet
 * for the theme on screen.
 */
export function makeStyles<T>(factory: (colors: Colors) => T): () => T {
  const sheets = new Map<Colors, T>();
  const sheetFor = (colors: Colors) => {
    let sheet = sheets.get(colors);
    if (!sheet) {
      sheet = factory(colors);
      sheets.set(colors, sheet);
    }
    return sheet;
  };
  return function useStyles() {
    const colors = useColors();
    return useMemo(() => sheetFor(colors), [colors]);
  };
}
