import { ApiError } from '../src/api/errors';
import {
  count,
  date,
  isPartialCatalog,
  markPartial,
  nonempty,
  optional,
  passedStrings,
  shape,
  url,
} from '../src/api/validation';

const rejects = (decode: (v: unknown) => unknown, value: unknown) =>
  expect(() => decode(value)).toThrow(ApiError);

test('remembered dates still refuse every invalid string', () => {
  for (let i = 0; i < 3; i++) expect(date('2026-02-28')).toBe('2026-02-28');
  rejects(date, '2026-02-30');
  rejects(date, '2026-13-01');
  rejects(date, '28/02/2026');
  rejects(date, ' ');
  rejects(date, 20260228);
  // A remembered string is returned as given, time included.
  expect(date('2026-02-28T10:00:00Z')).toBe('2026-02-28T10:00:00Z');
  expect(date('2026-02-28T10:00:00Z')).toBe('2026-02-28T10:00:00Z');
});

test('remembered links still refuse credentials and other schemes', () => {
  const link = 'https://www.aph.gov.au/Senators_and_Members';
  expect(url(link)).toBe(link);
  expect(url(link)).toBe(link);
  rejects(url, 'https://user:secret@www.aph.gov.au/');
  rejects(url, 'ftp://www.aph.gov.au/');
  rejects(url, 'javascript:alert(1)');
  rejects(url, 'not a link');
  rejects(url, '');
});

test('the remembered set is bounded and starts again when full', () => {
  const passed = passedStrings(2);
  passed.add('a');
  passed.add('b');
  expect(passed.has('a') && passed.has('b')).toBe(true);
  passed.add('c');
  expect(passed.has('a')).toBe(false);
  expect(passed.has('b')).toBe(false);
  expect(passed.has('c')).toBe(true);
});

test('count and nonempty keep their contracts', () => {
  expect(count(0)).toBe(0);
  expect(count(42)).toBe(42);
  for (const value of [-1, 1.5, NaN, Infinity, '1', null, 2 ** 53])
    rejects(count, value);
  expect(nonempty('x')).toBe('x');
  for (const value of ['', '   ', 1, null, undefined]) rejects(nonempty, value);
});

test('shape keeps schema order, absent optional keys and partial rows', () => {
  const partialChild = (v: unknown) => markPartial({ v }, true);
  const decode = shape({
    b: nonempty,
    a: optional(count),
    child: partialChild,
  });
  const out = decode({ a: null, b: 'x', child: 1, extra: true });
  expect(Object.keys(out)).toEqual(['b', 'a', 'child']);
  expect(Object.hasOwn(out, 'a')).toBe(true);
  expect(out.a).toBeUndefined();
  expect('extra' in out).toBe(false);
  expect(isPartialCatalog(out)).toBe(true);
  expect(isPartialCatalog(shape({ b: nonempty })({ b: 'x' }))).toBe(false);
});

test('shape names the failing field and rethrows other errors', () => {
  const decode = shape({ name: nonempty, total: count });
  expect(() => decode({ name: 'x', total: -1 })).toThrow(/^total: /);
  rejects(decode, null);
  rejects(decode, []);
  const boom = new TypeError('boom');
  const failing = shape({
    x: () => {
      throw boom;
    },
  });
  expect(() => failing({})).toThrow(boom);
});

test('a schema cannot name __proto__', () => {
  const schema = JSON.parse('{"__proto__": 1}') as Record<string, never>;
  expect(() => shape(schema)).toThrow('__proto__');
});
