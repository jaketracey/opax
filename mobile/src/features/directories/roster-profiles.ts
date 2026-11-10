import type { PersonProfile } from '../../api/person-identity';
import { joinPerson } from '../../api/person-identity';
import { nameKey } from '../../api/ids';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from '../your-mp/model';

type RosterPerson = ElectorateView['people'][string];

// The September service export omits legacy_person_id and aliases for these
// records. Keep the bridge tied to both the exact record and its legal name,
// never a general William/Bill or Robert/Bob substitution. The roster supplies
// the display name, slug and portrait identity. Remove these when the portal
// publishes legacy_person_id (10580 / 10571) on the corresponding people rows.
const serviceLinks: Record<string, { name: string; legacyId: string }> = {
  person_2a4f287864b05c49ba33401b: {
    name: 'William Richard Shorten',
    legacyId: '10580',
  },
  person_abd81c5ea89453728d026c6a: {
    name: 'Robert Charles Grant Sercombe',
    legacyId: '10571',
  },
};

function add(index: Map<string, Set<string>>, key: string, slug: string) {
  const values = index.get(key);
  if (values) values.add(slug);
  else index.set(key, new Set([slug]));
}

/** Exact directory identities only; unresolved or ambiguous names stay plain. */
export function rosterProfileResolver(d: Directory) {
  const people = new Map<string, Directory['people']['data']['people'][number]>(
    d.people.data.people.map((p) => [p.person_id, p]),
  );
  const named = new Map<string, Set<string>>();
  const legacy = new Map<string, Set<string>>();
  const records = new Map<string, Set<string>>();
  for (const [slug, name] of Object.entries(d.slugs.data.slugs)) {
    // Surname-only directory stubs do not establish a person's identity.
    if (name.trim().includes(' ')) add(named, nameKey(name), slug);
  }
  for (const row of d.roster.data.people) {
    for (const slug of named.get(nameKey(row.name)) ?? []) {
      if (row.pid) add(legacy, row.pid, slug);
      if (row.full) add(named, nameKey(row.full), slug);
    }
  }
  for (const person of people.values())
    for (const name of [person.name, ...person.aliases])
      add(records, nameKey(name), person.person_id);

  const joined = new Map<string, PersonProfile | null>();
  const profile = (slug: string) => {
    if (!joined.has(slug)) {
      try {
        joined.set(
          slug,
          joinPerson(
            slug,
            d.slugs.data,
            d.roster.data,
            d.people.data,
            d.manifest.data,
          ),
        );
      } catch {
        joined.set(slug, null);
      }
    }
    return joined.get(slug) ?? null;
  };
  const one = (slugs: Set<string>, person: RosterPerson) => {
    // Do not pick the first spelling when the index cannot disambiguate it.
    if (slugs.size !== 1) return null;
    const p = profile([...slugs][0]!);
    if (p?.canonicalPersonId && p.canonicalPersonId !== person.person_id)
      return null;
    return p;
  };

  return (
    person: RosterPerson | undefined,
    personId: string | undefined = person?.person_id,
  ): PersonProfile | null => {
    const record = personId ? people.get(personId) : undefined;
    // The shared representative resolver gives history the same native page
    // as election candidates when the release carries a complete identity.
    const direct = record ? representativeProfile(record.person_id, d) : null;
    if (direct) return direct;
    person ??= record;
    if (!person) return null;

    const link = serviceLinks[person.person_id];
    const legacyId =
      person.legacy_person_id ??
      record?.legacy_person_id ??
      (link && nameKey(link.name) === nameKey(person.name)
        ? link.legacyId
        : undefined);
    if (legacyId) {
      const p = one(legacy.get(legacyId) ?? new Set(), person);
      // Reused roster IDs and conflicting canonical records must not borrow
      // another person's name, face or page.
      return p?.rosterPersonId === legacyId ? p : null;
    }

    const names = new Set([
      person.name,
      ...person.aliases,
      ...(record ? [record.name, ...record.aliases] : []),
    ]);
    const ids = new Set(
      [...names].flatMap((name) => [...(records.get(nameKey(name)) ?? [])]),
    );
    if (ids.size > 1) return null;
    if (ids.size === 1) {
      const matched = people.get([...ids][0]!)!;
      const p = representativeProfile(matched.person_id, d);
      if (p) return p;
      names.add(matched.name);
      matched.aliases.forEach((name) => names.add(name));
    }
    return one(
      new Set(
        [...names].flatMap((name) => [...(named.get(nameKey(name)) ?? [])]),
      ),
      person,
    );
  };
}
