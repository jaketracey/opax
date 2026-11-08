/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation and Skia are inert hosts in component tests. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactElement } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Dimensions, Image, Platform, StyleSheet, View } from 'react-native';
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
import { SourceLine, SourceSheet } from '../src/design/source';
import { FigureBlock } from '../src/design/record';
import { Card } from '../src/design/card';

import { MachinePill } from '../src/design/labels';
import { BarSeries, StageTimeline, VoteSplit } from '../src/design/charts';
import { BillRow, LinkRow, ValueRow } from '../src/design/rows';
import { ContentUnavailable, Skeleton } from '../src/design/states';
import { Text } from '../src/design/text';
import { PersonRow } from '../src/design/people';
import { colors } from '../src/design/tokens';
import { symbols } from '../src/design/symbols';
import { EditionCard } from '../src/features/edition/EditionCard';
import { EditionStory } from '../src/features/edition/EditionStory';
import { Plate, ArchivePhotograph } from '../src/features/edition/Plate';
import {
  editionQuestion,
  editionSubject,
  editionTier,
  editionSources,
  editionSourceRows,
  eventDay,
  plainSourceRow,
  plateLine,
  timelineProvenance,
  EDITION_RULE,
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
let mockGroupedSurfaces = true;
jest.mock('../src/design/flags', () => ({
  designFlags: Object.defineProperty(
    { ...jest.requireActual('../src/design/flags').designFlags },
    'groupedSurfaces',
    { get: () => mockGroupedSurfaces },
  ),
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
let mockCanShare = true;
jest.mock('../src/navigation/share', () => ({
  get canShare() {
    return mockCanShare;
  },
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
function openedSourceDetails(root: ReactTestInstance, id: string) {
  const route = jest.mocked(router.push).mock.calls.at(-1)?.[0] as
    | { pathname: string; params?: { key?: string } }
    | undefined;
  if (route) {
    // The sheets lane replaces the in-place sheet with a registry entry.
    expect(route.pathname).toBe('/source');
    expect(route.params?.key).toEqual(expect.any(String));
    const { sheetPayload } = jest.requireActual('../src/navigation/sheets');
    const payload = sheetPayload(route.params?.key, 'source');
    expect(payload?.kind).toBe('source');
    return payload.details;
  }
  const sheet = root
    .findAllByType(SourceSheet)
    .find((node) => node.props.testID === `${id}-sheet`)!;
  expect(sheet.props.visible).toBe(true);
  return sheet.props;
}
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
  mockCanShare = true;
  mockGroupedSurfaces = true;
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

describe('edition source payloads', () => {
  test.each([
    'bill',
    'politician',
    'topic',
    'program',
    'grant',
    'largest',
  ] as const)('%s cites the published edition and its rule', (kind) => {
    const view = { ...edition, kind };
    const source = editionSources(view);
    expect(source.originals).toContainEqual({
      label: 'OPAX daily edition',
      url: view.path,
      asOf: view.date,
    });
    // Today 7.2: the rule has its own group; no licence text in the sheet.
    expect(source.rule).toBe(EDITION_RULE);
    expect(source.notes).toEqual([
      'Explanatory memorandum on ParlInfo',
      'Bill home page on ParlInfo',
    ]);
    expect(JSON.stringify(source)).not.toMatch(/CC BY/);
    expect(source.originals!.map((original) => original.url)).toEqual(
      ['program', 'grant', 'largest'].includes(kind)
        ? [view.path, 'https://www.grants.gov.au/']
        : [view.path],
    );
  });
  test('an award identifies its GA record at the existing GrantConnect register URL', () => {
    expect(
      editionSources({
        ...edition,
        kind: 'grant',
        path: '/money/grants/federal/recipient/abn:83140439239?award=GA12345',
      }).originals,
    ).toContainEqual({
      label: 'GrantConnect',
      url: 'https://www.grants.gov.au/',
      record: 'record GA12345',
    });
  });
  test('bill documents are added alongside the published edition', () => {
    const document = decodeBill(pinned('/bills/au-federal-r7529.json'))
      .sources[0]!;
    const original = {
      label: 'Explanatory memorandum',
      url: document.url,
      asOf: document.document_date,
    };
    const details = editionSources(edition, [original]);
    expect(details.originals).toEqual([
      { label: 'OPAX daily edition', url: edition.path, asOf: edition.date },
      original,
    ]);
    // The row that names the listed document is not repeated as a note.
    expect(details.notes).toEqual(['Bill home page on ParlInfo']);
  });
});

describe('edition page text helpers', () => {
  test('source row titles drop their licence and keep the words as published', () => {
    expect(
      plainSourceRow('Explanatory memorandum on ParlInfo, CC BY-NC-ND 4.0'),
    ).toBe('Explanatory memorandum on ParlInfo');
    expect(plainSourceRow('AEC Transparency Register, CC BY 4.0')).toBe(
      'AEC Transparency Register',
    );
    expect(plainSourceRow('GrantConnect (CC BY 3.0 AU)')).toBe('GrantConnect');
    expect(plainSourceRow('Wikimedia Commons, public domain')).toBe(
      'Wikimedia Commons',
    );
    expect(plainSourceRow('Hansard, 18 August 2026')).toBe(
      'Hansard, 18 August 2026',
    );
    expect(plainSourceRow('CC BY 4.0')).toBe('CC BY 4.0');
  });
  test('source rows are all dated or none are', () => {
    const view = {
      sourceRows: [
        'Explanatory memorandum on ParlInfo, CC BY-NC-ND 4.0',
        'Bill home page on ParlInfo, CC BY-NC-ND 4.0',
      ],
    };
    const memo = {
      label: 'Explanatory memorandum',
      url: 'https://a.example/em',
    };
    const home = {
      label: 'Bill home page',
      url: 'https://a.example/home',
      asOf: '2026-08-12',
    };
    const mixed = editionSourceRows(view, [memo, home]);
    expect(mixed.map((row) => row.title)).toEqual([
      'Explanatory memorandum on ParlInfo',
      'Bill home page on ParlInfo',
    ]);
    expect(mixed.map((row) => row.original)).toEqual([memo, home]);
    expect(mixed.every((row) => row.date === undefined)).toBe(true);
    const dated = editionSourceRows(view, [
      { ...memo, asOf: '2026-08-11' },
      home,
    ]);
    expect(dated.map((row) => row.date)).toEqual(['2026-08-11', '2026-08-12']);
  });
  test('the plate line keeps only sentences the paragraphs below do not say', () => {
    const line = 'This bill would keep funding grants. Passed 18 Sep 2026.';
    expect(
      plateLine(line, [
        'This bill would keep funding grants.',
        'Passed 18 Sep 2026.',
      ]),
    ).toBeNull();
    expect(plateLine(line, ['This bill would keep  funding grants.'])).toBe(
      'Passed 18 Sep 2026.',
    );
    expect(plateLine(line)).toBe(line);
    expect(plateLine('Liberal · Mitchell, NSW', ['Something else.'])).toBe(
      'Liberal · Mitchell, NSW',
    );
    expect(plateLine(null, ['x'])).toBeNull();
  });
  test('the timeline caption covers its first and latest stage, with no source suffix', () => {
    expect(eventDay('12 Aug 2026')).toBe('2026-08-12');
    expect(eventDay('5 September 2026')).toBe('2026-09-05');
    expect(eventDay('2026-09-18')).toBe('2026-09-18');
    expect(eventDay('sometime')).toBeNull();
    expect(
      timelineProvenance({
        date: '2026-10-04',
        facts: {
          ...edition.facts,
          events: [
            { date: '12 Aug 2026', text: 'Introduced' },
            { date: '18 Sep 2026', text: 'Royal Assent' },
          ],
        },
      }),
    ).toEqual({
      dateRange: { start: '2026-08-12', end: '2026-09-18' },
      source: '',
    });
  });
});

describe('money edition Ask drafts', () => {
  test('Largest grants asks about government grants, without the editorial title', () => {
    expect(
      editionQuestion({
        ...edition,
        kind: 'largest',
        title: 'Largest grants in October',
      }),
    ).toBe('What has parliament said about government grants this year?');
  });
  test.each([
    ['Program: Community support', null],
    ['Grant program · Community support', null],
    ['Grant award · Mitchell, NSW', 'Program: Community support'],
    [
      null,
      'Award value · Program · Community support · Agreement starts 4 Oct 2026',
    ],
  ])(
    'an award drafts about its explicitly recorded program (%s, %s)',
    (kicker, line) => {
      expect(
        editionQuestion({
          ...edition,
          kind: 'grant',
          facts: { ...edition.facts, kicker, line },
        }),
      ).toBe('What has parliament said about Community support?');
    },
  );
  test('an award without a named program keeps its title and does not mistake the seat for a program', () => {
    expect(
      editionQuestion({
        ...edition,
        kind: 'grant',
        title: 'GA12345: Recipient',
        facts: {
          ...edition.facts,
          kicker: 'Grant award · Mitchell, NSW',
          line: 'Support for community services',
        },
      }),
    ).toBe('What has parliament said about GA12345: Recipient?');
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
    jest.mocked(router.push).mockClear();
    expect(root.findByType(SourceLine).props.onPress).toBeUndefined();
    await press(root, 'today-edition-sources');
    const details = openedSourceDetails(root, 'today-edition-sources');
    expect(details.originals).toContainEqual({
      label: 'OPAX daily edition',
      url: edition.path,
      asOf: edition.date,
    });
    expect(details.originals).toContainEqual(
      expect.objectContaining({
        label: 'Explanatory memorandum',
        url: expect.stringContaining('parlinfo.aph.gov.au/parlInfo/'),
      }),
    );
    expect(openOnWeb).not.toHaveBeenCalled();
  });
  test.each([true, false])(
    'Share accessibility action follows canShare=%s',
    async (enabled) => {
      mockCanShare = enabled;
      const { root } = await render(
        <EditionCard edition={ready} today="2026-10-05" />,
      );
      const card = root.findByType(Card);
      expect(
        card.props.accessibilityActions.map(
          (action: { name: string }) => action.name,
        ),
      ).toEqual(enabled ? ['Sources', 'Share'] : ['Sources']);
      if (enabled) {
        act(() =>
          card.props.accessibilityActions
            .find((action: { name: string }) => action.name === 'Share')
            .onAction(),
        );
        expect(shareRecord).toHaveBeenCalledWith({
          path: edition.path,
          title: edition.title,
        });
      } else
        expect(
          card.props.menu.some(
            (item: { title: string }) => item.title === 'Share',
          ),
        ).toBe(false);
    },
  );
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
    expect(root.findByType(SourceLine).props.rule).toBe(EDITION_RULE);
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
    expect(root.findByType(Skeleton).props).toMatchObject({
      shape: 'text',
      count: 3,
    });
    expect(
      root
        .findAllByType(View)
        .some((view) => StyleSheet.flatten(view.props.style)?.height === 196),
    ).toBe(true);
    expect(
      StyleSheet.flatten(
        host(root, 'today-edition-loading-source')[0]!.props.style,
      ).height,
    ).toBe(14);
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
  test.each([true, false])(
    'page ground follows groupedSurfaces=%s',
    async (grouped) => {
      mockGroupedSurfaces = grouped;
      const { root } = await render(<EditionStory />);
      expect(
        StyleSheet.flatten(root.findAllByType(View)[0]!.props.style)
          .backgroundColor,
      ).toEqual(grouped ? colors.sunken : colors.paper);
    },
  );
  test('source notes retain standard row metrics and verbatim labels', async () => {
    jest
      .mocked(catalogs.todayEdition)
      .mockResolvedValue({ ...ready, data: person });
    const { root } = await render(<EditionStory />);
    expect(host(root, 'edition-source-rows')).toHaveLength(1);
    person.sourceRows.forEach((label, i) => {
      const row = root
        .findAllByType(ValueRow)
        .find((node) => node.props.testID === `edition-source-${i}`)!;
      expect(row.props).toMatchObject({ label, value: '' });
      const style = StyleSheet.flatten(
        host(root, `edition-source-${i}`)[0]!.props.style,
      );
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.paddingVertical).toBeGreaterThan(0);
    });
  });
  test.each(['edition-sources'])('%s opens its own originals', async (id) => {
    const { root } = await render(<EditionStory />);
    // One SourceLine on a bill day: the timeline's caption dates it, and
    // the foot line sources the page.
    expect(root.findAllByType(SourceLine)).toHaveLength(1);
    const line = root
      .findAllByType(SourceLine)
      .find((node) => node.props.testID === id)!;
    expect(line.props.onPress).toBeUndefined();
    await press(root, id);
    const details = openedSourceDetails(root, id);
    expect(details).toMatchObject({
      asOf: edition.date,
      originals: line.props.originals,
    });
    expect(details.originals).toEqual(
      expect.arrayContaining([
        {
          label: 'OPAX daily edition',
          url: edition.path,
          asOf: edition.date,
        },
        expect.objectContaining({
          label: 'Explanatory memorandum',
          url: expect.stringContaining('parlinfo.aph.gov.au/parlInfo/'),
        }),
      ]),
    );
    expect(details.rule).toBe(EDITION_RULE);
    expect(details.notes ?? []).not.toContain(EDITION_RULE);
  });
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
    expect(root.findAllByType(SourceLine)[0]!.props.originals).toContainEqual({
      label: 'OPAX daily edition',
      url: edition.path,
      asOf: edition.date,
    });
    expect(openOnWeb).not.toHaveBeenCalled();
    act(() =>
      host(root, 'edition-screen')[0]!.props.onScroll({
        nativeEvent: { contentOffset: { y: 240 } },
      }),
    );
    expect(mockOnScroll).toHaveBeenCalledWith(240);
    expect(root.findByType(Plate).props.onTitleLayout).toBe(mockOnTitleLayout);
  });
  test('bar holds Share then More with its three items; Ask about this is a row that drafts', async () => {
    const { root } = await render(<EditionStory />);
    const options = root.findByType(Stack.Screen).props.options;
    const items = options.unstable_headerRightItems();
    expect(items.map((item: { label: string }) => item.label)).toEqual([
      'Share',
      'More',
    ]);
    expect(
      items[1].menu.items.map((item: { label: string }) => item.label),
    ).toEqual(['Copy link', 'Open on opax.com.au', 'How this is chosen']);
    const ask = root
      .findAllByType(LinkRow)
      .find((row) => row.props.testID === 'edition-ask')!;
    expect(ask.props).toMatchObject({
      title: 'Ask about this',
      symbol: symbols.ask,
    });
    act(() => ask.props.onPress());
    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          question: editionQuestion(root.findByType(Plate).props.edition),
        }),
      }),
    );
    expect(catalogs.todayEdition).toHaveBeenCalledTimes(1);
    act(() => items[0].onPress());
    expect(shareRecord).toHaveBeenCalledWith({
      title: edition.title,
      path: edition.path,
    });
    expect(openOnWeb).not.toHaveBeenCalled();
    act(() => items[1].menu.items[1].onPress());
    expect(openOnWeb).toHaveBeenCalledWith(edition.path, edition.title);
  });
  test('iOS draws no bottom toolbar, which the floating tab bar would cover', async () => {
    Platform.OS = 'ios';
    const { root } = await render(<EditionStory />);
    expect(root.findAllByType(Stack.Toolbar)).toHaveLength(0);
    expect(host(root, 'edition-ask')).toHaveLength(1);
  });
  test('the bill subject is a BillRow that pushes the bill, not a RowLink href', async () => {
    const { root } = await render(<EditionStory />);
    const row = root
      .findAllByType(BillRow)
      .find((node) => node.props.testID === 'edition-subject')!;
    expect(row.props.href).toBeUndefined();
    act(() => row.props.onPress());
    expect(router.push).toHaveBeenLastCalledWith(billRoute('au-federal-r7529'));
  });
  test('the plate shows no detail line that repeats the paragraphs below it', async () => {
    const { root } = await render(<EditionStory />);
    const shown = edition.paragraphs.join(' ');
    const line = host(root, 'edition-plate-line')[0]?.props.children;
    if (line) expect(shown).not.toContain(line);
    expect(root.findByType(Plate).props.shownBelow).toEqual(edition.paragraphs);
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
      ).toBeUndefined();
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
    await press(root, 'edition-subject');
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: '/topic/[slug]',
        params: expect.objectContaining({ slug: 'housing' }),
      }),
    );
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
      originals: expect.arrayContaining([
        expect.objectContaining({
          label: 'GrantConnect',
          url: 'https://www.grants.gov.au/',
        }),
      ]),
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
      expect(root.findByType(ContentUnavailable).props.action).toEqual(
        state === 'server'
          ? { label: 'Try again', onPress: expect.any(Function) }
          : undefined,
      );
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
  const credit = root.findByType(Text);
  expect(credit.props.children.join('')).toBe(`Photo: ${photograph.credit}`);
});

test('plate art starts 16 pt after the detail line', async () => {
  const { root } = await render(<Plate edition={edition} />);
  const gap = StyleSheet.flatten(
    host(root, 'today-edition-plate')[0]!.props.style,
  ).gap;
  const margin = StyleSheet.flatten(
    host(root, 'today-edition-art')[0]!.props.style,
  ).marginTop;
  expect(Number(gap) + Number(margin)).toBe(16);
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
