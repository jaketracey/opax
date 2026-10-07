import { router } from 'expo-router';
import { catalogs } from '../src/api/runtime';
import { nameKey, personId } from '../src/api/ids';
import { ApiError, PersonIdentityError } from '../src/api/errors';
import { joinPerson } from '../src/api/person-identity';
import { personRoute } from '../src/navigation/routes';
import { openOnWeb } from '../src/navigation/external';
import {
  openSuggestedPerson,
  openSearchPerson,
} from '../src/features/search/navigation';
import { manifest, people, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: { slugs: jest.fn(), person: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/navigation/external', () => ({ openOnWeb: jest.fn() }));

const groups = new Map<string, string[]>();
for (const p of roster.people) {
  const key = nameKey(p.name);
  groups.set(key, [...(groups.get(key) ?? []), p.name]);
}
const twins = [...groups].filter(([, names]) => names.length > 1);
const id = personId('person_0123456789abcdef01234567');
beforeEach(() => {
  jest.resetAllMocks();
  jest
    .mocked(catalogs.slugs)
    .mockResolvedValue({ data: slugs } as Awaited<
      ReturnType<typeof catalogs.slugs>
    >);
  jest
    .mocked(catalogs.person)
    .mockResolvedValue({ data: { canonicalPersonId: id } } as Awaited<
      ReturnType<typeof catalogs.person>
    >);
});
test('the pinned regression set contains all 13 twins', () => {
  expect(twins).toHaveLength(13);
});
test.each(twins)(
  'either spelling of %s opens the same canonical profile',
  async (key, names) => {
    const slug = Object.entries(slugs.slugs).find(
      ([, name]) => nameKey(name) === key,
    )?.[0];
    expect(slug).toBeDefined();
    for (const name of names) {
      await openSuggestedPerson(name);
      expect(catalogs.person).toHaveBeenLastCalledWith(slug);
      expect(router.push).toHaveBeenLastCalledWith(personRoute(id));
    }
    expect(openOnWeb).not.toHaveBeenCalled();
  },
);
test('an unresolved suggestion opens the web name address', async () => {
  jest
    .mocked(catalogs.slugs)
    .mockResolvedValue({ data: { slugs: {} } } as Awaited<
      ReturnType<typeof catalogs.slugs>
    >);
  await openSuggestedPerson('Yvette D’Ath');
  expect(openOnWeb).toHaveBeenCalledWith(
    '/subject/person/Yvette%20D%E2%80%99Ath',
    'Yvette D’Ath',
  );
  expect(catalogs.person).not.toHaveBeenCalled();
});

test.each([
  ['A.J. Stoker', 'Aj Stoker', 'aj-stoker'],
  ['José Example', 'Jose Example', 'jose-example'],
])(
  'folded spelling %s resolves the directory spelling %s',
  async (name, holder, slug) => {
    jest.mocked(catalogs.slugs).mockResolvedValue({
      data: { slugs: { [slug]: holder } },
    } as Awaited<ReturnType<typeof catalogs.slugs>>);
    await openSuggestedPerson(name);
    expect(catalogs.person).toHaveBeenCalledWith(slug);
    expect(router.push).toHaveBeenCalledWith(personRoute(id));
    expect(openOnWeb).not.toHaveBeenCalled();
  },
);

test.each([
  ['mcdonald', 'McDonald'],
  ['watt', 'Watt'],
  ['david-cox', 'David Cox'],
  ['hall', 'Hall'],
  ['williams', 'Williams'],
  ['cox', 'Cox'],
  ['ian-mclachlan', 'Ian McLachlan'],
  ['garrett', 'Garrett'],
])(
  'conflicting suggestion %s opens its web name address',
  async (slug, name) => {
    expect(() => joinPerson(slug!, slugs, roster, people, manifest)).toThrow(
      PersonIdentityError,
    );
    jest.mocked(catalogs.person).mockImplementation(async (key) => ({
      data: joinPerson(key, slugs, roster, people, manifest),
      stale: false,
      savedAt: 0,
      asOf: null,
    }));
    await openSuggestedPerson(name!);
    expect(catalogs.person).toHaveBeenCalledWith(slug);
    expect(openOnWeb).toHaveBeenCalledWith(
      `/subject/person/${encodeURIComponent(name!)}`,
      name,
    );
    expect(router.push).not.toHaveBeenCalled();
  },
);
test.each(['offline', 'server', 'invalid-data'] as const)(
  'a %s catalog failure remains retryable instead of opening the web',
  async (code) => {
    const error = new ApiError(code, 'Catalog unavailable');
    jest.mocked(catalogs.person).mockRejectedValueOnce(error);
    await expect(openSuggestedPerson('Anthony Albanese')).rejects.toBe(error);
    expect(openOnWeb).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  },
);
test('a directory record disappearing during resolution opens the web name address', async () => {
  jest
    .mocked(catalogs.person)
    .mockRejectedValueOnce(new ApiError('not-found', 'Record unavailable'));
  await openSuggestedPerson('Anthony Albanese');
  expect(openOnWeb).toHaveBeenCalledWith(
    '/subject/person/Anthony%20Albanese',
    'Anthony Albanese',
  );
  expect(router.push).not.toHaveBeenCalled();
});

test('R1 Search does not promote a roster-only name into a native profile', async () => {
  const identity = joinPerson('chris-minns', slugs, roster, people, manifest);
  expect(identity.canonicalPersonId).toBeUndefined();
  jest
    .mocked(catalogs.person)
    .mockResolvedValue({ data: identity } as Awaited<
      ReturnType<typeof catalogs.person>
    >);
  await openSearchPerson(identity.slug);
  expect(router.push).not.toHaveBeenCalled();
  expect(openOnWeb).toHaveBeenCalledWith(
    `/subject/person/${identity.slug}`,
    identity.name,
  );
});

test('a private witness without a canonical member identity cannot open a native profile', async () => {
  const identity = joinPerson('chris-minns', slugs, roster, people, manifest);
  const witness = {
    ...identity,
    name: 'Private Witness',
    rosterPersonId: undefined,
  };
  jest
    .mocked(catalogs.person)
    .mockResolvedValue({ data: witness } as Awaited<
      ReturnType<typeof catalogs.person>
    >);
  await openSearchPerson(witness.slug);
  expect(router.push).not.toHaveBeenCalled();
  expect(openOnWeb).toHaveBeenCalledWith(
    `/subject/person/${witness.slug}`,
    witness.name,
  );
});
