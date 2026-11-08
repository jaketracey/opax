import {
  seatStarter,
  starterList,
  starterRule,
  startersFor,
  sydneyDayIndex,
} from '../src/features/ask/starters';
import { partyGroup } from '../src/design/party-groups';

const at = (iso: string) => new Date(iso);

test('the rotation is fixed by the Sydney day: four consecutive, then the next four', () => {
  const first = startersFor(at('2026-01-01T03:00:00Z'), 4);
  expect(first).toEqual(starterList.slice(0, 4));
  expect(startersFor(at('2026-01-01T12:00:00Z'), 4)).toEqual(first);
  expect(startersFor(at('2026-01-02T03:00:00Z'), 4)).toEqual(
    starterList.slice(4, 8),
  );
  // Same input, same output: one rule for every reader.
  expect(startersFor(at('2026-11-09T01:00:00Z'), 4)).toEqual(
    startersFor(at('2026-11-09T01:00:00Z'), 4),
  );
});

test('13:30 UTC is already the next day in Sydney', () => {
  expect(sydneyDayIndex(at('2026-11-08T12:59:00Z'))).toBe(
    sydneyDayIndex(at('2026-11-08T03:00:00Z')),
  );
  expect(sydneyDayIndex(at('2026-11-08T13:30:00Z'))).toBe(
    sydneyDayIndex(at('2026-11-08T03:00:00Z')) + 1,
  );
});

test('the list wraps and every caller gets its own count', () => {
  const day = at('2026-01-04T03:00:00Z'); // day 3: 12, 13, 0, 1
  expect(startersFor(day, 4)).toEqual([
    starterList[12],
    starterList[13],
    starterList[0],
    starterList[1],
  ]);
  expect(startersFor(day, 2)).toHaveLength(2);
  expect(startersFor(day, 3)).toHaveLength(3);
  expect(startersFor(day, 0)).toEqual([]);
});

test('no starter hard-codes a year, and the list has at least 14', () => {
  expect(starterList.length).toBeGreaterThanOrEqual(14);
  for (const q of starterList) expect(q).not.toMatch(/\d{4}/);
  expect(starterRule).toBe(
    'Four questions a day, in order, from a reviewed list.',
  );
});

const partyNames = [
  'Labor',
  'Liberal',
  'National',
  'Nationals',
  'Liberal National',
  'Country Liberal',
  'Greens',
  'One Nation',
  'Independent',
];
test('every party is named, or none is, in each seven-day window', () => {
  for (let day = 0; day < starterList.length * 2; day++) {
    const named = new Set<string>();
    for (let offset = 0; offset < 7; offset++)
      for (const q of startersFor(
        Date.UTC(2026, 0, 1, 3) + (day + offset) * 86_400_000,
        4,
      ))
        for (const name of partyNames)
          if (new RegExp(`\\b${name}\\b`).test(q)) named.add(partyGroup(name));
    expect(named.size === 0 || named.size === 3).toBe(true);
  }
});

test('the seat starter names the reader’s own member', () => {
  expect(seatStarter('Sam Placeholder')).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
});
