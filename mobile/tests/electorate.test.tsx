import { SourceAffordance } from '../src/design/source';
import { withNavigationOptions } from './navigation-options';
import { act, type ReactElement } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { index, manifest, people, roster, slugs, pinned } from './pinned';
import Electorate, {
  ElectorateScreen,
  identityLine,
} from '../src/features/Electorate';
import { router } from 'expo-router';
import { ContentUnavailable, SkeletonCrossfade } from '../src/design/states';
import { PartyLabel, PersonRow } from '../src/design/people';
import { Heading, Text } from '../src/design/text';
import { Screen, SectionHeader } from '../src/design/layout';
import { ScrollView, StyleSheet, View } from 'react-native';
import Members from '../src/features/your-mp/Members';
import Election from '../src/features/your-mp/Election';
import { chooseElectorateDate } from '../src/features/directories/ElectorateDateSheet';
import {
  DatedMembers,
  ElectorateHistory,
  rosterName,
  termSpan,
} from '../src/features/directories/ElectorateHistory';
import { CachedPortrait } from '../src/features/CachedPortrait';
import { personRoute } from '../src/navigation/routes';
import { grantsRoute } from '../src/navigation/routes/public-money';
import { LinkRow } from '../src/design/rows';
import { RecordNameLink } from '../src/design/record';
import { minimumTarget } from '../src/design/tokens';
import {
  RepresentativeRows,
  sinceLine,
} from '../src/features/your-mp/RepresentativeRows';
import { loadChoice } from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
  catalogs: { directory: jest.fn(), electorateFor: jest.fn() },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(async () => null),
  saveChoice: jest.fn(),
  subscribeChoice: jest.fn(() => () => undefined),
}));
const mockFollow = { follows: [] as unknown[], states: new Map() };
jest.mock('../src/features/follows/useFollowStates', () => ({
  useFollowStates: () => mockFollow,
}));
jest.mock('../src/features/follows/AddedSinceGroup', () => ({
  AddedSinceGroup: (props: { testID: string }) => {
    const { View } = jest.requireActual('react-native');
    return <View testID={props.testID} />;
  },
}));
const mockOpenAsk = jest.fn();
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => mockOpenAsk,
}));
const mockParams: Record<string, string | undefined> = {};
const mockOptions: Record<string, unknown>[] = [];
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(
    ({ children, ...props }: { children: unknown }) =>
      jest
        .requireActual('react')
        .createElement(
          jest.requireActual('react-native').Pressable,
          props,
          children,
        ),
    {
      Trigger: ({ children }: { children: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  ),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockOptions.push(options);
      return null;
    },
  },
}));

const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const mock = runtime as jest.Mocked<typeof runtime>;
const seat = (name: string, jurisdiction = 'federal') =>
  index.electorates.find(
    (s) => s.name === name && s.jurisdiction === jurisdiction,
  )!;
function load(name: string, jurisdiction?: string) {
  const s = seat(name, jurisdiction);
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(s.detail_url)))),
  );
  mockParams.id = s.electorate_id;
}
async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(element, (options) => {
        mockOptions.push(options);
      }),
    );
  });
  return r;
}
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => n.type === 'Text')
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
const unavailable = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id && !!n.props.title)[0]?.props
    .title as string | undefined;
const has = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id).length > 0;
function parentView(node: ReactTestInstance): ReactTestInstance {
  let parent = node.parent;
  while (parent && parent.type !== View) parent = parent.parent;
  if (!parent) throw new Error('Expected a containing View');
  return parent;
}
const order = (r: TestRenderer.ReactTestRenderer, ids: string[]) => {
  const seen: string[] = [];
  r.root.findAll((n) => {
    const id = n.props.testID as string | undefined;
    if (id && ids.includes(id) && !seen.includes(id)) seen.push(id);
    return false;
  });
  return seen;
};
const menuItems = () => {
  const withItems = mockOptions
    .filter((o) => o.unstable_headerRightItems)
    .at(-1)!;
  const items = (
    withItems.unstable_headerRightItems as () => {
      type: string;
      label: string;
      menu?: { items: { label: string; onPress: () => void }[] };
    }[]
  )();
  return items;
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSeatForTests();
  mockOptions.length = 0;
  mockFollow.follows = [];
  mockFollow.states = new Map();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mock.directory.mockResolvedValue(directory as never);
});

test('the pending electorate reserves the map, title and member layout with one loading label', async () => {
  const dimensions = jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  load('Boothby');
  mock.electorateFor.mockReturnValue(new Promise(() => {}));
  const r = await render(<Electorate />);
  expect(r.root.findByType(SkeletonCrossfade).props).toMatchObject({
    loading: true,
    sectioned: true,
  });
  const host = (id: string) =>
    r.root.find(
      (node) => typeof node.type === 'string' && node.props.testID === id,
    );
  expect(host('electorate-loading').props.accessibilityLabel).toBe(
    'Loading the electorate',
  );
  expect(
    r.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'progressbar',
    ),
  ).toHaveLength(1);
  expect(
    order(r, [
      'electorate-loading-map',
      'electorate-loading-source',
      'electorate-loading-title',
      'electorate-loading-chamber',
      'electorate-loading-follow',
      'electorate-loading-members-heading',
      'electorate-loading-member',
      'electorate-loading-past-heading',
      'electorate-loading-past-0',
      'electorate-loading-past-1',
    ]),
  ).toEqual([
    'electorate-loading-map',
    'electorate-loading-source',
    'electorate-loading-title',
    'electorate-loading-chamber',
    'electorate-loading-follow',
    'electorate-loading-members-heading',
    'electorate-loading-member',
    'electorate-loading-past-heading',
    'electorate-loading-past-0',
    'electorate-loading-past-1',
  ]);
  expect(
    StyleSheet.flatten(host('electorate-loading-map').props.style).height,
  ).toBe(200);
  expect(
    host('electorate-loading').findAll(
      (node) =>
        node.props.accessibilityElementsHidden &&
        node.props.importantForAccessibility === 'no-hide-descendants',
    ).length,
  ).toBeGreaterThan(0);
  const member = host('electorate-loading-member');
  let card = member.parent!;
  while (!StyleSheet.flatten(card.props.style)?.backgroundColor)
    card = card.parent!;
  expect(
    StyleSheet.flatten(host('electorate-loading-member-portrait').props.style)
      .backgroundColor,
  ).not.toEqual(StyleSheet.flatten(card.props.style).backgroundColor);
  dimensions.mockRestore();
});

test('the electorate nav centre stays blank through loading, data arrival and scrolling, with its accessible content heading intact', async () => {
  load('Grayndler');
  // Hold the actual seat read so loading is observed separately from completion.
  const seatResult = result(
    c.electorateFor(c.decodeElectorate(pinned(seat('Grayndler').detail_url))),
  );
  let resolve!: (value: typeof seatResult) => void;
  mock.electorateFor.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done as typeof resolve;
      }),
  );
  const r = await render(<Electorate />);
  expect(has(r, 'electorate-loading')).toBe(true);
  expect(mockOptions.some((options) => options.title === 'Electorate')).toBe(
    false,
  );
  await act(async () => resolve(seatResult));
  expect(r.root.findAllByType(Screen)[0]!.props.barTitle).toBeUndefined();
  expect(r.root.findByProps({ testID: 'electorate-name' }).props.children).toBe(
    'Grayndler',
  );
  expect(
    r.root.findAll(
      (node) =>
        node.type === 'Text' &&
        node.props.accessibilityRole === 'header' &&
        node.props.children === 'Grayndler',
    ),
  ).not.toHaveLength(0);
  act(() =>
    r.root
      .findAllByType(ScrollView)[0]!
      .props.onScroll({ nativeEvent: { contentOffset: { y: 2000 } } }),
  );
  for (const options of mockOptions) {
    expect(options.title).not.toBe('Electorate');
    const title = (
      options.headerTitle as () => ReactElement<{ children?: unknown }>
    )();
    expect(title.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(title.props.children).toBeUndefined();
  }
  expect(mockOptions.at(-1)!.title).toBe('Grayndler');
  act(() => r.unmount());
});

test('Grayndler reads in the stated order with no pipeline words', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  expect(
    order(r, [
      'electorate-name',
      'electorate-follow',
      'electorate-members',
      'electorate-elections',
      'electorate-census',
      'electorate-end',
    ]),
  ).toEqual([
    'electorate-name',
    'electorate-follow',
    'electorate-members',
    'electorate-elections',
    'electorate-census',
    'electorate-end',
  ]);
  const words = text(r);
  expect(words).toContain('House of Representatives, New South Wales');
  expect(words.match(/House of Representatives/g)).toHaveLength(1);
  expect(words).toContain('Since 2 Mar 1996');
  expect(words).toContain('2025 federal election');
  expect(words).toContain('Census 2021');
  expect(words).toContain(
    'Not adjusted for boundary changes since the Census.',
  );
  expect(words).toContain('Past members');
  for (const banned of [
    'verified',
    'release',
    'observation',
    'service periods',
    'Latest check',
    'Start precision',
    'general',
    'by_election',
    'Related constituencies',
    'Local context',
  ])
    expect(words).not.toContain(banned);
  expect(has(r, 'electorate-region')).toBe(false);
  expect(has(r, 'electorate-authorisation')).toBe(false);
  expect(has(r, 'election-expand-0')).toBe(false);
  expect(has(r, 'electorate-representatives-source')).toBe(true);
  expect(has(r, 'electorate-added-since')).toBe(false);
  await act(async () => r.unmount());
});

test('election rows push the election screen, newest first', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  // On iOS the row is a Link trigger: the link carries the route.
  const links = r.root.findAll(
    (n) => n.props.href?.pathname === '/election' && n.props.asChild,
  );
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]!.props.href.params.seat).toBe(
    seat('Grayndler').electorate_id,
  );
  const firstRow = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'election-row-0',
  );
  expect(firstRow.findAll((n) => n === links[0])).toHaveLength(1);
  const parties = firstRow.findAllByType(PartyLabel);
  expect(parties[0]!.props.party).toBe('Labor');
  expect(parties[0]!.props.dense).toBeUndefined();
  expect(parties[0]!.props.compact).toBe(true);
  const partyFrame = parentView(parties[0]!);
  expect(StyleSheet.flatten(partyFrame.props.style).minHeight).toBe(
    minimumTarget,
  );
  expect(StyleSheet.flatten(parentView(partyFrame).props.style).gap).toBe(4);
  // VoiceOver hears the party's name, as drawn, never the file's code.
  expect(firstRow.props.accessibilityLabel).toMatch(/, Labor\./);
  expect(firstRow.props.accessibilityLabel).not.toMatch(/\bALP\b/);
  const winner = firstRow.findByType(RecordNameLink);
  expect(winner.props.href).toEqual(
    personRoute('anthony-albanese', 'Anthony Albanese'),
  );
  const stopPropagation = jest.fn();
  jest.mocked(router.push).mockClear();
  act(() => winner.findByType(Text).props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith(winner.props.href);

  expect(has(r, 'election-expand-0')).toBe(false);
  // Sweep 1 item 8: the date is on the title's line and never breaks; the
  // result line is the winner's share after preferences from the AEC file.
  const line = (id: string) =>
    r.root.find((n) => n.props.testID === id && n.type === Text).props.children;
  expect(line('election-row-0-title')).toBe(
    '2025 federal election · 3\u00a0May\u00a02025',
  );
  expect(line('election-row-0-result')).toBe('66.9% after preferences');
  expect(firstRow.props.accessibilityLabel).toContain(
    '66.9% after preferences',
  );
  // The state locator sits beside the outline and is hidden from VoiceOver.
  const locator = r.root.find(
    (n) =>
      n.props.testID === 'electorate-locator' && typeof n.type === 'string',
  );
  expect(locator.props.accessibilityElementsHidden).toBe(true);
  expect(locator.props.importantForAccessibility).toBe('no-hide-descendants');
  await act(async () => r.unmount());
});

test('the bar menu: no Set as my electorate is ever disabled; Ask drafts without sending', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  const items = menuItems();
  const menu = items.find((i) => i.type === 'menu')!;
  const labels = menu.menu!.items.map((i) => i.label);
  expect(labels).toEqual([
    'Set Grayndler as my electorate',
    'View on a date',
    'Ask about Grayndler',
    'Copy link',
    'Open on opax.com.au',
  ]);
  await act(async () =>
    menu.menu!.items.find((i) => i.label === 'Ask about Grayndler')!.onPress(),
  );
  expect(mockOpenAsk).toHaveBeenCalledWith({
    question: 'What has parliament said about Grayndler?',
  });
  await act(async () => r.unmount());
});

test("no Set as my electorate when it is already the reader's seat", async () => {
  load('Grayndler');
  (loadChoice as jest.Mock).mockResolvedValueOnce({
    version: 1,
    seatId: seat('Grayndler').electorate_id,
    stateSeatIds: [],
  });
  const r = await render(<Electorate />);
  const menu = menuItems().find((i) => i.type === 'menu')!;
  expect(menu.menu!.items.map((i) => i.label)).toEqual([
    'View on a date',
    'Ask about Grayndler',
    'Copy link',
    'Open on opax.com.au',
  ]);
  // No disabled item anywhere in the menu.
  expect(
    menu.menu!.items.filter((i) => (i as { disabled?: boolean }).disabled),
  ).toEqual([]);
  await act(async () => r.unmount());
});

test('a chosen date shows the members on that date and Back to today', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  await act(async () =>
    chooseElectorateDate(seat('Grayndler').electorate_id, '1994-06-01'),
  );
  expect(text(r)).toContain('Member on 1 June 1994');
  expect(has(r, 'electorate-date-latest')).toBe(true);
  const back = r.root.findAll(
    (n) =>
      n.props.testID === 'electorate-date-latest' &&
      typeof n.props.onPress === 'function',
  )[0]!;
  await act(async () => back.props.onPress());
  expect(text(r)).not.toContain('Member on');
  await act(async () => r.unmount());
});

test('an abolished electorate still shows its recorded members on a chosen historical date', async () => {
  load('Higgins');
  const r = await render(<Electorate />);
  await act(async () =>
    chooseElectorateDate(seat('Higgins').electorate_id, '2015-06-01'),
  );
  expect(r.root.findAllByType(DatedMembers)).toHaveLength(1);
  expect(text(r)).toContain('Member on 1 June 2015');
  expect(has(r, 'electorate-date-latest')).toBe(true);
  const back = r.root.findAll(
    (node) =>
      node.props.testID === 'electorate-date-latest' &&
      typeof node.props.onPress === 'function',
  )[0]!;
  await act(async () => back.props.onPress());
  expect(r.root.findAllByType(DatedMembers)).toHaveLength(0);
  expect(text(r)).toContain('Past members');
  await act(async () => r.unmount());
});

test('changing an embedded electorate clears the old seat and its chosen date while the new record loads', async () => {
  load('Grayndler');
  const r = await render(
    <ElectorateScreen id={seat('Grayndler').electorate_id} embedded />,
  );
  await act(async () =>
    chooseElectorateDate(seat('Grayndler').electorate_id, '1994-06-01'),
  );
  expect(text(r)).toContain('Member on 1 June 1994');
  const sydney = seat('Sydney');
  const next = result(
    c.electorateFor(c.decodeElectorate(pinned(sydney.detail_url))),
  );
  let finish!: (value: typeof next) => void;
  mock.electorateFor.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    r.update(
      withNavigationOptions(
        <ElectorateScreen id={sydney.electorate_id} embedded />,
        (options) => mockOptions.push(options),
      ),
    ),
  );
  expect(has(r, 'electorate-loading')).toBe(true);
  expect(has(r, 'electorate-name')).toBe(false);
  await act(async () => finish(next));
  expect(r.root.findByProps({ testID: 'electorate-name' }).props.children).toBe(
    'Sydney',
  );
  expect(text(r)).not.toContain('Member on');
  await act(async () => r.unmount());
});

test('McLeay reads Labor in Past members, including older terms with only a presiding code', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  const mcleay = r.root
    .findAllByType(PersonRow)
    .find((n) => n.props.name === 'Leo McLeay')!;
  expect(mcleay.props.party).toBe('Labor');
  expect(mcleay.findByType(PartyLabel).props.party).toBe('Labor');
  expect(text(r)).not.toMatch(/\b(?:SPK|PRES)\b/);
  expect(mcleay.props.detail).toBe('29 Aug 1989 to 13 Mar 1993');
  await act(async () => r.unmount());
});

test('Maribyrnong past members use preferred names, native portraits and person routes without visible legal-name clutter', async () => {
  load('Maribyrnong');
  const r = await render(<Electorate />);
  const rows = r.root.findAllByType(PersonRow);
  for (const [name, slug, legalName, span] of [
    [
      'Bill Shorten',
      'bill-shorten',
      'William Richard Shorten',
      '24 Nov 2007 to 20 Jan 2025',
    ],
    [
      'Bob Sercombe',
      'bob-sercombe',
      'Robert Charles Grant Sercombe',
      '2 Mar 1996 to 17 Oct 2007',
    ],
  ]) {
    const row = rows.find((n) => n.props.name === name)!;
    expect(row.props.href).toEqual(personRoute(slug!));
    expect(row.findByType(CachedPortrait).props).toMatchObject({ name, slug });
    expect(row.props.accessibilityLabel).toBe(
      `${name}, Recorded as ${legalName}, Labor, ${span}`,
    );
    expect(text(r)).not.toContain(legalName);
  }
  const griffiths = rows.find((n) => n.props.name === 'Alan Gordon Griffiths')!;
  expect(griffiths.props.href).toBeUndefined();
  expect(griffiths.findByType(CachedPortrait).props.slug).toBeUndefined();
  await act(async () => r.unmount());
});

test.each([
  ['2022-06-01', 'Bill Shorten', 'bill-shorten', 'William Richard Shorten'],
  [
    '2000-06-01',
    'Bob Sercombe',
    'bob-sercombe',
    'Robert Charles Grant Sercombe',
  ],
])(
  'dated members on %s share the preferred identity and keep the legal name accessible',
  async (asof, name, slug, legalName) => {
    const view = c.electorateFor(
      c.decodeElectorate(pinned(seat('Maribyrnong').detail_url)),
    );
    const r = await render(
      <DatedMembers
        view={view}
        directory={directory}
        asof={asof!}
        onBackToToday={jest.fn()}
      />,
    );
    const row = r.root.findByType(PersonRow);
    expect(row.props.name).toBe(name);
    expect(row.props.href).toEqual(personRoute(slug!));
    expect(row.findByType(CachedPortrait).props).toMatchObject({ name, slug });
    expect(row.props.accessibilityLabel).toContain(`Recorded as ${legalName}`);
    expect(text(r)).not.toContain(legalName);
    await act(async () => r.unmount());
  },
);

test.each([
  ['LEO McLEAY', 'Leo McLeay'],
  ['Bill Shorten', 'Bill Shorten'],
  ['William Richard Shorten', 'William Richard Shorten'],
])(
  'an unresolved roster name %s keeps the casing fallback %s',
  (name, expected) => {
    expect(rosterName(name!)).toBe(expected);
  },
);

test('a history term with a directory ID still links when its local name record is missing', async () => {
  const view = c.electorateFor(
    c.decodeElectorate(pinned(seat('Maribyrnong').detail_url)),
  );
  const jo = Object.values(view.people).find((p) => p.name === 'Jo Briskey')!;
  const term = view.terms.find((t) => t.person_id === jo.person_id)!;
  const r = await render(
    <ElectorateHistory
      view={{
        ...view,
        people: {},
        terms: [{ ...term, end: '2026-11-10', end_precision: 'day' }],
      }}
      directory={directory}
    />,
  );
  const row = r.root.findByType(PersonRow);
  expect(row.props.name).toBe('Jo Briskey');
  expect(row.props.href).toEqual(personRoute('jo-briskey'));
  expect(row.findByType(CachedPortrait).props).toMatchObject({
    name: 'Jo Briskey',
    slug: 'jo-briskey',
  });
  await act(async () => r.unmount());
});

test.each([
  {
    label: 'last party period',
    periods: ['Greens', 'Labor', 'SPK'],
    source: 'SPK',
  },
  { label: 'source party label', periods: ['SPK'], source: 'Labor' },
])(
  'Past members uses the $label before a presiding role',
  async ({ periods, source }) => {
    const view = c.electorateFor(
      c.decodeElectorate(pinned(seat('Grayndler').detail_url)),
    );
    const term = view.terms.find(
      (t) => view.people[t.person_id]?.name === 'LEO McLEAY',
    )!;
    const r = await render(
      <ElectorateHistory
        view={{
          ...view,
          terms: [
            {
              ...term,
              source_party_label: source,
              party_periods: periods.map((party) => ({
                party,
                start: term.start,
                end: term.end,
              })),
            },
          ],
        }}
        directory={{ ...directory, people: result({ ...people, people: [] }) }}
      />,
    );
    expect(r.root.findByType(PersonRow).props.party).toBe('Labor');
    expect(text(r)).toContain('Labor');
    expect(text(r)).not.toMatch(/\b(?:SPK|PRES)\b/);
    await act(async () => r.unmount());
  },
);

test.each([
  { code: 'SPK', role: 'Speaker', period: true },
  { code: 'PRES', role: 'President', period: true },
  { code: ' spk ', role: 'Speaker', period: true },
  { code: 'SPK', role: 'Speaker', period: false },
  { code: 'PRES', role: 'President', period: false },
])(
  'a $code-only history term leaves the party slot empty and says $role',
  async ({ code, role, period }) => {
    const view = c.electorateFor(
      c.decodeElectorate(pinned(seat('Grayndler').detail_url)),
    );
    const term = view.terms[0]!;
    const r = await render(
      <ElectorateHistory
        view={{
          ...view,
          terms: [
            {
              ...term,
              source_party_label: period ? null : code,
              party_periods: period
                ? [{ party: code, start: term.start, end: term.end }]
                : [],
            },
          ],
        }}
        directory={{ ...directory, people: result({ ...people, people: [] }) }}
      />,
    );
    const row = r.root.findByType(PersonRow);
    expect(row.props.party).toBeUndefined();
    expect(row.props.detail).toBe(role);
    expect(row.findAllByType(PartyLabel)).toHaveLength(0);
    expect(text(r)).toContain(role);
    expect(text(r)).not.toMatch(/\b(?:SPK|PRES|Party not recorded)\b/);
    await act(async () => r.unmount());
  },
);

test.each([
  { party: 'SPK', expectedParty: undefined, detail: 'Speaker' },
  { party: 'PRES', expectedParty: undefined, detail: 'President' },
  { party: 'Labor', expectedParty: 'Labor', detail: 'Since 1996' },
  { party: 'Independent', expectedParty: 'Independent', detail: 'Since 1996' },
])(
  'current representative party $party has no pipeline code',
  async ({ party, expectedParty, detail }) => {
    const member = seat('Grayndler').representatives[0]!;
    const r = await render(
      <RepresentativeRows
        rows={[{ ...member, party }]}
        directory={{ ...directory, people: result({ ...people, people: [] }) }}
        id="representative"
        detailFor={() => 'Since 1996'}
      />,
    );
    const row = r.root.findByType(PersonRow);
    expect(row.props.party).toBe(expectedParty);
    expect(row.props.detail).toBe(detail);
    expect(row.findAllByType(PartyLabel)).toHaveLength(expectedParty ? 1 : 0);
    expect(text(r)).not.toMatch(/\b(?:SPK|PRES|Party not recorded)\b/);
    await act(async () => r.unmount());
  },
);

test('a changed followed electorate shows its Added since group after the title block', async () => {
  load('Grayndler');
  const id = seat('Grayndler').electorate_id;
  const follow = { kind: 'electorate', id, title: 'Grayndler', followedAt: 1 };
  mockFollow.follows = [follow];
  mockFollow.states = new Map([
    [
      `electorate:${id}`,
      {
        status: 'ready',
        title: 'Grayndler',
        current: {},
        keys: [],
        changes: [
          {
            marker: 'election',
            text: 'Election result added',
            citation: 'AEC',
            asAt: '2025-05-03',
          },
        ],
      },
    ],
  ]);
  const r = await render(<Electorate />);
  expect(
    order(r, [
      'electorate-follow',
      'electorate-added-since',
      'electorate-members',
    ]),
  ).toEqual([
    'electorate-follow',
    'electorate-added-since',
    'electorate-members',
  ]);
  await act(async () => r.unmount());
});

test('a followed electorate with no change draws no Added since group', async () => {
  load('Grayndler');
  const id = seat('Grayndler').electorate_id;
  mockFollow.follows = [
    { kind: 'electorate', id, title: 'Grayndler', followedAt: 1 },
  ];
  mockFollow.states = new Map([
    [
      `electorate:${id}`,
      {
        status: 'ready',
        title: 'Grayndler',
        current: {},
        keys: [],
        changes: [],
      },
    ],
  ]);
  const r = await render(<Electorate />);
  expect(has(r, 'electorate-follow')).toBe(true);
  expect(has(r, 'electorate-added-since')).toBe(false);
  await act(async () => r.unmount());
});

test.each(['Grayndler', 'Ballarat'])(
  'the electorate page links to grants in %s',
  async (name) => {
    load(name);
    const r = await render(<Electorate />);
    const link = r.root
      .findAllByType(LinkRow)
      .find((n) => n.props.testID === 'seat-grants-all');
    expect(link?.props.title).toBe(`Grants in ${name}`);
    expect(link?.props.href).toEqual(
      grantsRoute({ jur: 'federal', seat: name, state: seat(name).state_code }),
    );
    await act(async () => r.unmount());
  },
);

test.each([
  ['Richmond', 'vic'],
  ['New South Wales', 'federal'],
  ['Higgins', 'federal'],
])(
  'the electorate page has no seat grants link for %s',
  async (name, jurisdiction) => {
    load(name, jurisdiction);
    const r = await render(<Electorate />);
    expect(has(r, 'seat-grants-all')).toBe(false);
    await act(async () => r.unmount());
  },
);

test('a Victorian district shows its region row and the authorisation foot, and no grants', async () => {
  load('Richmond', 'vic');
  const r = await render(<Electorate />);
  expect(text(r)).toContain('Legislative Assembly district, Victoria');
  expect(text(r)).toContain('In Northern Metropolitan');
  expect(has(r, 'electorate-authorisation')).toBe(true);
  expect(has(r, 'seat-grants')).toBe(false);
  const labels = menuItems()
    .find((i) => i.type === 'menu')!
    .menu!.items.map((i) => i.label);
  expect(labels).not.toContain('Set Richmond as my electorate');
  await act(async () => r.unmount());
});

test('a Senate seat lists six members then one face-stack row to the members list', async () => {
  load('New South Wales');
  const r = await render(<Electorate />);
  expect(text(r)).toContain('Senate, New South Wales');
  expect(has(r, 'electorate-members-all')).toBe(true);
  expect(text(r)).toContain('Members');
  await act(async () => r.unmount());
});

test('not found and failure states', async () => {
  mockParams.id = 'el_000000000000000000000000';
  let r = await render(<Electorate />);
  expect(unavailable(r, 'electorate-error')).toBe(
    "We couldn't find this electorate.",
  );
  const missing = r.root
    .findAllByType(ContentUnavailable)
    .find((node) => node.props.testID === 'electorate-error')!;
  expect(missing.props.body).toBeTruthy();
  expect(missing.props.action.label).toBe('Search');
  act(() => missing.props.action.onPress());
  expect(router.navigate).toHaveBeenCalledWith('/search');
  await act(async () => r.unmount());
  mockParams.id = seat('Grayndler').electorate_id;
  mock.electorateFor.mockRejectedValue(new ApiError('http', 'nope'));
  r = await render(<Electorate />);
  expect(unavailable(r, 'electorate-error')).toBe(
    "This electorate couldn't be loaded.",
  );
  expect(has(r, 'electorate-retry')).toBe(true);
  await act(async () => r.unmount());
});

test('loading draws a skeleton, never empty copy', async () => {
  load('Grayndler');
  mock.directory.mockReturnValue(new Promise(() => undefined) as never);
  const r = await render(<Electorate />);
  expect(has(r, 'electorate-loading')).toBe(true);
  expect(text(r)).not.toMatch(/No member|couldn't/);
  await act(async () => r.unmount());
});

test('the election screen orders candidates and marks the winner Elected', async () => {
  load('Grayndler');
  const detail = c.decodeElectorate(pinned(seat('Grayndler').detail_url));
  const newest = [...detail.elections].sort((a, b) =>
    b.election.poll_date.localeCompare(a.election.poll_date),
  )[0]!;
  mockParams.seat = seat('Grayndler').electorate_id;
  mockParams.key = newest.election_id;
  const r = await render(<Election />);
  const words = text(r);
  expect(words).toContain('2025 federal election');
  expect(words).toContain('Grayndler, 3 May 2025');
  expect(words).toContain('First preferences');
  expect(has(r, 'election-candidate-0-elected')).toBe(true);
  expect(has(r, 'election-source')).toBe(true);
  mockParams.key = 'missing';
  const missing = await render(<Election />);
  expect(unavailable(missing, 'election-missing')).toBe(
    "This election couldn't be found.",
  );
  await act(async () => missing.unmount());
});

test('dates at their stated precision', () => {
  expect(
    termSpan({
      start: '1993-03-13',
      start_precision: 'day',
      end: '1996-01-29',
      end_precision: 'day',
    }),
  ).toBe('13 Mar 1993 to 29 Jan 1996');
  expect(
    termSpan({
      start: '1993-01-01',
      start_precision: 'year',
      end: '1996-01-29',
      end_precision: 'day',
    }),
  ).toBe('From 1993 to 29 Jan 1996');
  const terms = [
    {
      person_id: 'p',
      start: '1996-03-02',
      start_precision: 'day',
      end: null,
      end_precision: 'open',
    },
  ];
  expect(sinceLine(terms, 'p')).toBe('Since 2 Mar 1996');
  expect(
    sinceLine([{ ...terms[0]!, start_precision: 'approximate' }], 'p'),
  ).toBeNull();
  expect(
    identityLine({ chamber: 'vic_lc', jurisdiction: 'vic', state: 'vic' }),
  ).toBe('Legislative Council region, Victoria');
});

test('the Members page uses the system page-heading role', async () => {
  load('New South Wales');
  mockParams.seat = seat('New South Wales').electorate_id;
  const r = await render(<Members />);
  const heading = r.root
    .findAllByType(Heading)
    .find((node) => node.props.testID === 'members-title')!;
  expect(heading.props.kind).toBe('page');
  expect(heading.props.children).toBe('Senators for New South Wales');
  await act(async () => r.unmount());
});

test('a Members link to a seat not in the release says so, never loads for good', async () => {
  load('New South Wales');
  mockParams.seat = 'fixture-removed-seat';
  const r = await render(<Members />);
  expect(unavailable(r, 'members-missing')).toBe(
    "These members couldn't be found.",
  );
  await act(async () => r.unmount());
});

test('electorate content uses the shared loader while its headers and source bands keep their spacing', async () => {
  const dimensions = jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  load('Boothby');
  const r = await render(<Electorate />);
  expect(r.root.findByType(SkeletonCrossfade).props).toMatchObject({
    loading: false,
    ready: true,
  });
  const headers = r.root.findAllByType(SectionHeader);
  expect(headers.length).toBeGreaterThan(0);
  for (const header of headers) {
    expect(header.props.compact).toBeUndefined();
    expect(
      StyleSheet.flatten(header.findByType(View).props.style).minHeight,
    ).toBe(44);
  }
  const sources = r.root.findAllByType(SourceAffordance);
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
  dimensions.mockRestore();
});
