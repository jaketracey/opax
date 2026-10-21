export const STATUTE_TITLES_ASSET: string
export function normaliseStatuteTitle(title: string): string
export function territoryAfterStatutes(question: string, titles?: ReadonlySet<string> | null): boolean
export function loadStatuteTitles(asset: (path: string) => Promise<unknown>, signal?: AbortSignal, timeoutMs?: number): Promise<ReadonlySet<string> | null>
