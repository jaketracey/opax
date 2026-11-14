import { act } from 'react';
import {
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { rhythm } from '../src/design/tokens';
import {
  RELEARN_MS,
  dotFadeDistance,
  nextRestInset,
} from '../src/features/today/australia-dots-model';
import {
  advance,
  expectAtRest,
  installDotHarness,
  landscape,
  mount,
  portrait,
  scrollTo,
  windowOf,
} from './today-dots-harness';

/**
 * Lane ad-home-map-rotation (14 Nov): Today's map disappeared when the
 * device turned. Heights from the iOS 26.3 17 Pro captures: the portrait
 * bar is 160 pt expanded and 116 collapsed (iOS leaves it collapsed after
 * the phone turns back), the landscape bar about 67 with no large title.
 * The art must stay drawn, 30 pt below the window's top, with the date
 * 8 pt under Tasmania, in every pose.
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
beforeEach(() => {
  mockReduced = false;
});

const compactOuter: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: true,
  verticalBars: true,
};

describe('Today map through a turn of the phone', () => {
  test('portrait, landscape and back keep the art whole and walking', () => {
    const view = mount(portrait, 106); // NativeStack's inline first estimate
    view.layOut(portrait.width, portrait.height);
    view.header(160);
    view.rest(160);
    expectAtRest(view, 160);
    expect(view.clockActive()).toBe(true);

    // Landscape: no large title, the bar is about 67 pt and Today rests at
    // -67. With the portrait inset kept, every row was transparent (blank).
    advance(50);
    view.turn(landscape);
    view.layOut(landscape.width, landscape.height);
    advance(150);
    view.header(67);
    view.rest(67);
    expectAtRest(view, 67);
    expect(view.clockActive()).toBe(true);

    // Back to portrait: iOS leaves the title collapsed (116), and Today
    // rests there. The 160 inset faded the art to a ghost.
    advance(2000);
    view.turn(portrait);
    view.layOut(portrait.width, portrait.height);
    advance(150);
    view.header(116);
    view.rest(116);
    expectAtRest(view, 116);

    // Scrolling down collapses nothing further and fades the art as before.
    advance(2000);
    scrollTo(-116 + dotFadeDistance);
    expect(Math.max(...view.rows())).toBe(0);
    scrollTo(-116);
    expectAtRest(view, 116);
    act(() => view.tree.unmount());
  });

  test('launched in landscape, then portrait with the title collapsed, then pulled open', () => {
    const view = mount(landscape, 32); // NativeStack's landscape estimate
    view.layOut(landscape.width, landscape.height);
    view.header(67);
    view.rest(67);
    expectAtRest(view, 67);
    advance(3000);
    view.turn(portrait);
    view.layOut(portrait.width, portrait.height);
    advance(150);
    view.header(116);
    view.rest(116);
    expectAtRest(view, 116);
    // Pulled open: the large title expands and Today rests at -160.
    advance(3000);
    view.header(160);
    view.rest(160);
    expectAtRest(view, 160);
    act(() => view.tree.unmount());
  });

  test('a two-turn round trip ends with the art at rest', () => {
    const view = mount(portrait, 160);
    view.layOut(portrait.width, portrait.height);
    view.rest(160);
    expectAtRest(view, 160);
    // The second turn starts before the first one's bar report arrives.
    view.turn(landscape);
    advance(80);
    view.turn(portrait);
    advance(120);
    view.header(116);
    view.rest(116);
    expectAtRest(view, 116);
    act(() => view.tree.unmount());
  });

  test('a bar of the same height in the new window keeps the inset, and a later collapse does not replace it', () => {
    const view = mount(portrait, 126);
    view.layOut(portrait.width, portrait.height);
    view.rest(126);
    expectAtRest(view, 126);
    view.turn({ width: 600, height: 874 });
    advance(RELEARN_MS + 1);
    // Reading down Today collapses the title.
    view.header(74);
    scrollTo(-126 + 40);
    expect(Math.min(...view.rows())).toBeLessThan(1);
    view.rest(126);
    view.header(126);
    expectAtRest(view, 126);
    act(() => view.tree.unmount());
  });

  test('a new text size relearns the title height', () => {
    const view = mount(portrait, 172);
    view.layOut(portrait.width, portrait.height);
    view.rest(172);
    expectAtRest(view, 172);
    view.turn(portrait, 0.823);
    advance(150);
    view.header(150);
    view.rest(150);
    expectAtRest(view, 150);
    act(() => view.tree.unmount());
  });

  test('Reduce Motion: the art stays whole and still through a turn', () => {
    mockReduced = true;
    const view = mount(portrait, 160);
    view.layOut(portrait.width, portrait.height);
    view.rest(160);
    expect(Math.min(...view.rows())).toBe(1);
    view.turn(landscape);
    advance(150);
    view.header(67);
    view.rest(67);
    expect(Math.min(...view.rows())).toBe(1);
    expect(view.art().transform).toEqual([{ translateY: 0 }]);
    expect(view.art().top).toBe(30 - 67 - rhythm.block);
    expect(view.clockActive()).toBe(false);
    act(() => view.tree.unmount());
  });
});

describe('Today map in a window narrower than the screen', () => {
  // The Duo's outer display (and an iPad's sidebar) take a side of the
  // window from the scroll view. The art bleeds 8 pt past the scroll view's
  // leading edge, as on every iPhone, not past the window's.
  test('the Duo folded, unfolded and folded again: one Today, the art at its edge', () => {
    act(() => setWindowTraitsOverride(compactOuter));
    const outer = { width: 466, height: 678 };
    const view = mount(outer, 150);
    // An 80 pt rail on the trailing side: the scroll view is 386 pt wide.
    view.layOut(386, 678);
    view.rest(150);
    expectAtRest(view, 150);
    // The column's inset is 16 pt (under 414 pt): the art starts at -8.
    expect(view.art().left).toBe(-8 - 16);

    // Unfolded: a regular phone window, where the art is not drawn.
    act(() => {
      windowOf({ width: 951, height: 669 });
      setWindowTraitsOverride({
        horizontal: 'regular',
        vertical: 'regular',
        foldable: true,
        verticalBars: true,
      });
    });
    view.layOut(871, 669);
    expect(view.drawn()).toBe(false);

    // Folded again: drawn, whole, at the edge.
    advance(5000);
    act(() => {
      windowOf(outer);
      setWindowTraitsOverride(compactOuter);
    });
    view.layOut(386, 678);
    view.header(150);
    view.rest(150);
    expectAtRest(view, 150);
    expect(view.art().left).toBe(-8 - 16);
    act(() => view.tree.unmount());
  });
});

describe('nextRestInset', () => {
  const at = (window: string, inset: number, header = inset) => ({
    window,
    inset,
    header,
    relearnUntil: 0,
  });
  test('keeps the tallest report within one window', () => {
    let s = nextRestInset(null, 106, 'p', 0);
    s = nextRestInset(s, 160, 'p', 10);
    s = nextRestInset(s, 116, 'p', 20);
    expect(s.inset).toBe(160);
  });
  test('a window change relearns from the reports that follow it', () => {
    let s = nextRestInset(at('p', 160), 160, 'l', 0);
    expect(s.inset).toBe(160);
    s = nextRestInset(s, 67, 'l', 150);
    expect(s.inset).toBe(67);
    // A burst within the window: the last report wins.
    s = nextRestInset(nextRestInset(s, 160, 'p', 2000), 140, 'p', 2100);
    s = nextRestInset(s, 116, 'p', 2200);
    expect(s.inset).toBe(116);
    // After the window closes, the ratchet resumes.
    s = nextRestInset(s, 100, 'p', 2000 + RELEARN_MS + 1);
    expect(s.inset).toBe(116);
    s = nextRestInset(s, 160, 'p', 4000);
    expect(s.inset).toBe(160);
  });
});
