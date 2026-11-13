export interface PayRecordRow {
  key: string; kind: 'pay'; title: string; href: string; snippet: string
  extra: { slug: string; record_id?: string; speakers?: string[]; parties?: string[]; aliases?: string; state: string; from: number; to: number; source: string; url: string; dateLabel: string }
}
export const PAY_SOURCE: string
export function payPersonRecord(pay: unknown, id: string): PayRecordRow | null
export function payPersonOrder(pay: unknown): string[]
export function payGeneralRecords(pay: unknown): PayRecordRow[]
export interface PayOfficeRowLike { id: string; office: string; kind: string; head: boolean; amount: number | null; min: number | null; max: number | null; source: string }
export interface PayOfficeSource { id: string; frl_id: string; compilation_id: string; compilation_no: number; compilation_date: string; registered: string; title: string; url: string; publisher: string }
export function officeRate(row: { amount: number | null; min: number | null; max: number | null }): string
export function officeSource(offices: { meta: { sources: PayOfficeSource[] } }, row: { source: string }): PayOfficeSource | undefined
export function payOfficeRecord(offices: unknown, row: unknown): PayRecordRow
export function payOfficeGeneralRecords(offices: unknown): PayRecordRow[]
export function rankedOffices<T extends PayOfficeRowLike>(offices: { offices: T[] }, filter?: (row: T) => boolean): T[]
