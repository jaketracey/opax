export function identityWords(value: unknown): string[];
export function identityPhrase(value: unknown): string;
export function identityVariants(value: unknown): string[];
export function identityCandidates(value: unknown, lengths: number[]): Set<string>;
export function identityHash(value: string): Promise<string>;
export function compileIdentityCheck(phrases: Set<string>): (value: unknown) => boolean;
export function loadTableIdentityIndex(read: (path: string) => Promise<any>, graphs?: any[]): Promise<{phrases:Set<string>;values:string[];donors:string[];recipients:string[];recipientABNs:string[];abns:string[];suppliers:Set<string>;lengths:number[];check:(value:unknown)=>boolean}>;
