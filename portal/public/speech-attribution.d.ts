export interface SpeechScope { state: string; chamber: string }
export interface AttributedRow {
  kind?: string | null; state?: string | null; chamber?: string | null;
  speaker_type?: string | null; witness_name?: string | null; person_id?: string | number | null;
  speaker_attribution?: string | null;
}
export function isWitness(row: AttributedRow): boolean;
export function isUnattributed(row: AttributedRow): boolean;
export function belongsToScope(row: AttributedRow, scope: SpeechScope): boolean;
export function scopeFilter(scope: SpeechScope): Record<string, unknown>;
export function speakerHref(row: AttributedRow, href: string): string;
