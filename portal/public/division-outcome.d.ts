export const AGREED: 'Agreed';
export const NOT_AGREED: 'Not agreed';
export function divisionOutcome(result: unknown, counts?: {ayes?: unknown; noes?: unknown} | null): 'Agreed' | 'Not agreed' | '';
export function notAgreedWording(text: unknown): string;
