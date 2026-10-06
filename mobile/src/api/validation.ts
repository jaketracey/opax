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
    return (v as unknown[]).map(decode);
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
    Object.fromEntries(
      Object.entries(object(v)).map(([k, item]) => [key(k), decode(item)]),
    );
/** Only catalog records may be skipped. Containers and structural fields
 * still use the strict decoders above; coordinates, tuples and evidence
 * inside a record must be whole before that record can be shown. */
let e2eDiagnostics = false;
export function setCatalogDiagnostics(e2e: boolean) {
  e2eDiagnostics = e2e;
}
export function logDroppedRow(label: string, row: string | number) {
  if ((typeof __DEV__ !== 'undefined' && __DEV__) || e2eDiagnostics)
    console.warn(`Dropped malformed catalog row: ${label} [${row}]`);
}
export const rows =
  <T>(decode: Decoder<T>, label = 'rows'): Decoder<T[]> =>
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
    return out;
  };
export const records =
  <T>(
    decode: Decoder<T>,
    key: Decoder<string> = nonempty,
    label = 'records',
  ): Decoder<Record<string, T>> =>
  (v) => {
    const out: [string, T][] = [];
    Object.entries(object(v)).forEach(([k, row], index) => {
      try {
        out.push([key(k), decode(row)]);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'invalid-data')
          throw error;
        logDroppedRow(label, index);
      }
    });
    return Object.fromEntries(out);
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
    return Object.fromEntries(
      Object.entries(schema).map(([key, decode]) => {
        try {
          return [key, decode(input[key])];
        } catch (error) {
          invalid(
            `${key}: ${error instanceof Error ? error.message : 'Invalid field'}`,
          );
        }
      }),
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
