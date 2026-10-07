import { joinPerson } from '../src/api/person-identity';
import * as partyTransforms from '../src/api/party-page';
import {
  Catalogs,
  decodeAecExtras,
  decodeBill,
  decodeMoney,
} from '../src/api/catalogs';
import {
  partyDivisions,
  partyLabels,
  partyMembers,
  partyMoney,
  recentPartyBills,
  resolveParty,
} from '../src/api/party-page';
import { partyRoute, billRoute } from '../src/navigation/routes';
import { isPartyLabel, partySlug, samePartyLabel } from '../src/design/party';
import { nameKey } from '../src/api/ids';
import {
  catalogs,
  files,
  manifest,
  people,
  pinned,
  replaceAt,
  roster,
  slugs,
} from './pinned';
const graph = decodeMoney(pinned('/graph/money.json'));
const extras = decodeAecExtras(pinned('/graph/aec-extras.json'));
const labels = partyLabels(roster, people, graph);
const members = partyMembers('Labor', roster, people, slugs, manifest);

test('party resolution uses only recorded identities and derived slugs, never prefix matches', () => {
  for (const name of ['Labor', 'ALP', 'Australian Labor Party', 'labor'])
    expect(resolveParty(name, labels)).toBe('Labor');
  expect(resolveParty('liberal-democrats', labels)).not.toBe('Liberal');
  expect(resolveParty('Lab', labels)).toBeNull();
  expect(resolveParty('opax-fixture-unresolved', labels)).toBeNull();
  expect(resolveParty('', labels)).toBeNull();
  expect(
    resolveParty('fixture-party', ['Fixture Party', 'Fixture-Party']),
  ).toBeNull();
  expect(
    resolveParty('Fixture Party', ['Fixture Party', 'Fixture-Party']),
  ).toBe('Fixture Party');
  expect(partyRoute('Labor')).toEqual({
    pathname: '/party/[slug]',
    params: { slug: 'labor', name: 'Labor' },
  });
  expect(partySlug("Katter's Australian Party")).toBe(
    'katter-s-australian-party',
  );
});
test.each([
  'Independent',
  'IND',
  'Independents',
  'Independent (formerly Labor)',
  'Independent Liberal',
  'Unaligned',
  'Non-aligned',
  'Non aligned',
  'Non–aligned',
  'Unaffiliated',
  'Non-party',
  'PRES',
  'SPK',
  'Party not recorded',
])('%s remains an affiliation or role, never a party identity', (label) => {
  expect(isPartyLabel(label)).toBe(false);
  expect(resolveParty(label, [...labels, label])).toBeNull();
  expect(resolveParty(partySlug(label), [...labels, label])).toBeNull();
});
test('the party catalog omits non-party labels while preserving unknown recorded parties', () => {
  expect(labels.some((label) => !isPartyLabel(label))).toBe(false);
  expect(resolveParty('fixture-party', ['Fixture Party'])).toBe(
    'Fixture Party',
  );
});
test('current members have matching current party evidence; unknowns are separately recorded', () => {
  expect(members.current.some((m) => m.slug === 'anthony-albanese')).toBe(true);
  expect(members.current.some((m) => m.slug === 'penny-wong')).toBe(true);
  expect(members.current.some((m) => m.slug === 'kevin-rudd')).toBe(false);
  expect(new Set(members.current.map((m) => m.slug)).size).toBe(
    members.currentCount,
  );
  for (const m of members.current) {
    const profile = joinPerson(m.slug, slugs, roster, people, manifest);
    expect(
      profile.seats.some(
        (seat) =>
          seat.current && seat.party && samePartyLabel(seat.party, 'Labor'),
      ) ||
        (profile.rosterRow?.current === true &&
          !!profile.rosterRow.party_now &&
          samePartyLabel(profile.rosterRow.party_now, 'Labor')),
    ).toBe(true);
    expect(slugs.slugs[m.slug]).toBe(m.name);
    expect(m.asAt).not.toBeNull();
  }
  for (const m of members.recorded) {
    const profile = joinPerson(m.slug, slugs, roster, people, manifest);
    expect(profile.partyStatus).toBe('unknown');
  }
});
test('undated or ended evidence never turns a real public member into a current member', () => {
  const ended = {
    ...people,
    people: people.people.map((p) => ({
      ...p,
      electorates: p.electorates.map((s) => ({ ...s, current: false })),
    })),
  };
  const undated = {
    ...roster,
    people: roster.people.map((r) => ({
      ...r,
      current: undefined,
      party_now: undefined,
    })),
  };
  expect(
    partyMembers('Labor', undated, ended, slugs, manifest).current,
  ).toHaveLength(0);
});
test('recorded Labor affiliations exclude the review Bailey, Horne, Richards and Theophanous duplicates', () => {
  expect(members.currentCount).toBe(192);
  for (const name of ['Bailey', 'Horne', 'Richards', 'Theophanous'])
    expect(members.recorded.some((m) => m.name === name)).toBe(false);
  expect(members.recorded.filter((m) => m.name === 'MC Bailey')).toHaveLength(
    0,
  );
  for (const [name, place] of [
    ['Melissa Horne', 'Williamstown'],
    ['Pauline Richards', 'Cranbourne'],
    ['Kat Theophanous', 'Northcote'],
  ]) {
    const rows = members.current.filter((m) => m.name === name);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      jurisdiction: 'vic',
      chamber: 'vic_la',
      place,
    });
    expect(members.recorded.some((m) => m.name === name)).toBe(false);
  }
  // A separate historical name still needs a verified native profile.
  expect(members.recorded.some((m) => m.name === 'Andrew Theophanous')).toBe(
    false,
  );
});
test('recorded affiliations require full names and exclude every current person and seat', () => {
  const currentNames = new Set(
    people.people
      .filter((p) => p.electorates.some((s) => s.current))
      .flatMap((p) => [p.name, ...p.aliases])
      .map(nameKey),
  );
  const seats = people.people.flatMap((p) =>
    p.electorates.filter((s) => s.current),
  );
  const held = (rep: {
    jurisdiction: string;
    chamber: string;
    electorate?: string | null;
  }) =>
    seats.some(
      (seat) =>
        seat.jurisdiction === rep.jurisdiction &&
        seat.chamber === rep.chamber &&
        nameKey(seat.name) === nameKey(rep.electorate ?? ''),
    );
  for (const member of members.recorded) {
    expect(member.name.trim()).toMatch(/\S+\s+\S+/);
    expect(currentNames.has(nameKey(member.name))).toBe(false);
    const profile = joinPerson(member.slug, slugs, roster, people, manifest);
    const reps = profile.rosterRow?.representation ?? [];
    // Some parliament and chamber the person sat in has no current holder
    // of their seat on record.
    if (reps.length)
      expect(
        reps.some(
          (rep) =>
            !reps.some(
              (other) =>
                other.jurisdiction === rep.jurisdiction &&
                other.chamber === rep.chamber &&
                held(other),
            ),
        ),
      ).toBe(true);
    // Undated roster representation cannot assign a state person to a
    // federal electorate, even when the upstream roster mixes those fields.
    expect(member).toMatchObject({ jurisdiction: '', chamber: '', place: '' });
  }
  // A full-name recorded row can also overlap a current seat; the surname
  // guard alone must not be the reason it disappears.
  const recordedShorten = joinPerson(
    'bill-shorten',
    slugs,
    roster,
    people,
    manifest,
  );
  expect(recordedShorten.partyStatus).toBe('unknown');
  expect(recordedShorten.rosterRow?.representation?.some(held)).toBe(true);
  expect(members.recorded.some((m) => m.slug === 'bill-shorten')).toBe(false);
});
test('a seat held by someone else rules out only its own parliament and chamber', () => {
  // Janelle Saffin, the sitting Labor MLA for Lismore: her former federal
  // seat, Page, is Kevin Hogan's, and NSW seats carry no dated data.
  const saffin = joinPerson('janelle-saffin', slugs, roster, people, manifest);
  expect(saffin.partyStatus).toBe('unknown');
  const reps = saffin.rosterRow?.representation ?? [];
  expect(reps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        jurisdiction: 'federal',
        chamber: 'representatives',
        electorate: 'Page',
      }),
      expect.objectContaining({
        jurisdiction: 'nsw',
        chamber: 'nsw_la',
        electorate: 'Lismore',
      }),
    ]),
  );
  const page = people.people.filter((p) =>
    p.electorates.some(
      (s) =>
        s.current &&
        s.jurisdiction === 'federal' &&
        s.chamber === 'representatives' &&
        s.name === 'Page',
    ),
  );
  expect(page.map((p) => p.name)).toEqual(['Kevin Hogan']);
  const rows = members.recorded.filter((m) => m.slug === 'janelle-saffin');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ jurisdiction: '', chamber: '', place: '' });
  expect(members.current.some((m) => m.slug === 'janelle-saffin')).toBe(false);
  // One house, held by someone else: still ruled out.
  expect(members.recorded.some((m) => m.slug === 'bill-shorten')).toBe(false);
});
test('Labor total is pinned independently at JSON pointer /nodes/0/total, never the displayed donor sum', () => {
  const raw = pinned('/graph/money.json') as {
    nodes: { id: string; total: number }[];
  };
  const pointer = '/nodes/0/total';
  const value = pointer
    .split('/')
    .slice(1)
    .reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], raw);
  expect(raw.nodes[0]!.id).toBe('party:Labor');
  const receipts = partyMoney('ALP', graph)!;
  expect(receipts.node.total).toBe(value);
  expect(receipts.node.total).toBe(1120198704);
  expect(receipts.rank).toBe(1);
  expect(receipts.parties).toBe(11);
  expect(receipts.donors.reduce((sum, d) => sum + d.amount, 0)).toBeLessThan(
    receipts.node.total,
  );
  for (const year of receipts.byYear)
    for (const donor of year.donors) {
      const sourceAmount = graph.edges
        .filter((e) => e.source === donor.id && e.target === receipts.node.id)
        .reduce((sum, e) => sum + (e.byYear[year.year]?.[0] ?? 0), 0);
      expect(donor.amount).toBe(sourceAmount);
    }
});
test('associated entities keep their own return years and figures, without adding them to receipts', () => {
  expect(extras.parties.Labor?.associated_entities?.[0]).toEqual({
    name: 'Canberra Labor Club Limited',
    year: '2024-25',
    receipts: 110323482,
    payments: 109433010,
    debts: 30388310,
  });
});
test('recent division scan follows the web caps and has every first 32 source file pinned', () => {
  const candidates = recentPartyBills(catalogs.bills!);
  expect(candidates).toHaveLength(96);
  const details = candidates.slice(0, 32).map((b) => {
    expect(files[`/bills/${b.key}.json`]).toBeTruthy();
    return decodeBill(pinned(`/bills/${b.key}.json`));
  });
  const rows = partyDivisions('Labor', details);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]?.billKey).toBe('au-federal-r7501');
  const keys = rows.map(
    (r) =>
      `${r.billKey}|${r.division.date}|${r.division.stage}|${r.division.ayes}|${r.division.noes}`,
  );
  expect(new Set(keys).size).toBe(keys.length);
  for (const row of rows)
    expect(
      Object.entries(row.division.party_splits).find(([p]) =>
        samePartyLabel(p, 'Labor'),
      )?.[1],
    ).toEqual({ ayes: row.ayes, noes: row.noes });
  expect(billRoute(rows[0]!.billKey, 'divisions').params.section).toBe(
    'divisions',
  );
});
const get = async <T>(path: string, decoder: (v: unknown) => T) => ({
  data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
  stale: false,
  savedAt: 1000,
  asOf: null,
});
test('loader reads only static fixture catalogs and projects independent dated blocks', async () => {
  const spy = jest.fn(get);
  const view = (
    await new Catalogs({ get: spy as typeof get }).partyPage('labor')
  ).data!;
  expect(view.label).toBe('Labor');
  expect(view.members.data?.currentCount).toBe(members.currentCount);
  expect(view.receipts.asAt).toBe('2026-09-21');
  expect(view.associated.asAt).toBe('2026-09-02');
  expect(view.divisions.data?.scanned).toBe(32);
  expect(view.divisions.data?.failed).toBe(0);
  expect(
    spy.mock.calls
      .map(([p]) => p)
      .every((p) => p === '/api/person-slugs' || !p.startsWith('/api/')),
  ).toBe(true);
});
test('a money read failure keeps member and division blocks and never fabricates zero receipts', async () => {
  const api = new Catalogs({
    get: async (path, decoder) => {
      if (path === '/graph/money.json') throw new Error('fixture unavailable');
      return get(path, decoder);
    },
  });
  const view = (await api.partyPage('Labor')).data!;
  expect(view.receipts.status).toBe('error');
  expect(view.receipts.data).toBeNull();
  expect(view.members.status).toBe('ready');
  expect(view.divisions.status).toBe('ready');
});
test('a partially failed batch never exceeds 32 readable bill files', async () => {
  const api = new Catalogs({ get });
  const bills = recentPartyBills(catalogs.bills!).slice(0, 32);
  // Repeat pinned records to exercise a later successful batch without
  // introducing any new political facts or fixture requests.
  jest.spyOn(api, 'bills').mockResolvedValue({
    data: { ...catalogs.bills!, bills: [...bills, ...bills] },
    stale: false,
    savedAt: 1000,
    asOf: null,
  });
  jest
    .spyOn(api, 'bill')
    .mockRejectedValueOnce(new Error('fixture unavailable'));
  const view = (await api.partyPage('Labor')).data!;
  expect(view.divisions.data?.scanned).toBe(32);
  expect(view.divisions.data?.failed).toBe(1);
});
test('unresolvable input remains an authoritative absence for the web fallback', async () => {
  expect(
    (await new Catalogs({ get }).partyPage('opax-fixture-unresolved')).data,
  ).toBeNull();
});

test('member catalog failure keeps a money-resolved party and division block readable', async () => {
  const api = new Catalogs({
    get: async (path, decoder) => {
      if (path === '/parliamentarians.json')
        throw new Error('fixture unavailable');
      return get(path, decoder);
    },
  });
  const view = (await api.partyPage('Labor')).data!;
  expect(view.members.status).toBe('error');
  expect(view.receipts.status).toBe('ready');
  expect(view.divisions.status).toBe('ready');
});

test('member source links come from included people, with no unrelated geometry or Census sources', () => {
  expect(members.sources.length).toBeGreaterThan(0);
  expect(
    members.sources.every(
      (source) =>
        !/boundaries|Census|tcp votes|primary votes/i.test(source.label),
    ),
  ).toBe(true);
});

test('publishes title and first block while independent optional catalogs are pending', async () => {
  let releaseMoney!: () => void;
  let releaseEntities!: () => void;
  let releaseVotes!: () => void;
  const money = new Promise<void>((resolve) => {
    releaseMoney = resolve;
  });
  const entities = new Promise<void>((resolve) => {
    releaseEntities = resolve;
  });
  const votes = new Promise<void>((resolve) => {
    releaseVotes = resolve;
  });
  const reads: { path: string; refresh: boolean }[] = [];
  const api = new Catalogs({
    get: async (path, decoder, refresh = false) => {
      reads.push({ path, refresh });
      if (path === '/graph/money.json') await money;
      if (path === '/graph/aec-extras.json') await entities;
      if (path === '/bills/index.json') await votes;
      return get(path, decoder);
    },
  });
  let first!: () => void;
  let receipts!: () => void;
  const firstPublished = new Promise<void>((resolve) => {
    first = resolve;
  });
  const receiptsPublished = new Promise<void>((resolve) => {
    receipts = resolve;
  });
  const updates: import('../src/api/catalogs').PartyPageRecord[] = [];
  const pending = api.partyPage('Labor', false, (record) => {
    updates.push(record);
    first();
    if (record.data?.receipts.status === 'ready') receipts();
  });
  await firstPublished;
  expect(updates[0]!.data?.label).toBe('Labor');
  expect(updates[0]!.data?.members.data).toEqual(members);
  for (const block of ['receipts', 'associated', 'divisions'] as const)
    expect(updates[0]!.data?.[block].status).toBe('loading');
  releaseMoney();
  await receiptsPublished;
  expect(updates.at(-1)!.data?.associated.status).toBe('loading');
  expect(updates.at(-1)!.data?.divisions.status).toBe('loading');
  releaseEntities();
  releaseVotes();
  const final = await pending;
  expect(final.data?.divisions.status).toBe('ready');
  expect(reads.every((r) => !r.refresh)).toBe(true);
});

test('refresh publishes no partial record while optional catalogs are pending and forces all reads', async () => {
  let release!: () => void;
  let started!: () => void;
  const optional = new Promise<void>((resolve) => {
    release = resolve;
  });
  const optionalStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const reads: { path: string; refresh: boolean }[] = [];
  const api = new Catalogs({
    get: async (path, decoder, refresh = false) => {
      reads.push({ path, refresh });
      if (path === '/bills/index.json') {
        started();
        await optional;
      }
      return get(path, decoder);
    },
  });
  const publish = jest.fn();
  const pending = api.partyPage('Labor', true, publish);
  await optionalStarted;
  expect(publish).not.toHaveBeenCalled();
  release();
  const final = await pending;
  expect(publish).not.toHaveBeenCalled();
  for (const block of ['receipts', 'associated', 'divisions'] as const)
    expect(final.data?.[block].status).toBe('ready');
  expect(
    reads.some(
      (r) =>
        /^\/bills\/.+\.json$/.test(r.path) && r.path !== '/bills/index.json',
    ),
  ).toBe(true);
  expect(reads.every((r) => r.refresh)).toBe(true);
});

test.each(['receipts', 'associated', 'divisions'] as const)(
  '%s transform failure settles its block as an error, while other blocks remain readable',
  async (failed) => {
    const fail = () => {
      throw new Error('transform failed');
    };
    const spy =
      failed === 'receipts'
        ? jest.spyOn(partyTransforms, 'partyMoney').mockImplementation(fail)
        : failed === 'divisions'
          ? jest
              .spyOn(partyTransforms, 'partyDivisions')
              .mockImplementation(fail)
          : null;
    const api = new Catalogs({
      get: async (path, decoder) => {
        const record = await get(path, decoder);
        return failed === 'associated' && path === '/graph/aec-extras.json'
          ? {
              ...record,
              data: {
                ...record.data,
                get parties() {
                  return fail();
                },
              },
            }
          : record;
      },
    });
    const updates: import('../src/api/catalogs').PartyPageRecord[] = [];
    try {
      const final = await api.partyPage('Labor', false, (r) => updates.push(r));
      expect(final.data?.[failed]).toMatchObject({
        status: 'error',
        data: null,
      });
      expect(final.data?.[failed].error?.code).toBe('invalid-data');
      expect(updates.some((r) => r.data?.[failed].status === 'error')).toBe(
        true,
      );
      for (const block of [
        'members',
        'receipts',
        'associated',
        'divisions',
      ] as const)
        if (block !== failed) expect(final.data?.[block].status).toBe('ready');
    } finally {
      spy?.mockRestore();
    }
  },
);

test.each(['roster', 'people'] as const)(
  'a partial %s refuses membership counts while optional party blocks still load',
  async (source) => {
    const path =
      source === 'roster' ? '/parliamentarians.json' : manifest.people_url;
    const api = new Catalogs({
      get: async (requested, decoder) => {
        if (requested !== path) return get(requested, decoder);
        return {
          data: decoder(replaceAt(pinned(path), ['people', 0, 'name'], 7)),
          stale: false,
          savedAt: 1000,
          asOf: null,
        };
      },
    });
    const view = (await api.partyPage('Labor')).data!;
    expect(view.members.status).toBe('error');
    expect(view.members.error?.message).toBe(
      'Some membership rows could not be read.',
    );
    expect(view.members.data).toBeNull();
    expect(view.receipts.status).toBe('ready');
    expect(view.receipts.data?.node.total).toBe(graph.nodes[0]!.total);
    expect(view.associated.status).toBe('ready');
    expect(view.divisions.status).toBe('ready');
    expect(view.divisions.data?.scanned).toBe(32);
  },
);
