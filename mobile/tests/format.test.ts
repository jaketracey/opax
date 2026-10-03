import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  asAtText,
  calendarDate,
  formatClock,
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatMoneyCompact,
  formatMoneyWords,
  formatPercent,
  formatYearRange,
  largestRemainder,
  moneyAccessibilityLabel,
  savedText,
  staleText,
  votesAsAtText,
} from '../src/design/format';

describe('counts and money (IOS-UX section 6)', () => {
  test('counts use thousands separators', () => {
    expect(formatCount(13867)).toBe('13,867');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(-2929)).toBe('-2,929');
    expect(formatCount(Number.NaN)).toBe('');
  });
  test('records and rates of pay are to the dollar', () => {
    expect(formatMoney(4537500)).toBe('$4,537,500');
    expect(formatMoney(622102)).toBe('$622,102');
    expect(formatMoney(1803)).toBe('$1,803');
    expect(formatMoney(1803.4)).toBe('$1,803');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(-500)).toBe('-$500');
  });
  test('compact money uses lowercase m and bn in one style', () => {
    expect(formatMoneyCompact(4_200_000)).toBe('$4.2m');
    expect(formatMoneyCompact(1_100_000_000)).toBe('$1.1bn');
    expect(formatMoneyCompact(10_000_000)).toBe('$10m');
    expect(formatMoneyCompact(76_984_493)).toBe('$77m');
    expect(formatMoneyCompact(211_600_000)).toBe('$211.6m');
    expect(formatMoneyCompact(2_300_000_000)).toBe('$2.3bn');
    expect(formatMoneyCompact(507_000)).toBe('$507k');
    expect(formatMoneyCompact(9_999)).toBe('$9,999');
    // Rounding never produces "1,000k" or "1000m".
    expect(formatMoneyCompact(999_950)).toBe('$1m');
    expect(formatMoneyCompact(999_960_000)).toBe('$1bn');
    expect(formatMoneyCompact(-4_200_000)).toBe('-$4.2m');
    for (const value of [12_345, 4_537_500, 9_102_500, 1e12])
      expect(formatMoneyCompact(value)).not.toMatch(/[MKB]/);
  });
  test('running text spells millions and billions', () => {
    expect(formatMoneyWords(4_700_000)).toBe('$4.7 million');
    expect(formatMoneyWords(1_200_000_000)).toBe('$1.2 billion');
    expect(formatMoneyWords(622_102)).toBe('$622,102');
  });
  test('VoiceOver reads money as words', () => {
    expect(moneyAccessibilityLabel(4537500)).toBe('4,537,500 dollars');
    expect(moneyAccessibilityLabel(4_200_000, true)).toBe(
      '4.2 million dollars',
    );
    expect(moneyAccessibilityLabel(1_100_000_000, true)).toBe(
      '1.1 billion dollars',
    );
    expect(moneyAccessibilityLabel(507_000, true)).toBe('507 thousand dollars');
    expect(moneyAccessibilityLabel(-500)).toBe('minus 500 dollars');
  });
});

describe('percentages', () => {
  test('shares of a whole have one decimal', () => {
    expect(formatPercent(78.4)).toBe('78.4%');
    expect(formatPercent((1251 / 2929) * 100)).toBe('42.7%');
    expect(formatPercent(43, 0)).toBe('43%');
  });
  test('a set shown together adds to 100 by largest remainder', () => {
    const shares = largestRemainder([1251, 1678]);
    expect(shares).toEqual([43, 57]);
    const three = largestRemainder([1, 1, 1]);
    expect(three.reduce((a, b) => a + b, 0)).toBe(100);
    expect(three).toEqual([34, 33, 33]);
    expect(largestRemainder([0, 0])).toEqual([0, 0]);
  });
});

describe('dates', () => {
  // Jest cannot change the process time zone, so zone behaviour runs in node.
  function inZone(tz: string, expression: string): string {
    return execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '-e',
        `import('./src/design/format.ts').then((f) => process.stdout.write(String(${expression})))`,
      ],
      {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      },
    );
  }
  test('long and short forms use three-letter months, never "Sept"', () => {
    expect(formatDate('2026-09-17')).toBe('17 September 2026');
    expect(formatDate('2026-09-17', 'short')).toBe('17 Sep 2026');
    expect(formatDate('2026-08-26', 'short')).toBe('26 Aug 2026');
    expect(formatDate('2026-06-04', 'short')).toBe('4 Jun 2026');
  });
  test('date-only strings are calendar dates in every zone', () => {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Australia/Sydney'])
      expect(inZone(tz, "f.formatDate('2026-09-25')")).toBe(
        '25 September 2026',
      );
  });
  test('timestamps use the device zone', () => {
    const stamp = "f.formatDate('2026-10-02T15:30:00Z')";
    expect(inZone('Australia/Sydney', stamp)).toBe('3 October 2026');
    expect(inZone('UTC', stamp)).toBe('2 October 2026');
    expect(formatDate(new Date(2026, 9, 3, 0, 30))).toBe('3 October 2026');
  });
  test('invalid dates format as empty, never "Invalid Date"', () => {
    expect(formatDate('2026-02-30')).toBe('');
    expect(formatDate('not a date')).toBe('');
    expect(calendarDate('2026-13-01')).toBeNull();
  });
  test('financial years, ranges and voice time', () => {
    expect(formatFinancialYear(2024)).toBe('2024–25');
    expect(formatFinancialYear(1999)).toBe('1999–00');
    expect(formatYearRange(1998, 2026)).toBe('1998 to 2026');
    expect(formatYearRange(2026, 2026)).toBe('2026');
    expect(formatClock(462)).toBe('7:42');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('as-at lines', () => {
  test('date and sources', () => {
    expect(
      asAtText({
        asOf: '2026-09-17',
        citation: ['Remuneration Tribunal', 'Parliamentary Handbook'],
      }),
    ).toBe(
      'As at 17 September 2026 · Source: Remuneration Tribunal; Parliamentary Handbook',
    );
    expect(
      asAtText({ asOf: '2026-09-29', citation: 'ParlInfo bill records' }),
    ).toBe('As at 29 September 2026 · Source: ParlInfo bill records');
  });
  test('licence and coverage follow the source', () => {
    expect(
      asAtText({
        asOf: '2026-09-04',
        citation: 'IPEA quarterly expenditure reports',
        licence: 'CC BY 4.0',
        detail: 'to the June quarter 2026',
      }),
    ).toBe(
      'As at 4 September 2026 · Source: IPEA quarterly expenditure reports, CC BY 4.0, to the June quarter 2026',
    );
  });
  test('a saved copy says when it was saved', () => {
    expect(
      asAtText({
        asOf: '2026-09-04',
        citation: 'Registers of interests',
        savedAt: '2026-10-03',
      }),
    ).toBe(
      'As at 4 September 2026 · Source: Registers of interests · Saved 3 October 2026',
    );
    expect(savedText('2026-10-03')).toBe('Saved 3 October 2026');
    expect(staleText('2026-10-03')).toBe(
      'Saved 3 October 2026. It may be out of date.',
    );
  });
  test('a missing date is said, not borrowed', () => {
    expect(asAtText({ asOf: null, citation: 'votes.json' })).toBe(
      'Date not published · Source: votes.json',
    );
  });
  test('W12 votes _meta variant', () => {
    const meta = {
      content_changed_at: '2026-10-03T03:41:07Z',
      latest_division_date: '2026-09-25',
      latest_division_date_by_jurisdiction: {
        federal: '2026-09-25',
        vic: '2026-08-20',
      },
      schema: 1,
    };
    // content_changed_at is 13:41 on 3 October in eastern Australia.
    expect(votesAsAtText(meta, 'federal')).toBe(
      'Record last changed 3 October 2026 · Divisions through 25 September 2026',
    );
    // The record's own jurisdiction date, not the newest overall.
    expect(votesAsAtText(meta, 'vic')).toBe(
      'Record last changed 3 October 2026 · Divisions through 20 August 2026',
    );
    expect(votesAsAtText(null)).toBe('Record date not published');
    expect(votesAsAtText({ schema: 1 })).toBe('Record date not published');
  });
});
