// Hex role palettes, generated from docs/design/design-tokens.json into
// tokens.generated.ts (`npm run tokens`; never edit the generated file).
// Components never read these directly: they use `colors` from tokens.ts,
// which resolves each role for the current appearance and Increase Contrast.
// `dark` and `darkHighContrast` meet the same contrast rules but are not
// rendered: the app is light-only (decision 2).
import type { Role } from './tokens.generated';

export {
  light,
  dark,
  lightHighContrast,
  darkHighContrast,
  partyColors,
  partyWashes,
  partyColorsDark,
  partyWashesDark,
} from './tokens.generated';
export type { PartyKey, Role } from './tokens.generated';
export type Palette = Record<Role, string>;
