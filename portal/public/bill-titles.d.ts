export const BILL_TITLES_PATH: string;
export function billTitlesFile(index: { generated_at?: string; bills: Record<string, unknown>[] }): {
  generated_at?: string;
  bills: { key: string; title: string | null; short_title?: string | null; aliases?: string[]; jurisdiction?: string; status?: string | null; status_as_of?: string | null; has_summary?: boolean }[];
};
export const BILLS_DATE_PATH: string;
export function billsDateFile(index: { generated_at?: string }): { generated_at: string };
export const BILL_PROGRESS_WORDS: string;
/** The bill fields the as-at guard reads: a bill whose own record is newer than the export gets no line. */
export interface BillAsAtDates { introduced?: unknown; status_as_of?: unknown }
export function billsAsAtIso(generatedAt: unknown): string;
export function billsAsAtDay(generatedAt: unknown, bill?: BillAsAtDates | null): string;
export function billProgressAsAt(generatedAt: unknown, bill?: BillAsAtDates | null): string;
export const DIVISION_BILLS_PATH: string;
export function divisionBillsFile(index: { generated_at?: string; bills: Record<string, unknown>[] }): {
  generated_at?: string;
  bills: { key: string; divisions: number; status_as_of?: string | null; introduced?: string | null }[];
};
