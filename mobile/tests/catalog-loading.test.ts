import {
  Catalogs,
  personId,
  type BillIndex,
  type RecentInterests,
} from '../src/api/catalogs';
import type { ApiClient, RecordResult } from '../src/api/client';
import { dataAsOf } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { assertAllowedPath } from '../src/api/policy';
import { catalogs as data, pinned, slugs } from './pinned';
const id = personId('person_2b850aa643795ce8902f754b');
function loader(fail: string[] = [], stale: string[] = []) {
  const calls: string[] = [];
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (input: unknown) => T,
    ): Promise<RecordResult<T>> {
      assertAllowedPath(path);
      calls.push(path);
      if (fail.includes(path))
        throw new ApiError('offline', 'This block is offline.');
      const raw = path === '/api/person-slugs' ? slugs : pinned(path);
      return {
        data: decode(raw),
        asOf: dataAsOf(raw),
        stale: stale.includes(path),
        savedAt: path === '/pay.json' ? 100 : 200,
      };
    },
  };
  return { catalogs: new Catalogs(client), calls };
}
test('full profile API loads only reviewed paths and retains independent cache/source dates', async () => {
  const { catalogs, calls } = loader([], ['/pay.json']);
  const profile = await catalogs.profileFor(id);
  expect(profile.blocks.pay.stale).toBe(true);
  expect(profile.blocks.pay.savedAt).toBe(100);
  expect(profile.blocks.pay.asAt).toBe(data.pay!.meta.as_of);
  expect(profile.blocks.votes.stale).toBe(false);
  expect(profile.blocks.votes.asAt).toBeNull();
  expect(profile.blocks.interests.data?.name).toBe('Anthony Albanese');
  expect(calls).toContain('/interests/10007.json');
  expect(calls).not.toContain('/graph/money.json');
  expect(calls).not.toContain('/interests/ties-by-donor.json');
  expect(
    calls.every(
      (path) =>
        !path.includes('/api/search') &&
        !path.includes('/api/brief') &&
        !path.includes('/og/'),
    ),
  ).toBe(true);
});
test('Your MP defers the member register file until its disclosure is opened', async () => {
  const { catalogs, calls } = loader();
  const preview = await catalogs.profileFor(id, { includeInterests: false });
  expect(preview.blocks.votes.status).toBe('ready');
  expect(preview.interestKey).toBe('10007');
  expect(calls).not.toContain('/interests/10007.json');
  expect(
    calls.filter((path) => /^\/interests\/[^/]+\.json$/.test(path)),
  ).toEqual(['/interests/index.json']);
  const opened = await catalogs.profileFor(id, { includeInterests: true });
  expect(opened.blocks.interests.data?.name).toBe('Anthony Albanese');
  expect(calls).toContain('/interests/10007.json');
});
test.each([
  '/votes.json',
  '/pay.json',
  '/expenses.json',
  '/interests/10007.json',
  '/photos/credits.json',
])(
  'one failed optional source keeps other profile blocks readable: %s',
  async (path) => {
    const { catalogs } = loader([path]);
    const profile = await catalogs.profileFor(id);
    expect(profile.blocks.identity.status).toBe('ready');
    const affected: Record<string, string> = {
      '/votes.json': 'votes',
      '/pay.json': 'pay',
      '/expenses.json': 'expenses',
      '/interests/10007.json': 'interests',
      '/photos/credits.json': 'portrait',
    };
    expect(
      Object.entries(profile.blocks).find(([key]) => key === affected[path])![1]
        .status,
    ).toBe('error');
  },
);
test('Today retains declarations when the bill source fails', async () => {
  const { catalogs } = loader(['/bills/index.json']);
  const today = await catalogs.today();
  expect(today.bills.status).toBe('error');
  expect(today.declarations.status).toBe('ready');
});
test('source dates remain separate from local save times, including votes _meta', () => {
  expect(dataAsOf(pinned('/votes.json'))).toBeNull();
  expect(dataAsOf({ _meta: { content_changed_at: '2026-09-04' } })).toBe(
    '2026-09-04',
  );
  expect(dataAsOf(pinned('/corpus.json'))).toBe('2026-10-02T18:21:42+00:00');
});
test('raw catalog adapters keep complete index and declaration files', async () => {
  const { catalogs } = loader();
  const bills: BillIndex = (await catalogs.bills()).data;
  const recent: RecentInterests = (await catalogs.recentInterests()).data;
  expect(bills.bills).toHaveLength(2989);
  expect(recent.items).toHaveLength(300);
});

test('typing suggestions reuses one source snapshot until explicit refresh', async () => {
  const { catalogs, calls } = loader();
  await catalogs.suggestionSources();
  const count = calls.length;
  expect((await catalogs.suggestions('Albanese')).people[0]?.name).toBe(
    'Anthony Albanese',
  );
  await catalogs.suggestions('Albanes');
  expect(calls).toHaveLength(count);
  await catalogs.suggestionSources(true);
  expect(calls.length).toBeGreaterThan(count);
});
test('bill, electorate and About blocks retain actual cache state', async () => {
  const seatPath =
    '/electorates/releases/b56417062ccc33cf/el_5d600e7f6dca5b72ae04d686.json';
  const { catalogs } = loader(
    [],
    ['/bills/au-federal-r7534.json', seatPath, '/corpus.json'],
  );
  const bill = await catalogs.billFor('au-federal-r7534');
  expect(bill.data.summary.stale).toBe(true);
  expect(bill.data.summary.savedAt).toBe(200);
  const seat = await catalogs.electorateFor(seatPath);
  expect(seat.data.representatives.stale).toBe(true);
  expect(seat.data.elections[0]?.savedAt).toBe(200);
  expect((await catalogs.about()).data.stale).toBe(true);
});
test('Your MP and bill list blocks preserve stale release/index states', async () => {
  const { catalogs } = loader(
    [],
    [data.manifest.index_url, '/bills/index.json'],
  );
  const home = await catalogs.yourMP('el_5d600e7f6dca5b72ae04d686');
  expect(home.members.stale).toBe(true);
  expect(home.senators[0]?.stale).toBe(true);
  expect((await catalogs.billsFor()).data.stale).toBe(true);
});
test('a failed bill index keeps votes ready with totals and unknown bill links', async () => {
  const { catalogs } = loader(['/bills/index.json']);
  const view = await catalogs.profileFor(id);
  expect(view.blocks.votes.status).toBe('ready');
  expect(view.blocks.votes.data?.total).toBeGreaterThan(0);
  expect(view.blocks.votes.data?.for.every((r) => r.billKey === null)).toBe(
    true,
  );
});
test.each(['/interests/index.json', '/interests/10007.json'])(
  'ties report an error when their required register source fails: %s',
  async (path) => {
    const { catalogs } = loader([path]);
    const view = await catalogs.profileFor(id);
    expect(view.blocks.interests.status).toBe('error');
    expect(view.blocks.ties.status).toBe('error');
    expect(view.blocks.ties.data).toBeNull();
    expect(view.blocks.ties.error?.code).toBe('offline');
    expect(view.blocks.votes.status).toBe('ready');
  },
);
test('an absent register is missing; a failed votes source is error', async () => {
  const { catalogs } = loader(['/votes.json']);
  const person = data.people.people.find((p) => p.name === "Danny O'Brien")!;
  const view = await catalogs.profileFor(person.person_id);
  expect(view.blocks.interests.status).toBe('missing');
  expect(view.blocks.ties.status).toBe('missing');
  expect(view.blocks.votes.status).toBe('error');
  expect(view.blocks.votes.data).toBeNull();
});
test('a failed unused donor index or money graph does not affect profiles', async () => {
  const { catalogs, calls } = loader([
    '/interests/ties-by-donor.json',
    '/graph/money.json',
  ]);
  const person = data.people.people.find((p) => p.name === 'Jo Briskey')!;
  const view = await catalogs.profileFor(person.person_id);
  expect(view.blocks.partyReceipts.status).toBe('ready');
  expect(view.blocks.ties.status).toBe('ready');
  expect(calls).not.toContain('/interests/ties-by-donor.json');
  expect(calls).not.toContain('/graph/money.json');
});
test('interest search adapter loads the ID bridge and retains its cache state', async () => {
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (input: unknown) => T,
    ): Promise<RecordResult<T>> {
      const raw = path.startsWith('/api/search-all?')
        ? {
            query: 'Pasin',
            kind: 'interest',
            total: 1,
            page: 1,
            per_page: 20,
            warnings: [],
            results: [
              {
                kind: 'interest',
                title: 'Antony Pasin',
                href: '/subject/person/Antony%20Pasin#person-interests',
                slug: 'catalog-1',
                snippet: '',
                resource: '',
              },
            ],
          }
        : path === '/api/person-slugs'
          ? slugs
          : pinned(path);
      return {
        data: decode(raw),
        stale: path === '/interests/index.json',
        asOf: null,
        savedAt: 100,
      };
    },
  };
  const result = await new Catalogs(client).search('Pasin', 'interest');
  expect(result.data.results[0]?.personSlug).toBe('tony-pasin');
  expect(result.stale).toBe(true);
});

test('canonical person ID handoff resolves the existing native profile', async () => {
  const { catalogs } = loader();
  const person = (await catalogs.person(id)).data;
  expect(person.canonicalPersonId).toBe(id);
  expect(person.slug).toBe('anthony-albanese');
  await expect(
    catalogs.person('person_000000000000000000000000'),
  ).rejects.toMatchObject({ code: 'not-found' });
});
test('suggestion provenance keeps the stale group and source dates separate', async () => {
  const { catalogs } = loader([], ['/bills/index.json']);
  const sources = await catalogs.suggestionSources();
  expect(sources.provenance.bills.stale).toBe(true);
  expect(sources.provenance.people.stale).toBe(false);
  expect(sources.provenance.bills.asAt).toBe(data.bills!.generated_at);
  expect(sources.provenance.bills.savedAt).toBe(200);
});
test('explicit suggestion, Today and coverage refreshes revalidate fresh cache entries', async () => {
  const forced: string[] = [];
  const { catalogs: underlying } = loader();
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (input: unknown) => T,
      force = false,
    ): Promise<RecordResult<T>> {
      if (force) forced.push(path);
      const raw = path === '/api/person-slugs' ? slugs : pinned(path);
      return {
        data: decode(raw),
        stale: false,
        savedAt: 200,
        asOf: dataAsOf(raw),
      };
    },
  };
  const catalogs = new Catalogs(client);
  await underlying.suggestionSources();
  await catalogs.suggestionSources(true);
  await catalogs.today(6, true);
  await catalogs.about(true);
  expect(forced).toEqual([
    '/electorates/manifest.json',
    '/parliamentarians.json',
    '/bills/index.json',
    data.manifest.index_url,
    '/parliamentarians.json',
    '/photos/people.json',
    '/photos/credits.json',
    '/bills/index.json',
    '/interests/recent.json',
    '/corpus.json',
  ]);
});

test.each([
  '/parliamentarians.json',
  '/photos/people.json',
  '/photos/credits.json',
])(
  'Today keeps declarations and bills readable when optional metadata fails: %s',
  async (path) => {
    const { catalogs } = loader([path]);
    const today = await catalogs.today();
    expect(today.bills.status).toBe('ready');
    expect(today.declarations.status).toBe('ready');
    expect(today.declarations.data).toHaveLength(6);
    if (path === '/parliamentarians.json')
      expect(today.declarations.data?.every((d) => d.party === null)).toBe(
        true,
      );
    else
      expect(today.declarations.data?.every((d) => d.portrait === null)).toBe(
        true,
      );
  },
);
test('Today propagates optional metadata cache state without changing the declaration date', async () => {
  const { catalogs } = loader([], ['/parliamentarians.json']);
  const today = await catalogs.today();
  expect(today.declarations.stale).toBe(true);
  expect(today.declarations.asAt).toBe(
    (pinned('/interests/recent.json') as { meta: { generated: string } }).meta
      .generated,
  );
});
