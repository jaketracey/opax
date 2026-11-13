import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Linking, Platform } from 'react-native';
import { subscribe } from 'expo-router/build/link/linking';
import { redirectSystemPath } from '../src/app/+native-intent';
import { setLinkNavigationReady } from '../src/navigation/link-readiness';
import { useLinkReadiness } from '../src/navigation/useLinkReadiness';

const mockListeners = new Map<string, () => void>();
let mockReady = false;
const mockNavigation = {
  isReady: () => mockReady,
  addListener: (name: string, callback: () => void) => {
    mockListeners.set(name, callback);
    return () => mockListeners.delete(name);
  },
};
jest.mock('expo-router', () => ({
  useNavigationContainerRef: () => mockNavigation,
}));
jest.mock('expo-linking', () => ({
  addEventListener: (...args: Parameters<typeof Linking.addEventListener>) =>
    jest.requireActual('react-native').Linking.addEventListener(...args),
}));
function Root({ mounted }: { mounted: boolean }) {
  useLinkReadiness(mounted);
  return null;
}
const os = Platform.OS;
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  mockReady = false;
  setLinkNavigationReady(false);
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  jest.restoreAllMocks();
});

test.each(['liberal-democratic-party', 'labor'])(
  'a URL event for %s before readiness reaches Expo Router once when the stack is ready',
  async (party) => {
    let event!: (event: { url: string }) => void;
    const remove = jest.fn();
    jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((_name, handler) => {
        event = handler;
        return { remove };
      });
    const routed = jest.fn();
    // Use Expo Router's real subscription, including its native-intent await.
    const unsubscribe = subscribe({ redirectSystemPath }, [])(routed);
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Root mounted={false} />);
    });
    try {
      event({ url: `opax://party/${party}` });
      await act(async () => {});
      expect(routed).not.toHaveBeenCalled();
      // A ready container alone does not mean the font-gated stack exists.
      mockReady = true;
      await act(async () => {
        mockListeners.get('ready')!();
      });
      expect(routed).not.toHaveBeenCalled();
      await act(async () => {
        tree.update(<Root mounted />);
      });
      expect(routed).toHaveBeenCalledTimes(1);
      expect(routed).toHaveBeenLastCalledWith(
        `/(tabs)/(today)/party/${party === 'liberal-democratic-party' ? 'libertarian-party' : party}`,
      );
      await act(async () => {
        mockListeners.get('ready')!();
        mockListeners.get('state')!();
      });
      expect(routed).toHaveBeenCalledTimes(1);
      // The same link later is a new action, never suppressed as a duplicate.
      event({ url: `opax://party/${party}` });
      await act(async () => {});
      expect(routed).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      act(() => tree.unmount());
    }
    expect(remove).toHaveBeenCalledTimes(1);
  },
);

test('cold Android and warm iOS links remain synchronous without a readiness wait', () => {
  expect(
    redirectSystemPath({ path: 'opax://party/labor', initial: true }),
  ).toBe('/(tabs)/(today)/party/labor');
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  expect(
    redirectSystemPath({ path: 'opax://party/labor', initial: false }),
  ).toBe('/(tabs)/(today)/party/labor');
});

test('a mounted stack waits for the container, retaining each pending URL in order', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Root mounted />);
  });
  const routed = jest.fn();
  const links = [
    'opax://party/labor',
    'opax://party/liberal-democratic-party',
  ].map((path) =>
    Promise.resolve(redirectSystemPath({ path, initial: false })).then(routed),
  );
  try {
    await act(async () => {});
    expect(routed).not.toHaveBeenCalled();
    await act(async () => {
      mockReady = true;
      mockListeners.get('ready')!();
      await Promise.all(links);
    });
    expect(routed.mock.calls.map(([path]) => path)).toEqual([
      '/(tabs)/(today)/party/labor',
      '/(tabs)/(today)/party/libertarian-party',
    ]);
  } finally {
    act(() => tree.unmount());
  }
});
