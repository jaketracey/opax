export const TRANSCRIPT_LABEL: string;
export const TRANSCRIPT_NOTE: string;
export function transcriptNote(sources: unknown, saved?: boolean): string | null;
export function spokenTranscriptNote(answer: unknown): string | null;
export function withTranscriptNote<T>(payload: T, saved?: boolean): T;
export function transcriptNoteEnd(answer: unknown): number | null;
