import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Dimensions, Text as NativeText } from 'react-native';
import { router } from 'expo-router';
import { closeWelcome, markWelcomeSeen } from '../src/onboarding/state';
import { releaseSplash } from '../src/launch/splash';
import Welcome, {
  continuePinned,
  WELCOME_COLUMN,
} from '../src/features/welcome/Welcome';
import ShortWelcome from '../src/features/welcome/ShortWelcome';
import { replayWelcome } from '../src/features/welcome/replay';
import { copy } from '../src/design/copy';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({
    getParent: () => undefined,
    addListener: () => () => {},
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

function setFontScale(fontScale: number) {
  const window = { width: 390, height: 844, scale: 3, fontScale };
  Dimensions.set({ window, screen: window });
}
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
  test('Continue pushes the seat step', async () => {
    const r = await render(<Welcome />);
    await act(async () => component(r, 'welcome-continue').props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome/seat',
      params: {},
    });
    expect(markWelcomeSeen).not.toHaveBeenCalled();
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
    await act(async () => r.unmount());
  });
  test('a replay with a seat saved declines nothing', async () => {
    mockSeat.current = { status: 'chosen' };
    const r = await render(<Welcome />);
    act(() => host(r, 'welcome-screen').props.onAccessibilityEscape());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: false });
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
    setFontScale(3.12);
    const r = await render(<Welcome />);
    const text = words(r);
    expect(text.indexOf(copy.deceasedNotice)).toBeGreaterThan(-1);
    expect(has(r, 'welcome-continue')).toBe(true);
    await act(async () => r.unmount());
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
