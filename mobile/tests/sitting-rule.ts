// The 9 Oct status rule for the frozen identity oracles: a roster person the
// dated release does not link reads former where the release holds the
// complete current membership of every parliament the roster records and no
// sitting member there shares the surname. Checked here from the raw data,
// not by calling the rule, so an oracle difference must be exactly this one.
import { manifest, people, roster } from './pinned';

const surname = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘ʼ`]/g, "'")
    .trim()
    .split(/\s+/)
    .at(-1)!;
const sitting = new Map<string, Set<string>>();
const seats = new Map<string, number>();
for (const p of people.people)
  for (const s of p.electorates.filter((s) => s.current)) {
    seats.set(s.jurisdiction, (seats.get(s.jurisdiction) ?? 0) + 1);
    const set = sitting.get(s.jurisdiction) ?? new Set<string>();
    for (const n of [p.name, ...p.aliases])
      for (const part of [surname(n), ...surname(n).split('-')]) set.add(part);
    sitting.set(s.jurisdiction, set);
  }
const complete = (j: string) =>
  (manifest.coverage.jurisdictions[j]?.roster_members ?? 0) > 0 &&
  seats.get(j) === manifest.coverage.jurisdictions[j]!.roster_members;

type RowLike = {
  name: string;
  full?: string;
  states?: string[];
  representation?: { jurisdiction: string }[];
};
export function notSitting(name: string, own?: RowLike) {
  const rows: RowLike[] = own?.states
    ? [own]
    : roster.people.filter((r) => r.name === name || r.full === name);
  return rows.some((row) => {
    const recorded = [
      ...(row.states ?? []),
      ...(row.representation ?? []).map((r) => r.jurisdiction),
    ];
    const names = [row.name, ...(row.full ? [row.full] : [])].flatMap((n) => [
      surname(n),
      ...surname(n).split('-'),
    ]);
    return (
      recorded.length > 0 &&
      recorded.every(
        (j) => complete(j) && !names.some((n) => sitting.get(j)!.has(n)),
      )
    );
  });
}

/** The oracle's result, with unknown read as former where the rule holds. */
export function withSittingRule<T>(
  before: T,
  now: unknown,
  name: string,
  key: 'v' | 'profile',
): T {
  type Result = { partyStatus?: string; rosterRow?: RowLike } & RowLike;
  const b = (before as Record<string, Result | undefined>)[key];
  const n = (now as Record<string, Result | undefined>)[key];
  if (
    b?.partyStatus === 'unknown' &&
    n?.partyStatus === 'former' &&
    notSitting(name, n.rosterRow ?? n)
  )
    return { ...before, [key]: { ...b, partyStatus: 'former' } };
  return before;
}
