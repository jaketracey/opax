// The part of money-explain.js the Worker imports (src/seo-content.ts: the money answer and the homepage map card).
export interface ReceiptHeadline {
  total: number; receipts: number; pairs: number; sources: number; parties: number;
  firstYear: number | null; lastYear: number | null; typed: boolean; scope: string;
}
export function receiptHeadline(graph: unknown): ReceiptHeadline;
