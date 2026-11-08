import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiClient } from '../src/api/client';
import { CatalogCache } from '../src/api/cache';
import { assertAllowedPath } from '../src/api/policy';
import {
  changeText,
  cleanSpeechTitle,
  decodeYear,
  groupShares,
  groupSharesText,
  matrixRows,
  noTopicLabelLine,
  pairings,
  partyShares,
  rosterMatch,
  tideCellText,
  tideNote,
  tideRows,
  tideSortHeader,
  topicLabel,
  trend,
  trendA11yLabel,
  trendA11yValue,
  voicesDebates,
  voicesNote,
  wordsPanel,
  MATRIX_NOTE,
  TIDE_PARLIAMENTS,
  WORDS_NOTE,
  type Tide,
} from '../src/features/explore/model';
import {
  ExploreRepository,
  decodeDatedMatrix,
  decodeDatedTide,
} from '../src/features/explore/repository';
import { decodeIndustryMoney } from '../src/features/reports/model';
import { isExplorePaidPath } from '../src/features/explore/policy';
import { pinnedBytes } from './pinned';
import { reportsFixture } from '../scripts/reports-fixture';

jest.mock('../src/storage/two-slot', () => ({
  TwoSlotStore: class {
    read = async () => null;
    save = async () => undefined;
  },
}));

const read = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public/' + path), 'utf8'),
  );
const fixture = reportsFixture(pinnedBytes);
const tideRaw = JSON.parse(fixture('/api/tide')!.toString());
const matrixRaw = JSON.parse(fixture('/api/matrix')!.toString());
const decades: Tide['decades'] = [
  {
    slug: '1990s',
    label: '1993–99',
    from: 1993,
    to: 1999,
    total: 100,
    labelled: 50,
    coverage: 0.5,
  },
  {
    slug: '2000s',
    label: '2000s',
    from: 2000,
    to: 2009,
    total: 100,
    labelled: 60,
    coverage: 0.6,
  },
  {
    slug: '2010s',
    label: '2010s',
    from: 2010,
    to: 2019,
    total: 100,
    labelled: 70,
    coverage: 0.7,
  },
  {
    slug: '2020s',
    label: '2020–26',
    from: 2020,
    to: 2026,
    total: 100,
    labelled: 80,
    coverage: 0.8,
  },
];
const points = (shares: number[], counts = shares.map(() => 10)) =>
  shares.map((share, i) => ({
    decade: decades[i]!.slug,
    share,
    count: counts[i]!,
  }));
const visible = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(visible)
      : [];

test('D-E1: the tide and matrix decoders keep generated_at when present, and never invent one', () => {
  expect(decodeDatedTide(tideRaw).generated_at).toBeUndefined();
  expect(decodeDatedMatrix(matrixRaw).generated_at).toBeUndefined();
  expect(
    decodeDatedTide({ ...tideRaw, generated_at: '2026-11-02' }).generated_at,
  ).toBe('2026-11-02');
  expect(
    decodeDatedMatrix({ ...matrixRaw, generated_at: '2026-11-02T03:00:00Z' })
      .generated_at,
  ).toBe('2026-11-02T03:00:00Z');
  expect(() =>
    decodeDatedMatrix({ ...matrixRaw, generated_at: 'last week' }),
  ).toThrow();
});

test('the matrix is one paid read per session, dated from the response', async () => {
  const transport = jest.fn(
    async () =>
      new Response(
        JSON.stringify({ ...matrixRaw, generated_at: '2026-11-02' }),
        { status: 200 },
      ),
  );
  const client = new ApiClient({
    origin: 'http://127.0.0.1:8951',
    version: '1',
    build: '1',
    transport: transport as typeof fetch,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
  const repository = new ExploreRepository(client);
  expect(transport).not.toHaveBeenCalled();
  const [first] = await Promise.all([repository.matrix(), repository.matrix()]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(first.asOf).toBe('2026-11-02');
  expect(isExplorePaidPath('/api/matrix')).toBe(true);
  expect(() => assertAllowedPath('/api/matrix')).not.toThrow();
});

test('topic labels drop the ampersand', () => {
  expect(topicLabel('mining-energy')).toBe('Mining and energy');
  expect(topicLabel('climate-environment')).toBe('Climate and environment');
  expect(topicLabel('gambling')).toBe('Gambling');
});

test('trend: latest share, change since the first decade, and empty topics', () => {
  expect(trend(points([0.044, 0.074, 0.122, 0.124]))).toEqual({
    now: 0.124,
    change: 0.124 - 0.044,
    empty: false,
  });
  expect(trend(points([0, 0, 0, 0], [0, 0, 0, 0])).empty).toBe(true);
  expect(trend([])).toEqual({ now: 0, change: 0, empty: true });
  expect(changeText(0.08)).toBe('up 8.0 points');
  expect(changeText(-0.004)).toBe('down 0.4 points');
  expect(changeText(0.0001)).toBe('no change');
});

test('trendA11yValue reads every decade, oldest first; the label states the base in words', () => {
  const p = points([0.044, 0.074, 0.122, 0.124]);
  expect(trendA11yValue(p, decades)).toBe(
    '1993–99 4.4%, 2000s 7.4%, 2010s 12.2%, 2020–26 12.4%',
  );
  expect(trendA11yLabel('climate-environment', p, decades)).toBe(
    'Climate and environment. 12.4% of speeches with a topic label in 2020–26, up 8.0 points since 1993–99.',
  );
  expect(trendA11yLabel('climate-environment', p, decades)).not.toMatch(
    /pp|labelled/,
  );
});

test('tide rows: empty topics are named once, never listed as zeros; sorts tie by name', () => {
  const data = {
    topics: {
      gambling: points([0.01, 0.02, 0.03, 0.05]),
      housing: points([0.02, 0.02, 0.03, 0.07]),
      agriculture: points([0, 0, 0, 0], [0, 0, 0, 0]),
    },
  };
  const rising = tideRows(data, 'rising');
  expect(rising.rows.map((r) => r.slug)).toEqual(['housing', 'gambling']);
  expect(rising.unlabelled).toContain('agriculture');
  expect(rising.rows.some((r) => r.slug === 'agriculture')).toBe(false);
  expect(tideRows(data, 'falling').rows.map((r) => r.slug)).toEqual([
    'gambling',
    'housing',
  ]);
  expect(tideRows(data, 'now').rows[0]!.slug).toBe('housing');
  expect(noTopicLabelLine(['agriculture', 'foreign-affairs'])).toBe(
    'No topic label yet: Agriculture and Foreign affairs.',
  );
  expect(noTopicLabelLine([])).toBeNull();
  expect(tideSortHeader('rising', decades)).toBe('Rising most since 1993–99');
  expect(tideSortHeader('falling', decades)).toBe('Falling most since 1993–99');
  expect(tideSortHeader('now', decades)).toBe('Largest share in 2020–26');
  expect(tideCellText({ share: 0.044, count: 849 })).toBe(
    '4.4% · 849 speeches',
  );
  expect(tideCellText({ share: 0, count: 0 })).toBe('None');
});

test('the tide note names the parliaments the scope counts', () => {
  expect(TIDE_PARLIAMENTS.label).toBe('All five parliaments');
  expect(tideNote('federal')).toContain('federal parliament');
  expect(tideNote('all')).toContain(
    'New South Wales, Victorian, South Australian and Queensland',
  );
});

test('groupShares: Labor, the Coalition, the crossbench, summing to 100 over speeches with a recorded party', () => {
  const cells = {
    Labor: 410,
    Liberal: 300,
    Nationals: 50,
    LNP: 20,
    Greens: 150,
    Independent: 69,
    Other: 1,
  };
  const shares = groupShares(cells);
  if ('thin' in shares) throw new Error('expected a split');
  expect(shares.groups.map((g) => g.group)).toEqual([
    'labor',
    'coalition',
    'crossbench',
  ]);
  expect(shares.groups.reduce((n, g) => n + g.percent, 0)).toBe(100);
  expect(groupSharesText(shares)).toBe(
    'Labor 41% · the Coalition 37% · the crossbench 22%',
  );
  expect(
    groupSharesText(
      groupShares({ Labor: 999, Liberal: 1 }) as Extract<
        ReturnType<typeof groupShares>,
        { groups: unknown }
      >,
    ),
  ).toBe('Labor 100% · the Coalition <1% · the crossbench 0%');
  expect(groupShares({ Labor: 41, Independent: 129 })).toEqual({ thin: 170 });
});

test('partyShares lists every party in party-groups order, counts only on a thin subject', () => {
  const rows = partyShares({
    Greens: 150,
    Independent: 69,
    Nationals: 50,
    Labor: 410,
    LNP: 20,
    Liberal: 300,
    'Country Liberal Party': 1,
    Other: 1,
    'One Nation': 0,
  });
  expect(rows.map((r) => r.party)).toEqual([
    'Labor',
    'Country Liberal Party',
    'Liberal',
    'LNP',
    'Nationals',
    'Greens',
    'Independent',
    'Other',
  ]);
  expect(rows.find((r) => r.party === 'LNP')!.name).not.toBe('LNP');
  expect(rows.reduce((n, r) => n + (r.percent ?? 0), 0)).toBe(100);
  expect(rows[0]!.text).toBe('41% · 410 speeches');
  const thin = partyShares({ Labor: 41, Independent: 129 });
  expect(thin.map((r) => r.text)).toEqual(['41 speeches', '129 speeches']);
  expect(thin.every((r) => r.percent === null)).toBe(true);
});

test('matrix rows sort by speeches or A to Z and name the empty topics once', () => {
  const { rows, unlabelled } = matrixRows(
    { totals: { gambling: 3335, housing: 900, agriculture: 0 } },
    'speeches',
  );
  expect(rows).toEqual(['gambling', 'housing']);
  expect(unlabelled).toContain('agriculture');
  expect(
    matrixRows({ totals: { gambling: 3335, housing: 900 } }, 'name').rows,
  ).toEqual(['gambling', 'housing']);
});

test('words per dollar: subjects A to Z, parties in party-groups order and never by amount', () => {
  expect(pairings.map((p) => topicLabel(p.topic))).toEqual(
    [...pairings.map((p) => topicLabel(p.topic))].sort((a, b) =>
      a.localeCompare(b, 'en-AU'),
    ),
  );
  expect(pairings[0]!.topic).toBe('agriculture');
  expect(pairings.find((p) => p.topic === 'gambling')!.industryNoun).toBe(
    'gambling donors',
  );
  const money = decodeIndustryMoney(read('graph/money.json'));
  const matrix = decodeDatedMatrix(matrixRaw);
  for (const pair of pairings) {
    const panel = wordsPanel(pair, matrix, money);
    const names = panel.rows.map((r) => r.party);
    const labor = names.findIndex((n) => /labor|alp/i.test(n));
    const independent = names.findIndex((n) => /^independent$/i.test(n));
    if (labor >= 0) expect(labor).toBe(0);
    if (independent >= 0)
      expect(
        names
          .slice(independent + 1)
          .every((n) => /^(independent|other)$/i.test(n)),
      ).toBe(true);
    expect(panel.rows.some((r) => r.party === 'Other')).toBe(false);
    expect(panel.rows.every((r) => r.name !== 'LNP')).toBe(true);
  }
  const panel = wordsPanel(
    pairings.find((p) => p.topic === 'gambling')!,
    {
      cells: { gambling: { Liberal: 30, Labor: 60, Greens: 10 } },
      totals: { gambling: 100 },
      parties: ['Labor', 'Liberal', 'Greens'],
    },
    {
      ...money,
      nodes: [
        {
          id: 'd1',
          label: 'Club',
          kind: 'donor',
          industry: 'gambling',
          total: 0,
          count: 0,
        },
      ],
      edges: [
        { source: 'd1', target: 'party:Greens', total: 9_000_000, count: 1 },
        { source: 'd1', target: 'party:Labor', total: 10, count: 1 },
      ],
    },
  );
  expect(panel.rows.map((r) => r.party)).toEqual([
    'Labor',
    'Liberal',
    'Greens',
  ]);
  expect(panel.rows[0]!.share).toBe(60);
  expect(panel.base).toBe(100);
  // Money failed or not yet read: speeches still have a place, never zero.
  expect(
    wordsPanel(pairings[0]!, null, money).rows.every((r) => !r.speechKnown),
  ).toBe(true);
});

test('voicesDebates names the sample in plain words', () => {
  const y2025 = decodeYear(read('years/2025.json'), 2025);
  expect(voicesDebates(y2025)).toBe(
    'In debates on the housing crisis, cost of living, the under-16 social media ban and the energy transition',
  );
  expect(
    voicesDebates({
      voices: {
        ...y2025.voices,
        probes: [
          { q: 'a', label: 'The stimulus' },
          { q: 'b', label: 'Black Saturday' },
        ],
      },
    }),
  ).toBe('In debates on the stimulus and Black Saturday');
  expect(voicesNote(y2025)).not.toMatch(/so far|labels exist|index/);
});

test('rosterMatch links only an exact, unique full name with a known id', () => {
  const roster = [
    { name: 'Glenn Sterle' },
    { name: 'David Smith' },
    { name: 'David Smith' },
  ];
  const slugs = {
    'glenn-sterle': 'Glenn Sterle',
    'david-smith': 'David Smith',
  };
  expect(rosterMatch('Glenn Sterle', roster, slugs)).toBe('glenn-sterle');
  expect(rosterMatch('David Smith', roster, slugs)).toBeNull();
  expect(rosterMatch('Inman Grant', roster, slugs)).toBeNull();
  expect(rosterMatch('Sterle', roster, slugs)).toBeNull();
  expect(rosterMatch('Glenn Sterle', roster, {})).toBeNull();
});

test('cited speech titles lose the speaker, the ISO date and the em dashes', () => {
  expect(
    cleanSpeechTitle({
      slug: 'speech-1',
      title: 'Scott Buchholz — Statements by Members — 2025-02-10',
      speaker: 'Scott Buchholz',
    }),
  ).toBe('Statements by Members');
  expect(cleanSpeechTitle({ slug: 'speech-1', title: null })).toBeNull();
});

test('plain notes: no pipeline words, no em dashes', () => {
  const words = [
    MATRIX_NOTE,
    WORDS_NOTE,
    tideNote('federal'),
    tideNote('all'),
    ...visible(pairings.map((p) => p.industryNoun)),
  ];
  for (const text of words) {
    expect(text).not.toMatch(
      /labelled|corpus|so far|\bpass\b|knowledge box|static|manifest|export|retrieval|\bpp\b|—/i,
    );
  }
});
