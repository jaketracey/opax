import type {DataTableConfig, Page} from './datatable.js';
export const GRANTS_COVERAGE: string;
export const GRANTS_SEARCH_KEYS: string[];
export function grantsTableConfig(params?: URLSearchParams): DataTableConfig;
export function grantsTableHTML(page: Page, params?: URLSearchParams, privacyCheck?: (text: string) => boolean, requestURL?: URL): string;
export function mountGrantsTable(el: Element, params?: URLSearchParams, options?: {signal?: AbortSignal}): Promise<{destroy(): void}>;
