import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ResendButton } from '../src/features/account/ResendButton';
import { spokenWait } from '../src/features/account/useCodeChallenge';
import { accountCopy } from '../src/features/account/copy';

// "Send a new code" (specs/account.md 5.3): the visible label counts down,
// the accessible name never changes, and VoiceOver hears the wait as a value
// in 10-second steps.
function render(wait: number, onPress = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ResendButton
        label={accountCopy.sendNewCode}
        countdown={accountCopy.sendNewCodeIn}
        wait={wait}
        onPress={onPress}
        testID="account-resend"
      />,
    );
  });
  const host = renderer.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.testID === 'account-resend',
  );
  const shown = renderer.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.children === 'string',
    )
    .map((node) => node.props.children as string);
  const props = { ...host.props };
  act(() => renderer.unmount());
  return { props, shown };
}

test.each([60, 42, 0])('the name stays fixed at %i seconds', (wait) => {
  const { props } = render(wait);
  expect(props.accessibilityLabel).toBe('Send a new code');
  expect(props.accessibilityRole).toBe('button');
});

test('the visible label counts down; the value only while waiting', () => {
  const waiting = render(42);
  expect(waiting.shown).toEqual(['Send a new code in 0:42']);
  expect(waiting.props.accessibilityValue).toEqual({
    text: 'available in 40 seconds',
  });
  expect(waiting.props.accessibilityState).toMatchObject({ disabled: true });
  const ready = render(0);
  expect(ready.shown).toEqual(['Send a new code']);
  expect(ready.props.accessibilityValue?.text).toBeUndefined();
  expect(ready.props.accessibilityState).toMatchObject({ disabled: false });
});

test('the spoken value changes only on 10-second steps', () => {
  const values = Array.from({ length: 60 }, (_, index) =>
    spokenWait(60 - index),
  );
  expect([...new Set(values)]).toEqual([60, 50, 40, 30, 20, 10]);
  expect(spokenWait(9)).toBe(10);
  expect(spokenWait(0)).toBe(0);
  for (const wait of [60, 59, 51, 50, 42, 41])
    expect(render(wait).props.accessibilityValue).toEqual({
      text: `available in ${spokenWait(wait)} seconds`,
    });
});

test('it is disabled while waiting or busy, and presses once ready', () => {
  const onPress = jest.fn();
  const pressable = (wait: number, busy = false) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ResendButton
          label={accountCopy.sendNewCode}
          countdown={accountCopy.sendNewCodeIn}
          wait={wait}
          busy={busy}
          onPress={onPress}
        />,
      );
    });
    const props = {
      ...renderer.root.find(
        (node) =>
          typeof node.type !== 'string' &&
          node.type !== ResendButton &&
          node.props.onPress === onPress,
      ).props,
    };
    act(() => renderer.unmount());
    return props;
  };
  expect(pressable(30).disabled).toBe(true);
  expect(pressable(0, true).disabled).toBe(true);
  const ready = pressable(0);
  expect(ready.disabled).toBe(false);
  ready.onPress!({} as never);
  expect(onPress).toHaveBeenCalledTimes(1);
});
