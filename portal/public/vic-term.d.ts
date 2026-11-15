export interface VicTermRow { jurisdiction?: string; chamber: string; name: string; dissolved_for?: string | null; representatives?: {party?: string; person_id?: string; person: {name: string; aliases?: string[]; legacy_person_id?: string}}[] }
export const VIC_VACANT_AT_EXPIRY: {chamber: string; electorate: string}[];
export function vicSeatEnded(row: VicTermRow | null | undefined, rows: VicTermRow[] | null | undefined): boolean;
export function vicSeatVacantAtExpiry(row: VicTermRow | null | undefined): boolean;
export function vicMembersAtExpiry<T extends VicTermRow>(row: T, rows: VicTermRow[] | null | undefined): NonNullable<T['representatives']>;
export function vicExpiredPhrase(row?: {chamber?: string} | null): string;
export function vicMemberRole(row: {name: string; chamber: string}): string;
export function vicVacantSentence(row?: {chamber?: string} | null): string;
export function vicTermEnd<T extends VicTermRow>(person: {name: string; pid?: string | null; representation?: {electorate: string; jurisdiction: string; chamber: string}[] | null} | null | undefined, rows: T[] | null | undefined): {row: T | null} | null;
export function vicTermEndDay(): {long: string; short: string};
export function vicIsMember(rep: NonNullable<VicTermRow['representatives']>[number], person: {name: string; pid?: string | null}): boolean;
