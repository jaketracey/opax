import type {Row, Query, Page, DataTableConfig} from './datatable.js';
type Guard = ((...texts: unknown[]) => boolean) & {subjects?: (...texts: unknown[]) => string[]; recipientCheck?: (text: string) => boolean; supplierWithheld?: (id: string) => boolean};
export function compileContractGuard(phrases: {withheld: [string, string[]][]}): Guard;
export function contractTitle(contract: Row): string;
export function placeholderContract(contract: Row): boolean;
export function ausTenderURL(row: Row): string | null;
export function contractRows(contracts: Row[], withheld?: Guard): Row[];
export function contractsTableConfig(options?: {supplierId?: string; rows?: Row[]; count?: number; privacyCheck?: (text: string) => boolean; dataPrivacyCheck?: (text: string) => boolean}): DataTableConfig;
export function publicContractQuery(params: URLSearchParams, withheld: Guard): Query;
export function contractsHubHTML(loadPage: (query: Query) => Promise<Page>, params: URLSearchParams, withheld: Guard): Promise<string>;
export function supplierContractsHTML(contracts: Row[], id: string, params: URLSearchParams, withheld: Guard, recipient?: unknown): string;
export function contractsTableHTML(config: DataTableConfig, page: Page, options?: {supplierId?: string; count?: number; stateRejected?: boolean}): string;
export function mountContractsTable(el: Element, options?: {supplierId?: string; count?: number; seed?: {rows?: Row[]; page: Page}; signal?: AbortSignal; params?: URLSearchParams}): Promise<{destroy(): void}>;
export function contractsClientRows(host: Element): Row[];
export function isPublicContractRow(row: Row): boolean;

export function remotePrivacyCheck(text: string, surface?: string): Promise<boolean>;
