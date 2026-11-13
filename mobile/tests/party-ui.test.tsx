import { router } from 'expo-router';
import { act } from 'react';
import {
  AppState,
  Platform,
  RefreshControl,
  ScrollView,
  Text as NativeText,
  View,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { Catalogs } from '../src/api/catalogs';
import { combinedPartyNode } from '../src/api/party-page';
import { apiClient, catalogs as runtime } from '../src/api/runtime';
import { moneyAccessibilityLabel } from '../src/design/format';
import { partyColors } from '../src/design/palette';
import { PartyLabel, PersonRow, Portrait } from '../src/design/people';
import { Screen, TitleAnchor } from '../src/design/layout';
import { RegionProvider } from '../src/design/adaptive';
import { SourceLine } from '../src/design/source';
import { SourceContent } from '../src/features/sheets/SourceSheet';
import { openOnWeb, openSource } from '../src/navigation/external';
import { sheetPayload } from '../src/navigation/sheets';
import { StatStrip } from '../src/design/record';
import { ContentUnavailable } from '../src/design/states';
import { textStyles } from '../src/design/tokens';
import { DivisionSplits, RecordedParty } from '../src/features/bills/parts';
import {
  PartyPage,
  faceCandidates,
  loadFaces,
  partyMembersRoute,
} from '../src/features/Party';
import { ProfileBlock } from '../src/features/people/Block';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  firstLineOffset,
  ProfileHeader,
} from '../src/features/people/ProfileHeader';
import { peopleScreens } from '../src/navigation/stack/people';
import {
  moneyRecordRoute,
  partyRoute,
  personRoute,
  resultsRoute,
} from '../src/navigation/routes';
import { LinkRow, MoneyRow } from '../src/design/rows';
import { pinned, slugs } from './pinned';
import { describeWrappingColumns } from './wrapping-columns';
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  useSegments: () => [],
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn() },
  catalogs: { partyPage: jest.fn(), followSources: jest.fn() },
  peopleDepth: {
    access: jest.fn(async () => {
      throw new Error('offline');
    }),
    funding: jest.fn(async () => {
      throw new Error('offline');
    }),
    mentions: jest.fn(),
    news: jest.fn(),
  },
}));
jest.mock('../src/navigation/external', () => ({
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
  sourceUrl: (s: string) => s,
  // The source sheet asks whether an original is an OPAX page.
  fromWebPath: () => null,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const api = new Catalogs({
  get: async (path, decoder) => ({
    data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
let view: Awaited<ReturnType<typeof api.partyPage>>;
beforeAll(async () => {
  view = await api.partyPage('Labor');
});
beforeEach(() => {
  // A test that spies on AppState restores it to a bare mock.
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }));
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest.clearAllMocks();
  jest.mocked(runtime.partyPage).mockResolvedValue(view);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});
async function render(input = 'Labor') {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<PartyPage input={input} />);
  });
  return renderer;
}

test.each([
  ['phone', 390, 1, false, undefined],
  ['iPad', 1194, 1, false, undefined],
  ['Duo detail pane at AX5', 1114, 3.1, true, 540],
] as const)(
  '%s puts party provenance after all sections',
  async (_label, width, fontScale, embedded, paneWidth) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, height: 844, scale: 3, fontScale });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <RegionProvider
          value={paneWidth ? { width: paneWidth, height: 844 } : null}
        >
          <PartyPage input="Labor" embedded={embedded} />
        </RegionProvider>,
      );
    });
    const lines = r.root.findAllByType(SourceLine);
    expect(
      lines.filter((line) => line.props.testID === 'party-figures-source'),
    ).toHaveLength(1);
    expect(lines.at(-1)!.props.testID).toBe('party-figures-source');
    expect(lines.length).toBeGreaterThan(1);
    const ids = r.root
      .findAll((node) => typeof node.type === 'string' && node.props.testID)
      .map((node) => node.props.testID);
    expect(ids.indexOf('party-figures-source')).toBeGreaterThan(
      ids.indexOf('party-more'),
    );
    expect(ids.indexOf('party-end')).toBeGreaterThan(
      ids.indexOf('party-figures-source'),
    );
    const target = r.root.find(
      (node) =>
        node.props.testID === 'party-figures-source' &&
        typeof node.props.onPress === 'function',
    );
    expect(target.props.accessibilityLabel).toContain('Updated');
    expect(target.props.accessibilityHint).toBe('Opens the sources');
    await act(async () => target.props.onPress());
    const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    };
    expect(sheetPayload(params.key, 'source')?.details).toMatchObject({
      citation: lines.at(-1)!.props.citation,
    });
    act(() => r.unmount());
  },
);

test.each([
  ['Animal Justice Party', 1],
  ['Legalise Cannabis Victoria', 2],
  ['Libertarian Party', 1],
])(
  '%s shows the state-only count in the stat and Members row',
  async (label, count) => {
    jest
      .mocked(runtime.partyPage)
      .mockResolvedValueOnce(await api.partyPage(label));
    const r = await render(label);
    expect(r.root.findByType(StatStrip).props.tiles).toContainEqual(
      expect.objectContaining({
        value: String(count),
        label: count === 1 ? 'sitting member' : 'sitting members',
        testID: 'party-figure-members',
      }),
    );
    const row = r.root
      .findAllByType(LinkRow)
      .find((n) => n.props.testID === 'party-current-count')!;
    expect(row.props.title).toBe(
      `${count} ${count === 1 ? 'sitting member' : 'sitting members'}`,
    );
    const href = {
      pathname: '/directory',
      params: { kind: 'person', party: label, sitting: '1' },
    };
    expect(partyMembersRoute(label)).toEqual(href);
    expect(row.props.href).toEqual(href);
    const block = r.root
      .findAllByType(ProfileBlock)
      .find((n) => n.props.id === 'party-members')!;
    expect(block.props.action).toMatchObject({ label: 'See all', href });
    act(() => r.unmount());
  },
);

test('a loaded party heading reveals its named bar title when it scrolls under the header', async () => {
  let finishLoading!: (loaded: typeof view) => void;
  jest.mocked(runtime.partyPage).mockReturnValueOnce(
    new Promise((resolve) => {
      finishLoading = resolve;
    }),
  );
  const routes = [
    { key: 'root', name: 'index' },
    {
      key: 'party',
      name: 'party/[slug]',
      params: { slug: 'labor' },
    },
  ];
  const screen = peopleScreens().find(
    (item) => item.props.name === 'party/[slug]',
  )!;
  let options: Record<string, unknown> = {};
  const navigation = {
    getState: () => ({ index: 1, routes }),
    setOptions: (next: object) => Object.assign(options, next),
    isFocused: () => true,
    addListener: () => () => {},
  };
  options = screen.props.options({ route: routes[1], navigation });
  expect(options).toMatchObject({
    title: '',
    headerBackTitle: 'Today',
  });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={routes[1]!}>
          <HeaderHeightContext.Provider value={100}>
            <PartyPage input="Labor" />
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(options.title).toBe('');
  await act(async () => finishLoading(view));
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(options.title).toBe('Labor');
  expect(inline().props).toMatchObject({ title: 'Labor', shown: false });
  const heading = r.root.findByType(ProfileHeader);
  const anchor = r.root.findByType(TitleAnchor);
  expect(anchor.findByType(ProfileHeader)).toBe(heading);
  const measured = anchor.findByType(View);
  expect(measured.props.collapsable).toBe(false);
  let pageY = 180;
  const measure = jest.fn((done) => done(0, 0, 300, 80, 0, pageY));
  act(() => measured.props.ref({ measure }));
  const scroll = () =>
    act(() =>
      r.root.findByType(ScrollView).props.onScroll({
        nativeEvent: { contentOffset: { y: 200 } },
      }),
    );
  scroll();
  expect(measure).toHaveBeenCalled();
  expect(inline().props.shown).toBe(false);
  pageY = 50;
  scroll();
  expect(inline().props).toMatchObject({ title: 'Labor', shown: true });
  pageY = 180;
  scroll();
  expect(inline().props.shown).toBe(false);
  expect(options).toMatchObject({
    headerBackTitle: 'Today',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
  act(() => r.unmount());
});

test('Party keeps its existing Android heading and bar title behaviour', async () => {
  const original = Platform.OS;
  Platform.OS = 'android';
  try {
    const r = await render();
    expect(r.root.findByType(Screen).props.barTitle).toBe('Labor');
    expect(r.root.findAllByType(TitleAnchor)).toHaveLength(0);
    expect(r.root.findByType(ProfileHeader).props.name).toBe('Labor');
    act(() => r.unmount());
  } finally {
    Platform.OS = original;
  }
});
const press = (r: TestRenderer.ReactTestRenderer, id: string) =>
  act(() =>
    r.root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
test('profile chips and grouped person-row VoiceOver actions open the same native party route', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel party="Labor" status="current" testID="chip" />,
    );
  });
  press(r, 'chip');
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
  act(() => {
    r.update(
      <PersonRow
        name="Anthony Albanese"
        party="Labor"
        partyStatus="current"
        onPress={() => undefined}
        testID="person"
      />,
    );
  });
  const row = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'person',
  );
  expect(row.props.accessibilityActions).toContainEqual({
    name: 'openParty',
    label: 'Open Labor party page',
  });
  act(() =>
    row.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openParty' },
    }),
  );
  expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
  act(() => r.unmount());
});
test.each([
  'Independent',
  'IND',
  'Independent Liberal',
  'Unaligned',
  'Non-aligned',
])(
  '%s chips, vote labels and VoiceOver actions are plain affiliations',
  (party) => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <PartyLabel party={party} status="current" testID="chip" />,
      );
    });
    expect(
      r.root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.accessibilityRole === 'link',
      ),
    ).toHaveLength(0);
    expect(
      r.root.findAll((n) => typeof n.props.onPress === 'function'),
    ).toHaveLength(0);
    act(() => r.update(<RecordedParty party={party} />));
    expect(
      r.root.findAll((n) => n.props.accessibilityRole === 'link'),
    ).toHaveLength(0);
    const openProfile = jest.fn();
    act(() =>
      r.update(
        <PersonRow
          name="Fixture member"
          party={party}
          formerly={party}
          partyStatus="current"
          onPress={openProfile}
          testID="person"
        />,
      ),
    );
    const row = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'person',
    );
    expect(row.props.accessibilityActions).toEqual([]);
    act(() => {
      for (const actionName of ['openParty', 'openPreviousParty'])
        row.props.onAccessibilityAction({ nativeEvent: { actionName } });
    });
    expect(router.push).not.toHaveBeenCalled();
    press(r, 'person');
    expect(openProfile).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  },
);
test('previous party links remain available for an Independent, while previous Independent actions are omitted', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel
        party="Independent"
        formerly="Labor"
        status="current"
        testID="chip"
      />,
    );
  });
  const chip = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'chip',
  );
  expect(chip.props.onPress).toBeUndefined();
  expect(chip.props.accessibilityActions).toEqual([
    { name: 'openPreviousParty', label: 'Open Labor party page' },
  ]);
  act(() =>
    chip.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openPreviousParty' },
    }),
  );
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
  jest.mocked(router.push).mockClear();
  act(() =>
    r.update(
      <PartyLabel
        party="Labor"
        formerly="Independent"
        status="current"
        testID="chip"
      />,
    ),
  );
  const changed = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'chip',
  );
  expect(changed.props.accessibilityActions).toBeUndefined();
  act(() =>
    r.update(
      <PersonRow
        name="Fixture member"
        party="Labor"
        formerly="Independent"
        partyStatus="current"
        onPress={() => undefined}
        testID="person"
      />,
    ),
  );
  const row = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'person',
  );
  expect(row.props.accessibilityActions).toEqual([
    { name: 'openParty', label: 'Open Labor party page' },
  ]);
  act(() =>
    row.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openPreviousParty' },
    }),
  );
  expect(router.push).not.toHaveBeenCalled();
  act(() => r.unmount());
});
test('bill links exclude presiding roles and unrecorded affiliations, including folded splits', () => {
  // UI-only synthetic parties and anonymous roles; no public person's votes
  // or bill record is changed. These rare role codes are register fields.
  const row = (party: string, label: string, ayes = 1) => ({
    party,
    label,
    ayes,
    noes: 0,
  });
  const splits = {
    drawn: Array.from({ length: 5 }, (_, i) =>
      row(`Fixture party ${i + 1}`, `Fixture party ${i + 1}`, 5),
    ).concat(row('Independent', 'Independent', 2)),
    folded: [
      row('Fixture small party', 'Fixture small party'),
      row('PRES', 'Presiding officer'),
      row('SPK', 'Speaker'),
      row('', 'Not recorded'),
      row('Independent Liberal', 'Independent Liberal'),
      row('Unaligned', 'Unaligned'),
      row('Non-aligned', 'Non-aligned'),
    ],
    max: 5,
    notes: [],
    recorded: true,
  };
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <DivisionSplits
        splits={[...splits.drawn, ...splits.folded]}
        max={splits.max}
        testID="splits"
      />,
    );
  });
  // Every party row is a link to the party page, the rows a division keeps
  // behind its disclosure included. None is drawn for a presiding role or
  // an affiliation.
  const links = r.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      (n.props.accessibilityRole === 'link' ||
        (n.props.accessibilityRole === 'button' &&
          /ayes?|noes?/.test(n.props.accessibilityLabel ?? ''))),
  );
  expect(links).toHaveLength(6);
  for (const link of links)
    expect(link.props.accessibilityLabel).not.toMatch(
      /^(Presiding officer|Speaker|Not recorded|Independent|Unaligned|Non-aligned)/,
    );
  const independent = r.root.find(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'splits-independent',
  );
  expect(independent.props.accessibilityLabel).toBe(
    'Independent, 2 ayes, no noes',
  );
  expect(independent.props.onPress).toBeUndefined();
  for (const party of [' ', 'PRES', 'SPK']) {
    act(() => r.update(<RecordedParty party={party} />));
    expect(
      r.root.findAll((n) => n.props.accessibilityRole === 'link'),
    ).toHaveLength(0);
  }
  act(() => r.unmount());
});
test('the Independent grey dot is drawn as a label, never a link; other affiliations get none', () => {
  // The dots are decorative views beside the label text.
  const dots = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityElementsHidden === true &&
          [n.props.style].flat(2).some((s) => s?.borderRadius === 5),
      )
      .map(
        (n) =>
          Object.assign({}, ...[n.props.style].flat(2)).backgroundColor as
            | string
            | undefined,
      );
  const links = (r: TestRenderer.ReactTestRenderer) =>
    r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        (n.props.accessibilityRole === 'link' ||
          typeof n.props.onPress === 'function'),
    );
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel party="Independent" status="current" testID="chip" />,
    );
  });
  expect(dots(r)).toEqual([partyColors.independent]);
  expect(links(r)).toHaveLength(0);
  act(() => r.update(<RecordedParty party="Independent" />));
  expect(dots(r)).toEqual([partyColors.independent]);
  expect(links(r)).toHaveLength(0);
  const split = (party: string, label: string) => ({
    party,
    label,
    ayes: 2,
    noes: 0,
  });
  act(() =>
    r.update(
      <DivisionSplits
        splits={[
          split('Independent', 'Independent'),
          split('PRES', 'Presiding officer'),
          split('SPK', 'Speaker'),
          split('Unaligned', 'Unaligned'),
        ]}
        max={2}
        testID="splits"
      />,
    ),
  );
  expect(dots(r)).toEqual([partyColors.independent]);
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'link',
    ),
  ).toHaveLength(0);
  for (const party of [
    'IND',
    'Independent Liberal',
    'Unaligned',
    'Non-aligned',
    'PRES',
    'SPK',
  ]) {
    act(() => r.update(<PartyLabel party={party} status="current" />));
    expect(dots(r)).toEqual([]);
    act(() => r.update(<RecordedParty party={party} />));
    expect(dots(r)).toEqual([]);
  }
  // A party keeps its dot and its link.
  act(() => r.update(<PartyLabel party="Labor" status="current" />));
  expect(dots(r)).toEqual([partyColors.labor]);
  expect(links(r)).toHaveLength(1);
  act(() => r.unmount());
});
const host = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === id);
const has = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id).length > 0;
const unavailable = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(ContentUnavailable).map((n) => n.props.title);
const drawn = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) => [n.props.children].flat(Infinity).join(''))
    .join(' ');

test('recorded members open native profiles; the total and every block have provenance', async () => {
  const r = await render();
  press(r, 'party-recorded-toggle');
  const member = r.root.findAll(
    (n) =>
      typeof n.type !== 'string' &&
      /^party-member-/.test(n.props.testID ?? '') &&
      !!n.props.href,
  )[0]!;
  const slug = member.props.testID.replace('party-member-', '');
  expect(member.props.href).toEqual(personRoute(slug, member.props.name));
  for (const id of [
    'party-members-source',
    'party-receipts-source',
    'party-debts-source',
    'party-divisions-source',
  ])
    expect(has(r, id)).toBe(true);
  expect(host(r, 'party-receipts-total').props.accessibilityLabel).toBe(
    `${moneyAccessibilityLabel(view.data!.receipts.data!.node.total)}, disclosed`,
  );
  act(() => r.unmount());
});
test('AX5 party text remains uncapped and the recorded disclosure exposes its expanded state', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  press(r, 'party-recorded-toggle');
  const portraitInitials = new Set(
    r.root
      .findAllByType(Portrait)
      .flatMap((portrait) => portrait.findAllByType(NativeText)),
  );
  const clamped = new Set(
    r.root
      .findAllByType(MoneyRow)
      .flatMap((row) =>
        row
          .findAllByType(NativeText)
          .filter((text) => text.props.numberOfLines === 2),
      ),
  );
  for (const text of r.root.findAllByType(NativeText)) {
    expect(text.props.numberOfLines).toBe(clamped.has(text) ? 2 : undefined);
    if (portraitInitials.has(text)) {
      expect(text.props.accessible).toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1);
      expect(text.props.maxFontSizeMultiplier).toBeLessThan(3.571);
    } else {
      expect(text.props.maxFontSizeMultiplier).toBe(0);
    }
  }
  expect(
    host(r, 'party-recorded-toggle').props.accessibilityState.expanded,
  ).toBe(true);
  // A wrapping column draws stretched text blank or clipped (build 33).
  expect(describeWrappingColumns(r)).toEqual([]);
  act(() => r.unmount());
});
test('a resolved absence says so and never leaves the app by itself', async () => {
  jest
    .mocked(runtime.partyPage)
    .mockResolvedValue({ data: null, stale: false });
  const r = await render();
  expect(has(r, 'party-not-found')).toBe(true);
  expect(unavailable(r)).toEqual(['This party isn’t in OPAX’s records yet']);
  expect(openOnWeb).not.toHaveBeenCalled();
  press(r, 'party-not-found-web');
  expect(openOnWeb).toHaveBeenCalledWith('/subject/party/Labor', 'Labor');
  act(() => r.unmount());
});
test('failed read offers retry and does not mistake a network failure for an unknown party', async () => {
  jest
    .mocked(runtime.partyPage)
    .mockRejectedValue(new Error('fixture unavailable'));
  const r = await render();
  expect(openOnWeb).not.toHaveBeenCalled();
  expect(has(r, 'party-error')).toBe(true);
  expect(has(r, 'party-not-found')).toBe(false);
  expect(unavailable(r)).toEqual(['Couldn’t load this party']);
  expect(drawn(r)).toContain('Try again');
  act(() => r.unmount());
});
test('with no receipts held, a failed returns read is said under Debts, not an empty heading', async () => {
  // The funding read fails by default in this file.
  jest.mocked(runtime.partyPage).mockResolvedValue({
    ...view,
    data: {
      ...view.data!,
      receipts: { ...view.data!.receipts, status: 'missing', data: null },
      associated: { ...view.data!.associated, status: 'ready', data: null },
    },
  } as typeof view);
  const r = await render();
  expect(has(r, 'party-debts-section')).toBe(true);
  expect(has(r, 'party-funding-error')).toBe(true);
  act(() => r.unmount());
});
test('Independent is not a party: it points to independent members', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<PartyPage input="Independent" />);
  });
  expect(has(r, 'party-not-a-party')).toBe(true);
  expect(unavailable(r)).toEqual(['Not a party']);
  // Nothing is read for a label, so there is nothing to pull to refresh.
  expect(r.root.findAllByType(RefreshControl)).toHaveLength(0);
  press(r, 'party-not-a-party-action');
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/directory',
    params: { kind: 'person', party: 'Independent' },
  });
  act(() => r.unmount());
});

test('title and Members render before receipts, associations and splits settle', async () => {
  let publish!: (record: typeof view) => void;
  let finish!: (record: typeof view) => void;
  jest
    .mocked(runtime.partyPage)
    .mockImplementation((_input, _refresh, progress) => {
      publish = progress!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
  const r = await render();
  const loading = {
    status: 'loading' as const,
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  };
  await act(async () =>
    publish({
      ...view,
      data: {
        ...view.data!,
        receipts: loading,
        associated: loading,
        divisions: loading,
        moneyMeta: null,
      },
    }),
  );
  for (const id of [
    'party-title',
    'party-current-count',
    'party-receipts-loading',
    'party-divisions-loading',
  ])
    expect(r.root.findAll((n) => n.props.testID === id).length).toBeGreaterThan(
      0,
    );
  await act(async () => finish(view));
  expect(
    r.root.findAll((n) => n.props.testID === 'party-receipts-total').length,
  ).toBeGreaterThan(0);
  act(() => r.unmount());
  // Progress from an obsolete request must be ignored along with its completion.
  act(() => publish(view));
});

test.each(['pull', 'foreground'] as const)(
  '%s refresh of a saved record keeps loaded sections and disclosures mounted',
  async (trigger) => {
    let release!: () => void;
    let started!: () => void;
    let activate!: () => void;
    const optional = new Promise<void>((resolve) => {
      release = resolve;
    });
    const optionalStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const subscription = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        activate = () => listener('active');
        return { remove: jest.fn() };
      });
    const saved = new Catalogs({
      get: async (path, decoder, refresh = false) => {
        if (refresh && path === '/bills/index.json') {
          started();
          await optional;
        }
        return {
          data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
          stale: true,
          savedAt: 1000,
          asOf: null,
        };
      },
    });
    jest
      .mocked(runtime.partyPage)
      .mockImplementation((...args) => saved.partyPage(...args));
    const r = await render();
    try {
      press(r, 'party-recorded-toggle');
      const ids = [
        'party-receipts-total',
        'party-debts-source',
        'party-divisions-source',
      ];
      const nodes = ids.map((id) =>
        r.root.find((n) => typeof n.type === 'string' && n.props.testID === id),
      );
      await act(async () => {
        if (trigger === 'foreground') activate();
        else
          r.root
            .findAll((n) => !!n.props.refreshControl)[0]!
            .props.refreshControl.props.onRefresh();
        await optionalStarted;
      });
      for (const [i, id] of ids.entries())
        expect(
          r.root.find(
            (n) => typeof n.type === 'string' && n.props.testID === id,
          ),
        ).toBe(nodes[i]);
      expect(
        r.root.findAll((n) =>
          /party-(receipts|divisions)-loading/.test(n.props.testID ?? ''),
        ),
      ).toHaveLength(0);
      expect(
        r.root.find(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === 'party-recorded-toggle',
        ).props.accessibilityState.expanded,
      ).toBe(true);
      await act(async () => {
        release();
        await jest.mocked(runtime.partyPage).mock.results.at(-1)!.value;
      });
      expect(
        r.root.findAll(
          (n) => n.props.refreshControl?.props.refreshing === true,
        ),
      ).toHaveLength(0);
    } finally {
      release();
      act(() => r.unmount());
      subscription.mockRestore();
    }
  },
);

test('the Money map row opens the party in the public money record', async () => {
  const r = await render();
  const row = r.root.findAll(
    (n) =>
      typeof n.type !== 'string' &&
      n.props.testID === 'party-money-map' &&
      !!n.props.href,
  )[0]!;
  expect(row.props.href).toEqual(
    moneyRecordRoute({ node: 'party:Labor' }, 'Labor'),
  );
  expect(has(r, 'party-public-money')).toBe(false);
  await act(async () => r.unmount());
});

test('associated entity rows open their own donor records or search, never grant records', async () => {
  const liberal = await api.partyPage('Liberal');
  const rows = liberal.data!.associated.data!.rows;
  expect(rows.map((entity) => entity.name)).toEqual([
    'Cormack Foundation Pty Ltd',
    'Bunori Pty Limited',
    'Vapold Pty Ltd',
    'The Menzies Research Centre Limited',
    'Parakeelia Pty Ltd',
    'Liberal Asset Management (Custodians) Limited',
  ]);
  jest.mocked(runtime.partyPage).mockResolvedValueOnce(liberal);
  const r = await render('Liberal');
  for (const [index, entity] of rows.entries()) {
    const row = r.root
      .findAllByType(LinkRow)
      .find((n) => n.props.testID === `party-associated-${index}`)!;
    expect(row.props.external).toBeUndefined();
    expect(row.props.detail).toContain('receipts $');
    // LinkRow's in-app accessory is a chevron when external is absent.
    expect(row.props.accessibilityHint).not.toBe('Opens in the in-app browser');
    await act(async () => row.props.onPress!());
    expect(router.push).toHaveBeenLastCalledWith(
      entity.name === 'Vapold Pty Ltd'
        ? moneyRecordRoute(
            { node: 'donor:vapold', jurisdiction: 'federal' },
            'Vapold Pty Ltd',
          )
        : resultsRoute('all', { q: entity.name }),
    );
    const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      pathname: string;
      params: Record<string, string>;
    };
    expect(route.pathname).not.toBe('/grants');
    expect(route.params).not.toHaveProperty('rid');
  }
  expect(apiClient.get).toHaveBeenCalledWith(
    '/graph/money.json',
    decodeMoneyGraph,
  );
  expect(openOnWeb).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('associated entities open name search when the donor index cannot be loaded', async () => {
  const associated = structuredClone(view);
  associated.data!.associated = {
    ...associated.data!.associated,
    status: 'ready',
    data: {
      rows: [
        {
          name: 'Cormack Foundation',
          year: '2024-25',
          receipts: 1000000,
          payments: null,
          debts: null,
        },
      ],
      total: 1,
      notes: [],
    },
  };
  jest.mocked(runtime.partyPage).mockResolvedValueOnce(associated);
  jest.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
  const r = await render();
  const row = r.root
    .findAllByType(LinkRow)
    .find((n) => n.props.testID === 'party-associated-0')!;
  await act(async () => row.props.onPress!());
  expect(router.push).toHaveBeenCalledWith(
    resultsRoute('all', { q: 'Cormack Foundation' }),
  );
  expect(openOnWeb).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('a total division scan failure is unavailable rather than no party votes', async () => {
  const failed = structuredClone(view);
  failed.data!.divisions = {
    ...failed.data!.divisions,
    status: 'ready',
    data: { rows: [], scanned: 0, failed: 3, basisNote: null },
  };
  jest.mocked(runtime.partyPage).mockResolvedValueOnce(failed);
  const r = await render();
  expect(
    r.root.findAllByProps({ testID: 'party-divisions-error' }).length,
  ).toBeGreaterThan(0);
  expect(drawn(r)).toMatch(/Votes couldn.t be loaded\./);
  expect(drawn(r)).not.toMatch(/No division in the 0/);
  await act(async () => r.unmount());
});

describe('the party header and Members faces (w5 polish)', () => {
  test('the party name is the system page title, not the record serif (D1)', async () => {
    const r = await render();
    const title = r.root.find(
      (n) => n.props.testID === 'party-title' && n.type === NativeText,
    );
    const family = (
      [title.props.style].flat(Infinity) as ({ fontFamily?: string } | null)[]
    )
      .map((s) => s?.fontFamily)
      .filter(Boolean)
      .at(-1);
    expect(family).toBe(textStyles.pageTitle.fontFamily);
    expect(family ?? '').not.toMatch(/Merriweather/);
  });

  test("the dot centres on the title's first line once it is laid out", async () => {
    const r = await render();
    const title = r.root.find(
      (n) =>
        n.props.testID === 'party-title' &&
        n.type === NativeText &&
        typeof n.props.onTextLayout === 'function',
    );
    const dot = () =>
      r.root.find(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityElementsHidden === true &&
          [n.props.style]
            .flat(Infinity)
            .some(
              (s: { backgroundColor?: unknown } | null) =>
                s?.backgroundColor === partyColors.labor,
            ),
      );
    const style = () =>
      Object.assign({}, ...[dot().props.style].flat(Infinity).filter(Boolean));
    // Before layout the dot centres on the title (one line).
    expect(style().alignSelf).toBe('center');
    await act(async () =>
      title.props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Labor', x: 0, y: 0, width: 80, height: 34 },
            { text: 'more', x: 0, y: 34, width: 60, height: 34 },
          ],
        },
      }),
    );
    expect(style().alignSelf).toBeUndefined();
    expect(style().marginTop).toBe(firstLineOffset({ y: 0, height: 34 }, 10));
    expect(firstLineOffset({ y: 0, height: 34 }, 10)).toBe(12);
  });

  test('faces come from members with a portrait, federal first, each once', () => {
    const members = view.data.members.data!.current;
    const portraitless = new Set(['alice-jordan-baird']);
    const order = faceCandidates(
      members,
      (m) => m.jurisdiction === 'federal' && !portraitless.has(m.slug),
    );
    expect(order.slice(0, 6).map((m) => m.slug)).not.toContain(
      'alice-jordan-baird',
    );
    expect(order.slice(0, 6).every((m) => m.jurisdiction === 'federal')).toBe(
      true,
    );
    expect(new Set(order.map((m) => m.slug)).size).toBe(order.length);
  });

  test('a portrait that fails is skipped, never a blank circle', async () => {
    const people = Array.from({ length: 10 }, (_, i) => ({
      name: `Member ${i}`,
      slug: `member-${i}`,
      jurisdiction: 'federal',
      chamber: 'representatives',
      place: '',
      asAt: null,
    })) as unknown as Parameters<typeof loadFaces>[0];
    const read = jest.fn(async (m: { slug: string }) => {
      const i = Number(m.slug.split('-')[1]);
      if (i === 1) throw new Error('404');
      return i % 3 === 0 ? null : `file:///${m.slug}.webp`;
    });
    const faces = await loadFaces(people, read);
    expect(faces).toEqual([
      'file:///member-2.webp',
      'file:///member-4.webp',
      'file:///member-5.webp',
      'file:///member-7.webp',
      'file:///member-8.webp',
    ]);
    // Bounded reads, and none after six are found.
    const all = await loadFaces(
      people,
      jest.fn(async (m: { slug: string }) => `file:///${m.slug}.webp`),
    );
    expect(all).toHaveLength(6);
  });
});

describe('the Libertarian Party, formerly the Liberal Democratic Party', () => {
  let ldp: Awaited<ReturnType<typeof api.partyPage>>;
  beforeAll(async () => {
    ldp = await api.partyPage('liberal-democratic-party');
  });
  beforeEach(() => {
    jest.mocked(runtime.partyPage).mockResolvedValue(ldp);
  });
  // The host Text's own string.
  const strings = (node: TestRenderer.ReactTestInstance) =>
    [node.props.children].flat(Infinity).join('');
  const ids = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll((n) => typeof n.type === 'string' && n.props.testID)
      .map((n) => n.props.testID as string);

  test('the history line sits under the heading, its notices in the source sheet', async () => {
    const r = await render('liberal-democratic-party');
    expect(r.root.findByType(ProfileHeader).props.name).toBe(
      'Libertarian Party',
    );
    expect(strings(host(r, 'party-history-text'))).toBe(
      'Liberal Democratic Party (Liberal Democrats), renamed Libertarian Party. The AEC deregistered the Liberal Democratic Party on 19 July 2022 and registered the Libertarian Party on 12 January 2024.',
    );
    const order = ids(r);
    expect(order.indexOf('party-history')).toBeGreaterThan(
      order.indexOf('party-title'),
    );
    expect(order.indexOf('party-history')).toBeLessThan(
      order.indexOf('party-figures'),
    );
    const line = r.root.find(
      (n) =>
        n.props.testID === 'party-history-source' &&
        typeof n.props.onPress === 'function',
    );
    await act(async () => line.props.onPress());
    const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    };
    const details = sheetPayload(params.key, 'source')!.details;
    expect(details.originals).toEqual([
      {
        label:
          'AEC notice deregistering the Liberal Democratic Party (19 July 2022)',
        url: 'https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Deregistered_parties/files/statement-of-reasons-liberal-democratic-party-s137-deregistration-statement-of-reasons.pdf',
      },
      {
        label: 'AEC notice registering the Libertarian Party (12 January 2024)',
        url: 'https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Registration_Decisions/2024/Registration-approved-Notice-Libertarian-Party.pdf',
      },
    ]);
    // Each notice opens in the in-app browser, like other source links.
    let sheet!: TestRenderer.ReactTestRenderer;
    act(() => {
      sheet = TestRenderer.create(
        <SourceContent details={details} testID="history-sheet" />,
      );
    });
    for (const [index, original] of details.originals!.entries()) {
      act(() =>
        sheet.root
          .find(
            (n) =>
              n.props.testID === `history-sheet-original-${index}` &&
              typeof n.props.onPress === 'function',
          )
          .props.onPress(),
      );
      expect(openSource).toHaveBeenLastCalledWith(original.url, original.label);
    }
    act(() => sheet.unmount());
    act(() => r.unmount());
  });

  test('past members under the former name show “Recorded as” it', async () => {
    const r = await render('liberal-democratic-party');
    // One sitting member, under the current name.
    expect(r.root.findByType(StatStrip).props.tiles).toContainEqual(
      expect.objectContaining({ value: '1', label: 'sitting member' }),
    );
    expect(host(r, 'party-past-toggle')).toBeTruthy();
    press(r, 'party-past-toggle');
    const rows = r.root
      .findAllByType(PersonRow)
      .filter((row) => /^party-past-/.test(row.props.testID ?? ''));
    expect(
      rows.map((row) => [
        row.props.name,
        row.props.place,
        row.props.detail,
        row.props.href ?? null,
      ]),
    ).toEqual([
      [
        'David Leyonhjelm',
        'Senate, 2014 to 2019',
        'Recorded as Liberal Democratic Party',
        // OPAX holds no profile for them: a row, not a link.
        null,
      ],
      [
        'Duncan Spender',
        'Senate, 2019',
        'Recorded as Liberal Democratic Party',
        null,
      ],
    ]);
    expect(drawn(r)).toContain('Recorded as Liberal Democratic Party');
    act(() => r.unmount());
  });

  test('Android draws the same history line', async () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const r = await render('liberal-democratic-party');
      expect(r.root.findAllByType(TitleAnchor)).toHaveLength(0);
      expect(strings(host(r, 'party-history-text'))).toContain(
        'renamed Libertarian Party',
      );
      expect(has(r, 'party-history-source')).toBe(true);
      act(() => r.unmount());
    } finally {
      Platform.OS = original;
    }
  });

  test('money lodged under two names draws one total and its “Lodged as” line', async () => {
    // An invented pair; the page only draws what the record holds.
    const base = view.data!;
    const node = combinedPartyNode([
      {
        ...base.receipts.data!.node,
        id: 'party:hrp',
        label: 'Harbourside Reform Party',
        total: 1000,
        count: 4,
        firstYear: 2016,
        lastYear: 2019,
        byYear: {},
      },
      {
        ...base.receipts.data!.node,
        id: 'party:hbp',
        label: 'Harbourside Party',
        total: 2000,
        count: 2,
        firstYear: 2019,
        lastYear: 2020,
        byYear: {},
      },
    ]);
    jest.mocked(runtime.partyPage).mockResolvedValue({
      stale: false,
      data: {
        ...base,
        label: 'Harbourside Party',
        members: {
          ...base.members,
          data: { current: [], recorded: [], currentCount: 0, sources: [] },
        },
        receipts: {
          ...base.receipts,
          data: {
            node,
            recordedAs: null,
            rank: 1,
            parties: 2,
            donors: [],
            byYear: [],
          },
        },
        associated: { ...base.associated, data: null },
        divisions: { ...base.divisions, data: null },
      },
    });
    const r = await render('Harbourside Party');
    expect(host(r, 'party-receipts-total').props.accessibilityLabel).toBe(
      `${moneyAccessibilityLabel(3000)}, disclosed`,
    );
    expect(drawn(r)).toContain(
      'disclosed, from 6 donations and receipts, 2016 to 2020',
    );
    expect(strings(host(r, 'party-receipts-lodged'))).toBe(
      'Lodged as Harbourside Reform Party $1,000; as Harbourside Party $2,000',
    );
    expect(has(r, 'party-receipts-recorded')).toBe(false);
    act(() => r.unmount());
  });

  test('other parties draw no history line and no past members', async () => {
    jest.mocked(runtime.partyPage).mockResolvedValue(view);
    const r = await render();
    expect(has(r, 'party-history')).toBe(false);
    expect(has(r, 'party-past-toggle')).toBe(false);
    act(() => r.unmount());
  });
});
