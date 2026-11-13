/** "2026-09-08": the Sydney day the connections export was built, read from its metadata; '' without a valid build time. */
export function evidenceAsAt(meta: unknown): string;
/** The dated source line for a connections block ("As at 8 Sep 2026 · …"); '' without a dated export. */
export function evidenceDateHTML(meta: unknown, options?: { plain?: boolean }): string;
