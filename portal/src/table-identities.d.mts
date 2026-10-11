export function identityWords(value: unknown): string[];
export function identityPhrase(value: unknown): string;
export function identityVariants(value: unknown): string[];
export function identityCandidates(value: unknown, lengths: number[]): Set<string>;
export function identityHash(value: string): Promise<string>;
export function compileIdentityCheck(phrases: Set<string>): (value: unknown) => boolean;
