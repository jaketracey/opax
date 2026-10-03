import { bills, index, roster } from './pinned';
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
