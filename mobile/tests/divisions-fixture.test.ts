import { divisionsFixture, divisionsPath } from '../scripts/divisions-fixture';
import { decodeBill } from '../src/api/catalog-decoders';
import { assertAllowedPath } from '../src/api/policy';
import {
  decodeRecentDivisions,
  isReadingVote,
  recentReadingVotes,
} from '../src/features/today/votes';
import { pinned, pinnedBytes, servedFiles } from './pinned';

// The D1 index the portal does not publish yet, projected only from the
// pinned bills (scripts/divisions-fixture.ts). Every row must be one pinned
// division's own record, and the block's rule must find rows in it.
const file = decodeRecentDivisions(
  JSON.parse(divisionsFixture(pinnedBytes, servedFiles).toString()),
);
const billPaths = servedFiles.filter((path) =>
  /^\/bills\/au-federal-/.test(path),
);

test('the path is the allowed static read Today makes', () => {
  expect(divisionsPath).toBe('/divisions/recent.json');
  expect(() => assertAllowedPath(divisionsPath)).not.toThrow();
});

test('every pinned division is in the index once, newest first, under one of its bills', () => {
  const source = billPaths.flatMap((path) => {
    const bill = decodeBill(pinned(path));
    return bill.divisions.map((division) => ({ bill, division }));
  });
  const keys = new Set(source.map(({ division }) => division.key));
  expect(keys.size).toBeGreaterThan(100);
  // The pinned files repeat a package's shared division under each bill.
  expect(source.length).toBeGreaterThan(keys.size);
  expect(file.divisions).toHaveLength(keys.size);
  expect(new Set(file.divisions.map((row) => row.division_key)).size).toBe(
    keys.size,
  );
  for (let i = 1; i < file.divisions.length; i++)
    expect(
      file.divisions[i - 1]!.date >= file.divisions[i]!.date ||
        (file.divisions[i - 1]!.date === file.divisions[i]!.date &&
          file.divisions[i - 1]!.division_key <=
            file.divisions[i]!.division_key),
    ).toBe(true);
  for (const row of file.divisions) {
    const sharing = source
      .filter(({ division }) => division.key === row.division_key)
      .sort((a, b) => a.bill.key.localeCompare(b.bill.key));
    expect(sharing.length).toBeGreaterThan(0);
    // A shared division is listed under the first of its bills by key.
    const { bill, division } = sharing[0]!;
    expect(row).toEqual({
      bill_key: bill.key,
      title: bill.title,
      short_title: bill.short_title ?? undefined,
      division_key: division.key,
      stage: division.stage ?? undefined,
      chamber: division.house,
      date: division.date,
      outcome: division.outcome,
      ayes: division.ayes,
      noes: division.noes,
    });
    expect(servedFiles).toContain(`/bills/${row.bill_key}.json`);
  }
});

test("generated_at is the pinned bill index's own timestamp", () => {
  expect(file.generated_at).toBe(
    (pinned('/bills/index.json') as { generated_at: string }).generated_at,
  );
});

test('How parliament voted finds three reading votes and leaves procedure out', () => {
  const rows = recentReadingVotes(file, 3);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(isReadingVote(row)).toBe(true);
    expect(row.stageWords).toMatch(/^(Second|Third) reading$/);
    expect(row.chamberWords).toMatch(/^(House of Representatives|Senate)$/);
    expect(['Agreed', 'Not agreed']).toContain(row.outcomeWord);
    expect(row.ayes + row.noes).toBeGreaterThan(0);
  }
  expect(rows[0]!.date >= rows[1]!.date && rows[1]!.date >= rows[2]!.date).toBe(
    true,
  );
  // The newest pinned division is a procedural motion, not a reading: the
  // rule skips it rather than drawing it as a vote on a bill.
  expect(isReadingVote(file.divisions[0]!)).toBe(false);
  expect(rows.map((row) => row.division_key)).not.toContain(
    file.divisions[0]!.division_key,
  );
});

test('a bill appears once per day with its latest reading division', () => {
  const row = {
    bill_key: 'au-federal-r1',
    title: 'Example Bill 2026',
    stage: 'Second reading',
    date: '2026-11-09',
    ayes: 80,
    noes: 60,
  };
  const file = decodeRecentDivisions({
    generated_at: '2026-11-09',
    divisions: [
      { ...row, division_key: 'house-99' },
      { ...row, stage: 'Third reading', division_key: 'house-100' },
      {
        ...row,
        bill_key: 'au-federal-r2',
        title: 'Another Bill 2026',
        division_key: 'house-101',
      },
      { ...row, date: '2026-11-08', division_key: 'house-98' },
    ],
  });
  expect(recentReadingVotes(file, 4).map((vote) => vote.division_key)).toEqual([
    'house-101',
    'house-100',
    'house-98',
  ]);
});
