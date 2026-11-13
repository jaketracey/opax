export * from './labels.js';
export * from './canonical-urls.js';
export function partySpeechLabel(label: string, sources?: {
  indexed?: { parties?: Record<string, number> } | null;
  roster?: { people?: { party?: string | null; speeches?: number | null }[] } | null;
  same?: (a: string, b: string) => boolean;
}): { label: string; count: number } | null;

export interface PartyPage {
  label: string; name: string; href: string; aliases: string[]; money: boolean; roster: boolean; divisions: boolean; bills: boolean; lastmod: string;
  /** A renamed party (labels.js PARTY_RENAMES): when the current name began, and each former name with the date it ended. */
  since?: string | null; formerNames?: { name: string; until: string | null; recorded: string[] }[]; history?: string;
}
export interface PartyMemberPerson { name: string; full?: string; pid?: string; party?: string | null; party_now?: string | null; parties?: string[]; current?: boolean; first?: number | null; last?: number | null }
export interface PartyMember { name: string; pid: string | null; current: boolean; roster: PartyMemberPerson | null; first: number; last: number; divisions: number; labels: string[] }
export interface PartyMembership { current: PartyMember[]; former: PartyMember[] }
export function partyMembers(label: string, sources?: {roster?: {people: PartyMemberPerson[]} | null; divisions?: {parties?: Record<string, {name: string; slug?: string | null; last?: string; divisions?: number}[]>} | null; same?: (a: string, b: string) => boolean}): PartyMembership;
export function isIndependent(label: string): boolean;
export function partyDisplayName(label: string): string;
export const INDEPENDENTS_DESCRIPTION: string;
export const PARTY_MEMBER_SCOPE: string;
export const PARTY_NO_MEMBERS: string;
export const PARTY_MONEY_PATHS: string[];
export function canonicalPartyPages(sources?: {
  money?: { meta?: { generated?: string }; nodes?: {kind: string; label: string}[] }[];
  roster?: { meta?: { generated?: string }; people?: {party?: string | null; party_now?: string | null; parties?: string[]; recorded_parties?: (string | {party?: string})[]}[] } | null;
  divisions?: { parties?: string[] | Record<string, unknown>; bills?: Record<string, PartyBill[]>; generated_at?: string } | null;
  renames?: import('./labels.js').PartyRename[];
}): PartyPage[];
export function readPartyPages(read: <T>(path: string, init?: {cache: 'no-cache'}) => Promise<T>): Promise<PartyPage[]>;
export function resolvePartyPage(segment: string, pages: PartyPage[]): PartyPage | null;
export function partyPageCoverage(page: PartyPage): string;
export interface PartyBill { key: string; title: string; introduced: string | null; status: string | null; party?: string }
export function partyBills(label: string, divisions: { bills?: Record<string, PartyBill[]> } | null | undefined, same?: (a: string, b: string) => boolean): PartyBill[];
export function partyBillsHTML(label: string, bills: PartyBill[], h: { esc: (s: unknown) => string; sourceLineHTML: (o: object) => string }, opts?: { updated?: string }): string;
export function dayMonthYear(day: string): string;
export function recordedAsText(label: string, labels: string[] | null | undefined, lead?: string, renames?: import('./labels.js').PartyRename[]): string;
export function partyHistory(label: string, renames?: import('./labels.js').PartyRename[]): { name: string; since: string | null; line: string; former: import('./labels.js').PartyFormerName[]; sources: { label: string; href: string }[] } | null;
export function partyHistoryHTML(label: string, h: { esc: (s: unknown) => string }, renames?: import('./labels.js').PartyRename[]): string;
export function partyReturns(label: string, parties: Record<string, { returns?: unknown[][] }> | null | undefined, same?: (a: string, b: string) => boolean): { rows: unknown[][]; names: string[]; note: string; entry: { returns?: unknown[][] } | null };
