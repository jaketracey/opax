import type { Loaded } from '../Person';

/**
 * Profiles read this session, by route slug (PF4). Opening one again draws
 * the last page read on the first frame instead of the skeleton; the screen
 * still reads the profile as before and keeps the drawn page unless the
 * record changed. Memory only, never saved, at most LIMIT profiles. The
 * catalog snapshots behind them are shared, so each adds little.
 */
const LIMIT = 8;
const profiles = new Map<string, Loaded>();

export function rememberedProfile(slug: string): Loaded | undefined {
  return profiles.get(slug);
}
export function rememberProfile(slug: string, loaded: Loaded) {
  profiles.delete(slug);
  profiles.set(slug, loaded);
  while (profiles.size > LIMIT) {
    const oldest = profiles.keys().next().value;
    if (oldest === undefined) break;
    profiles.delete(oldest);
  }
}
export function forgetProfile(slug: string) {
  profiles.delete(slug);
}
/** A new session (tests start each case with none). */
export function forgetProfiles() {
  profiles.clear();
}

const plain = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
/**
 * Structural equality for decoded catalog records: plain objects, arrays,
 * Maps and Sets (entries in order), errors and primitives. Anything else (a
 * class instance) is equal only to itself, so an unknown shape redraws.
 */
export function sameRecord(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (
    depth > 48 ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++)
      if (!sameRecord(a[i], b[i], depth + 1)) return false;
    return true;
  }
  if (
    a instanceof Map ||
    b instanceof Map ||
    a instanceof Set ||
    b instanceof Set
  ) {
    if (
      Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) ||
      (a as Map<unknown, unknown>).size !== (b as Map<unknown, unknown>).size
    )
      return false;
    return sameRecord(
      [...(a as Map<unknown, unknown>).entries()],
      [...(b as Map<unknown, unknown>).entries()],
      depth + 1,
    );
  }
  if (a instanceof Error || b instanceof Error) {
    if (
      !(a instanceof Error) ||
      !(b instanceof Error) ||
      Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) ||
      a.name !== b.name ||
      a.message !== b.message
    )
      return false;
  } else if (!plain(a) || !plain(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys)
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !sameRecord(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        depth + 1,
      )
    )
      return false;
  return true;
}

export const sameLoaded = (a: Loaded, b: Loaded) =>
  sameRecord(a.profile, b.profile) &&
  sameRecord(a.official, b.official) &&
  sameRecord(a.seat, b.seat);
