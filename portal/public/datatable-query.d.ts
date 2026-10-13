export function queryValues(input: unknown): Generator<string>;
export function queryEntryValues(key: string, value: string): Generator<string>;
export function rawQueryValues(params: URLSearchParams): Generator<string>;
export function repeatedTableKeys(params: URLSearchParams, urlKey?: string | null): Set<string>;
export function scrubQuery(params: URLSearchParams, safe: (text: string) => boolean, urlKey?: string | null): {params: URLSearchParams; rejected: boolean; noindex: boolean};
