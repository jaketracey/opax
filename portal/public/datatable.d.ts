// DataTable contract types: see docs/design/datatable.contract.md (frozen 10 Oct 2026).
export type ColumnType = 'text' | 'category' | 'money' | 'count' | 'year' | 'date';
export type Row = Record<string,unknown>;
export interface Column { key: string; label: string; type: ColumnType; sortable?: boolean; facet?: 'chips' | 'multi' | 'range' | null; align?: 'start' | 'end'; bar?: boolean; hideWhenConstant?: boolean; format?: 'compact' | 'exact'; sourceName?: boolean; primary?: boolean; computed?: boolean; href?: (row: Row) => string | null; facetOptions?: string[]; facetValues?: (row: Row) => unknown[]; facetLabel?: string }
export interface Action { icon: string; label: string; href: (row: Row) => string | null }
export interface Query { q?: string; filters?: Record<string, string[] | { min?: number; max?: number }>; sort?: { key: string; dir: 'asc' | 'desc' }; page?: number; pageSize?: number }
export interface Page { rows: Row[]; total: number; page: number; pageSize: number; pending?: boolean; facets?: Record<string, { value: string; count: number }[] | { min: number; max: number }> }
/** One part of a phone row's line: a column, a pair read as "1998 to 2024" (`to`), a count with its unit (`unit: ['receipt', 'receipts']`), a value after a word (`label: 'From'`), a value then a second column after a word (`then: {key: 'status_as_of', word: 'as at'}`), or values to leave out (`omit: ['Not recorded']`). Each part is read with its column's name for screen readers. */
export type PhoneEntry = string | { key: string; to?: string; unit?: [string, string]; label?: string; then?: { key: string; word: string }; omit?: string[] };
/** Under 700 px each row is its title, then `meta` joined by dots with `figure` at the end. `false` keeps the table's own phone grid. */
export interface PhoneLayout { figure?: PhoneEntry[]; meta?: PhoneEntry[] }
export interface DataTableConfig { id: string; caption: string; columns: Column[]; rows?: Row[]; source?: { endpoint: string; params?: Record<string, string> }; pageSize?: number; defaultSort?: Query['sort']; primaryLink?: (row: Row) => string | null; actions?: Action[]; export?: { filename: string; endpoint?: string } | false; urlKey?: string; density?: 'comfortable' | 'compact'; columnsVisible?: string[]; pageType: string; initialRejected?: boolean; initialQuery?: Query; initialQueryKeys?: string[]; loadingLabel?: string; phone?: PhoneLayout | false }
export function guardTableURL(config: DataTableConfig, input: string | URL): {url: URL; query: Query; rejected: boolean};
export function dataTableHTML(config: DataTableConfig, page: Page, requestURL?: string | URL): string;
export function mountDataTable(el: Element, config: DataTableConfig): { destroy(): void };
export function pendingPage(config: DataTableConfig): Page;
export function mountTableLoaders(root: ParentNode | null | undefined): void;
export function applyQuery(rows: Row[], config: DataTableConfig, query: Query): Page;
export function toCSV(rows: Row[], config: DataTableConfig): string;
export function parseQuery(params: URLSearchParams, urlKey?: string): Query;
export function serializeQuery(query: Query, urlKey?: string): string;
export function formatCell(value: unknown, column: Column): string;
