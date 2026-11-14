import { act } from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { LINE_HEIGHT_NUDGE, Text } from '../src/design/text';
import { textStyles } from '../src/design/tokens';
import { textRampScale } from '../src/design/text-scale';

jest.mock('../modules/opax-text-metrics', () => ({
  spToDp: (sp: number, fontScale: number) => sp * fontScale,
  dpToSp: (dp: number, fontScale: number) => dp / fontScale,
}));

const role = textStyles.sectionTitle;
const base = role.lineHeight + LINE_HEIGHT_NUDGE;
const ax5 = 56 / 22;
const window = Dimensions.get('window');
const screen = Dimensions.get('screen');
let renderer: TestRenderer.ReactTestRenderer;
let descriptor: PropertyDescriptor;
const text = () => renderer.root.findByType(NativeText);
const ratio = () =>
  StyleSheet.flatten(text().props.style).fontSize / role.fontSize;
const setSize = (fontScale: number, width = 390) =>
  act(() =>
    Dimensions.set({
      window: { ...window, width, fontScale },
      screen: { ...screen, width, fontScale },
    }),
  );
// Fabric dispatches queued native events to the CURRENT props of this same view.
const lines = (at: number, broken = true) =>
  act(() =>
    text().props.onTextLayout({
      nativeEvent: {
        lines: broken
          ? [
              { text: 'Representatio', width: 198, height: base * at },
              { text: 'n', width: 14, height: base * at },
            ]
          : [{ text: 'Representation', width: 212, height: base * at }],
      },
    }),
  );
const frame = (width: number, height: number) =>
  act(() =>
    text().props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    }),
  );

beforeEach(() => {
  descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  setSize(3.571);
  act(() => {
    renderer = TestRenderer.create(
      <Text wordSafe variant="sectionTitle" accessibilityRole="header">
        Representation
      </Text>,
    );
  });
});
afterEach(() => {
  act(() => {
    renderer.unmount();
    Dimensions.set({ window, screen });
  });
  Object.defineProperty(Platform, 'OS', descriptor);
});

test('A: a queued AX5 layout cannot set the full scale after a change to AX3', () => {
  const original = text();
  frame(200, 2 * base * ax5);
  lines(ax5);
  setSize(2.643);
  lines(2.3); // AX5's old capped layout, delivered to the new AX3 callback.
  frame(300, base * 2);
  lines(2, false);
  expect(ratio()).toBe(1);
  expect(text()).toBe(original);
  expect(text().props.accessibilityRole).toBe('header');
});

test('B: a native font-size change using the old cap cannot poison the new baseline', () => {
  frame(200, 2 * base * ax5);
  lines(ax5);
  const oldCap = ratio();
  setSize(2.643);
  // Native Dynamic Type changed before React committed the uncapped role.
  frame(200, 2 * base * 2 * oldCap);
  lines(2 * oldCap);
  expect(ratio()).toBe(1);
  frame(200, 2 * base * 2);
  lines(2);
  frame(200, 2 * base * 1.8);
  lines(1.8);
  expect(ratio()).toBeCloseTo(1.62 / 2, 6);
});

test('C: a queued portrait break cannot cap a landscape heading that fits', () => {
  const original = text();
  frame(200, 2 * base * ax5);
  lines(ax5);
  setSize(3.571, 844);
  lines(ax5); // Same line scale, but no landscape frame has been seen yet.
  frame(780, base * ax5);
  lines(ax5, false);
  expect(ratio()).toBe(1);
  expect(text()).toBe(original);
});

test('fresh lines arriving before their frame are fitted when the frame arrives', () => {
  lines(ax5);
  expect(ratio()).toBe(1);
  frame(200, base * ax5 * 2);
  expect(ratio()).toBeLessThan(1);
});

test('trailing-space overhang permits fitting, while visible overflow still rejects a queued wider layout', () => {
  frame(200, base * ax5 * 3);
  const send = (first: string) =>
    act(() =>
      text().props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: first, width: 205, height: base * ax5 },
            { text: 'representatio', width: 198, height: base * ax5 },
            { text: 'n', width: 14, height: base * ax5 },
          ],
        },
      }),
    );
  act(() =>
    renderer.update(
      <Text wordSafe variant="sectionTitle">
        Recorded representation
      </Text>,
    ),
  );
  frame(200, base * ax5 * 3);
  send('Recorded'); // It came from a wider column and has no space overhang.
  expect(ratio()).toBe(1);
  send('Recorded ');
  expect(ratio()).toBeLessThan(1);
});

test('line origins validate the scale when used rectangles have different leading', () => {
  const original = text();
  const send = (advance: number) =>
    act(() =>
      text().props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Representatio', width: 198, y: 0, height: advance + 2 },
            { text: 'n', width: 14, y: advance, height: advance + 2 },
          ],
        },
      }),
    );
  send(base * 2); // An earlier size, delivered before the current frame.
  frame(200, base * ax5 * 2 + 2);
  expect(ratio()).toBe(1);
  send(base * ax5);
  expect(ratio()).toBeLessThan(1);
  expect(text()).toBe(original);
});

test('committed measurement covers unchanged frames and cannot raise an existing height floor', () => {
  const callbacks: ((
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void)[] = [];
  text().instance.measure = jest.fn((callback) => callbacks.push(callback));
  const original = text();
  act(() =>
    renderer.update(
      <Text
        wordSafe
        variant="sectionTitle"
        accessibilityRole="header"
        maxFontSizeMultiplier={2}
      >
        Representation
      </Text>,
    ),
  );
  lines(2);
  expect(ratio()).toBe(1);
  // No onLayout after the prop change: the committed measure supplies it.
  act(() => callbacks[0]!(0, 0, 200, base * 4));
  expect(ratio()).toBeCloseTo(0.9);
  frame(200, base * 3.6);
  // This step has a new heightKey. A queued frame cannot set its floor;
  // establish it from the committed measurement before testing reinflation.
  act(() => callbacks[1]!(0, 0, 200, base * 3.6));
  const floor = StyleSheet.flatten(text().props.style).minHeight;
  expect(floor).toBe(Math.ceil(base * 3.6) + 1);
  act(() => callbacks[1]!(0, 0, 200, floor));
  expect(StyleSheet.flatten(text().props.style).minHeight).toBe(floor);
  setSize(1);
  // A measure from the capped step cannot write into the new identity.
  act(() => callbacks[1]!(0, 0, 200, base * 3.6));
  expect(ratio()).toBe(1);
  expect(text()).toBe(original);
});

test('expected scales follow the role ramp and caller ceiling, rather than the global iOS multiplier', () => {
  expect(textRampScale('title2', 2.643)).toBe(2);
  expect(textRampScale('headline', 3.571)).toBe(53 / 17);
  expect(textRampScale('subheadline', 3.571)).toBe(49 / 15);
  expect(textRampScale('caption1', 3.571)).toBe(43 / 12);
  expect(textRampScale('headline', 3.571, 1.2)).toBe(1.2);
  expect(textRampScale('title2', 1.47, 0, 'android', base)).toBeCloseTo(1.47);
  expect(textRampScale('title2', 2, 1.2, 'android', base)).toBe(2);
});

test('a narrower column fits buffered lines after removing a floor even without another onLayout', () => {
  frame(400, base * ax5);
  lines(ax5, false);
  const callbacks: ((
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void)[] = [];
  text().instance.measure = jest.fn((callback) => callbacks.push(callback));
  lines(ax5); // Native lines can arrive before their new frame.
  frame(200, base * ax5 * 2);
  expect(ratio()).toBe(1);
  act(() => callbacks[0]!(0, 0, 200, base * ax5 * 2));
  expect(ratio()).toBeLessThan(1);
});

test('a fresh full-size fit recovers after a queued break even when old and new columns have equal heights', () => {
  act(() =>
    renderer.update(
      <Text wordSafe variant="sectionTitle">
        Recorded representation
      </Text>,
    ),
  );
  setSize(3.571, 440);
  frame(220, base * ax5 * 2);
  act(() =>
    text().props.onTextLayout({
      nativeEvent: {
        lines: [
          { text: 'Recorded representatio', width: 198, height: base * ax5 },
          { text: 'n', width: 14, height: base * ax5 },
        ],
      },
    }),
  );
  frame(220, base * ax5 * 2);
  act(() =>
    text().props.onTextLayout({
      nativeEvent: {
        lines: [
          { text: 'Recorded ', width: 110, height: base * ax5 },
          { text: 'representation', width: 212, height: base * ax5 },
        ],
      },
    }),
  );
  expect(ratio()).toBe(1);
});
