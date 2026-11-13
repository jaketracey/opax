export function billNoteRepair(text: unknown): string;
export function billStripTitle(text: unknown, bill?: {title?: string; short_title?: string}): string;
export function billStripStage(text: unknown, stage?: string): string;
export function divisionPlain(text: unknown): string;
export function renderDivisionMarkdown(text: unknown): string;
export interface DivisionCoverageRecord {
  key?: string; date?: string; house?: string | null; source_url?: string;
  ayes?: number; noes?: number;
  members?: { vote: string }[];
  _meta?: { member_coverage?: string; member_reconciliation?: {
    rule: string; named: number[]; official: number[]; tellers: number[];
    key: string; date: string; house: string; division_source_url: string;
    source_url: string; gid: string; sha256: string; member_sha256: string;
  } };
}
export function divisionComplete(d: DivisionCoverageRecord, named?: number[]): boolean;
export function divisionCoverageNote(d: DivisionCoverageRecord, named?: number[]): string;
