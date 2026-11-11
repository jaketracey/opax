export const BILL_TITLES_PATH: string;
export function billTitlesFile(index: { generated_at?: string; bills: Record<string, unknown>[] }): {
  generated_at?: string;
  bills: { key: string; title: string | null; aliases?: string[]; jurisdiction?: string }[];
};
