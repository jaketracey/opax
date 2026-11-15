// Build 80: one bad sub-record never hides a whole bill. On 15 Nov 2026,
// 75 divisions in 64 bill files carried `"question": null` and each whole
// bill read "can't be loaded" in every shipped version. A bill's own lists
// now decode item by item; the bill is refused only for its own fields.
import { decodeBill } from '../src/api/catalog-decoders';
import { ApiError } from '../src/api/errors';
import {
  isPartialCatalog,
  nonempty,
  observeLeniency,
  rows,
  shape,
  type Leniency,
} from '../src/api/validation';
import { divisionQuestion } from '../src/features/bills/divisions';
import { pinned } from './pinned';

type Raw = Record<string, unknown> & {
  divisions: Record<string, unknown>[];
  speeches: Record<string, unknown>[];
  key_dates: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  acts: Record<string, unknown>[];
};
const raw = () =>
  structuredClone(pinned('/bills/au-federal-r7534.json')) as Raw;

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

test('the pinned bill has lists to lose, and decodes whole', () => {
  const data = raw();
  expect(data.divisions.length).toBeGreaterThan(1);
  expect(data.speeches.length).toBeGreaterThan(0);
  const bill = decodeBill(data);
  expect(bill.divisions).toHaveLength(data.divisions.length);
  expect(isPartialCatalog(bill)).toBe(false);
});

describe('a division’s question', () => {
  test.each([
    ['null', null],
    ['absent', undefined],
  ])('%s reads as no question, and the bill decodes whole', (_name, value) => {
    const data = raw();
    if (value === undefined) delete data.divisions[0]!.question;
    else data.divisions[0]!.question = value;
    const bill = decodeBill(data);
    expect(bill.divisions).toHaveLength(data.divisions.length);
    expect(bill.divisions[0]!.question).toBe('');
    expect(bill.divisions[0]!.key).toBe(data.divisions[0]!.key);
    // Nothing was lost, so the page carries no "some records" note.
    expect(isPartialCatalog(bill)).toBe(false);
    // Readers already treat '' as no question.
    expect(divisionQuestion(bill.divisions[0]!.question, null, bill)).toBe('');
  });

  test('a question of another type is still malformed: that division alone is dropped', () => {
    const data = raw();
    data.divisions[0]!.question = 12;
    const bill = decodeBill(data);
    expect(bill.divisions.map((d) => d.key)).toEqual(
      data.divisions.slice(1).map((d) => d.key),
    );
  });
});

describe('a malformed sub-record', () => {
  test('one bad division is dropped, the others and the rest of the bill stay, and the bill says it is partial', () => {
    const data = raw();
    data.divisions[1]!.ayes = 'many';
    const bill = decodeBill(data);
    expect(bill.divisions.map((d) => d.key)).toEqual(
      data.divisions.filter((_, i) => i !== 1).map((d) => d.key),
    );
    expect(bill.speeches).toHaveLength(data.speeches.length);
    expect(bill.key).toBe(data.key);
    expect(isPartialCatalog(bill)).toBe(true);
  });

  test.each(['divisions', 'speeches', 'key_dates', 'sources', 'acts'] as const)(
    'every item of %s malformed: the bill still opens, without them',
    (list) => {
      const data = raw();
      data[list] = [{ nothing: 'usable' }, null, 7] as never;
      const bill = decodeBill(data);
      expect(bill[list]).toEqual([]);
      expect(bill.title).toBe(data.title);
      expect(isPartialCatalog(bill)).toBe(true);
    },
  );

  test('a malformed related bill is dropped too', () => {
    const data = raw();
    const good = {
      kind: 'bill',
      key: 'au-federal-r1',
      relation: 'cognate',
      title: 'Invented Related Bill',
      note: '',
    };
    data.related = [good, { ...good, key: 'not a key' }];
    expect(decodeBill(data).related).toEqual([good]);
  });

  test('the drop is reported with its place and field, never the row’s data', () => {
    const data = raw();
    data.speeches[0]!.speaker = '';
    const seen: Leniency[] = [];
    const stop = observeLeniency((event) => seen.push(event));
    decodeBill(data);
    stop();
    expect(seen).toEqual([
      {
        kind: 'dropped',
        at: ['bill.speeches[0]'],
        reason: 'speaker: The catalog response could not be read.',
      },
    ]);
    // Unobserved, nothing is kept.
    decodeBill(data);
    expect(seen).toHaveLength(1);
  });
});

describe('the bill itself', () => {
  test.each([
    ['a bad key', { key: 'not a bill key' }],
    ['no key', { key: null }],
    ['no title', { title: '' }],
    ['no status', { status: null }],
    ['divisions that are not a list', { divisions: 'none' }],
    ['speeches that are not a list', { speeches: null }],
    ['a malformed summary', { summary: { version: 'one' } }],
  ])('%s still refuses the whole bill', (_name, over) => {
    expect(() => decodeBill({ ...raw(), ...over })).toThrow(ApiError);
  });
});

describe('the tolerant list', () => {
  const item = shape({ name: nonempty });
  test('loses any item, even every one, where a bounded list refuses', () => {
    const all = [{ name: '' }, { name: '' }];
    expect(rows(item, 'things', 'tolerant')(all)).toEqual([]);
    expect(() => rows(item, 'things')(all)).toThrow(ApiError);
    const some = [{ name: 'kept' }, { name: '' }, { name: '' }];
    const kept = rows(item, 'things', 'tolerant')(some);
    expect(kept).toEqual([{ name: 'kept' }]);
    expect(isPartialCatalog(kept)).toBe(true);
    expect(() => rows(item, 'things')(some)).toThrow(ApiError);
  });
  test('something that is not a list is still refused', () => {
    expect(() => rows(item, 'things', 'tolerant')({})).toThrow(ApiError);
  });
});
