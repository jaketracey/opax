export function tagHTML(label: string, href?: string): string;
export function statusLabelHTML(word: string, tone?: string): string;
export function partyLabelHTML(party: string, options?: { full?: boolean }): string;
export function machineLabelHTML(options?: { note?: string; inline?: boolean; pill?: boolean; className?: string; notRecord?: boolean }): string;
export function sourceLineHTML(options?: { updated?: string; dateLabel?: string; source?: string; state?: string; originals?: { href: string; label?: string }[]; asAt?: string; facts?: string[][]; notes?: string[]; licence?: string }): string;
export function moreMenuHTML(items: { href?: string; label: string; detail?: string; action?: string }[], label?: string, options?: { id?: string }): string;
export const PARTY_MAP: Record<string, [string, string]>;
export const PARTY_NAMES: Record<string, [string, string]>;
export const PARTY_ALIASES: Record<string, string>;
export function partyShortName(party: string): string;
export interface PartyFormerName { name: string; aliases?: string[]; until?: string }
export interface PartyRename { code: string; name: string; since?: string; former: PartyFormerName[]; history: string; sources: { label: string; href: string }[] }
export const PARTY_RENAMES: PartyRename[];
export function partyRename(label: string): PartyRename | null;
export function partyFormerName(label: string): PartyFormerName | null;
export function partyNameForPeriod(label: string, lastFy: number | undefined): { name: string; now: string | null };
export function partyNames(party: string): [string, string];
export const CHAMBER_LABELS: Record<string, string>;
export function chamberLabel(code: string | null | undefined): string;
