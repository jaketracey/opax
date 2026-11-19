import { dark, light } from './tokens.generated';
// Hex role palettes, generated from docs/design/design-tokens.json into
// tokens.generated.ts (`npm run tokens`; never edit the generated file).
// Components never read these directly: they take roles from `useColors()`
// (design/use-colors.ts), which resolves each one for the appearance on
// screen and for Increase Contrast or High contrast text. A build draws the
// dark sets when it follows the system (plugins/appearance.js).
import type { Role } from './tokens.generated';

export {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
  partyColors,
  partyColorsDark,
  partyWashes,
  partyWashesDark,
} from './tokens.generated';
export type { PartyKey, Role } from './tokens.generated';
export type Palette = Record<Role, string>;

/** Hex palette at the native drawing and contrast boundaries. UI uses colors. */
export function paletteFor(scheme: 'light' | 'dark'): Palette {
  return scheme === 'dark' ? dark : light;
}
