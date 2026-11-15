export function yearQuarters(year: number | string, financial?: boolean): string[];
export function yearCoverage(periods: Iterable<string> | null | undefined, year: number | string, options?: { financial?: boolean }): { quarters: string[]; complete: boolean; text: string };
