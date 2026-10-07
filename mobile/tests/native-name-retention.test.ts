import { memberSuggestionRoster } from '../src/api/catalog-search';
import { nameKey } from '../src/api/ids';
import {
  joinPerson,
  personSlugForId,
  personSlugForResult,
} from '../src/api/person-identity';
import {
  fullPortraitName,
  profileFor,
  suggestionsFor,
} from '../src/api/selectors';
import {
  bills,
  catalogs,
  index,
  manifest,
  people,
  roster,
  slugs,
} from './pinned';

const verified = memberSuggestionRoster(roster, catalogs);
// The R2 live roster corrects Patrick's legacy ID to Pat's verified ID. The
// pinned roster predates that correction; model just that observed bridge.
const pat = people.people.find((person) => person.name === 'Pat Conaghan')!;
const retentionCatalogs = {
  ...catalogs,
  roster: {
    ...roster,
    people: roster.people.map((person) =>
      person.name === 'Patrick Conaghan'
        ? { ...person, pid: pat.legacy_person_id }
        : person,
    ),
  },
};
const retainedSpellings = memberSuggestionRoster(
  retentionCatalogs.roster,
  retentionCatalogs,
);

// All 19 original spellings lost in the R2 replay, including its four repros.
test.each([
  ['Chris Pyne', 'chris-pyne', 'Christopher Pyne'],
  ['Katrina Allen', 'katrina-allen', 'Katie Allen'],
  ['Rob Oakeshott', 'rob-oakeshott', 'Robert Oakeshott'],
  ["Deb O'Neill", 'deb-oneill', "Deborah O'Neill"],
  ['Patrick Conaghan', 'patrick-conaghan', 'Pat Conaghan'],
  ['Elizabeth Coker', 'elizabeth-coker', 'Libby Coker'],
  ['Steve Ciobo', 'steve-ciobo', 'Steven Ciobo'],
  ['Phil Barresi', 'phil-barresi', 'Phillip Barresi'],
  ['Adam Paul Bandt', 'adam-paul-bandt', 'Adam Bandt'],
  ['Lucy Elizabeth Wicks', 'lucy-elizabeth-wicks', 'Lucy Wicks'],
  ['Andrew Keith Leigh', 'andrew-keith-leigh', 'Andrew Leigh'],
  ['Katter Bob Jnr', 'katter-bob-jnr', 'Bob Katter'],
  ['Kevin Drum', 'kevin-drum', 'Damian Drum'],
  ['Meryl Jane Swanson', 'meryl-jane-swanson', 'Meryl Swanson'],
  ["Clare Ellen O'Neil", 'clare-ellen-oneil', "Clare O'Neil"],
  ['Elizabeth Webster', 'elizabeth-webster', 'Anne Webster'],
  ['Linda Jean Burney', 'linda-jean-burney', 'Linda Burney'],
  ['Nicolle Jane Flint', 'nicolle-jane-flint', 'Nicolle Flint'],
  ['Melissa Lee Price', 'melissa-lee-price', 'Melissa Price'],
])(
  'native name %s retains its canonical suggestion',
  (query, slug, canonical) => {
    const id = joinPerson(
      slug,
      slugs,
      retentionCatalogs.roster,
      people,
      manifest,
    ).canonicalPersonId;
    expect(id).toBeDefined();
    expect(suggestionsFor(query, roster, index, bills).people).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: query })]),
    );
    for (const spelling of new Set([
      query,
      query.replaceAll("'", '’'),
      query.toLocaleLowerCase('en-AU'),
      nameKey(query),
    ])) {
      expect(
        suggestionsFor(spelling, retainedSpellings, index, bills).people,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: canonical })]),
      );
    }
    const canonicalSlug = personSlugForId(
      id!,
      slugs,
      retentionCatalogs.roster,
      people,
      manifest,
    );
    expect(slugs.slugs[canonicalSlug]).toBe(canonical);
    expect(
      profileFor(id!, retentionCatalogs).blocks.identity.data
        ?.canonicalPersonId,
    ).toBe(id);
  },
);

test('every verified full roster spelling retains suggestions without canonicalizing its query', () => {
  const checked = new Set<string>();
  for (const person of roster.people) {
    if (!fullPortraitName(person.name)) continue;
    const slug = personSlugForResult(
      {
        kind: 'person',
        title: person.name,
        href: '/subject/person/' + encodeURIComponent(person.name),
        slug: '',
        snippet: '',
        resource: '',
      },
      slugs,
    );
    if (!slug) continue;
    let canonical: string;
    try {
      const id = joinPerson(
        slug,
        slugs,
        roster,
        people,
        manifest,
      ).canonicalPersonId;
      if (!id) continue;
      canonical =
        slugs.slugs[personSlugForId(id, slugs, roster, people, manifest)]!;
      profileFor(id, catalogs);
    } catch {
      continue; // The native profile path refuses this spelling.
    }
    checked.add(person.name);
    for (const query of new Set([
      person.name,
      person.name.replaceAll('’', "'"),
      person.name.replaceAll("'", '’'),
      person.name.toLocaleLowerCase('en-AU'),
      nameKey(person.name),
    ]))
      expect(suggestionsFor(query, verified, index, bills).people).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: canonical })]),
      );
  }
  // These roster twins share one slug; exact source-name lookup loses a twin.
  expect(checked.size).toBeGreaterThan(595);
  expect(checked.has("Kelly O'Dwyer")).toBe(true);
  expect(checked.has('Kelly O’Dwyer')).toBe(true);
  expect(checked.has("Ken O'Dowd")).toBe(true);
  expect(checked.has('Ken O’Dowd')).toBe(true);
  expect(checked.has('Sarah Hanson-Young')).toBe(true);
}, 30000);

test('an unresolved full spelling stays excluded without its verified native bridge', () => {
  expect(
    joinPerson('patrick-conaghan', slugs, roster, people, manifest)
      .canonicalPersonId,
  ).toBeUndefined();
  expect(
    suggestionsFor('Patrick Conaghan', verified, index, bills).people,
  ).toEqual([]);
});

test('verified surname rows stay separate from aliases while initials stay excluded', () => {
  const member = people.people.find(
    (person) => person.name === 'Anthony Albanese',
  )!;
  const names = ['Albanese', 'A Albanese', 'A. Albanese', 'AA Albanese'];
  const bridgedRoster = {
    ...roster,
    people: [
      roster.people.find((person) => person.name === member.name)!,
      ...names.map((name) => ({
        name,
        full: member.name,
        pid: member.legacy_person_id,
        party: null,
      })),
    ],
  };
  const bridgedSlugs = {
    ...slugs,
    slugs: {
      'anthony-albanese': member.name,
      albanese: names[0]!,
      'a-albanese': names[1]!,
      'initial-albanese': names[2]!,
      'aa-albanese': names[3]!,
    },
  };
  const sources = memberSuggestionRoster(bridgedRoster, {
    ...catalogs,
    roster: bridgedRoster,
    slugs: bridgedSlugs,
    people: { ...people, people: [member] },
  });
  for (const slug of Object.keys(bridgedSlugs.slugs))
    expect(
      joinPerson(
        slug,
        bridgedSlugs,
        bridgedRoster,
        { ...people, people: [member] },
        manifest,
      ).canonicalPersonId,
    ).toBe(member.person_id);
  expect(sources.people.map((person) => person.name)).toEqual([
    member.name,
    'Albanese',
  ]);
  expect(sources.people[0]?.name).toBe(member.name);
  for (const name of names)
    expect(sources.people[0]?.aliases).not.toContain(name);
  for (const name of names.slice(1))
    expect(sources.people.some((person) => person.name === name)).toBe(false);
});
