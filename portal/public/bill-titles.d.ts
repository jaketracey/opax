export const BILL_TITLES_PATH: string;
export function billTitlesFile(index: { generated_at?: string; bills: Record<string, unknown>[] }): {
  generated_at?: string;
  bills: { key: string; title: string | null; short_title?: string | null; aliases?: string[]; jurisdiction?: string }[];
};
export const BILLS_DATE_PATH: string;
export function billsDateFile(index: { generated_at?: string }): { generated_at: string };
