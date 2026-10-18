import type {DonorDisclosureRecord} from './donor-disclosure.js';
import type {DataTableConfig, Query, Row} from './datatable.js';
import type {AuditRow} from './audit.js';
export interface InterestRegister {source_url?: string; as_at?: string; buckets: Record<string,{items:{description:string;holder?:string;url?:string;page?:number;date?:string}[]}>}
export interface PartyGraph {meta?:{source?:string;source_url?:string};nodes:(DonorDisclosureRecord & {id:string;kind:string;label:string;industry?:string;aliases?:string[]})[];edges:{source:string;target:string;total:number;count?:number;firstYear?:number;lastYear?:number;flow?:string;grant?:boolean}[]}
export function instrumentTableConfig(): DataTableConfig;
export function auditTableConfig(records: AuditRow[]): DataTableConfig;
export function interestTableData(register: InterestRegister): {rows:Row[];omitted:number};
export function interestTableConfig(rows: Row[]): DataTableConfig;
export function vicGiftsTableConfig(params?:Record<string,string>,populatedFields?:string[]): DataTableConfig;
export function vicGiftsQuery(rows:Row[],config:DataTableConfig,query?:Query): import('./datatable.js').Page;
export function stateBillsTableConfig(rows:Row[]): DataTableConfig;
export function governmentFinanceTableConfig(rows:Row[]): DataTableConfig;
export function taxExpendituresTableConfig(rows:Row[]): DataTableConfig;
export function stateBillsTableQuery(params:URLSearchParams,config:DataTableConfig): Query;
export function partyMoneyData(graph: PartyGraph, partyId: string): {rows:Row[]};
export function partyMoneyTableConfig(rows:Row[],id?:string,urlKey?:string,pageType?:string,scope?:{party:string;jurisdiction?:string}|null): DataTableConfig;
export function registerTableHTML(config:DataTableConfig,query?:Query,requestURL?:string|URL): string;
export function mountRegisterTable(el:Element,config:DataTableConfig): {destroy():void};
export function hydrateRegisterTables(root?:ParentNode): void;
export function categoryMembers(values:string[]): string[];
export function registerTableQuery(params:URLSearchParams,config:DataTableConfig):Query;

export function govAdvertisingTableConfig(rows:Row[]): DataTableConfig;
