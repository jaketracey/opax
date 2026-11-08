import {
  addDays,
  archiveYear,
  cardTitle,
  daysBetween,
  editionTier,
  questionIndex,
  starterPair,
} from '../src/features/today/rules';

describe('editionTier', () => {
  test.each([
    ['2026-11-08', 'fresh'],
    ['2026-11-05', 'fresh'],
    ['2026-11-04', 'recent'],
    ['2026-10-25', 'recent'],
    ['2026-10-24', 'old'],
  ] as const)('%s on 8 November is %s', (date, tier) =>
    expect(editionTier(date, '2026-11-08')).toBe(tier),
  );
  test('reads a full timestamp by its day', () =>
    expect(editionTier('2026-11-07T22:00:00Z', '2026-11-08')).toBe('fresh'));
});

describe('day arithmetic', () => {
  test('counts calendar days across a leap day and a year end', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(addDays('2026-11-08', 30)).toBe('2026-12-08');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('archiveYear', () => {
  test('1 January is 1998, and the years run in order', () => {
    expect(archiveYear('2026-01-01')).toBe(1998);
    expect(archiveYear('2026-01-02')).toBe(1999);
    expect(archiveYear('2026-01-29')).toBe(2026);
    expect(archiveYear('2026-01-30')).toBe(1998);
  });
  test('always 1998 to 2026, at year end and after a leap day', () => {
    // Day 365 of 2026: (365 − 1) mod 29 = 16.
    expect(archiveYear('2026-12-31')).toBe(2014);
    // Day 366 of 2028: (366 − 1) mod 29 = 17.
    expect(archiveYear('2028-12-31')).toBe(2015);
    expect(archiveYear('2028-03-01')).toBe(1998 + ((61 - 1) % 29));
    for (let d = 0; d < 800; d++) {
      const year = archiveYear(addDays('2026-01-01', d));
      expect(year).toBeGreaterThanOrEqual(1998);
      expect(year).toBeLessThanOrEqual(2026);
    }
  });
});

describe('questionIndex', () => {
  test('days since 1 January 2026, mod the deck', () => {
    expect(questionIndex('2026-01-01', 60)).toBe(0);
    expect(questionIndex('2026-01-02', 60)).toBe(1);
    expect(questionIndex('2026-03-02', 60)).toBe(0);
    expect(questionIndex('2027-01-01', 60)).toBe(365 % 60);
    expect(questionIndex('2029-01-01', 7)).toBe((365 + 365 + 366) % 7);
  });
  test('never negative before 2026, and -1 with no deck', () => {
    expect(questionIndex('2025-12-31', 60)).toBe(59);
    expect(questionIndex('2026-11-08', 0)).toBe(-1);
  });
});

describe('starterPair', () => {
  const list = ['a', 'b', 'c', 'd', 'e'];
  test('two a day, in order, wrapping the list', () => {
    expect(starterPair('2026-01-01', list)).toEqual(['a', 'b']);
    expect(starterPair('2026-01-02', list)).toEqual(['c', 'd']);
    expect(starterPair('2026-01-03', list)).toEqual(['e', 'a']);
  });
  test('a short or empty list', () => {
    expect(starterPair('2026-01-01', ['only'])).toEqual(['only']);
    expect(starterPair('2026-01-01', [])).toEqual([]);
  });
});

describe('cardTitle', () => {
  const base = { path: '/money/grants?program=x', kind: 'program' as const };
  test('a short title wins', () =>
    expect(
      cardTitle({
        ...base,
        kind: 'bill',
        title: 'A Bill for an Act to amend the law relating to things, and for related purposes',
        shortTitle: 'Things Amendment Bill 2026',
      }),
    ).toBe('Things Amendment Bill 2026'));
  test('a name of 80 characters or fewer is shown as published', () => {
    const title = 'x'.repeat(80);
    expect(cardTitle({ ...base, title })).toBe(title);
  });
  test('cut before " (" when it comes within 80 characters', () =>
    expect(
      cardTitle({
        ...base,
        title:
          'Community Grants Program (round two, for local organisations in regional and remote areas)',
      }),
    ).toBe('Community Grants Program…'));
  test('otherwise at the last word before 80 characters', () => {
    const title =
      'Funding for the construction of a regional hospital wing and associated works across several sites';
    const out = cardTitle({ ...base, title });
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(title.startsWith(out.slice(0, -1))).toBe(true);
    expect(out.slice(0, -1)).not.toMatch(/\s$/);
  });
  test('no space and no " (" before 80 characters: cut at 80', () => {
    const title = 'y'.repeat(120);
    expect(cardTitle({ ...base, title })).toBe(`${'y'.repeat(80)}…`);
  });
});
