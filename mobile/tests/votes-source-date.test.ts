import { latestBillVote, votesSource } from '../src/features/your-mp/Evidence';

// Sweep 1, item 9: the voting record's source line always carries a date.
type Block = Parameters<typeof votesSource>[0];
const block = (over: Partial<Block>) =>
  ({
    status: 'ready',
    asAt: null,
    sources: [],
    data: {
      jurisdictions: ['federal'],
      latestDivisionDateByJurisdiction: {},
      for: [{ date: '2026-02-10' }, { date: '2026-06-04' }],
      against: [{ date: '2026-07-01' }],
    },
    ...over,
  }) as unknown as Block;

test('the newest listed bill vote, across for and against', () => {
  expect(latestBillVote(block({}).data)).toBe('2026-07-01');
  expect(latestBillVote({ for: [], against: [] })).toBeNull();
  expect(latestBillVote(null)).toBeNull();
});

test('an undated votes file is dated by its newest listed bill vote', () => {
  expect(votesSource(block({}))).toEqual({
    coverage: null,
    dateLabel: 'Latest bill vote 1 Jul 2026',
  });
});

test('a dated file or published coverage keeps its own date', () => {
  expect(votesSource(block({ asAt: '2026-09-30' }))).toEqual({
    coverage: null,
  });
  const covered = votesSource(
    block({
      data: {
        ...(block({}).data as object),
        latestDivisionDateByJurisdiction: { federal: '2026-09-25' },
      } as unknown as Block['data'],
    }),
  );
  expect(covered).toEqual({
    coverage: 'Divisions to 25 Sep 2026',
    dateLabel: 'Record date not published',
  });
});

test('with nothing to date it, the line says so', () => {
  expect(
    votesSource(
      block({
        data: {
          ...(block({}).data as object),
          for: [],
          against: [],
        } as unknown as Block['data'],
      }),
    ),
  ).toEqual({ coverage: null, dateLabel: 'Record date not published' });
});
