// Reviewer differentials, retained with the frozen a5dffa06 scan-based identity oracle.
// The screen selectors/model are unchanged by this lane; isolate their imports
// so the reference side calls the old helpers without duplicating those modules.
import * as now from '../src/api/selectors';
import * as pi from '../src/api/person-identity';
import * as piBefore from './reference/person-identity-before';
import * as mp from '../src/features/your-mp/model';
import { decodeRecentInterests } from '../src/api/catalog-decoders';
import { catalogs, people, pinned, roster, slugs, manifest } from './pinned';

let before!: typeof now;
let mpBefore!: typeof mp;
jest.isolateModules(() => {
  jest.doMock('../src/api/person-identity', () => piBefore);
  before = jest.requireActual<typeof now>('../src/api/selectors');
  mpBefore = jest.requireActual<typeof mp>('../src/features/your-mp/model');
});
jest.dontMock('../src/api/person-identity');

const run = <T>(f: () => T) => {
  try {
    return { v: JSON.parse(JSON.stringify(f() ?? null)) };
  } catch (e) {
    return { e: (e as Error).message };
  }
};
const recent = decodeRecentInterests(pinned('/interests/recent.json'));
const directory = {
  slugs: { data: slugs },
  roster: { data: roster },
  people: { data: people },
  manifest: { data: manifest },
} as unknown as mp.Directory;

test('Person profileFor (and Follows markers) for every person_id', () => {
  for (const p of people.people) {
    expect(run(() => now.profileFor(p.person_id as never, catalogs))).toEqual(
      run(() => before.profileFor(p.person_id as never, catalogs)),
    );
  }
});
const abbottStatus = <T>(result: T, name: string): T => {
  if (!['Tony Abbott', 'Abbott'].includes(name)) return result;
  const value = result as { v?: { partyStatus?: string } };
  return value.v
    ? ({ ...value, v: { ...value.v, partyStatus: 'former' } } as T)
    : result;
};
test('Search searchPersonFor every slug; rosterIdentityFor every roster row', () => {
  for (const slug of Object.keys(slugs.slugs))
    expect(run(() => now.searchPersonFor(slug, catalogs))).toEqual(
      abbottStatus(
        run(() => before.searchPersonFor(slug, catalogs)),
        slugs.slugs[slug]!,
      ),
    );
  for (const row of roster.people)
    expect(run(() => now.rosterIdentityFor(row, catalogs))).toEqual(
      abbottStatus(
        run(() => before.rosterIdentityFor(row, catalogs)),
        row.name,
      ),
    );
});
test('multi-name rosterRowFor / namedRosterRow as profileFor and Your MP call them', () => {
  for (const p of people.people) {
    const names = [p.name, ...p.aliases];
    expect(
      run(() => pi.rosterRowFor(names, roster, p.legacy_person_id as never)),
    ).toEqual(
      run(() =>
        piBefore.rosterRowFor(names, roster, p.legacy_person_id as never),
      ),
    );
    expect(run(() => pi.namedRosterRow([...names].reverse(), roster))).toEqual(
      run(() => piBefore.namedRosterRow([...names].reverse(), roster)),
    );
  }
  for (const row of roster.people) {
    const names = [row.name, ...(row.full ? [row.full] : [])];
    expect(run(() => pi.rosterRowFor(names, roster, row.pid as never))).toEqual(
      run(() => piBefore.rosterRowFor(names, roster, row.pid as never)),
    );
  }
});
test('Declarations / Leads register bridges with register names', () => {
  const idx = catalogs.interestIndex!;
  const names = [
    ...new Set([
      ...recent.items.map((i) => i.name),
      ...Object.keys(idx._by_name),
      ...Object.values(idx.people).map((p) => p.name),
    ]),
  ];
  const cats = { slugs, interestIndex: idx, people, roster, manifest };
  expect(now.declarationProfilesFor(names, cats)).toEqual(
    before.declarationProfilesFor(names, cats),
  );
  expect(
    run(() =>
      now.recentDeclarationsFor(recent, recent.items.length, { roster }),
    ),
  ).toEqual(
    run(() =>
      before.recentDeclarationsFor(recent, recent.items.length, { roster }),
    ),
  );
  for (const name of names)
    for (const href of [
      `/declared?person=${encodeURIComponent(name)}`,
      `/subject/person/${encodeURIComponent(name)}`,
    ])
      for (const kind of ['interest', 'person'] as const) {
        const row = {
          slug: 'catalog-1',
          kind,
          title: name,
          snippet: '',
          resource: '',
          href,
        };
        expect(pi.personSlugForResult(row, slugs, idx, people)).toBe(
          piBefore.personSlugForResult(row, slugs, idx, people),
        );
      }
});
test('Your MP representativeProfile / hasParliamentaryMembership for every person', () => {
  for (const p of people.people) {
    const a = run(() => mp.representativeProfile(p.person_id, directory));
    expect(a).toEqual(
      run(() => mpBefore.representativeProfile(p.person_id, directory)),
    );
    const prof = mp.representativeProfile(p.person_id, directory);
    if (prof)
      expect(mp.hasParliamentaryMembership(prof, directory)).toBe(
        mpBefore.hasParliamentaryMembership(prof, directory),
      );
  }
});
