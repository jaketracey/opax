import { act, type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TestRenderer from 'react-test-renderer';
import { PersonRow } from '../src/design/people';
import { PARTY_NOT_RECORDED } from '../src/design/party';
import { decodeRoster } from '../src/api/catalog-decoders';
import {
  decodeYear,
  rosterMatch,
  rosterPartyAt,
  voiceParty,
  type VoiceRosterRow,
} from '../src/features/explore/model';
import { YearVoices, yearVoices } from '../src/features/explore/YearVoices';
import { roster, slugs } from './pinned';

jest.mock('expo-router', () => {
  const pass = ({ children }: { children?: unknown }) => children;
  return {
    router: { push: jest.fn() },
    useSegments: () => [],
    Link: Object.assign(pass, {
      Trigger: pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));

const year = (y: number) =>
  decodeYear(
    JSON.parse(
      readFileSync(
        resolve(__dirname, `../../portal/public/years/${y}.json`),
        'utf8',
      ),
    ),
    y,
  );
const lookup = { people: roster.people, slugs: slugs.slugs };
// The branch's own copy of the public roster, read as the app reads it.
const published = decodeRoster(
  JSON.parse(
    readFileSync(
      resolve(__dirname, '../../portal/public/parliamentarians.json'),
      'utf8',
    ),
  ),
).people;
const publishedRow = (name: string) => {
  const rows = published.filter((p) => p.name === name);
  expect(rows).toHaveLength(1);
  return rows[0]!;
};
const drawnParty = (year_: number, name: string) => {
  const data = year(year_);
  const root = draw(
    <YearVoices
      data={data}
      meta={{ asOf: data.generated_at, savedAt: null }}
      roster={lookup}
    />,
  );
  const row = root.findAllByType(PersonRow).find((r) => r.props.name === name);
  expect(row).toBeDefined();
  return row!.props.party as string | null;
};
function draw(element: ReactElement) {
  let root!: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(element);
  });
  return root.root;
}

// The 2026 file records no party on any of Katy Gallagher's three sampled
// speeches (a minister's Senate rows carry none), and the list said "Party
// not recorded" for a sitting Labor senator.
test('a voice whose speeches carry no party label takes the party the roster proves for that year', () => {
  const voice = year(2026).voices.speakers.find(
    (s) => s.name === 'Katy Gallagher',
  )!;
  expect(voice.party).toBeNull();
  expect(drawnParty(2026, 'Katy Gallagher')).toBe('Labor');
  expect(rosterPartyAt(publishedRow('Katy Gallagher'), 2026)).toBe('Labor');
});

// The roster's `party` is a career label. Each row below is the shape of a
// public roster row whose career label is wrong for the year named.
const career: [string, number, VoiceRosterRow][] = [
  // An NSW One Nation member in 2019; the label is from a federal career.
  [
    'two parliaments, no dates',
    2019,
    { party: 'Labor', states: ['nsw', 'federal'], first: 1998, last: 2026 },
  ],
  [
    'a party founded mid-career',
    2015,
    {
      party: 'Independent',
      party_now: "Katter's Australian Party",
      parties: ['Independent', "Katter's Australian Party", 'Nationals'],
      states: ['federal'],
      first: 1998,
      last: 2026,
    },
  ],
  [
    'left the party since',
    2025,
    {
      party: 'Labor',
      party_now: "Australia's Voice",
      parties: ['Labor', 'Independent'],
      states: ['federal'],
      first: 2022,
      last: 2026,
    },
  ],
  [
    'sat for another party that year',
    2022,
    {
      party: 'Independent',
      party_now: 'Independent',
      parties: ['Independent', 'Greens'],
      states: ['federal'],
      first: 2020,
      last: 2026,
    },
  ],
  [
    'a former member in their last year',
    2022,
    {
      party: 'Liberal',
      parties: ['Liberal', 'United Australia Party'],
      states: ['federal'],
      first: 2010,
      last: 2022,
    },
  ],
  [
    'party_now alone differs',
    2012,
    {
      party: 'Nationals',
      party_now: 'One Nation',
      states: ['federal'],
      first: 2006,
      last: 2026,
    },
  ],
];
test.each(career)(
  'a career label is never read into a year: %s',
  (_, y, row) => {
    expect(rosterPartyAt(row, y)).toBeNull();
    expect(voiceParty({ party: null }, y, row)).toBeNull();
  },
);

test('a dated affiliation answers for its own years only', () => {
  const dated: VoiceRosterRow = {
    party: 'Independent',
    party_now: 'Independent',
    parties: ['Independent', 'One Nation'],
    states: ['nsw', 'federal'],
    first: 1998,
    last: 2026,
    affiliations: [
      { party: 'Labor', start: '1994-01-29', end: '2005-01-21' },
      { party: 'One Nation', start: '2019-03-23', end: '2023-03-02' },
      { party: 'One Nation', start: '2023-03-25', end: '2023-08-21' },
      { party: 'Independent', start: '2023-08-22', end: null },
    ],
  };
  expect(rosterPartyAt(dated, 2019)).toBe('One Nation');
  expect(rosterPartyAt(dated, 2001)).toBe('Labor');
  expect(rosterPartyAt(dated, 2025)).toBe('Independent');
  // Two parties in the year, and years no affiliation covers.
  expect(rosterPartyAt(dated, 2023)).toBeNull();
  expect(rosterPartyAt(dated, 2010)).toBeNull();
});

test('one party over a whole record in one parliament is the party at the time, inside the record only', () => {
  const row: VoiceRosterRow = {
    party: 'Labor',
    party_now: 'Labor',
    states: ['federal'],
    first: 2019,
    last: 2026,
  };
  expect(rosterPartyAt(row, 2026)).toBe('Labor');
  expect(rosterPartyAt(row, 2019)).toBe('Labor');
  expect(rosterPartyAt(row, 2018)).toBeNull();
  expect(rosterPartyAt({ ...row, states: [] }, 2026)).toBeNull();
  expect(
    rosterPartyAt({ ...row, party: null, party_now: null }, 2026),
  ).toBeNull();
  // The year's own speech label always wins.
  expect(voiceParty({ party: 'LNP' }, 2026, row)).toBe(
    voiceParty({ party: 'LNP' }, 2026, null),
  );
  expect(voiceParty({ party: null }, 2026, null)).toBeNull();
});

test('the named public rows: none takes a career label, on the published roster and on the pinned one', () => {
  // Mark Latham's five 2019 speeches carry no label. He sat for One Nation in
  // the NSW Legislative Council; "Labor" is his federal career label.
  expect(drawnParty(2019, 'Mark Latham')).not.toBe('Labor');
  const latham = rosterPartyAt(publishedRow('Mark Latham'), 2019);
  expect([null, 'One Nation']).toContain(latham);
  for (const [name, y] of [
    ['Bob Katter', 2015],
    ['Fatima Payman', 2025],
    ['Lidia Thorpe', 2022],
    ['Craig Kelly', 2022],
  ] as const) {
    expect(rosterPartyAt(publishedRow(name), y)).toBeNull();
    const pinnedRow = roster.people.find((p) => p.name === name);
    if (pinnedRow) expect(rosterPartyAt(pinnedRow, y)).toBeNull();
  }
});

test('every unlabelled shown voice, every year: filled only as the rule proves, and Gallagher 2026 is Labor', () => {
  const filled = new Map<string, string>();
  for (let y = 1998; y <= 2026; y++) {
    const data = year(y);
    for (const voice of yearVoices(data)) {
      if (voice.party) continue;
      const slug = rosterMatch(voice.name, lookup.people, lookup.slugs);
      const row = roster.people.find((p) => p.name === voice.name);
      const party = voiceParty(voice, y, slug && row ? row : null);
      if (!party || !row) continue;
      filled.set(`${y} ${voice.name}`, party);
      if (row.affiliations?.length) continue;
      // Undated: one parliament and one recorded party, or nothing.
      expect(row.states).toHaveLength(1);
      expect(
        new Set(
          [row.party, row.party_now, ...(row.parties ?? [])].filter(Boolean),
        ).size,
      ).toBe(1);
    }
  }
  expect(filled.get('2026 Katy Gallagher')).toBe('Labor');
  expect(filled.get('2019 Mark Latham')).not.toBe('Labor');
  expect(filled.size).toBeGreaterThan(15);
  expect(PARTY_NOT_RECORDED).toBe('Party not recorded');
});
