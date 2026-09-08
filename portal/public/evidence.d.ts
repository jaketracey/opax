export function nameKey(value: unknown): string;
export function evidenceHTML(entry: Record<string, unknown>): string;
export function mountEvidence(root: HTMLElement, identity: { name?: string; abn?: string }, options?: { signal?: AbortSignal; alive?: () => boolean; compact?: boolean }): Promise<boolean>;
