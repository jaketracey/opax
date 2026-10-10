import type {DataTableConfig, Query} from './datatable.js';
export interface MoneyConnectionGraph {
  nodes: {id: string; label: string; kind: string; aliases?: string[]; industry?: string; group?: string; profileUrl?: string; flow?: string; explorer?: string}[];
  edges: {source: string; target: string; total: number; count: number; firstYear: number | null; lastYear: number | null; byYear?: Record<string, [number, number]>; undated?: [number, number]; flow?: string; grant?: boolean}[];
}
export function moneyConnectionsConfig(graph: MoneyConnectionGraph): DataTableConfig;
export function filterMoneyConnectionView(graph: MoneyConnectionGraph, params: URLSearchParams): MoneyConnectionGraph;
export function cleanMoneyConnectionsParams(params: URLSearchParams, graph: MoneyConnectionGraph): {params: URLSearchParams; blocked: boolean};
export function cleanMoneyConnectionsQuery(query: Query, graph: MoneyConnectionGraph): {query: Query; blocked: boolean};
