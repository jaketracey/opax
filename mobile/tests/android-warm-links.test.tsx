import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Linking, Platform } from 'react-native';
import { subscribe } from 'expo-router/build/link/linking';
import { redirectSystemPath } from '../src/app/+native-intent';
import {
  installAndroidLinkCapture,
  setLinkNavigationReady,
} from '../src/navigation/link-readiness';
import { useLinkReadiness } from '../src/navigation/useLinkReadiness';

const mockNavigate = jest.fn();
const mockNativeDispatch = jest.fn();
const mockListeners = new Map<string, () => void>();
const mockURLEvents = new Set<(event: { url: string }) => void>();
let mockReady = false;
const mockNavigation = {
  isReady: () => mockReady,
  addListener: (name: string, callback: () => void) => {
    mockListeners.set(name, callback);
    return () => mockListeners.delete(name);
  },
};
jest.mock('expo-router', () => ({
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
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
const nativeIntent = { redirectSystemPath };
const os = Platform.OS;
let stopCapture: () => void;
function event(url: string) {
  [...mockURLEvents].forEach((callback) => callback({ url }));
}
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  mockReady = false;
  mockNavigate.mockClear();
  mockNativeDispatch.mockClear();
  mockURLEvents.clear();
  setLinkNavigationReady(false);
  jest
    .spyOn(Linking, 'addEventListener')
    .mockImplementation((_name, callback) => {
      mockURLEvents.add(callback);
      return {
        remove: () => {
          mockURLEvents.delete(callback);
        },
      };
    });
  // This is installed by index.js before Expo Router loads or subscribes.
  stopCapture = installAndroidLinkCapture();
});
afterEach(() => {
  expect(mockNativeDispatch).not.toHaveBeenCalled();
  stopCapture();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  jest.restoreAllMocks();
});

test.each(['liberal-democratic-party', 'labor'])(
  'a %s URL before Router subscribes waits for readiness and routes once',
  async (party) => {
    event(`opax://party/${party}`);
    const routed = mockNavigate;
    // Keep Router's real native listener present to check duplicate suppression.
    const unsubscribe = subscribe(nativeIntent, [])(mockNativeDispatch);
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Root mounted={false} />);
    });
    try {
      await act(async () => {});
      expect(routed).not.toHaveBeenCalled();
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
        mockListeners.get('state')!();
      });
      expect(routed).toHaveBeenCalledTimes(1);
      // Both native listeners receive the next event, but only the buffer
      // owns warm navigation. A repeated URL is still a new user action.
      event(`opax://party/${party}`);
      await act(async () => {});
      expect(routed).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      act(() => tree.unmount());
    }
    expect(mockURLEvents.size).toBe(1); // Entry capture remains installed.
  },
);

test('cold Android and warm iOS paths remain synchronous', () => {
  expect(
    redirectSystemPath({ path: 'opax://party/labor', initial: true }),
  ).toBe('/(tabs)/(today)/party/labor');
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  expect(
    redirectSystemPath({ path: 'opax://party/labor', initial: false }),
  ).toBe('/(tabs)/(today)/party/labor');
});

test('a mounted stack waits for the container and retains URL order', async () => {
  const routed = mockNavigate;
  const unsubscribe = subscribe(nativeIntent, [])(mockNativeDispatch);
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Root mounted />);
  });
  try {
    event('opax://party/labor');
    event('opax://party/liberal-democratic-party');
    await act(async () => {});
    expect(routed).not.toHaveBeenCalled();
    await act(async () => {
      mockReady = true;
      mockListeners.get('ready')!();
    });
    expect(routed.mock.calls.map(([path]) => path)).toEqual([
      '/(tabs)/(today)/party/labor',
      '/(tabs)/(today)/party/libertarian-party',
    ]);
  } finally {
    unsubscribe();
    act(() => tree.unmount());
  }
});

test('an event consumed as the initial URL is not replayed, but later repeats work', async () => {
  const url = 'opax://party/labor';
  event(url);
  expect(redirectSystemPath({ path: url, initial: true })).toBe(
    '/(tabs)/(today)/party/labor',
  );
  event(url); // A launcher's duplicate notification before readiness.
  const routed = mockNavigate;
  const unsubscribe = subscribe(nativeIntent, [])(mockNativeDispatch);
  let tree!: TestRenderer.ReactTestRenderer;
  mockReady = true;
  await act(async () => {
    tree = TestRenderer.create(<Root mounted />);
  });
  try {
    expect(routed).not.toHaveBeenCalled();
    event(url);
    await act(async () => {});
    expect(routed).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    act(() => tree.unmount());
  }
});

test('a URL received while the root remounts is delivered once', async () => {
  const routed = mockNavigate;
  const unsubscribe = subscribe(nativeIntent, [])(mockNativeDispatch);
  let tree!: TestRenderer.ReactTestRenderer;
  mockReady = true;
  await act(async () => {
    tree = TestRenderer.create(<Root mounted />);
  });
  act(() => tree.unmount());
  event('opax://party/labor');
  expect(routed).not.toHaveBeenCalled();
  await act(async () => {
    tree = TestRenderer.create(<Root mounted />);
  });
  try {
    expect(routed).toHaveBeenCalledTimes(1);
    expect(routed).toHaveBeenCalledWith('/(tabs)/(today)/party/labor');
  } finally {
    unsubscribe();
    act(() => tree.unmount());
  }
});

test('an initial URL supersedes older startup events without discarding a newer one', async () => {
  event('opax://party/labor');
  event('opax://party/liberal-democratic-party');
  redirectSystemPath({
    path: 'opax://party/liberal-democratic-party',
    initial: true,
  });
  event('opax://person/anthony-albanese');
  const routed = mockNavigate;
  const unsubscribe = subscribe(nativeIntent, [])(mockNativeDispatch);
  let tree!: TestRenderer.ReactTestRenderer;
  mockReady = true;
  await act(async () => {
    tree = TestRenderer.create(<Root mounted />);
  });
  try {
    expect(routed).toHaveBeenCalledTimes(1);
    expect(routed).toHaveBeenCalledWith(
      '/(tabs)/(today)/person/anthony-albanese',
    );
  } finally {
    unsubscribe();
    act(() => tree.unmount());
  }
});
