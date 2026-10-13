export interface IdentityPrefilter {
  version: number;
  registryFingerprint: string;
  checksum: string;
  words: Record<string, number[]>;
  stripped: Record<string, number[]>;
  counts: {words: Record<string, number>; stripped: Record<string, number>};
  registryCount: number;
  lengths: number[];
  strippedLengths: number[];
}
export interface IdentityPrefilterBinding {version: number; registryFingerprint: string; checksum: string}
export function identityQuickHash(text: string): number;
export function buildIdentityPrefilter(phrases: Iterable<string>, entries: {hash:string;words:number}[], registryFingerprint: string): IdentityPrefilter;
export function identityPrefilterBinding(prefilter: IdentityPrefilter): IdentityPrefilterBinding;
export function verifyIdentityPrefilter(prefilter: IdentityPrefilter, phrases: Iterable<string>, entries: {hash:string;words:number}[], registryFingerprint: string): void;
export function identityPrefilterModule(prefilter: IdentityPrefilter, phrases: Iterable<string>, entries: {hash:string;words:number}[], registryFingerprint: string): string;
export function assertPrefilterLengths(prefilter: IdentityPrefilter, lengths: number[], compactLengths: number[]): void;
export function compileIdentityPrefilter(prefilter: unknown, registryFingerprint: string, binding: unknown): (value: unknown, lengths: number[], compactLengths?: number[]) => IterableIterator<string>;
