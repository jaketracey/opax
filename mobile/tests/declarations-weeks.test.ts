// people.md 2.7: Just declared by week, Sydney dates, the year said only
// when it is not this year.
import {
  changesCount,
  sydneyDate,
  weekGroups,
  weekRuns,
} from '../src/features/declarations/model';

const row = (id: number, date: string, name = `Member ${id}`) => ({
  id,
  name,
  date,
  person_id: String(id),
});

test('weeks run Monday to Sunday: this week, last week, then "Week of"', () => {
  // Monday 9 November 2026.
  const rows = [
    row(1, '2026-11-09'),
    row(2, '2026-11-08'),
    row(3, '2026-11-02'),
    row(4, '2026-08-17'),
    row(5, '2026-08-23'),
  ];
  expect(
    weekGroups(rows, '2026-11-09').map((g) => [g.title, g.indices]),
  ).toEqual([
    ['This week', [0]],
    ['Last week', [1, 2]],
    ['Week of 17 August', [3, 4]],
  ]);
});

test('a fixture spanning New Year says the other year', () => {
  const rows = [
    row(1, '2026-01-02'),
    row(2, '2025-12-29'),
    row(3, '2025-12-22'),
  ];
  expect(weekGroups(rows, '2026-03-04').map((g) => g.title)).toEqual([
    'Week of 29 December 2025',
    'Week of 22 December 2025',
  ]);
  expect(weekGroups(rows, '2026-01-02').map((g) => g.title)).toEqual([
    'This week',
    'Last week',
  ]);
});

test('today is the Sydney date, not the device’s UTC one', () => {
  // 14:30 UTC on Sunday 8 November is 01:30 Monday 9 November in Sydney.
  expect(sydneyDate(new Date(Date.UTC(2026, 10, 8, 14, 30)))).toBe(
    '2026-11-09',
  );
});

test('one member’s run stays whole within a week, with its place in the list', () => {
  const rows = [
    row(1, '2026-11-09', 'Jo Briskey'),
    row(2, '2026-11-09', 'Jo Briskey'),
    row(3, '2026-11-06', 'Jo Briskey'),
    row(4, '2026-11-05', 'Andrew Wilkie'),
  ].map((r) => ({ ...r, person_id: r.name }));
  const weeks = weekRuns(rows, '2026-11-09');
  expect(
    weeks.map((w) => [
      w.title,
      w.data.map((run) => run.entries.map((e) => e.index)),
    ]),
  ).toEqual([
    ['This week', [[0, 1]]],
    ['Last week', [[2], [3]]],
  ]);
  expect(weekGroups([row(1, '')], '2026-11-09')[0]!.title).toBe(
    'Date not published',
  );
  expect(changesCount(1)).toBe('1 change');
  expect(changesCount(1660)).toBe('1,660 changes');
});
