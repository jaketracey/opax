import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Linking, Platform } from 'react-native';
import { subscribe } from 'expo-router/build/link/linking';
import { redirectSystemPath } from '../src/app/+native-intent';
import {
  installAndroidLinkCapture,
  linkDeliveryParam,
  linkDeliveryPath,
  setLinkNavigationReady,
  type LinkDelivery,
} from '../src/navigation/link-readiness';
import { useLinkReadiness } from '../src/navigation/useLinkReadiness';

let mockPending: LinkDelivery[] = [];
let mockSequence = 0;
const mockNativeEvents = new Set<
  (event: { deliveries: LinkDelivery[] }) => void
>();
const mockURLEvents = new Set<(event: { url: string }) => void>();
const mockListeners = new Map<string, Set<() => void>>();
const mockNavigate = jest.fn();
const mockAck = jest.fn();
const mockNativeDispatch = jest.fn();
let mockReady = false;
let mockAutoCommit = true;
let mockState = { routes: [{ params: {} as Record<string, string> }] };
const mockNavigation = {
  isReady: () => mockReady,
  getRootState: () => mockState,
  addListener: (name: string, callback: () => void) => {
    const listeners = mockListeners.get(name) ?? new Set();
    listeners.add(callback);
    mockListeners.set(name, listeners);
    return () => listeners.delete(callback);
  },
};
jest.mock('../modules/opax-links', () => ({
  __esModule: true,
  default: {
    pending: () => mockPending.map((entry) => ({ ...entry })),
    acknowledge: (id: string) => mockAck(id),
    addListener: (
      _name: string,
      callback: (event: { deliveries: LinkDelivery[] }) => void,
    ) => {
      mockNativeEvents.add(callback);
      return { remove: () => mockNativeEvents.delete(callback) };
    },
  },
}));
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
const os = Platform.OS;
const labor = 'opax://party/labor';
const libertarian = 'opax://party/liberal-democratic-party';
let stopCapture: () => void;
let trees: TestRenderer.ReactTestRenderer[] = [];
function signal(name: string) {
  [...(mockListeners.get(name) ?? [])].forEach((callback) => callback());
}
function notify(deliveries = mockPending) {
  [...mockNativeEvents].forEach((callback) => callback({ deliveries }));
}
function event(url: string) {
  const delivery = {
    url,
    id: `delivery-${++mockSequence}`,
    sequence: mockSequence,
  };
  mockPending.push(delivery);
  notify();
  // Router's RN listener still receives the URL, but cannot dispatch it twice.
  [...mockURLEvents].forEach((callback) => callback({ url }));
  return delivery;
}
function commit(path: string) {
  mockState = {
    routes: [
      { params: Object.fromEntries(new URL(path, 'opax:///').searchParams) },
    ],
  };
  signal('state');
}
function acknowledge(id: string) {
  mockPending = mockPending.filter((entry) => entry.id !== id);
  notify();
  return Promise.resolve();
}
async function mount(mounted = true) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<Root mounted={mounted} />);
  });
  trees.push(tree);
  return tree;
}
async function ready() {
  await act(async () => {
    mockReady = true;
    signal('ready');
  });
}
const routedIds = () =>
  mockNavigate.mock.calls.map(([path]) =>
    new URL(path, 'opax:///').searchParams.get(linkDeliveryParam),
  );

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  mockPending = [];
  mockSequence = 0;
  mockReady = false;
  mockAutoCommit = true;
  mockState = { routes: [{ params: {} }] };
  mockNativeEvents.clear();
  mockURLEvents.clear();
  mockListeners.clear();
  mockNavigate.mockReset().mockImplementation((path: string) => {
    if (mockAutoCommit) commit(path);
  });
  mockAck.mockReset().mockImplementation(acknowledge);
  mockNativeDispatch.mockClear();
  jest
    .spyOn(Linking, 'addEventListener')
    .mockImplementation((_name, callback) => {
      mockURLEvents.add(callback);
      return { remove: () => mockURLEvents.delete(callback) };
    });
  stopCapture = installAndroidLinkCapture();
});
afterEach(async () => {
  await act(async () => {
    trees.forEach((tree) => tree.unmount());
  });
  trees = [];
  stopCapture();
  expect(mockNativeDispatch).not.toHaveBeenCalled();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  jest.restoreAllMocks();
});

test.each([labor, libertarian])(
  'a %s delivery before Router and fonts waits, then is acknowledged once',
  async (url) => {
    const delivery = event(url);
    const unsubscribe = subscribe(
      { redirectSystemPath },
      [],
    )(mockNativeDispatch);
    try {
      const tree = await mount(false);
      await ready();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockAck).not.toHaveBeenCalled();
      await act(async () => {
        tree.update(<Root mounted />);
      });
      expect(routedIds()).toEqual([delivery.id]);
      expect(mockAck.mock.calls).toEqual([[delivery.id]]);
      await act(async () => {
        signal('state');
        notify([delivery]);
      });
      expect(routedIds()).toEqual([delivery.id]);
      expect(mockAck).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  },
);

test('review regression: the latest initial URL B cannot erase the earlier distinct delivery A', async () => {
  stopCapture();
  // Both arrived before any JS listener. RN initial-URL reads the latest B.
  const first = event(labor);
  const second = event(libertarian);
  stopCapture = installAndroidLinkCapture();
  const initial = redirectSystemPath({ path: libertarian, initial: true });
  expect(initial).toBe(
    linkDeliveryPath('/(tabs)/(today)/party/labor', first.id),
  );
  commit(initial);
  await mount();
  await ready();
  // A is the initial route; B is next. No prefix is deleted or reordered.
  expect(routedIds()).toEqual([second.id]);
  expect(mockAck.mock.calls).toEqual([[first.id], [second.id]]);
  expect(mockNavigate).toHaveBeenCalledWith(
    linkDeliveryPath('/(tabs)/(today)/party/libertarian-party', second.id),
  );
});

test('review regression: an intentional repeat of the cold URL before readiness is a new delivery', async () => {
  const first = event(labor);
  commit(redirectSystemPath({ path: labor, initial: true }));
  const second = event(libertarian);
  const third = event(labor);
  await mount();
  expect(mockAck).not.toHaveBeenCalled();
  await ready();
  expect(routedIds()).toEqual([second.id, third.id]);
  expect(mockAck.mock.calls).toEqual([[first.id], [second.id], [third.id]]);
});

test('overlapping native snapshot notifications deduplicate only delivery IDs', async () => {
  const first = event(labor);
  const second = event(labor);
  notify([first, second]);
  await mount();
  await ready();
  expect(routedIds()).toEqual([first.id, second.id]);
  expect(mockAck.mock.calls).toEqual([[first.id], [second.id]]);
});

test('queued delivery B waits for A to enter navigation state and be acknowledged', async () => {
  mockAutoCommit = false;
  const first = event(labor);
  const second = event(libertarian);
  await mount();
  await ready();
  expect(routedIds()).toEqual([first.id]);
  expect(mockAck).not.toHaveBeenCalled();
  await act(async () => {
    commit(mockNavigate.mock.calls[0]![0]);
  });
  expect(mockAck.mock.calls).toEqual([[first.id]]);
  expect(routedIds()).toEqual([first.id, second.id]);
  await act(async () => {
    commit(mockNavigate.mock.calls[1]![0]);
  });
  expect(mockAck.mock.calls).toEqual([[first.id], [second.id]]);
});

test('Back and a fresh initial read cannot reopen an acknowledged URL', async () => {
  const delivery = event(labor);
  await mount();
  await ready();
  expect(mockAck.mock.calls).toEqual([[delivery.id]]);
  mockState = { routes: [{ params: {} }] }; // Back to Today.
  expect(redirectSystemPath({ path: labor, initial: true })).toBe('/');
  expect(mockPending).toEqual([]);
});

test('native consumption wins over an unresolved acknowledgement promise during Router restart', async () => {
  let finish!: () => void;
  mockAck.mockImplementation((id: string) => {
    acknowledge(id);
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  event(labor);
  await mount();
  await ready();
  expect(mockPending).toEqual([]);
  expect(redirectSystemPath({ path: labor, initial: true })).toBe('/');
  await act(async () => {
    finish();
  });
});

test('root remount retains a delivery whose navigation never committed', async () => {
  mockAutoCommit = false;
  const delivery = event(labor);
  const first = await mount();
  await ready();
  await act(async () => {
    first.unmount();
  });
  expect(mockAck).not.toHaveBeenCalled();
  mockAutoCommit = true;
  await mount();
  expect(mockAck.mock.calls).toEqual([[delivery.id]]);
});

test('an acknowledgement failure retains the native delivery for retry', async () => {
  mockAck.mockRejectedValue(new Error('Could not persist acknowledgement'));
  const delivery = event(labor);
  await mount();
  await ready();
  expect(mockPending).toEqual([delivery]);
  mockAck.mockImplementation(acknowledge);
  await act(async () => {
    setLinkNavigationReady(true);
  });
  expect(mockPending).toEqual([]);
  expect(mockAck).toHaveBeenLastCalledWith(delivery.id);
});

test('a new user delivery after Back opens the same URL again with a new identity', async () => {
  const first = event(labor);
  await mount();
  await ready();
  mockState = { routes: [{ params: {} }] };
  let second!: LinkDelivery;
  await act(async () => {
    second = event(labor);
  });
  expect(routedIds()).toEqual([first.id, second.id]);
  expect(mockAck.mock.calls).toEqual([[first.id], [second.id]]);
});

test('iOS links remain synchronous and do not acquire Android receipt parameters', () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  expect(redirectSystemPath({ path: labor, initial: true })).toBe(
    '/(tabs)/(today)/party/labor',
  );
  expect(redirectSystemPath({ path: labor, initial: false })).toBe(
    '/(tabs)/(today)/party/labor',
  );
});

test('a supplied URL receipt is replaced with the native delivery identity', () => {
  expect(
    linkDeliveryPath(
      '/party/one?name=one&__opaxLinkDelivery=forged#members',
      'native-id',
    ),
  ).toBe('/party/one?name=one&__opaxLinkDelivery=native-id#members');
});
