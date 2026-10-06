import { act, type ReactElement } from 'react';
import { Animated } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { WelcomeTour } from '../src/onboarding/WelcomeTour';
import { welcomePages } from '../src/onboarding/pages';
import { AccountComingSoon } from '../src/features/ComingSoon';
import * as tour from '../src/onboarding/state';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    exists = false;
    write() {}
    move() {}
  },
  Paths: { document: 'documents' },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>,
    );
  });
  return renderer;
}
const byID = (root: ReactTestInstance, id: string) =>
  root.findAll((node) => node.props.testID === id && node.props.onPress)[0] ??
  root.findAll((node) => node.props.testID === id)[0]!;
const press = (root: ReactTestInstance, id: string) =>
  act(() => byID(root, id).props.onPress());
/** The page view that holds a page's words: hidden unless current. */
const pageHidden = (root: ReactTestInstance, id: string) => {
  let node: ReactTestInstance | null = byID(root, `tour-page-${id}`);
  while (node && node.props.accessibilityElementsHidden === undefined)
    node = node.parent;
  return node?.props.accessibilityElementsHidden;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(Animated, 'timing').mockImplementation(
    () =>
      ({
        start: (done?: (r: { finished: boolean }) => void) =>
          done?.({ finished: true }),
      }) as unknown as Animated.CompositeAnimation,
  );
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('pages read in order with their position; Skip is on every page', () => {
  const onLeave = jest.fn();
  const r = render(<WelcomeTour onLeave={onLeave} onClosed={jest.fn()} />);
  const root = r.root;
  expect(byID(root, 'welcome-tour').props.accessibilityViewIsModal).toBe(true);
  welcomePages.forEach((page, index) => {
    const words = byID(root, `tour-page-${page.id}`);
    expect(words.props.accessible).toBe(true);
    expect(words.props.accessibilityLabel).toBe(
      `Page ${index + 1} of 5. ${page.title}. ${page.body}`,
    );
    // Only the current page is in VoiceOver's reach.
    expect(pageHidden(root, page.id)).toBe(index !== 0);
  });
  for (let index = 0; index < welcomePages.length; index++) {
    expect(byID(root, 'tour-skip')).toBeTruthy();
    expect(byID(root, 'tour-progress').props.accessibilityLabel).toBe(
      `Page ${index + 1} of 5`,
    );
    expect(pageHidden(root, welcomePages[index]!.id)).toBe(false);
    if (index < welcomePages.length - 1) press(root, 'tour-next');
  }
  // The last page's button leads to the seat chooser.
  expect(root.findAll((n) => n.props.testID === 'tour-next')).toHaveLength(0);
  expect(byID(root, 'tour-finish').props.label).toBe('Choose your electorate');
  act(() => r.unmount());
});

test('nothing advances on its own', () => {
  const r = render(<WelcomeTour onLeave={jest.fn()} onClosed={jest.fn()} />);
  act(() => jest.advanceTimersByTime(60_000));
  expect(byID(r.root, 'tour-progress').props.accessibilityLabel).toBe(
    'Page 1 of 5',
  );
  expect(pageHidden(r.root, 'about')).toBe(false);
  act(() => r.unmount());
});

test('Skip and finish report why, then close', () => {
  const onLeave = jest.fn();
  const onClosed = jest.fn();
  let r = render(<WelcomeTour onLeave={onLeave} onClosed={onClosed} />);
  press(r.root, 'tour-skip');
  expect(onLeave).toHaveBeenLastCalledWith('skip');
  expect(onClosed).toHaveBeenCalledTimes(1);
  // A second press during the fade does nothing.
  press(r.root, 'tour-skip');
  expect(onLeave).toHaveBeenCalledTimes(1);
  act(() => r.unmount());

  r = render(<WelcomeTour onLeave={onLeave} onClosed={onClosed} />);
  for (let index = 0; index < welcomePages.length - 1; index++)
    press(r.root, 'tour-next');
  press(r.root, 'tour-finish');
  expect(onLeave).toHaveBeenLastCalledWith('finish');
  expect(onClosed).toHaveBeenCalledTimes(2);
  act(() => r.unmount());
});

test('scenes are pictures labelled Example where they show sample records', () => {
  const r = render(<WelcomeTour onLeave={jest.fn()} onClosed={jest.fn()} />);
  for (const page of welcomePages) {
    const label = r.root.findAll(
      (n) => n.props.testID === `tour-example-${page.id}`,
    );
    expect(label.length > 0).toBe(page.example);
  }
  // Every scene is hidden from VoiceOver and takes no touches.
  const scenes = r.root.findAll(
    (n) =>
      n.props.pointerEvents === 'none' &&
      n.props.importantForAccessibility === 'no-hide-descendants' &&
      typeof n.type === 'string',
  );
  expect(scenes.length).toBeGreaterThanOrEqual(welcomePages.length);
  // No scene names a real person or shows a figure.
  const words = r.root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => n.props.children as string)
    .join(' ');
  expect(words).not.toMatch(/\$\s?\d/);
  act(() => r.unmount());
});

test('Account › About OPAX replays the tour after closing the sheet', () => {
  const r = render(<AccountComingSoon />);
  tour.hideTour();
  press(r.root, 'account-replay-tour');
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(tour.tourState()).toBe('visible');
  act(() => r.unmount());
});
