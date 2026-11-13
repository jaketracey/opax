export type NotFoundKind = 'page' | 'person' | 'donor' | 'bill' | 'division' | 'document' | 'electorate' | 'recipient';
export const NOT_FOUND_KINDS: Record<NotFoundKind, { title: string; pill: [string, string]; words: boolean }>;
export const NOT_FOUND_LINE: string;
export function notFoundWords(kind: NotFoundKind, slug: string): string;
export function notFoundHTML(options?: { kind?: NotFoundKind; slug?: string; headingId?: string; query?: string }): string;
