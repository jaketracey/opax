export interface SpeechScope { state: string; chamber: string; service?: { start: string; end: string }[]; speakers?: string[] }
export interface AttributedRow {
  kind?: string | null; state?: string | null; chamber?: string | null; speaker?: string | null;
  speaker_type?: string | null; witness_name?: string | null; person_id?: string | number | null;
  speaker_attribution?: string | null;
  date?: string | null;
}
export function isWitness(row: AttributedRow): boolean;
export function isUnattributed(row: AttributedRow): boolean;
export function isMultiSpeaker(row: AttributedRow & {labels?: {speaker_type?: string}}): boolean;
export function groupAvatarHTML(): string;
export function speakerLabel(row: AttributedRow & {chair_role?: string}): string;
export function resolvedParticipants(value: unknown): {name: string; person_id: string; role?: string}[];
export function belongsToScope(row: AttributedRow, scope: SpeechScope): boolean;
export function scopeFilter(scope: SpeechScope): Record<string, unknown>;
export function speakerHref(row: AttributedRow, href: string): string;
export interface SplitPerson { name: string; full?: string; speech_scope?: SpeechScope; prints?: string[] }
export function splitSpeakers(person: SplitPerson | null | undefined): string[];
export function printSpeakers(person: SplitPerson | null | undefined): string[];
export function splitPerson<T extends SplitPerson>(people: T[], name: string): T | null;
export function personScope(person: SplitPerson | null | undefined): SpeechScope | null;
export interface DatedPartyPerson extends SplitPerson {
  affiliations?: { jurisdiction: string; chamber: string; party?: string | null; start: string; end?: string | null }[];
}
export function datedAffiliationParty(row: AttributedRow, person: DatedPartyPerson | null | undefined): string | null;
export function scopedCollaborators(filter: unknown, scope: Pick<SpeechScope, 'speakers'>): unknown;
