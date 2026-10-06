export interface SpeechScope { state: string; chamber: string; service?: { start: string; end: string }[]; speakers?: string[] }
export interface AttributedRow {
  kind?: string | null; state?: string | null; chamber?: string | null; speaker?: string | null;
  speaker_type?: string | null; witness_name?: string | null; person_id?: string | number | null;
  speaker_attribution?: string | null;
  date?: string | null;
}
export function isWitness(row: AttributedRow): boolean;
export function isUnattributed(row: AttributedRow): boolean;
export function belongsToScope(row: AttributedRow, scope: SpeechScope): boolean;
export function scopeFilter(scope: SpeechScope): Record<string, unknown>;
export function speakerHref(row: AttributedRow, href: string): string;
export interface SplitPerson { name: string; full?: string; speech_scope?: SpeechScope }
export function splitSpeakers(person: SplitPerson | null | undefined): string[];
export function splitPerson<T extends SplitPerson>(people: T[], name: string): T | null;
export function personScope(person: SplitPerson | null | undefined): SpeechScope | null;
export function scopedCollaborators(filter: unknown, scope: SpeechScope): unknown;
