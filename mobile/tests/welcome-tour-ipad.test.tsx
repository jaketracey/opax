import { act } from 'react';
import { Animated } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WelcomeTour } from '../src/onboarding/WelcomeTour';
import {
  finishLabel,
  padSceneSummaries,
  pageAnnouncement,
  welcomePages,
} from '../src/onboarding/pages';
import {
  COLUMNS_MIN_WIDTH,
  PAD_READABLE,
  padGeometry,
  swipeTarget,
  tourArrangement,
} from '../src/onboarding/layout';
import { padSceneBox } from '../src/onboarding/padScenes';
import { dispatchKeyCommand, onKeyCommand } from '../src/design/keyboard';

// The window the tour reads: an iPad (regular from 700pt) unless `pad` is
// false. Rotation and resizing change it between renders.
const mockWindow = {
  width: 1376,
  height: 1032,
  scale: 2,
  fontScale: 1,
  pad: true,
};
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  return {
    ...actual,
    useLayout: () => {
      const { width, height, pad } = mockWindow;
      const regular = pad && width >= 700;
      return {
        size: regular ? 'regular' : 'compact',
        regular,
        wide: regular && width >= 1100,
        width,
        height,
        window: { width, height },
        landscape: width > height,
      };
    },
  };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));

const landscape = { width: 1376, height: 1032 };
const portrait = { width: 1032, height: 1376 };
const third = { width: 375, height: 1032 };
function size(next: { width: number; height: number }, fontScale = 1) {
  Object.assign(mockWindow, next, { fontScale });
}

const metrics = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(props: Partial<Parameters<typeof WelcomeTour>[0]> = {}) {
  // A new element each time: React skips an identical one.
  const element = () => (
    <SafeAreaProvider initialMetrics={metrics}>
      <WelcomeTour onLeave={jest.fn()} onClosed={jest.fn()} {...props} />
    </SafeAreaProvider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element());
  });
  mounted.push(renderer);
  return { renderer, rerender: () => act(() => renderer.update(element())) };
}
/** Host views (composites repeat the prop). */
const host = (root: ReactTestInstance, id: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
const one = (root: ReactTestInstance, id: string) => {
  const found = host(root, id);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const press = (root: ReactTestInstance, id: string) =>
  act(() =>
    root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
const position = (root: ReactTestInstance) =>
  one(root, 'tour-progress').props.accessibilityLabel as string;
/** Accessible host elements in tree order: what VoiceOver walks. */
const elements = (root: ReactTestInstance) =>
  root
    .findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.accessible === true &&
        n.props.testID !== undefined,
    )
    .filter(
      (n) =>
        // Inside another accessible element, a node is not its own element.
        !hasAccessibleAncestor(n),
    )
    .map((n) => n.props.testID as string);
function hasAccessibleAncestor(node: ReactTestInstance) {
  for (let p = node.parent; p; p = p.parent)
    if (typeof p.type === 'string' && p.props.accessible === true) return true;
  return false;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  size(landscape);
  mockWindow.pad = true;
  jest.spyOn(Animated, 'timing').mockImplementation(
    () =>
      ({
        start: (done?: (r: { finished: boolean }) => void) =>
          done?.({ finished: true }),
        stop: () => undefined,
      }) as unknown as Animated.CompositeAnimation,
  );
});
afterEach(() => {
  // A failed test must not leave its tour (and its keys) mounted.
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the layout follows the size class', () => {
  test('regular landscape: columns; regular portrait: stacked; compact: the phone tour', () => {
    const at = (width: number, height: number, regular = true, fontScale = 1) =>
      tourArrangement({ regular, width, height, fontScale });
    // 13-inch and 11-inch iPads, landscape and portrait.
    expect(at(1376, 1032)).toBe('columns');
    expect(at(1210, 834)).toBe('columns');
    expect(at(1032, 1376)).toBe('stacked');
    expect(at(834, 1210)).toBe('stacked');
    // A regular Stage Manager window too short of room for two columns.
    expect(at(COLUMNS_MIN_WIDTH - 1, 600)).toBe('stacked');
    // Split View, Slide Over, a narrow window and every iPhone: compact.
    expect(at(375, 1032, false)).toBe('phone');
    expect(at(956, 440, false)).toBe('phone');
    // Accessibility text sizes stack, in landscape as well.
    expect(at(1376, 1032, true, 3.571)).toBe('stacked');
    expect(at(1376, 1032, true, 1.353)).toBe('columns');
  });

  test('columns give the picture 55 to 60% and the words a readable measure', () => {
    const { stage, column, gutter } = padGeometry({
      arrangement: 'columns',
      width: 1376 - 112,
      height: 860,
      fontScale: 1,
    });
    const share = stage.width / (1376 - 112);
    expect(share).toBeGreaterThanOrEqual(0.5);
    expect(share).toBeLessThanOrEqual(0.6);
    expect(column).toBeGreaterThanOrEqual(500);
    expect(column).toBeLessThanOrEqual(620);
    expect(stage.width + gutter + column).toBe(1376 - 112);
    expect(stage.height).toBe(860);
    // 19pt Public Sans averages about 9pt a character: 55 to 70 a line.
    expect(column / 9).toBeGreaterThan(55);
  });

  test('stacked: the picture above at real size, the words in a centred column', () => {
    const tall = padGeometry({
      arrangement: 'stacked',
      width: 1032 - 112,
      height: 1150,
      fontScale: 1,
    });
    expect(tall.column).toBe(PAD_READABLE);
    expect(tall.stage.width).toBe(1032 - 112);
    expect(tall.stage.height).toBeGreaterThan(560);
    // At AX5 the picture gives way, so the title starts on the first screen.
    const ax5 = padGeometry({
      arrangement: 'stacked',
      width: 1376 - 112,
      height: 700,
      fontScale: 3.571,
    });
    expect(ax5.stage.height).toBeLessThanOrEqual(300);
  });

  test('pictures draw at real size where they fit and scale down below', () => {
    expect(padSceneBox(700, 800, 1)).toEqual({
      layoutWidth: 700,
      layoutHeight: 800,
      scale: 1,
    });
    const narrow = padSceneBox(420, 300, 1);
    expect(narrow.layoutWidth).toBe(560);
    expect(narrow.scale).toBeCloseTo(0.75);
    // AX5: the scene is laid out wider by the text scale and scaled down,
    // so it keeps its composition and never reflows a word.
    expect(padSceneBox(700, 800, 3.571).scale).toBeCloseTo(1 / 3.571);
    expect(padSceneBox(700, 800, 1.353).layoutWidth).toBeCloseTo(947.1);
  });

  test('a swipe turns the page; a short or slow drag and the ends do not', () => {
    expect(swipeTarget(-80, 0, 1, 5)).toBe(2);
    expect(swipeTarget(80, 0, 1, 5)).toBe(0);
    expect(swipeTarget(-30, -0.6, 1, 5)).toBe(2);
    expect(swipeTarget(-30, -0.1, 1, 5)).toBeNull();
    expect(swipeTarget(80, 0, 0, 5)).toBeNull();
    expect(swipeTarget(-80, 0, 4, 5)).toBeNull();
  });

  test('the tour draws columns, stacked or the phone pager by the window', () => {
    const { renderer, rerender } = render();
    const root = renderer.root;
    expect(host(root, 'tour-pad-columns')).toHaveLength(1);
    expect(host(root, 'tour-scroll-about')).toHaveLength(0);
    size(portrait);
    rerender();
    expect(host(root, 'tour-pad-stacked')).toHaveLength(1);
    size(third);
    rerender();
    expect(host(root, 'tour-pad-columns')).toHaveLength(0);
    expect(host(root, 'tour-pad-stacked')).toHaveLength(0);
    expect(host(root, 'tour-scroll-about')).toHaveLength(1);
    act(() => renderer.unmount());
  });
});

describe('the page survives rotation and resizing', () => {
  test('landscape → portrait → a 1/3 window → landscape keeps page 3', () => {
    const { renderer, rerender } = render();
    const root = renderer.root;
    press(root, 'tour-next');
    press(root, 'tour-next');
    expect(position(root)).toBe('Page 3 of 5');
    one(root, 'tour-page-profiles');
    size(portrait);
    rerender();
    expect(position(root)).toBe('Page 3 of 5');
    one(root, 'tour-page-profiles');
    // Compact: the phone pager opens on page 3, the only page VoiceOver reaches.
    size(third);
    rerender();
    expect(position(root)).toBe('Page 3 of 5');
    const pager = root.find(
      (n) => n.props.pagingEnabled === true && n.props.contentOffset,
    );
    expect(pager.props.contentOffset).toEqual({ x: 2 * 375, y: 0 });
    // The offset is the mount's only: a later page leaves the prop alone,
    // or iOS would apply it over the running page turn.
    const offset = pager.props.contentOffset;
    press(root, 'tour-next');
    expect(position(root)).toBe('Page 4 of 5');
    expect(
      root.find((n) => n.props.pagingEnabled === true && n.props.contentOffset)
        .props.contentOffset,
    ).toBe(offset);
    act(() => void dispatchKeyCommand('tour-previous'));
    expect(position(root)).toBe('Page 3 of 5');
    let node: ReactTestInstance | null = one(root, 'tour-page-profiles');
    while (node && node.props.accessibilityElementsHidden === undefined)
      node = node.parent;
    expect(node?.props.accessibilityElementsHidden).toBe(false);
    size(landscape);
    rerender();
    expect(position(root)).toBe('Page 3 of 5');
    act(() => renderer.unmount());
  });
});

describe('navigation on iPad', () => {
  test('Back, Next, Skip and the finish; Back is drawn disabled on page 1', () => {
    const onLeave = jest.fn();
    const { renderer } = render({ onLeave });
    const root = renderer.root;
    const back = () =>
      root.find((n) => n.props.testID === 'tour-back' && n.props.label);
    expect(back().props.disabled).toBe(true);
    press(root, 'tour-next');
    expect(back().props.disabled).toBe(false);
    expect(back().props.accessibilityHint).toBe('Page 1 of 5');
    press(root, 'tour-back');
    expect(position(root)).toBe('Page 1 of 5');
    for (let i = 0; i < 4; i++) press(root, 'tour-next');
    expect(host(root, 'tour-next')).toHaveLength(0);
    expect(
      root.find((n) => n.props.testID === 'tour-finish' && n.props.label).props
        .label,
    ).toBe(finishLabel);
    press(root, 'tour-finish');
    expect(onLeave).toHaveBeenLastCalledWith('finish');
    act(() => renderer.unmount());
  });

  test('each mark of the indicator opens its page; VoiceOver adjusts it', () => {
    const { renderer } = render();
    const root = renderer.root;
    press(root, 'tour-dot-3');
    expect(position(root)).toBe('Page 4 of 5');
    one(root, 'tour-page-bills-today');
    const indicator = one(root, 'tour-progress');
    expect(indicator.props.accessibilityRole).toBe('adjustable');
    act(() =>
      indicator.props.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      }),
    );
    expect(position(root)).toBe('Page 3 of 5');
    act(() =>
      one(root, 'tour-progress').props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    expect(position(root)).toBe('Page 4 of 5');
    // Every mark is a 44pt target.
    const dot = root.find(
      (n) => n.props.testID === 'tour-dot-0' && typeof n.type === 'string',
    );
    const style = Object.assign({}, ...[dot.props.style].flat(3));
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    act(() => renderer.unmount());
  });

  test('keyboard: → and ← turn pages, Return is the primary button, Escape skips', () => {
    const onLeave = jest.fn();
    const { renderer } = render({ onLeave });
    const root = renderer.root;
    act(() => void dispatchKeyCommand('tour-next'));
    expect(position(root)).toBe('Page 2 of 5');
    act(() => void dispatchKeyCommand('tour-previous'));
    act(() => void dispatchKeyCommand('tour-previous'));
    expect(position(root)).toBe('Page 1 of 5');
    for (let i = 0; i < 4; i++)
      act(() => void dispatchKeyCommand('tour-primary'));
    expect(position(root)).toBe('Page 5 of 5');
    act(() => void dispatchKeyCommand('tour-next'));
    expect(position(root)).toBe('Page 5 of 5');
    expect(onLeave).not.toHaveBeenCalled();
    act(() => void dispatchKeyCommand('tour-primary'));
    expect(onLeave).toHaveBeenLastCalledWith('finish');
    act(() => renderer.unmount());

    const again = render({ onLeave });
    act(() => void dispatchKeyCommand('tour-skip'));
    expect(onLeave).toHaveBeenLastCalledWith('skip');
    act(() => again.renderer.unmount());
  });

  test('while the tour is open the app behind hears no key', () => {
    const behind = jest.fn();
    const remove = onKeyCommand('section-2', behind);
    const { renderer } = render();
    expect(dispatchKeyCommand('section-2')).toBe(false);
    expect(dispatchKeyCommand('list-escape')).toBe(false);
    expect(behind).not.toHaveBeenCalled();
    act(() => renderer.unmount());
    expect(dispatchKeyCommand('section-2')).toBe(true);
    expect(behind).toHaveBeenCalledTimes(1);
    remove();
  });

  test('the keys work in the compact (phone) layout on iPad too', () => {
    size(third);
    const { renderer } = render();
    act(() => void dispatchKeyCommand('tour-next'));
    expect(position(renderer.root)).toBe('Page 2 of 5');
    act(() => renderer.unmount());
  });
});

describe('VoiceOver on iPad', () => {
  test('order: the picture’s summary, the page, the indicator, then the actions', () => {
    const { renderer } = render();
    const root = renderer.root;
    expect(one(root, 'welcome-tour').props.accessibilityViewIsModal).toBe(true);
    expect(elements(root)).toEqual([
      'tour-masthead',
      'tour-scene',
      'tour-page-about',
      'tour-progress',
      'tour-skip',
      'tour-back',
      'tour-next',
    ]);
    act(() => renderer.unmount());
  });

  test('labels by props: summary, page announcement, position and hints', () => {
    const { renderer } = render();
    const root = renderer.root;
    welcomePages.forEach((page, index) => {
      const scene = one(root, 'tour-scene');
      expect(scene.props.accessibilityRole).toBe('image');
      expect(scene.props.accessibilityLabel).toBe(padSceneSummaries[page.id]);
      expect(scene.props.accessibilityLabel).toMatch(/^Example/);
      const words = one(root, `tour-page-${page.id}`);
      expect(words.props.accessible).toBe(true);
      expect(words.props.accessibilityLabel).toBe(pageAnnouncement(index));
      // Only the current page's words are drawn.
      expect(
        welcomePages.filter((p) => host(root, `tour-page-${p.id}`).length),
      ).toHaveLength(1);
      expect(position(root)).toBe(`Page ${index + 1} of 5`);
      if (index < welcomePages.length - 1) {
        const next = root.find(
          (n) => n.props.testID === 'tour-next' && n.props.label,
        );
        expect(next.props.accessibilityHint).toBe(`Page ${index + 2} of 5`);
        press(root, 'tour-next');
      }
    });
    const finish = root.find(
      (n) => n.props.testID === 'tour-finish' && n.props.label,
    );
    expect(finish.props.accessibilityHint).toBe(
      'Closes the tour and opens the seat chooser',
    );
    act(() => renderer.unmount());
  });

  test('the notice stays on the first page; pictures are labelled Example and hidden', () => {
    const { renderer } = render();
    const root = renderer.root;
    expect(one(root, 'tour-deceased-notice')).toBeTruthy();
    for (const page of welcomePages) {
      one(root, `tour-example-${page.id}`);
      const scene = one(root, `tour-pad-scene-${page.id}`);
      expect(scene.props.pointerEvents).toBe('none');
      expect(scene.props.accessibilityElementsHidden).toBe(true);
      if (page.id === 'about')
        expect(host(root, 'tour-deceased-notice')).toHaveLength(1);
      else expect(host(root, 'tour-deceased-notice')).toHaveLength(0);
      if (page.id !== 'search') press(root, 'tour-next');
    }
    // No scene shows a figure or names a real person.
    const words = root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string)
      .join(' ');
    expect(words).not.toMatch(/\$\s?\d/);
    act(() => renderer.unmount());
  });

  test('AX5 in landscape stacks the page and the buttons; nothing is cut to a line', () => {
    size(landscape, 3.571);
    const { renderer } = render();
    const root = renderer.root;
    expect(host(root, 'tour-pad-stacked')).toHaveLength(1);
    const lines = root
      .findAll((n) => n.type === 'Text' && n.props.numberOfLines !== undefined)
      .map((n) => n.props.numberOfLines);
    expect(lines.every((n) => !n)).toBe(true);
    act(() => renderer.unmount());
  });
});
