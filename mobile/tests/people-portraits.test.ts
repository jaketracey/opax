import { PeoplePortraits } from '../src/api/people-portraits';
import { joinPerson } from '../src/api/person-identity';
import type { Catalogs } from '../src/api/catalogs';
import type { PortraitCache } from '../src/api/portrait-cache';
import { catalogs } from './pinned';
function canonicalID(slug: string) {
  return joinPerson(
    slug,
    catalogs.slugs,
    catalogs.roster,
    catalogs.people,
    catalogs.manifest,
  ).canonicalPersonId!;
}
function service() {
  const record = (data: unknown) => ({ data });
  const source = {
    directory: jest.fn(async () => ({
      roster: record(catalogs.roster),
      slugs: record(catalogs.slugs),
      people: record(catalogs.people),
      manifest: record(catalogs.manifest),
    })),
    photoPeople: jest.fn(async () => record(catalogs.photoPeople)),
    photoCredits: jest.fn(async () => record(catalogs.photoCredits)),
  };
  const cache = {
    get: jest.fn(async (key: string) => `file:///cache/${key}.webp`),
  };
  return {
    reader: new PeoplePortraits(
      source as unknown as Catalogs,
      cache as unknown as PortraitCache,
    ),
    source,
    cache,
  };
}
test('portrait service resolves the same canonical route IDs and directory slugs as profiles', async () => {
  const { reader, source, cache } = service();
  for (const [slug, key] of [
    ['julia-gillard', '10257'],
    ['anthony-albanese', '10007'],
    ['penny-wong', '10678'],
    ['sheena-watt', 'wd-Q100327610'],
  ]) {
    const id = canonicalID(slug!);
    const [bySlug, byID] = await Promise.all([
      reader.get({ slug }),
      reader.get({ slug: id }),
    ]);
    expect(bySlug?.info.key).toBe(key);
    expect(byID).toEqual(bySlug);
    expect(byID?.localURI).toBe(`file:///cache/${key}.webp`);
  }
  expect(source.directory).toHaveBeenCalledTimes(4);
  expect(source.photoPeople).toHaveBeenCalledTimes(4);
  expect(source.photoCredits).toHaveBeenCalledTimes(4);
  expect(cache.get).toHaveBeenCalledTimes(8);
});
test('unknown canonical IDs and withheld shared faces never reach the image cache', async () => {
  const { reader, cache } = service();
  expect(
    await reader.get({ slug: 'person_unknown', name: 'Julia Gillard' }),
  ).toBeNull();
  for (const slug of ['anna-burke', 'tony-burke', 'scott-buchholz']) {
    expect(await reader.get({ slug })).toBeNull();
    expect(
      await reader.get({
        slug: canonicalID(slug),
      }),
    ).toBeNull();
  }
  expect(cache.get).not.toHaveBeenCalled();
});

test('a refreshed portrait map and credits replace the saved index, including a removed photo', async () => {
  const { reader, source, cache } = service();
  const original = await reader.get({ slug: 'sheena-watt' });
  expect(original?.info.key).toBe('wd-Q100327610');
  source.photoCredits.mockResolvedValue({
    data: {
      ...catalogs.photoCredits!,
      'wd-Q100327610': {
        ...catalogs.photoCredits!['wd-Q100327610']!,
        artist: 'Updated attribution',
      },
    },
  });
  expect(
    (await reader.get({ slug: 'sheena-watt', refresh: true }))?.info.credit,
  ).toContain('Updated attribution');
  const { ['sheena watt']: _removed, ...remaining } = catalogs.photoPeople!;
  source.photoPeople.mockResolvedValue({ data: remaining });
  expect(await reader.get({ slug: 'sheena-watt' })).toBeNull();
  expect(cache.get).toHaveBeenCalledTimes(2);
  expect(source.directory).toHaveBeenLastCalledWith(false);
  expect(source.photoCredits).toHaveBeenCalledWith(true);
});
test('a refreshed directory spelling is checked again before the ID fallback', async () => {
  const { reader, source } = service();
  expect((await reader.get({ slug: 'jess-walsh' }))?.info.key).toBe('10956');
  const directory = await source.directory();
  source.directory.mockResolvedValue({
    ...directory,
    slugs: {
      data: {
        ...catalogs.slugs,
        slugs: { ...catalogs.slugs.slugs, 'jess-walsh': 'Walsh' },
      },
    },
  });
  expect(await reader.get({ slug: 'jess-walsh' })).toBeNull();
});
test('surname routes and name-only lookups never fall through to the canonical full-name image', async () => {
  const { reader, cache } = service();
  expect(await reader.get({ slug: 'walsh', name: 'Jess Walsh' })).toBeNull();
  expect(await reader.get({ name: 'Walsh' })).toBeNull();
  expect(cache.get).not.toHaveBeenCalled();
  expect((await reader.get({ slug: 'jess-walsh' }))?.info.key).toBe('10956');
});
