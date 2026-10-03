import {
  personSlug,
  rosterRowFor,
  type PersonSlug,
  type Roster,
  type RosterId,
  type Slugs,
} from '../../api/catalogs';

const folded = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’‘ʼ`']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The profile a bill's sponsor opens, or null. Native pages are for roster
 * parliamentarians only (decision 3): the sponsor must be a full-name roster
 * row (by the bill's roster ID when it has one, else by name), and that name
 * must resolve to exactly one directory slug. Anything else stays plain text.
 */
export function sponsorSlug(
  name: string,
  roster: Roster,
  slugs: Slugs,
  id?: RosterId | null,
): PersonSlug | null {
  if (!name.trim().includes(' ')) return null;
  let row: Roster['people'][number] | undefined;
  try {
    row = rosterRowFor([name], roster, id ?? undefined);
  } catch {
    return null;
  }
  if (!row || !row.name.trim().includes(' ')) return null;
  for (const candidate of new Set([row.name, name])) {
    const matches = Object.entries(slugs.slugs).filter(
      ([, n]) => folded(n) === folded(candidate),
    );
    if (matches.length === 1) return personSlug(matches[0]![0]);
  }
  return null;
}
