/* eslint-disable @typescript-eslint/no-require-imports -- Native UI test doubles render only inert host views. */
import { act, type ReactElement } from 'react';
import * as RN from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  Button,
  Composer,
  Field,
  FollowButton,
  IconButton,
  MonthPager,
  PopUpButton,
  popUpLabelInset,
  SegmentedPicker,
} from '../src/design/controls';
import { Icon } from '../src/design/icon';
import { Text } from '../src/design/text';
import { haptic } from '../src/design/haptics';
import { symbols } from '../src/design/symbols';
import { followWithFeedback, useFollows } from '../src/features/follows/store';
import { showMenu } from '../src/design/menu';
import { SurfaceContext } from '../src/design/row-padding';
import { colors, radii } from '../src/design/tokens';

jest.mock('../src/features/follows/useFollowStates', () => ({
  markSeenNow: jest.fn(),
}));
jest.mock('../src/features/follows/store', () => ({
  FOLLOW_LIMIT: 50,
  useFollows: jest.fn(() => []),
  followKey: jest.fn(() => 'bill:b'),
  follow: jest.fn(),
  followWithFeedback: jest.fn(),
  unfollow: jest.fn(),
}));
jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
}));
jest.mock('expo-router', () => {
  const React = require('react');
  const part = (props: { children?: unknown }) =>
    React.createElement('ToolbarPart', props, props.children);
  const Toolbar = Object.assign(part, {
    Button: part,
    View: part,
    Spacer: part,
  });
  return { Stack: { Toolbar }, router: { push: jest.fn() } };
});
const noop = () => {};
let mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let result!: TestRenderer.ReactTestRenderer;
  act(() => {
    result = TestRenderer.create(element);
  });
  mounted.push(result);
  return result;
}
function press(r: TestRenderer.ReactTestRenderer, id: string) {
  return r.root.find(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.testID === id &&
      node.props.accessibilityRole &&
      typeof node.props.onPress === 'function',
  );
}
function size(fontScale: number) {
  act(() =>
    RN.Dimensions.set({
      window: {
        ...RN.Dimensions.get('window'),
        width: 375,
        height: 812,
        scale: 3,
        fontScale,
      },
    }),
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  size(1);
});
afterEach(() => {
  act(() => {
    mounted.forEach((r) => r.unmount());
  });
  mounted = [];
  jest.restoreAllMocks();
});
const options = [
  { value: 'all', label: 'All jurisdictions', shortLabel: 'All' },
  { value: 'federal', label: 'Commonwealth', shortLabel: 'Federal' },
  { value: 'vic', label: 'Victoria' },
  { value: 'nsw', label: 'New South Wales', shortLabel: 'NSW' },
];

test.each([false, true])(
  'Field grouped=%s has exactly one visible label and a stable focus boundary',
  (grouped) => {
    const r = render(<Field label="Email" grouped={grouped} testID="email" />);
    const labels = r.root
      .findAllByType(Text)
      .filter(
        (node) =>
          node.props.children === 'Email' ||
          (Array.isArray(node.props.children) &&
            node.props.children[0] === 'Email'),
      );
    expect(labels).toHaveLength(1);
    expect(labels[0]!.props.variant).toBe(
      grouped ? 'groupHeader' : 'secondary',
    );
    const field = () => r.root.findByType(RN.TextInput);
    expect(field().props.accessibilityLabel).toBe('Email');
    expect(field().props.clearButtonMode).toBe('while-editing');
    expect(RN.StyleSheet.flatten(field().props.style).borderWidth).toBe(1);
    act(() => field().props.onFocus({ nativeEvent: {} }));
    expect(RN.StyleSheet.flatten(field().props.style).borderWidth).toBe(1);
  },
);
test.each(
  [false, true].flatMap((grouped) =>
    [1, 2.643].flatMap((scale) =>
      (['text', 'code'] as const).map((variant) => ({
        grouped,
        scale,
        variant,
      })),
    ),
  ),
)(
  'Field has one surface for rest, focus and error: %j',
  ({ grouped, scale, variant }) => {
    size(scale);
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const field = (error?: string) => (
      <SurfaceContext.Provider value="sunken">
        <Field
          label="Email"
          grouped={grouped}
          variant={variant}
          error={error}
          onFocus={onFocus}
          onBlur={onBlur}
          testID="email"
        />
      </SurfaceContext.Provider>
    );
    const r = render(field());
    const input = () => r.root.findByType(RN.TextInput);
    const style = () => RN.StyleSheet.flatten(input().props.style);
    const boundary = {
      backgroundColor: colors.raised,
      borderRadius: grouped ? radii.container : radii.thumb,
      borderCurve: 'continuous',
      borderWidth: 1,
    };
    // A second raised ancestor is the original bug: InsetGroup padded the
    // input's own white surface, leaving white outside its navy boundary.
    let ancestor = input().parent;
    while (ancestor) {
      if (ancestor.type === RN.View) {
        const parentStyle = RN.StyleSheet.flatten(ancestor.props.style);
        expect(parentStyle?.backgroundColor).not.toBe(colors.raised);
        expect(parentStyle?.outlineWidth).toBeUndefined();
      }
      expect(ancestor.props.onPress).toBeUndefined();
      ancestor = ancestor.parent;
    }
    expect(style()).toMatchObject({
      ...boundary,
      borderColor: colors.lineControl,
    });
    act(() => input().props.onFocus({ nativeEvent: {} }));
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(style()).toMatchObject({ ...boundary, borderColor: colors.navy });
    act(() => r.update(field('Check this value.')));
    expect(style()).toMatchObject({ ...boundary, borderColor: colors.danger });
    act(() => input().props.onBlur({ nativeEvent: {} }));
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(style()).toMatchObject({ ...boundary, borderColor: colors.danger });
    act(() => r.update(field()));
    expect(style()).toMatchObject({
      ...boundary,
      borderColor: colors.lineControl,
    });
    expect(input().props.testID).toBe('email');
  },
);
test.each([false, true])(
  'Field labelHidden=%s never duplicates a group header',
  (labelHidden) => {
    const r = render(
      <Field label="Deletion code" grouped labelHidden={labelHidden} />,
    );
    expect(
      r.root
        .findAllByType(Text)
        .filter((node) => node.props.variant === 'groupHeader'),
    ).toHaveLength(labelHidden ? 0 : 1);
    expect(r.root.findByType(RN.TextInput).props.accessibilityLabel).toBe(
      'Deletion code',
    );
  },
);
test.each([undefined, 14])(
  'the badge %s uses the scaling capsule role',
  (badge) => {
    const r = render(
      <IconButton
        symbol={symbols.source}
        accessibilityLabel="Sources"
        onPress={noop}
        badge={badge}
      />,
    );
    const badges = r.root
      .findAllByType(Text)
      .filter((node) => node.props.variant === 'capsule');
    expect(badges).toHaveLength(badge ? 1 : 0);
    if (badge) {
      // Inside the button's frame: a clipping parent (the Talk dock's
      // ScrollView) must not cut the count off.
      const capsule = RN.StyleSheet.flatten(badges[0]!.parent!.props.style);
      expect(capsule.position).toBe('absolute');
      expect(capsule.top).toBeGreaterThanOrEqual(0);
      expect(capsule.right).toBeGreaterThanOrEqual(0);
      expect(badges[0]!.props.allowFontScaling).not.toBe(false);
      expect(
        RN.StyleSheet.flatten(badges[0]!.props.style).fontSize,
      ).toBeUndefined();
    }
  },
);
test.each([1, 1.786])(
  'PopUpButton at font scale %s uses a checkmarked native menu and short labels only at AX sizes',
  (scale) => {
    size(scale);
    const changed = jest.fn();
    const r = render(
      <PopUpButton
        label="Jurisdiction"
        value="all"
        options={options}
        onChange={changed}
        testID="jur"
      />,
    );
    const picker = r.root.findByType(Picker);
    expect(picker.props.modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ $type: 'pickerStyle', style: 'menu' }),
        expect.objectContaining({
          $type: 'accessibilityLabel',
          label: 'Jurisdiction, All jurisdictions, pop-up button',
        }),
        // The system's own pop-up indicator, in the tint: not a bare tag.
        expect.objectContaining({
          $type: 'menuIndicator',
          visibility: 'visible',
        }),
        expect.objectContaining({ $type: 'tint' }),
        expect.objectContaining({ $type: 'frame', minHeight: 44 }),
      ]),
    );
    expect(picker.props.modifiers).not.toContainEqual(
      expect.objectContaining({ $type: 'background' }),
    );
    expect(picker.props.selection).toBe('all');
    expect(
      r.root.findAllByType(SwiftText).map((node) => node.props.children),
    ).toContain(scale === 1 ? 'All jurisdictions' : 'All');
    act(() => picker.props.onSelectionChange('vic'));
    expect(changed).toHaveBeenCalledWith('vic');
    expect(haptic).not.toHaveBeenCalled(); // UIKit supplies selection feedback.
  },
);
test.each([1, 2.143, 2.643])(
  'four segments at font scale %s use the appropriate native style',
  (scale) => {
    size(scale);
    const r = render(
      <SegmentedPicker
        options={options}
        value="all"
        onChange={noop}
        accessibilityLabel="Status"
      />,
    );
    expect(r.root.findByType(Picker).props.modifiers).toContainEqual(
      expect.objectContaining({
        $type: 'pickerStyle',
        style: scale === 1 ? 'segmented' : 'menu',
      }),
    );
    expect(r.root.findByType(Host).props.matchContents.vertical).toBe(true);
    expect(
      r.root
        .findAllByType(SwiftText)
        .every((node) => node.props.numberOfLines === undefined),
    ).toBe(true);
  },
);
test('SegmentedPicker rejects five options', () => {
  expect(() =>
    render(
      <SegmentedPicker
        options={[...options, { value: 'sa', label: 'South Australia' }]}
        value="all"
        onChange={noop}
        accessibilityLabel="Status"
      />,
    ),
  ).toThrow('two to four');
});
test('Android pop-up uses the shared menu and custom selection feedback', () => {
  const original = RN.Platform.OS;
  Object.defineProperty(RN.Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  try {
    const changed = jest.fn();
    const r = render(
      <PopUpButton
        label="Month"
        value="all"
        options={options}
        onChange={changed}
        testID="month"
      />,
    );
    act(() => press(r, 'month').props.onPress());
    const actions = jest.mocked(showMenu).mock.calls[0]![1];
    expect(actions[0]!.title).toBe('All jurisdictions');
    expect(actions[0]!.selected).toBe(true);
    act(() => actions[1]!.onPress());
    expect(changed).toHaveBeenCalledWith('federal');
    expect(haptic).toHaveBeenCalledWith('selection');
  } finally {
    Object.defineProperty(RN.Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
});
test.each([false, true])(
  'Composer optional frame props enabled=%s',
  (enabled) => {
    const remove = jest.fn(),
      stop = jest.fn(),
      submit = jest.fn();
    const r = render(
      <Composer
        label="Question"
        submitLabel="Ask"
        placeholder="Ask about the public record"
        value="Question"
        onChangeText={noop}
        onSubmit={submit}
        leading={enabled ? <RN.View testID="options" /> : undefined}
        tags={
          enabled
            ? [{ id: 'topic', label: 'Health', onRemove: remove }]
            : undefined
        }
        note={enabled ? 'A fresh draft' : undefined}
        busy={enabled}
        onStop={enabled ? stop : undefined}
        docked={enabled}
        bottomOffset={enabled ? 66 : undefined}
        testID="composer"
        submitTestID="send"
      />,
    );
    expect(r.root.findAllByProps({ testID: 'options' }).length > 0).toBe(
      enabled,
    );
    expect(
      r.root
        .findAllByType(Text)
        .some((node) => node.props.children === 'A fresh draft'),
    ).toBe(enabled);
    expect(
      r.root
        .findAllByType(Icon)
        .some((node) => node.props.name === symbols.stop),
    ).toBe(enabled);
    act(() => press(r, 'send').props.onPress());
    expect(enabled ? stop : submit).toHaveBeenCalledTimes(1);
    if (enabled) {
      act(() => press(r, 'composer-tag-topic').props.onPress());
      expect(remove).toHaveBeenCalledTimes(1);
    }
    expect(
      r.root
        .findAllByType(RN.View)
        .some((node) => RN.StyleSheet.flatten(node.props.style)?.bottom === 66),
    ).toBe(enabled);
    expect(
      RN.StyleSheet.flatten(r.root.findByType(RN.TextInput).props.style)
        .maxHeight,
    ).toBe(135);
  },
);
test('Composer cannot send empty text, but an active answer can always stop', () => {
  const r = render(
    <Composer
      label="Question"
      submitLabel="Ask"
      placeholder="Question"
      value=""
      onChangeText={noop}
      onSubmit={noop}
      testID="composer"
      submitTestID="send"
    />,
  );
  expect(press(r, 'send').props.disabled).toBe(true);
  act(() =>
    r.update(
      <Composer
        label="Question"
        submitLabel="Ask"
        placeholder="Question"
        value=""
        onChangeText={noop}
        onSubmit={noop}
        busy
        onStop={noop}
        submitTestID="send"
      />,
    ),
  );
  expect(press(r, 'send').props.disabled).toBe(false);
});
test.each([false, true])(
  'primary fullWidth=%s gets the specified height',
  (fullWidth) => {
    const r = render(
      <Button
        label="Continue"
        variant="primary"
        fullWidth={fullWidth}
        onPress={noop}
        testID="continue"
      />,
    );
    const style = press(r, 'continue').props.style({ pressed: false });
    expect(RN.StyleSheet.flatten(style).minHeight).toBe(fullWidth ? 50 : 44);
  },
);
test('MonthPager keeps a disabled end and names the previous month', () => {
  const r = render(
    <MonthPager
      month="November 2026"
      previous={{ label: 'October', onPress: noop }}
      next={null}
    />,
  );
  const buttons = r.root.findAll(
    (node) =>
      node.props.accessibilityLabel?.startsWith('Previous month') ||
      node.props.accessibilityLabel?.startsWith('Next month'),
  );
  expect(
    buttons.some(
      (node) => node.props.accessibilityLabel === 'Previous month, October',
    ),
  ).toBe(true);
  expect(
    buttons
      .filter((node) => node.props.accessibilityLabel === 'Next month')
      .every(
        (node) =>
          node.props.disabled || node.props.accessibilityState?.disabled,
      ),
  ).toBe(true);
});
test('MonthPager on iOS is a content row, never a bottom toolbar the tab bar would cover', () => {
  const os = RN.Platform.OS;
  RN.Platform.OS = 'ios';
  const r = render(
    <MonthPager
      month="November 2026"
      previous={{ label: 'October', onPress: noop }}
      next={null}
    />,
  );
  expect(r.root.findAll((node) => node.type === 'ToolbarPart')).toHaveLength(0);
  expect(
    r.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'Previous month, October',
    ).length,
  ).toBeGreaterThan(0);
  RN.Platform.OS = os;
});
test('FollowButton retains its feature logic and presents the exact follow-limit copy', async () => {
  jest.mocked(useFollows).mockReturnValue([]);
  jest
    .mocked(followWithFeedback)
    .mockResolvedValue({ status: 'limit', showMessage: false });
  const r = render(
    <FollowButton kind="bill" id="b" title="A bill" testID="follow" />,
  );
  expect(press(r, 'follow-off').props).toMatchObject({
    accessibilityRole: 'button',
    accessibilityState: { selected: false },
  });
  await act(async () => {
    await press(r, 'follow-off').props.onPress();
  });
  expect(
    r.root.findAllByType(Text).map((node) => node.props.children),
  ).toContain('You can follow up to 50. Unfollow one to add this.');
  expect(press(r, 'follow-edit-following').props.accessibilityLabel).toBe(
    'Edit Following',
  );
  expect(haptic).not.toHaveBeenCalled();
});

test.each([false, true])(
  'FollowButton selected=%s is a button, never a switch',
  (selected) => {
    jest
      .mocked(useFollows)
      .mockReturnValue(
        selected ? ([{ kind: 'bill', id: 'b', title: 'A bill' }] as never) : [],
      );
    const r = render(
      <FollowButton kind="bill" id="b" title="A bill" testID="follow" />,
    );
    const button = press(r, `follow-${selected ? 'on' : 'off'}`);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toMatchObject({ selected });
    expect(button.props.accessibilityState.checked).toBeUndefined();
    expect(button.props.accessibilityLabel).toBe(
      `${selected ? 'Following' : 'Follow'} A bill`,
    );
  },
);
test.each([false, true])(
  'PopUpButton disabled=%s blocks native selection and exposes the dimmed state',
  (disabled) => {
    const changed = jest.fn();
    const r = render(
      <PopUpButton
        disabled={disabled}
        label="Month"
        value="all"
        options={options}
        onChange={changed}
      />,
    );
    const picker = r.root.findByType(Picker);
    expect(picker.props.modifiers).toContainEqual({
      $type: 'disabled',
      disabled,
    });
    expect(picker.props.modifiers).toContainEqual(
      expect.objectContaining({
        $type: 'accessibilityLabel',
        label: 'Month, All jurisdictions, pop-up button',
      }),
    );
    act(() => picker.props.onSelectionChange('vic'));
    expect(changed).toHaveBeenCalledTimes(disabled ? 0 : 1);
  },
);
test.each([false, true])(
  'Android PopUpButton disabled=%s reaches its target',
  (disabled) => {
    const original = RN.Platform.OS;
    Object.defineProperty(RN.Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    try {
      const r = render(
        <PopUpButton
          disabled={disabled}
          label="Month"
          value="all"
          options={options}
          onChange={noop}
          testID="month"
        />,
      );
      expect(press(r, 'month').props.disabled).toBe(disabled);
      expect(press(r, 'month').props.accessibilityState.disabled).toBe(
        disabled,
      );
    } finally {
      Object.defineProperty(RN.Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  },
);
test('the AX menu row titles the choice and its pop-up spans the measured column', () => {
  size(2.143);
  const r = render(
    <SegmentedPicker
      options={options}
      value="all"
      onChange={noop}
      accessibilityLabel="Status"
      testID="status"
    />,
  );
  expect(RN.StyleSheet.flatten(r.root.findByType(Host).props.style).width).toBe(
    335,
  );
  act(() =>
    r.root
      .find(
        (node) =>
          node.props.testID === 'status' &&
          typeof node.props.onLayout === 'function',
      )
      .props.onLayout({ nativeEvent: { layout: { width: 300 } } }),
  );
  expect(RN.StyleSheet.flatten(r.root.findByType(Host).props.style).width).toBe(
    300,
  );
  // The title is drawn once, as body text; the button speaks it with the value.
  const title = r.root
    .findAllByType(Text)
    .find((node) => node.props.children === 'Status')!;
  expect(title.props.variant).toBe('body');
  expect(title.props.accessibilityElementsHidden).toBe(true);
  const picker = r.root.findByType(Picker);
  expect(picker.props.modifiers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        $type: 'menuIndicator',
        visibility: 'visible',
      }),
      expect.objectContaining({ $type: 'tint', tint: expect.anything() }),
      expect.objectContaining({ $type: 'frame', alignment: 'leading' }),
      expect.objectContaining({
        $type: 'accessibilityLabel',
        label: 'Status, All jurisdictions, pop-up button',
      }),
    ]),
  );
  expect(
    r.root.findAllByType(SwiftText).map((node) => node.props.children),
  ).toContain('All');
});

test.each([
  [1, 'beside'],
  [2.143, 'under'],
])(
  'a titled PopUpButton row at font scale %s puts the button %s its title',
  (scale, place) => {
    size(scale as number);
    const r = render(
      <PopUpButton
        row
        label="State or territory"
        value="all"
        options={options}
        onChange={noop}
        testID="state"
      />,
    );
    const title = r.root
      .findAllByType(Text)
      .find((node) => node.props.children === 'State or territory')!;
    expect(title.props.variant).toBe('body');
    const row = title.parent!.parent!;
    expect(RN.StyleSheet.flatten(row.props.style).flexDirection).toBe(
      place === 'beside' ? 'row' : 'column',
    );
    // The id sits on the button itself, so a tap by id opens the menu.
    expect(
      r.root.findAll(
        (node) =>
          node.props.testID === 'state' && typeof node.type === 'string',
      ),
    ).toHaveLength(1);
  },
);

test.each([false, true])(
  'a PopUpButton with row=%s starts its value on the text column',
  (row) => {
    size(1);
    const r = render(
      <PopUpButton
        row={row}
        label="State or territory"
        value="all"
        options={options}
        onChange={noop}
        testID="state"
      />,
    );
    const button = r.root.find(
      (node) => node.props.testID === 'state' && typeof node.type === 'string',
    );
    // Bare, the menu's own label padding is pulled back to the column;
    // in a row the value is trailing and keeps it.
    expect(RN.StyleSheet.flatten(button.props.style).marginLeft).toBe(
      row ? undefined : -popUpLabelInset,
    );
  },
);

test('the follow limit comes from the store and Edit Following is driven by its state', async () => {
  jest.replaceProperty(
    jest.requireMock('../src/features/follows/store'),
    'FOLLOW_LIMIT',
    7,
  );
  jest.mocked(useFollows).mockReturnValue([]);
  jest
    .mocked(followWithFeedback)
    .mockResolvedValueOnce({ status: 'limit', showMessage: false })
    .mockRejectedValueOnce(new Error('storage'));
  const r = render(
    <FollowButton kind="bill" id="b" title="A bill" testID="follow" />,
  );
  await act(async () => {
    await press(r, 'follow-off').props.onPress();
  });
  const message = r.root
    .findAllByType(Text)
    .find((node) => node.props.testID === 'follow-message')!;
  expect(message.props).toMatchObject({
    variant: 'footnote',
    children: 'You can follow up to 7. Unfollow one to add this.',
  });
  expect(press(r, 'follow-edit-following').props.accessibilityLabel).toBe(
    'Edit Following',
  );
  await act(async () => {
    await press(r, 'follow-off').props.onPress();
  });
  expect(
    r.root
      .findAllByType(Button)
      .filter((node) => node.props.testID === 'follow-edit-following'),
  ).toHaveLength(0);
});

function asAndroid(run: () => void | Promise<void>) {
  const original = RN.Platform.OS;
  Object.defineProperty(RN.Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  const restore = () =>
    Object.defineProperty(RN.Platform, 'OS', {
      value: original,
      configurable: true,
    });
  try {
    const done = run();
    if (done) return done.finally(restore);
  } catch (error) {
    restore();
    throw error;
  }
  restore();
}
const flat = (node: TestRenderer.ReactTestInstance) =>
  RN.StyleSheet.flatten(node.props.style) ?? {};

test('Android centred FollowButton keeps the button and its message on one centre line', () =>
  asAndroid(async () => {
    jest.mocked(useFollows).mockReturnValue([]);
    jest
      .mocked(followWithFeedback)
      .mockResolvedValue({ status: 'followed', showMessage: true });
    const r = render(
      <FollowButton
        kind="bill"
        id="b"
        title="A bill"
        testID="follow"
        centred
      />,
    );
    await act(async () => {
      await press(r, 'follow-off').props.onPress();
    });
    const button = press(r, 'follow-off');
    // The hugging button sits in a centred wrapper, not at the group's
    // leading edge where a wider message line would push it off centre.
    let wrapper = button.parent;
    while (wrapper && flat(wrapper).alignSelf !== 'center')
      wrapper = wrapper.parent;
    expect(wrapper).toBeTruthy();
    expect(flat(wrapper!)).toMatchObject({ alignItems: 'center' });
    const message = r.root.findAll(
      (node) => node.type === Text && node.props.testID === 'follow-message',
    )[0]!;
    expect(message.props.children).toBe('Changes will show on Today.');
    expect(flat(message)).toMatchObject({ textAlign: 'center' });
  }));

test("Android centred FollowButton keeps the limit's Edit Following on the centre line", () =>
  asAndroid(async () => {
    jest.mocked(useFollows).mockReturnValue([]);
    jest
      .mocked(followWithFeedback)
      .mockResolvedValueOnce({ status: 'limit', showMessage: false });
    const r = render(
      <FollowButton
        kind="bill"
        id="b"
        title="A bill"
        testID="follow"
        centred
      />,
    );
    await act(async () => {
      await press(r, 'follow-off').props.onPress();
    });
    const edit = r.root.findAll(
      (node) =>
        node.type === Button && node.props.testID === 'follow-edit-following',
    )[0]!;
    // Android buttons start-align: the group holding the message and Edit
    // Following centres its children, so the button is not at the leading edge.
    expect(flat(edit.parent!)).toMatchObject({ alignItems: 'center' });
  }));

test('iOS FollowButton ignores centred: the tree is unchanged', () => {
  const os = RN.Platform.OS;
  RN.Platform.OS = 'ios';
  try {
    const plain = render(
      <FollowButton kind="bill" id="b" title="A bill" testID="follow" />,
    ).toJSON();
    const centred = render(
      <FollowButton
        kind="bill"
        id="b"
        title="A bill"
        testID="follow"
        centred
      />,
    ).toJSON();
    expect(JSON.stringify(centred)).toBe(JSON.stringify(plain));
  } finally {
    RN.Platform.OS = os;
  }
});

test.each([
  ['code variant', { variant: 'code' as const }],
  ['oneTimeCode content', { textContentType: 'oneTimeCode' as const }],
])('Android %s field never shows the clear button', (_, props) =>
  asAndroid(() => {
    const r = render(
      <Field
        label="8-digit code"
        testID="code"
        defaultValue="1234567"
        {...props}
      />,
    );
    act(() => r.root.findByType(RN.TextInput).props.onFocus?.({}));
    expect(
      r.root.findAll((node) => node.props.testID === 'code-clear'),
    ).toHaveLength(0);
  }),
);

test('Android text field still offers its clear button while focused', () =>
  asAndroid(() => {
    const r = render(<Field label="Email" testID="email" defaultValue="a@b" />);
    act(() => r.root.findByType(RN.TextInput).props.onFocus?.({}));
    expect(
      r.root.findAll((node) => node.props.testID === 'email-clear').length,
    ).toBeGreaterThan(0);
  }));
