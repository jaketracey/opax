export const MACHINE_NOTICE: string;
export const MACHINE_NOTICE_STORED: string;
export const MACHINE_SUMMARY_LABEL: string;
export const MACHINE_SUMMARY_WORDS: string;
export const MACHINE_SUMMARY_PREFIX: string;
export const MACHINE_NOTICE_TRANSCRIPT: string;
export function modelWritten(payload: unknown): boolean;
export function machineNotice(payload: unknown, citesTranscript?: boolean): string | null;
