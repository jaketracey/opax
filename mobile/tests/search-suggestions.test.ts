import { bills, index, roster, slugs } from './pinned';
import { nameKey } from '../src/api/ids';
import { suggestionsFor } from '../src/api/catalogs';
import { groupSuggestions, searchKinds } from '../src/features/search/model';

test('suggestion matching folds case and whitespace and preserves source names', () => {
  const expected = suggestionsFor('Albanese', roster, index, bills);
  expect(suggestionsFor('  ALBANESE  ', roster, index, bills)).toEqual(
    expected,
  );
  expect(expected.people.some((p) => p.name === 'Anthony Albanese')).toBe(true);
  expect(expected.electorates.some((s) => s.name === 'Grayndler')).toBe(true);
});
test.each(['', ' ', 'x'])(
  'under two characters does not suggest: %s',
  (query) => {
    expect(
      groupSuggestions(suggestionsFor(query, roster, index, bills)).every(
        (g) => g.rows.length === 0,
      ),
    ).toBe(true);
  },
);
test('grouping preserves catalog kind, source order and identity', () => {
  const suggestions = suggestionsFor('support', roster, index, bills);
  const groups = groupSuggestions(suggestions);
  expect(groups.map((g) => g.kind)).toEqual(['people', 'electorates', 'bills']);
  expect(groups[2]?.rows).toBe(suggestions.bills);
  expect(suggestions.bills.length).toBeGreaterThan(0);
  expect(
    suggestions.bills.every((b) => b.title.toLowerCase().includes('support')),
  ).toBe(true);
});
test('no-match query returns three empty groups and no fabricated record', () => {
  const groups = groupSuggestions(
    suggestionsFor('zzzznevermatchingcatalog', roster, index, bills),
  );
  expect(groups.map((g) => g.rows)).toEqual([[], [], []]);
});
test('the kind control exposes exactly the permitted catalog submissions', () => {
  expect(searchKinds.map((k) => k.value)).toEqual([
    'person',
    'interest',
    'pay',
    'expense',
  ]);
});

// All 13 twins in the pinned roster: case variants as well as apostrophes.
const twinNames = [
  'Hugh McDermott',
  "Brendan O'Connor",
  "Kelly O'Dwyer",
  "Ken O'Dowd",
  'Bert Van Manen',
  "Gavan O'Connor",
  'Scot MacDonald',
  'Jodi McKay',
  'M O’Brien',
  'D O’Brien',
  'D’Ambrosio',
  'Yvette D’Ath',
  "Deborah O'Neill",
];
test.each(twinNames)(
  'the two spellings of %s suggest one slug-holder row',
  (name) => {
    const key = nameKey(name);
    const twins = roster.people.filter((p) => nameKey(p.name) === key);
    expect(twins).toHaveLength(2);
    const holder = Object.values(slugs.slugs).find((n) => nameKey(n) === key);
    for (const twin of twins) {
      const rows = suggestionsFor(
        twin.name,
        roster,
        index,
        bills,
      ).people.filter((p) => nameKey(p.name) === key);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe(holder);
    }
  },
);
