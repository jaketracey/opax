export const PERSON_PATHS: { exact: Record<string, string>; folded: Record<string, string> };
export function entitySlug(name: unknown): string;
export function personUrl(name: string): string;
export function partyUrl(name: string): string;
export function subjectUrl(kind: string, name: string): string;

export function personNameKey(name: unknown): string;
