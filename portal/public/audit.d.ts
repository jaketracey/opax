export const AUDIT_ID: RegExp;
export interface AuditRow { id: string; number: number; year: string; report_label: string; title: string; tabled_date: string; sectors: string[]; entities: string[]; canonical_url: string }
export function auditComplete(value: unknown): boolean;
export function filterAudit(rows: AuditRow[], params: URLSearchParams): AuditRow[];
