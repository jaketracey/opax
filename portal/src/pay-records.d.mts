export interface PayRecordRow {
  key: string; kind: 'pay'; title: string; href: string; snippet: string
  extra: { slug: string; record_id?: string; speakers?: string[]; parties?: string[]; aliases?: string; state: string; from: number; to: number; source: string; url: string; dateLabel: string }
}
export const PAY_SOURCE: string
export function payPersonRecord(pay: unknown, id: string): PayRecordRow | null
export function payPersonOrder(pay: unknown): string[]
export function payGeneralRecords(pay: unknown): PayRecordRow[]
