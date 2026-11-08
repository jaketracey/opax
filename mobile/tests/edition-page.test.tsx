/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation and Skia are inert hosts in component tests. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactElement } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Dimensions, Image, Platform, StyleSheet } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { catalogs, yearPictures } from '../src/api/runtime';
import {
  decodeBill,
  decodeEdition,
  editionFor,
  type Block,
  type EditionView,
} from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import editionJSON from '../scripts/fixtures/edition-latest.json';
import personJSON from '../scripts/fixtures/edition-politician.json';
import { bills, pinned, roster, slugs } from './pinned';
import { SourceLine } from '../src/design/source';
import { FigureBlock } from '../src/design/record';
import { Card } from '../src/design/card';
import { Button } from '../src/design/controls';
import { MachinePill } from '../src/design/labels';
import { BarSeries, StageTimeline, VoteSplit } from '../src/design/charts';
import { LinkRow } from '../src/design/rows';
import { PersonRow } from '../src/design/people';
import { colors } from '../src/design/tokens';
import { EditionCard } from '../src/features/edition/EditionCard';
import { EditionStory } from '../src/features/edition/EditionStory';
import { Plate, ArchivePhotograph } from '../src/features/edition/Plate';
import {
  editionQuestion,
  editionSubject,
  editionTier,
} from '../src/features/edition/model';
import { editionRoute } from '../src/navigation/routes/edition';
import { billRoute } from '../src/navigation/routes/bills';
import {
  grantProgramRoute,
  largestGrantsRoute,
  moneyItemRoute,
} from '../src/navigation/routes/public-money';
import { fromWebPath, openOnWeb } from '../src/navigation/external';
import { shareRecord } from '../src/navigation/share';
import { decodePictures } from '../src/features/explore/pictures';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    todayEdition: jest.fn(),
    bills: jest.fn(),
    bill: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => 'file:///cache/archive.webp') },
}));
jest.mock('expo-router', () => {
  const React = require('react');
  const Toolbar = Object.assign(
    (props: object) => React.createElement('Toolbar', props),
    {
      Button: (props: object) => React.createElement('ToolbarButton', props),
      Spacer: () => null,
    },
  );
  return {
    Link: Object.assign((props: object) => React.createElement('Link', props), {
      Trigger: (props: object) => React.createElement('LinkTrigger', props),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: {
      Screen: (props: object) => React.createElement('StackScreen', props),
      Toolbar,
    },
    useSegments: () => ['(tabs)', '(today)'],
    router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  };
});
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: require('react-native').View,
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
}));
jest.mock('../src/navigation/share', () => ({
  canShare: true,
  shareRecord: jest.fn(),
  copyRecordLink: jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => {
    if (!uri.startsWith('file:///cache/')) throw new Error('Not local');
    return uri;
  },
}));
const mockOnScroll = jest.fn();
const mockOnTitleLayout = jest.fn();
jest.mock('../src/navigation/useTitleOnScroll', () => ({
  useTitleOnScroll: () => ({
    onScroll: mockOnScroll,
    onTitleLayout: mockOnTitleLayout,
  }),
  TitleAnchorContext: require('react').createContext(null),
}));

const ready = editionFor(decodeEdition(editionJSON));
const edition = ready.data!;
const person = editionFor(decodeEdition(personJSON)).data!;
const missing: Block<EditionView> = {
  status: 'missing',
  data: null,
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
};
let mounted: TestRenderer.ReactTestRenderer[] = [];
const press = async (root: ReactTestInstance, id: string) => {
  const target = root
    .findAllByProps({ testID: id })
    .find((node) => typeof node.props.onPress === 'function')!;
  await act(async () => target.props.onPress());
};
const host = (root: ReactTestInstance, id: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
async function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SafeAreaInsetsContext.Provider
        value={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <SafeAreaFrameContext.Provider
          value={{ x: 0, y: 0, width: 390, height: 844 }}
        >
          {element}
        </SafeAreaFrameContext.Provider>
      </SafeAreaInsetsContext.Provider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
  });
  jest.mocked(catalogs.todayEdition).mockResolvedValue(ready);
  jest
    .mocked(catalogs.bills)
    .mockResolvedValue({ data: bills } as Awaited<
      ReturnType<typeof catalogs.bills>
    >);
  jest.mocked(catalogs.bill).mockResolvedValue({
    data: decodeBill(pinned('/bills/au-federal-r7529.json')),
  } as Awaited<ReturnType<typeof catalogs.bill>>);
  jest
    .mocked(catalogs.roster)
    .mockResolvedValue({ data: roster } as Awaited<
      ReturnType<typeof catalogs.roster>
    >);
  jest
    .mocked(catalogs.slugs)
    .mockResolvedValue({ data: slugs } as Awaited<
      ReturnType<typeof catalogs.slugs>
    >);
});
afterEach(() => {
  act(() => mounted.forEach((renderer) => renderer.unmount()));
  mounted = [];
  Platform.OS = 'ios';
});

describe('edition freshness in Sydney', () => {
  test.each([
    ['2026-11-08', 'fresh'],
    ['2026-11-05', 'fresh'],
    ['2026-11-04', 'recent'],
    ['2026-10-25', 'recent'],
    ['2026-10-24', 'old'],
  ])('%s is %s on 8 November', (date, tier) =>
    expect(editionTier(date, '2026-11-08')).toBe(tier),
  );
  test('crosses midnight in Sydney, including the year boundary', () => {
    expect(editionTier('2026-12-28', new Date('2026-12-31T12:59:59Z'))).toBe(
      'fresh',
    );
    expect(editionTier('2026-12-28', new Date('2026-12-31T13:00:00Z'))).toBe(
      'recent',
    );
  });
});

describe('the replacement edition card', () => {
  test('one zoom link into the reader, first paragraph only, with a separate source target', async () => {
    const { root } = await render(
      <EditionCard edition={ready} today="2026-10-05" />,
    );
    const card = root.findByType(Card);
    expect(card.props).toMatchObject({ href: editionRoute(), zoom: true });
    expect(card.props.accessibilityLabel).toContain(edition.title);
    expect(host(root, 'today-edition-text')[0]!.props.children).toBe(
      edition.paragraphs[0],
    );
    expect(root.findByType(SourceLine).parent).not.toBe(card);
    expect(
      host(root, 'today-edition-machine')[0]!.props.onPress,
    ).toBeUndefined();
    await press(root, 'today-edition');
    expect(router.push).toHaveBeenLastCalledWith(editionRoute());
    await press(root, 'today-edition-sources');
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/source' }),
    );
    expect(openOnWeb).not.toHaveBeenCalled();
  });
  test('a recent card has its weekday date and a saved copy keeps the edition age', async () => {
    const savedAt = Date.parse('2026-10-10T00:00:00Z');
    const { root } = await render(
      <EditionCard
        edition={{ ...ready, stale: true, savedAt }}
        today="2026-10-11"
      />,
    );
    expect(host(root, 'today-edition-kicker')[0]!.props.children.join('')).toBe(
      'Bill · Sunday 4 October',
    );
    expect(root.findByType(SourceLine).props).toMatchObject({
      dateLabel: 'Saved 10 Oct 2026',
      asOf: edition.date,
    });
  });
  test.each(['missing', 'error'] as const)(
    '%s cards collapse',
    async (status) => {
      const r = await render(<EditionCard edition={{ ...missing, status }} />);
      expect(r.toJSON()).toBeNull();
    },
  );
  test('withdrawal removes an already mounted card and old editions stay off Today', async () => {
    const r = await render(<EditionCard edition={ready} today="2026-10-05" />);
    await act(async () => r.update(<EditionCard edition={missing} />));
    expect(r.toJSON()).toBeNull();
    const old = await render(
      <EditionCard edition={ready} today="2026-11-08" />,
    );
    expect(old.toJSON()).toBeNull();
  });
  test('loading keeps the plate geometry', async () => {
    const { root } = await render(<EditionCard edition={null} />);
    expect(host(root, 'today-edition-loading')).toHaveLength(1);
  });
  test('an accessibility-sized record title stays at 34 pt and wraps without a line limit', async () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 3, fontScale: 3.1 },
      screen: { width: 390, height: 844, scale: 3, fontScale: 3.1 },
    });
    const { root } = await render(
      <EditionCard edition={ready} today="2026-10-05" />,
    );
    const title = host(root, 'today-edition-title')[0]!;
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(34);
    expect(title.props.allowFontScaling).toBe(false);
    expect(title.props.numberOfLines).toBeUndefined();
  });
});

describe('the native edition reader', () => {
  test('keeps the full title, all paragraphs, dated timeline and native bill subject', async () => {
    const { root } = await render(<EditionStory />);
    expect(host(root, 'edition-plate-title')[0]!.props.children).toBe(
      edition.title,
    );
    expect(root.findByType(MachinePill).props.note.body).toEqual([
      edition.machineWritten!.attribution,
    ]);
    edition.paragraphs.forEach((paragraph, index) =>
      expect(host(root, `edition-paragraph-${index}`)[0]!.props.children).toBe(
        paragraph,
      ),
    );
    expect(root.findByType(StageTimeline).props.stages).toHaveLength(5);
    await press(root, 'edition-subject');
    expect(router.push).toHaveBeenLastCalledWith(billRoute('au-federal-r7529'));
    expect(
      root
        .findAllByType(SourceLine)
        .every((line) => line.props.asOf === edition.date),
    ).toBe(true);
    expect(root.findAllByType(SourceLine)[0]!.props.originals[0].url).toMatch(
      /^https:\/\//,
    );
    expect(openOnWeb).not.toHaveBeenCalled();
    act(() =>
      host(root, 'edition-screen')[0]!.props.onScroll({
        nativeEvent: { contentOffset: { y: 240 } },
      }),
    );
    expect(mockOnScroll).toHaveBeenCalledWith(240);
    expect(root.findByType(Plate).props.onTitleLayout).toBe(mockOnTitleLayout);
  });
  test('bar contains only More and its three items; the bottom actions draft and share', async () => {
    const { root } = await render(<EditionStory />);
    const options = root.findByType(Stack.Screen).props.options;
    const items = options.unstable_headerRightItems();
    expect(items.map((item: { label: string }) => item.label)).toEqual([
      'More',
    ]);
    expect(
      items[0].menu.items.map((item: { label: string }) => item.label),
    ).toEqual(['Copy link', 'Open on opax.com.au', 'How this is chosen']);
    const ask = root
      .findAllByType(Button)
      .find((button) => button.props.label === 'Ask about this')!;
    act(() => ask.props.onPress());
    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          question: editionQuestion(root.findByType(Plate).props.edition),
        }),
      }),
    );
    expect(catalogs.todayEdition).toHaveBeenCalledTimes(1);
    const share = root
      .findAllByType(Button)
      .find((button) => button.props.label === 'Share')!;
    act(() => share.props.onPress());
    expect(shareRecord).toHaveBeenCalledWith({
      title: edition.title,
      path: edition.path,
    });
    expect(openOnWeb).not.toHaveBeenCalled();
    act(() => items[0].menu.items[1].onPress());
    expect(openOnWeb).toHaveBeenCalledWith(edition.path, edition.title);
  });
  test('iOS uses the native bottom toolbar', async () => {
    Platform.OS = 'ios';
    const { root } = await render(<EditionStory />);
    expect(root.findByType(Stack.Toolbar).props.placement).toBe('bottom');
    expect(
      root
        .findAllByType(Stack.Toolbar.Button)
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(['Ask about this', 'Share']);
  });
  test('a person resolves through the small indices, with no directory load or web fallback', async () => {
    jest
      .mocked(catalogs.todayEdition)
      .mockResolvedValue({ ...ready, data: person });
    const { root } = await render(<EditionStory />);
    expect(host(root, 'edition-subject')).toHaveLength(1);
    expect(root.findByType(PersonRow).props).toMatchObject({
      party: 'Liberal',
      place: 'Mitchell, NSW',
    });
    expect(catalogs.directory).not.toHaveBeenCalled();
    expect(catalogs.roster).toHaveBeenCalledTimes(1);
    expect(catalogs.slugs).toHaveBeenCalledTimes(1);
    expect(openOnWeb).not.toHaveBeenCalled();
  });
  test.each([
    [
      'program',
      '/money/grants?jur=federal&program=abc',
      grantProgramRoute('abc', 'federal', edition.title),
    ],
    [
      'largest',
      '/money/grants?jur=federal&largest=2026-08',
      largestGrantsRoute('2026-08'),
    ],
    [
      'grant',
      '/money/grants/federal/recipient/abn:83140439239?award=GA12345',
      moneyItemRoute(
        {
          kind: 'grant',
          id: 'GA12345',
          award: 'GA12345',
          rid: 'abn:83140439239',
          jur: 'federal',
        },
        edition.title,
      ),
    ],
  ] as const)(
    '%s money day pushes a native subject',
    async (kind, path, href) => {
      jest
        .mocked(catalogs.todayEdition)
        .mockResolvedValue({ ...ready, data: { ...edition, kind, path } });
      const { root } = await render(<EditionStory />);
      expect(
        root
          .findAllByType(LinkRow)
          .find((row) => row.props.testID === 'edition-subject')!.props.href,
      ).toEqual(href);
      await press(root, 'edition-subject');
      expect(router.push).toHaveBeenLastCalledWith(href);
      expect(openOnWeb).not.toHaveBeenCalled();
    },
  );
  test('a topic report becomes a native topic row', async () => {
    jest.mocked(catalogs.todayEdition).mockResolvedValue({
      ...ready,
      data: { ...edition, kind: 'topic', path: '/reports/housing' },
    });
    const { root } = await render(<EditionStory />);
    expect(
      root
        .findAllByType(LinkRow)
        .find((row) => row.props.testID === 'edition-subject')!.props.href,
    ).toMatchObject({ pathname: '/topic/[slug]', params: { slug: 'housing' } });
    expect(
      editionSubject({ ...edition, kind: 'topic', path: '/reports/' }),
    ).toBeNull();
    expect(
      editionSubject({
        ...edition,
        kind: 'topic',
        path: '/reports/grants-allocation',
      }),
    ).toBeNull();
    expect(
      editionQuestion({
        ...edition,
        kind: 'topic',
        title: 'A report about housing',
        path: '/reports/housing',
      }),
    ).toBe('What has parliament said about Housing this year?');
    expect(openOnWeb).not.toHaveBeenCalled();
  });
  test('figures have dates and sources and retain slide order beside the charts', async () => {
    const rich = {
      ...edition,
      kind: 'grant' as const,
      facts: {
        ...edition.facts,
        figures: [{ value: '$1m', label: 'Awarded' }],
        bars: {
          title: 'Shares',
          items: [{ label: 'Health', pct: 60 }],
          note: 'Labels can overlap.',
        },
        division: { ayes: 85, noes: 50 },
        order: [
          { type: 'bars' as const, index: 0 },
          { type: 'figure' as const, index: 0 },
          { type: 'division' as const, index: 0 },
        ],
      },
    };
    jest
      .mocked(catalogs.todayEdition)
      .mockResolvedValue({ ...ready, data: rich });
    const { root } = await render(<EditionStory />);
    expect(root.findByType(FigureBlock).props.source).toMatchObject({
      asOf: edition.date,
      citation: 'OPAX daily edition',
      originals: [expect.objectContaining({ label: 'GrantConnect' })],
    });
    expect(root.findByType(BarSeries).props).toMatchObject({
      values: 'all',
      dateRange: { start: edition.date, end: edition.date },
    });
    expect(
      root
        .findAllByType(VoteSplit)
        .every((split) => split.props.countsStyle === 'votes'),
    ).toBe(true);
    expect(host(root, 'edition-fact-0')[0]!.findByType(BarSeries)).toBeTruthy();
    expect(host(root, 'edition-fact-1')).toHaveLength(1);
    expect(host(root, 'edition-fact-2')[0]!.findByType(VoteSplit)).toBeTruthy();
  });
  test('a withdrawn edition replaces saved prose after refresh', async () => {
    jest
      .mocked(catalogs.todayEdition)
      .mockResolvedValueOnce({ ...ready, stale: true, savedAt: 1 })
      .mockResolvedValue(missing);
    const { root } = await render(<EditionStory />);
    expect(host(root, 'edition-plate')).toHaveLength(1);
    await act(async () =>
      host(root, 'edition-screen')[0]!.props.refreshControl.props.onRefresh(),
    );
    expect(catalogs.todayEdition).toHaveBeenLastCalledWith(true);
    expect(host(root, 'edition-plate')).toHaveLength(0);
    expect(host(root, 'edition-missing')).toHaveLength(1);
    expect(host(root, 'edition-toolbar')).toHaveLength(0);
  });
  test.each(['missing', 'offline', 'server'] as const)(
    '%s has a visible state and no reading controls',
    async (state) => {
      jest.mocked(catalogs.todayEdition).mockResolvedValue(
        state === 'missing'
          ? missing
          : {
              ...missing,
              status: 'error',
              error: new ApiError(state, 'unavailable'),
            },
      );
      const { root } = await render(<EditionStory />);
      expect(
        host(root, state === 'missing' ? 'edition-missing' : 'edition-error'),
      ).toHaveLength(1);
      expect(host(root, 'edition-toolbar')).toHaveLength(0);
    },
  );
  test('loading does not show an empty page', async () => {
    jest.mocked(catalogs.todayEdition).mockReturnValue(new Promise(() => {}));
    const { root } = await render(<EditionStory />);
    expect(host(root, 'edition-loading')).toHaveLength(1);
  });
});

test('archive pixels come from the local cache and credit survives a failed image', async () => {
  const photograph = Object.values(
    decodePictures(
      JSON.parse(
        readFileSync(
          resolve(__dirname, '../../portal/public/years/pictures.json'),
          'utf8',
        ),
      ),
    ),
  ).flat()[0]!;
  const renderer = await render(<ArchivePhotograph photograph={photograph} />);
  const { root } = renderer;
  expect(yearPictures.get).toHaveBeenCalled();
  expect(root.findByType(Image).props.source.uri).toMatch(/^file:\/\//);
  act(() => root.findByType(Image).props.onError());
  expect(root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).toContain(photograph.credit);
});

test('money and people keep category bands and incoming edition links stay native', async () => {
  const { root } = await render(<Plate edition={person} />);
  expect(
    StyleSheet.flatten(host(root, 'today-edition-plate')[0]!.props.style)
      .backgroundColor,
  ).toEqual(colors.bandPeople);
  expect(fromWebPath('/edition?id=2026-11-08')).toEqual(
    editionRoute('2026-11-08'),
  );
});
