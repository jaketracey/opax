import type {DataTableConfig, Page, Row} from './datatable.js';
export function suppliersTableConfig(options?: {rows?: Row[]; privacyCheck?:(text:string)=>boolean; dataPrivacyCheck?:(text:string)=>boolean}):DataTableConfig;
export function suppliersTableHTML(page:Page, withheld:((...texts:unknown[])=>boolean)&{recipientCheck?:(text:string)=>boolean}, params:URLSearchParams):string;
export function suppliersClientRows(host:Element):Row[];
