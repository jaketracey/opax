import { router, Stack } from 'expo-router';
import { act } from 'react';
import { Dimensions, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import WelcomeLayout from '../src/app/welcome/_layout';
import { copy } from '../src/design/copy';
import { rhythm } from '../src/design/tokens';
import { replayWelcome } from '../src/features/welcome/replay';
import ShortWelcome from '../src/features/welcome/ShortWelcome';
import Welcome, {
  continuePinned,
  overflows,
  WELCOME_COLUMN,
} from '../src/features/welcome/Welcome';
import { releaseSplash } from '../src/launch/splash';
import { track } from '../src/analytics';
import { closeWelcome, markWelcomeSeen } from '../src/onboarding/state';

const mockStack: { screenOptions?: unknown } = {};
const mockFocusListeners = new Set<() => void>();
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: Object.assign(
    ({
      screenOptions,
      children,
    }: {
      screenOptions: unknown;
      children?: React.ReactNode;
    }) => {
      mockStack.screenOptions = screenOptions;
      return <>{children}</>;
    },
    { Screen: () => null },
  ),
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({
    getParent: () => undefined,
    addListener: (event: string, callback: () => void) => {
      if (event === 'focus') mockFocusListeners.add(callback);
      return () => mockFocusListeners.delete(callback);
    },
  }),
  useFocusEffect: () => {},
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../src/onboarding/state', () => ({
  closeWelcome: jest.fn(),
  markWelcomeSeen: jest.fn(async () => undefined),
}));
jest.mock('../src/analytics', () => ({ track: jest.fn() }));
jest.mock('../src/launch/splash', () => ({ releaseSplash: jest.fn() }));
jest.mock('../src/launch/LaunchHandoff', () => ({
  LaunchHandoff: () => null,
}));
const mockSeat: { current: { status: string } } = {
  current: { status: 'none' },
};
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => mockSeat.current,
}));

function setFontScale(fontScale: number, width = 390) {
  const window = { width, height: 844, scale: 3, fontScale };
  Dimensions.set({ window, screen: window });
}
const flat = (style: unknown): Record<string, unknown>[] =>
  [style]
    .flat(5)
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object');
/** The side margins of the scroll content and of the pinned foot (the one
 * view that paints the ground behind Continue). */
const margins = (r: TestRenderer.ReactTestRenderer) => {
  const hosts = r.root.findAll((n) => typeof n.type === 'string');
  const content = hosts.flatMap((n) => flat(n.props.contentContainerStyle));
  const foot = hosts
    .map((n) => Object.assign({}, ...flat(n.props.style)))
    .filter((s) => s.backgroundColor && s.paddingBottom !== undefined);
  return [...content, ...foot]
    .map((s) => s.paddingHorizontal)
    .filter((v) => v !== undefined);
};
const grounds = (r: TestRenderer.ReactTestRenderer, id: string) =>
  flat(host(r, id).props.style)
    .map((s) => s.backgroundColor)
    .filter(Boolean);
beforeEach(() => {
  jest.clearAllMocks();
  mockSeat.current = { status: 'none' };
  setFontScale(1);
});
async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const host = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find((n) => n.props.testID === id && typeof n.type === 'string');
const component = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find((n) => n.props.testID === id && typeof n.type !== 'string');
const has = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id).length > 0;
const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) =>
      [n.props.children]
        .flat(3)
        .filter((c) => typeof c === 'string')
        .join(''),
    )
    .join('\n');

describe('the full welcome', () => {
  test('one page: the mark, an SF large title, three features and the fine print', async () => {
    const r = await render(<Welcome />);
    expect(has(r, 'welcome-screen')).toBe(true);
    const title = component(r, 'welcome-title');
    expect(title.props.variant).toBe('largeTitle');
    expect(title.props.accessibilityRole).toBe('header');
    expect(words(r)).toContain('Welcome to OPAX');
    for (const id of ['your-mp', 'sourced', 'ask'])
      expect(has(r, `welcome-row-${id}`)).toBe(true);
    expect(host(r, 'welcome-row-your-mp').props.accessibilityLabel).toBe(
      'Your MP. See who represents you, and what they have voted for, declared and been paid.',
    );
    expect(words(r)).toContain(copy.independence);
    expect(words(r)).toContain(copy.deceasedNotice);
    // No serif title role, no example screens, no page dots.
    expect(r.root.findAll((n) => n.props.variant === 'title').length).toBe(0);
    await act(async () => r.unmount());
  });
  test('the content sits in a 540 pt column', async () => {
    expect(WELCOME_COLUMN).toBe(540);
    const r = await render(<Welcome />);
    const columns = r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        [n.props.style]
          .flat(3)
          .some((s: { maxWidth?: number } | null) => s?.maxWidth === 540),
    );
    expect(columns.length).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });
  test('Continue pushes the seat step and counts the welcome as seen, declining nothing', async () => {
    const r = await render(<Welcome />);
    await act(async () => component(r, 'welcome-continue').props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome/seat',
      params: {},
    });
    // Seen from here: leaving the app on the electorate step never brings
    // this page back. No decline, so Today's invitation keeps its own slot.
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
    expect(markWelcomeSeen).toHaveBeenCalledWith();
    expect(closeWelcome).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('a failed write of the seen flag never stops Continue', async () => {
    (markWelcomeSeen as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    const r = await render(<Welcome />);
    await act(async () => component(r, 'welcome-continue').props.onPress());
    expect(router.push).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('repeated Continue presses push one seat step, and returning allows Continue again', async () => {
    const r = await render(<Welcome />);
    const next = () => component(r, 'welcome-continue').props.onPress();
    act(() => {
      next();
      next();
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    act(() => mockFocusListeners.forEach((focused) => focused()));
    act(() => next());
    expect(router.push).toHaveBeenCalledTimes(2);
    await act(async () => r.unmount());
  });
  test('two-finger Z is "Not now": it records the decline and closes', async () => {
    const r = await render(<Welcome />);
    act(() => host(r, 'welcome-screen').props.onAccessibilityEscape());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    // Once only.
    act(() => host(r, 'welcome-screen').props.onAccessibilityEscape());
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    // The funnel hears one skip, as categories only.
    expect((track as jest.Mock).mock.calls).toEqual([
      ['opax_first_run', { step: 'welcome', outcome: 'skipped' }],
    ]);
    await act(async () => r.unmount());
  });
  test('"Not now" before the seat read answers still records the decline', async () => {
    mockSeat.current = { status: 'loading' };
    const r = await render(<Welcome />);
    act(() => host(r, 'welcome-screen').props.onAccessibilityEscape());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    await act(async () => r.unmount());
  });
  test('a replay with a seat saved declines nothing', async () => {
    mockSeat.current = { status: 'chosen' };
    const r = await render(<Welcome />);
    act(() => host(r, 'welcome-screen').props.onAccessibilityEscape());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(track).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('the first layout releases the splash, once', async () => {
    const r = await render(<Welcome launch />);
    const screen = host(r, 'welcome-screen');
    act(() => screen.props.onLayout({ nativeEvent: { layout: {} } }));
    act(() => host(r, 'welcome-screen').props.onLayout({}));
    expect(releaseSplash).toHaveBeenCalledTimes(1);
    expect(releaseSplash).toHaveBeenCalledWith('welcome');
    await act(async () => r.unmount());
  });
  test('only the launch presentation draws the splash cover over itself', async () => {
    const launch = await render(<Welcome launch />);
    expect(has(launch, 'welcome-launch-cover')).toBe(true);
    await act(async () => launch.unmount());
    const replay = await render(<Welcome />);
    expect(has(replay, 'welcome-launch-cover')).toBe(false);
    await act(async () => replay.unmount());
  });
  test('from AX3 up Continue scrolls in after the notice; below it is pinned', async () => {
    expect(continuePinned(1)).toBe(true);
    expect(continuePinned(2)).toBe(true);
    expect(continuePinned(3.12)).toBe(false);
    const scrollOf = (r: TestRenderer.ReactTestRenderer) =>
      r.root.find(
        (n) => typeof n.type === 'string' && !!n.props.contentContainerStyle,
      );
    const inScroll = (r: TestRenderer.ReactTestRenderer, id: string) =>
      scrollOf(r).findAll((n) => n.props.testID === id).length > 0;

    // AX5: the notice, then Continue, both inside the scroll (journey S1).
    setFontScale(3.12);
    const ax = await render(<Welcome />);
    expect(inScroll(ax, 'welcome-notice')).toBe(true);
    expect(inScroll(ax, 'welcome-continue')).toBe(true);
    const order = scrollOf(ax)
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['welcome-notice', 'welcome-continue'].includes(n.props.testID),
      )
      .map((n) => n.props.testID as string);
    expect(order.indexOf('welcome-notice')).toBeLessThan(
      order.indexOf('welcome-continue'),
    );
    // At the end of the scroll the whole button clears the home indicator
    // (the mocked bottom inset is 34).
    const content = Object.assign(
      {},
      ...flat(scrollOf(ax).props.contentContainerStyle),
    );
    expect(content.paddingBottom).toBeGreaterThanOrEqual(34 + rhythm.block);
    await act(async () => ax.unmount());

    // Large: Continue is pinned in the foot, outside the scroll.
    setFontScale(1);
    const large = await render(<Welcome />);
    expect(inScroll(large, 'welcome-continue')).toBe(false);
    expect(has(large, 'welcome-continue')).toBe(true);
    await act(async () => large.unmount());
  });
  // BACKLOG D10 (duo-audit 9): on a short window at Large the pinned foot
  // cut the notice through above Continue, with no sign the page scrolled.
  // Measured overflow unpins Continue under the notice, as AX3 does, and
  // the scroll indicator flashes once.
  test('a page that overflows at Large unpins Continue under the notice', async () => {
    expect(overflows(0, 900)).toBe(false);
    expect(overflows(600, 600.5)).toBe(false);
    expect(overflows(600, 640)).toBe(true);
    setFontScale(1);
    const r = await render(<Welcome />);
    const scroll = () => host(r, 'welcome-scroll');
    const inScroll = (id: string) =>
      scroll().findAll((n) => n.props.testID === id).length > 0;
    const flash = jest.fn();
    const instance = r.root.find(
      (n) => n.props.testID === 'welcome-scroll' && typeof n.type !== 'string',
    ).instance as { flashScrollIndicators?: () => void } | null;
    expect(instance).toBeTruthy();
    if (instance) instance.flashScrollIndicators = flash;
    // Everything fits: Continue stays pinned and nothing flashes.
    await act(async () => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 640 } } });
      scroll().props.onContentSizeChange(390, 600);
    });
    expect(inScroll('welcome-continue')).toBe(false);
    // The Duo's outer display: the page runs past the scroll view.
    await act(async () => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 420 } } });
    });
    expect(inScroll('welcome-continue')).toBe(true);
    const order = scroll()
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['welcome-notice', 'welcome-continue'].includes(n.props.testID),
      )
      .map((n) => n.props.testID as string);
    expect(order.indexOf('welcome-notice')).toBeLessThan(
      order.indexOf('welcome-continue'),
    );
    expect(flash).toHaveBeenCalled();
    // Unpinned, the page only grows, so it does not flip back.
    await act(async () => {
      scroll().props.onLayout({ nativeEvent: { layout: { height: 520 } } });
      scroll().props.onContentSizeChange(390, 708);
    });
    expect(inScroll('welcome-continue')).toBe(true);
    await act(async () => r.unmount());
  });
  test('the feature glyphs are the tint at full strength, not hierarchical', async () => {
    const r = await render(<Welcome />);
    const glyphs = r.root.findAll(
      (n) =>
        n.props.name !== undefined &&
        n.props.tone !== undefined &&
        typeof n.type !== 'string',
    );
    expect(glyphs).toHaveLength(3);
    for (const g of glyphs) {
      expect(g.props.tone).toBe('navy');
      expect(g.props.type).toBeUndefined();
    }
    await act(async () => r.unmount());
  });
});

describe('the page', () => {
  test("the app's own star mark, unclipped and hidden from VoiceOver", async () => {
    const r = await render(<Welcome />);
    const mark = host(r, 'welcome-mark');
    expect(mark.props.source).toBe(
      require('../assets/splash/mark.png') as unknown,
    );
    expect(mark.props.accessibilityElementsHidden).toBe(true);
    expect(mark.props.importantForAccessibility).toBe('no-hide-descendants');
    for (const style of flat(mark.props.style)) {
      expect(style.borderRadius).toBeUndefined();
      expect(style.overflow).toBeUndefined();
    }
    await act(async () => r.unmount());
  });
  test('the side margin follows the screen margin rule', async () => {
    const narrow = await render(<Welcome />);
    // The scroll content and the pinned foot.
    expect(margins(narrow)).toEqual([16, 16]);
    await act(async () => narrow.unmount());
    setFontScale(1, 430);
    const wide = await render(<Welcome />);
    expect(margins(wide)).toEqual([20, 20]);
    await act(async () => wide.unmount());
  });
  test('the short welcome takes the same ground as the full one', async () => {
    const full = await render(<Welcome />);
    const ground = grounds(full, 'welcome-screen');
    await act(async () => full.unmount());
    const short = await render(<ShortWelcome />);
    expect(grounds(short, 'welcome-short')).toEqual(ground);
    expect(ground).toHaveLength(1);
    await act(async () => short.unmount());
  });
});

describe('the short welcome', () => {
  test('Continue marks the welcome seen and closes onto the linked page, with no seat step', async () => {
    const r = await render(<ShortWelcome />);
    expect(has(r, 'welcome-short')).toBe(true);
    expect(words(r)).toContain(copy.deceasedNotice);
    await act(async () => component(r, 'welcome-continue').props.onPress());
    expect(router.push).not.toHaveBeenCalled();
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(closeWelcome).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('escape acts as Continue: nothing is declined', async () => {
    const r = await render(<ShortWelcome />);
    act(() => host(r, 'welcome-short').props.onAccessibilityEscape());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
    expect(track).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
});

describe('replay', () => {
  test('replayWelcome presents the full welcome, sliding up', () => {
    replayWelcome();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome',
      params: {},
    });
  });
});

describe('the welcome stack', () => {
  test('the page hides the hard top edge: no divider under the status bar', async () => {
    const r = await render(<WelcomeLayout />);
    const index = r.root
      .findAllByType(Stack.Screen)
      .find((n) => n.props.name === 'index');
    expect(
      index?.props.options({ route: { name: 'index', key: 'index' } })
        .scrollEdgeEffects.top,
    ).toBe('hidden');
    expect((mockStack.screenOptions as any).scrollEdgeEffects.top).toBe('hard');
    await act(async () => r.unmount());
  });
});
