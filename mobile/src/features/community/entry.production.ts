// Production: no Community. Today and Account offer no entry, no link or deep
// link resolves to a Community screen and the catalog policy refuses its
// routes. It stays on the web.
export const communityHome = null;
export const communityFromWebPath = (): null => null;
export function communitySharePath(): never {
  throw new Error('Community is not in this version of the app.');
}
export const communityRequestAllowed = (): boolean => false;
