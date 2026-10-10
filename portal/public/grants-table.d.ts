import type {DataTableConfig, Page, Query} from './datatable.js';
export const GRANTS_COVERAGE: string;
export const GRANTS_SEARCH_KEYS: string[];
export function grantsTableConfig(params?: URLSearchParams): DataTableConfig;
export function sanitizeGrantsState(query: Query, page: Page): Query;
export function grantsTableHTML(page: Page, params?: URLSearchParams): string;
export function mountGrantsTable(el: Element, params?: URLSearchParams, options?: {signal?: AbortSignal}): Promise<{destroy(): void}>;
