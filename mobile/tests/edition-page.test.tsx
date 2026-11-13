import { RouteOptions } from '../src/navigation/preview';
/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation and Skia are inert hosts in component tests. */
import { router, Stack } from 'expo-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactElement } from 'react';
import { Dimensions, Image, Platform, StyleSheet, View } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import editionJSON from '../scripts/fixtures/edition-latest.json';
import personJSON from '../scripts/fixtures/edition-politician.json';
import {
  decodeBill,
  decodeEdition,
  editionFor,
  type Block,
  type EditionView,
} from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { catalogs, yearPictures } from '../src/api/runtime';
import { Card } from '../src/design/card';
import { copy } from '../src/design/copy';
import { FigureBlock } from '../src/design/record';
import {
  SourceAffordance,
  SourceLine,
  SourceSheet,
} from '../src/design/source';
import { bills, pinned, roster, slugs } from './pinned';

import {
  BarSeries,
  ShareBar,
  StageTimeline,
  VoteSplit,
} from '../src/design/charts';
import { MachinePill } from '../src/design/labels';
import { PersonRow } from '../src/design/people';
import { bindRecordTitle } from '../src/design/record-title';
import { BillRow, LinkRow, ValueRow } from '../src/design/rows';
import { ContentUnavailable, Skeleton } from '../src/design/states';
import { symbols } from '../src/design/symbols';
import { Text } from '../src/design/text';
import { colors, textStyles } from '../src/design/tokens';
import { EditionCard } from '../src/features/edition/EditionCard';
import { EditionStory } from '../src/features/edition/EditionStory';
import { ArchivePhotograph, Plate } from '../src/features/edition/Plate';
import {
  EDITION_RULE,
  editionQuestion,
  editionSourceRows,
  editionSources,
  editionSubject,
  editionTier,
  eventDay,
  plainSourceRow,
  plateLine,
  timelineProvenance,
} from '../src/features/edition/model';
import { decodePictures } from '../src/features/explore/pictures';
import { fromWebPath, openOnWeb } from '../src/navigation/external';
import { billRoute } from '../src/navigation/routes/bills';
import { editionRoute } from '../src/navigation/routes/edition';
import {
  grantProgramRoute,
  largestGrantsRoute,
  moneyItemRoute,
} from '../src/navigation/routes/public-money';
import { shareRecord } from '../src/navigation/share';
import RuleSheet from '../src/features/sheets/RuleSheet';
import { sheetPayload } from '../src/navigation/sheets';

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
let mockParams: Record<string, string> = {};
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
    useLocalSearchParams: () => mockParams,
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
// The subject row (BillRow, PersonRow or LinkRow) opens its page by href,
// through RowLink's native preview: the destination is the row's href.
const subjectHref = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        [BillRow, PersonRow, LinkRow].includes(node.type as never) &&
        node.props.testID === 'edition-subject',
    )
    .map((node) => node.props.href as unknown)[0];
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
  mockParams = {};
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
      'Passed 18 Sep 2026',
    );
    expect(plateLine(line)).toBe(line.slice(0, -1));
    expect(plateLine('Liberal · Mitchell, NSW', ['Something else.'])).toBe(
      'Liberal · Mitchell, NSW',
    );
    expect(plateLine(null, ['x'])).toBeNull();
  });
  test('a bill rail already showing its latest stage uses the portfolio as the detail', () => {
    const bill = {
      ...edition,
      kind: 'bill' as const,
      facts: {
        ...edition.facts,
        kicker: 'Bill · Education portfolio',
        events: [{ date: '18 Sep 2026', text: 'Royal Assent' }],
      },
    };
    expect(plateLine('Passed 18 Sep 2026.', [], bill)).toBe(
      'Education portfolio',
    );
    expect(
      plateLine('Passed 18 Sep 2026.', [], {
        ...bill,
        facts: { ...bill.facts, kicker: null },
      }),
    ).toBeNull();
    expect(
      plateLine('Passed 18 Sep 2026.', [], {
        ...bill,
        facts: { ...bill.facts, events: [] },
      }),
    ).toBe('Passed 18 Sep 2026');
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
      citation: '',
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
  test('the Sources accessibility action opens the displayed edition with its original documents and saved-copy note', async () => {
    const { root } = await render(
      <EditionCard
        edition={{ ...ready, stale: true, savedAt: 1794000000000 }}
        today="2026-10-05"
      />,
    );
    const action = root
      .findByType(Card)
      .props.accessibilityActions.find(
        (item: { name: string }) => item.name === 'Sources',
      );
    act(() => action.onAction());
    const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      pathname: string;
      params?: { key?: string };
    };
    expect(route.pathname).toBe('/source');
    const payload = sheetPayload(route.params?.key, 'source');
    expect(payload?.details.asOf).toBe(edition.date);
    expect(payload?.details.originals).toContainEqual(
      expect.objectContaining({ label: 'Explanatory memorandum' }),
    );
    expect(payload?.details.notes).toContain(copy.savedCopyNote(1794000000000));
  });
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
  test.each([1, 3.12])(
    'the edition detail takes the kicker cap at AX sizes, scale %s',
    async (fontScale) => {
      Platform.OS = 'ios';
      const window = { width: 390, height: 844, scale: 3, fontScale };
      Dimensions.set({ window, screen: window });
      const { root } = await render(
        <EditionCard edition={ready} today="2026-10-05" />,
      );
      const line = host(root, 'today-edition-line')[0]!;
      expect(line.props.children).toBe('Education portfolio');
      expect(line.props.allowFontScaling).toBe(true);
      expect(line.props.dynamicTypeRamp).toBe('subheadline');
      expect(line.props.maxFontSizeMultiplier).toBe(fontScale >= 2 ? 1.353 : 0);
      expect(line.props.numberOfLines).toBeUndefined();
      expect(
        root
          .findAllByType(Text)
          .find((n) => n.props.testID === 'today-edition-line')!.props.wordSafe,
      ).toBe(true);
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
      bindRecordTitle(edition.title),
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
    expect(subjectHref(root)).toEqual(billRoute('au-federal-r7529'));
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
    act(() =>
      host(root, 'edition-screen')[0]!.props.onScroll({
        nativeEvent: { contentOffset: { y: -96 } },
      }),
    );
    expect(mockOnScroll).toHaveBeenLastCalledWith(-96);
    expect(root.findByType(Plate).props.onTitleLayout).toBe(mockOnTitleLayout);
  });
  test.each(['ios', 'android'] as const)(
    '%s bar holds Share then More with the website wording intact at AX5; Ask about this drafts',
    async (platform) => {
      Platform.OS = platform;
      Dimensions.set({
        window: { width: 390, height: 844, scale: 3, fontScale: 3.1 },
        screen: { width: 390, height: 844, scale: 3, fontScale: 3.1 },
      });
      const { root } = await render(<EditionStory />);
      const options = root.findByType(RouteOptions).props.options;
      const items = options.unstable_headerRightItems();
      expect(items.map((item: { label: string }) => item.label)).toEqual([
        'Share',
        'More',
      ]);
      expect(
        items[1].menu.items.map((item: { label: string }) => item.label),
      ).toEqual(['Copy link', 'How this is chosen', 'Open on opax.com.au']);
      expect(items[1]).toMatchObject({
        type: 'menu',
        accessibilityLabel: 'More for Daily edition',
      });
      expect(items[1].menu.items[1].label).not.toMatch(/[\n\r\u200b\u00ad]/u);
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
      act(() =>
        items[1].menu.items
          .find(
            (item: { label: string }) => item.label === 'Open on opax.com.au',
          )
          .onPress(),
      );
      expect(openOnWeb).toHaveBeenCalledWith(edition.path, edition.title);
    },
  );
  test.each(['ios', 'android'] as const)(
    '%s How this is chosen presents the edition rule and draws its content at AX5',
    async (platform) => {
      Platform.OS = platform;
      Dimensions.set({
        window: { width: 390, height: 844, scale: 3, fontScale: 3.1 },
        screen: { width: 390, height: 844, scale: 3, fontScale: 3.1 },
      });
      const { root } = await render(<EditionStory />);
      const items = root
        .findByType(RouteOptions)
        .props.options.unstable_headerRightItems();
      const action = items[1].menu.items.find(
        (item: { label: string }) => item.label === 'How this is chosen',
      );
      act(() => action.onPress());
      const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
        pathname: string;
        params: { key: string };
      };
      expect(route).toEqual({
        pathname: '/rule',
        params: { key: expect.any(String) },
      });
      expect(sheetPayload(route.params.key, 'rule')).toMatchObject({
        kind: 'rule',
        title: 'How this is chosen',
        rule: EDITION_RULE,
      });
      mockParams = route.params;
      const sheet = await render(<RuleSheet />);
      expect(
        sheet.root.findAllByType(Text).map((n) => n.props.children),
      ).toContain(EDITION_RULE);
      expect(sheet.root.findAllByType(ContentUnavailable)).toHaveLength(0);
      expect(sheet.root.findByType(RouteOptions).props.options.title).toBe(
        'How this is chosen',
      );
    },
  );
  test('iOS draws no bottom toolbar, which the floating tab bar would cover', async () => {
    Platform.OS = 'ios';
    const { root } = await render(<EditionStory />);
    expect(root.findAllByType(Stack.Toolbar)).toHaveLength(0);
    expect(host(root, 'edition-ask')).toHaveLength(1);
  });
  test('the bill subject is a BillRow with the bill as its href, so it keeps its preview', async () => {
    const { root } = await render(<EditionStory />);
    const row = root
      .findAllByType(BillRow)
      .find((node) => node.props.testID === 'edition-subject')!;
    expect(row.props.href).toEqual(billRoute('au-federal-r7529'));
    expect(row.props.onPress).toBeUndefined();
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
      const row = root
        .findAllByType(LinkRow)
        .find((node) => node.props.testID === 'edition-subject')!;
      expect(row.props.href).toEqual(href);
      expect(row.props.onPress).toBeUndefined();
      expect(openOnWeb).not.toHaveBeenCalled();
    },
  );
  test('a topic report becomes a native topic row', async () => {
    jest.mocked(catalogs.todayEdition).mockResolvedValue({
      ...ready,
      data: { ...edition, kind: 'topic', path: '/reports/housing' },
    });
    const { root } = await render(<EditionStory />);
    expect(subjectHref(root)).toEqual(
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
    expect(root.findByType(FigureBlock).props.citation).toMatchObject({
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
  test('a grant edition draws a 50/50 share as one bar of two captioned halves, with its source line once', async () => {
    const grant = {
      ...edition,
      kind: 'grant' as const,
      facts: {
        ...edition.facts,
        figures: [
          { value: '$10.0m', label: 'to an invented council' },
          { value: '$20.0m', label: 'in the program' },
        ],
        bars: {
          title: 'Closed, non-competitive',
          items: [
            { label: 'Closed non-competitive', pct: 50 },
            { label: 'Everything else', pct: 50 },
          ],
          note: null,
        },
        events: [],
        division: null,
        order: [
          { type: 'figure' as const, index: 0 },
          { type: 'figure' as const, index: 1 },
          { type: 'bars' as const, index: 0 },
        ],
      },
    };
    jest
      .mocked(catalogs.todayEdition)
      .mockResolvedValue({ ...ready, data: grant });
    const { root } = await render(<EditionStory />);
    // Parts of one whole: one bar, not two full-height columns on a 50% axis.
    expect(root.findAllByType(BarSeries)).toHaveLength(0);
    const share = root.findByType(ShareBar);
    expect(
      share.props.parts.map((part: { value: number }) => part.value),
    ).toEqual([50, 50]);
    const captions = [0, 1].map(
      (index) =>
        host(root, `edition-fact-2-share-caption-${index}`)[0]!.props.children,
    );
    expect(captions).toEqual(['50%', '50%']);
    expect(
      host(root, 'edition-fact-2-share-parts')[0]!.props.accessibilityLabel,
    ).toBe('Closed non-competitive, 50%. Everything else, 50%.');
    // Two figure cards and the chart carry the same line; it shows once.
    const lines = root
      .findAllByType(SourceAffordance)
      .filter((line) =>
        String(line.props.accessibilityLabel).includes('OPAX daily edition'),
      );
    expect(lines).toHaveLength(1);
    expect(root.findAllByType(SourceLine).length).toBeGreaterThanOrEqual(3);
  });
  test('with a chart before a figure, the one source line shown opens the full sheet', async () => {
    const grant = {
      ...edition,
      kind: 'grant' as const,
      path: '/money/grants/federal/recipient/R1?award=GA1',
      facts: {
        ...edition.facts,
        figures: [{ value: '$10.0m', label: 'to an invented council' }],
        bars: {
          title: 'Topic labels',
          items: [
            { label: 'Health', pct: 60 },
            { label: 'Roads', pct: 20 },
          ],
          note: null,
        },
        events: [],
        division: null,
        order: [
          { type: 'bars' as const, index: 0 },
          { type: 'figure' as const, index: 0 },
        ],
      },
    };
    jest
      .mocked(catalogs.todayEdition)
      .mockResolvedValue({ ...ready, data: grant });
    const { root } = await render(<EditionStory />);
    const shown = root
      .findAllByType(SourceAffordance)
      .filter((line) =>
        String(line.props.accessibilityLabel).includes('OPAX daily edition'),
      );
    expect(shown).toHaveLength(1);
    // The chart's line is the one kept, and it carries the figures' sheet.
    expect(shown[0]!.props.testID).toBe('edition-fact-0-sources');
    await press(root, 'edition-fact-0-sources');
    const details = openedSourceDetails(root, 'edition-fact-0-sources');
    expect(details.originals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'OPAX daily edition' }),
        expect.objectContaining({
          label: 'GrantConnect',
          record: 'record GA1',
        }),
      ]),
    );
    expect(details.rule).toEqual(expect.any(String));
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

test('edition story has one continuous rail, a footnote date range and says the passed outcome once', async () => {
  const { root } = await render(<EditionStory />);
  expect(host(root, 'stage-timeline-rail')).toHaveLength(1);
  const stages = root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessible &&
      typeof node.props.onLayout === 'function' &&
      /, (?:12 Aug|10 Sep|14 Sep|15 Sep|18 Sep) 2026/.test(
        node.props.accessibilityLabel ?? '',
      ),
  );
  expect(stages).toHaveLength(5);
  act(() =>
    stages.forEach((node, index) =>
      node.props.onLayout({
        nativeEvent: { layout: { y: index * 80, height: 64 } },
      }),
    ),
  );
  const rail = StyleSheet.flatten(
    host(root, 'stage-timeline-rail')[0]!.props.style,
  );
  expect(rail).toMatchObject({
    width: 2,
    top: textStyles.footnote.lineHeight / 2,
  });
  expect(rail.bottom).toBe(64 - textStyles.footnote.lineHeight / 2);
  expect(
    StyleSheet.flatten(
      host(root, 'stage-timeline-rail-complete')[0]!.props.style,
    ).height,
  ).toBe(320);
  const caption = root
    .findAllByType(Text)
    .find((node) => node.props.testID === 'stage-timeline-caption')!;
  expect(caption.props.variant).toBe('footnote');
  expect(caption.props.children).toBe('12 August 2026 to 18 September 2026');
  const drawn = root
    .findAll((node) => node.type === 'Text')
    .flatMap((node) => node.props.children)
    .filter((value) => typeof value === 'string')
    .join(' ');
  expect(drawn.match(/Passed 18 Sep 2026\./g)).toHaveLength(1);
});

test('AX5 plate detail stays below the title size and both stage ends share one left-aligned line', async () => {
  const window = { width: 402, height: 874, scale: 3, fontScale: 3.571 };
  Dimensions.set({ window, screen: window });
  const { root } = await render(
    <EditionCard edition={ready} today="2026-10-05" />,
  );
  const title = host(root, 'today-edition-title')[0]!;
  expect(title.props.allowFontScaling).toBe(false);
  const titleSize = StyleSheet.flatten(title.props.style).fontSize;
  for (const id of [
    'today-edition-line',
    'today-edition-kicker',
    'today-edition-art-ends',
  ]) {
    const line = host(root, id)[0]!;
    expect(line.props.maxFontSizeMultiplier).toBe(1.353);
    expect(
      Number(StyleSheet.flatten(line.props.style).fontSize) *
        line.props.maxFontSizeMultiplier,
    ).toBeLessThanOrEqual(titleSize);
  }
  const ends = host(root, 'today-edition-art-ends')[0]!;
  expect(ends.props).toMatchObject({
    numberOfLines: 2,
    adjustsFontSizeToFit: true,
  });
  expect(StyleSheet.flatten(ends.props.style).textAlign).toBe('left');
  expect(ends.props.children.join('')).toBe(
    'Introduced 12 Aug · Royal Assent 18 Sep',
  );
});

test('AX5: a long first stage name wraps to a second line, never an ellipsis; default sizes keep one row', async () => {
  const long = {
    ...ready,
    data: {
      ...edition,
      facts: {
        ...edition.facts,
        events: [
          {
            date: '12 Aug 2026',
            text: 'Second reading amendments agreed in the Senate',
          },
          { date: '18 Sep 2026', text: 'Royal Assent' },
        ],
      },
    },
  };
  const ax5 = { width: 402, height: 874, scale: 3, fontScale: 3.571 };
  Dimensions.set({ window: ax5, screen: ax5 });
  const { root } = await render(
    <EditionCard edition={long} today="2026-10-05" />,
  );
  const ends = host(root, 'today-edition-art-ends')[0]!;
  expect(ends.props.children.join('')).toBe(
    'Second reading amendments agreed 12 Aug · Royal Assent 18 Sep',
  );
  expect(ends.props.numberOfLines).toBe(2);
  // Shrinking stays a last resort, capped at 75 %; nothing truncates the
  // head or middle of the line.
  expect(ends.props.minimumFontScale).toBe(0.75);
  expect(ends.props.ellipsizeMode ?? 'tail').toBe('tail');
  expect(StyleSheet.flatten(ends.props.style).textAlign).toBe('left');

  // Default text size: the two ends sit in one row, each its own line.
  const standard = { width: 402, height: 874, scale: 3, fontScale: 1 };
  // The AX5 card is still mounted, and redraws at the new size.
  act(() => Dimensions.set({ window: standard, screen: standard }));
  const { root: plain } = await render(
    <EditionCard edition={long} today="2026-10-05" />,
  );
  expect(host(plain, 'today-edition-art-ends')).toHaveLength(0);
  const row = plain
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        StyleSheet.flatten(node.props.style)?.justifyContent ===
          'space-between' &&
        StyleSheet.flatten(node.props.style)?.flexDirection === 'row',
    )
    .find((node) =>
      node
        .findAll((child) => typeof child.type === 'string')
        .some((child) =>
          [child.props.children]
            .flat()
            .join('')
            .includes('Second reading amendments agreed'),
        ),
    );
  expect(row).toBeDefined();
});
