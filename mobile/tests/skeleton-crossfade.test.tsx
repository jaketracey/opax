import { act } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  ScreenSectionGapContext,
  SkeletonCrossfade,
} from '../src/design/states';
import { motion } from '../src/design/tokens';
import { TodayBlock } from '../src/features/today/TodayBlock';

let mockReduced: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));

let tree: TestRenderer.ReactTestRenderer;
let timing: jest.SpyInstance;
let stop: jest.Mock;
const element = (loading: boolean, cached = false, ready = true) => (
  <SkeletonCrossfade
    loading={loading}
    cached={cached}
    ready={ready}
    skeleton={<View testID="bones" />}
  >
    <Text testID="answer">The record</Text>
  </SkeletonCrossfade>
);
const mount = (loading = true, cached = false) =>
  act(() => {
    tree = TestRenderer.create(element(loading, cached));
  });
const advance = (ms: number) => {
  // Commit intermediate frames, as the native timer and layout callbacks do.
  for (let elapsed = 0; elapsed < ms; elapsed += 50)
    act(() => jest.advanceTimersByTime(Math.min(50, ms - elapsed)));
};
const update = (loading: boolean, cached = false, ready = true) =>
  act(() => {
    tree.update(element(loading, cached, ready));
  });
const bones = () => tree.root.findAllByProps({ testID: 'bones' });
const contentStyle = () =>
  StyleSheet.flatten(
    tree.root.findByProps({ testID: 'answer' }).parent!.props.style,
  );

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
  stop = jest.fn();
  timing = jest
    .spyOn(Animated, 'timing')
    .mockImplementation((value, config) => {
      let timer: ReturnType<typeof setTimeout>;
      return {
        start: (done) => {
          timer = setTimeout(() => {
            (value as Animated.Value).setValue(config.toValue as number);
            done?.({ finished: true });
          }, config.duration);
        },
        stop: () => {
          clearTimeout(timer);
          stop();
        },
        reset: jest.fn(),
      };
    });
});
afterEach(() => {
  act(() => tree?.unmount());
  timing.mockRestore();
  jest.useRealTimers();
});

test('cold: a visible skeleton crossfades for 150 ms, in place, then is removed', () => {
  mount();
  advance(100);
  expect(bones()[0]!.parent!.props.accessibilityElementsHidden).toBe(false);
  advance(100);
  update(false);
  const config = timing.mock.calls[0]![1];
  expect(config).toMatchObject({
    duration: 150,
    toValue: 1,
    useNativeDriver: true,
  });
  expect(config.easing(0.4)).toBeCloseTo(
    Easing.bezier(...motion.easing.standard)(0.4),
  );
  expect(contentStyle()).not.toHaveProperty('transform');
  expect(contentStyle().opacity).toBe(0);
  expect(bones().length).toBeGreaterThan(0);
  expect(bones()[0]!.parent!.props).toMatchObject({
    pointerEvents: 'none',
    accessibilityElementsHidden: true,
  });
  expect(StyleSheet.flatten(bones()[0]!.parent!.props.style).opacity).toBe(1);
  advance(149);
  expect(bones().length).toBeGreaterThan(0);
  advance(1);
  expect(bones()).toHaveLength(0);
  expect(contentStyle().opacity).toBe(1);
});

test('warm: a fast cache read has no visible skeleton, fade or flash', () => {
  mount();
  expect(StyleSheet.flatten(bones()[0]!.parent!.props.style).opacity).toBe(0);
  advance(50);
  update(false);
  expect(timing).not.toHaveBeenCalled();
  expect(bones()).toHaveLength(0);
  expect(contentStyle().opacity).toBe(1);
});

test.each([0, 99])(
  'a skeleton visible for %i ms does not fade',
  (visibleFor) => {
    mount();
    advance(100);
    advance(visibleFor);
    update(false);
    expect(timing).not.toHaveBeenCalled();
    expect(bones()).toHaveLength(0);
  },
);

test('already available content and slow saved records appear without a fade', () => {
  mount(false, true);
  expect(bones()).toHaveLength(0);
  expect(contentStyle().opacity).toBe(1);
  update(true);
  advance(250);
  update(false, true);
  expect(timing).not.toHaveBeenCalled();
  expect(contentStyle().opacity).toBe(1);
});

test.each([true, null])(
  'Reduce Motion %s shows the content at once',
  (setting) => {
    mockReduced = setting;
    mount();
    advance(250);
    update(false);
    expect(timing).not.toHaveBeenCalled();
    expect(bones()).toHaveLength(0);
    expect(contentStyle().opacity).toBe(1);
  },
);

test('enabling Reduce Motion during a fade stops it and reveals content', () => {
  mount();
  advance(250);
  update(false);
  advance(50);
  mockReduced = true;
  update(false);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(bones()).toHaveLength(0);
  expect(contentStyle().opacity).toBe(1);
});

test('revalidation keeps the content and errors do not animate', () => {
  mount();
  advance(250);
  update(false, false, false);
  expect(timing).not.toHaveBeenCalled();
  update(false);
  expect(timing).not.toHaveBeenCalled();
});

test('unmount mid-fade stops native work and leaves no timer or completion update', () => {
  mount();
  advance(250);
  update(false);
  advance(50);
  act(() => tree.unmount());
  expect(stop).toHaveBeenCalledTimes(1);
  advance(1000);
  expect(jest.getTimerCount()).toBe(0);
});

test('unmount during the cache grace period cancels the skeleton reveal', () => {
  mount();
  advance(50);
  act(() => tree.unmount());
  advance(1000);
  expect(jest.getTimerCount()).toBe(0);
});

test('TodayBlock adopts the shared fade and keeps its loading and content ids', () => {
  const block = (loading: boolean) => (
    <TodayBlock
      title="Records"
      testID="today-records"
      state={
        loading ? { kind: 'loading' } : { kind: 'ready', data: 'The record' }
      }
      skeleton={<View testID="today-loading" />}
      error="Records could not be loaded."
    >
      {(data) => <Text testID="today-content">{data}</Text>}
    </TodayBlock>
  );
  act(() => {
    tree = TestRenderer.create(block(true));
  });
  expect(tree.root.findByType(SkeletonCrossfade).props.loading).toBe(true);
  advance(250);
  act(() => tree.update(block(false)));
  expect(tree.root.findByType(SkeletonCrossfade).props.loading).toBe(false);
  expect(timing).toHaveBeenCalledTimes(1);
  advance(150);
  expect(tree.root.findAllByProps({ testID: 'today-loading' })).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ testID: 'today-content' }).length,
  ).toBeGreaterThan(0);
});

test('a fresh cache timestamp older than the read skips the fade after a slow disk read', () => {
  const cachedAt = Date.now() - 1000;
  const cached = (loading: boolean) => (
    <SkeletonCrossfade
      loading={loading}
      cachedAt={cachedAt}
      skeleton={<View testID="bones" />}
    >
      <Text testID="answer">The record</Text>
    </SkeletonCrossfade>
  );
  act(() => {
    tree = TestRenderer.create(cached(true));
  });
  advance(250);
  act(() => tree.update(cached(false)));
  expect(timing).not.toHaveBeenCalled();
  expect(bones()).toHaveLength(0);
  expect(contentStyle().opacity).toBe(1);
});

test('a revalidated record swaps its text without another entrance or movement', () => {
  mount(false);
  act(() =>
    tree.update(
      <SkeletonCrossfade loading={false} skeleton={<View testID="bones" />}>
        <Text testID="answer">The refreshed record</Text>
      </SkeletonCrossfade>,
    ),
  );
  expect(tree.root.findByProps({ testID: 'answer' }).props.children).toBe(
    'The refreshed record',
  );
  expect(timing).not.toHaveBeenCalled();
  expect(bones()).toHaveLength(0);
  expect(contentStyle().opacity).toBe(1);
  expect(contentStyle()).not.toHaveProperty('transform');
});

test('the previous loading shape stays until the fade ends even when the loader now returns no skeleton', () => {
  mount();
  advance(100);
  advance(100);
  act(() =>
    tree.update(
      <SkeletonCrossfade loading={false} skeleton={null}>
        <Text testID="answer">The record</Text>
      </SkeletonCrossfade>,
    ),
  );
  expect(bones().length).toBeGreaterThan(0);
  advance(150);
  expect(bones()).toHaveLength(0);
});

test.each([36, 56])(
  'record fragments inherit their Screen section gap of %i pt',
  (gap) => {
    const page = (loading: boolean) => (
      <ScreenSectionGapContext.Provider value={gap}>
        <SkeletonCrossfade
          sectioned
          loading={loading}
          skeleton={<View testID="bones" />}
        >
          <Text testID="answer">The record</Text>
        </SkeletonCrossfade>
      </ScreenSectionGapContext.Provider>
    );
    act(() => {
      tree = TestRenderer.create(page(true));
    });
    expect(StyleSheet.flatten(bones()[0]!.parent!.props.style).gap).toBe(gap);
    act(() => tree.update(page(false)));
    expect(contentStyle().gap).toBe(gap);
  },
);
