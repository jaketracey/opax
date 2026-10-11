export const SA_EXCERPT_WORDS: number;
export const SA_EXCERPT_LABEL: string;
export function saFullText(flag?: string): boolean;
export function isSaHansard(record: unknown): boolean;
export function saOfficialUrl(record: unknown): string | null;
export function saExcerpt(value: string, match?: string, cap?: number): string;
export interface SaExcerpt { excerpt?: boolean; excerpt_label?: string; excerpt_word_limit?: number; source_url?: string | null; full_text_available?: boolean }
export function saDisplayRecord<T extends object>(record: T, flag?: string, match?: string, preferredText?: string): T & SaExcerpt;
export function saDisplayPayload<T>(value: T, flag?: string, match?: string, originals?: Map<string,string>): T;
export function saDisplayStreamPayload<T>(value: T, flag?: string, match?: string): T;
