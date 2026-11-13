/**
 * A disclosure's body eases open and closed in a HeightReveal, so the rows
 * below slide rather than jump. LayoutAnimation, which it used before, does
 * nothing on iOS while Reanimated 4.5 owns Fabric's layout-animation
 * delegate (src/design/reveal.tsx).
 */
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { LayoutAnimation, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import * as accessibility from '../src/design/accessibility';
import { Disclosure } from '../src/design/disclosure';
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

function mount(defaultOpen = false) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <Disclosure label="Procedural votes" testID="d" defaultOpen={defaultOpen}>
        <Text>Fixture vote</Text>
      </Disclosure>,
    );
  });
  return r;
}
const body = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === 'd-body',
  );
const toggle = (r: TestRenderer.ReactTestRenderer) =>
  act(() =>
    r.root
      .find(
        (n) => n.props.testID === 'd' && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
function layOut(r: TestRenderer.ReactTestRenderer, height: number) {
  const content = r.root
    .findByType(HeightReveal)
    .find(
      (n) =>
        typeof n.type === 'string' && typeof n.props.onLayout === 'function',
    );
  act(() =>
    content.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height } },
    }),
  );
}

test('the body opens in a height reveal over 200 ms and closes the same way, drawn until it has closed', () => {
  const configure = jest.spyOn(LayoutAnimation, 'configureNext');
  const r = mount();
  expect(body(r)).toHaveLength(0);
  toggle(r);
  expect(
    r.root
      .findByType(HeightReveal)
      .findAll(
        (n) => typeof n.type === 'string' && n.props.testID === 'd-body',
      ),
  ).toHaveLength(1);
  layOut(r, 120);
  expect(calls).toEqual([120]);
  act(() => jest.advanceTimersByTime(revealMotion.duration));
  toggle(r);
  expect(calls).toEqual([120, 0]);
  expect(body(r)).toHaveLength(1);
  act(() => jest.advanceTimersByTime(revealMotion.duration));
  expect(body(r)).toHaveLength(0);
  expect(configure).not.toHaveBeenCalled();
});

test('with Reduce Motion the body appears and goes at once', () => {
  jest.spyOn(accessibility, 'useReduceMotion').mockReturnValue(true);
  const r = mount();
  toggle(r);
  expect(body(r)).toHaveLength(1);
  layOut(r, 120);
  toggle(r);
  expect(body(r)).toHaveLength(0);
  expect(calls).toEqual([]);
});

test('a body open by default shows at once', () => {
  const r = mount(true);
  expect(body(r)).toHaveLength(1);
  layOut(r, 120);
  expect(calls).toEqual([]);
});
