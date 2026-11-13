import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { apiClient } from '../src/api/runtime';
import { dataAsOf, type RecordResult } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { decodeCorpus } from '../src/api/catalog-decoders';
import {
  ContentUnavailable,
  Heading,
  InsetGroup,
  LinkRow,
  SourceLine,
  Text,
  ValueRow,
} from '../src/design/primitives';
import { openCorrection, fromWebPath } from '../src/navigation/external';
import { redirectSystemPath } from '../src/app/+native-intent';
import {
  licenceScreens,
  referenceScreens,
} from '../src/navigation/stack/reference';
import {
  coverageRoute,
  licenceRoute,
  methodsRoute,
} from '../src/navigation/routes/reference';
import Methods from '../src/features/methods/Methods';
import Coverage from '../src/features/methods/Coverage';
import { coverageSources } from '../src/features/methods/repository';
import { methodsCopy } from '../src/features/methods/copy';
import { paperBar } from '../src/features/sources/parts';
import { opaqueBar } from '../src/navigation/chrome';
import { colors } from '../src/design/tokens';
import { pinned } from './pinned';

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
      Screen: () => null,
    },
    router: { push: jest.fn(), back: jest.fn() },
  };
});
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn(), getForAction: jest.fn() },
  catalogs: {},
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openCorrection: jest.fn(),
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
}));
jest.mock('../src/navigation/share', () => ({
  trackShare: jest.fn(),
  canShare: true,
  shareHeaderItem: ({ path }: { path: string }) => ({
    type: 'button',
    label: 'Share',
    path,
  }),
}));

const corpus = pinned('/corpus.json');
const summary = (stale = false): RecordResult<unknown> => ({
  data: decodeCorpus(corpus),
  asOf: dataAsOf(corpus),
  stale,
  savedAt: Date.UTC(2026, 9, 3),
});
const counts: RecordResult<unknown> = {
  data: {
    resources: 700_000,
    paragraphs: 9_000_000,
    kinds: { bill: 4_000, speech: 691_104, odd_kind: 3, other_kind: 4 },
    speeches_by_state: { nsw: 120_000, federal: 400_000, zz: 9 },
  },
  asOf: '2026-11-09',
  stale: false,
  savedAt: Date.UTC(2026, 10, 9),
};
const get = jest.mocked(apiClient.get);
const getForAction = jest.mocked(apiClient.getForAction);

describe('old links land', () => {
  test.each([
    ['/methods', methodsRoute],
    ['/methods/', methodsRoute],
    ['/stats', coverageRoute],
    ['/stats/', coverageRoute],
    ['/about', { pathname: '/account/about' }],
    ['/account/sources?dataset=hansard', licenceRoute('hansard')],
    ['/account/sources?view=x&dataset=money-qld', licenceRoute('money-qld')],
  ])('%s', (path, route) => {
    expect(fromWebPath(path)).toEqual(route);
  });

  test.each([
    ['opax://methods', '/account/methods'],
    ['opax://stats', '/account/coverage'],
    ['/methods', '/account/methods'],
    ['/stats', '/account/coverage'],
    ['https://opax.com.au/methods', '/account/methods'],
    ['opax://account/sources?dataset=hansard', '/licence/hansard'],
  ])('%s opens in its own sheet, not a tab stack', (path, target) => {
    for (const initial of [true, false])
      expect(redirectSystemPath({ path, initial })).toBe(target);
  });
});

describe('Done only at the root of a sheet', () => {
  const optionsOf = (screens: ReactElement[], name: string) =>
    (
      screens.find((node) => (node.props as { name: string }).name === name)!
        .props as {
        options: (input: unknown) => Record<string, unknown>;
      }
    ).options;
  const at = (index: number) => ({
    route: {},
    navigation: { getState: () => ({ index }) },
  });
  test.each([
    ...[
      'about',
      'coverage',
      'methods',
      'sources/index',
      'sources/datasets',
      'sources/dataset/[id]',
      'sources/portraits',
      'sources/photos',
      'sources/fonts',
    ].map((name) => ['account', name] as const),
    ...['[id]', 'sources/index', 'sources/[...path]'].map(
      (name) => ['licence', name] as const,
    ),
  ])('%s %s', (stack, name) => {
    const screens = stack === 'account' ? referenceScreens() : licenceScreens();
    const options = optionsOf(screens, name);
    const root = options(at(0)) as {
      unstable_headerRightItems: () => { label: string }[];
    };
    expect(root.unstable_headerRightItems()[0]).toMatchObject({
      label: 'Done',
    });
    expect(options(at(1))).not.toHaveProperty('unstable_headerRightItems');
  });
});

let renderer: TestRenderer.ReactTestRenderer | null = null;
const navigation = {
  setOptions: jest.fn(),
  getState: jest.fn(),
  isFocused: () => true,
  addListener: () => () => {},
};
async function render(element: ReactElement, root: boolean) {
  navigation.getState.mockReturnValue({
    index: root ? 0 : 1,
    routes: root ? [{ key: 'here' }] : [{ key: 'account' }, { key: 'here' }],
  });
  await act(async () => {
    renderer = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={{ key: 'here' } as never}>
          {element}
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  return renderer!;
}
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = null;
});
beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue(summary() as never);
  getForAction.mockResolvedValue(counts as never);
});
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((node) => node.props.children)
    .filter((value) => typeof value === 'string')
    .join('\n');
const linkRow = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAllByType(LinkRow).find((node) => node.props.testID === testID)!;
const resolvedOptions = () =>
  Object.assign(
    {},
    ...navigation.setOptions.mock.calls.map(([options]) => options),
  ) as Record<string, () => { label: string }[]>;

describe('Methods', () => {
  test('on paper under a paper bar, inside the sunken Account sheet', async () => {
    await render(<Methods />, false);
    expect(resolvedOptions()).toMatchObject(paperBar);
    expect(paperBar).toEqual(opaqueBar(colors.paper));
  });

  test('a page title, then the sections in order', async () => {
    const page = await render(<Methods />, false);
    const headings = page.root.findAllByType(Heading);
    expect(headings[0]!.props).toMatchObject({ level: 1, kind: 'page' });
    expect(headings.slice(1).map((node) => node.props.children)).toEqual(
      methodsCopy.sections.map((item) => item.title),
    );
  });

  test('the money rules, the match-tier rule and the both-registers caveat', async () => {
    const page = await render(<Methods />, false);
    const words = texts(page);
    for (const sentence of [
      'Totals are a minimum: donations under the disclosure threshold aren’t published.',
      'Contract values as last published, not amounts paid.',
      'Appearing in both registers doesn’t show that one led to the other.',
      'An exact match comes first',
      'Within each, what is current ranks above what is past: a sitting member above a former one, a bill still before parliament above a passed or lapsed one, a registered party above a deregistered one. Then A to Z.',
    ])
      expect(words).toContain(sentence);
  });

  test('limitations are bullets, with the state coverage years from the summary', async () => {
    const page = await render(<Methods />, false);
    const limits = page.root
      .findByProps({ testID: 'methods-section-limits' })
      .findAllByType(Text)
      .flatMap((node) => node.props.children)
      .filter((value) => typeof value === 'string')
      .join('\n');
    expect(limits).toMatch(/NSW Parliament from \d{4}/);
  });

  test('without the summary the page still reads, with no error', async () => {
    get.mockRejectedValue(new ApiError('offline', 'Offline.'));
    const page = await render(<Methods />, false);
    expect(texts(page)).toContain(methodsCopy.stateCoverageFallback);
    expect(page.root.findAllByType(ContentUnavailable)).toEqual([]);
  });

  test('Coverage is a row; a correction is one row with the address and the response time', async () => {
    const page = await render(<Methods />, false);
    expect(linkRow(page, 'methods-coverage').props.href).toEqual(coverageRoute);
    const correction = linkRow(page, 'methods-correction');
    expect(correction.props.detail).toBe('corrections@opax.com.au');
    await act(async () => correction.props.onPress());
    expect(openCorrection).toHaveBeenCalled();
    const group = page.root
      .findAllByType(InsetGroup)
      .find((node) => node.findAllByType(LinkRow).includes(correction))!;
    expect(group.props.footer).toBe(
      'We aim to respond within 2 business days.',
    );
  });

  test('pushed, Share is trailing after Back', async () => {
    await render(<Methods />, false);
    expect(resolvedOptions().unstable_headerRightItems!()).toMatchObject([
      { label: 'Share', path: '/methods' },
    ]);
  });

  test('as the sheet root, Share leads and the stack keeps Done trailing', async () => {
    await render(<Methods />, true);
    const options = resolvedOptions();
    expect(options.unstable_headerLeftItems!()).toMatchObject([
      { label: 'Share', path: '/methods' },
    ]);
    expect(options).not.toHaveProperty('unstable_headerRightItems');
  });
});

describe('Coverage', () => {
  test('by source first, then counts by kind and parliament, then Methods', async () => {
    const page = await render(<Coverage />, false);
    const title = page.root.findAllByType(Heading)[0]!;
    expect(title.props).toMatchObject({ level: 1, kind: 'page' });
    const groups = page.root
      .findAllByType(InsetGroup)
      .map((node) => node.props.header ?? node.props.testID ?? null);
    expect(groups).toEqual([
      'By source',
      'Records by kind',
      'Speeches by parliament',
      null,
    ]);
    expect(linkRow(page, 'coverage-methods').props.href).toEqual(methodsRoute);
  });

  test('sources are federal, then states, then others, each with its years', async () => {
    const page = await render(<Coverage />, false);
    const rows = page.root
      .findByProps({ testID: 'coverage-sources' })
      .findAllByType(LinkRow);
    const expected = coverageSources(decodeCorpus(corpus));
    expect(rows.map((row) => row.props.title)).toEqual(
      expected.map((source) => source.name),
    );
    for (const row of rows) {
      expect(row.props.accessory).toBe('none');
      expect(row.props.detail).toMatch(/^[\d,]+ (speeches|records)$/);
    }
    const line = page.root
      .findAllByType(SourceLine)
      .find((node) => node.props.testID === 'coverage-sources-source')!;
    expect(line.props.asOf).toBeTruthy();
  });

  test('counts are largest first, unnamed kinds summed last, no raw IDs', async () => {
    const page = await render(<Coverage />, false);
    const rows = (testID: string) =>
      page.root
        .findByProps({ testID })
        .findAllByType(ValueRow)
        .map((row) => [row.props.label, row.props.value]);
    expect(rows('coverage-kinds')).toEqual([
      ['Speeches', '691,104'],
      ['Bills', '4,000'],
      ['Other records', '7'],
    ]);
    expect(rows('coverage-parliaments')).toEqual([
      ['Federal Parliament', '400,000'],
      ['NSW Parliament', '120,000'],
      ['Other parliaments', '9'],
    ]);
    expect(JSON.stringify(rows('coverage-kinds'))).not.toMatch(/_|\bzz\b/);
  });

  test('counts that fail keep the sources; both failing is one error with Try Again', async () => {
    getForAction.mockRejectedValue(new ApiError('server', 'No.'));
    let page = await render(<Coverage />, false);
    expect(
      page.root.findAllByProps({ testID: 'coverage-sources' }).length,
    ).toBeGreaterThan(0);
    expect(
      page.root.findAllByProps({ testID: 'coverage-counts-error' }).length,
    ).toBeGreaterThan(0);
    await act(async () => page.unmount());
    get.mockRejectedValue(new ApiError('server', 'No.'));
    page = await render(<Coverage />, false);
    const unavailable = page.root.findByType(ContentUnavailable);
    expect(unavailable.props.testID).toBe('coverage-unavailable');
    getForAction.mockResolvedValue(counts as never);
    get.mockResolvedValue(summary() as never);
    await act(async () => unavailable.props.action.onPress());
    expect(
      page.root.findAllByProps({ testID: 'coverage-kinds' }).length,
    ).toBeGreaterThan(0);
  });

  test('Share uses the /stats link the web and 1.0 already know', async () => {
    await render(<Coverage />, false);
    expect(resolvedOptions().unstable_headerRightItems!()).toMatchObject([
      { label: 'Share', path: '/stats' },
    ]);
  });
});
