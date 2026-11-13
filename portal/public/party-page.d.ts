export * from './labels.js';
export * from './canonical-urls.js';
export function partySpeechLabel(label: string, sources?: {
  indexed?: { parties?: Record<string, number> } | null;
  roster?: { people?: { party?: string | null; speeches?: number | null }[] } | null;
  same?: (a: string, b: string) => boolean;
}): { label: string; count: number } | null;

export interface PartyPage {
  label: string; name: string; href: string; aliases: string[]; money: boolean; roster: boolean; divisions: boolean; bills: boolean; lastmod: string;
}
export interface PartyMemberPerson { name: string; full?: string; pid?: string; party?: string | null; party_now?: string | null; parties?: string[]; current?: boolean; first?: number | null; last?: number | null }
export interface PartyMember { name: string; pid: string | null; current: boolean; roster: PartyMemberPerson | null; first: number; last: number; divisions: number }
export interface PartyMembership { current: PartyMember[]; former: PartyMember[] }
export function partyMembers(label: string, sources?: {roster?: {people: PartyMemberPerson[]} | null; divisions?: {parties?: Record<string, {name: string; slug?: string | null; last?: string; divisions?: number}[]>} | null; same?: (a: string, b: string) => boolean}): PartyMembership;
export function isIndependent(label: string): boolean;
export function partyDisplayName(label: string): string;
export const INDEPENDENTS_DESCRIPTION: string;
export const PARTY_MEMBER_SCOPE: string;
export const PARTY_MONEY_PATHS: string[];
export function canonicalPartyPages(sources?: {
  money?: { meta?: { generated?: string }; nodes?: {kind: string; label: string}[] }[];
  roster?: { meta?: { generated?: string }; people?: {party?: string | null; party_now?: string | null; parties?: string[]; recorded_parties?: (string | {party?: string})[]}[] } | null;
  divisions?: { parties?: string[] | Record<string, unknown>; bills?: Record<string, PartyBill[]>; generated_at?: string } | null;
}): PartyPage[];
export function readPartyPages(read: <T>(path: string, init?: {cache: 'no-cache'}) => Promise<T>): Promise<PartyPage[]>;
export function resolvePartyPage(segment: string, pages: PartyPage[]): PartyPage | null;
export function partyPageCoverage(page: PartyPage): string;
export interface PartyBill { key: string; title: string; introduced: string | null; status: string | null }
export function partyBills(label: string, divisions: { bills?: Record<string, PartyBill[]> } | null | undefined, same?: (a: string, b: string) => boolean): PartyBill[];
export function partyBillsHTML(label: string, bills: PartyBill[], h: { esc: (s: unknown) => string; sourceLineHTML: (o: object) => string }, opts?: { updated?: string }): string;
export function dayMonthYear(day: string): string;
