import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  type View,
} from 'react-native';
import { Pressable } from '../src/design/pressable';
import { border, colors } from '../src/design/tokens';

const originalOS = Platform.OS;
const native = (r: ReturnType<typeof render>) =>
  r.UNSAFE_root.find(
    (node) =>
      node.type === (NativePressable as unknown as { type: unknown }).type,
  );
afterEach(() => {
  Platform.OS = originalOS;
});

test.each(['android', 'ios'] as const)(
  '%s keyboard focus has a token outline, forwards events and restores resting style',
  (os) => {
    Platform.OS = os;
    const onFocus = jest.fn(),
      onBlur = jest.fn();
    const style = ({ pressed }: { pressed: boolean }) => ({
      opacity: pressed ? 0.5 : 1,
      padding: 8,
    });
    const r = render(
      <Pressable
        testID="trigger"
        style={style}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    const currentStyle = (pressed = false) => {
      const style = native(r).props.style;
      return StyleSheet.flatten(
        typeof style === 'function' ? style({ pressed }) : style,
      );
    };
    const resting = currentStyle();
    expect(resting.outlineWidth).toBeUndefined();
    const event = { nativeEvent: {} };
    fireEvent(r.getByTestId('trigger'), 'focus', event);
    expect(onFocus).toHaveBeenCalledWith(event);
    expect(currentStyle()).toMatchObject({
      outlineColor: colors.navy,
      outlineWidth: border.focus,
      outlineOffset: border.focus,
      padding: 8,
    });
    if (os === 'ios') expect(currentStyle(true).opacity).toBe(0.5);
    fireEvent(r.getByTestId('trigger'), 'blur', event);
    expect(onBlur).toHaveBeenCalledWith(event);
    expect(currentStyle()).toEqual(resting);
  },
);

test.each([false, true])(
  'Android ref callback stays stable across parent and focus renders (object=%s)',
  (object) => {
    Platform.OS = 'android';
    const callback = jest.fn();
    const objectRef = createRef<View>();
    const ref = object ? objectRef : callback;
    const r = render(
      <Pressable ref={ref} testID="trigger" accessibilityLabel="Before" />,
    );
    const node = object ? objectRef.current : callback.mock.calls[0]![0];
    expect(node !== null && node !== undefined).toBe(true);
    const nativeRef = native(r).props.ref;
    const calls = callback.mock.calls.length;
    r.rerender(
      <Pressable ref={ref} testID="trigger" accessibilityLabel="After" />,
    );
    fireEvent(r.getByTestId('trigger'), 'focus', { nativeEvent: {} });
    fireEvent(r.getByTestId('trigger'), 'blur', { nativeEvent: {} });
    expect(native(r).props.ref === nativeRef).toBe(true);
    if (object) expect(objectRef.current === node).toBe(true);
    else {
      expect(callback.mock.calls[0]![0] === node).toBe(true);
      expect(callback).toHaveBeenCalledTimes(calls);
    }
    r.unmount();
    if (object) expect(objectRef.current).toBeNull();
    else expect(callback).toHaveBeenLastCalledWith(null);
  },
);

test('Android detaches the old forwarded ref when the owner changes it', () => {
  Platform.OS = 'android';
  const first = jest.fn(),
    second = jest.fn();
  const r = render(<Pressable ref={first} />);
  const node = first.mock.calls[0]![0];
  r.rerender(<Pressable ref={second} />);
  expect(first).toHaveBeenLastCalledWith(null);
  expect(second.mock.lastCall![0] === node).toBe(true);
});

test('Android keyboard focus turns the ripple focus fill off under the ring', () => {
  Platform.OS = 'android';
  const r = render(
    <Pressable testID="trigger" android_ripple={{ borderless: true }} />,
  );
  expect(native(r).props.android_ripple).toMatchObject({ borderless: true });
  expect(native(r).props.android_ripple.color).not.toBe('transparent');
  fireEvent(r.getByTestId('trigger'), 'focus', { nativeEvent: {} });
  // One ring: the navy outline, over a ripple that draws nothing when focused.
  expect(native(r).props.android_ripple).toEqual({
    color: 'transparent',
    foreground: true,
    borderless: false,
  });
  fireEvent(r.getByTestId('trigger'), 'blur', { nativeEvent: {} });
  expect(native(r).props.android_ripple.color).not.toBe('transparent');
  expect(native(r).props.android_ripple).toMatchObject({ borderless: true });
});

test('iOS receives no ripple or ring prop from focus', () => {
  Platform.OS = 'ios';
  const r = render(<Pressable testID="trigger" />);
  fireEvent(r.getByTestId('trigger'), 'focus', { nativeEvent: {} });
  expect(native(r).props.ringed).toBeUndefined();
  expect(native(r).props.android_ripple).toBeUndefined();
});
