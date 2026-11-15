import { act } from 'react';
import {
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { rhythm } from '../src/design/tokens';
import {
  DATE_CLEARANCE,
  dateClearance,
} from '../src/features/today/AustraliaDots';
import {
  dotHeight,
  dotWidth,
} from '../src/features/today/australia-dots-model';
import { expectAtRest, installDotHarness, mount } from './today-dots-harness';

/**
 * J76-map (build 76, an iPhone Duo's inner display, both screens): Today
 * showed no Australia dot map. A regular phone window was given no map at
 * all (13 Nov, when the date still ran over it). It now draws there as it
 * does on iPhone and iPad: hung from the large title, from the leading edge
 * of the pane that holds Today, with the date starting clear below it.
 *
 * The window is the one Jake's screenshot shows, 951 by 669 pt, with the
 * rail taking about 90 pt of one side. The crease is at the window's
 * middle. Nothing here can unfold a simulator: these are render tests.
 */

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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ setOptions: jest.fn(), setParams: jest.fn() }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));
let mockReduced: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));

installDotHarness();

const duo: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
const spanned = { width: 951, height: 669 };
const rail = 90;
const bar = 96;
// The wide search field: at most 42% of the column, from its trailing edge.
const SEARCH_SHARE = 0.42;

function open(fontScale = 1) {
  // The harness clears the traits before each test; the Duo's go on here.
  act(() => setWindowTraitsOverride(duo));
  const view = mount(spanned, bar);
  if (fontScale !== 1) view.turn(spanned, fontScale);
  view.layOut(spanned.width - rail, spanned.height);
  view.rest(bar);
  return view;
}
beforeEach(() => {
  mockReduced = false;
});

test('the unfolded Duo draws the map, whole and at its full size, hung from the title', () => {
  const view = open();
  expect(view.drawn()).toBe(true);
  expectAtRest(view, bar);
  const art = view.art();
  expect(art.width).toBe(dotWidth);
  expect(art.height).toBe(dotHeight);
  expect(art.width).toBeGreaterThan(0);
  expect(art.height).toBeGreaterThan(0);
  expect(art.position).toBe('absolute');
});

test.each([
  ['the rail on the trailing side', 0],
  ['the rail on the leading side', rail],
])(
  'with %s the map is in the leading pane, short of the crease and of the search field',
  (_name, scrollViewLeft) => {
    const view = open();
    const gutter = view.gutter();
    const art = view.art();
    // 8 pt past the scroll view's leading edge, as on iPhone and iPad.
    expect(art.left).toBe(-8 - gutter);
    // In the window: the scroll view's edge, the column's gutter, the art.
    const left = scrollViewLeft + gutter + (art.left as number);
    const right = left + dotWidth;
    expect(left).toBeGreaterThanOrEqual(scrollViewLeft - 8);
    expect(right).toBeLessThan(spanned.width / 2);
    // In the column: it ends inside the leading half of Today's two columns,
    // and before the search field at the masthead's trailing corner.
    const column = spanned.width - rail - 2 * gutter;
    const artEnd = (art.left as number) + dotWidth;
    expect(artEnd).toBeLessThan((column - 32) / 2);
    expect(artEnd).toBeLessThan(column * (1 - SEARCH_SHARE));
  },
);

test('the date starts clear of the map, from the first frame', () => {
  act(() => setWindowTraitsOverride(duo));
  const view = mount(spanned, bar);
  // Before any layout or scroll report: the clearance is already held.
  const first = view.clearance();
  expect(first).toBe(dateClearance(bar));
  expect(first).toBeCloseTo(
    30 - bar - rhythm.block + dotHeight + DATE_CLEARANCE,
    6,
  );
  expect(first).toBeGreaterThan(0);
  view.layOut(spanned.width - rail, spanned.height);
  view.rest(bar);
  expect(view.clearance()).toBe(first);
  expect(view.art().top).toBe(30 - bar - rhythm.block);
});

test('Reduce Motion: the map is simply there, with no fade and no drift', () => {
  mockReduced = true;
  const view = open();
  expect(view.drawn()).toBe(true);
  expect(view.art().opacity).toBe(1);
  expect(view.art().transform).toEqual([{ translateY: 0 }]);
  expect(view.clockActive()).toBe(false);
});

test('at accessibility text sizes the Duo draws no map, as everywhere', () => {
  const view = open(3.571);
  expect(view.drawn()).toBe(false);
});
