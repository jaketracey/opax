import {
  personId,
  decodeManifest,
  decodePeople,
  decodeRoster,
  joinPerson,
  personSlugForResult,
  type Slugs,
} from '../src/api/catalogs';
import {
  manifest,
  people,
  roster,
  slugs as allSlugs,
  catalogs,
} from './pinned';
import { rosterRowFor } from '../src/api/person-identity';
import { fromWebPath } from '../src/navigation/routes';
const slugs: Slugs = {
  generated: roster.meta.generated,
  slugs: {
    'anthony-albanese': 'Anthony Albanese',
    'madonna-jarrett': 'Madonna Jarrett',
  },
};
test('catalog IDs cannot be used as person routes; href names resolve through slug API', () => {
  const row = {
    kind: 'person',
    title: 'Anthony Albanese',
    href: '/subject/person/Anthony%20Albanese',
    slug: 'catalog-2',
    snippet: '',
    resource: '',
  };
  expect(personSlugForResult(row, slugs)).toBe('anthony-albanese');
  expect(
    personSlugForResult(
      { ...row, href: '/subject/person/anthony-albanese' },
      slugs,
    ),
  ).toBe('anthony-albanese');
  expect(
    personSlugForResult({ ...row, href: '/subject/person/Unknown' }, slugs),
  ).toBeUndefined();
  expect(
    personSlugForResult({ ...row, href: '/api/ask' }, slugs),
  ).toBeUndefined();
});
test('public identity bridge preserves canonical, legacy, electorate and source date', () => {
  const profile = joinPerson(
    'anthony-albanese',
    slugs,
    roster,
    people,
    manifest,
  );
  expect(profile).toMatchObject({
    name: 'Anthony Albanese',
    canonicalPersonId: 'person_2b850aa643795ce8902f754b',
    legacyPersonId: '10007',
    party: 'Labor',
    asOf: '2026-09-04',
  });
  expect(profile.seats[0]?.name).toBe('Grayndler');
  expect(
    profile.sources.some((source) => source.url.startsWith('https://')),
  ).toBe(true);
});
test('a roster-only person can be joined without a speech count or pid', () => {
  const profile = joinPerson(
    'madonna-jarrett',
    slugs,
    { meta: roster.meta, people: [] },
    people,
    manifest,
  );
  expect(profile.seats.some((seat) => seat.name === 'Brisbane')).toBe(true);
  expect(profile.canonicalPersonId).toMatch(/^person_/);
});
test('historical roster affiliation is not substituted for a current electorate observation', () => {
  const profile = joinPerson(
    'anthony-albanese',
    slugs,
    roster,
    { ...people, people: [] },
    manifest,
  );
  expect(profile.seats).toEqual([]);
});
test('ambiguity and malformed release paths fail closed', () => {
  const person = people.people.find(
    (person) => person.legacy_person_id === '10007',
  )!;
  expect(() =>
    joinPerson(
      'anthony-albanese',
      slugs,
      roster,
      {
        ...people,
        people: [
          person,
          { ...person, person_id: personId('person_000000000000000000000000') },
        ],
      },
      manifest,
    ),
  ).toThrow(/identity/);
  expect(() =>
    decodeManifest({ ...manifest, people_url: '/api/ask' }),
  ).toThrow();
  expect(() => decodePeople({ ...people, meta: {} })).toThrow();
  expect(() => decodeRoster({ people: [] })).toThrow();
});
test('web path aligns to stack route without claiming universal links', () => {
  expect(fromWebPath('/subject/person/anthony-albanese')).toEqual({
    pathname: '/person/[slug]',
    params: { slug: 'anthony-albanese' },
  });
  expect(fromWebPath('/api/ask')).toBeNull();
});
test.each([
  ["Deborah O'Neill", 'deborah-oneill', 'New South Wales', '10747'],
  ['Chris Crewther', 'chris-crewther', 'Mornington', '10879'],
  ['Darren Cheeseman', 'darren-cheeseman', 'South Barwon', '10117'],
])(
  '%s resolves to its current seat and retains its legacy ID',
  (name, slug, seat, pid) => {
    const profile = joinPerson(slug, allSlugs, roster, people, manifest);
    expect(profile.canonicalPersonId).toBe(
      people.people.find(
        (p) => p.name === name && p.electorates.some((s) => s.current),
      )!.person_id,
    );
    expect(profile.legacyPersonId).toBe(pid);
    expect(profile.seats.some((s) => s.name === seat && s.current)).toBe(true);
  },
);

test.each([
  ['plibersek', 'Tanya Plibersek', '10513', 'Sydney'],
  ['oneill', "Deborah O'Neill", '10747', 'New South Wales'],
  ['snowdon', 'Warren Snowdon', '10599', null],
  ['mclachlan', 'Andrew McLachlan', '10959', 'South Australia'],
])(
  'surname page %s resolves its unique release identity',
  (slug, name, pid, seat) => {
    const profile = joinPerson(slug!, allSlugs, roster, people, manifest);
    const person = people.people.find((p) => p.name === name)!;
    expect(profile.canonicalPersonId).toBe(person.person_id);
    expect(profile.legacyPersonId).toBe(pid);
    if (seat) expect(profile.seats.some((s) => s.name === seat)).toBe(true);
    else expect(profile.seats).toEqual([]);
  },
);
test('deb-oneill resolves Deb’s former House spelling to Deborah’s current Senate identity', () => {
  const profile = joinPerson('deb-oneill', allSlugs, roster, people, manifest);
  const current = people.people.find(
    (p) =>
      p.legacy_person_id === '10747' && p.electorates.some((s) => s.current),
  )!;
  expect(profile.legacyPersonId).toBe('10747');
  expect(profile.canonicalPersonId).toBe(current.person_id);
  expect(profile.seats.some((s) => s.chamber === 'senate' && s.current)).toBe(
    true,
  );
});
test.each(['david-cox', 'ian-mclachlan'])(
  '%s refuses a shared ID with an unrelated first name and conflicting chamber',
  (slug) => {
    expect(() => joinPerson(slug, allSlugs, roster, people, manifest)).toThrow(
      /conflicting/,
    );
  },
);
test('cox refuses the real David Cox / Dorinda Cox roster-ID conflict', () => {
  expect(
    roster.people.filter((r) => r.pid === '10964').map((r) => r.name),
  ).toEqual(['David Cox', 'Cox', 'Dorinda Cox']);
  expect(() => joinPerson('cox', allSlugs, roster, people, manifest)).toThrow(
    /conflicting/,
  );
  expect(
    joinPerson('dorinda-cox', allSlugs, roster, people, manifest)
      .canonicalPersonId,
  ).toBe(people.people.find((p) => p.name === 'Dorinda Cox')!.person_id);
});
test('Mark Furner’s Queensland register resolves the roster-only profile when the release has no person', () => {
  for (const href of [
    '/subject/person/Mark%20Furner#person-interests',
    '/declared?person=Mark+Furner',
  ])
    expect(
      personSlugForResult(
        {
          kind: 'interest',
          title: 'Mark Furner',
          href,
          slug: 'catalog-1',
          snippet: '',
          resource: '',
        },
        allSlugs,
        catalogs.interestIndex,
        people,
      ),
    ).toBe('mark-furner');
  expect(
    joinPerson('mark-furner', allSlugs, roster, people, manifest)
      .canonicalPersonId,
  ).toBeUndefined();
});
test('opax://person/__proto__ never resolves an inherited object property', () => {
  const link = new URL('opax://person/__proto__');
  expect(() =>
    joinPerson(link.pathname.slice(1), allSlugs, roster, people, manifest),
  ).toThrow(/directory/);
  for (const slug of ['constructor', 'toString', '__proto__'])
    expect(() =>
      joinPerson(slug, allSlugs, roster, people, manifest),
    ).toThrow();
});
test('a unique legacy ID takes priority over a competing name row', () => {
  const p = people.people.find((p) => p.name === 'Anthony Albanese')!;
  const authoritative = roster.people.find(
    (r) => r.pid === p.legacy_person_id,
  )!;
  const byName = { ...authoritative, pid: undefined };
  expect(
    rosterRowFor(
      [p.name],
      { ...roster, people: [byName, authoritative] },
      p.legacy_person_id,
    ),
  ).toBe(authoritative);
  const withoutId = {
    ...authoritative,
    pid: undefined,
    party_now: undefined,
    party: 'Historical label',
  };
  const formal = { ...authoritative, name: 'Register spelling' };
  expect(
    joinPerson(
      'anthony-albanese',
      allSlugs,
      { ...roster, people: [withoutId, formal] },
      { ...people, people: [{ ...p, electorates: [] }] },
      manifest,
    ).party,
  ).toBe(formal.party_now);
});
test('Canavan’s multi-row legacy ID selects Matthew Canavan rather than the surname stub', () => {
  const p = people.people.find((p) => p.name === 'Matthew Canavan')!;
  const row = rosterRowFor([p.name], roster, p.legacy_person_id);
  expect(row?.name).toBe('Matthew Canavan');
  expect(row?.party).toBe('LNP');
  expect(
    joinPerson('matthew-canavan', allSlugs, roster, people, manifest)
      .canonicalPersonId,
  ).toBe(p.person_id);
});
test('all 85 current multi-row IDs prefer the matching full-name row independently of roster order', () => {
  const persons = people.people.filter(
    (p) =>
      p.electorates.some((s) => s.current) &&
      p.legacy_person_id &&
      roster.people.filter((r) => r.pid === p.legacy_person_id).length > 1,
  );
  expect(persons).toHaveLength(85);
  for (const p of persons) {
    const row = rosterRowFor(
      [p.name, ...p.aliases],
      roster,
      p.legacy_person_id,
    );
    const reversed = rosterRowFor(
      [p.name, ...p.aliases],
      { ...roster, people: [...roster.people].reverse() },
      p.legacy_person_id,
    );
    expect(row?.name).toContain(' ');
    expect(reversed?.name).toBe(row?.name);
  }
});
test.each([
  ['Antony Pasin', 'tony-pasin'],
  ['Patrick Conaghan', 'pat-conaghan'],
  ['Alison Brynes', 'alison-byrnes'],
  ['Robert Katter', 'bob-katter'],
  ['Rebeka Sharkie', 'rebekha-sharkie'],
  ['James Chalmers', 'jim-chalmers'],
])(
  'interest search for %s resolves the profile through register IDs or explicit index aliases',
  (name, slug) => {
    for (const href of [
      `/declared?person=${encodeURIComponent(name)}`,
      `/subject/person/${encodeURIComponent(name)}#person-interests`,
    ])
      expect(
        personSlugForResult(
          {
            kind: 'interest',
            title: name,
            href,
            slug: 'catalog-1',
            snippet: '',
            resource: '',
          },
          allSlugs,
          catalogs.interestIndex,
          people,
        ),
      ).toBe(slug);
  },
);
