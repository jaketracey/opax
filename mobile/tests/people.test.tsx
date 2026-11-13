import { RouteOptions } from '../src/navigation/preview';
import { ContentUnavailable } from '../src/design/states';
import { StatStrip } from '../src/design/record';
// Lane P, part 2 (people.md 2.1, 2.2): the person profile and the party
// page on the shared templates. Each block holds one acceptance check.
import { act } from 'react';
import { router } from 'expo-router';
import * as Native from 'react-native';
import { FlatList, Platform, ScrollView } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { peopleDepth, catalogs as runtime } from '../src/api/runtime';
import { PadGrid } from '../src/design/adaptive';
import {
  formatCount,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../src/design/format';
import { Screen, Section } from '../src/design/layout';
import { PaneHost } from '../src/design/split';
import { useReduceMotion } from '../src/design/accessibility';
import { SegmentedPicker } from '../src/design/controls';
import { Icon } from '../src/design/icon';
import { LinkRow, ValueRow } from '../src/design/rows';
import { rhythm } from '../src/design/tokens';
import { partySlug } from '../src/design/party';
import { Text } from '../src/design/primitives';
import { followKey, useFollows } from '../src/features/follows/store';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import Party from '../src/features/Party';
import {
  annualPay,
  decodeAccess,
  decodeFunding,
  decodeRecords,
  interestsCount,
  payRateLine,
  stripSources,
  votesCount,
} from '../src/features/people/model';
import RecordList from '../src/features/people/RecordList';
import { MoreFromRecord } from '../src/features/people/Sections';
import { topicRoute } from '../src/navigation/routes';
import Person from '../src/features/Person';
import YourMPPersonRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/person/[slug]';
import { RecordDetail } from '../src/features/split/RecordDetail';
import { AddedSinceGroup } from '../src/features/follows/AddedSinceGroup';
import type { ProfileView } from '../src/features/your-mp/model';
import { catalogs, manifest, people, pinned, roster, slugs } from './pinned';

// The party page reads the pinned snapshot through the real catalogue code.
// Like ApiClient, each decoder validates a catalogue once and later reads
// share the result: Labor and Liberal read the same money, bills, people and
// roster files, and decoding them twice made the party beforeAll the slowest
// hook in the suite (5 s timeout under gate load, 13 Nov).
const decoded = new Map<string, Map<unknown, unknown>>();
const decodeOnce = <T,>(path: string, decoder: (value: unknown) => T): T => {
  let byDecoder = decoded.get(path);
  if (!byDecoder) decoded.set(path, (byDecoder = new Map()));
  if (!byDecoder.has(decoder))
    byDecoder.set(
      decoder,
      decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
    );
  return byDecoder.get(decoder) as T;
};
const partyApi = new c.Catalogs({
  get: async (path, decoder) => ({
    data: decodeOnce(path, decoder),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
    partyPage: jest.fn(),
    followSources: jest.fn(),
  },
  peopleDepth: {
    topics: jest.fn(),
    access: jest.fn(),
    funding: jest.fn(),
    mentions: jest.fn(),
    news: jest.fn(),
    list: jest.fn(),
  },
}));
// A live iPad flag for the page's measured layout decisions.
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  const pad = () => !!(globalThis as { __opaxTestPad?: boolean }).__opaxTestPad;
  const out = {
    ...actual,
    useLayout: () => {
      const layout = actual.useLayout();
      return pad() ? { ...layout, regular: true, split: true } : layout;
    },
  };
  Object.defineProperty(out, 'isPad', { get: pad, enumerable: true });
  return out;
});
// These page assertions observe the shared grid boundary. Local hardware
// measurements and fold clearance are covered in duo-surfaces.test.tsx.
jest.mock('../src/features/today/SurfaceGrid', () => ({
  SurfaceGrid: jest.requireMock('../src/design/adaptive').PadGrid,
}));
const setPad = (on: boolean) => {
  (globalThis as { __opaxTestPad?: boolean }).__opaxTestPad = on;
};
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host view
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host element
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: {
  slug?: string;
  name?: string;
  section?: string;
  kind?: string;
  person?: string;
} = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
  },
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/follows/store', () => ({
  ...jest.requireActual('../src/features/follows/store'),
  useFollows: jest.fn(() => []),
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
  markSeenNow: jest.fn(async () => undefined),
  useFollowStates: jest.fn(() => ({ states: new Map() })),
}));
// The group's own seen-marking is the follows lane's; here it only stands.
jest.mock('../src/features/follows/AddedSinceGroup', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    AddedSinceGroup: ({ testID }: { testID: string }) => (
      <MockView testID={testID} />
    ),
  };
});

const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const mock = runtime as jest.Mocked<typeof runtime>;
let mockHeaderBottom = 103;
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => mockHeaderBottom,
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: jest.fn(() => false),
}));
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(c.decodeElectorateIndex(pinned(manifest.index_url))),
};

const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
// Every string drawn, whichever text component draws it.
const drawn = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.type === 'string')
    .flatMap((n) => [n.props.children].flat())
    .filter((v) => typeof v === 'string')
    .join(' ');
const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll((n) => n.props.testID === testID).length > 0;
const host = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === testID);

const anchorMeasure = (
  r: TestRenderer.ReactTestRenderer,
  section: string,
  measureLayout: Native.View['measureLayout'],
) => {
  let view = host(r, `person-${section}-anchor`);
  expect(view.props.collapsable).toBe(false);
  while (typeof view.instance?.measureLayout !== 'function')
    view = view.parent!;
  view.instance.measureLayout = measureLayout;
};

const viewportAt = (top: () => number) =>
  jest.spyOn(ScrollView.prototype, 'getNativeScrollRef').mockReturnValue({
    measureInWindow: (
      done: (x: number, y: number, width: number, height: number) => void,
    ) => done(0, top(), 390, 844),
  } as never);

async function wong(element = <Person />) {
  mockParams.slug = 'penny-wong';
  const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
  const profile = c.profileFor(person.canonicalPersonId!, {
    ...catalogs,
    interest: c.decodeInterest(pinned('/interests/10678.json')),
  });
  mock.person.mockResolvedValue(result(person));
  mock.profileFor.mockResolvedValue(profile);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return { r, person, profile };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHeaderBottom = 103;
  jest.mocked(useReduceMotion).mockReturnValue(false);
  delete mockParams.section;
  mock.directory.mockResolvedValue(directory as never);
  jest.mocked(peopleDepth.topics).mockRejectedValue(new Error('none'));
  jest.mocked(useFollows).mockReturnValue([]);
  jest.mocked(useFollowStates).mockReturnValue({ states: new Map() } as never);
});

describe('Topics in More from the record', () => {
  const topics = () => {
    const profile = (
      label: string,
      from: number,
      to: number,
      share: number,
    ) => ({
      label,
      from,
      to,
      labelled: 100,
      topics: [
        { slug: 'tax-budget', count: share * 100, share },
        { slug: 'health', count: 14, share: 0.14 },
        { slug: 'future-topic', count: 3, share: 0.03 },
        { slug: '', count: 1, share: 0.01 },
      ],
    });
    return {
      person: result({
        name: 'Katy Gallagher',
        indexed: 100,
        profiles: {
          all: profile('All years', 2010, 2026, 0.26),
          then: profile('2010s', 2010, 2019, 0.2),
          now: profile('Since 2020', 2020, 2026, 0.32),
        },
        coverage: undefined,
      }),
      baseline: result({
        labelled: 100,
        topics: [{ slug: 'tax-budget', count: 26 }],
      }),
    };
  };

  test.each([
    { person: 'katy-gallagher', name: 'Katy Gallagher' },
    { party: 'labor', name: 'Labor' },
  ])(
    '$name topic rows open the topic page as accessible full-width rows',
    async (subject) => {
      jest.mocked(peopleDepth.topics).mockResolvedValue(topics());
      let r!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        r = TestRenderer.create(
          <MoreFromRecord subject={subject} kinds={[]} topics testID="more" />,
        );
      });
      const tax = r.root
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'person-topic-0');
      expect(tax).toBeDefined();
      expect(tax!.props.href).toEqual(topicRoute('tax-budget'));
      expect(tax!.props.value).toBe('26%');
      const accessible = host(r, 'person-topic-0');
      expect(accessible.props.accessibilityRole).toBe('link');
      expect(accessible.props.accessibilityLabel).toBe(
        'Tax and budget, 26 percent of their speeches, opens topic',
      );
      const pressable = tax!.find(
        (n) =>
          typeof n.type !== 'string' && typeof n.props.style === 'function',
      );
      const style = Native.StyleSheet.flatten(
        pressable.props.style({ pressed: false }),
      );
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.flexDirection).toBe('row');
      expect(
        tax!.findAllByType(Icon).some((n) => n.props.name === 'chevron.right'),
      ).toBe(true);
      await act(async () => accessible.props.onAccessibilityTap());
      expect(router.push).toHaveBeenCalledWith(topicRoute('tax-budget'));
      for (const i of [2, 3]) {
        const plain = r.root
          .findAllByType(ValueRow)
          .find((n) => n.props.testID === `person-topic-${i}`);
        expect(plain).toBeDefined();
        expect(plain!.props.href).toBeUndefined();
        expect(
          host(r, `person-topic-${i}`).props.accessibilityRole,
        ).toBeUndefined();
      }
      await act(async () => r.unmount());
    },
  );

  test('period changes update shares and accessible labels while topic destinations stay unfiltered', async () => {
    jest.mocked(peopleDepth.topics).mockResolvedValue(topics());
    const { r } = await wong();
    const picker = r.root.findByType(SegmentedPicker);
    expect(picker.props.options.map((o: { label: string }) => o.label)).toEqual(
      ['All', '2010 to 2019', 'Since 2020'],
    );
    for (const [era, percent] of [
      ['then', 20],
      ['now', 32],
      ['all', 26],
    ] as const) {
      await act(async () => picker.props.onChange(era));
      const row = r.root
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'person-topic-0');
      expect(row).toBeDefined();
      expect(row!.props.value).toBe(`${percent}%`);
      expect(row!.props.href).toEqual(topicRoute('tax-budget'));
      expect(host(r, 'person-topic-0').props.accessibilityLabel).toBe(
        `Tax and budget, ${percent} percent of their speeches, opens topic`,
      );
    }
    expect(peopleDepth.topics).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
});

describe('profile', () => {
  afterEach(() => jest.restoreAllMocks());
  const hosts = [
    { name: 'pushed person', element: () => <Person />, viewportTop: 0 },
    {
      name: 'Your MP person route',
      element: () => <YourMPPersonRoute />,
      viewportTop: 103,
    },
    {
      name: 'iPad split',
      viewportTop: 103,
      element: () => {
        const entry = { kind: 'person' as const, key: 'penny-wong' };
        return (
          <PaneHost
            pane={{
              push: jest.fn(),
              back: () => false,
              select: jest.fn(),
              entries: [entry],
              depth: 0,
            }}
            bar={<Native.View testID="test-pane-bar" />}
          >
            <RecordDetail entry={entry} />
          </PaneHost>
        );
      },
    },
  ];

  describe.each(hosts)(
    '$name summary links',
    ({ name, element, viewportTop }) => {
      beforeEach(() => setPad(name === 'iPad split'));
      afterEach(() => setPad(false));
      test.each(['votes', 'interests', 'pay'] as const)(
        '%s waits for a late heading, scrolls below the bar and focuses the heading',
        async (section) => {
          jest.useFakeTimers();
          try {
            const scrollTo = jest
              .spyOn(ScrollView.prototype, 'scrollTo')
              .mockImplementation(() => {});
            const focus = jest
              .spyOn(Native.AccessibilityInfo, 'sendAccessibilityEvent')
              .mockImplementation(() => {});
            jest
              .spyOn(ScrollView.prototype, 'getInnerViewNode')
              .mockReturnValue(42);
            viewportAt(() => viewportTop);
            const { r } = await wong(element());
            // Before the heading's first layout, native measurement can go
            // unanswered. The request must survive the fallback timeout.
            anchorMeasure(r, section, () => {});
            await act(async () =>
              r.root
                .find(
                  (node) =>
                    node.props.testID === `person-figure-${section}` &&
                    typeof node.props.onPress === 'function',
                )
                .props.onPress(),
            );
            await act(async () => jest.advanceTimersByTime(100));
            expect(scrollTo).not.toHaveBeenCalled();
            expect(focus).not.toHaveBeenCalled();

            const nativeHeading = {
              measureLayout: jest.fn<
                void,
                Parameters<Native.View['measureLayout']>
              >((_ancestor, done) => done(0, 900, 300, 44)),
            };
            await act(async () =>
              host(r, `person-${section}-heading`).props.onLayout({
                currentTarget: nativeHeading,
                nativeEvent: { layout: { x: 0, y: 7, width: 300, height: 44 } },
              }),
            );
            const destination = 900 - (103 - viewportTop) - rhythm.block;
            expect(nativeHeading.measureLayout).toHaveBeenCalledWith(
              42,
              expect.any(Function),
              expect.any(Function),
            );
            expect(scrollTo).toHaveBeenLastCalledWith({
              y: destination,
              animated: true,
            });
            expect(focus).not.toHaveBeenCalled();
            await act(async () =>
              r.root.findByType(ScrollView).props.onScroll({
                nativeEvent: { contentOffset: { y: destination } },
              }),
            );
            expect(focus).toHaveBeenCalledWith(nativeHeading, 'focus');
            await act(async () => jest.advanceTimersByTime(500));
            expect(focus).toHaveBeenCalledTimes(1);
            // A later layout does not replay a completed jump.
            await act(async () =>
              host(r, `person-${section}-anchor`).props.onLayout({
                nativeEvent: { layout: { y: 1200 } },
              }),
            );
            expect(scrollTo).toHaveBeenCalledTimes(1);
            await act(async () => r.unmount());
          } finally {
            jest.useRealTimers();
          }
        },
      );

      test.each(['votes', 'interests', 'pay'] as const)(
        '%s without a target is a plain stat without a chevron or tap state',
        async (section) => {
          const { r, profile } = await wong(element());
          // Retained summary data must not link to an unlinked section. Pay
          // shares its outer anchor with expenses, which can still be present.
          profile.blocks[section] = {
            ...profile.blocks[section],
            status: 'unlinked',
          } as never;
          await act(async () => r.update(element()));
          const tile = host(r, `person-figure-${section}`);
          expect(tile.props.accessibilityRole).toBeUndefined();
          expect(tile.props.onPress).toBeUndefined();
          expect(typeof tile.props.style).not.toBe('function');
          expect(tile.findAllByType(Icon)).toHaveLength(0);
          expect(has(r, `person-${section}-heading`)).toBe(false);
          await act(async () => r.unmount());
        },
      );
    },
  );

  test.each([false, true])(
    'focuses a heading at an unchanged offset with Reduce Motion %s',
    async (reduceMotion) => {
      jest.useFakeTimers();
      try {
        jest.mocked(useReduceMotion).mockReturnValue(reduceMotion);
        const scrollTo = jest
          .spyOn(ScrollView.prototype, 'scrollTo')
          .mockImplementation(() => {});
        const focus = jest
          .spyOn(Native.AccessibilityInfo, 'sendAccessibilityEvent')
          .mockImplementation(() => {});
        jest
          .spyOn(ScrollView.prototype, 'getInnerViewNode')
          .mockReturnValue(42);
        viewportAt(() => 103);
        const { r } = await wong();
        const nativeHeading = {
          measureLayout: (
            _ancestor: unknown,
            done: (x: number, y: number) => void,
          ) => done(0, 900),
        };
        await act(async () =>
          host(r, 'person-pay-heading').props.onLayout({
            currentTarget: nativeHeading,
            nativeEvent: { layout: { y: 0 } },
          }),
        );
        const tap = () =>
          r.root
            .find(
              (node) =>
                node.props.testID === 'person-figure-pay' &&
                typeof node.props.onPress === 'function',
            )
            .props.onPress();
        await act(async () => tap());
        expect(scrollTo).toHaveBeenLastCalledWith({
          y: 900 - rhythm.block,
          animated: !reduceMotion,
        });
        // No scroll event is sent when the heading is already in place.
        await act(async () => jest.advanceTimersByTime(reduceMotion ? 0 : 500));
        expect(focus).toHaveBeenCalledWith(nativeHeading, 'focus');
        focus.mockClear();
        // Leaving the page cancels the delayed focus from another tap.
        await act(async () => tap());
        await act(async () => r.unmount());
        await act(async () => jest.advanceTimersByTime(500));
        expect(focus).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );

  test('a heading mounted after a fallback scroll still aligns and receives focus', async () => {
    jest.useFakeTimers();
    try {
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => {});
      const focus = jest
        .spyOn(Native.AccessibilityInfo, 'sendAccessibilityEvent')
        .mockImplementation(() => {});
      jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
      viewportAt(() => 103);
      const { r } = await wong();
      anchorMeasure(r, 'pay', () => {});
      await act(async () =>
        host(r, 'person-pay-anchor').props.onLayout({
          nativeEvent: { layout: { y: 800 } },
        }),
      );
      await act(async () =>
        r.root
          .find(
            (node) =>
              node.props.testID === 'person-figure-pay' &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress(),
      );
      await act(async () => jest.advanceTimersByTime(600));
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 800, animated: true });
      expect(focus).not.toHaveBeenCalled();
      const nativeHeading = {
        measureLayout: (
          _ancestor: unknown,
          done: (x: number, y: number) => void,
        ) => done(0, 900),
      };
      await act(async () =>
        host(r, 'person-pay-heading').props.onLayout({
          currentTarget: nativeHeading,
          nativeEvent: { layout: { y: 7 } },
        }),
      );
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: 900 - rhythm.block,
        animated: true,
      });
      await act(async () => jest.advanceTimersByTime(500));
      expect(focus).toHaveBeenCalledWith(nativeHeading, 'focus');
      await act(async () => r.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test('a newer tile tap cancels focus from the previous scroll', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
      jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
      viewportAt(() => 103);
      const focus = jest
        .spyOn(Native.AccessibilityInfo, 'sendAccessibilityEvent')
        .mockImplementation(() => {});
      const { r } = await wong();
      const headings = ['votes', 'interests'].map((section, i) => ({
        section,
        host: {
          measureLayout: (
            _ancestor: unknown,
            done: (x: number, y: number) => void,
          ) => done(0, 900 + i * 100),
        },
      }));
      for (const heading of headings) {
        await act(async () =>
          host(r, `person-${heading.section}-heading`).props.onLayout({
            currentTarget: heading.host,
            nativeEvent: { layout: { y: 0 } },
          }),
        );
        await act(async () =>
          r.root
            .find(
              (node) =>
                node.props.testID === `person-figure-${heading.section}` &&
                typeof node.props.onPress === 'function',
            )
            .props.onPress(),
        );
      }
      await act(async () => jest.advanceTimersByTime(500));
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith(headings[1]!.host, 'focus');
      await act(async () => r.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test.each(['votes', 'interests', 'pay'] as const)(
    '%s still scrolls on iOS when native refs are unavailable and layout targets are numeric',
    async (section) => {
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => {});
      jest
        .spyOn(ScrollView.prototype, 'getNativeScrollRef')
        .mockReturnValue(null);
      const { r } = await wong();
      let holder = host(r, `person-${section}`).parent!;
      while (typeof holder.props.onLayout !== 'function')
        holder = holder.parent!;
      await act(async () =>
        holder.props.onLayout({
          currentTarget: 71,
          nativeEvent: { layout: { y: 900 } },
        }),
      );
      await act(async () =>
        r.root
          .find(
            (node) =>
              node.props.testID === `person-figure-${section}` &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress(),
      );
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]![0]).toEqual({
        y: expect.any(Number),
        animated: true,
      });
      expect(scrollTo.mock.calls[0]![0]!.y).toBeGreaterThan(700);
    },
  );

  test.each(['ios', 'android'] as const)(
    '%s falls back for failed, throwing and unanswered native measurements',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      jest.useFakeTimers();
      try {
        const scrollTo = jest
          .spyOn(ScrollView.prototype, 'scrollTo')
          .mockImplementation(() => {});
        jest
          .spyOn(ScrollView.prototype, 'getInnerViewNode')
          .mockReturnValue(42);
        viewportAt(() => 0);
        const { r } = await wong();
        const anchor = host(r, 'person-votes-anchor');
        await act(async () =>
          anchor.props.onLayout({
            currentTarget: 71,
            nativeEvent: { layout: { y: 900 } },
          }),
        );
        const tap = () =>
          r.root
            .find(
              (node) =>
                node.props.testID === 'person-figure-votes' &&
                typeof node.props.onPress === 'function',
            )
            .props.onPress();
        for (const mode of ['failure', 'throws', 'no callback']) {
          scrollTo.mockClear();
          anchorMeasure(r, 'votes', (_ancestor, _done, fail) => {
            if (mode === 'failure') fail?.();
            else if (mode === 'throws') throw new Error('View is remounting');
          });
          await act(async () => tap());
          await act(async () => jest.advanceTimersByTime(100));
          expect(scrollTo).toHaveBeenCalledTimes(1);
          expect(scrollTo).toHaveBeenLastCalledWith({
            y:
              platform === 'ios'
                ? 900 - mockHeaderBottom
                : 900 + rhythm.block - rhythm.heading,
            animated: true,
          });
        }
        // Missing inner refs take the same layout fallback, without animation.
        jest
          .spyOn(ScrollView.prototype, 'getInnerViewNode')
          .mockReturnValue(null);
        jest.mocked(useReduceMotion).mockReturnValue(true);
        await act(async () => r.update(<Person />));
        scrollTo.mockClear();
        await act(async () => tap());
        expect(scrollTo).toHaveBeenLastCalledWith({
          y:
            platform === 'ios'
              ? 900 - mockHeaderBottom
              : 900 + rhythm.block - rhythm.heading,
          animated: false,
        });
        await act(async () => r.unmount());
      } finally {
        jest.useRealTimers();
      }
    },
  );

  test.each(['ios', 'android'] as const)(
    '%s change rows jump to votes, interests and pay',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => {});
      jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
      viewportAt(() => 0);
      const person = c.joinPerson(
        'penny-wong',
        slugs,
        roster,
        people,
        manifest,
      );
      const follow = {
        kind: 'person' as const,
        id: person.canonicalPersonId!,
        title: person.name,
        followedAt: 1,
        seen: {},
        seenAt: 1,
      };
      const changes = [
        { record: { kind: 'vote' }, marker: 'votes' },
        { record: { kind: 'register' }, marker: 'declarations' },
        { marker: 'pay' },
        { marker: 'expenses' },
      ];
      jest.mocked(useFollows).mockReturnValue([follow] as never);
      jest.mocked(useFollowStates).mockReturnValue({
        states: new Map([
          [followKey(follow), { status: 'ready', current: {}, changes }],
        ]),
      } as never);
      const { r } = await wong();
      for (const [section, top] of [
        ['votes', 500],
        ['interests', 900],
        ['pay', 1300],
      ] as const) {
        anchorMeasure(r, section, (_ancestor, done) => done(0, top, 300, 44));
      }
      for (const [index, change] of changes.entries()) {
        scrollTo.mockClear();
        await act(async () =>
          r.root.findByType(AddedSinceGroup).props.onRowPress(change),
        );
        expect(scrollTo).toHaveBeenCalledTimes(1);
        const top = [500, 900, 1300, 1300][index]!;
        expect(scrollTo).toHaveBeenLastCalledWith({
          y:
            top -
            (platform === 'ios'
              ? mockHeaderBottom + rhythm.block
              : rhythm.heading),
          animated: true,
        });
      }
    },
  );

  test('the pending profile has its own geometry and one accessible loading label', async () => {
    jest
      .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    mock.person.mockReturnValue(new Promise(() => {}));
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    const loading = host(r, 'person-loading');
    expect(loading.props.accessibilityLabel).toBe('Loading the profile');
    expect(
      r.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'progressbar',
      ),
    ).toHaveLength(1);
    expect(
      loading.findAll(
        (node) =>
          node.props.accessibilityElementsHidden &&
          node.props.importantForAccessibility === 'no-hide-descendants',
      ).length,
    ).toBeGreaterThan(0);
    for (const part of [
      'portrait',
      'name',
      'follow',
      'party',
      'seat',
      'stat-strip',
      'source',
      'votes-heading',
      'vote-0',
      'vote-1',
      'vote-2',
    ]) {
      expect(has(r, `person-loading-${part}`)).toBe(true);
    }
    expect(
      Native.StyleSheet.flatten(host(r, 'person-loading-portrait').props.style),
    ).toMatchObject({ width: 96, height: 96, borderRadius: 48 });
    const strip = host(r, 'person-loading-stat-strip');
    expect(Native.StyleSheet.flatten(strip.props.style).flexDirection).toBe(
      'row',
    );
    expect(
      strip.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID?.startsWith('person-loading-stat-tile-'),
      ),
    ).toHaveLength(3);
    expect(
      strip.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID?.startsWith('person-loading-stat-divider-'),
      ),
    ).toHaveLength(2);
  });

  test.each(['votes', 'interests', 'pay'] as const)(
    '%s jumps to the measured heading below the current iOS bar at every text size',
    async (section) => {
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => {});
      const inner = jest
        .spyOn(ScrollView.prototype, 'getInnerViewNode')
        .mockReturnValue(42);
      let viewportTop = 0;
      const viewport = viewportAt(() => viewportTop);
      const dimensions = jest
        .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
        .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
      const { r } = await wong();
      const heading = () => host(r, `person-${section}-heading`);
      const tap = () =>
        r.root
          .find(
            (node) =>
              node.props.testID === `person-figure-${section}` &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress();
      let top = 900;
      let headingOffset = 0;
      const measureLayout = jest.fn((_ancestor, done) =>
        done(0, top - headingOffset, 300, 60),
      );
      anchorMeasure(r, section, measureLayout);
      // The section's outer position is deliberately different from its heading.
      let holder = host(r, `person-${section}`).parent!;
      while (typeof holder.props.onLayout !== 'function')
        holder = holder.parent!;
      await act(async () =>
        holder.props.onLayout({ nativeEvent: { layout: { y: 740 } } }),
      );
      // xSmall through AX5: wrapping changes the heading's place and height.
      const scales = [
        0.823, 0.882, 0.941, 1, 1.118, 1.235, 1.353, 1.786, 2.143, 2.643, 3.143,
        3.571,
      ];
      for (const [size, fontScale] of scales.entries()) {
        dimensions.mockReturnValue({
          width: 390,
          height: 844,
          scale: 3,
          fontScale,
        });
        await act(async () => r.update(<Person />));
        top = 900 + size * 80;
        headingOffset = size * 3;
        await act(async () =>
          heading().props.onLayout({
            currentTarget: 71,
            nativeEvent: {
              layout: { x: 0, y: size * 3, width: 300, height: 28 + size * 12 },
            },
          }),
        );
        await act(async () => tap());
        expect(measureLayout).toHaveBeenLastCalledWith(
          42,
          expect.any(Function),
          expect.any(Function),
        );
        expect(scrollTo).toHaveBeenLastCalledWith({
          y: top - mockHeaderBottom - rhythm.block,
          animated: true,
        });
      }
      // A large-title collapse changes the bar bottom, including its safe area.
      mockHeaderBottom = 83;
      await act(async () => r.update(<Person />));
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: top - 83 - rhythm.block,
        animated: true,
      });
      // An opaque bar already moves the scroll view below its bottom.
      viewportTop = mockHeaderBottom;
      await act(async () => tap());
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: top - rhythm.block,
        animated: true,
      });
      // Re-read the current native position on another tap, without animation.
      jest.mocked(useReduceMotion).mockReturnValue(true);
      await act(async () => r.update(<Person />));
      await act(async () => tap());
      expect(scrollTo).toHaveBeenLastCalledWith({
        y: top - rhythm.block,
        animated: false,
      });
      // Expanding content after arrival must not pull the reader back up.
      scrollTo.mockClear();
      await act(async () =>
        holder.props.onLayout({ nativeEvent: { layout: { y: 820 } } }),
      );
      expect(scrollTo).not.toHaveBeenCalled();
      await act(async () => r.unmount());
      inner.mockRestore();
      viewport.mockRestore();
      scrollTo.mockRestore();
    },
  );

  test('Android measures the section against the scroll content', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
    const { r } = await wong();
    anchorMeasure(r, 'interests', (_ancestor, done) => done(0, 900, 300, 60));
    let holder = host(r, 'person-interests').parent!;
    while (typeof holder.props.onLayout !== 'function') holder = holder.parent!;
    await act(async () =>
      holder.props.onLayout({ nativeEvent: { layout: { y: 900 } } }),
    );
    await act(async () =>
      r.root
        .find(
          (node) =>
            node.props.testID === 'person-figure-interests' &&
            typeof node.props.onPress === 'function',
        )
        .props.onPress(),
    );
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 900 - rhythm.heading,
      animated: true,
    });
    await act(async () => r.unmount());
  });

  test('a newer jump cancels an earlier native measurement', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(42);
    viewportAt(() => 0);
    const { r } = await wong();
    const pending: Parameters<Native.View['measureLayout']>[1][] = [];
    for (const section of ['interests', 'votes']) {
      anchorMeasure(r, section, (_ancestor, done) => pending.push(done));
      await act(async () =>
        host(r, `person-${section}-heading`).props.onLayout({
          currentTarget: 71,
          nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 28 } },
        }),
      );
      await act(async () =>
        r.root
          .find(
            (node) =>
              node.props.testID === `person-figure-${section}` &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress(),
      );
    }
    await act(async () => pending[0]!(0, 900, 300, 60));
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => pending[1]!(0, 500, 300, 60));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 500 - 103 - rhythm.block,
      animated: true,
    });
    await act(async () => r.unmount());
  });

  test('?section=interests waits for the heading and never animates its arrival', async () => {
    mockParams.section = 'interests';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    const inner = jest
      .spyOn(ScrollView.prototype, 'getInnerViewNode')
      .mockReturnValue(42);
    const viewport = viewportAt(() => 0);
    const { r } = await wong();
    expect(scrollTo).not.toHaveBeenCalled();
    anchorMeasure(r, 'interests', (_ancestor, done) => done(0, 1193, 300, 60));
    await act(async () =>
      host(r, 'person-interests-heading').props.onLayout({
        currentTarget: 71,
        nativeEvent: { layout: { x: 0, y: 7, width: 300, height: 90 } },
      }),
    );
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 1200 - 103 - rhythm.block,
      animated: false,
    });
    await act(async () => r.unmount());
    inner.mockRestore();
    viewport.mockRestore();
    scrollTo.mockRestore();
  });

  test('a member with one recorded division is counted in the singular', async () => {
    mockParams.slug = 'penny-wong';
    const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
    const profile = c.profileFor(person.canonicalPersonId!, catalogs);
    const votes = profile.blocks.votes;
    mock.person.mockResolvedValue(result(person));
    mock.profileFor.mockResolvedValue({
      ...profile,
      blocks: {
        ...profile.blocks,
        votes: { ...votes, data: { ...votes.data!, total: 1 } },
      },
    });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    expect(text(r)).toContain('Voted in 1 division');
    expect(text(r)).not.toContain('1 divisions');
    expect(
      r.root.find(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'person-figure-votes' &&
          typeof n.props.label === 'string',
      ).props.label,
    ).toBe('division');
    // Sweep 1, item 9: every tile label fits one line at Large, with its
    // chevron after the last word.
    const labels = r.root
      .findAll(
        (n) =>
          typeof n.type !== 'string' &&
          /^person-figure-/.test(n.props.testID ?? '') &&
          typeof n.props.label === 'string',
      )
      .map((n) => n.props.label as string);
    expect(labels).toEqual(
      expect.arrayContaining(['division', 'a year in pay']),
    );
    expect(labels).not.toContain('declared interests');
    for (const label of labels) expect(label.length).toBeLessThanOrEqual(13);
    await act(async () => r.unmount());
  });

  test('strip and sections agree: each tile reads its section’s selector', async () => {
    const { r, profile } = await wong();
    const votes = votesCount(profile)!;
    const interests = interestsCount(profile)!;
    const pay = annualPay(profile)!;
    expect(votes).toBeGreaterThan(0);
    expect(interests).toBeGreaterThan(0);
    expect(pay).toBeGreaterThan(0);
    const tile = (id: string) =>
      host(r, `person-figure-${id}`).props.accessibilityLabel as string;
    expect(tile('votes')).toContain(formatCount(votes));
    expect(tile('interests')).toContain(formatCount(interests));
    expect(tile('pay')).toContain(formatMoney(pay));
    // The sections draw the same figures.
    expect(text(r)).toContain(`Voted in ${formatCount(votes)} divisions`);
    expect(host(r, 'person-pay-salary').props.accessibilityLabel).toContain(
      moneyAccessibilityLabel(pay),
    );
    expect(text(r)).toContain(formatMoney(pay));
    const buckets = Object.values(
      profile.blocks.interests.data!.buckets,
    ).reduce((sum, b) => sum + b.count, 0);
    expect(buckets).toBe(interests);
    await act(async () => r.unmount());
  });

  test('D6 order with every block held, and the interests tile counts what the section draws', async () => {
    const { r, profile } = await wong();
    // The fixture holds each block the order names.
    for (const block of ['votes', 'interests', 'pay', 'expenses'] as const)
      expect(profile.blocks[block].data).not.toBeNull();
    const ORDER = [
      'person-votes',
      'person-interests',
      'person-pay',
      'person-expenses',
      'person-receipts',
      'person-more',
      'person-speeches',
    ];
    const drawnOrder = r.root
      .findAll(
        (n) => typeof n.type === 'string' && ORDER.includes(n.props.testID),
      )
      .map((n) => n.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);
    expect(drawnOrder).toEqual(ORDER);
    // The headings read in the same order.
    const headings = r.root
      .findAllByType(Section)
      .map((n) => n.props.title as string | undefined)
      .filter((t): t is string =>
        [
          'Voting record',
          'Declared interests',
          'Pay',
          'Expenses',
          'Party receipts',
          'More from the record',
        ].includes(t ?? ''),
      );
    expect(headings).toEqual([
      'Voting record',
      'Declared interests',
      'Pay',
      'Expenses',
      'Party receipts',
      'More from the record',
    ]);
    // The section's categories add up to the strip's interests figure.
    const drawnTotal = r.root
      .findAll(
        (n) =>
          typeof n.props.testID === 'string' &&
          /^interest-bucket-[^-]+$/.test(n.props.testID) &&
          typeof n.props.value === 'string',
      )
      .filter(
        (n, i, all) =>
          all.findIndex((m) => m.props.testID === n.props.testID) === i,
      )
      .reduce((sum, n) => sum + Number(n.props.value.replace(/,/g, '')), 0);
    const interests = interestsCount(profile)!;
    expect(drawnTotal).toBe(interests);
    expect(
      host(r, 'person-figure-interests').props.accessibilityLabel,
    ).toContain(formatCount(drawnTotal));
    await act(async () => r.unmount());
  });

  test('the strip’s source line carries the oldest contributing date and names that source first', () => {
    const block = (asAt: string | null) => ({ asAt });
    const profile = {
      blocks: {
        identity: block('2026-09-04'),
        votes: { ...block('2026-08-26'), data: { total: 10, years: [2006] } },
        interests: { ...block('2026-08-14'), data: { total: 28 } },
        pay: {
          ...block('2026-09-17'),
          data: { person: { now: { salary: 622102 } } },
        },
      },
    } as unknown as Pick<ProfileView, 'blocks'>;
    const strip = stripSources(profile);
    expect(strip.asOf).toBe('2026-08-14');
    expect(strip.citation).toHaveLength(4);
    expect(strip.citation[0]).toMatchObject({
      label: 'Register of interests',
      asOf: '2026-08-14',
    });
    // Every source keeps its own date in the sheet.
    expect(strip.citation.map((s) => s.asOf).sort()).toEqual([
      '2026-08-14',
      '2026-08-26',
      '2026-09-04',
      '2026-09-17',
    ]);
  });

  test('pay is dated by its rate, never by when the post began', () => {
    const pay = (from: string) =>
      ({
        person: {
          now: {
            post: 'Prime Minister',
            pct: 160,
            salary: 622102,
            since: '2022-05-23',
            assumed: false,
          },
          spells: [['2022-05-23', null, 'Prime Minister', 160, 622102]],
          by_year: [],
        },
        base: { from, amount: 239270, source: '', url: '' },
      }) as unknown as Parameters<typeof payRateLine>[0];
    expect(payRateLine(pay('2026-07-01'))).toEqual({
      line: 'a year as Prime Minister, rate from 1 Jul 2026',
      dated: true,
    });
    const undated = payRateLine(pay(''));
    expect(undated).toEqual({ line: 'a year as Prime Minister', dated: false });
    expect(undated.line).not.toMatch(/2022|May/);
    const member = pay('2026-07-01');
    member.person.now!.post = 'Member of the House of Representatives';
    expect(payRateLine(member).line).toBe(
      'a year, base salary, rate from 1 Jul 2026',
    );
  });

  test('nothing the profile draws or speaks has an em dash', async () => {
    const { r } = await wong();
    const said = r.root
      .findAll(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' ||
          typeof n.props.children === 'string',
      )
      .flatMap((n) => [n.props.accessibilityLabel, n.props.children])
      .filter((v): v is string => typeof v === 'string');
    expect(said.length).toBeGreaterThan(20);
    for (const words of [...said, text(r)]) expect(words).not.toContain('—');
    await act(async () => r.unmount());
  });

  test('an unknown person is "not in OPAX" only after the directory read succeeds', async () => {
    // The state's composite: its title and its one action.
    const state = (r: TestRenderer.ReactTestRenderer, testID: string) =>
      r.root.findAll(
        (n) => n.props.testID === testID && typeof n.props.title === 'string',
      )[0];
    mockParams.slug = 'no-such-person';
    mock.person.mockRejectedValue(
      new ApiError('not-found', 'This person is not in the public directory.'),
    );
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    const missing = state(r, 'person-not-found')!;
    expect(missing.props.title).toBe('This person isn’t in OPAX');
    expect(has(r, 'person-not-found-search')).toBe(true);
    expect(has(r, 'person-error')).toBe(false);
    expect(drawn(r)).not.toContain('Try again');
    await act(async () => r.unmount());

    // A failed read is never a fact about the person.
    mock.person.mockRejectedValue(new ApiError('server', 'Unavailable'));
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    expect(has(r, 'person-not-found')).toBe(false);
    const failed = state(r, 'person-error')!;
    expect(failed.props.title).toBe('Couldn’t load this profile');
    expect(failed.props.action.label).toBe('Try again');
    await act(async () => r.unmount());
  });

  test('?section=changes scrolls to Added since; an unchanged page has no group', async () => {
    // Unchanged: no group, and nothing scrolls.
    mockParams.section = 'changes';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const inner = jest
      .spyOn(ScrollView.prototype, 'getInnerViewNode')
      .mockReturnValue(42);
    const viewport = viewportAt(() => 0);
    const quiet = await wong();
    expect(has(quiet.r, 'person-added-since')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => quiet.r.unmount());

    // Followed, with a change since the reader last looked.
    const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
    const follow = {
      kind: 'person' as const,
      id: person.canonicalPersonId!,
      title: 'Penny Wong',
      followedAt: 1,
      seen: {},
      seenAt: 1,
    };
    jest.mocked(useFollows).mockReturnValue([follow] as never);
    jest.mocked(useFollowStates).mockReturnValue({
      states: new Map([
        [
          `person:${person.canonicalPersonId}`,
          {
            status: 'ready',
            title: 'Penny Wong',
            current: {},
            keys: [],
            changes: [
              {
                marker: 'declarations',
                text: 'Declared a gift',
                citation: 'Register of interests',
                asAt: '2026-10-01',
              },
            ],
          },
        ],
      ]),
    } as never);
    const { r } = await wong();
    expect(has(r, 'person-added-since')).toBe(true);
    // The group's place arrives with its layout; the page then scrolls there.
    const group = host(r, 'person-added-since');
    let holder: TestRenderer.ReactTestInstance | null = group.parent;
    while (holder && typeof holder.props.onLayout !== 'function')
      holder = holder.parent;
    while (typeof holder!.instance?.measureLayout !== 'function')
      holder = holder!.parent;
    holder!.instance.measureLayout = (
      _ancestor: unknown,
      done: (x: number, y: number) => void,
    ) => done(0, 900);
    await act(async () =>
      holder!.props.onLayout({
        currentTarget: 71,
        nativeEvent: { layout: { y: 900 } },
      }),
    );
    expect(scrollTo).toHaveBeenCalled();
    const target = scrollTo.mock.calls.at(-1)![0] as { y: number };
    expect(target.y).toBeGreaterThan(0);
    expect(target.y).toBeLessThanOrEqual(900);
    // It lands above Voting record: the group comes first.
    const order = r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['person-added-since', 'person-votes'].includes(n.props.testID),
      )
      .map((n) => n.props.testID);
    expect(order[0]).toBe('person-added-since');
    scrollTo.mockRestore();
    inner.mockRestore();
    viewport.mockRestore();
    await act(async () => r.unmount());
  });
});

describe('party', () => {
  type PartyView = Awaited<ReturnType<typeof partyApi.partyPage>>;
  const views: Record<string, PartyView> = {};
  // Real, bounded work: two party pages through the real catalogue code over
  // the pinned snapshot (money graph, bill index and up to 32 bills, people,
  // roster), about 0.25 s on an idle Mac. Jest's 5 s default is only a hang
  // check, and gate load has run this suite 5x slower (22.9 s, 13 Nov). 30 s
  // still fails a read that never settles.
  beforeAll(async () => {
    for (const name of ['Labor', 'Liberal'])
      views[name] = await partyApi.partyPage(name);
  }, 30_000);
  beforeEach(() => {
    jest
      .mocked(runtime.partyPage)
      .mockImplementation(async (name: string) => views[name]!);
    jest
      .mocked(peopleDepth.access)
      .mockResolvedValue(result(decodeAccess(pinned('/access.json'))) as never);
    jest
      .mocked(peopleDepth.funding)
      .mockResolvedValue(
        result(decodeFunding(pinned('/graph/aec-extras.json'))) as never,
      );
  });
  afterEach(() => {
    delete mockParams.name;
  });
  async function party(name: string) {
    mockParams.slug = name;
    mockParams.name = name;
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Party />);
    });
    return r;
  }
  // The page's sections, in the order they are drawn.
  const SECTIONS = [
    'party-figures',
    'party-figure-members',
    'party-figure-receipts',
    'party-members',
    'party-members-all',
    'party-current-count',
    'party-receipts',
    'party-receipts-total',
    'party-debts-section',
    'party-divisions',
    // Meetings and lobbying collapses when the snapshot has neither half.
    'party-more',
    'party-figures-source',
    'party-end',
  ];
  const layout = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) => typeof n.type === 'string' && SECTIONS.includes(n.props.testID),
      )
      .map((n) => n.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);

  test('two parties draw the same layout', async () => {
    const labor = await party('Labor');
    const liberal = await party('Liberal');
    expect(views.Labor!.data?.label).toBe('Labor');
    expect(views.Liberal!.data?.label).toBe('Liberal');
    expect(layout(labor)).toEqual(SECTIONS);
    expect(layout(liberal)).toEqual(layout(labor));
    await act(async () => {
      labor.unmount();
      liberal.unmount();
    });
  });

  test('one sitting member and one receipt are counted in the singular', async () => {
    const labor = views.Labor!;
    const data = labor.data!;
    views.Single = {
      ...labor,
      data: {
        ...data,
        members: {
          ...data.members,
          data: { ...data.members.data!, currentCount: 1 },
        },
        receipts: {
          ...data.receipts,
          data: {
            ...data.receipts.data!,
            node: { ...data.receipts.data!.node, count: 1 },
          },
        },
      },
    } as PartyView;
    const r = await party('Single');
    const words = text(r);
    expect(words).toContain('1 sitting member');
    expect(words).not.toContain('1 sitting members');
    expect(words).toContain('from 1 donation or receipt');
    expect(
      r.root.find(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'party-figure-members' &&
          typeof n.props.label === 'string',
      ).props.label,
    ).toBe('sitting member');
    delete views.Single;
    await act(async () => r.unmount());
  });

  test('the strip has two tiles, each the figure its section draws', async () => {
    const r = await party('Labor');
    const data = views.Labor!.data!;
    const tiles = r.root.findAll(
      (n) =>
        typeof n.type !== 'string' &&
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('party-figure-') &&
        typeof n.props.value === 'string',
    );
    expect(
      [...new Set(tiles.map((t) => t.props.testID as string))].sort(),
    ).toEqual(['party-figure-members', 'party-figure-receipts']);
    const members = data.members.data!.currentCount;
    const total = data.receipts.data!.node.total;
    expect(members).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
    const tile = (id: string) => host(r, id).props.accessibilityLabel as string;
    expect(tile('party-figure-members')).toContain(formatCount(members));
    expect(tile('party-figure-receipts')).toContain(formatMoneyCompact(total));
    // The sections draw the same figures.
    expect(tile('party-current-count')).toContain(formatCount(members));
    expect(tile('party-receipts-total')).toContain(
      moneyAccessibilityLabel(total),
    );
    expect(drawn(r)).toContain(formatMoney(total));
    await act(async () => r.unmount());
  });

  test('?section=changes on an unchanged party draws no group and does not scroll', async () => {
    mockParams.section = 'changes';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const r = await party('Labor');
    expect(has(r, 'party-added-since')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
    await act(async () => r.unmount());
  });

  test('?section=changes with a followed party scrolls to Added since, above Members', async () => {
    mockParams.section = 'changes';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const follow = {
      kind: 'party' as const,
      id: partySlug('Labor'),
      title: 'Labor',
      followedAt: 1,
      seen: {},
      seenAt: 1,
    };
    jest.mocked(useFollows).mockReturnValue([follow] as never);
    jest.mocked(useFollowStates).mockReturnValue({
      states: new Map([
        [
          followKey(follow),
          {
            status: 'ready',
            title: 'Labor',
            current: {},
            keys: [],
            changes: [
              {
                marker: 'members',
                text: 'A new sitting member',
                citation: 'Parliamentary roster',
                asAt: '2026-10-01',
              },
            ],
          },
        ],
      ]),
    } as never);
    const r = await party('Labor');
    try {
      expect(has(r, 'party-added-since')).toBe(true);
      // It lands above Members: the group comes first.
      const order = r.root
        .findAll(
          (n) =>
            typeof n.type === 'string' &&
            ['party-added-since', 'party-members'].includes(n.props.testID),
        )
        .map((n) => n.props.testID);
      expect(order[0]).toBe('party-added-since');
      // The group's own wrapper reports its place; the page then scrolls.
      let holder: TestRenderer.ReactTestInstance | null = host(
        r,
        'party-added-since',
      ).parent;
      while (holder && typeof holder.props.onLayout !== 'function')
        holder = holder.parent;
      expect(holder).not.toBeNull();
      expect(
        holder!.findAll((n) => n.props.testID === 'party-members'),
      ).toHaveLength(0);
      await act(async () =>
        holder!.props.onLayout({ nativeEvent: { layout: { y: 900 } } }),
      );
      expect(scrollTo).toHaveBeenCalled();
      const target = scrollTo.mock.calls.at(-1)![0] as { y: number };
      expect(target.y).toBeGreaterThan(0);
      expect(target.y).toBeLessThanOrEqual(900);
    } finally {
      scrollTo.mockRestore();
      await act(async () => r.unmount());
    }
  });

  // Every string the page draws or speaks, by the row it sits in.
  const spoken = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' ||
          typeof n.props.children === 'string',
      )
      .map((n) => {
        let row: TestRenderer.ReactTestInstance | null = n;
        while (row && !String(row.props.testID ?? '').startsWith('party-'))
          row = row.parent;
        return {
          division: String(row?.props.testID ?? '').startsWith('party-bill-'),
          words: [n.props.accessibilityLabel, n.props.children].filter(
            (v): v is string => typeof v === 'string',
          ),
        };
      });

  test('nothing the party page draws or speaks has retired wording, or an em dash outside the vote rows', async () => {
    for (const name of ['Labor', 'Liberal']) {
      const r = await party(name);
      const said = spoken(r);
      expect(said.length).toBeGreaterThan(20);
      for (const { words } of said)
        for (const w of words)
          for (const retired of [
            'Political party',
            'Public money',
            'Rank',
            'in this export',
          ])
            expect(w).not.toContain(retired);
      for (const { division, words } of said)
        if (!division) for (const w of words) expect(w).not.toContain('\u2014');
      for (const retired of ['Political party', 'Public money', 'Rank'])
        expect(drawn(r)).not.toContain(retired);
      await act(async () => r.unmount());
    }
  });

  test('on an iPad at regular width, Members pairs with Recent votes and Receipts with Debts', async () => {
    const sectionsIn = (n: TestRenderer.ReactTestInstance) =>
      n
        .findAll(
          (m) =>
            typeof m.type === 'string' &&
            [
              'party-members',
              'party-divisions',
              'party-receipts',
              'party-debts-section',
            ].includes(m.props.testID),
        )
        .map((m) => m.props.testID as string)
        .filter((id, i, all) => all.indexOf(id) === i);
    // iPhone: one column, nothing paired, the phone order kept.
    const phone = await party('Labor');
    expect(phone.root.findAllByType(PadGrid)).toHaveLength(0);
    expect(layout(phone)).toEqual(SECTIONS);
    await act(async () => phone.unmount());
    setPad(true);
    try {
      const pad = await party('Labor');
      const grids = pad.root.findAllByType(PadGrid);
      expect(grids.map(sectionsIn)).toEqual([
        ['party-members', 'party-divisions'],
        ['party-receipts', 'party-debts-section'],
      ]);
      await act(async () => pad.unmount());
    } finally {
      setPad(false);
    }
  });

  test('?section=receipts still lands on Receipts when the sections pair', async () => {
    setPad(true);
    mockParams.section = 'receipts';
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    try {
      const r = await party('Labor');
      const anchors = r.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          typeof n.props.onLayout === 'function' &&
          n.findAllByType(PadGrid).length === 1 &&
          n.findAll((m) => m.props.testID === 'party-receipts').length > 0 &&
          n.findAll((m) => m.props.testID === 'party-members').length === 0,
      );
      expect(anchors.length).toBeGreaterThan(0);
      await act(async () => {
        anchors[anchors.length - 1]!.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 900, width: 1000, height: 400 } },
        });
      });
      expect(scrollTo).toHaveBeenCalled();
      const y = (scrollTo.mock.calls.at(-1)![0] as { y: number }).y;
      expect(y).toBeGreaterThan(700);
      await act(async () => r.unmount());
    } finally {
      scrollTo.mockRestore();
      setPad(false);
    }
  });

  test('the Recent votes rows draw no em dash', async () => {
    const r = await party('Labor');
    try {
      const rows = spoken(r).filter((s) => s.division);
      expect(rows.length).toBeGreaterThan(0);
      for (const { words } of rows)
        for (const w of words) expect(w).not.toContain('\u2014');
      expect(drawn(r)).not.toContain('\u2014');
    } finally {
      await act(async () => r.unmount());
    }
  });
});

describe('record list', () => {
  beforeEach(() => jest.mocked(peopleDepth.list).mockReset());
  afterEach(() => {
    delete mockParams.kind;
    delete mockParams.person;
    delete mockParams.name;
  });
  async function list(kind: string) {
    mockParams.kind = kind;
    mockParams.person = 'penny-wong';
    mockParams.name = 'Penny Wong';
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<RecordList />);
    });
    return r;
  }

  const page = (start: number, count: number) => ({
    records: result(
      decodeRecords({
        results: Array.from({ length: count }, (_, index) => ({
          slug: `speech-fixture-${start + index}`,
          title: `Fixture speech ${start + index}`,
        })),
      }),
    ),
    briefs: {},
  });

  test('a failed next page keeps loaded speeches and offers an explicit retry of that page', async () => {
    jest
      .mocked(peopleDepth.list)
      .mockResolvedValueOnce(page(0, 20))
      .mockRejectedValueOnce(new ApiError('server', 'Unavailable'))
      .mockResolvedValueOnce(page(20, 1));
    const r = await list('speeches');
    await act(async () => r.root.findByType(FlatList).props.onEndReached());
    expect(r.root.findByType(FlatList).props.data).toHaveLength(20);
    const error = r.root.find(
      (node) =>
        node.props.testID === 'record-list-page-error' && !!node.props.onRetry,
    );
    // Scrolling again cannot repeatedly retry a failed paid read.
    await act(async () => r.root.findByType(FlatList).props.onEndReached());
    expect(peopleDepth.list).toHaveBeenCalledTimes(2);
    await act(async () => error.props.onRetry());
    expect(peopleDepth.list).toHaveBeenLastCalledWith(
      'Penny Wong',
      'speeches',
      2,
    );
    expect(r.root.findByType(FlatList).props.data).toHaveLength(21);
    expect(has(r, 'record-list-page-error')).toBe(false);
    await act(async () => r.unmount());
  });

  test('repeated end events start one page read and overlapping pages draw each record once', async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    jest
      .mocked(peopleDepth.list)
      .mockResolvedValueOnce(page(0, 20))
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const r = await list('speeches');
    await act(async () => {
      const next = r.root.findByType(FlatList).props.onEndReached;
      next();
      next();
    });
    expect(peopleDepth.list).toHaveBeenCalledTimes(2);
    await act(async () => finish(page(19, 2)));
    expect(r.root.findByType(FlatList).props.data).toHaveLength(21);
    await act(async () => r.unmount());
  });

  test('news is not available yet: no read, and no Try again that cannot work', async () => {
    const r = await list('news');
    expect(peopleDepth.list).not.toHaveBeenCalled();
    const state = r.root.find(
      (n) =>
        n.props.testID === 'record-list-unavailable' &&
        n.props.title !== undefined,
    );
    expect(state.props.title).toBe('News isn’t available yet');
    expect(state.props.symbol).toBe('newspaper');
    expect(state.props.body).toBeUndefined();
    expect(state.props.action).toBeUndefined();
    expect(has(r, 'record-list-error')).toBe(false);
    await act(async () => r.unmount());
  });

  test('a failed speeches read keeps its Try again', async () => {
    jest
      .mocked(peopleDepth.list)
      .mockRejectedValue(new ApiError('server', 'down'));
    const r = await list('speeches');
    expect(peopleDepth.list).toHaveBeenCalled();
    const error = r.root.find(
      (n) =>
        n.props.testID === 'record-list-error' && n.props.title !== undefined,
    );
    expect(error.props.action?.label).toBe('Try again');
    expect(has(r, 'record-list-unavailable')).toBe(false);
    await act(async () => r.unmount());
  });
});

test.each(['ios', 'android'] as const)(
  '%s former profile has a full-width count, dated identity and titled Speeches',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const { r: initial, person, profile } = await wong();
    act(() => initial.unmount());
    const identity = {
      ...person,
      name: 'Casey Example',
      partyStatus: 'former' as const,
      seats: [],
      rosterRow: {
        ...person.rosterRow!,
        name: 'Casey Example',
        representation: [
          {
            jurisdiction: 'federal',
            chamber: 'representatives',
            electorate: 'Example Vale',
            state: 'VIC',
          },
        ],
      },
    };
    const lastSeat = {
      ...person.seats[0]!,
      current: false,
      jurisdiction: 'federal',
      chamber: 'representatives',
      name: 'Example Vale',
      periods: [{ start: '1998-10-03', end: '2013-08-05' }],
    };
    mock.person.mockResolvedValue(result(identity));
    mock.directory.mockResolvedValue({
      ...directory,
      people: result({
        ...people,
        people: people.people.map((p) =>
          p.person_id === identity.canonicalPersonId
            ? { ...p, electorates: [lastSeat] }
            : p,
        ),
      }),
    } as never);
    const blocks = {
      ...profile.blocks,
      identity: { ...profile.blocks.identity, data: identity },
      interests: { ...profile.blocks.interests, data: null },
      pay: { ...profile.blocks.pay, data: null },
    };
    mock.profileFor.mockResolvedValue({ ...profile, blocks });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    expect(r.root.findAllByType(StatStrip)).toHaveLength(0);
    expect(host(r, 'person-former').props.children).toBe(
      'Former member for Example Vale, Victoria, 1998 to 2013',
    );
    const summary = r.root
      .findAllByType(LinkRow)
      .find((n) => n.props.testID === 'person-figure-votes')!;
    expect(summary.props.title).toMatch(/^[\d,]+ divisions, \d{4} to \d{4}$/);
    const more = r.root.findByType(MoreFromRecord);
    expect(
      more
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'person-speeches'),
    ).toBeDefined();
    act(() => r.unmount());
  },
);

test.each(['ios', 'android'] as const)(
  '%s unknown person centres its recovery and keeps a Done bar',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockParams.slug = 'casey-missing';
    mock.person.mockRejectedValue(
      new ApiError('not-found', 'Missing fixture person'),
    );
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Person />);
    });
    expect(r.root.findByType(Screen).props.centred).toBe(true);
    const unavailable = r.root.findByType(ContentUnavailable);
    expect(unavailable.props.symbol).toBe(
      'person.crop.circle.badge.questionmark',
    );
    expect(unavailable.props.action.label).toBe('Search parliamentarians');
    const options = r.root.findByType(RouteOptions).props.options;
    expect(options).toMatchObject({
      headerShown: true,
      headerTitle: 'No profile',
      headerLargeTitleEnabled: false,
    });
    if (platform === 'ios') {
      const items = options.unstable_headerRightItems();
      expect(items[0].label).toBe('Done');
      act(() => items[0].onPress());
      expect(router.back).toHaveBeenCalled();
    }
    act(() => unavailable.props.action.onPress());
    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/search',
        params: expect.objectContaining({ scope: 'people' }),
      }),
    );
    act(() => r.unmount());
  },
);
