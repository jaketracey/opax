import type {DonorDisclosureRecord} from './donor-disclosure.js';
import type {DataTableConfig} from './datatable.js';
export interface MoneyConnectionGraph {
  meta?: {source?: string; source_url?: string};
  nodes: (DonorDisclosureRecord & {id: string; label: string; kind: string; aliases?: string[]; industry?: string; group?: string; profileUrl?: string; flow?: string; explorer?: string})[];
  edges: {source: string; target: string; total: number; count: number; firstYear: number | null; lastYear: number | null; byYear?: Record<string, [number, number]>; undated?: [number, number]; flow?: string; grant?: boolean}[];
}
export function moneyConnectionsConfig(graph: MoneyConnectionGraph): DataTableConfig;
export function filterMoneyConnectionView(graph: MoneyConnectionGraph, params: URLSearchParams): MoneyConnectionGraph;
export function prepareMoneyConnectionsConfig(graph: MoneyConnectionGraph): Promise<DataTableConfig>;
