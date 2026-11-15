import { act, type ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { RowLink } from '../src/design/row-link';
import {
  padPeekCloseMs,
  setLinkContainer,
} from '../src/navigation/stale-previews';

/**
 * rv-duo-fix7 P2: on iPad, Expo Router 57.0.24 opens a tapped peek in its
 * did-close event, after the close animation. The peek's preload was dropped
 * when the close began, so the tap opened a page loaded afresh. The installed
 * Link and LinkWithPreview run here as on iPad; only navigation and the
 * native views are stand-ins.
 */
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: true } },
  });
});
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});
jest.mock('expo-router/build/hooks', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));
jest.mock('expo-router/build/link/preview/useNextScreenId', () => ({
  useNextScreenId: () => [
    { nextScreenId: 'bill-peeked', tabPath: [] },
    jest.fn(),
  ],
}));
jest.mock('expo-router/build/link/preview/LinkPreviewContext', () => ({
  useLinkPreviewContext: () => ({ setOpenPreviewKey: jest.fn() }),
}));
jest.mock('expo-router/build/link/BaseExpoRouterLink', () => ({
  BaseExpoRouterLink: ({ children }: Record<string, unknown>) => {
    const { Slot } = jest.requireActual('expo-router/build/ui/Slot');
    return <Slot role="link">{children as ReactElement}</Slot>;
  },
}));
jest.mock('expo-router/build/link/preview/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const contents = (props: Record<string, unknown>) => (
    <View {...props} style={{ display: 'contents' }} />
  );
  return {
    NativeLinkPreview: (props: Record<string, unknown>) => (
      <View {...props} nativeID="preview-boundary" />
    ),
    NativeLinkPreviewContent: () => null,
    NativeLinkPreviewAction: () => null,
    LinkZoomTransitionEnabler: () => null,
    LinkZoomTransitionSource: contents,
    LinkZoomTransitionAlignmentRectDetector: contents,
  };
});

const originalExpoOS = process.env.EXPO_OS;
beforeAll(() => {
  process.env.EXPO_OS = 'ios';
});
afterAll(() => {
  if (originalExpoOS === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOS;
});

// The Bills stack as the container reports it, holding the peek's preload.
const preload = { name: 'bill/[key]', key: 'bill-peeked' };
let state: { routes: object[]; preloadedRoutes: object[] };
const events: string[] = [];
const dispatch = jest.fn(() => {
  events.push('drop');
  state = { ...state, preloadedRoutes: [] };
});
let tree: TestRenderer.ReactTestRenderer;
let peek: ReactTestInstance['props'];
beforeEach(() => {
  jest.useFakeTimers();
  events.length = 0;
  dispatch.mockClear();
  state = {
    ...{ type: 'stack', key: 'stack-bills' },
    routes: [{ name: 'bills', key: 'bills-1' }],
    preloadedRoutes: [preload],
  };
  // Opening the peek takes its preloaded route into the stack, when one is
  // still there; otherwise the page is a new route, loaded afresh.
  mockNavigate.mockReset().mockImplementation(() => {
    const kept = state.preloadedRoutes.includes(preload);
    events.push(kept ? 'open preloaded' : 'open afresh');
    state = {
      ...state,
      routes: [...state.routes, kept ? preload : { name: 'bill/[key]' }],
      preloadedRoutes: [],
    };
  });
  setLinkContainer({
    isReady: () => true,
    getRootState: () => state,
    dispatch,
  });
  act(() => {
    tree = TestRenderer.create(
      <RowLink href="/bill/au-federal-r7105">
        <Pressable testID="record">
          <Text>A bill</Text>
        </Pressable>
      </RowLink>,
    );
  });
  peek = tree.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.nativeID === 'preview-boundary',
  ).props;
});
afterEach(() => {
  act(() => tree.unmount());
  setLinkContainer(null);
  jest.useRealTimers();
});

it('a tapped peek on iPad opens its preloaded page, with no fresh load', () => {
  act(() => peek.onWillPreviewOpen());
  act(() => peek.onPreviewTapped());
  act(() => peek.onPreviewWillClose());
  // The close animation runs; iPad has not navigated yet.
  act(() => jest.advanceTimersByTime(400));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(events).toEqual([]);
  act(() => peek.onPreviewDidClose());
  expect(mockNavigate).toHaveBeenCalledWith('/bill/au-federal-r7105', {
    __internal__PreviewKey: 'bill-peeked',
  });
  act(() => jest.advanceTimersByTime(padPeekCloseMs));
  // The preload became the page; nothing was left to drop.
  expect(events).toEqual(['open preloaded']);
  expect(state.routes).toEqual([{ name: 'bills', key: 'bills-1' }, preload]);
});

it('a peek closed without a tap on iPad still drops its preload', () => {
  act(() => peek.onWillPreviewOpen());
  act(() => peek.onPreviewWillClose());
  act(() => peek.onPreviewDidClose());
  expect(events).toEqual([]);
  act(() => jest.advanceTimersByTime(padPeekCloseMs));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(events).toEqual(['drop']);
  expect(state.preloadedRoutes).toEqual([]);
});
