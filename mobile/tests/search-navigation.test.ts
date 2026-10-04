import { router } from 'expo-router';
import { catalogs } from '../src/api/runtime';
import { nameKey, personId } from '../src/api/ids';
import { personRoute } from '../src/navigation/routes';
import { openOnWeb } from '../src/navigation/external';
import { openSuggestedPerson } from '../src/features/search/navigation';
import { roster, slugs } from './pinned';

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
  jest.clearAllMocks();
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
