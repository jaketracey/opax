import { catalogs, people, roster } from './pinned';
import { nameKey, nameValues } from '../src/api/ids';
import {
  portraitFor,
  fullPortraitName,
  commonsLicenceShown,
} from '../src/api/selectors';
import { payNameKey } from '../src/api/transforms';

// Freeze the fold preceding 2f1fbfeb, independently of the production helper.
// Compare joined IDs, not spellings: two keys for the same record are harmless.
const previousNameKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[’‘ʼ`]/g, "'");
const names = [
  ...new Set([
    ...roster.people.map((p) => p.name),
    ...people.people.flatMap((p) => [p.name, ...p.aliases]),
  ]),
];
const indexes = {
  votes: catalogs.votes!.names,
  interests: catalogs.interestIndex!._by_name,
  pay: catalogs.pay!.names,
  expenses: catalogs.expenses!.names,
  photos: catalogs.photoPeople!,
};
function indexed(
  index: Record<string, string | string[]>,
  fold: (name: string) => string,
) {
  const result = new Map<string, Set<string>>();
  for (const [name, values] of Object.entries(index)) {
    const key = fold(name),
      ids = result.get(key) ?? new Set<string>();
    for (const value of [values].flat()) ids.add(value);
    result.set(key, ids);
  }
  return result;
}
test.each(Object.entries(indexes))(
  'nameKey changes no joins on the pinned %s index',
  (kind, index) => {
    const before = indexed(index, previousNameKey),
      queries = [...names, ...Object.keys(index)];
    const joined = (map: Map<string, Set<string>>, keys: string[]) =>
      [...new Set(keys.flatMap((key) => [...(map.get(key) ?? [])]))].sort();
    let matches = 0;
    for (const name of queries) {
      const oldQueries =
        kind === 'pay'
          ? [payNameKey(name), payNameKey(previousNameKey(name))]
          : [name];
      const newQueries =
        kind === 'pay' ? [payNameKey(name), payNameKey(nameKey(name))] : [name];
      const expected = joined(before, oldQueries.map(previousNameKey));
      const actual = [
        ...new Set(nameValues<string | string[]>(index, newQueries).flat()),
      ].sort();
      if (expected.length) matches++;
      expect({ name, ids: actual }).toEqual({ name, ids: expected });
    }
    // Protect against an empty fixture or an accidentally skipped population.
    expect(names.length).toBeGreaterThan(1500);
    expect(matches).toBeGreaterThan(100);
  },
);

test('pinned full-name portraits retain exact-key-first joins; abbreviated names are refused', () => {
  const index = catalogs.photoPeople!,
    credits = catalogs.photoCredits!;
  const before = indexed(index, previousNameKey);
  for (const name of [...names, ...Object.keys(index)]) {
    if (!fullPortraitName(name)) {
      expect(portraitFor([name], index, credits)).toBeNull();
      continue;
    }
    const exact = index[name.trim().toLowerCase()];
    const expected = [
      ...(exact ? [exact] : (before.get(previousNameKey(name)) ?? [])),
    ];
    if (expected.length > 1)
      expect(() => portraitFor([name], index, credits)).toThrow();
    else {
      const key = expected[0];
      expect({
        name,
        key: portraitFor([name], index, credits)?.key ?? null,
      }).toEqual({
        name,
        key:
          key &&
          (/^\d+$/.test(key) ||
            (credits[key] && commonsLicenceShown(credits[key].licence)))
            ? key
            : null,
      });
    }
  }
});
