import type { MoneyGraph, MoneyEdge, MoneyNode } from '../graph/index';
export type MoneyFilters = { type?: 'all' | 'receipts' | 'contracts' | 'grants'; party?: string; industry?: string; min?: number; query?: string };
export function moneyFlowType(edge: MoneyEdge, nodes: Map<string, MoneyNode>): 'receipts' | 'contracts' | 'grants' | null;
export function filterMoneyEdges(graph: MoneyGraph, filters?: MoneyFilters): MoneyEdge[];
export function moneyTotals(graph: MoneyGraph): { receipts: number; contracts: number; grants: number };
export function moneyRecordsCSV(graph: MoneyGraph): string;
export function readMoneyFilters(params: URLSearchParams): MoneyFilters;
