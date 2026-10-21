export const STATUTE_TITLES_ASSET: string
export function normaliseStatuteTitle(title: string): string
export function statuteTitleSegments(text: string): Iterable<{ text: string; start: number }>
export function scopeAfterStatutes(question: string, titles?: ReadonlySet<string> | null): { text: string; territory: boolean }
export function territoryAfterStatutes(question: string, titles?: ReadonlySet<string> | null): boolean
export function loadStatuteTitles(asset: (path: string) => Promise<unknown>, signal?: AbortSignal, timeoutMs?: number): Promise<ReadonlySet<string> | null>
