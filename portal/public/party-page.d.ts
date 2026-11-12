export function partySpeechLabel(label: string, sources?: {
  indexed?: { parties?: Record<string, number> } | null;
  roster?: { people?: { party?: string | null; speeches?: number | null }[] } | null;
  same?: (a: string, b: string) => boolean;
}): { label: string; count: number } | null;

export interface PartyPage {
  label: string; href: string; aliases: string[]; money: boolean; roster: boolean; divisions: boolean; lastmod: string;
}
export const PARTY_MONEY_PATHS: string[];
export function canonicalPartyPages(sources?: {
  money?: { meta?: { generated?: string }; nodes?: {kind: string; label: string}[] }[];
  roster?: { meta?: { generated?: string }; people?: {party?: string | null; party_now?: string | null; parties?: string[]; recorded_parties?: (string | {party?: string})[]}[] } | null;
  divisions?: { parties?: string[] | Record<string, unknown>; generated_at?: string } | null;
}): PartyPage[];
export function readPartyPages(read: <T>(path: string, init?: {cache: 'no-cache'}) => Promise<T>): Promise<PartyPage[]>;
export function resolvePartyPage(segment: string, pages: PartyPage[]): PartyPage | null;
export function partyPageCoverage(page: PartyPage): string;
