export type ActInvoiceCoverage={exact_duplicate_groups:number;extra_duplicate_rows:number;observed_months:number;missing_months:string[];outside_period_rows:number;missing_payment_dates:number}
export type ActInvoiceContext={source_url:string;snapshot:string;catalogued_period:string;coverage?:ActInvoiceCoverage}
export function actInvoicePeriod(value:unknown):string
export function actInvoiceSnapshotDate(value:string):string
export function actInvoiceCoverageNotes(metadata:ActInvoiceContext):string[]
export function actInvoiceEntityDefinitions(description:unknown):Record<string,string[]>
export function actInvoiceEntityName(code:string,definitions:Record<string,string[]>):string
