/**
 * HeightReveal: a line that comes and goes eases the content below instead
 * of jumping it (build 61, bug 4). LayoutAnimation does nothing on iOS while
 * Reanimated 4.5 owns Fabric's layout-animation delegate, so the height is
 * animated by Reanimated.
 */
import { act, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import {
  HeightReveal,
  REVEAL_UNLIMITED,
  revealMotion,
} from '../src/design/reveal';

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

function Line({
  on,
  reduce = false,
  gap,
}: {
  on: boolean;
  reduce?: boolean;
  gap?: number;
}) {
  return (
    <HeightReveal reduceMotion={reduce} gap={gap} testID="line">
      {on ? <Text testID="line-text">Changes will show on Today.</Text> : null}
    </HeightReveal>
  );
}
/** The drawn clip: its style as first committed, and its other props. */
const clip = (r: TestRenderer.ReactTestRenderer) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === 'line');
const clipStyle = (r: TestRenderer.ReactTestRenderer) =>
  StyleSheet.flatten(clip(r).props.style);
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

test('while its height moves the clip lets its content take its own height, so it can be measured', () => {
  // Jest runs no layout. On a device, Yoga fits a column's children to the
  // column's height unless its overflow is 'scroll', so under 'hidden' the
  // content of a 0-high reveal measured 0 and the line never opened.
  const r = mount(<Line on={false} />);
  act(() => r.update(<Line on />));
  // Content about to open starts at no height, clipped, in its first frame.
  expect(clipStyle(r)).toMatchObject({ overflow: 'scroll', maxHeight: 0 });
  layOut(r, 18);
  expect(clipStyle(r).overflow).toBe('scroll');
  act(() => jest.advanceTimersByTime(revealMotion.duration));
  // At rest nothing is clipped: rows inside keep their bleeding highlight.
  expect(clipStyle(r).overflow).toBeUndefined();
  act(() => r.update(<Line on={false} />));
  expect(clipStyle(r).overflow).toBe('scroll');
});

test('content open at mount draws at its own height from the first frame, unclipped', () => {
  // A height that started at 0 drew open-at-mount content (a disclosure open
  // by default, a Today photo) collapsed until it had measured, then jumped.
  const r = mount(<Line on />);
  const style = clipStyle(r);
  expect(style.maxHeight).toBe(REVEAL_UNLIMITED);
  expect(style.overflow).toBeUndefined();
  expect(style.marginBottom).toBeUndefined();
  expect(clip(r).props.accessibilityElementsHidden).toBeUndefined();
});

test('closing from rest starts at the content’s own height, not the unlimited cap', () => {
  const values: number[] = [];
  jest.spyOn(Reanimated, 'useSharedValue').mockImplementation((initial) => {
    // A stand-in that logs each value the reveal sets.
    const [value] = useState(() => {
      let current = initial as number;
      return {
        get value() {
          return current;
        },
        set value(next: number) {
          current = next;
          values.push(next);
        },
      };
    });
    return value as never;
  });
  jest.spyOn(Reanimated, 'cancelAnimation').mockImplementation(() => {});
  const r = mount(<Line on />);
  layOut(r, 18);
  values.length = 0;
  act(() => r.update(<Line on={false} />));
  expect(values).toEqual([18, 0]);
  expect(calls).toEqual([0]);
  // Reopened mid-close, it opens from where it is, then rests unlimited.
  act(() => r.update(<Line on />));
  act(() => jest.advanceTimersByTime(revealMotion.duration));
  expect(values).toEqual([18, 0, 18, REVEAL_UNLIMITED]);
});

test('a gap after the reveal folds into it, so the content below moves by both together', () => {
  const r = mount(<Line on={false} gap={12} />);
  act(() => r.update(<Line on gap={12} />));
  expect(clipStyle(r)).toMatchObject({ marginBottom: -12, maxHeight: 0 });
  const content = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'line-content',
  );
  expect(StyleSheet.flatten(content.props.style).paddingBottom).toBe(12);
  // It opens to the content and the gap together.
  layOut(r, 30);
  expect(calls).toEqual([30]);
});

test('closing content is no longer read or tapped', () => {
  const r = mount(<Line on />);
  layOut(r, 18);
  act(() => r.update(<Line on={false} />));
  expect(drawn(r)).toBe(true);
  expect(clip(r).props.accessibilityElementsHidden).toBe(true);
  expect(clip(r).props.importantForAccessibility).toBe('no-hide-descendants');
  expect(clipStyle(r).pointerEvents).toBe('none');
});

test('Reduce Motion turned on mid-opening settles it open at once', () => {
  const r = mount(<Line on={false} />);
  act(() => r.update(<Line on />));
  layOut(r, 18);
  act(() => r.update(<Line on reduce />));
  expect(clipStyle(r).overflow).toBeUndefined();
  act(() => r.update(<Line on={false} reduce />));
  expect(drawn(r)).toBe(false);
});

test('content that closes before it was measured goes at once', () => {
  const r = mount(<Line on={false} />);
  act(() => r.update(<Line on />));
  act(() => r.update(<Line on={false} />));
  expect(drawn(r)).toBe(false);
  expect(calls).toEqual([]);
});
