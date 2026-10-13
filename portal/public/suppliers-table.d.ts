import type {DataTableConfig, Page, Row} from './datatable.js';
export function suppliersTableConfig(options?: {donor?:string; rows?: Row[]}): DataTableConfig;
export function suppliersTableHTML(page:Page, params?:URLSearchParams):string;
export function mountSuppliersTable(el:Element, options?:{params?:URLSearchParams;signal?:AbortSignal}):Promise<{destroy():void}>;
