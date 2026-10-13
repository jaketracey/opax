import type {Column, Query} from '../public/datatable.js';
export const TABLE_DATASETS: Record<string, {columns: Column[]; searchKeys?: string[]; privacy?: 'donors'; defaultSort: NonNullable<Query['sort']>}>;
export function tableText(value: unknown): string;
export function tableTerms(value: unknown): string[];
export function tableBucket(term: string): number;
export function compareTableValues(a: unknown, b: unknown): number;
