import Constants from 'expo-constants';

export type Variant = 'development' | 'e2e' | 'production';
const extra = Constants.expoConfig?.extra as
  | { variant?: string; webOrigin?: string }
  | undefined;
const known = ['development', 'e2e', 'production'];

// Fail closed: with no readable build configuration the app behaves like
// e2e, so nothing opens an external browser, share sheet or web page.
export const variant: Variant = known.includes(String(extra?.variant))
  ? (extra!.variant as Variant)
  : 'e2e';
export const isE2E = variant === 'e2e';
// Only an explicitly configured e2e bundle contains the local preview route.
export const hasSourcePreview = extra?.variant === 'e2e';
export const isProduction = variant === 'production';

/**
 * The canonical public site, for share links and "Opens on opax.com.au"
 * links. It comes from the build configuration, never from app source. E2E
 * builds carry a reserved non-resolving origin and never open it.
 */
export const webOrigin: string =
  typeof extra?.webOrigin === 'string' &&
  /^https:\/\/[^/]+$/.test(extra.webOrigin)
    ? extra.webOrigin
    : 'https://opax.invalid';
