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
  expect(source.directory).toHaveBeenCalledTimes(1);
  expect(source.photoPeople).toHaveBeenCalledTimes(1);
  expect(source.photoCredits).toHaveBeenCalledTimes(1);
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
