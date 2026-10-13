export type CatalogueRow = [string, string, string[], string, string | null, string, number];
export const FRL_ID: RegExp;
export function unpack(value: unknown, schemas: string[][], strings?: string[]): unknown;
export function filterInstruments(records: CatalogueRow[], params: URLSearchParams): CatalogueRow[];
export function catalogueComplete(manifest: unknown): boolean;
export function reconciledCounts(manifest: unknown): boolean;

export function instrumentTableRows(read:<T>(path:string)=>Promise<T>,manifest:{schemas:string[][];strings?:string[];chunks:{path:string}[]},records:CatalogueRow[]):Promise<import('./datatable.js').Row[]>;
