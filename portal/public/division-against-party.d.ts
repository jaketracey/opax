export const AGAINST_PARTY_TITLE: string;
export const AGAINST_PARTY_HELP: string;
export const AGAINST_PARTY_MIN_VOTES: number;
export function isDivisionParty(party: unknown): boolean;
export interface PartyMajority { party: string; ayes: number; noes: number; majority: 'aye' | 'no' | null }
export function partyMajorities<M extends { party?: string | null; vote: string }>(members: M[]): PartyMajority[];
export function againstPartyMembers<M extends { name: string; party?: string | null; vote: string }>(members: M[], majorities?: PartyMajority[]): (M & { party_vote: 'aye' | 'no' })[];
export function memberListComplete(d: unknown): boolean;
export interface VotedAgainstPartyMember {
  name: string; person_slug: string | null; party: string; vote: 'aye' | 'no'; party_vote: 'aye' | 'no';
  party_ayes: number; party_noes: number; text: string; party_note?: string;
}
export interface VotedAgainstParty {
  title: string; help: string; member_list_complete: boolean; note: string | null; members: VotedAgainstPartyMember[];
}
export function votedAgainstParty(d: unknown): VotedAgainstParty | null;
export function votedAgainstPartyHTML(view: VotedAgainstParty | null, href: (name: string) => string): string;
