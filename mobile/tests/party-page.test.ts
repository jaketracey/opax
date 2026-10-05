import { joinPerson } from '../src/api/person-identity';
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
import { partySlug, samePartyLabel } from '../src/design/party';
import {
  catalogs,
  files,
  manifest,
  people,
  pinned,
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
  jest.spyOn(api, 'bill').mockRejectedValueOnce(new Error('fixture unavailable'));
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
