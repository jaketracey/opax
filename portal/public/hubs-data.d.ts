export function day(value: unknown): string;
export function latest(dates: unknown[]): string;
export function houseName(house: string): string;
export function sydneyDay(now?: Date): string;
export function orderedWeeks<T extends {start: string; end: string}>(weeks: T[], today: string): T[];
export function currentSittingPath(weeks: {start: string; end: string}[], today: string): string;
