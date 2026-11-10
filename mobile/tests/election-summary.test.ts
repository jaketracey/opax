import {
  candidateRows,
  censusHeadline,
  censusOtherRows,
  electionSummary,
  electionTitle,
  electionsNewestFirst,
  voteShare,
  type ElectionRecord,
} from '../src/features/your-mp/election-summary';

const vote = (
  kind: string,
  votes: number,
  denominator: number | null = null,
) => ({
  kind,
  votes,
  denominator,
  sources: [],
});
const candidate = (
  name: string,
  party: string | null,
  votes: ReturnType<typeof vote>[],
  elected = false,
  ballot: number | null = null,
) => ({
  name,
  party,
  person_id: null,
  elected,
  ballot_position: ballot,
  votes,
});
const election = (
  candidates: ElectionRecord['candidates'],
  kind = 'general',
  poll_date = '2025-05-03',
): ElectionRecord =>
  ({
    election: { poll_date, kind, name: 'ignored' },
    candidates,
    sources: [],
    election_id: `e-${poll_date}-${kind}`,
    status: 'final',
  }) as ElectionRecord;

test('titles never print the raw kind', () => {
  expect(
    electionTitle({ kind: 'general', poll_date: '2025-05-03' }, 'federal'),
  ).toBe('2025 federal election');
  expect(
    electionTitle({ kind: 'by_election', poll_date: '2024-03-02' }, 'federal'),
  ).toBe('2024 by-election');
  expect(
    electionTitle({ kind: 'general', poll_date: '2022-11-26' }, 'vic'),
  ).toBe('2022 state election');
});

test('the summary names the one winner, or none', () => {
  const won = election([
    candidate('A Person', 'Labor', [vote('primary', 10)], true),
    candidate('B Person', null, [vote('primary', 5)]),
  ]);
  expect(electionSummary(won, 'federal')).toEqual({
    key: won.election_id,
    title: '2025 federal election',
    date: '2025-05-03',
    winner: { name: 'A Person', party: 'Labor', personId: null },
  });
  const unclear = election([
    candidate('A', 'X', [], true),
    candidate('B', 'Y', [], true),
  ]);
  expect(electionSummary(unclear, 'federal').winner).toBeNull();
});

test('the winner carries the party name, never a code, and no guessed party', () => {
  const coded = election([candidate('A Person', 'ALP', [], true)]);
  expect(electionSummary(coded, 'federal').winner?.party).toBe('Labor');
  const unrecorded = election([candidate('A Person', null, [], true)]);
  expect(electionSummary(unrecorded, 'federal').winner?.party).toBeNull();
});

test('newest election first', () => {
  const old = election([], 'general', '2019-05-18');
  const recent = election([], 'general', '2025-05-03');
  expect(
    electionsNewestFirst([old, recent]).map((e) => e.election.poll_date),
  ).toEqual(['2025-05-03', '2019-05-18']);
});

test('shares round to one decimal and need a formal total', () => {
  expect(voteShare(41234, 91432)).toBe(45.1);
  expect(voteShare(2, 3)).toBe(66.7);
  expect(voteShare(1, 0)).toBeNull();
  expect(voteShare(1, null)).toBeNull();
});

test('candidates by first preferences, highest first; after preferences for two finalists only', () => {
  const rows = candidateRows(
    election([
      candidate('Low', 'Greens', [vote('primary', 100, 1000)], false, 1),
      candidate(
        'High',
        'Labor',
        [vote('primary', 600, 1000), vote('tcp', 678, 1000)],
        true,
        3,
      ),
      candidate(
        'Mid',
        'Liberal',
        [vote('primary', 300, 1000), vote('tcp', 322, 1000)],
        false,
        2,
      ),
    ]),
  );
  expect(rows.map((r) => r.name)).toEqual(['High', 'Mid', 'Low']);
  expect(rows[0]).toMatchObject({
    first: '600 (60.0%)',
    after: '67.8%',
    elected: true,
  });
  expect(rows[2]!.after).toBeNull();
});

test('missing two-candidate counts leave the after line out', () => {
  const rows = candidateRows(
    election([
      candidate('A', 'X', [vote('primary', 60)], true),
      candidate('B', 'Y', [vote('primary', 40)]),
    ]),
  );
  // No denominator: the share is of the summed first preferences.
  expect(rows.map((r) => r.first)).toEqual(['60 (60.0%)', '40 (40.0%)']);
  expect(rows.every((r) => r.after === null)).toBe(true);
});

test('ties keep ballot order', () => {
  const rows = candidateRows(
    election([
      candidate('Second', 'X', [vote('primary', 5)], false, 2),
      candidate('First', 'Y', [vote('primary', 5)], false, 1),
    ]),
  );
  expect(rows.map((r) => r.name)).toEqual(['First', 'Second']);
});

test('Census headline needs its year; the rest keep the label order', () => {
  const indicators = {
    population: 169321,
    median_age: 38,
    median_household_income_weekly: 2388,
    born_overseas_pct: 33.9,
    rental_pct: null,
  };
  const headline = censusHeadline({ year: 2021, indicators });
  expect(headline?.label).toBe('Census 2021');
  expect(headline?.rows.map((r) => r.label)).toEqual([
    'Population',
    'Median age',
    'Median weekly household income',
  ]);
  expect(censusHeadline({ year: 0, indicators })).toBeNull();
  expect(censusHeadline(null)).toBeNull();
  expect(censusOtherRows({ indicators }).map((r) => r.label)).toEqual([
    'Born overseas',
  ]);
});
