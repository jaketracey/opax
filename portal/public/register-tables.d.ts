import type {DataTableConfig, Query, Row} from './datatable.js';
import type {AuditRow} from './audit.js';
export interface InterestRegister {source_url?: string; as_at?: string; buckets: Record<string,{items:{description:string;holder?:string;url?:string;page?:number;date?:string}[]}>}
export interface PartyGraph {nodes:{id:string;kind:string;label:string;industry?:string;aliases?:string[]}[];edges:{source:string;target:string;total:number;count?:number;firstYear?:number;lastYear?:number;flow?:string;grant?:boolean}[]}
export interface IndividualAggregate {donors:number;total:number;count:number}
export function instrumentTableConfig(): DataTableConfig;
export function auditTableConfig(records: AuditRow[]): DataTableConfig;
export function interestTableData(register: InterestRegister, withheld?: (...texts:unknown[])=>boolean,privacyCheck?:(text:string)=>boolean): {rows:Row[];omitted:number};
export function interestTableConfig(rows: Row[],privacyCheck?:DataTableConfig['privacyCheck']): DataTableConfig;
export function partyMoneyData(graph: PartyGraph, partyId: string, withheld?: (...texts:unknown[])=>boolean): {rows:Row[];aggregate:IndividualAggregate};
export function partyMoneyTableConfig(rows:Row[],aggregate?:IndividualAggregate,id?:string,urlKey?:string,pageType?:string,privacyCheck?:DataTableConfig['privacyCheck']): DataTableConfig;
export function registerTableHTML(config:DataTableConfig,query?:Query): string;
export function mountRegisterTable(el:Element,config:DataTableConfig): {destroy():void};
export function hydrateRegisterTables(root?:ParentNode): void;
