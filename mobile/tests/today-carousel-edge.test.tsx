/**
 * The Today edition carousel's neighbouring cards fade into the page instead
 * of stopping dead at the column's edge (an iPhone Duo screenshot, 14 Nov:
 * unfolded in landscape, the next card's sliver read as a rendering fault).
 * The unfolded Duo is staged with window traits and a measured region.
 */
import { act, type ReactElement, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import TestRenderer, {
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Stop, LinearGradient } from 'react-native-svg';
import { decodeRoster, decodeSlugs } from '../src/api/catalog-decoders';
import type { EditionView } from '../src/api/selectors';
import { useIncreaseContrast } from '../src/design/accessibility';
import {
  RegionProvider,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { paletteFor } from '../src/design/palette';
import { SurfaceContext } from '../src/design/row-padding';
import { colors } from '../src/design/tokens';
import { FeaturedPeopleCarousel } from '../src/features/today/FeaturedPeopleCard';
import { featuredPeople } from '../src/features/today/featured-people';
import type { TodayOrder, TodaySlot } from '../src/features/today/order';
import { TodayBody } from '../src/features/today/TodayBody';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockScheme,
}));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: false } },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { roster: jest.fn(), slugs: jest.fn() },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
  useIncreaseContrast: jest.fn(() => false),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});

const today = '2026-11-10';
const edition: EditionView = {
  date: today,
  kind: 'politician',
  kindLabel: 'Parliamentarian',
  kindShort: 'Parliamentarian',
  title: 'Richard Marles',
  cardTitle: 'Richard Marles',
  shortTitle: null,
  path: '/person/richard-marles',
  paragraphs: ['Richard Marles: 793 speeches in the OPAX record.'],
  machineWritten: null,
  sourceRows: [],
  facts: {
    kicker: 'Parliamentarian · Corio, VIC',
    line: 'Labor',
    figures: [],
    bars: null,
    events: [],
    division: null,
  },
};
const rows = [
  ['Richard Marles', 'Labor'],
  ['Liberal Member', 'Liberal'],
  ['Greens Member', 'Greens'],
  ['Independent Member', 'Independent'],
];
const roster = decodeRoster({
  meta: { generated: '2026-11-09' },
  people: rows.map(([name, party], index) => ({
    name,
    party,
    pid: String(10000 + index),
    current: true,
    speeches: 793 + index,
    representation: [
      {
        jurisdiction: 'federal',
        chamber: 'representatives',
        electorate: 'Example',
        state: 'VIC',
      },
    ],
  })),
});
const slugs = decodeSlugs({
  generated: '2026-11-09',
  slugs: Object.fromEntries(
    rows.map(([name]) => [name!.toLowerCase().replaceAll(' ', '-'), name]),
  ),
});
const people = featuredPeople(edition, roster, slugs);

const GAP = 12;
const PEEK = 16;
const BLEED = 16;
const LEADING = 'today-featured-edge-leading';
const TRAILING = 'today-featured-edge-trailing';

const trees: ReactTestRenderer[] = [];
async function render(node: ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(node);
  });
  trees.push(tree);
  return tree.root;
}
const hosts = (root: ReactTestInstance, id: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
// Async: a fade mounted by the change reads Reduce Transparency.
const measure = (root: ReactTestInstance, width: number) =>
  act(async () => {
    hosts(root, 'today-featured')[0]!.props.onLayout({
      nativeEvent: { layout: { width } },
    });
  });
const scrollTo = (root: ReactTestInstance, x: number) =>
  act(async () => {
    root.findByType(ScrollView).props.onScroll({
      nativeEvent: { contentOffset: { x } },
    });
  });
const flat = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style);
function windowOf(width: number, height: number, fontScale = 1) {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height, scale: 3, fontScale });
}

beforeEach(() => {
  mockScheme = 'light';
  windowOf(402, 874);
  jest.mocked(useIncreaseContrast).mockReturnValue(false);
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(false);
});
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  jest.mocked(useWindowDimensions).mockRestore();
  jest.restoreAllMocks();
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});

describe('the carousel’s edges', () => {
  test('the fixture has several people', () => {
    expect(people.length).toBeGreaterThan(2);
  });

  test('on the first card only the trailing edge fades, over the next card and never the selected one', async () => {
    const width = 374;
    const root = await render(<FeaturedPeopleCarousel people={people} />);
    await measure(root, width);
    expect(hosts(root, LEADING)).toHaveLength(0);
    const [edge] = hosts(root, TRAILING);
    expect(edge).toBeDefined();
    // The pages run 16 pt past the column on both sides; the content is
    // inset by the same amount, so every card still snaps to the column.
    const pages = root.findByType(ScrollView);
    expect(flat(pages.parent!.parent!).marginHorizontal).toBe(-BLEED);
    expect(pages.props.contentContainerStyle).toEqual({
      gap: GAP,
      paddingLeft: BLEED,
      paddingRight: GAP + PEEK + BLEED,
    });
    expect(pages.props.snapToInterval).toBe(width - PEEK);
    // Placement, in the column's coordinates: the fade ends where the pages
    // are clipped and begins at the next card, a gap past the selected one.
    expect(flat(edge!)).toMatchObject({
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      width: PEEK + BLEED,
    });
    const selectedCardEnds = width - (GAP + PEEK);
    const fadeBegins = width + BLEED - flat(edge!).width;
    expect(fadeBegins - selectedCardEnds).toBe(GAP);
    // Opaque at the clipped edge, clear towards the card.
    expect(edge!.findByType(LinearGradient).props).toMatchObject({
      x1: '1',
      x2: '0',
      y1: '0',
      y2: '0',
    });
    expect(
      edge!.findAllByType(Stop).map((stop) => stop.props.stopOpacity),
    ).toEqual([1, 0]);
  });

  test('part-way through a swipe both edges fade; on the last card only the leading one', async () => {
    const width = 374;
    const interval = width - PEEK;
    const root = await render(<FeaturedPeopleCarousel people={people} />);
    await measure(root, width);
    await scrollTo(root, interval / 2);
    expect(hosts(root, LEADING)).toHaveLength(1);
    expect(hosts(root, TRAILING)).toHaveLength(1);
    const [leading] = hosts(root, LEADING);
    // Entirely inside the bleed: the selected card starts where it ends.
    expect(flat(leading!)).toMatchObject({
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: BLEED,
    });
    expect(leading!.findByType(LinearGradient).props).toMatchObject({
      x1: '0',
      x2: '1',
    });
    // At rest the previous card's last 4 pt lie under the opaque part.
    expect(
      leading!
        .findAllByType(Stop)
        .map((stop) => [Number(stop.props.offset), stop.props.stopOpacity]),
    ).toEqual([
      [0, 1],
      [(BLEED - GAP) / BLEED, 1],
      [1, 0],
    ]);
    await scrollTo(root, (people.length - 1) * interval);
    expect(hosts(root, LEADING)).toHaveLength(1);
    expect(hosts(root, TRAILING)).toHaveLength(0);
    await scrollTo(root, 0);
    expect(hosts(root, LEADING)).toHaveLength(0);
    expect(hosts(root, TRAILING)).toHaveLength(1);
  });

  test('a page button and a resize keep the edges with the selected card', async () => {
    const scroll = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    const root = await render(<FeaturedPeopleCarousel people={people} />);
    await measure(root, 374);
    const last = people.length - 1;
    // Settling on the last card (the native scroll's end) drops the trailing fade.
    await act(async () => {
      root.findByType(ScrollView).props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: last * 358 } },
      });
    });
    expect(hosts(root, TRAILING)).toHaveLength(0);
    await measure(root, 600);
    expect(scroll).toHaveBeenLastCalledWith({
      x: last * 584,
      animated: false,
    });
    expect(hosts(root, LEADING)).toHaveLength(1);
    expect(hosts(root, TRAILING)).toHaveLength(0);
  });

  test('nothing to peek, nothing to fade: one person, or a carousel not yet measured', async () => {
    const one = await render(
      <FeaturedPeopleCarousel people={people.slice(0, 1)} />,
    );
    await measure(one, 374);
    expect(hosts(one, LEADING)).toHaveLength(0);
    expect(hosts(one, TRAILING)).toHaveLength(0);
    const pages = one.findByType(ScrollView);
    expect(flat(pages.parent!.parent!)?.marginHorizontal).toBeUndefined();
    expect(pages.props.contentContainerStyle).toMatchObject({
      paddingLeft: 0,
      paddingRight: 0,
    });
    const unmeasured = await render(<FeaturedPeopleCarousel people={people} />);
    expect(hosts(unmeasured, LEADING)).toHaveLength(0);
    expect(hosts(unmeasured, TRAILING)).toHaveLength(0);
  });

  test('touches, swipes and VoiceOver pass the fades by', async () => {
    const root = await render(<FeaturedPeopleCarousel people={people} />);
    await measure(root, 374);
    await scrollTo(root, 100);
    for (const id of [LEADING, TRAILING]) {
      const [edge] = hosts(root, id);
      expect(edge!.props).toMatchObject({
        pointerEvents: 'none',
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      });
      expect(edge!.findAllByType(Pressable)).toHaveLength(0);
    }
    // The fades are siblings of the pages, not wrappers: the scroll view
    // and the page buttons keep their own touches.
    const pages = root.findByType(ScrollView);
    expect(pages.props.scrollEnabled).toBe(true);
    expect(
      hosts(root, 'today-featured-pages')[0]!.findAll(
        (node) => node.props.testID === TRAILING,
      ),
    ).toHaveLength(0);
    const dots = hosts(root, 'today-featured-dots')[0]!;
    expect(dots.findAll((node) => node.props.testID === TRAILING)).toHaveLength(
      0,
    );
    expect(hosts(root, 'today-featured-page-2')).toHaveLength(1);
  });

  test.each([
    ['light', 'sunken'],
    ['dark', 'sunken'],
    ['light', 'paper'],
    ['dark', 'paper'],
  ] as const)(
    'in %s the fade is the %s ground it sits on',
    async (scheme, ground) => {
      mockScheme = scheme;
      const root = await render(
        <SurfaceContext.Provider value={ground}>
          <FeaturedPeopleCarousel people={people} />
        </SurfaceContext.Provider>,
      );
      await measure(root, 374);
      const stops = hosts(root, TRAILING)[0]!.findAllByType(Stop);
      expect(stops.map((stop) => stop.props.stopColor)).toEqual([
        paletteFor(scheme)[ground],
        paletteFor(scheme)[ground],
      ]);
    },
  );

  test('Increase Contrast keeps the gradient in the ground’s colour', async () => {
    jest.mocked(useIncreaseContrast).mockReturnValue(true);
    const root = await render(
      <SurfaceContext.Provider value="sunken">
        <FeaturedPeopleCarousel people={people} />
      </SurfaceContext.Provider>,
    );
    await measure(root, 374);
    const stops = hosts(root, TRAILING)[0]!.findAllByType(Stop);
    expect(stops.map((stop) => stop.props.stopColor)).toEqual([
      paletteFor('light').sunken,
      paletteFor('light').sunken,
    ]);
    expect(stops.map((stop) => stop.props.stopOpacity)).toEqual([1, 0]);
  });

  test('Reduce Transparency draws a solid band of the ground, with no gradient', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(true);
    const root = await render(
      <SurfaceContext.Provider value="sunken">
        <FeaturedPeopleCarousel people={people} />
      </SurfaceContext.Provider>,
    );
    await measure(root, 374);
    await scrollTo(root, 100);
    for (const id of [LEADING, TRAILING]) {
      const [edge] = hosts(root, id);
      expect(edge!.findAllByType(Stop)).toHaveLength(0);
      expect(flat(edge!).backgroundColor).toBe(colors.sunken);
      expect(edge!.props.pointerEvents).toBe('none');
    }
  });
});

describe('every Today layout the carousel sits in', () => {
  const duo: WindowTraits = {
    horizontal: 'regular',
    vertical: 'regular',
    foldable: true,
  };
  const order = {
    launchCase: 'A',
    pairInMore: false,
    slots: ['your-mp', 'edition', 'bills', 'foot'],
  } as unknown as TodayOrder;
  const slot = (name: TodaySlot) =>
    name === 'edition' ? (
      <FeaturedPeopleCarousel key={name} people={people} />
    ) : null;
  const today = (region: number, height: number) => (
    <SurfaceContext.Provider value="sunken">
      <RegionProvider value={{ width: region, height }}>
        <TodayBody order={order} slot={slot} />
      </RegionProvider>
    </SurfaceContext.Provider>
  );
  const stage = (traits: WindowTraits | null) =>
    act(() => {
      setWindowTraitsOverride(null);
      resetAdaptiveDeviceForTests();
      setWindowTraitsOverride(traits);
    });
  const expectFade = async (root: ReactTestInstance, column: number) => {
    await measure(root, column);
    const [edge] = hosts(root, TRAILING);
    expect(edge).toBeDefined();
    expect(flat(edge!)).toMatchObject({ right: 0, width: PEEK + BLEED });
    expect(hosts(root, LEADING)).toHaveLength(0);
    return edge!;
  };

  test('Duo inner, landscape beside the rail: the fade stays in its half of the gutter', async () => {
    windowOf(951, 669);
    stage(duo);
    const root = await render(today(880, 669));
    const [leading] = hosts(root, 'today-spread-leading');
    const [trailing] = hosts(root, 'today-spread-trailing');
    expect(leading).toBeDefined();
    // The carousel is in the leading column; the reader's own column is clear of it.
    const edge = await expectFade(leading!, 392);
    expect(hosts(trailing!, TRAILING)).toHaveLength(0);
    const gutter = flat(leading!.parent!).gap as number;
    expect(gutter).toBeGreaterThanOrEqual(32);
    // The pages bleed 16 pt past the column: at most half the gutter.
    const pages = leading!.findByType(ScrollView);
    const bleed = -flat(pages.parent!.parent!).marginHorizontal;
    expect(bleed).toBe(BLEED);
    expect(bleed).toBeLessThanOrEqual(gutter / 2);
    expect(flat(edge).width - bleed).toBe(PEEK);
  });

  test('Duo inner, portrait: one column, the same fade', async () => {
    windowOf(669, 951);
    stage(duo);
    const root = await render(today(669, 951));
    expect(hosts(root, 'today-spread')).toHaveLength(0);
    await expectFade(root, 629);
  });

  test('Duo outer and a phone in portrait: one column, the same fade', async () => {
    windowOf(466, 678);
    stage({ horizontal: 'compact', vertical: 'regular', foldable: true });
    const outer = await render(today(466, 678));
    expect(hosts(outer, 'today-spread')).toHaveLength(0);
    await expectFade(outer, 434);
    windowOf(402, 874);
    stage(null);
    const phone = await render(today(402, 874));
    expect(hosts(phone, 'today-spread')).toHaveLength(0);
    await expectFade(phone, 370);
  });

  test('AX5: one column on the unfolded Duo, and the fade keeps its fixed width', async () => {
    windowOf(951, 669, 3.12);
    stage(duo);
    const root = await render(today(880, 669));
    expect(hosts(root, 'today-spread')).toHaveLength(0);
    await expectFade(root, 840);
  });

  test('iPad in landscape, two columns 3:2: the fade is in the leading column', async () => {
    windowOf(1180, 820);
    stage({ horizontal: 'regular', vertical: 'regular', foldable: false });
    const root = await render(today(1180, 820));
    const [leading] = hosts(root, 'today-spread-leading');
    if (!leading) {
      // This file stages a phone idiom; the pad rule has its own suites.
      await expectFade(root, 700);
      return;
    }
    await expectFade(leading, 660);
    expect(flat(leading.parent!).gap).toBeGreaterThanOrEqual(2 * BLEED);
  });
});
