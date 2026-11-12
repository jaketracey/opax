import { Animated, SectionList, StyleSheet } from 'react-native';
import {
  mockVic,
  renderVic,
  rerenderVic,
  resetVic,
} from './vic-election-render';
import * as accessibility from '../src/design/accessibility';
import Hub from '../src/features/vic-election/Hub';
import { ElectionList } from '../src/features/vic-election/shared';

beforeEach(() => {
  resetVic();
  jest.useFakeTimers({ now: 0 });
  jest.spyOn(accessibility, 'useReduceMotionSetting').mockReturnValue(false);
  jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
function coldHub() {
  const loaded = mockVic.overview;
  mockVic.overview = { record: null, error: null, loading: true };
  const r = renderVic(<Hub />);
  const list = r.root.findByType(ElectionList);
  const opacity = list.props.arrivalOpacity as Animated.Value;
  const fades = () =>
    jest.mocked(Animated.timing).mock.calls.filter(([v]) => v === opacity);
  return { r, loaded, list, opacity, fades };
}
test('saved content with unchanged shape revalidates in place with no animation', () => {
  const r = renderVic(<Hub />);
  const list = r.root.findByType(ElectionList);
  const opacity = list.props.arrivalOpacity;
  const first = mockVic.overview.record!;
  mockVic.overview = { ...mockVic.overview, loading: true };
  rerenderVic(r, <Hub />);
  mockVic.overview = {
    record: {
      ...first,
      savedAt: first.savedAt + 1,
      data: { ...first.data, about: first.data.about + ' ' },
    },
    error: null,
    loading: false,
  };
  rerenderVic(r, <Hub />);
  expect(r.root.findByType(ElectionList)).toBe(list);
  expect(list.props.arrivalOpacity).toBe(opacity);
  expect(
    jest.mocked(Animated.timing).mock.calls.filter(([v]) => v === opacity),
  ).toHaveLength(0);
  expect(opacity.__getValue()).toBe(1);
  const nativeList = r.root.findByType(SectionList);
  expect(StyleSheet.flatten(nativeList.props.style)).not.toHaveProperty(
    'transform',
  );
});
test.each([0, 99])('a skeleton visible for %i ms swaps immediately', (ms) => {
  const { r, loaded, opacity, fades } = coldHub();
  jest.advanceTimersByTime(ms);
  mockVic.overview = loaded;
  rerenderVic(r, <Hub />);
  expect(fades()).toHaveLength(0);
  expect(opacity.__getValue()).toBe(1);
});
test.each([100, 140])(
  'a skeleton visible for %i ms fades content for 150 ms',
  (ms) => {
    const { r, loaded, list, opacity, fades } = coldHub();
    jest.advanceTimersByTime(ms);
    mockVic.overview = loaded;
    rerenderVic(r, <Hub />);
    expect(r.root.findByType(ElectionList)).toBe(list);
    expect(fades()).toHaveLength(1);
    expect(fades()[0]![1]).toEqual({
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    });
    expect(opacity.__getValue()).toBe(0);
  },
);
test.each([true, null])(
  'Reduce Motion %s makes the skeleton swap 0 ms',
  (setting) => {
    jest.mocked(accessibility.useReduceMotionSetting).mockReturnValue(setting);
    const { r, loaded, opacity, fades } = coldHub();
    jest.advanceTimersByTime(140);
    mockVic.overview = loaded;
    rerenderVic(r, <Hub />);
    expect(fades()).toHaveLength(1);
    expect(fades()[0]![1].duration).toBe(0);
    expect(opacity.__getValue()).toBe(1);
  },
);
test('an error consumes the old skeleton interval, so a retry starts at zero', () => {
  const { r, loaded, opacity, fades } = coldHub();
  jest.advanceTimersByTime(140);
  mockVic.overview = {
    record: null,
    error: new Error('offline'),
    loading: false,
  };
  rerenderVic(r, <Hub />);
  expect(fades()).toHaveLength(0);
  mockVic.overview = { record: null, error: null, loading: true };
  rerenderVic(r, <Hub />);
  jest.advanceTimersByTime(99);
  mockVic.overview = loaded;
  rerenderVic(r, <Hub />);
  expect(fades()).toHaveLength(0);
  expect(opacity.__getValue()).toBe(1);
});
test('turning on Reduce Motion stops an active arrival fade immediately', () => {
  const { r, loaded, opacity, fades } = coldHub();
  jest.advanceTimersByTime(140);
  mockVic.overview = loaded;
  rerenderVic(r, <Hub />);
  const animation = jest
    .mocked(Animated.timing)
    .mock.results.find(
      (_, i) => jest.mocked(Animated.timing).mock.calls[i]![0] === opacity,
    )!.value;
  jest.mocked(accessibility.useReduceMotionSetting).mockReturnValue(true);
  rerenderVic(r, <Hub />);
  expect(animation.stop).toHaveBeenCalled();
  expect(fades()).toHaveLength(1);
  expect(opacity.__getValue()).toBe(1);
});
