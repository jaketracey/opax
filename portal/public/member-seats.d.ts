export const CHAMBERS: Record<string, string>;
export interface ElectoratePersonSeat { name: string; url: string; chamber: string; current?: boolean; as_of?: string }
export function findPerson<T extends { name: string; aliases?: string[] }>(people: readonly T[], name: string): T | null;
export function memberSeats(person: { electorates?: readonly ElectoratePersonSeat[] } | null | undefined): { name: string; href: string; chamber: string }[];
