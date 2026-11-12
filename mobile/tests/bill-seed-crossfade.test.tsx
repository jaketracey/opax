import { act } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { CrossfadeLayers } from '../src/design/states';
import BillDetail from '../src/features/bills/BillDetail';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import { motion } from '../src/design/tokens';
import { bills, pinned, slugs } from './pinned';

// The bill's header seeded from the tapped row is real data: it is drawn on
// the first frame and stays still while only the body crossfades in.
const mockParams: { key: string } = { key: 'au-federal-r7534' };
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    billFor: jest.fn(),
    billIndexRow: jest.fn(),
    directory: jest.fn(),
    votes: jest.fn(),
  },
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
  useFollowStates: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => false,
}));

const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    // A network read: saved as it arrives, after the skeleton showed.
    savedAt: Date.now(),
    asOf: null,
  }),
});

let tree: TestRenderer.ReactTestRenderer | null = null;
let timing: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  jest.mocked(runtime.directory).mockRejectedValue(new Error('not here'));
  jest.mocked(useFollowStates).mockReturnValue({
    follows: [],
    states: new Map(),
  } as unknown as ReturnType<typeof useFollowStates>);
  // A native fade, sampled at its midpoint and its end.
  timing = jest
    .spyOn(Animated, 'timing')
    .mockImplementation((value, config) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      return {
        start: (done) => {
          timers.push(
            setTimeout(
              () => (value as Animated.Value).setValue(0.5),
              config.duration! / 2,
            ),
            setTimeout(() => {
              (value as Animated.Value).setValue(config.toValue as number);
              done?.({ finished: true });
            }, config.duration),
          );
        },
        stop: () => timers.forEach(clearTimeout),
        reset: jest.fn(),
      };
    });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
  timing.mockRestore();
  jest.useRealTimers();
});

const fades = () =>
  timing.mock.calls.filter(
    ([, config]) => config.duration === motion.duration.crossfade,
  );
const advance = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 25)
    act(() => jest.advanceTimersByTime(Math.min(25, ms - elapsed)));
};
const host = (testID: string) =>
  tree!.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const ancestry = (node: ReactTestInstance) => {
  const chain: ReactTestInstance[] = [];
  for (let at: ReactTestInstance | null = node; at; at = at.parent)
    if (typeof at.type === 'string') chain.push(at);
  return chain;
};
/** The opacity the reader sees: every host ancestor's, multiplied. */
const seen = (node: ReactTestInstance) =>
  ancestry(node).reduce(
    (product, at) =>
      product * (StyleSheet.flatten(at.props.style)?.opacity ?? 1),
    1,
  );
const spoken = (node: ReactTestInstance) =>
  ancestry(node).every(
    (at) =>
      at.props.accessibilityElementsHidden !== true &&
      at.props.importantForAccessibility !== 'no-hide-descendants',
  );
const title = () => {
  const found = host('bill-title');
  expect(found).toHaveLength(1);
  return found[0]!;
};

test('the seeded header shows and is spoken at 0 ms, and never dips while the body fades in', async () => {
  const row = bills.bills.find((bill) => bill.key === mockParams.key)!;
  jest.mocked(runtime.billIndexRow).mockReturnValue(row);
  let arrive!: () => void;
  jest.mocked(runtime.billFor).mockImplementation(
    (key, refresh) =>
      new Promise((resolve) => {
        arrive = () => resolve(fixture.billFor(key, refresh));
      }),
  );
  await act(async () => {
    tree = TestRenderer.create(<BillDetail />);
  });
  // First frame: the row's header, at full opacity and in the accessibility
  // tree, while the body's skeleton waits out its 100 ms grace period.
  const seed = host('bill-seed');
  expect(seed).toHaveLength(1);
  expect(seen(seed[0]!)).toBe(1);
  expect(spoken(seed[0]!)).toBe(true);
  expect(seen(title())).toBe(1);
  expect(spoken(title())).toBe(true);
  expect(seen(host('bill-loading')[0]!)).toBe(0);
  for (const ms of [50, 50, 50, 50]) {
    advance(ms);
    expect(seen(title())).toBe(1);
    expect(spoken(title())).toBe(true);
  }
  // A slow read: the body skeleton has shown, so the body crossfades.
  expect(seen(host('bill-loading')[0]!)).toBe(1);
  await act(async () => arrive());
  expect(fades()).toHaveLength(1);
  expect(host('bill-seed')).toHaveLength(0);
  const samples: number[] = [];
  for (let ms = 0; ms <= 150; ms += 25) {
    samples.push(seen(title()));
    expect(spoken(title())).toBe(true);
    if (ms === 75) {
      // Midpoint: the body is half in and its skeleton half out.
      expect(seen(host('bill-read-text')[0]!)).toBe(0.5);
      expect(seen(host('bill-loading')[0]!)).toBe(0.5);
    }
    advance(25);
  }
  expect(samples.every((opacity) => opacity === 1)).toBe(true);
  expect(host('bill-loading')).toHaveLength(0);
  expect(seen(host('bill-read-text')[0]!)).toBe(1);
  // The header sits outside the fading layers; the body sits inside them.
  const layers = tree!.root.findByType(CrossfadeLayers);
  expect(layers.findAll((node) => node.props.testID === 'bill-title')).toEqual(
    [],
  );
  expect(
    layers.findAll((node) => node.props.testID === 'bill-read-text').length,
  ).toBeGreaterThan(0);
});

test('a cold load with no row still fades the whole page, header included', async () => {
  jest.mocked(runtime.billIndexRow).mockReturnValue(null);
  let arrive!: () => void;
  jest.mocked(runtime.billFor).mockImplementation(
    (key, refresh) =>
      new Promise((resolve) => {
        arrive = () => resolve(fixture.billFor(key, refresh));
      }),
  );
  await act(async () => {
    tree = TestRenderer.create(<BillDetail />);
  });
  expect(host('bill-seed')).toHaveLength(0);
  advance(250);
  await act(async () => arrive());
  expect(fades()).toHaveLength(1);
  advance(75);
  // Nothing real was on screen, so the header arrives with the body.
  expect(seen(title())).toBe(0.5);
  advance(100);
  expect(seen(title())).toBe(1);
});
