import {
  personSlug,
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

/** The names a roster row answers to: its name and its recorded full name. */
const namesOf = (row: RosterRow) =>
  [row.name, row.full].filter((n): n is string => !!n?.trim());
type RosterRow = Roster['people'][number];

/**
 * The profile a bill's sponsor opens, or null. Native pages are for roster
 * parliamentarians only (decision 3), and a link must never point at someone
 * other than the person named on screen. So the displayed name has to name
 * exactly one full-name roster person; when the bill also carries a roster ID,
 * that ID has to identify the same person (by name or recorded full name) and
 * no other roster person may share the name. That person must then resolve to
 * exactly one directory slug. Any contradiction or ambiguity: plain text.
 */
export function sponsorSlug(
  name: string,
  roster: Roster,
  slugs: Slugs,
  id?: RosterId | null,
): PersonSlug | null {
  const wanted = folded(name);
  if (!name.trim().includes(' ')) return null;
  const full = (row: RosterRow) => row.name.trim().includes(' ');
  const named = roster.people.filter(
    (row) => full(row) && namesOf(row).some((n) => folded(n) === wanted),
  );
  // Rows without an ID cannot be told apart, so each counts as its own person.
  const people = new Set(named.map((row, i) => row.pid ?? `row-${i}`));
  let person: RosterRow | undefined;
  if (id) {
    if (named.some((row) => row.pid !== id)) return null;
    person = roster.people.find(
      (row) =>
        row.pid === id &&
        full(row) &&
        namesOf(row).some((n) => folded(n) === wanted),
    );
  } else if (people.size === 1) person = named[0];
  if (!person) return null;
  const matches = Object.entries(slugs.slugs).filter(
    ([, n]) => folded(n) === folded(person.name),
  );
  return matches.length === 1 ? personSlug(matches[0]![0]) : null;
}
