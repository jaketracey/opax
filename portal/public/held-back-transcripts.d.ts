export function heldBackTranscriptsHTML(personId: string | number | null | undefined, counts: Record<string, number> | null | undefined): string;
export function chairRoleTranscriptsHTML(personId: string | number | null | undefined, counts: Record<string, number> | null | undefined): string;
export const NO_HANSARD_HELD: string;
export function noHansardHeldHTML(person: { roster_only?: boolean } | null | undefined): string;
