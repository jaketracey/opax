export interface VideoRow { id: string; title: string; published?: string | null; kind: string; date?: string | null; chamber?: string; person_slug?: string | null; person_pid?: string | null; url?: string }
export const EMBED_ORIGIN: string;
export function embedUrl(id: string): string;
export function watchUrl(id: string): string;
export function sittingVideos<T extends VideoRow>(videos: readonly T[] | null | undefined, start: string, end: string): T[];
export function personVideos<T extends VideoRow>(videos: readonly T[] | null | undefined, slug: string | null | undefined, person?: { pid?: string | number | null; name?: string; full?: string } | null): T[];
export function videoCardHTML(v: VideoRow | null | undefined, options?: { person?: { href: string; label: string } | null }): string;
export function videoSectionHTML(title: string, rows: readonly VideoRow[], options?: { id?: string; note?: string; after?: string }): string;
export function playVideo(button: unknown): unknown;
export function wireVideoCards(doc?: unknown): void;
export function ensureVideoStyles(doc?: unknown): void;
