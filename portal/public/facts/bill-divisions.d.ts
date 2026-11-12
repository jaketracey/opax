import type {Division} from '../../src/seo-content';
export function withBillDivisions<T extends {divisions?: Division[]}>(bill: T, read: <R>(path: string) => Promise<R>): Promise<T>;
