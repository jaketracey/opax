// DataTable contract types: see docs/design/datatable.contract.md (frozen 10 Oct 2026).
export type ColumnType = 'text' | 'category' | 'money' | 'count' | 'year' | 'date';
export type Row = Record<string, unknown>;
export interface Column { key: string; label: string; type: ColumnType; sortable?: boolean; facet?: 'chips' | 'multi' | 'range' | null; align?: 'start' | 'end'; bar?: boolean; hideWhenConstant?: boolean; format?: 'compact' | 'exact'; primary?: boolean }
export interface Action { icon: string; label: string; href: (row: Row) => string | null }
export interface Query { q?: string; filters?: Record<string, string[] | { min?: number; max?: number }>; sort?: { key: string; dir: 'asc' | 'desc' }; page?: number; pageSize?: number }
export interface Page { rows: Row[]; total: number; page: number; pageSize: number; facets?: Record<string, { value: string; count: number }[] | { min: number; max: number }> }
export interface DataTableConfig { id: string; caption: string; columns: Column[]; rows?: Row[]; source?: { endpoint: string; params?: Record<string, string> }; pageSize?: number; defaultSort?: Query['sort']; primaryLink?: (row: Row) => string | null; actions?: Action[]; export?: { filename: string } | false; urlKey?: string; density?: 'comfortable' | 'compact'; columnsVisible?: string[]; pageType: string; privacy?: 'donors' }
export function dataTableHTML(config: DataTableConfig, page: Page): string;
export function mountDataTable(el: Element, config: DataTableConfig): { destroy(): void };
export function applyQuery(rows: Row[], config: DataTableConfig, query: Query): Page;
export function toCSV(rows: Row[], config: DataTableConfig): string;
export function parseQuery(params: URLSearchParams, urlKey?: string): Query;
export function serializeQuery(query: Query, urlKey?: string): string;
export function formatCell(value: unknown, column: Column): string;
