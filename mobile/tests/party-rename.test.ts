import { Catalogs, decodeMoney, decodeVotes } from '../src/api/catalogs';
import { billPartyName } from '../src/api/bill-transforms';
import {
  partyLabels,
  partyMembers,
  partyPastMembers,
} from '../src/api/party-page';
import { samePartyLabel as webSamePartyLabel } from '../src/api/party-transforms';
import {
  currentPartyName,
  formerPartyName,
  partyCode,
  partyDot,
  partyIdentity,
  partyRename,
  partyText,
  recordedAsLine,
  resolveParty,
  samePartyLabel,
} from '../src/design/party';
import { PARTY_RENAMES } from '../src/design/party-renames';
import { manifest, people, pinned, roster, slugs } from './pinned';

const LDP = [
  'Libertarian Party',
  'Liberal Democratic Party',
  'Liberal Democrats',
];
const labels = partyLabels(
  roster,
  people,
  decodeMoney(pinned('/graph/money.json')),
);

test('the rename record is the web lane’s (portal/public/labels.js), word for word', () => {
  expect(PARTY_RENAMES).toEqual([
    {
      code: 'LDP',
      name: 'Libertarian Party',
      since: '2024-01-12',
      former: [
        {
          name: 'Liberal Democratic Party',
          aliases: ['Liberal Democrats'],
          until: '2022-07-19',
        },
      ],
      history:
        'Liberal Democratic Party (Liberal Democrats), renamed Libertarian Party. The AEC deregistered the Liberal Democratic Party on 19 July 2022 and registered the Libertarian Party on 12 January 2024.',
      sources: [
        {
          label:
            'AEC notice deregistering the Liberal Democratic Party (19 July 2022)',
          href: 'https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Deregistered_parties/files/statement-of-reasons-liberal-democratic-party-s137-deregistration-statement-of-reasons.pdf',
        },
        {
          label:
            'AEC notice registering the Libertarian Party (12 January 2024)',
          href: 'https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Registration_Decisions/2024/Registration-approved-Notice-Libertarian-Party.pdf',
        },
      ],
    },
  ]);
});

test('every name of the Libertarian Party is one party, code LDP, one colour', () => {
  for (const a of LDP) {
    expect(partyCode(a)).toBe('LDP');
    expect(currentPartyName(a)).toBe('Libertarian Party');
    expect(partyDot(a)).toBe(partyDot('Libertarian Party'));
    for (const b of LDP) {
      expect(samePartyLabel(a, b)).toBe(true);
      // The web-port comparison behind "formerly": a rename is not a change.
      expect(webSamePartyLabel(a, b)).toBe(true);
    }
  }
  expect(samePartyLabel('Liberal Democrats', 'Liberal')).toBe(false);
  expect(samePartyLabel('Libertarian Party', 'Labor')).toBe(false);
  expect(partyRename('Liberal')).toBeNull();
  expect(currentPartyName('Labor')).toBe('Labor');
});

test('labels stay as recorded: no name is rewritten', () => {
  for (const name of LDP) {
    expect(partyIdentity(name)).toMatchObject({ name, short: name });
    expect(partyText({ party: name, status: 'former' }).visible).toBe(name);
    expect(partyText({ party: name, status: 'former' }, true).visible).toBe(
      name,
    );
  }
  // Bill sponsor rows keep "Liberal Democrats".
  expect(billPartyName('Liberal Democratic Party')).toBe('Liberal Democrats');
  // Only a former name gets a "Recorded as" line.
  expect(recordedAsLine('Liberal Democratic Party')).toBe(
    'Recorded as Liberal Democratic Party',
  );
  expect(recordedAsLine('Liberal Democrats')).toBe(
    'Recorded as Liberal Democrats',
  );
  expect(recordedAsLine('Libertarian Party')).toBeNull();
  expect(recordedAsLine('LDP')).toBeNull();
  expect(formerPartyName('Labor')).toBeNull();
});

test.each([
  'Libertarian Party',
  'libertarian-party',
  'Liberal Democratic Party',
  'liberal-democratic-party',
  'Liberal Democrats',
  'liberal-democrats',
  'LDP',
])('%s resolves to the one party page, at its current name', (input) => {
  expect(resolveParty(input, labels)).toBe('Libertarian Party');
});

test('a renamed party with no record under any name does not resolve', () => {
  expect(resolveParty('liberal-democratic-party', ['Labor', 'Liberal'])).toBe(
    null,
  );
});

test('past members under the former name come from the voting record', () => {
  const votes = decodeVotes(pinned('/votes.json'));
  const past = partyPastMembers('Libertarian Party', votes, slugs);
  expect(past).toEqual([
    {
      personId: 'vote:10832',
      name: 'David Leyonhjelm',
      slug: null,
      jurisdiction: 'federal',
      house: 'senate',
      years: [2014, 2019],
      recordedAs: 'Liberal Democratic Party',
    },
    {
      personId: 'vote:10916',
      name: 'Duncan Spender',
      slug: null,
      jurisdiction: 'federal',
      house: 'senate',
      years: [2019],
      recordedAs: 'Liberal Democratic Party',
    },
  ]);
  // Someone the page already lists is not listed twice.
  expect(
    partyPastMembers('Libertarian Party', votes, slugs, [
      { name: 'David Leyonhjelm' },
    ]).map((m) => m.name),
  ).toEqual(['Duncan Spender']);
});

test('the old slug opens one page: members under both names, history, past members', async () => {
  const api = new Catalogs({
    get: async (path, decoder) => ({
      data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
      stale: false,
      savedAt: 1000,
      asOf: null,
    }),
  });
  for (const input of [
    'liberal-democratic-party',
    'liberal-democrats',
    'Libertarian Party',
  ]) {
    const page = await api.partyPage(input);
    expect(page.data?.label).toBe('Libertarian Party');
    expect(page.data?.members.data?.currentCount).toBe(1);
    expect(page.data?.members.data?.current.map((m) => m.name)).toEqual([
      'David Limbrick',
    ]);
    // Limbrick sits under the current name: no "Recorded as".
    expect(page.data?.members.data?.current[0]?.recordedAs).toBeUndefined();
    expect(page.data?.past?.status).toBe('ready');
    expect(page.data?.past?.data?.map((m) => m.name)).toEqual([
      'David Leyonhjelm',
      'Duncan Spender',
    ]);
  }
  // Past members are available for parties that have not been renamed too.
  const labor = await api.partyPage('Labor');
  expect(labor.data?.past?.status).toBe('ready');
  expect(labor.data?.past?.data?.length).toBeGreaterThan(0);
});

// An invented pair: no real party, no real people.
describe('an invented renamed party', () => {
  const pair = {
    code: 'HBP',
    name: 'Harbourside Party',
    since: '2021-03-01',
    former: [
      {
        name: 'Harbourside Reform Party',
        aliases: ['Harbourside Reformers'],
        until: '2020-06-30',
      },
    ],
    history:
      'Harbourside Reform Party (Harbourside Reformers), renamed Harbourside Party.',
    sources: [
      { label: 'Fixture notice', href: 'https://example.invalid/notice.pdf' },
    ],
  };
  let mods: {
    party: typeof import('../src/design/party');
    page: typeof import('../src/api/party-page');
    model: typeof import('../src/features/directories/model');
  };
  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('../src/design/party-renames', () => ({
        PARTY_RENAMES: [pair],
      }));
      mods = {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        party: require('../src/design/party'),
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        page: require('../src/api/party-page'),
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        model: require('../src/features/directories/model'),
      };
    });
  });
  afterAll(() => jest.dontMock('../src/design/party-renames'));

  // Two invented sitting members: one seat recorded under each name.
  const template = people.people.find((p) =>
    p.electorates.some((s) => s.current && s.jurisdiction === 'federal'),
  )!;
  const rosterTemplate = roster.people.find((r) => r.current === true)!;
  const fixture = [
    {
      name: 'Ellery Vance',
      slug: 'ellery-vance',
      party: 'Harbourside Reform Party',
      n: 1,
    },
    {
      name: 'Marlow Quint',
      slug: 'marlow-quint',
      party: 'Harbourside Party',
      n: 2,
    },
  ];
  const fixturePeople = {
    ...people,
    people: fixture.map((m) => ({
      ...template,
      person_id:
        `person_${m.n.toString(16).padStart(24, '0')}` as typeof template.person_id,
      legacy_person_id: String(30000 + m.n) as typeof template.legacy_person_id,
      name: m.name,
      aliases: [],
      electorates: [
        {
          ...template.electorates.find((s) => s.current)!,
          electorate_id:
            `el_${m.n.toString(16).padStart(24, '0')}` as (typeof template.electorates)[number]['electorate_id'],
          name: `Seat ${m.slug}`,
          party: m.party,
          current: true,
          periods: undefined,
        },
      ],
    })),
  };
  const fixtureRoster = {
    ...roster,
    people: fixture.map((m) => ({
      ...rosterTemplate,
      pid: String(30000 + m.n) as NonNullable<typeof rosterTemplate.pid>,
      name: m.name,
      full: m.name,
      party: m.party,
      party_now: m.party,
      current: true,
      representation: [
        {
          jurisdiction: 'federal',
          chamber: 'representatives',
          electorate: `Seat ${m.slug}`,
        },
      ],
    })),
  };
  const fixtureSlugs = {
    ...slugs,
    slugs: Object.fromEntries(fixture.map((m) => [m.slug, m.name])),
  };

  test('the invented pair resolves to one party at its current name', () => {
    const { party } = mods;
    expect(
      party.samePartyLabel('Harbourside Reform Party', 'Harbourside Party'),
    ).toBe(true);
    expect(
      party.samePartyLabel('Harbourside Reformers', 'Harbourside Party'),
    ).toBe(true);
    for (const input of [
      'harbourside-reform-party',
      'Harbourside Reformers',
      'Harbourside Party',
      'HBP',
    ])
      expect(
        party.resolveParty(input, ['Labor', 'Harbourside Reform Party']),
      ).toBe('Harbourside Party');
    expect(
      party.resolveParty('Harbourside Party', [
        'Harbourside Reform Party',
        'Harbourside Party',
      ]),
    ).toBe('Harbourside Party');
  });

  test('a member recorded under the former name shows “Recorded as” it', () => {
    const members = mods.page.partyMembers(
      'Harbourside Party',
      fixtureRoster,
      fixturePeople,
      fixtureSlugs,
      manifest,
    );
    expect(members.currentCount).toBe(2);
    expect(members.current.map((m) => [m.name, m.recordedAs ?? null])).toEqual([
      ['Ellery Vance', 'Harbourside Reform Party'],
      ['Marlow Quint', null],
    ]);
  });

  test('the party list has one entry, at the current name, with members under both names', () => {
    const file = (
      parties: { label: string; total: number }[],
    ): Parameters<typeof mods.model.partyRows>[1][string] => ({
      meta: { generated: '2026-09-01', source: 'Fixture returns' },
      parties,
    });
    const record = <T>(data: T) => ({
      data,
      stale: false,
      savedAt: 1,
      asOf: null,
      etag: null,
    });
    const rows = mods.model.partyRows(
      {
        roster: record(fixtureRoster),
        people: record(fixturePeople),
        slugs: record(fixtureSlugs),
        manifest: record(manifest),
      } as unknown as Parameters<typeof mods.model.partyRows>[0],
      {
        federal: file([
          { label: 'Harbourside Reform Party', total: 900 },
          { label: 'Harbourside Party', total: 400 },
          { label: 'Fixture Other Party', total: 1000 },
        ]),
        vic: file([{ label: 'Harbourside Party', total: 50 }]),
      },
    );
    const named = rows.filter((r) => /harbourside/i.test(r.name));
    expect(named.map((r) => r.name)).toEqual(['Harbourside Party']);
    expect(named[0]).toMatchObject({
      members: 2,
      // Both names' returns, summed per file, as the web does.
      money: {
        federal: expect.objectContaining({ total: 1300 }),
        vic: expect.objectContaining({ total: 50 }),
      },
      total: 1300,
    });
    expect(
      rows.find((r) => r.name === 'Fixture Other Party')?.money.federal?.total,
    ).toBe(1000);
  });

  test('money under both names is one figure: summed, spanned, and lodged as each name', () => {
    const years = (from: number, to: number, amount: number) =>
      Object.fromEntries(
        Array.from({ length: to - from + 1 }, (_, i) => [
          String(from + i),
          [amount, 1],
        ]),
      );
    const graph = decodeMoney({
      meta: {
        generated: '2026-09-02',
        source: 'Fixture returns',
        coverage: 'Annual returns',
        methodology: 'Published returns',
        exclusions: [],
        party_totals_note: 'Annual returns',
      },
      nodes: [
        {
          id: 'party:hrp',
          label: 'Harbourside Reform Party',
          kind: 'party',
          total: 1000,
          count: 4,
          firstYear: 2016,
          lastYear: 2019,
          byYear: years(2016, 2019, 250),
        },
        {
          id: 'party:hbp',
          label: 'Harbourside Party',
          kind: 'party',
          total: 2000,
          count: 2,
          firstYear: 2019,
          lastYear: 2020,
          byYear: years(2019, 2020, 1000),
        },
        {
          id: 'party:other',
          label: 'Fixture Other Party',
          kind: 'party',
          total: 2500,
          count: 1,
          firstYear: 2018,
          lastYear: 2018,
          byYear: years(2018, 2018, 2500),
        },
        {
          id: 'donor:fixture-co',
          label: 'Fixture Holdings Pty Ltd',
          kind: 'donor',
          total: 1500,
          count: 2,
          byYear: {},
        },
      ],
      edges: [
        {
          source: 'donor:fixture-co',
          target: 'party:hrp',
          total: 500,
          count: 1,
          byYear: { '2018': [500, 1] },
        },
        {
          source: 'donor:fixture-co',
          target: 'party:hbp',
          total: 1000,
          count: 1,
          byYear: { '2020': [1000, 1] },
        },
      ],
    });
    for (const label of ['Harbourside Party', 'harbourside-reform-party']) {
      const money = mods.page.partyMoney(
        mods.party.resolveParty(label, ['Harbourside Party'])!,
        graph,
      )!;
      expect(money.node).toMatchObject({
        total: 3000,
        count: 6,
        firstYear: 2016,
        lastYear: 2020,
        // The web's words (party-page.js combinedNode), oldest name first.
        lodgedAs:
          'Lodged as Harbourside Reform Party $1,000; as Harbourside Party $2,000',
      });
      expect(money.node.byYear['2019']).toEqual([1250, 2]);
      expect(money.recordedAs).toBeNull();
      // Ranked once among the file's parties, above the $2,500 party.
      expect(money).toMatchObject({ rank: 1, parties: 2 });
      // A donor to both names is one row, its gifts summed.
      expect(money.donors).toEqual([
        expect.objectContaining({
          name: 'Fixture Holdings Pty Ltd',
          amount: 1500,
        }),
      ]);
      expect(money.byYear.map((y) => y.year)).toEqual([
        '2020',
        '2019',
        '2018',
        '2017',
        '2016',
      ]);
    }
    // One name alone: no "Lodged as" line, its own label kept.
    const only = mods.page.partyMoney('Harbourside Party', {
      ...graph,
      nodes: graph.nodes.filter((n) => n.id !== 'party:hbp'),
    })!;
    expect(only.node).toMatchObject({ total: 1000, lodgedAs: null });
    expect(only.recordedAs).toBe('Harbourside Reform Party');
    // A party without a rename reads its own node, unchanged.
    expect(
      mods.page.partyMoney('Fixture Other Party', graph)?.node,
    ).toMatchObject({ total: 2500, lodgedAs: null });
  });

  test('a division under the former name keeps its label', () => {
    const detail = {
      key: 'fixture-bill',
      title: 'Fixture Bill 2019',
      divisions: [
        {
          key: 'fixture-division',
          date: '2019-03-01',
          house: 'senate',
          stage: 'second_reading',
          outcome: 'affirmative',
          ayes: 30,
          noes: 20,
          party_splits: {
            'Harbourside Reform Party': { ayes: 1, noes: 0 },
          },
        },
      ],
    } as unknown as Parameters<typeof mods.page.partyDivisions>[1][number];
    const rows = mods.page.partyDivisions('Harbourside Party', [detail]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ayes: 1,
      noes: 0,
      recordedAs: 'Harbourside Reform Party',
    });
  });

  test('the real parties stay apart outside the mocked record', () => {
    expect(partyMembers).not.toBe(mods.page.partyMembers);
    expect(
      samePartyLabel('Harbourside Reform Party', 'Harbourside Party'),
    ).toBe(false);
  });
});
