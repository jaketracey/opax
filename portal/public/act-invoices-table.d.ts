import type {Column,DataTableConfig,Page,Query} from './datatable.js'
export const ACT_INVOICES_ID:string
export const ACT_INVOICES_SOURCE:string
export const ACT_INVOICES_SEARCH:string[]
export const ACT_INVOICES_FILTERS:string[]
export const actInvoicesColumns:Column[]
export function actInvoicesConfig():DataTableConfig
export function actInvoicesURL(input:URL|string):{url:URL;query:Query;rejected:boolean}
export function actInvoicesTableHTML(config:DataTableConfig,page:Page,url?:URL,definitions?:Record<string,string[]>):string
export function decorateActInvoices(root:ParentNode,definitions?:Record<string,string[]>):void
