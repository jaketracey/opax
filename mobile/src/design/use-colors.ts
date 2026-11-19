import { useMemo } from 'react';
import {
  Appearance,
  Platform,
  useColorScheme,
  type ColorSchemeName,
  type ColorValue,
} from 'react-native';
import { highTextContrastNow, useHighTextContrast } from './accessibility';
import {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
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

/** The theme on screen now, for a component. */
export function useColorTheme(): ColorTheme {
  return colorTheme(useColorScheme(), useHighTextContrast());
}

/** Colour roles for the appearance on screen. See the note at the top. */
export function useColors(): Colors {
  return colorsFor(useColorTheme());
}

/**
 * The same answer outside render: an event handler, a navigation option
 * built in a callback, a one-shot native call. A component that draws with
 * the result must also call `useColors()` (or `useColorScheme()`), or it
 * will not draw again when the system changes.
 */
export function currentColors(): Colors {
  return colorsFor(
    colorTheme(Appearance.getColorScheme(), highTextContrastNow()),
  );
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
