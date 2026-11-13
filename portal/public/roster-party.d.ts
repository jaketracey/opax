export interface RosterPerson { name: string; pid?: string | null; representation?: { electorate: string; jurisdiction: string; chamber: string }[] }
export interface RosterSeatParty { party: string; as_of: string; electorate: string; url: string | null; source_url: string | null }
export function rosterFold(value: unknown): string;
export function rosterSeatParty(person: RosterPerson | null | undefined, electorates: readonly unknown[] | null | undefined): RosterSeatParty | null;
export interface RosterListObservation { name: string; aliases?: string[]; jurisdiction?: string; chamber: string; electorate?: string | null; party: string; as_of: string; source_url?: string | null }
export function rosterListParty(person: { name: string; chambers?: readonly string[] } | null | undefined, observations: readonly RosterListObservation[] | null | undefined): RosterSeatParty | null;
