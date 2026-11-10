export interface RosterPerson { name: string; pid?: string | null; representation?: { electorate: string; jurisdiction: string; chamber: string }[] }
export interface RosterSeatParty { party: string; as_of: string; electorate: string; url: string | null; source_url: string | null }
export function rosterFold(value: unknown): string;
export function rosterSeatParty(person: RosterPerson | null | undefined, electorates: readonly unknown[] | null | undefined): RosterSeatParty | null;
