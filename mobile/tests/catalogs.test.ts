import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decodeManifest,
  decodePeople,
  decodeRoster,
  joinPerson,
  personSlugForResult,
  type Slugs,
} from '../src/api/catalogs';
import { fromWebPath } from '../src/navigation/routes';
const publicJSON = (path: string) =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, '../../portal/public', path.replace(/^\//, '')),
      'utf8',
    ),
  );
const manifest = decodeManifest(publicJSON('electorates/manifest.json'));
const people = decodePeople(publicJSON(manifest.people_url));
const roster = decodeRoster(publicJSON('parliamentarians.json'));
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
      { ...people, people: [person, { ...person, person_id: 'ambiguous' }] },
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
