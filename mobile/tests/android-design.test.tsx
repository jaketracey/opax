/* eslint-disable @typescript-eslint/no-require-imports -- Android native host doubles. */
import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  Modal,
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import {
  Button,
  Composer,
  Field,
  IconButton,
  PopUpButton,
  SegmentedControl,
  SwitchRow,
} from '../src/design/controls';
import { ChoiceChip } from '../src/design/labels';
import { Slider, Stepper } from '../src/design/adjustable';
import { AndroidMenuHost, showMenu } from '../src/design/menu';
import { Text } from '../src/design/text';
import { androidControls, colors, textStyles } from '../src/design/tokens';
import { Pressable } from '../src/design/pressable';
import { ContextMenu } from '../src/design/context-menu';
let mockContrast = false;
let mockFontScale = 1;
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  Object.defineProperty(rn.Platform, 'OS', { get: () => 'android' });
  rn.UIManager.measureInWindow = jest.fn();
  return rn;
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 412,
    height: 915,
    scale: 2.625,
    fontScale: mockFontScale,
  }),
}));
jest.mock('../src/design/accessibility', () => ({
  useBoldText: () => false,
  useHighTextContrast: () => mockContrast,
  useReduceMotion: () => true,
  useAccessibilitySize: () => mockFontScale >= 1.786,
}));
jest.mock('@expo/ui/jetpack-compose', () => {
  const React = require('react');
  function part(name: string) {
    return function MaterialPart(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children);
    };
  }
  return {
    Host: part('MaterialHost'),
    Switch: part('MaterialSwitch'),
    Slider: part('MaterialSlider'),
  };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
}));
const noop = () => undefined;
beforeEach(() => {
  mockContrast = false;
  mockFontScale = 1;
});
const surfaces = (r: ReturnType<typeof render>) =>
  r.UNSAFE_root.findAll(
    (n) =>
      typeof n.type !== 'string' &&
      Object.hasOwn(n.props, 'android_ripple') &&
      Array.isArray(n.props.style) &&
      typeof n.props.onPressIn === 'function',
  );
const surface = (r: ReturnType<typeof render>) => surfaces(r)[0]!;
const styles = (node: { props: { style: unknown } }) =>
  StyleSheet.flatten(node.props.style as never);

test.each([false, true])(
  'ripples use a visible state layer with contrast=%s, retaining the resting content',
  (contrast) => {
    mockContrast = contrast;
    const r = render(
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record"
        style={({ pressed }) => ({ opacity: pressed ? 0.3 : 1 })}
      >
        {({ pressed }) => <Text>{pressed ? 'Pressed' : 'Record'}</Text>}
      </Pressable>,
    );
    const p = surface(r);
    expect(p.props.android_ripple).toEqual({
      color: contrast
        ? androidControls.rippleHighContrast
        : androidControls.ripple,
      foreground: true,
      borderless: false,
    });
    expect(styles(p)).toMatchObject({
      minHeight: 48,
      minWidth: 48,
      opacity: 1,
      overflow: 'hidden',
    });
    fireEvent(p, 'pressIn', { nativeEvent: {} });
    expect(r.getByText('Record')).toBeTruthy();
  },
);
test('disabled controls suppress the ripple and action; icon buttons use borderless feedback', () => {
  const change = jest.fn();
  const r = render(
    <View>
      <Button label="Disabled" disabled onPress={change} />
      <IconButton
        symbol="ellipsis"
        accessibilityLabel="More"
        onPress={change}
      />
    </View>,
  );
  fireEvent.press(r.getByRole('button', { name: 'Disabled' }));
  expect(change).not.toHaveBeenCalled();
  const controls = surfaces(r);
  expect(controls[0]!.props.android_ripple).toBeUndefined();
  expect(controls[1]!.props.android_ripple.borderless).toBe(true);
});
test('context menus give raw React Native triggers the same Android ripple and target', () => {
  const r = render(
    <ContextMenu items={[{ title: 'Copy link', onPress: noop }]}>
      <NativePressable
        accessibilityRole="button"
        accessibilityLabel="Votes"
        onPress={noop}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, minHeight: 32 })}
      >
        <Text>Votes</Text>
      </NativePressable>
    </ContextMenu>,
  );
  expect(styles(surface(r))).toMatchObject({ minHeight: 48, opacity: 1 });
  expect(surface(r).props.android_ripple).toMatchObject({ foreground: true });
  expect(surface(r).props.onLongPress).toEqual(expect.any(Function));
});
test.each(['filled', 'tonal', 'outlined', 'text'] as const)(
  '%s buttons fill their target and retain a spoken label',
  (variant) => {
    const r = render(
      <Button label="Show more" variant={variant} onPress={noop} />,
    );
    expect(styles(surface(r)).minHeight).toBeGreaterThanOrEqual(48);
    expect(r.getByRole('button', { name: 'Show more' })).toBeTruthy();
  },
);
test('selected filter chips have a check and a checked state; segments expose selected tabs', () => {
  const r = render(
    <View>
      <ChoiceChip label="Housing" selected onPress={noop} />
      <SegmentedControl
        value="all"
        segments={[
          { value: 'all', label: 'All' },
          { value: 'passed', label: 'Passed' },
        ]}
        onChange={noop}
      />
    </View>,
  );
  expect(
    r.getByRole('checkbox', { name: 'Housing' }).props.accessibilityState,
  ).toMatchObject({ checked: true, selected: true });
  expect(
    r.getByRole('tab', { name: 'All' }).props.accessibilityState.selected,
  ).toBe(true);
});
test('switch rows draw Material switches with one accessible checked control', () => {
  const change = jest.fn();
  const r = render(
    <SwitchRow label="Sitting members" value onValueChange={change} />,
  );
  fireEvent.press(r.getByRole('switch', { name: 'Sitting members' }));
  expect(change).toHaveBeenCalledWith(false);
  expect(r.UNSAFE_getByType('MaterialSwitch' as never).props.value).toBe(true);
});
test('fields support controlled clearing, native search affordance and a wrapping label', () => {
  const change = jest.fn();
  const r = render(
    <Field
      label="Search"
      returnKeyType="search"
      value="Housing"
      onChangeText={change}
      testID="search"
    />,
  );
  const input = r.UNSAFE_getByType(TextInput);
  fireEvent(input, 'focus', { nativeEvent: {} });
  expect(input.props.underlineColorAndroid).toBe('transparent');
  expect(styles(input).includeFontPadding).toBe(false);
  fireEvent.press(r.getByRole('button', { name: 'Clear search' }));
  expect(change).toHaveBeenCalledWith('');
});
test('Android composers use a focus boundary and keep native input metrics', () => {
  const focus = jest.fn();
  const r = render(
    <Composer
      label="Question"
      submitLabel="Ask"
      placeholder="Ask a question"
      value="Housing"
      onChangeText={noop}
      onSubmit={noop}
      onFocus={focus}
    />,
  );
  const input = r.UNSAFE_getByType(TextInput);
  expect(input.props.underlineColorAndroid).toBe('transparent');
  expect(styles(input).includeFontPadding).toBe(false);
  fireEvent(input, 'focus', { nativeEvent: {} });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(
    r.UNSAFE_getAllByType(View).some((view) => {
      const style = styles(view);
      return style?.borderColor === colors.navy && style.borderWidth === 2;
    }),
  ).toBe(true);
});
test.each([Stepper, Slider])(
  '%p exposes adjustable increments, bounds and disabled state',
  (Control) => {
    const change = jest.fn();
    const r = render(
      <Control
        label="Year"
        value={2025}
        min={2024}
        max={2026}
        onValueChange={change}
      />,
    );
    const control = r.getByRole('adjustable', { name: 'Year' });
    fireEvent(control, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(change).toHaveBeenLastCalledWith(2026);
    fireEvent(control, 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(change).toHaveBeenLastCalledWith(2024);
    r.rerender(
      <Control
        label="Year"
        value={2026}
        min={2024}
        max={2026}
        disabled
        onValueChange={change}
      />,
    );
    change.mockClear();
    fireEvent(r.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(change).not.toHaveBeenCalled();
  },
);
test('sliders can reach both endpoints when the range is not divisible by the step', () => {
  const change = jest.fn();
  const r = render(
    <Slider
      label="Value"
      value={6}
      min={0}
      max={10}
      step={3}
      onValueChange={change}
    />,
  );
  const slider = r.UNSAFE_getByType('MaterialSlider' as never);
  fireEvent(slider, 'valueChange', 10);
  expect(change).toHaveBeenLastCalledWith(10);
  fireEvent(slider, 'valueChange', 0);
  expect(change).toHaveBeenLastCalledWith(0);
});
test('popup menus remain anchored inside the viewport, expose menu items and dismiss on Back or outside tap', () => {
  const action = jest.fn(),
    dismiss = jest.fn();
  const r = render(<AndroidMenuHost />);
  act(() =>
    showMenu(
      'Actions',
      [
        { title: 'Copy link', onPress: action },
        { title: 'Delete', destructive: true, onPress: noop },
      ],
      { x: 350, y: 820, width: 48, height: 48 },
      undefined,
      dismiss,
    ),
  );
  expect(r.getByTestId('android-menu').props.accessibilityRole).toBe('menu');
  expect(styles(r.getByTestId('android-menu')).left).toBeLessThan(350);
  fireEvent.press(r.getByRole('menuitem', { name: 'Copy link' }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(r.queryByTestId('android-menu')).toBeNull();
  act(() => showMenu('Actions', [{ title: 'Copy', onPress: action }]));
  fireEvent(r.UNSAFE_getByType(Modal), 'requestClose');
  expect(r.queryByTestId('android-menu')).toBeNull();
  act(() => showMenu('Actions', [{ title: 'Copy', onPress: action }]));
  fireEvent.press(r.getByTestId('android-menu-outside'));
  expect(r.queryByTestId('android-menu')).toBeNull();
});

test('MenuPicker measures its trigger instance and opens without the numeric UIManager path', () => {
  const measure = jest
    .spyOn(UIManager, 'measureInWindow')
    .mockImplementation(() => {});
  const change = jest.fn();
  const trigger = {
    measureInWindow: jest.fn((callback) => callback(42, 100, 120, 48)),
  };
  const r = render(
    <View>
      <PopUpButton
        label="Status"
        value="all"
        options={[
          { value: 'all', label: 'All' },
          { value: 'passed', label: 'Passed' },
        ]}
        onChange={change}
      />
      <AndroidMenuHost />
    </View>,
  );
  r.UNSAFE_getByType(Button).props.ref.current.measureInWindow =
    trigger.measureInWindow;
  try {
    fireEvent.press(r.getByRole('button', { name: 'Status, All' }));
    expect(trigger.measureInWindow).toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
    expect(styles(r.getByTestId('android-menu'))).toMatchObject({
      left: 42,
      top: 148,
    });
    expect(
      r.getByRole('button', { name: 'Status, All' }).props.accessibilityState
        .expanded,
    ).toBe(true);
    fireEvent.press(r.getByRole('menuitem', { name: 'Passed' }));
    expect(change).toHaveBeenCalledWith('passed');
    expect(r.queryByTestId('android-menu')).toBeNull();
    expect(
      r.getByRole('button', { name: 'Status, All' }).props.accessibilityState
        .expanded,
    ).toBe(false);
  } finally {
    measure.mockRestore();
  }
});

test.each(['missing', 'invalid', 'throws', 'late'] as const)(
  'numeric anchor measurement %s never prevents opening or reopens a dismissed menu',
  (failure) => {
    let complete!: (
      x: number,
      y: number,
      width: number,
      height: number,
    ) => void;
    const measure = jest
      .spyOn(UIManager, 'measureInWindow')
      .mockImplementation((_tag, callback) => {
        complete = callback;
        if (failure === 'throws') throw new Error('detached view');
        if (failure === 'invalid') callback(NaN, NaN, 0, 0);
      });
    const dismiss = jest.fn();
    const r = render(<AndroidMenuHost />);
    try {
      act(() =>
        showMenu(
          'Status',
          [{ title: 'All', onPress: noop }],
          42,
          undefined,
          dismiss,
        ),
      );
      expect(r.getByRole('menuitem', { name: 'All' })).toBeTruthy();
      expect(Number.isFinite(styles(r.getByTestId('android-menu')).top)).toBe(
        true,
      );
      fireEvent.press(r.getByTestId('android-menu-outside'));
      if (failure === 'late') act(() => complete(42, 100, 120, 48));
      expect(r.queryByTestId('android-menu')).toBeNull();
      expect(dismiss).toHaveBeenCalledTimes(1);
    } finally {
      measure.mockRestore();
    }
  },
);
test.each([1, 1.3, 2])(
  'all type roles keep Public Sans or record serif, tabular figures and no Android height floor at %s',
  (scale) => {
    mockFontScale = scale;
    expect(Platform.OS).toBe('android');
    for (const [variant, role] of Object.entries(textStyles)) {
      const r = render(
        <Text variant={variant as keyof typeof textStyles}>
          Parliament 1,234,567
        </Text>,
      );
      const text = r.getByText('Parliament 1,234,567');
      expect(styles(text)).toMatchObject({ includeFontPadding: false });
      expect(styles(text).fontFamily).toMatch(/PublicSans|Merriweather/);
      expect(styles(text).minHeight).toBeUndefined();
      expect(role.fontSize).toBeGreaterThanOrEqual(12);
      expect(role.lineHeight).toBeGreaterThan(role.fontSize);
      if (role.tabular)
        expect(styles(text).fontVariant).toEqual(['tabular-nums']);
      r.unmount();
    }
  },
);

test('Material focus thickens the field outline without moving its text inset', () => {
  const r = render(<Field label="Email" value="" onChangeText={noop} />);
  const input = r.UNSAFE_getByType(TextInput);
  const outline = () =>
    r.UNSAFE_root.findAll(
      (n) => typeof n.props.style === 'object' && styles(n)?.borderRadius === 4,
    )[0]!;
  expect(styles(outline()).borderWidth).toBe(1);
  const inset = styles(outline()).borderWidth + styles(input).paddingHorizontal;
  fireEvent(input, 'focus', { nativeEvent: {} });
  expect(styles(outline()).borderWidth).toBe(2);
  expect(styles(outline()).borderWidth + styles(input).paddingHorizontal).toBe(
    inset,
  );
});

test('ripple state layers preserve AA text contrast on paper and every filled category surface', () => {
  const { contrastRatio } =
    require('../src/design/contrast') as typeof import('../src/design/contrast');
  const { light, lightHighContrast } =
    require('../src/design/palette') as typeof import('../src/design/palette');
  const { accents } =
    require('../src/design/tokens') as typeof import('../src/design/tokens');
  const composite = (layer: string, ground: string) => {
    const alpha = parseInt(layer.slice(7, 9), 16) / 255;
    return (
      '#' +
      [1, 3, 5]
        .map((at) =>
          Math.round(
            parseInt(layer.slice(at, at + 2), 16) * alpha +
              parseInt(ground.slice(at, at + 2), 16) * (1 - alpha),
          )
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  };
  expect(
    contrastRatio(
      light.inkSoft,
      composite(androidControls.ripple, light.paper),
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrastRatio(
      lightHighContrast.inkSoft ?? light.inkSoft,
      composite(androidControls.rippleHighContrast, light.paper),
    ),
  ).toBeGreaterThanOrEqual(4.5);
  for (const { ink } of Object.values(accents)) {
    expect(
      contrastRatio(
        light.onNavy,
        composite(androidControls.rippleOnFilled, light[ink]),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  }
});
test('absolutely positioned surfaces such as chart bars keep their parent-given size', () => {
  const r = render(
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="2024, 12"
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 12 }}
    />,
  );
  const style = styles(surface(r));
  expect(style.width).toBe(12);
  expect(style.minWidth).toBe(0);
  expect(style.minHeight).toBe(0);
});
test('the workbench Android controls gallery draws every Material control', () => {
  const { AndroidControls } =
    require('../src/workbench/AndroidControls') as typeof import('../src/workbench/AndroidControls');
  const r = render(<AndroidControls />);
  for (const name of ['Filled', 'Tonal', 'Outlined', 'Text', 'Disabled'])
    expect(r.getByRole('button', { name })).toBeTruthy();
  expect(r.getByTestId('wb-android-switch').props.accessibilityState).toEqual({
    checked: true,
    disabled: false,
  });
  expect(
    r.getByTestId('wb-android-chip-house').props.accessibilityState.checked,
  ).toBe(true);
  expect(r.getByTestId('wb-android-stepper').props.accessibilityRole).toBe(
    'adjustable',
  );
  expect(r.getByTestId('wb-android-slider').props.accessibilityRole).toBe(
    'adjustable',
  );
});
test('segmented checks never cost a word: the check draws only where the longest word still fits', () => {
  const { checkFits } =
    require('../src/design/controls') as typeof import('../src/design/controls');
  const status = ['Before parliament', 'Recent', 'All'];
  // A 412 dp phone less the 16 dp margins: "parliament" would break beside a check.
  expect(checkFits(status, 380)).toBe(false);
  expect(checkFits(['All', 'Passed'], 380)).toBe(true);
  expect(checkFits(['All', 'Passed', 'Recent'], 380)).toBe(true);
  expect(checkFits(['All', 'Passed', 'Recent'], 380, 2)).toBe(false);
  const checks = (labels: string[], width: number) => {
    const r = render(
      <SegmentedControl
        testID="seg"
        value="a"
        segments={labels.map((label, index) => ({
          value: index ? `v${index}` : 'a',
          label,
        }))}
        onChange={noop}
      />,
    );
    // Before layout there is no width, so no check can break a word.
    const before = r.UNSAFE_root.findAll(
      (n) => n.props.name === 'checkmark' && typeof n.type !== 'string',
    ).length;
    act(() =>
      r
        .getByTestId('seg')
        .props.onLayout({ nativeEvent: { layout: { width, height: 48 } } }),
    );
    const after = r.UNSAFE_root.findAll(
      (n) => n.props.name === 'checkmark' && typeof n.type !== 'string',
    ).length;
    r.unmount();
    return [before, after > 0];
  };
  expect(checks(status, 380)).toEqual([0, false]);
  expect(checks(['All', 'Passed'], 380)).toEqual([0, true]);
});
