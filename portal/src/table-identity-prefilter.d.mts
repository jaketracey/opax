export interface IdentityPrefilter {
  version: number;
  registryFingerprint: string;
  checksum: string;
  words: Record<string, number[]>;
  stripped: Record<string, number[]>;
}
export function identityQuickHash(text: string): number;
export function buildIdentityPrefilter(phrases: Iterable<string>, registryFingerprint: string): IdentityPrefilter;
export function compileIdentityPrefilter(prefilter: unknown, registryFingerprint: string): (value: unknown, lengths: number[], compactLengths?: number[]) => IterableIterator<string>;
