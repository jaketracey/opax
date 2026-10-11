export function identityWords(value: unknown): string[];
export function identityPhrase(value: unknown): string;
export function identityVariants(value: unknown): string[];
export const STRIPPED_PREFIX: string;
export const STRIPPED_MIN_LENGTH: number;
export const STRIPPED_CONTAINS_MIN_LENGTH: number;
export function identityStripped(value: unknown): string;
export function strippedLengths(phrases: Set<string>): number[];
export function identityCandidates(value: unknown, lengths: number[], compactLengths?: number[]): Set<string>;
export function identityCandidateStream(value: unknown, lengths: number[], compactLengths?: number[]): Generator<string>;
export function identityHash(value: string): Promise<string>;
export function compileIdentityCheck(phrases: Set<string>): (value: unknown) => boolean;

export function identityQuickHash(value:string):number;
export function matchingIdentityCandidates(value:unknown,lengths:number[],compactLengths:number[],quickByLength:Map<number,Set<number>>):Generator<string>;
