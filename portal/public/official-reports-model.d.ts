import type { ReportType } from '../src/report-records'
export type ReportSummary = { schema: number; type: ReportType; count: number; bodies: number; from: string | null; to: string | null; snapshot_at: string }
export type ReportYear = { year: string; slug: string; date: string | null; portfolio: string }
export type ReportIndexRow = { id?: string; slug?: string; title: string; body?: string; jurisdiction?: string; date?: string | null; year?: string | null; aliases: string[]; years?: string | ReportYear[]; body_type?: string; status?: string; final_date?: string | null; inquiry_type?: string; transcripts?: number; operation?: string }
export type ReportIndex = ReportSummary & { rows: ReportIndexRow[] }
export type ReportQuery = Record<string, string>
export type ReportResults = { rows: ReportIndexRow[]; total: number; reports: number; pages: number; page: number }
export const REPORT_COLLECTIONS: Record<ReportType, { path: string; title: string; description: string; source: string; filters: [string, string][] }>
export const PAGE_SIZE: number
export function reportRoot(type: string): string
export function jurisdictionName(value: string): string
export function escapeReportHTML(value: unknown): string
export function reportState(params: URLSearchParams, type: ReportType): ReportQuery
export function reportOptions(index: ReportIndex, key: string): string[]
export function queryReports(index: ReportIndex, state: ReportQuery): ReportResults
export function reportCount(result: ReportResults, type: ReportType): string
export function reportPageHref(type: ReportType, state: ReportQuery, page: number): string
export function reportResultsHTML(result: ReportResults, type: ReportType, state: ReportQuery): string
