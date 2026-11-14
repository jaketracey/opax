import { CrossfadeLayers } from '../src/design/states';
import { SectionHeader } from '../src/design/layout';
import { SourceAffordance } from '../src/design/source';
import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import {
  BillRow,
  Button,
  FollowButton,
  LinkRow,
  PartyLabel,
} from '../src/design/primitives';
import { SegmentedPicker } from '../src/design/controls';
import BillDetail, { rulerPoints } from '../src/features/bills/BillDetail';
import BillsList from '../src/features/bills/BillsList';
import { ScopeChips } from '../src/features/search/ScopeChips';
import { billTextRoute } from '../src/navigation/routes';
import { divisionHistoryRoute } from '../src/navigation/routes/bills';
import { pinned, slugs } from './pinned';
import { filterStore } from '../src/features/sheets/filter-model';
import * as sharing from '../src/navigation/share';
import { menuTitle } from '../src/design/menu-title';

// Design pass 5, lane C (bills): the bill header's actions (P1-3), the
// shared bill row (P2-8), a lapsed bill's last stop (P2-9), the list's
// controls before its first row (P2-19) and the ⋯ menu's copy (P3-12).
const mockParams: { key?: string; bill?: string; scope?: string; q?: string } =
  {};
// Every Stack.Screen's options, newest last: the bar's items live there.
const mockScreens: Record<string, unknown>[] = [];
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  // The bill page's bottom toolbar, and rows that link through Link.
  Stack: {
    Screen: ({ options }: { options?: Record<string, unknown> }) => {
      if (options) mockScreens.push(options);
      return null;
    },
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    billIndexRow: () => null,
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
const mock = jest.mocked(runtime);
const window = (width: number, fontScale: number) =>
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width, height: 874, scale: 3, fontScale });
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.key;
  delete mockParams.bill;
  delete mockParams.scope;
  delete mockParams.q;
  mockScreens.length = 0;
  window(402, 1);
  mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => fixture.roster());
  mock.slugs.mockImplementation(() => fixture.slugs());
  mock.directory.mockRejectedValue(new Error('not in this test'));
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(element, (options) => {
        mockScreens.push(options);
      }),
    );
  });
  mounted.push(renderer);
  return renderer.root;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
/** Host testIDs in the order they draw. */
const order = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' && typeof node.props.testID === 'string',
    )
    .map((node) => node.props.testID as string);
const texts = (root: ReactTestInstance): string[] =>
  root.children.flatMap((child) =>
    typeof child === 'string' ? [child] : texts(child),
  );

test.each(['ios', 'android'] as const)(
  '%s bill no-result typing announces once per episode',
  async (platform) => {
    jest.useFakeTimers();
    const originalOS = Platform.OS;
    Platform.OS = platform;
    const reader = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled');
    const readerImplementation = reader.getMockImplementation()!;
    reader.mockResolvedValue(true);
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    try {
      const root = await render(<BillsList />);
      announce.mockClear();
      const search = () =>
        mockScreens.findLast((options) => options.headerSearchBarOptions)!
          .headerSearchBarOptions as {
          onChangeText: (event: { nativeEvent: { text: string } }) => void;
        };
      const type = async (text: string) => {
        await act(async () => search().onChangeText({ nativeEvent: { text } }));
        await act(async () => jest.advanceTimersByTime(150));
      };
      for (const query of ['z', 'zz', 'zzz', 'zzzz']) await type(query);
      expect(announce.mock.calls).toEqual([['No results']]);
      expect(
        host(root, 'bills-search-empty')[0]!.props.accessibilityLiveRegion,
      ).toBe('none');
      await type('');
      announce.mockClear();
      await type('zzzzz');
      expect(announce.mock.calls).toEqual([['No results']]);
      act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
    } finally {
      reader.mockImplementation(readerImplementation);
      announce.mockRestore();
      Platform.OS = originalOS;
      jest.useRealTimers();
    }
  },
);

test('the timeline reveals stages sharing dates even when every date is on the ruler', async () => {
  mockParams.key = 'au-federal-r7534';
  const record = await fixture.billFor(mockParams.key);
  mock.billFor.mockResolvedValue({
    ...record,
    data: {
      ...record.data,
      keyDates: {
        ...record.data.keyDates,
        data: [
          { stage: 'Introduced', date: '2026-10-01', house: 'representatives' },
          {
            stage: 'Second reading',
            date: '2026-10-01',
            house: 'representatives',
          },
          { stage: 'Third reading', date: '2026-10-02', house: 'senate' },
          { stage: 'Royal assent', date: '2026-10-02', house: null },
        ],
      },
    },
  });
  const root = await render(<BillDetail />);
  const disclosure = root.find(
    (node) => node.props.testID === 'bill-dates-all' && !!node.props.onPress,
  );
  await act(async () => disclosure.props.onPress());
  expect(texts(host(root, 'bill-date-0')[0]!).join(' ')).toContain(
    'Second reading',
  );
  expect(texts(host(root, 'bill-date-1')[0]!).join(' ')).toContain(
    'Third reading',
  );
});
test('How it moved has one source line: the ruler draws no date-range caption (sweep 1, item 9)', async () => {
  mockParams.key = 'au-federal-r7534';
  const record = await fixture.billFor(mockParams.key);
  mock.billFor.mockResolvedValue({
    ...record,
    data: {
      ...record.data,
      keyDates: {
        ...record.data.keyDates,
        data: [
          { stage: 'Introduced', date: '2026-08-17', house: 'representatives' },
          { stage: 'Third reading', date: '2026-08-19', house: 'senate' },
          { stage: 'Royal assent', date: '2026-08-26', house: null },
        ],
      },
    },
  });
  const root = await render(<BillDetail />);
  const section = host(root, 'bill-key-dates')[0]!;
  expect(host(section, 'stage-timeline')).toHaveLength(1);
  expect(host(section, 'stage-timeline-caption')).toHaveLength(0);
  expect(texts(section).join(' ')).not.toMatch(/\d{4} to \d{1,2} \w+ \d{4}/);
  // VoiceOver still hears every stage with its full date.
  const ruler = host(section, 'bill-dates-ruler')[0]!;
  expect(ruler.props.accessibilityLabel).toContain('17 August 2026');
  expect(ruler.props.accessibilityLabel).toContain('26 August 2026');
  // The section's dated source line is the one line under it.
  expect(host(section, 'bill-dates-source')).not.toHaveLength(0);
});
/** The bar's trailing items, from the newest Stack.Screen options. */
function barItems() {
  const options = mockScreens.findLast(
    (o) => typeof o.unstable_headerRightItems === 'function',
  );
  return (
    options!.unstable_headerRightItems as () => {
      type: string;
      label: string;
      menu?: { items: { label: string }[] };
    }[]
  )();
}

describe('bill header (P1-3)', () => {
  // At accessibility sizes the shared Button takes the column's width, so
  // Follow hugs only below them (Follow-up: FollowToggle, specs/bills.md 4.5).
  test.each([
    ['iPhone 17 Pro', 402, 1],
    ['iPhone 16e', 390, 1],
    ['iPhone 17 Pro at AX5', 402, 3.571],
  ])(
    'on the %s: Follow has no ⋯ beside it; the bill text is a row after the header',
    async (_device, width, fontScale) => {
      window(width, fontScale);
      mockParams.key = 'au-federal-r7534';
      const root = await render(<BillDetail />);
      // The menus live in the bar; nothing in the content sits beside Follow.
      expect(host(root, 'bill-more')).toHaveLength(0);
      expect(host(root, 'bill-actions')).toHaveLength(0);
      const follow = root.findByType(FollowButton);
      expect(follow.props.testID).toBe('bill-follow');
      if (fontScale === 1) {
        const button = follow.find(
          (node) =>
            typeof node.type === 'string' &&
            node.props.testID === 'bill-follow-off',
        );
        const style = StyleSheet.flatten(
          typeof button.props.style === 'function'
            ? button.props.style({ pressed: false })
            : button.props.style,
        );
        expect(style.alignSelf).toBe('flex-start');
      }
      // No navy primary on the page's header.
      const primary = root.findAll(
        (node) => node.type === Button && node.props.variant === 'primary',
      );
      expect(primary).toHaveLength(1);
      expect(primary[0]!.props.testID).toBe('bill-ask');
      // "Bill text" is a navigation row, before the page's source line.
      const text = root.find(
        (node) =>
          node.type === LinkRow && node.props.testID === 'bill-read-text',
      );
      expect(text.props.title).toBe('Bill text');
      // Sweep 1, item 9: Ask and Bill text are one group with a single rule
      // between them and none above or below.
      const group = host(root, 'bill-ask-and-text')[0]!;
      const ruled = group.findAll(
        (node) =>
          typeof node.type === 'string' &&
          ['borderTopWidth', 'borderBottomWidth'].some(
            (side) => (StyleSheet.flatten(node.props.style) ?? {})[side] > 0,
          ),
      );
      expect(ruled.map((node) => node.props.testID)).toEqual([
        'bill-read-text-row',
      ]);
      const rule = StyleSheet.flatten(ruled[0]!.props.style);
      expect(rule.borderTopWidth).toBeGreaterThan(0);
      expect(rule.borderBottomWidth ?? 0).toBe(0);
      expect(StyleSheet.flatten(group.props.style) ?? {}).not.toHaveProperty(
        'borderTopWidth',
      );
      expect(
        group.findAll((n) => n.props.testID === 'bill-ask'),
      ).not.toHaveLength(0);
      const ids = order(root);
      expect(ids.indexOf('bill-read-text')).toBeLessThan(
        ids.indexOf('bill-source'),
      );
      act(() => text.props.onPress());
      expect(router.push).toHaveBeenCalledWith(
        billTextRoute('au-federal-r7534'),
      );
    },
  );

  test("the bar's ⋯ holds the links; Ask and Share are the toolbar (P3-12)", async () => {
    mockParams.key = 'au-federal-r7534';
    const root = await render(<BillDetail />);
    expect(root.findAllByType(ScopeChips)).toHaveLength(0);
    expect(root.findAllByProps({ testID: 'bill-share' })).toHaveLength(0);
    const menu = barItems().find((item) => item.type === 'menu')!;
    expect(menu.menu!.items.map((item) => item.label)).toEqual([
      'Copy link',
      'Open on the Parliament website',
      menuTitle('Open on opax.com.au'),
    ]);
  });
});

test('Android bills keep whole scope labels at 2x and wrap the bottom actions; iOS uses the existing picker', async () => {
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    window(402, 2);
    const list = await render(<BillsList />);
    expect(
      list
        .findByType(ScopeChips)
        .props.options.map((o: { label: string }) => o.label),
    ).toEqual(['Before parliament', 'Passed', 'All']);
    expect(list.findAllByType(SegmentedPicker)).toHaveLength(0);
    mockParams.key = 'au-federal-r7534';
    const detail = await render(<BillDetail />);
    const asks = detail
      .findAllByType(Button)
      .filter((node) => node.props.testID === 'bill-ask');
    expect(asks).toHaveLength(1);
    expect(asks[0]!.props).toMatchObject({
      variant: 'primary',
      accessibilityHint: 'Opens Ask with a question drafted',
    });
    const ids = order(detail);
    expect(ids.indexOf('bill-ask')).toBeGreaterThan(
      ids.indexOf('bill-summary'),
    );
    expect(ids.indexOf('bill-ask')).toBeLessThan(ids.indexOf('bill-read-text'));
    const toolbar = detail.find((n) => {
      if (typeof n.type !== 'string' || !n.props.style) return false;
      const style = StyleSheet.flatten(n.props.style);
      return (
        style?.flexWrap === 'wrap' && style?.justifyContent === 'space-between'
      );
    });
    expect(toolbar).toBeTruthy();
    expect(
      detail.findAllByProps({ testID: 'bill-share' }).length,
    ).toBeGreaterThan(0);
    Platform.OS = 'ios';
    const ios = await render(<BillsList />);
    expect(ios.findAllByType(ScopeChips)).toHaveLength(0);
    expect(ios.findAllByType(SegmentedPicker).length).toBeGreaterThan(0);
  } finally {
    Platform.OS = original;
  }
});

test.each([true, false])(
  'Android renders a Share toolbar only with share support: %s',
  async (enabled) => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const share = jest.replaceProperty(sharing, 'canShare', enabled);
    try {
      mockParams.key = 'au-federal-r7534';
      const detail = await render(<BillDetail />);
      const bars = detail.findAll((node) => {
        if (typeof node.type !== 'string' || !node.props.style) return false;
        const style = StyleSheet.flatten(node.props.style);
        return (
          style?.flexWrap === 'wrap' &&
          style?.justifyContent === 'space-between'
        );
      });
      expect(bars).toHaveLength(enabled ? 1 : 0);
      expect(
        detail
          .findAllByType(Button)
          .filter((node) => node.props.testID === 'bill-share'),
      ).toHaveLength(enabled ? 1 : 0);
      expect(
        detail
          .findAllByType(Button)
          .filter((node) => node.props.testID === 'bill-ask'),
      ).toHaveLength(1);
    } finally {
      share.restore();
      os.restore();
    }
  },
);

describe('how it moved: a terminal status names the last stop (P2-9)', () => {
  const entries = (last: string) => [
    {
      from: '2023-02-13',
      to: null,
      stages: [{ stage: 'Introduced', house: 'representatives', days: 1 }],
    },
    {
      from: '2023-09-05',
      to: null,
      stages: [{ stage: last, house: null, days: 1 }],
    },
  ];
  const lastLabel = (stage: string, status: string | null) =>
    rulerPoints(entries(stage), status).at(-1)!.label;

  test.each([
    ['lapsed', 'Lapsed'],
    ['withdrawn', 'Withdrawn'],
    ['negatived', 'Not agreed'],
    ['not_proceeded_with', 'Not proceeded with'],
    ['discharged', 'Discharged'],
  ])('"Other" on a %s bill reads "%s"', (status, word) => {
    expect(lastLabel('Other', status)).toBe(word);
  });

  test('a bill still moving, or one that passed, keeps the recorded stage', () => {
    expect(lastLabel('Other', 'before_parliament')).toBe('Other');
    expect(lastLabel('Other', 'passed')).toBe('Other');
    expect(lastLabel('Other', null)).toBe('Other');
    // Only "Other" is renamed: a named stage is the record's own word.
    expect(lastLabel('Second reading', 'lapsed')).toBe('Second reading');
  });

  test('the first stop and its date stay as recorded', () => {
    const points = rulerPoints(entries('Other'), 'lapsed');
    expect(points[0]).toMatchObject({
      label: 'Introduced',
      date: '2023-02-13',
    });
    expect(points.at(-1)).toMatchObject({
      label: 'Lapsed',
      date: '2023-09-05',
    });
  });

  test('a pinned lapsed bill whose register ends on "other" says Lapsed', async () => {
    mockParams.key = 'au-federal-r6850';
    const root = await render(<BillDetail />);
    const ruler = host(root, 'bill-dates-ruler')[0]!;
    expect(ruler.props.accessibilityLabel).toMatch(/; Lapsed, \d+ \w+ \d{4}$/);
    expect(ruler.props.accessibilityLabel).not.toMatch(/Other/);
    expect(texts(ruler)).toContain('Lapsed');
  });
});

describe('Bills list (P2-8, P2-19)', () => {
  test('a search the filters empty says the filters are on and offers to clear them', async () => {
    mockParams.scope = 'all';
    mockParams.q = 'Wilkie';
    const root = await render(<BillsList pushed />);
    // The newest pushed list's own filter store.
    let store: ReturnType<typeof filterStore> | undefined;
    for (let i = 1; i < 500; i += 1)
      store = filterStore('bills', `list-${i}`) ?? store;
    await act(async () => store!.set({ ...store!.get(), status: 'exposure' }));
    const empty = root.find(
      (node) =>
        node.props.testID === 'bills-search-empty' &&
        typeof node.props.title === 'string',
    );
    expect(empty.props.body).toMatch(/Filters are on/);
    const clear = root.find(
      (node) =>
        node.props.testID === 'bills-search-clear' && !!node.props.onPress,
    );
    await act(async () => clear.props.onPress());
    expect(root.findAllByType(BillRow).length).toBeGreaterThan(0);
  });

  test('rows are the shared bill row: serif title, status and its dated event, sponsor with a party label', async () => {
    mockParams.scope = 'all';
    mockParams.q = 'Wilkie';
    const root = await render(<BillsList pushed />);
    const rows = root.findAllByType(BillRow);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.props.testID).toMatch(/^bill-row-/);
      // iPhone: rows push, so none is a split row.
      expect(row.props.selected).toBeUndefined();
    }
    const wilkie = root.find(
      (node) =>
        node.type === BillRow &&
        node.props.testID === 'bill-row-au-federal-r6850',
    );
    expect(wilkie.props).toMatchObject({
      status: 'Lapsed',
      showStatus: true,
      meta: { sponsor: 'Andrew Wilkie', party: 'Independent' },
    });
    // The row never names the chamber.
    expect(texts(wilkie).join(' ')).not.toMatch(/House of Representatives/);
    expect(wilkie.findAllByType(PartyLabel)).toHaveLength(1);
  });

  test.each([
    ['Large', 1],
    ['AX5', 3.571],
  ])(
    'at %s: Votes in parliament and the scope come before the rows; Filters is in the bar; the source line is at the foot',
    async (_size, fontScale) => {
      window(402, fontScale);
      const root = await render(<BillsList />);
      const ids = order(root);
      const firstRow = ids.findIndex((id) => id.startsWith('bill-row-'));
      const lastRow = ids.findLastIndex((id) => id.startsWith('bill-row-'));
      expect(firstRow).toBeGreaterThan(-1);
      expect(ids.indexOf('bills-votes')).toBeLessThan(
        ids.indexOf('bills-count'),
      );
      expect(ids.indexOf('bills-count')).toBeLessThan(firstRow);
      expect(ids.indexOf('bills-as-at')).toBeGreaterThan(lastRow);
      expect(host(root, 'bills-filters')).toHaveLength(0);
      expect(barItems().map((item) => item.label)).toContain('Filters');
    },
  );

  test.each([
    ['segments that do not fit', 1],
    ['AX5', 3.571],
  ])(
    'with %s the scope is one "Showing" menu row, never a label beside a button',
    async (_case, fontScale) => {
      window(402, fontScale);
      const root = await render(<BillsList />);
      // The hidden probe measures each segment's label; make them too wide.
      const segments = root.findByType(SegmentedPicker);
      const probe = segments.parent!.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityElementsHidden === true,
      )[0]!;
      await act(async () => {
        for (const text of probe.findAll(
          (node) =>
            typeof node.type === 'string' &&
            typeof node.props.onTextLayout === 'function',
        ))
          text.props.onTextLayout({ nativeEvent: { lines: [{ width: 400 }] } });
        segments.parent!.props.onLayout({
          nativeEvent: { layout: { width: 370 } },
        });
      });
      const scope = root.findAll(
        (node) =>
          typeof node.type !== 'string' &&
          node.props.testID === 'bills-scope' &&
          node.props.label === 'Showing',
      );
      expect(scope.length).toBeGreaterThan(0);
      expect(scope.every((node) => node.props.row === true)).toBe(true);
      // "Showing" is said once, by the row itself.
      const inside = new Set(scope.flatMap((node) => node.findAll(() => true)));
      const outside = root.findAll(
        (node) =>
          !inside.has(node) &&
          !scope.includes(node) &&
          typeof node.type === 'string' &&
          node.children.includes('Showing'),
      );
      expect(outside).toHaveLength(0);
    },
  );

  test('Filters says why it waits while the bills load, then opens the sheet', async () => {
    let arrive!: () => void;
    mock.bills.mockImplementation(
      (refresh) =>
        new Promise((resolve) => {
          arrive = () => resolve(fixture.bills(refresh));
        }),
    );
    await render(<BillsList />);
    const filters = () =>
      barItems().find((item) => item.label === 'Filters') as unknown as {
        disabled?: boolean;
        accessibilityHint?: string;
      };
    expect(filters()).toMatchObject({
      disabled: true,
      accessibilityHint: 'Available once bills load',
    });
    await act(async () => arrive());
    expect(filters().disabled).toBe(false);
    expect(filters().accessibilityHint).toBeUndefined();
  });

  test('the Votes in parliament row pushes its own route', async () => {
    const root = await render(<BillsList />);
    const row = root.find(
      (node) =>
        node.props.testID === 'bills-votes' &&
        typeof node.props.onPress === 'function' &&
        typeof node.type !== 'string',
    );
    act(() => row.props.onPress());
    expect(router.push).toHaveBeenCalledWith(divisionHistoryRoute);
  });

  test('the iPhone never opens a bill on its own', async () => {
    const root = await render(<BillsList />);
    expect(root.findAllByType(BillRow).length).toBeGreaterThan(0);
    expect(router.setParams).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('party codes on bill rows (P2-17)', () => {
  test('a recorded code is drawn and said as the party name', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { partyFromCode } = require('../src/features/bills/party-codes');
    expect(partyFromCode('JLN')).toBe('Jacqui Lambie Network');
    expect(partyFromCode(' nats ')).toBe('Nationals');
    expect(partyFromCode('Labor')).toBe('Labor');
    expect(partyFromCode('')).toBeNull();
    expect(partyFromCode(null)).toBeNull();
  });
});

test('a consultation that closed yesterday in Sydney reads closed on an Australian morning', async () => {
  mockParams.key = 'au-federal-r7534';
  const record = await fixture.billFor(mockParams.key);
  mock.billFor.mockResolvedValue({
    ...record,
    data: {
      ...record.data,
      identity: {
        ...record.data.identity,
        data: { ...record.data.identity.data!, status: 'exposure_draft' },
      },
      consultation: {
        ...record.data.consultation,
        status: 'ready',
        data: {
          url: 'https://example.gov.au/consultation',
          opens: '2026-10-01',
          closes: '2026-11-10',
          note: '',
        },
      },
    },
  });
  // 08:00 on 11 Nov in Sydney is still 10 Nov in UTC.
  jest.useFakeTimers({
    now: new Date('2026-11-10T21:00:00Z'),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  try {
    const root = await render(<BillDetail />);
    const words = texts(host(root, 'bill-consultation')[0]!).join(' ');
    expect(words).toContain('and closed 10 Nov');
  } finally {
    jest.useRealTimers();
  }
});

test('bill content uses the shared loader while its headers and source bands keep their spacing', async () => {
  mockParams.key = 'au-federal-r7529';
  const root = await render(<BillDetail />);
  // The bill keeps the crossfade's timing itself, so a seeded header can
  // stay outside the fading layers (tests/bill-seed-crossfade.test.tsx).
  const layers = root.findByType(CrossfadeLayers).props;
  expect(layers.sectioned).toBe(true);
  expect(layers.crossfade).toMatchObject({ loading: false, fade: false });
  const headers = root.findAllByType(SectionHeader);
  expect(headers.length).toBeGreaterThan(0);
  for (const header of headers) {
    expect(header.props.compact).toBeUndefined();
    expect(
      StyleSheet.flatten(header.findByType(View).props.style).minHeight,
    ).toBe(44);
  }
  const sources = root.findAllByType(SourceAffordance);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source.props.overlap).toBe(false);
    const target = source.find(
      (node) => typeof node.props.style === 'function',
    );
    expect(
      StyleSheet.flatten(target.props.style({ pressed: false })).marginTop,
    ).toBeUndefined();
  }
});
