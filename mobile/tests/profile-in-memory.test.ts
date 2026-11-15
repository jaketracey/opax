import { Catalogs } from '../src/api/catalogs';
import { manifest, pinned, slugs } from './pinned';

// The profile page sizes its placeholder from what is already in memory, so
// the header it draws after its own read lands where the placeholder stood.
const PAGE =
  'https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=00AOU';
const fixture = () =>
  new Catalogs({
    get: async (path, decode) => {
      const data = decode(path === '/api/person-slugs' ? slugs : pinned(path));
      const rows = (data as { people?: { name?: string }[] }).people;
      return {
        // The release names each sitting member's own page.
        data:
          path === manifest.people_url && Array.isArray(rows)
            ? ({
                ...data,
                people: rows.map((row) =>
                  row.name === 'Penny Wong'
                    ? { ...row, source_url: PAGE }
                    : row,
                ),
              } as typeof data)
            : data,
        stale: false,
        savedAt: 1000,
        asOf: null,
      };
    },
  });

test('nothing in memory: no profile, and never a read', () => {
  const get = jest.fn();
  expect(new Catalogs({ get }).profileInMemory('penny-wong')).toBeNull();
  expect(get).not.toHaveBeenCalled();
});

test('the directory in memory gives the same identity the profile read gives; pay adds the post', async () => {
  const catalogs = fixture();
  await catalogs.directory();
  const identity = (await catalogs.person('penny-wong')).data;
  const before = catalogs.profileInMemory('penny-wong');
  expect(before?.profile.blocks.identity.data).toEqual(identity);
  expect(before?.payKnown).toBe(false);
  expect(before?.profile.blocks.pay.data).toBeNull();
  expect(before?.sourceUrl).toBe(PAGE);
  // The pay catalog, read by a profile or kept by Today's preload.
  const pay = (await catalogs.pay()).data;
  const after = catalogs.profileInMemory('penny-wong');
  expect(after?.payKnown).toBe(true);
  const full = await catalogs.profileFor(identity.canonicalPersonId!);
  expect(after?.profile.blocks.pay.data?.person.now).toEqual(
    full.blocks.pay.data?.person.now,
  );
  const kept = fixture();
  await kept.directory();
  kept.keepPay(pay);
  expect(kept.profileInMemory('penny-wong')?.payKnown).toBe(true);
  // A name the directory does not hold is no profile, not an error.
  expect(catalogs.profileInMemory('nobody-at-all')).toBeNull();
});
