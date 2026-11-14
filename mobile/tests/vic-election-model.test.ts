import overview from '../scripts/fixtures/vic-election/overview.json';
import { decodeOverview } from '../src/features/vic-election/decoders';
import {
  contestName,
  dayCount,
  decimal,
  keyDateWords,
  percentage,
  phase,
  rowFigure,
  searchWindow,
  shareText,
  todayStatus,
  todayWindow,
} from '../src/features/vic-election/model';
const o = decodeOverview(overview);
const at = (value: string) => new Date(value + '+11:00');
for (const zone of ['Australia/Perth', 'UTC'])
  test(`date boundaries independent of ${zone}`, () => {
    const old = process.env.TZ;
    process.env.TZ = zone;
    try {
      expect(phase(o, at('2026-11-27T23:59:00'))).toBe('ahead');
      expect(phase(o, at('2026-11-28T00:00:00'))).toBe('ahead');
      expect(phase(o, at('2026-11-28T08:00:00'))).toBe('today');
      expect(phase(o, at('2026-11-28T17:59:00'))).toBe('today');
      expect(phase(o, at('2026-11-28T18:00:00'))).toBe('closed');
      expect(
        [12, 27, 28].map((d) => dayCount(o, at(`2026-11-${d}T10:00:00`))),
      ).toEqual([16, 1, 0]);
    } finally {
      process.env.TZ = old;
    }
  });
test('wording changes at each API instant and never earlier', () => {
  for (const row of o.key_dates) {
    if (!row.passes_at) continue;
    const time = Date.parse(row.passes_at);
    expect(keyDateWords(row, new Date(time - 1))).toEqual({
      label: row.label,
      when: row.when,
    });
    expect(keyDateWords(row, new Date(time))).toEqual({
      label: row.passed_label ?? row.label,
      when: row.passed_when ?? row.when,
    });
  }
});
test('uses the portal rounding and contest names', () => {
  expect(percentage(61.15)).toBe('61.1%');
  expect(decimal(11.15)).toBe('11.2');
  expect([99.96, 67.2, 0.4].map(shareText)).toEqual(['All', '67%', 'Under 1%']);
  expect(contestName({ date: '2022-11-26', kind: 'general' })).toBe(
    '2022 election',
  );
  expect(contestName({ date: '2025-02-08', kind: 'by-election' })).toBe(
    '2025 by-election',
  );
  expect(contestName({ date: '2022-12-17', kind: 'supplementary' })).toBe(
    '2022 supplementary election',
  );
  expect(rowFigure(o.districts[0]!)).toBe('Labor by 11.2');
});
test('windows include their last Melbourne day', () => {
  expect(todayWindow(at('2026-12-05T23:59:59'))).toBe(true);
  expect(todayWindow(at('2026-12-06T00:00:00'))).toBe(false);
  expect(searchWindow(at('2026-12-28T23:59:59'))).toBe(true);
  expect(searchWindow(at('2026-12-29T00:00:00'))).toBe(false);
});
test('Today copy shares the election state and explicit AEDT polling hours', () => {
  expect(todayStatus(o, at('2026-11-20T10:00:00'))).toEqual([
    'Early voting',
    'Early voting runs 18–27 November, 9 am to 6 pm, except Sunday 22 November. Check locations and hours with the VEC.',
  ]);
  expect(todayStatus(o, at('2026-11-28T10:00:00'))).toEqual([
    'Election day is today',
    'Election day is today. Voting is open until 6 pm AEDT.',
  ]);
  expect(todayStatus(o, at('2026-11-28T19:00:00'))).toEqual([
    'Voting has closed',
    'Voting closed at 6 pm AEDT on Saturday 28 November. The count is under way. Check the VEC for count updates.',
  ]);
});
