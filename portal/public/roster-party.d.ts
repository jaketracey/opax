export interface RosterPerson { name: string; pid?: string | null; representation?: { electorate: string; jurisdiction: string; chamber: string }[] }
export interface RosterSeatParty { party: string; as_of: string; electorate: string; url: string | null; source_url: string | null }
export function rosterFold(value: unknown): string;
export function rosterSeatParty(person: RosterPerson | null | undefined, electorates: readonly unknown[] | null | undefined): RosterSeatParty | null;
export interface ReferenceSeat { current: boolean; name: string; jurisdiction: string; chamber: string; party?: string | null; as_of?: string | null }
export interface ReferencePerson { name: string; aliases?: string[]; person_id?: string; legacy_person_id?: string; electorates: ReferenceSeat[] }
export function referenceOnlyPeople<P extends ReferencePerson>(rosterPeople: readonly { name: string; full?: string | null; speech_scope?: unknown }[], referencePeople: readonly P[] | null | undefined): { person: P; seats: P['electorates'] }[];
