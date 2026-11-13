// Backlog 14b: the interests export will write null (or leave the field out)
// where a register has no holder column, instead of "unspecified". The four
// holder fields the app decodes must keep those rows, rows must show nothing
// for them (no label, never "Not stated"), and search snippets must skip them.
// The PR #313 audit (docs/operations/interests-holder-compatibility-
// 2026-11-13.md on main) lists these fields and readers.
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import live from './fixtures/interests/live-2026-10-08.json';
import { catalogs, pinned } from './pinned';
import { catalogSearchRows } from '../src/api/catalog-search';
import {
  decodeInterest,
  decodeInterestTies,
  decodeRecentInterests,
  type InterestDetail,
} from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { isPartialCatalog } from '../src/api/validation';
import { DeclaredInterests } from '../src/features/people/DeclaredInterests';
import { interestDetail } from '../src/features/search/present';
import { latelyFor } from '../src/features/your-mp/latest';
import {
  registerEntry,
  registerHolderLine,
} from '../src/features/your-mp/model';

// Hoisted above the imports by babel-jest (as in latest.test.ts).
jest.mock('../src/api/runtime', () => ({ catalogs: {}, portraits: null }));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn() },
}));

const MISSING = Symbol('missing');
type Holder = string | null | number | typeof MISSING;
type Path = (string | number)[];

/** A deep copy with one row's holder set, or removed for MISSING. */
function withHolder(input: unknown, row: Path, value: Holder): unknown {
  const copy = structuredClone(input);
  const target = row.reduce<Record<string | number, unknown>>(
    (v, key) => v[key] as Record<string | number, unknown>,
    copy as Record<string | number, unknown>,
  );
  if (value === MISSING) delete target.holder;
  else target.holder = value;
  return copy;
}
const at = (v: unknown, path: Path) =>
  path.reduce<unknown>(
    (node, key) => (node as Record<string | number, unknown>)[key],
    v,
  );

// The four holder fields, each on a hash-pinned real export file.
const fields: {
  name: string;
  path: string;
  row: Path;
  decode: (v: unknown) => unknown;
  /** The decoded row that carries the holder. */
  decoded: Path;
}[] = [
  {
    name: 'register row (Senate)',
    path: '/interests/10678.json',
    row: ['buckets', 'real_estate', 'items', 0],
    decode: decodeInterest,
    decoded: ['buckets', 'real_estate', 'items', 0],
  },
  {
    name: 'detail tie register',
    path: '/interests/11042.json',
    row: ['ties', 0, 'register'],
    decode: decodeInterest,
    decoded: ['ties', 0, 'register'],
  },
  {
    name: 'recent declaration',
    path: '/interests/recent.json',
    row: ['items', 0],
    decode: decodeRecentInterests,
    decoded: ['items', 0],
  },
  {
    name: 'donor tie',
    path: '/interests/ties-by-donor.json',
    row: ['donors', 'ASX Limited', 0],
    decode: decodeInterestTies,
    decoded: ['donors', 'ASX Limited', 0],
  },
];

describe.each(fields)('$name holder', ({ path, row, decode, decoded }) => {
  const source = pinned(path);
  test.each([
    ['null', null, null],
    ['missing', MISSING, null],
    ['blank', '  ', null],
    ['a value', 'spouse', 'spouse'],
  ] as const)('%s decodes and keeps the row', (_label, value, expected) => {
    const original = decode(source);
    const out = decode(withHolder(source, row, value));
    expect(isPartialCatalog(out)).toBe(false);
    expect((at(out, decoded) as { holder: unknown }).holder).toBe(expected);
    // Nothing else moved: same rows, same other fields.
    expect(withHolder(out, decoded, 'x')).toEqual(
      withHolder(original, decoded, 'x'),
    );
  });
  test('a holder of another type still fails', () => {
    const input = withHolder(source, row, 42);
    if (path === '/interests/recent.json') {
      // Recent rows quarantine one malformed entry, never print it.
      const id = (at(source, row) as { id: number }).id;
      const out = decodeRecentInterests(input);
      expect(out.items.some((item) => item.id === id)).toBe(false);
    } else if (path === '/interests/ties-by-donor.json') {
      // The donor map quarantines that donor's whole list.
      const out = decodeInterestTies(input);
      expect(out.donors['ASX Limited']).toBeUndefined();
      expect(isPartialCatalog(out)).toBe(true);
    } else expect(() => decode(input)).toThrow(ApiError);
  });
});

// The live Senate register (McKenzie) as the export will write it after
// backlog 14: every "unspecified" holder null, or the field left out.
const people = live.people as Record<string, unknown>;
const senate = people['10758'] as {
  buckets: Record<string, { items: Record<string, unknown>[] }>;
};
function exportedAs(value: null | typeof MISSING) {
  const copy = structuredClone(senate);
  for (const bucket of Object.values(copy.buckets))
    for (const item of bucket.items) {
      expect(item.holder).toBe('unspecified');
      if (value === MISSING) delete item.holder;
      else item.holder = value;
    }
  return copy;
}
function strings(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number')
    return [String(node)];
  if (Array.isArray(node)) return node.flatMap(strings);
  return [];
}
async function shownLines(register: InterestDetail) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DeclaredInterests register={register} />);
  });
  for (const name of Object.keys(register.buckets))
    await act(async () => {
      r.root
        .find(
          (n) =>
            n.props.testID === `interest-bucket-${name}` &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress();
    });
  const lines = r.root
    .findAllByType(NativeText)
    .map((n) => strings(n.props.children).join('').replace(/\s+/g, ' '))
    .filter(Boolean);
  act(() => r.unmount());
  return lines;
}
const noPlaceholder = /\b(?:null|undefined|unspecified|NaN)\b|Not stated/i;

describe.each([
  ['null', null],
  ['missing', MISSING],
] as const)('a register whose holders are %s', (_label, value) => {
  // Decoded inside each test, so a decoder that refuses fails the test.
  let legacy!: InterestDetail;
  let register!: InterestDetail;
  beforeEach(() => {
    legacy = decodeInterest(senate);
    register = decodeInterest(exportedAs(value));
  });
  const rows = (r: InterestDetail) =>
    Object.values(r.buckets).flatMap((b) => b.items);

  test('decodes whole', () => {
    expect(isPartialCatalog(register)).toBe(false);
    expect(rows(register)).toHaveLength(rows(legacy).length);
    expect(rows(register).every((row) => row.holder === null)).toBe(true);
  });
  test('rows show nothing for the holder, as for the placeholder', async () => {
    rows(register).forEach((row, i) =>
      expect(registerEntry(row, register.statement_date)).toEqual(
        registerEntry(rows(legacy)[i]!, legacy.statement_date),
      ),
    );
    const shown = await shownLines(register);
    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) expect(line).not.toMatch(noPlaceholder);
    expect(shown).toEqual(await shownLines(legacy));
  });
  test('search snippets skip the holder', () => {
    const search = (r: InterestDetail) =>
      catalogSearchRows('interest', {
        pay: catalogs.pay,
        expenses: catalogs.expenses,
        interests: [r],
        recent: {
          ...decodeRecentInterests(pinned('/interests/recent.json')),
          items: [],
        },
      });
    const out = search(register);
    const before = search(legacy);
    expect(out).toHaveLength(rows(register).length);
    out.forEach((row, i) => {
      const item = rows(register)[i]!;
      expect(row.snippet).toBe(`${item.description}. . ${item.kind}.`);
      expect(row.snippet).not.toMatch(/\bnull\b/);
      const detail = interestDetail(row);
      expect(detail).not.toMatch(noPlaceholder);
      expect(detail).toBe(interestDetail(before[i]!));
    });
  });
});

test('a held entry still names its holder', () => {
  const row = {
    description: 'Two tickets to the Lakeside theatre festival',
    kind: 'addition',
    date: '2026-09-28',
  };
  expect(registerEntry({ ...row, holder: 'spouse' }).meta).toBe(
    'Spouse or partner · Added 28 Sep 2026',
  );
  expect(registerEntry({ ...row, holder: null }).meta).toBe(
    'Added 28 Sep 2026',
  );
  expect(registerEntry({ ...row, holder: 'constructor' }).meta).toBe(
    'Added 28 Sep 2026',
  );
});

describe('Lately with null holders', () => {
  const gift = {
    description: 'Two tickets to the Lakeside theatre festival',
    kind: 'addition',
    date: '2026-09-28',
  };
  const ready = <T,>(data: T) => ({
    status: 'ready' as const,
    data,
    asAt: '2026-09-04',
    sources: [],
    stale: false,
    savedAt: null,
  });
  const recordsFor = (holders: (string | null)[]) => {
    const state = latelyFor(
      {
        personId: 'person_aaaaaaaaaaaaaaaaaaaaaaaa',
        slug: 'evelyn-harbour',
        blocks: {
          identity: ready({ name: 'Evelyn Harbour' }),
          votes: ready({ for: [], against: [] }),
          interests: ready({
            buckets: {
              gifts: { items: holders.map((holder) => ({ ...gift, holder })) },
            },
          }),
        },
      } as never,
      null,
    );
    if (state.status !== 'ready') throw new Error(state.status);
    return state.records;
  };

  test('one entry with no holder has no holder line', () => {
    const [record] = recordsFor([null]);
    expect(record!.action).toBe('Declared a gift');
    expect(record!.holderLine).toBeUndefined();
  });
  test('a null and a named copy merge into one row with a generic line', () => {
    const records = recordsFor([null, 'self']);
    expect(records).toHaveLength(1);
    expect(records[0]!.holderLine).toBe(
      'Recorded in more than one register entry',
    );
    expect(registerHolderLine([null, 'self'])).toBe(
      'Recorded in more than one register entry',
    );
    expect(registerHolderLine([null, null])).toBeUndefined();
  });
  test('the row keeps its seen key when the export switches to null', () => {
    const [legacy] = recordsFor(['unspecified']);
    const [record] = recordsFor([null]);
    expect(record!.key).toBe(legacy!.key);
    expect(record!.key).not.toMatch(/\bnull\b/);
  });
});
