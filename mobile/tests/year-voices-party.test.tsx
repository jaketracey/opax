import { act, type ReactElement } from 'react';
import { existsSync, readFileSync } from 'node:fs';
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
import accepted from '../src/features/explore/voice-party-accepted.json';
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
test('a voice whose speeches carry no party label takes its reviewed party', () => {
  const voice = year(2026).voices.speakers.find(
    (s) => s.name === 'Katy Gallagher',
  )!;
  expect(voice.party).toBeNull();
  expect(drawnParty(2026, 'Katy Gallagher')).toBe('Labor');
  // Reviewed for that year only: the same person in an unreviewed year has none.
  const row = publishedRow('Katy Gallagher');
  expect(voiceParty(voice, 2026, row)).toBe('Labor');
  expect(voiceParty(voice, 2025, row)).toBeNull();
  expect(voiceParty(voice, 2026, null)).toBeNull();
});

// The roster's `party` is an undated label over a whole record. Each row
// below is the shape of a public roster row; none is proof for the year.
const undated: [string, string, number, object][] = [
  // An NSW One Nation member in 2019; the label is from a federal career.
  [
    'two parliaments',
    'Mark Latham',
    2019,
    { party: 'Labor', states: ['nsw', 'federal'], first: 1998, last: 2026 },
  ],
  [
    'a party founded mid-career',
    'Bob Katter',
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
    'Fatima Payman',
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
    'Lidia Thorpe',
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
    'Craig Kelly',
    2022,
    {
      party: 'Liberal',
      parties: ['Liberal', 'United Australia Party'],
      states: ['federal'],
      first: 2010,
      last: 2022,
    },
  ],
  // One label, one parliament, and still wrong: the change of party fell in
  // an era of unlabelled Senate speeches.
  [
    'a single label that hides a switch',
    'Julian McGauran',
    2008,
    { party: 'Nationals', states: ['federal'], first: 2006, last: 2011 },
  ],
  [
    'a single label after leaving the party',
    'Ian Goodenough',
    2025,
    {
      party: 'Liberal',
      party_now: 'Liberal',
      states: ['federal'],
      first: 2013,
      last: 2025,
    },
  ],
];
test.each(undated)(
  'an undated roster label is never read into a year: %s',
  (_, name, y, row) => {
    expect(rosterPartyAt(name, row as VoiceRosterRow, y)).toBeNull();
    expect(
      voiceParty({ name, party: null }, y, row as VoiceRosterRow),
    ).toBeNull();
  },
);

const dated: VoiceRosterRow = {
  states: ['nsw', 'federal'],
  first: 1998,
  last: 2026,
  affiliations: [
    {
      jurisdiction: 'federal',
      party: 'Labor',
      start: '1994-01-29',
      end: '2005-01-21',
    },
    {
      jurisdiction: 'nsw',
      party: 'One Nation',
      start: '2019-03-23',
      end: '2023-03-02',
    },
    {
      jurisdiction: 'nsw',
      party: 'One Nation',
      start: '2023-03-25',
      end: '2023-08-21',
    },
    {
      jurisdiction: 'nsw',
      party: 'Independent',
      start: '2023-08-22',
      end: null,
    },
  ],
};
test('a dated affiliation answers for its own years only', () => {
  expect(rosterPartyAt('Mark Latham', dated, 2019)).toBe('One Nation');
  expect(rosterPartyAt('Mark Latham', dated, 2001)).toBe('Labor');
  expect(rosterPartyAt('Mark Latham', dated, 2025)).toBe('Independent');
  // Two parties in the year, and years no affiliation covers.
  expect(rosterPartyAt('Mark Latham', dated, 2023)).toBeNull();
  expect(rosterPartyAt('Mark Latham', dated, 2010)).toBeNull();
  // Outside the record, and a surname stub.
  expect(
    rosterPartyAt('Mark Latham', { ...dated, first: 2020 }, 2019),
  ).toBeNull();
  expect(rosterPartyAt('Latham', dated, 2019)).toBeNull();
  expect(voiceParty({ name: 'Mark Latham', party: null }, 2019, dated)).toBe(
    'One Nation',
  );
});

test('dates must speak for every parliament the row records', () => {
  const senator = {
    first: 2006,
    last: 2019,
    affiliations: [
      {
        jurisdiction: 'federal',
        party: 'Liberal',
        start: '2002-07-01',
        end: '2019-06-30',
      },
    ],
  };
  // A namesake in another parliament may be folded into the row.
  expect(
    rosterPartyAt(
      'Pat Namesake',
      { ...senator, states: ['federal', 'nsw'] },
      2012,
    ),
  ).toBeNull();
  expect(
    rosterPartyAt('Pat Namesake', { ...senator, states: [] }, 2012),
  ).toBeNull();
  expect(
    rosterPartyAt('Pat Namesake', { ...senator, states: ['federal'] }, 2012),
  ).toBe('Liberal');
});

test('the year’s own speech label always wins', () => {
  expect(voiceParty({ name: 'Mark Latham', party: 'LNP' }, 2019, dated)).toBe(
    voiceParty({ name: 'Mark Latham', party: 'LNP' }, 2019, null),
  );
  expect(
    voiceParty({ name: 'Katy Gallagher', party: 'Greens' }, 2026, {}),
  ).not.toBe('Labor');
});

test('the named public rows on the published and pinned rosters: none takes an undated label', () => {
  // Mark Latham's five 2019 speeches carry no label. He sat for One Nation in
  // the NSW Legislative Council; "Labor" is his federal career label.
  expect(drawnParty(2019, 'Mark Latham')).not.toBe('Labor');
  expect([null, 'One Nation']).toContain(
    rosterPartyAt('Mark Latham', publishedRow('Mark Latham'), 2019),
  );
  for (const [name, y] of [
    ['Bob Katter', 2015],
    ['Fatima Payman', 2025],
    ['Lidia Thorpe', 2022],
    ['Craig Kelly', 2022],
    ['Julian McGauran', 2008],
    ['Clive Palmer', 2014],
    ['Ian Goodenough', 2025],
  ] as const)
    for (const people of [published, roster.people]) {
      const rows = people.filter((p) => p.name === name);
      if (rows.length !== 1) continue;
      expect(voiceParty({ name, party: null }, y, rows[0]!)).toBeNull();
    }
});

test('every unlabelled shown voice, every year, is filled only by a reviewed row or a dated one', () => {
  const reviewed = new Map(
    accepted.rows.map((r) => [`${r.year} ${r.name}`, r.party]),
  );
  expect(reviewed.size).toBe(33);
  expect(accepted.rows).toHaveLength(33);
  const filled = new Map<string, string>();
  for (let y = 1998; y <= 2026; y++) {
    const data = year(y);
    const ranked = new Set(data.voices.speakers.map((s) => s.name));
    for (const voice of yearVoices(data)) {
      if (voice.party) continue;
      const slug = rosterMatch(voice.name, lookup.people, lookup.slugs);
      const row = roster.people.find((p) => p.name === voice.name);
      const party = voiceParty(voice, y, slug && row ? row : null);
      if (!party || !row) continue;
      const key = `${y} ${voice.name}`;
      filled.set(key, party);
      if (!reviewed.has(key))
        expect(rosterPartyAt(voice.name, row, y)).toBe(party);
    }
    // Every reviewed row names a voice the year file ranks.
    for (const r of accepted.rows)
      if (r.year === y) expect(ranked.has(r.name)).toBe(true);
  }
  expect(filled.get('2026 Katy Gallagher')).toBe('Labor');
  expect(filled.get('2019 Mark Latham')).not.toBe('Labor');
  expect(filled.size).toBeGreaterThan(15);
  expect(PARTY_NOT_RECORDED).toBe('Party not recorded');
});

test('the reviewed rows are the producer’s, where its list is in this tree', () => {
  const path = resolve(__dirname, '../../scripts/years_party_accept.json');
  if (!existsSync(path)) return;
  expect(accepted.rows).toEqual(JSON.parse(readFileSync(path, 'utf8')).rows);
});
