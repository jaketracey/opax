import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import type { ColorSchemeName } from 'react-native';

/**
 * The root navigation theme. Its `dark` flag becomes every native bar's
 * `overrideUserInterfaceStyle` (expo-router's header config passes it as
 * `experimental_userInterfaceStyle`), so it decides how the bars resolve
 * their dynamic colours. Left at the light default, every pushed-page bar
 * and sheet header drew `paper` light (250,249,246) and light ink over a
 * near-black page in dark mode (build 61 sweep), while the transparent tab
 * root bars showed the dark page through. Release builds are light-only
 * (app.config.ts), so they always get DefaultTheme, as before.
 */
export function navigationTheme(scheme: ColorSchemeName | undefined): Theme {
  return scheme === 'dark' ? DarkTheme : DefaultTheme;
}
