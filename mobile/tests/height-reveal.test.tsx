/**
 * HeightReveal: a line that comes and goes eases the content below instead
 * of jumping it (build 61, bug 4). LayoutAnimation does nothing on iOS while
 * Reanimated 4.5 owns Fabric's layout-animation delegate, so the height is
 * animated by Reanimated.
 */
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { HeightReveal, revealMotion } from '../src/design/reveal';

let calls: number[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  calls = [];
  jest.spyOn(Reanimated, 'withTiming').mockImplementation((to) => {
    calls.push(to as number);
    return to;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function Line({ on, reduce = false }: { on: boolean; reduce?: boolean }) {
  return (
    <HeightReveal reduceMotion={reduce} testID="line">
      {on ? <Text testID="line-text">Changes will show on Today.</Text> : null}
    </HeightReveal>
  );
}
const drawn = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => n.props.testID === 'line-text').length > 0;
function layOut(r: TestRenderer.ReactTestRenderer, height: number) {
  const content = r.root.find(
    (n) =>
      n.props.testID === 'line-content' &&
      typeof n.props.onLayout === 'function',
  );
  act(() =>
    content.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height } },
    }),
  );
}
function mount(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(element);
  });
  return r;
}

test('closed, it draws nothing and reserves no space', () => {
  const r = mount(<Line on={false} />);
  expect(r.toJSON()).toBeNull();
  expect(calls).toEqual([]);
});

test('it opens to its content’s height over 200 ms once measured, and closes the same way before the content goes', () => {
  const r = mount(<Line on={false} />);
  act(() => r.update(<Line on />));
  expect(drawn(r)).toBe(true);
  // Clipped at no height until the content has measured.
  expect(calls).toEqual([]);
  layOut(r, 17.4);
  expect(calls).toEqual([18]);
  expect(jest.mocked(Reanimated.withTiming).mock.calls[0]![1]).toBe(
    revealMotion,
  );
  expect(revealMotion.duration).toBe(200);
  act(() => r.update(<Line on={false} />));
  expect(calls).toEqual([18, 0]);
  // Still drawn while its height closes over it.
  expect(drawn(r)).toBe(true);
  act(() => jest.advanceTimersByTime(revealMotion.duration));
  expect(drawn(r)).toBe(false);
  expect(r.toJSON()).toBeNull();
});

test('reopened while closing, it opens again without dropping the content', () => {
  const r = mount(<Line on={false} />);
  act(() => r.update(<Line on />));
  layOut(r, 20);
  act(() => r.update(<Line on={false} />));
  act(() => jest.advanceTimersByTime(100));
  act(() => r.update(<Line on />));
  act(() => jest.advanceTimersByTime(revealMotion.duration));
  expect(drawn(r)).toBe(true);
  expect(calls).toEqual([20, 0, 20]);
});

test('with Reduce Motion it takes and gives up its height in one step', () => {
  const r = mount(<Line on={false} reduce />);
  act(() => r.update(<Line on reduce />));
  layOut(r, 18);
  act(() => r.update(<Line on={false} reduce />));
  expect(drawn(r)).toBe(false);
  expect(calls).toEqual([]);
});

test('content open at mount shows at once', () => {
  const r = mount(<Line on />);
  layOut(r, 18);
  expect(drawn(r)).toBe(true);
  expect(calls).toEqual([]);
});

test('content that closes before it was measured goes at once', () => {
  const r = mount(<Line on={false} />);
  act(() => r.update(<Line on />));
  act(() => r.update(<Line on={false} />));
  expect(drawn(r)).toBe(false);
  expect(calls).toEqual([]);
});
