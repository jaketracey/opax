import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reportsFixture } from '../scripts/reports-fixture';
import { CatalogCache } from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { assertAllowedPath } from '../src/api/policy';
import { isReportsPaidPath } from '../src/api/reports-policy';
import {
  MATRIX_NOTE,
  TIDE_PARLIAMENTS,
  WORDS_NOTE,
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
  type Tide,
} from '../src/features/explore/model';
import { isExplorePaidPath } from '../src/features/explore/policy';
import {
  ExploreRepository,
  decodeDatedMatrix,
  decodeDatedTide,
} from '../src/features/explore/repository';
import { decodeIndustryMoney } from '../src/features/reports/model';
import { pinnedBytes } from './pinned';

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
  const { generated_at: _tideDate, ...undatedTide } = tideRaw;
  const { generated_at: _matrixDate, ...undatedMatrix } = matrixRaw;
  expect(decodeDatedTide(undatedTide).generated_at).toBeUndefined();
  expect(decodeDatedMatrix(undatedMatrix).generated_at).toBeUndefined();
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
  // A reports paid read: the fixture server answers Explore paid paths
  // with the tide body, so the matrix must not be one of them.
  expect(isExplorePaidPath('/api/matrix')).toBe(false);
  expect(isReportsPaidPath('/api/matrix')).toBe(true);
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

/* ------------------------------------------------------------------ */
/* Screen harness for the tool screens.                              */
/* ------------------------------------------------------------------ */
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: jest.requireActual('react-native').View,
  Rect: () => null,
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const part = (name: string) =>
    function Part(props: { children?: unknown }) {
      return React.createElement(name, props, props.children);
    };
  return {
    router: { push: jest.fn(), back: jest.fn() },
    Stack: {
      Screen: part('StackScreen'),
      Toolbar: Object.assign(part('Toolbar'), {
        Button: part('ToolbarButton'),
        Spacer: () => null,
        View: part('ToolbarView'),
      }),
    },
    Link: Object.assign(part('Link'), {
      Trigger: part('LinkTrigger'),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    useLocalSearchParams: jest.fn(() => ({})),
    useSegments: () => ['(tabs)', '(today)'],
    // Screens load inside the tests, after the shared preview patch runs.
    useIsPreview: () => false,
  };
});
jest.mock('../src/features/explore/runtime', () => ({
  explore: { tide: jest.fn(), matrix: jest.fn() },
}));
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn(), getForAction: jest.fn() },
  reports: { money: jest.fn() },
  catalogs: {},
  yearPictures: { get: jest.fn() },
}));
jest.mock('../src/navigation/sheets', () => ({
  presentSheet: jest.fn(),
  presentSource: jest.fn(),
}));

const uiTexts = (r: import('react-test-renderer').ReactTestRenderer) => {
  const { Text } = jest.requireActual('react-native');
  const flat = (c: unknown): string =>
    typeof c === 'string' || typeof c === 'number'
      ? String(c)
      : Array.isArray(c)
        ? c.map(flat).join('')
        : c && typeof c === 'object' && 'props' in c
          ? flat((c as { props: { children?: unknown } }).props.children)
          : '';
  return r.root
    .findAllByType(Text)
    .map((n) => flat(n.props.children))
    .filter(Boolean);
};
async function render(element: unknown) {
  const { act } = jest.requireActual('react');
  const TestRenderer = jest.requireActual('react-test-renderer');
  let renderer!: import('react-test-renderer').ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  await act(async () => {});
  return renderer;
}
/* ------------------------------------------------------------------ */
/* Words per dollar.                                                   */
/* ------------------------------------------------------------------ */
describe('words per dollar', () => {
  const { createElement } = jest.requireActual('react');
  const explore = () =>
    jest.requireMock('../src/features/explore/runtime').explore;
  const reports = () => jest.requireMock('../src/api/runtime').reports;
  const WD = () => jest.requireActual('../src/features/explore/WordsDollars');
  const Pair = () => jest.requireActual('../src/features/explore/PairRow');
  const moneyRecord = (
    data = decodeIndustryMoney(read('graph/money.json')),
  ) => ({
    data,
    stale: false,
    asOf: null,
    savedAt: 1000,
  });
  const matrixRecord = (cells: Record<string, Record<string, number>> = {}) => {
    const base = decodeDatedMatrix(matrixRaw);
    const totals = Object.fromEntries(
      Object.entries(cells).map(([k, v]) => [
        k,
        Object.values(v).reduce((a, b) => a + b, 0),
      ]),
    );
    return {
      data: {
        ...base,
        cells: { ...base.cells, ...cells } as Record<
          string,
          Record<string, number>
        >,
        totals: { ...base.totals, ...totals },
        generated_at: '2026-11-02',
      },
      stale: false,
      asOf: '2026-11-02',
      savedAt: 1000,
    };
  };
  beforeEach(() => jest.clearAllMocks());
  const host = (
    r: import('react-test-renderer').ReactTestRenderer,
    id: string,
  ) =>
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === id,
    )[0];
  const order = (r: import('react-test-renderer').ReactTestRenderer) => [
    ...new Set(
      r.root
        .findAll(
          (n) =>
            typeof n.type === 'string' && /^wd-/.test(n.props.testID ?? ''),
        )
        .map((n) => n.props.testID as string),
    ),
  ];
  const sourceLabel = (r: import('react-test-renderer').ReactTestRenderer) =>
    r.root.findAll(
      (n) => n.props.testID === 'wd-as-at' && !!n.props.accessibilityLabel,
    )[0]!.props.accessibilityLabel as string;

  test('loading draws the final shape as one loader: a figure and four party rows', async () => {
    reports().money.mockReturnValue(new Promise(() => {}));
    explore().matrix.mockReturnValue(new Promise(() => {}));
    const r = await render(createElement(WD().default));
    const loading = host(r, 'wd-loading')!;
    expect(loading.props.accessibilityLabel).toBe(
      'Loading donations and speeches',
    );
    // VoiceOver hears one loader: every other progressbar is hidden.
    const hiddenUnder = (
      n: import('react-test-renderer').ReactTestInstance,
    ) => {
      for (let p = n.parent; p; p = p.parent)
        if (p.props.importantForAccessibility === 'no-hide-descendants')
          return true;
      return false;
    };
    const loaders = r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.accessibilityRole === 'progressbar' &&
        !hiddenUnder(n),
    );
    expect(loaders).toEqual([loading]);
    expect(
      loading.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityRole === 'progressbar' &&
          n !== loading,
      ),
    ).toHaveLength(2);
    expect(uiTexts(r).join(' ')).toContain('Comparison, never causation');
    expect(host(r, 'wd-subject')).toBeDefined();
    r.unmount();
  });

  test('line values carry no prefixes and say a missing value in words', () => {
    const { pairMoneyText, pairSpeechText } = Pair();
    expect(pairMoneyText({ party: 'Labor', money: 10_763_834 })).toBe(
      '$10,763,834',
    );
    expect(pairMoneyText({ party: 'Labor', money: 0 })).toBe('None disclosed');
    expect(pairMoneyText({ party: 'Independent', money: 0 })).toBe(
      'Not separated',
    );
    const speech = { count: 41, percent: '41%', speechMissing: false };
    expect(pairSpeechText(speech)).toBe('41% · 41 speeches');
    expect(pairSpeechText({ ...speech, percent: null })).toBe('41 speeches');
    expect(pairSpeechText({ ...speech, count: 0 })).toBe(
      'No speeches recorded',
    );
    expect(pairSpeechText({ ...speech, speechMissing: true })).toBe(
      'Not loaded',
    );
  });

  test('pairFigures scales both bars to the largest party on the subject', () => {
    const { pairFigures } = WD();
    const gambling = pairings.find((p) => p.topic === 'gambling')!;
    const money = decodeIndustryMoney(read('graph/money.json'));
    const donations = {
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
    };
    const matrix = {
      cells: { gambling: { Liberal: 300, Labor: 600, Greens: 100 } },
      totals: { gambling: 1000 },
      parties: ['Labor', 'Liberal', 'Greens'],
    };
    const figures = pairFigures(gambling, matrix, donations);
    expect(figures.moneyMax).toBe(9_000_000);
    expect(figures.shareMax).toBe(60);
    expect(
      figures.rows.map((r: { party: string; percent: string | null }) => [
        r.party,
        r.percent,
      ]),
    ).toEqual([
      ['Labor', '60%'],
      ['Liberal', '30%'],
      ['Greens', '10%'],
    ]);
    expect(figures.empty).toBe(false);
    // Speeches not loaded: no speech bar to scale, money still does.
    const failed = pairFigures(gambling, null, donations);
    expect(failed.shareMax).toBe(0);
    expect(failed.moneyMax).toBe(9_000_000);
    expect(failed.empty).toBe(false);
  });

  test('one subject in party-groups order: headers read both figures, money opens the in-tab money map, speeches open the topic, one source line after the rows', async () => {
    const money = moneyRecord();
    reports().money.mockResolvedValue(money);
    const matrix = matrixRecord({
      agriculture: { Labor: 300, Nationals: 200 },
    });
    explore().matrix.mockResolvedValue(matrix);
    const r = await render(createElement(WD().default));
    expect(host(r, 'wd-loading')).toBeUndefined();
    const pair = pairings[0]!;
    expect(pair.topic).toBe('agriculture');
    const { rows } = WD().pairFigures(pair, matrix.data, money.data);
    const drawn = r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' && /^wd-row-/.test(n.props.testID ?? ''),
      )
      .map((n) => n.props.testID.slice('wd-row-'.length));
    expect(drawn).toEqual(rows.map((row: { party: string }) => row.party));
    const linkTo = (id: string) =>
      host(r, id)!.find((n) => (n.type as unknown) === 'Link');
    const paid = rows.find((row: { money: number }) => row.money > 0);
    expect(paid).toBeDefined();
    expect(host(r, `wd-money-${paid.party}`)!.props.accessibilityLabel).toBe(
      `${paid.name}, donations from agriculture donors, ${Pair().pairMoneyText(paid)}. Opens the money map.`,
    );
    expect(linkTo(`wd-money-${paid.party}`)?.props.href).toEqual({
      pathname: '/money',
      params: { focus: `party:${paid.party}`, industry: pair.industries[0] },
    });
    const labor = rows.find((row: { party: string }) => row.party === 'Labor');
    const laborMoney = Pair().pairMoneyText(labor);
    const header = r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.accessibilityRole === 'header' &&
        /^Labor\. /.test(n.props.accessibilityLabel ?? ''),
    )[0]!;
    expect(header.props.accessibilityLabel).toBe(
      `Labor. ${labor.money > 0 ? `${laborMoney} from agriculture donors` : laborMoney}. 60 percent of agriculture speeches with a recorded party.`,
    );
    expect(host(r, 'wd-speech-Labor')!.props.accessibilityLabel).toBe(
      'Labor, 60 percent of agriculture speeches with a recorded party, 300 speeches. Opens the topic.',
    );
    expect(linkTo('wd-speech-Labor')?.props.href).toEqual({
      pathname: '/topic/[slug]',
      params: {
        slug: pair.topic,
        party: 'Labor',
        name: topicLabel(pair.topic),
      },
    });
    expect(host(r, 'wd-figure')!.props.accessibilityLabel).toMatch(
      /^\$[\d,]+, disclosed by agriculture donors to political parties$/,
    );
    const texts = uiTexts(r).join(' ');
    expect(texts).toContain('Comparison, never causation');
    expect(texts).toContain('A floor, not a ceiling');
    expect(texts).toContain('Share of Agriculture speeches');
    expect(texts).not.toMatch(
      /Money:|Speeches:|Speech:|What an industry|labelled|so far|\bpass\b|—/,
    );
    // Every link stays in the app: no web page for money.
    expect(
      r.root
        .findAll((n) => (n.type as unknown) === 'Link')
        .every((n) => typeof n.props.href !== 'string'),
    ).toBe(true);
    // One source line, after the figure and the party block.
    const ids = order(r);
    expect(ids.filter((id) => id === 'wd-as-at')).toHaveLength(1);
    expect(ids.indexOf('wd-as-at')).toBeGreaterThan(
      ids.indexOf(`wd-row-${rows.at(-1)!.party}`),
    );
    expect(ids.indexOf('wd-figure')).toBeLessThan(
      ids.indexOf(`wd-row-${rows[0]!.party}`),
    );
    expect(sourceLabel(r)).toMatch(
      /^Updated .+, AEC annual returns and 1 more$/,
    );
    r.unmount();
  });

  test('a subject with no donations and no speeches draws no $0 figure, only the line and the source', async () => {
    const money = decodeIndustryMoney(read('graph/money.json'));
    reports().money.mockResolvedValue(
      moneyRecord({
        ...money,
        nodes: money.nodes.filter((n) => n.industry !== 'agriculture'),
      }),
    );
    explore().matrix.mockResolvedValue(matrixRecord());
    const r = await render(createElement(WD().default));
    expect(host(r, 'wd-empty')).toBeDefined();
    expect(host(r, 'wd-figure')).toBeUndefined();
    expect(order(r).some((id) => /^wd-row-/.test(id))).toBe(false);
    expect(uiTexts(r).join(' ')).not.toMatch(/\$0\b/);
    expect(uiTexts(r)).toContain(
      'No donations or speeches with a topic label are recorded for agriculture.',
    );
    expect(host(r, 'wd-as-at')).toBeDefined();
    r.unmount();
  });

  test('a failed speech read says Not loaded, never zero, with the error under the rows and a partial source line', async () => {
    reports().money.mockResolvedValue(moneyRecord());
    explore().matrix.mockRejectedValue(new Error('500'));
    const r = await render(createElement(WD().default));
    const speech = r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        /^wd-speech-(?!error)/.test(n.props.testID ?? '') &&
        !!n.props.accessibilityLabel,
    );
    expect(speech.length).toBeGreaterThan(0);
    for (const n of speech) {
      expect(n.props.accessibilityLabel).toMatch(/, Not loaded\.$/);
      expect(n.props.accessibilityRole).not.toBe('link');
    }
    const ids = order(r);
    const lastRow = ids.filter((id) => /^wd-row-/.test(id)).at(-1)!;
    expect(ids.indexOf('wd-speech-error')).toBeGreaterThan(
      ids.indexOf(lastRow),
    );
    expect(uiTexts(r).join(' ')).toContain('Speech shares couldn’t be loaded.');
    expect(sourceLabel(r)).toMatch(/partial$/);
    r.unmount();
  });
});
