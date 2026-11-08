// `/divisions/recent.json` (data lane D1) projected only from the pinned bill
// files: every division those bills record, in the shape Today's decoder
// (src/features/today/votes.ts) reads. Nothing is invented: each row is one
// pinned division's own key, date, house, stage, outcome and counts under its
// bill's pinned key and titles, and `generated_at` is the pinned bill index's.
// A division a package of bills shares (the pinned files repeat it under each
// bill) is listed once, under the first of those bills by key. The block's
// rule (second and third readings only) then selects its rows.
import { Buffer } from 'node:buffer';
import { decodeBill, decodeBillIndex } from '../src/api/catalog-decoders';

export const divisionsPath = '/divisions/recent.json';

export function divisionsFixture(
  bytes: (path: string) => Buffer,
  billPaths: readonly string[],
): Buffer {
  const index = decodeBillIndex(
    JSON.parse(bytes('/bills/index.json').toString()),
  );
  const seen = new Set<string>();
  const divisions = billPaths
    .filter((path) => /^\/bills\/au-federal-[a-z0-9-]+\.json$/.test(path))
    .sort()
    .flatMap((path) => {
      const bill = decodeBill(JSON.parse(bytes(path).toString()));
      return bill.divisions
        .filter((division) => {
          if (seen.has(division.key)) return false;
          seen.add(division.key);
          return true;
        })
        .map((division) => ({
          bill_key: bill.key,
          title: bill.title,
          short_title: bill.short_title ?? null,
          division_key: division.key,
          stage: division.stage,
          chamber: division.house,
          date: division.date,
          outcome: division.outcome,
          ayes: division.ayes,
          noes: division.noes,
        }));
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.division_key.localeCompare(b.division_key),
    );
  return Buffer.from(
    JSON.stringify({ generated_at: index.generated_at, divisions }),
  );
}
