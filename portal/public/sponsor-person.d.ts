export interface SponsorCandidate { name: string; pid?: string | null; full?: string | null; speeches?: number | null }
export function sponsorFold(name: unknown): string;
export function sponsorKey(name: unknown): string;
export function sponsorNamesAgree(a: string, b: string): boolean;
export function sponsorPerson<T extends SponsorCandidate>(printed: string, pid: string | null | undefined, people: readonly T[]): T | null;
