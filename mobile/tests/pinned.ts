import snapshot from '../scripts/fixture-snapshot.json';
import * as d from '../src/api/catalogs';
import { object } from '../src/api/validation';
import { fixtureBytes } from './fixture-bytes';
export const servedFiles = Object.keys(snapshot.files).filter(
  (path) => !snapshot.testOnlyFiles.includes(path),
);
export const files: Record<string, string> = snapshot.files;
export const sizes: Record<string, number> = snapshot.sizes;
export const pinnedBytes = fixtureBytes(snapshot);
export const pinned = (path: string): unknown =>
  JSON.parse(pinnedBytes(path).toString());
export const manifest = d.decodeManifest(pinned('/electorates/manifest.json'));
export const people = d.decodePeople(pinned(manifest.people_url));
export const roster = d.decodeRoster(pinned('/parliamentarians.json'));
export const index = d.decodeElectorateIndex(pinned(manifest.index_url));
export const bills = d.decodeBillIndex(pinned('/bills/index.json'));
// Slug API fixture is projected from pinned roster/release (not a made-up API file).
const slugOf = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘ʼ`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const rows = new Map<string, { name: string; speeches: number }>();
for (const row of roster.people) {
  const slug = slugOf(row.name),
    previous = rows.get(slug);
  if (!previous || (row.speeches ?? 0) > previous.speeches)
    rows.set(slug, { name: row.name, speeches: row.speeches ?? 0 });
}
for (const p of people.people)
  if (
    p.electorates.some((s) => s.current) &&
    ![p.name, ...p.aliases].some((n) => rows.has(slugOf(n)))
  )
    rows.set(slugOf(p.name), { name: p.name, speeches: 0 });
export const slugs = d.decodeSlugs({
  generated: roster.meta.generated,
  slugs: Object.fromEntries([...rows].map(([slug, row]) => [slug, row.name])),
});
export const catalogs: d.ProfileCatalogs = {
  manifest,
  people,
  roster,
  slugs,
  bills,
  votes: d.decodeVotes(pinned('/votes.json')),
  interestIndex: d.decodeInterestIndex(pinned('/interests/index.json')),
  pay: d.decodePay(pinned('/pay.json')),
  expenses: d.decodeExpenses(pinned('/expenses.json')),
  expenseCategories: d.decodeExpenseCategories(
    pinned('/expense-categories.json'),
  ),
  photoPeople: d.decodePhotoPeople(pinned('/photos/people.json')),
  photoCredits: d.decodePhotoCredits(pinned('/photos/credits.json')),
};
export function replaceAt(
  input: unknown,
  path: (string | number)[],
  replacement: unknown,
): unknown {
  if (!path.length) return replacement;
  const [key, ...rest] = path;
  if (Array.isArray(input) && typeof key === 'number')
    return input.map((v, i) =>
      i === key ? replaceAt(v, rest, replacement) : v,
    );
  const row = object(input);
  return { ...row, [key!]: replaceAt(row[key!], rest, replacement) };
}
