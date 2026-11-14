import { withNavigationOptions } from './navigation-options';
import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import * as runtime from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { dataAsOf, type ApiClient, type RecordResult } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import {
  ContentUnavailable,
  InlineError,
  LinkRow,
  SourceLine,
  Text,
  ValueRow,
} from '../src/design/primitives';
import { copy } from '../src/design/copy';
import { openSource } from '../src/navigation/external';
import { SourcesScreen } from '../src/features/sources/SourcesScreen';
import DatasetsList from '../src/features/sources/DatasetsList';
import { DatasetPage, originalsOf } from '../src/features/sources/DatasetPage';
import PortraitsList from '../src/features/sources/PortraitsList';
import FontsList from '../src/features/sources/FontsList';
import LicencePath from '../src/features/sources/LicencePath';
import { PhotoCreditsList } from '../src/features/explore/PhotoCredits';
import { datasets, statement } from '../src/features/sources/datasets';
import { resetSources } from '../src/features/sources/loader';
import {
  datasetRoute,
  datasetsRoute,
  licenceHubRoute,
  licenceSourcesRoute,
} from '../src/navigation/routes/reference';
import { catalogs as pinnedCatalogs, pinned } from './pinned';

let mockSegments: string[] = ['account', 'sources'];
let mockParams: Record<string, string> = {};
let mockOptions: Record<string, unknown> = {};
let mockRedirect: unknown = null;
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  return {
    Link,
    Stack: {
      Screen: (p: { options: Record<string, unknown> }) => {
        mockOptions = p.options;
        return null;
      },
    },
    Redirect: ({ href }: { href: unknown }) => {
      mockRedirect = href;
      return null;
    },
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useSegments: () => mockSegments,
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn(), getForAction: jest.fn() },
  portraits: { list: jest.fn() },
  catalogs: {
    expenses: jest.fn(),
    expenseCategories: jest.fn(),
    pay: jest.fn(),
    directory: jest.fn(),
    discovery: jest.fn(),
  },
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn() },
}));
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      fontAcknowledgements: [
        { name: 'Merriweather', notice: 'Copyright Merriweather.\n\nOFL.' },
        { name: 'PublicSans', notice: 'Copyright Public Sans.\n\nOFL.' },
      ],
    },
  },
}));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(),
  openOnWeb: jest.fn(),
  canonicalUrl: (path: string) => `https://opax.invalid${path}`,
}));

const mock = runtime as jest.Mocked<typeof runtime>;
const { explore } = jest.requireMock<{
  explore: { pictures: jest.Mock };
}>('../src/features/explore/runtime');
const saved = <T,>(data: T, asOf: string | null): RecordResult<T> => ({
  data,
  asOf,
  stale: false,
  savedAt: Date.UTC(2026, 9, 3),
});
// Every free catalogue file through the caller's own decoder, as the client
// reads it: the record summary and the files that date the datasets.
const fixtureGet = <T,>(path: string, decode: (raw: unknown) => T) => {
  const raw = pinned(path);
  return Promise.resolve(saved(decode(raw), dataAsOf(raw)));
};
const fixture = new c.Catalogs({ get: fixtureGet } as Pick<ApiClient, 'get'>);
const picture = {
  file: 'Federation.jpg',
  width: 800,
  height: 600,
  caption: 'Opening of the first Parliament',
  event: 'Opening',
  date: '1901-05-09',
  author: 'Tom Roberts',
  credit: 'Tom Roberts',
  licence: 'Public domain',
  licence_url: null,
  source_url: 'https://commons.wikimedia.org/wiki/File:Federation.jpg',
  original_url: 'https://upload.wikimedia.org/Federation.jpg',
};

const official = c.portraitFor(
  ['Anthony Albanese'],
  pinnedCatalogs.photoPeople!,
  pinnedCatalogs.photoCredits!,
  '10007',
);
const commons = c.portraitFor(
  ['Sheena Watt'],
  pinnedCatalogs.photoPeople!,
  pinnedCatalogs.photoCredits!,
)!;

beforeEach(() => {
  resetSources();
  jest.clearAllMocks();
  mockSegments = ['account', 'sources'];
  mockParams = {};
  mockOptions = {};
  mockRedirect = null;
  for (const fn of Object.values(mock.catalogs))
    (fn as jest.Mock).mockRejectedValue(new Error('not in this test'));
  jest
    .mocked(mock.catalogs.expenses)
    .mockResolvedValue(saved(pinnedCatalogs.expenses!, '2026-09-30') as never);
  jest
    .mocked(mock.catalogs.expenseCategories)
    .mockResolvedValue(
      saved(pinnedCatalogs.expenseCategories!, '2026-09-30') as never,
    );
  jest
    .mocked(mock.catalogs.pay)
    .mockResolvedValue(saved(pinnedCatalogs.pay!, '2026-07-01') as never);
  jest.mocked(mock.apiClient.get).mockImplementation(fixtureGet as never);
  jest.mocked(mock.catalogs.directory).mockImplementation(
    async () =>
      ({
        manifest: await fixture.manifest(),
      }) as never,
  );
  jest
    .mocked(mock.catalogs.discovery)
    .mockImplementation(() => fixture.discovery() as never);
  jest.mocked(mock.portraits!.list).mockResolvedValue([
    ...(official
      ? [
          {
            slug: 'anthony-albanese',
            name: 'Anthony Albanese',
            info: official,
          },
        ]
      : []),
    { slug: 'sheena-watt', name: 'Sheena Watt', info: commons },
  ]);
  explore.pictures.mockResolvedValue(saved({ '1901': [picture] }, null));
});

let r: TestRenderer.ReactTestRenderer | null = null;
async function render(element: ReactElement) {
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(element, (options) => {
        mockOptions = options;
      }),
    );
  });
  return r!;
}
afterEach(async () => {
  if (r) await act(async () => r!.unmount());
  r = null;
});
const texts = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join('\n');

test.each([
  ['fonts', 'sources-fonts-screen'],
  ['datasets', 'sources-datasets-screen'],
  ['portraits', 'sources-portraits-screen'],
  ['photos', 'explore-photo-credits'],
  ['unknown', 'sources-screen'],
])(
  'the licence sheet renders and audits its %s destination',
  async (path, testID) => {
    mockSegments = ['licence', 'sources'];
    mockParams = { path };
    const view = await render(<LicencePath />);
    expect(view.root.findAllByProps({ testID }).length).toBeGreaterThan(0);
  },
);
const row = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.findAllByType(LinkRow).find((n) => n.props.testID === testID)!;
const empty = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findByType(ContentUnavailable);
const pressable = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.find(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  );
const search = async (query: string) => {
  const bar = mockOptions.headerSearchBarOptions as {
    onChangeText: (e: { nativeEvent: { text: string } }) => void;
  };
  await act(async () => bar.onChangeText({ nativeEvent: { text: query } }));
};

// The files read only for a dataset's own date: never the record summary.
const dateReads = () =>
  jest
    .mocked(mock.apiClient.get)
    .mock.calls.map(([path]) => path)
    .filter((path) => path !== '/corpus.json');

describe('the hub', () => {
  test('reads no dataset dates', async () => {
    await render(<SourcesScreen />);
    expect(dateReads()).toEqual([]);
  });

  test('one statement, four lists with their counts, then the code', async () => {
    const hub = await render(<SourcesScreen />);
    expect(
      hub.root.findByProps({ testID: 'sources-statement' }).props.children,
    ).toBe(statement);
    const rows = hub.root.findAllByType(LinkRow);
    expect(rows.map((n) => n.props.testID)).toEqual([
      'sources-datasets',
      'sources-portraits',
      'sources-photos',
      'sources-fonts',
      'sources-code',
    ]);
    expect(row(hub, 'sources-datasets').props.href).toEqual(datasetsRoute);
    expect(
      Number(row(hub, 'sources-datasets').props.value.replace(/,/g, '')),
    ).toBeGreaterThanOrEqual(datasets.length);
    expect(row(hub, 'sources-portraits').props.value).toBe(
      official ? '2' : '1',
    );
    expect(row(hub, 'sources-photos').props.value).toBe('1');
    expect(row(hub, 'sources-fonts').props.value).toBe('2');
    expect(row(hub, 'sources-code').props.detail).toBe('AGPL-3.0');
    expect(row(hub, 'sources-code').props.external).toBeTruthy();
  });

  test('a count that fails to load is left off, not shown as zero', async () => {
    jest.mocked(mock.portraits!.list).mockRejectedValue(new Error('Offline'));
    const hub = await render(<SourcesScreen />);
    expect(row(hub, 'sources-portraits').props.value).toBeUndefined();
  });

  test('in the Licence sheet its rows push within that sheet', async () => {
    mockSegments = ['licence', 'sources'];
    const hub = await render(<SourcesScreen />);
    expect(row(hub, 'sources-datasets').props.href).toEqual(
      licenceSourcesRoute(['datasets']),
    );
  });

  test('the 1.0 dataset link opens that dataset', async () => {
    mockParams = { dataset: 'hansard' };
    await render(<SourcesScreen />);
    expect(mockRedirect).toEqual(datasetRoute('hansard'));
  });
});

describe('datasets', () => {
  test('every row shows its date, or says none is published, and opens its page', async () => {
    const list = await render(<DatasetsList />);
    const rows = list.root
      .findAllByType(LinkRow)
      .filter((n) => /^sources-dataset-/.test(n.props.testID));
    expect(rows.length).toBeGreaterThanOrEqual(datasets.length);
    for (const n of rows)
      expect(n.props.detail).toMatch(/ · (Updated .+|Date not published)$/);
    const hansard = row(list, 'sources-dataset-hansard');
    expect(hansard.props.detail).toMatch(/ · Updated \d+ \w+ \d{4}$/);
    expect(hansard.props.href).toEqual(datasetRoute('hansard'));
    const names = rows.map((n) => n.props.title);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en-AU')),
    );
  });

  // These have no read the app makes that carries their date, under about
  // 100 KB compressed: the homepage previews say they have none, Acts open
  // one at a time in the record reader, headlines are dated only by a paid
  // read, and the Queensland grants file (about 300 KB) and the connections
  // index (about 670 KB) are too large to download for a date.
  const undated = [
    'topics-preview',
    'frl',
    'news',
    'programs-places',
    'money-qld-public',
    'qld-grants',
  ];
  test('with the reads settled, every dataset that has a date shows it', async () => {
    const list = await render(<DatasetsList />);
    const rows = list.root
      .findAllByType(LinkRow)
      .filter((n) => /^sources-dataset-/.test(n.props.testID))
      .map((n) => [
        n.props.testID.replace('sources-dataset-', ''),
        n.props.detail,
      ]);
    const ids = rows.map(([id]) => id);
    expect(ids).toEqual(
      expect.arrayContaining([
        ...datasets.map((d) => d.id),
        'lead-registers',
        'release',
      ]),
    );
    for (const [id, detail] of rows)
      expect([id, detail]).toEqual([
        id,
        undated.includes(id)
          ? expect.stringMatching(/ · Date not published$/)
          : expect.stringMatching(/ · Updated (\d{1,2} \w+ )?\d{4}$/),
      ]);
  });

  test('the bar search narrows by publisher, and says when nothing matches', async () => {
    const list = await render(<DatasetsList />);
    await search('electoral commission queensland');
    const shown = list.root
      .findAllByType(LinkRow)
      .map((n) => n.props.publisher ?? n.props.detail);
    expect(shown.length).toBeGreaterThan(0);
    for (const detail of shown) expect(detail).toMatch(/Queensland/);
    await search('zzzz');
    expect(empty(list).props.testID).toBe('sources-datasets-empty');
    expect(empty(list).props.title).toBe('No results for “zzzz”');
  });
});

describe('a dataset', () => {
  test('its page reads its own date only, and its source line waits for it', async () => {
    const page = await render(<DatasetPage id="interests" />);
    expect(dateReads()).toEqual(['/interests/index.json']);
    const line = page.root
      .findAllByType(SourceLine)
      .find((n) => n.props.testID === 'sources-dataset-interests-source')!;
    expect(line.props.asOf).toBe('2026-09-04');
  });

  test('a dataset dated by the shared reads makes no date read of its own', async () => {
    await render(<DatasetPage id="hansard" licenceRoot />);
    expect(dateReads()).toEqual([]);
  });

  test('every dataset: its publisher, a dated source line, the licence once, the terms and its originals', async () => {
    for (const dataset of datasets) {
      const page = await render(<DatasetPage id={dataset.id} />);
      expect(texts(page)).toContain(dataset.publisher);
      const line = page.root
        .findAllByType(SourceLine)
        .find((n) => n.props.testID === `sources-dataset-${dataset.id}-source`);
      expect(line).toBeTruthy();
      const licence = page.root
        .findAllByType(ValueRow)
        .filter(
          (n) => n.props.testID === `sources-dataset-${dataset.id}-licence`,
        );
      expect(licence.map((n) => n.props.value)).toEqual(
        dataset.licence ? [dataset.licence] : [],
      );
      for (const term of dataset.terms) expect(texts(page)).toContain(term);
      const originals = page.root.findAllByProps({
        testID: `sources-dataset-${dataset.id}-originals`,
      });
      expect(originals.length > 0).toBe(originalsOf(dataset).length > 0);
      expect(page.root.findAllByProps({ testID: 'licence-sources' })).toEqual(
        [],
      );
      await act(async () => page.unmount());
      r = null;
    }
  });

  test('each original is its own row, opened over https', async () => {
    const page = await render(<DatasetPage id="money-commonwealth" />);
    const group = page.root.findByProps({
      testID: 'sources-dataset-money-commonwealth-originals',
    });
    const links = group.findAllByType(LinkRow);
    expect(links.map((n) => n.props.title)).toEqual([
      'GrantConnect',
      'AusTender',
    ]);
    expect(links[1]!.props.external).toEqual({
      url: 'https://www.tenders.gov.au/',
      label: 'AusTender',
    });
  });

  test('the Licence sheet root ends on Sources and licences', async () => {
    mockSegments = ['licence', 'hansard'];
    const page = await render(<DatasetPage id="hansard" licenceRoot />);
    expect(row(page, 'licence-sources').props.href).toEqual(licenceHubRoute);
  });

  test('an id that is not listed says so, and All datasets replaces the page', async () => {
    const page = await render(<DatasetPage id="no-such-dataset" />);
    const missing = page.root.findByType(ContentUnavailable);
    expect(missing.props.title).toBe('This dataset isn’t listed');
    await act(async () => missing.props.action.onPress());
    expect(router.replace).toHaveBeenCalledWith(datasetsRoute);
    expect(router.push).not.toHaveBeenCalled();
  });

  test.each([
    ['lead-registers', 'discovery', 'Registers behind the leads'],
    ['release', 'directory', 'Members and electorates'],
  ] as const)(
    '%s, when its read fails, says the details could not be loaded, not that it is gone',
    async (id, read, name) => {
      jest
        .mocked(mock.catalogs[read])
        .mockRejectedValueOnce(new ApiError('server', 'No.'));
      const page = await render(<DatasetPage id={id} />);
      expect(page.root.findAllByType(ContentUnavailable)).toEqual([]);
      const error = page.root.findByType(InlineError);
      expect(error.props.testID).toBe('sources-dataset-partial');
      expect(error.props.message).toBe(
        'Some details for this dataset couldn’t be loaded.',
      );
      await act(async () => error.props.onRetry());
      expect(
        page.root.findByProps({ testID: 'source-dataset-title' }).props
          .children,
      ).toBe(name);
    },
  );

  test('offline, a dataset whose read failed keeps the offline view', async () => {
    jest
      .mocked(mock.catalogs.discovery)
      .mockRejectedValueOnce(new ApiError('offline', 'Offline.'));
    const page = await render(<DatasetPage id="lead-registers" />);
    expect(page.root.findByType(ContentUnavailable).props.title).toBe(
      copy.notSaved,
    );
    expect(page.root.findAllByType(InlineError)).toEqual([]);
  });

  test('offline, an unlisted id says it is not saved and offers no action', async () => {
    jest
      .mocked(mock.catalogs.directory)
      .mockRejectedValue(new ApiError('offline', 'Offline.'));
    const page = await render(<DatasetPage id="no-such-dataset" />);
    const missing = page.root.findByType(ContentUnavailable);
    expect(missing.props.action).toBeUndefined();
  });
});

describe('credits', () => {
  test('portraits by surname; a Commons credit opens its source, an official one is text', async () => {
    const list = await render(<PortraitsList />);
    expect(texts(list)).toContain('Sheena Watt');
    expect(texts(list)).toContain(
      `${commons.credit} · ${commons.licence}, via Wikimedia Commons, cropped`,
    );
    const watt = pressable(list, 'sources-portrait-sheena-watt');
    await act(async () => watt.props.onPress());
    expect(openSource).toHaveBeenLastCalledWith(
      commons.sourceURL,
      'Photo of Sheena Watt',
    );
    if (official) {
      const albanese = list.root
        .findAll((n) => n.props.testID === 'sources-portrait-anthony-albanese')
        .at(-1)!;
      expect(albanese.props.onPress).toBeUndefined();
    }
  });

  test('portrait search narrows the list, and says when nothing matches', async () => {
    const list = await render(<PortraitsList />);
    await search('Watt');
    expect(texts(list)).toContain('Sheena Watt');
    expect(texts(list)).not.toContain('Anthony Albanese');
    await search('Nobody');
    expect(empty(list).props.title).toBe('No results for “Nobody”');
  });

  test('portraits that fail to load can be retried', async () => {
    jest.mocked(mock.portraits!.list).mockRejectedValueOnce(new Error('x'));
    const list = await render(<PortraitsList />);
    const error = list.root.findByProps({ testID: 'sources-portraits-error' });
    await act(async () => error.props.onRetry());
    expect(texts(list)).toContain('Sheena Watt');
  });

  test('photographs by year, each crediting its photographer and licence', async () => {
    const list = await render(<PhotoCreditsList />);
    expect(texts(list)).toContain('1901');
    expect(texts(list)).toContain('Photo: Tom Roberts · Public domain');
    const credit = pressable(list, 'explore-photo-source-Federation.jpg');
    await act(async () => credit.props.onPress());
    expect(openSource).toHaveBeenLastCalledWith(
      picture.source_url,
      'Wikimedia Commons',
    );
  });

  test.each([
    'Alex Example',
    'Example National Archive',
    'https://archive.example.org/photo',
    'This image was supplied by Example Archive. Template instructions. '.repeat(
      10,
    ),
  ])(
    'the photo list keeps only caption, author and licence for credit %j',
    async (credit) => {
      explore.pictures.mockResolvedValue(
        saved(
          { '2025': [{ ...picture, author: 'Alex Example', credit }] },
          null,
        ),
      );
      const list = await render(<PhotoCreditsList />);
      expect(texts(list)).toContain('Photo: Alex Example · Public domain');
      const source = pressable(list, 'explore-photo-source-Federation.jpg');
      expect(source.findAllByType(Text).map((n) => n.props.children)).toEqual([
        picture.caption,
        'Photo: Alex Example · Public domain',
      ]);
      expect(source.props.accessibilityLabel).toBe(
        `${picture.caption}, Photo: Alex Example · Public domain`,
      );
    },
  );

  test('each font names its licence and keeps the notice behind one disclosure', async () => {
    const fonts = await render(<FontsList />);
    expect(texts(fonts)).not.toContain('Copyright Merriweather.');
    const disclosure = fonts.root
      .findAll(
        (n) =>
          n.props.testID === 'sources-font-Merriweather-text' &&
          typeof n.props.onPress === 'function',
      )
      .at(0)!;
    await act(async () => disclosure.props.onPress());
    expect(texts(fonts)).toContain('Copyright Merriweather.');
    expect(texts(fonts)).toContain('Public Sans');
    expect(texts(fonts)).toContain('Used in the Android app.');
  });
});

// The money map's attribution and terms, in the plain words of the sources
// copy: the same publisher, licence and rule, typographic marks and full
// stops for semicolons.
const substance = (value: string) =>
  value
    .replace(/['’]/g, '’')
    .replace(/[;.,]\s*/g, ' ')
    .toLocaleLowerCase('en-AU');
test('central sources preserve every held money-map attribution and reuse term', () => {
  const all = substance(JSON.stringify(datasets));
  for (const suffix of ['', '.qld', '.vic', '.tas']) {
    const graph = pinned(`/graph/money${suffix}.json`) as {
      meta: Record<string, string>;
    };
    for (const key of ['grants_source', 'contracts_source']) {
      if (graph.meta[key]) expect(all).toContain(substance(graph.meta[key]));
    }
    if (graph.meta.source_url)
      expect(JSON.stringify(datasets)).toContain(graph.meta.source_url);
  }
});
