import { dark, light } from './tokens.generated';
// Hex role palettes, generated from docs/design/design-tokens.json into
// tokens.generated.ts (`npm run tokens`; never edit the generated file).
// Components never read these directly: they use `colors` from tokens.ts,
// which resolves each role for the current appearance and Increase Contrast.
// Release builds remain light. Capture builds can resolve these dark slots
// through OPAX_APPEARANCE=automatic without changing the release default.
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
