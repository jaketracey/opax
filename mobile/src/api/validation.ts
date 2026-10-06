import { ApiError } from './errors';

export type Decoder<T> = (value: unknown) => T;
export function invalid(
  message = 'The catalog response could not be read.',
): never {
  throw new ApiError('invalid-data', message);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export const text: Decoder<string> = (v) =>
  typeof v === 'string' ? v : invalid();
export const nonempty: Decoder<string> = (v) =>
  text(v).trim() ? text(v) : invalid();
export const number: Decoder<number> = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? v : invalid();
export const count: Decoder<number> = (v) =>
  Number.isSafeInteger(number(v)) && number(v) >= 0 ? number(v) : invalid();
export const boolean: Decoder<boolean> = (v) =>
  typeof v === 'boolean' ? v : invalid();
export const date: Decoder<string> = (v) => {
  const s = nonempty(v);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s.slice(0, 10)
  )
    invalid();
  return s;
};
export const url: Decoder<string> = (v) => {
  const s = nonempty(v);
  try {
    const u = new URL(s);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
      invalid();
  } catch {
    invalid();
  }
  return s;
};
export const nullable =
  <T>(decode: Decoder<T>): Decoder<T | null> =>
  (v) =>
    v === null ? null : decode(v);
export const optional =
  <T>(decode: Decoder<T>): Decoder<T | undefined> =>
  (v) =>
    v === undefined || v === null ? undefined : decode(v);
export const array =
  <T>(decode: Decoder<T>): Decoder<T[]> =>
  (v) => {
    if (!Array.isArray(v)) invalid();
    const out = (v as unknown[]).map(decode);
    return markPartial(out, out.some(isPartialCatalog));
  };
export const nonemptyArray =
  <T>(decode: Decoder<T>): Decoder<T[]> =>
  (v) => {
    const rows = array(decode)(v);
    if (!rows.length) invalid();
    return rows;
  };
export const dict =
  <T>(
    decode: Decoder<T>,
    key: Decoder<string> = nonempty,
  ): Decoder<Record<string, T>> =>
  (v) =>
    markFromChildren(
      Object.fromEntries(
        Object.entries(object(v)).map(([k, item]) => [key(k), decode(item)]),
      ),
    );
/** Only catalog records may be skipped. Containers and structural fields
 * still use the strict decoders above; coordinates, tuples and evidence
 * inside a record must be whole before that record can be shown. */
let e2eDiagnostics = false;
export function setCatalogDiagnostics(e2e: boolean) {
  e2eDiagnostics = e2e;
}
export function catalogWarning(message: string) {
  if ((typeof __DEV__ !== 'undefined' && __DEV__) || e2eDiagnostics)
    console.warn(message);
}
export function logDroppedRow(label: string, row: string | number) {
  catalogWarning(`Dropped malformed catalog row: ${label} [${row}]`);
}
// Metadata stays outside the published data and is retained by decode memoization.
const partialCatalogs = new WeakSet<object>();
type LossPolicy = 'bounded' | 'counted';
const losses = new WeakMap<
  object,
  { total: number; dropped: number; policy: LossPolicy }
>();
export function isPartialCatalog(value: unknown): boolean {
  return (
    value !== null && typeof value === 'object' && partialCatalogs.has(value)
  );
}
export function markPartial<T>(value: T, partial: boolean): T {
  if (partial && value !== null && typeof value === 'object')
    partialCatalogs.add(value);
  return value;
}
function markFromChildren<T extends object>(value: T): T {
  return markPartial(value, Object.values(value).some(isPartialCatalog));
}
/** At most 1% loss, with a one-row allowance for small catalogs. A nonempty
 * export may never become empty. Lists used for totals, latest facts or
 * attribution use array/dict instead, with no allowance. Discovery counts
 * and announces omitted signals, so its policy has no percentage cap. */
function withLoss<T extends object>(
  out: T,
  total: number,
  dropped: number,
  policy: LossPolicy = 'bounded',
): T {
  if (
    dropped &&
    (dropped === total ||
      (policy === 'bounded' && dropped > Math.max(1, Math.floor(total / 100))))
  )
    invalid('Too many catalog rows could not be read.');
  losses.set(out, { total, dropped, policy });
  return markPartial(
    out,
    dropped > 0 || Object.values(out).some(isPartialCatalog),
  );
}
/** Logical rejection (identity and duplicates) uses the same budget
 * as schema rejection, including rows already lost from this collection. */
export function filterRows<T>(
  input: T[],
  keep: (row: T) => boolean,
  label: string,
): T[] {
  const previous = losses.get(input) ?? {
    total: input.length,
    dropped: 0,
    policy: 'bounded' as const,
  };
  let dropped = previous.dropped;
  const out = input.filter((row, index) => {
    if (keep(row)) return true;
    dropped++;
    logDroppedRow(label, index);
    return false;
  });
  return withLoss(out, previous.total, dropped, previous.policy);
}
export function filterRecords<T>(
  input: Record<string, T>,
  keep: (key: string, row: T) => boolean,
  label: string,
): Record<string, T> {
  const previous = losses.get(input) ?? {
    total: Object.keys(input).length,
    dropped: 0,
    policy: 'bounded' as const,
  };
  let dropped = previous.dropped;
  const out = Object.fromEntries(
    Object.entries(input).filter(([key, row], index) => {
      if (keep(key, row)) return true;
      dropped++;
      logDroppedRow(label, index);
      return false;
    }),
  );
  return withLoss(out, previous.total, dropped, previous.policy);
}
export const rows =
  <T>(
    decode: Decoder<T>,
    label = 'rows',
    policy: LossPolicy = 'bounded',
  ): Decoder<T[]> =>
  (v) => {
    if (!Array.isArray(v)) invalid();
    const out: T[] = [];
    v.forEach((row, index) => {
      try {
        out.push(decode(row));
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'invalid-data')
          throw error;
        logDroppedRow(label, index);
      }
    });
    return withLoss(out, v.length, v.length - out.length, policy);
  };
export const uniqueRows =
  <T>(
    decode: Decoder<T>,
    key: (row: T) => string,
    label: string,
  ): Decoder<T[]> =>
  (v) => {
    const decoded = rows(decode, label)(v);
    const counts = new Map<string, number>();
    for (const row of decoded)
      counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return filterRows(
      decoded,
      (row) => counts.get(key(row)) === 1,
      `${label}.duplicate`,
    );
  };
export const records =
  <T>(
    decode: Decoder<T>,
    key: Decoder<string> = nonempty,
    label = 'records',
  ): Decoder<Record<string, T>> =>
  (v) => {
    const entries = Object.entries(object(v));
    const out: [string, T][] = [];
    entries.forEach(([k, row], index) => {
      try {
        out.push([key(k), decode(row)]);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'invalid-data')
          throw error;
        logDroppedRow(label, index);
      }
    });
    return withLoss(
      Object.fromEntries(out),
      entries.length,
      entries.length - out.length,
    );
  };
export type Decoded<D> = D extends Decoder<infer T> ? T : never;
type Shape<S extends Record<string, Decoder<unknown>>> = {
  [K in keyof S as undefined extends Decoded<S[K]> ? never : K]: Decoded<S[K]>;
} & {
  [K in keyof S as undefined extends Decoded<S[K]> ? K : never]?: Decoded<S[K]>;
};
export function shape<S extends Record<string, Decoder<unknown>>>(
  schema: S,
): Decoder<Shape<S>> {
  return (v) => {
    const input = object(v);
    return markFromChildren(
      Object.fromEntries(
        Object.entries(schema).map(([key, decode]) => {
          try {
            return [key, decode(input[key])];
          } catch (error) {
            if (!(error instanceof ApiError) || error.code !== 'invalid-data')
              throw error;
            invalid(
              `${key}: ${error instanceof Error ? error.message : 'Invalid field'}`,
            );
          }
        }),
      ),
    ) as Shape<S>;
  };
}
/** A `shape` that also refuses any key its schema does not name. */
export function exact<S extends Record<string, Decoder<unknown>>>(
  schema: S,
): Decoder<Shape<S>> {
  const decode = shape(schema);
  return (v) => {
    const extra = Object.keys(object(v)).find(
      (key) => !Object.hasOwn(schema, key),
    );
    if (extra !== undefined) invalid(`${extra}: Not in the contract`);
    return decode(v);
  };
}
export const matching =
  (pattern: RegExp): Decoder<string> =>
  (v) =>
    pattern.test(nonempty(v)) ? text(v) : invalid();
