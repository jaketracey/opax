import { StageTimeline } from '../src/design/charts';
import { Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { act, type ReactElement } from 'react';
import {
  Dimensions,
  Text as NativeText,
  Platform,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  contrastRatio,
  listedPair,
  requiredRatio,
} from '../src/design/contrast';
import {
  ChoiceChips,
  PopUpButton,
  SegmentedPicker,
  segmentsFit,
} from '../src/design/controls';
import { light, lightHighContrast } from '../src/design/palette';
import { FaceStack, Portrait } from '../src/design/people';
import {
  Button,
  Card,
  ChoiceChip,
  EmptyState,
  IconButton,
  PartyLabel,
  SourceLine,
  StatusCapsule,
  SwitchRow,
  Tag,
  Text,
  statusTone,
} from '../src/design/primitives';
import { roleColour, textContent } from '../src/design/text';
import { symbols } from '../src/design/symbols';
import {
  accentTint,
  radii,
  statusTint,
  textStyles,
} from '../src/design/tokens';
import { SourceContent } from '../src/features/sheets/SourceSheet';
import { openSource } from '../src/navigation/external';
import { sheetPayload } from '../src/navigation/sheets';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn() },
}));

// Android's High contrast text, switched per test.
let mockHighText = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useHighTextContrast: () => mockHighText,
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => undefined),
  openOnWeb: jest.fn(async () => undefined),
}));

// Design programme pass 2B: the shared components on 2A's tokens. Each one
// is checked in its states, at AX5, under Increase Contrast and for what
// VoiceOver hears.

// Every renderer unmounts after its test, so size changes between tests
// never re-render a tree outside act().
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
afterEach(() => {
  act(() => {
    for (const renderer of mounted.splice(0)) renderer.unmount();
  });
});
// Role colours are DynamicColorIOS values in the app; tests read the light
// hex, and the high-contrast one where Increase Contrast matters.
type Dynamic = { dynamic: { light: string; highContrastLight: string } };
const hex = (colour: unknown): string | null =>
  typeof colour === 'string'
    ? colour
    : colour && typeof colour === 'object' && 'dynamic' in colour
      ? (colour as Dynamic).dynamic.light
      : null;
const strongHex = (colour: unknown): string | null =>
  colour && typeof colour === 'object' && 'dynamic' in colour
    ? (colour as Dynamic).dynamic.highContrastLight
    : hex(colour);
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
const host = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const nativeTexts = (root: ReactTestInstance) => root.findAllByType(NativeText);
const strings = (root: ReactTestInstance) =>
  nativeTexts(root)
    .map((node) => [node.props.children].flat(3))
    .flat()
    .filter((child): child is string => typeof child === 'string' && !!child);
/** The pressable's resolved style in one pressed state. */
const pressedStyle = (node: ReactTestInstance, pressed: boolean) =>
  flat(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed, hovered: false })
      : node.props.style,
  );
const atSize = (fontScale: number, run: () => void) => {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  act(() => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 3, fontScale },
      screen: { width: 390, height: 844, scale: 3, fontScale },
    });
  });
  try {
    run();
  } finally {
    act(() => {
      Dimensions.set({ window, screen });
    });
  }
};
const AX5 = 3.571;
// Jest's window defaults to fontScale 2, an accessibility size: run at the
// standard size (Large) unless a test says otherwise.
const jestWindow = Dimensions.get('window');
const jestScreen = Dimensions.get('screen');
beforeAll(() =>
  Dimensions.set({
    window: { ...jestWindow, width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { ...jestScreen, width: 390, height: 844, scale: 3, fontScale: 1 },
  }),
);
afterAll(() => Dimensions.set({ window: jestWindow, screen: jestScreen }));
const noop = () => undefined;

describe('Portrait', () => {
  test.each([undefined, '', '   '])(
    'a nameless 28pt portrait draws a decorative person symbol (%p)',
    (name) => {
      const root = render(<Portrait size={28} name={name} />).root;
      expect(nativeTexts(root)).toHaveLength(0);
      const symbol = root.findByType(SymbolView);
      expect(symbol.props.name).toBe(symbols.person);
      expect(symbol.props.size).toBe(28 / 2);
      expect(hex(symbol.props.tintColor)).toBe(light.inkSoft);
      expect(symbol.props.accessible).toBe(false);
      expect(symbol.props.accessibilityElementsHidden).toBe(true);
    },
  );
  test.each([28, 44, 56, 72, 80, 96] as const)(
    'a named %spt portrait with no image is a blank circle, never initials',
    (size) => {
      atSize(AX5, () => {
        const root = render(<Portrait size={size} name="Zali Steggall" />).root;
        expect(nativeTexts(root)).toHaveLength(0);
        expect(root.findAllByType(SymbolView)).toHaveLength(0);
        const circle = root.findAllByType(View)[0]!;
        const style = flat(circle.props.style);
        // The circle keeps its size, so the row's layout does not move.
        expect(style.width).toBe(size);
        expect(style.height).toBe(size);
        expect(style.borderRadius).toBe(size / 2);
        expect(circle.props.accessibilityElementsHidden).toBe(true);
        expect(circle.props.importantForAccessibility).toBe(
          'no-hide-descendants',
        );
      });
    },
  );
  test('no portrait or face stack draws the hollow-circle text character', () => {
    for (const size of [28, 44, 56, 72, 80, 96] as const) {
      for (const name of [undefined, 'Zali Steggall']) {
        const root = render(<Portrait size={size} name={name} />).root;
        expect(strings(root).join('')).not.toContain('○');
      }
    }
    const stack = render(<FaceStack portraits={[null, null]} />).root;
    expect(nativeTexts(stack)).toHaveLength(0);
    expect(stack.findAllByType(SymbolView)).toHaveLength(2);
  });
});

describe('StatusCapsule', () => {
  test.each([
    ['Passed', 'neutral'],
    ['Assented', 'neutral'],
    ['Agreed to', 'neutral'],
    ['Voted for', 'neutral'],
    ['Before parliament', 'active'],
    ['Introduced', 'active'],
    ['Second reading', 'active'],
    ['Exposure draft', 'active'],
    ['Lapsed', 'neutral'],
    ['Negatived', 'neutral'],
    ['Not passed', 'neutral'],
    ['Not agreed to', 'neutral'],
    ['Voted against', 'neutral'],
    ['Withdrawn', 'neutral'],
    ['Outcome not recorded', 'neutral'],
  ] as const)('"%s" reads as %s', (word, tone) => {
    expect(statusTone(word)).toBe(tone);
  });
  test('a word on its tone: 4-radius wash, the label role, said as the word', () => {
    const root = render(<StatusCapsule status="Passed" testID="s" />).root;
    const box = host(root, 's');
    expect(box.props.accessible).toBe(true);
    expect(box.props.accessibilityLabel).toBe('Status: Passed');
    const style = flat(box.props.style);
    expect(style.borderRadius).toBe(radii.capsule);
    expect(hex(style.backgroundColor)).toBe(light.sunken);
    const text = nativeTexts(root)[0]!;
    const textStyle = flat(text.props.style);
    expect(textStyle.fontSize).toBe(textStyles.capsule.fontSize);
    expect(hex(textStyle.color)).toBe(light.inkSoft);
    expect(strings(root)).toEqual(['Passed']);
  });
  test('inside a row that says it, it is drawn only', () => {
    const box = host(
      render(<StatusCapsule status="Lapsed" hidden testID="s" />).root,
      's',
    );
    expect(box.props.accessible).toBe(false);
    expect(box.props.accessibilityElementsHidden).toBe(true);
  });
  test('every drawn status is a listed text pair, and 7:1 under Increase Contrast', () => {
    for (const status of [
      'Before parliament',
      'Exposure draft',
      'Passed',
      'Lapsed',
    ]) {
      const root = render(<StatusCapsule status={status} testID="s" />).root;
      const colour = flat(nativeTexts(root)[0]!.props.style).color;
      const background = hex(
        flat(host(root, 's').props.style).backgroundColor,
      )!;
      expect(listedPair(hex(colour)!, background, 'text')).toBeTruthy();
      expect(contrastRatio(hex(colour)!, background)).toBeGreaterThanOrEqual(
        requiredRatio.text,
      );
      expect(
        contrastRatio(strongHex(colour)!, background),
      ).toBeGreaterThanOrEqual(7);
    }
  });
  test('hugs its word, and takes the full width (word-safe) at AX5', () => {
    const style = (fontScale: number) => {
      let s: Record<string, unknown> = {};
      atSize(fontScale, () => {
        const root = render(
          <StatusCapsule status="Before parliament" testID="s" />,
        ).root;
        s = flat(host(root, 's').props.style);
        expect(nativeTexts(root)[0]!.props.dynamicTypeRamp).toBe(
          textStyles.capsule.dynamicTypeRamp,
        );
      });
      return s;
    };
    expect(style(1).alignSelf).toBe('flex-start');
    expect(style(AX5).alignSelf).toBe('stretch');
  });
});

describe('Tag', () => {
  test('a plain topic is its 28pt face, said with its kind', () => {
    const root = render(<Tag label="Housing" testID="t" />).root;
    const tag = host(root, 't');
    expect(tag.props.accessibilityLabel).toBe('Topic: Housing');
    expect(flat(tag.props.style).minHeight).toBeUndefined();
    const face = root.find(
      (n) => typeof n.type === 'string' && flat(n.props.style).minHeight === 28,
    );
    expect(flat(face.props.style).borderRadius).toBe(radii.capsule);
    expect(hex(flat(face.props.style).backgroundColor)).toBe(light.navyWash);
    expect(hex(flat(nativeTexts(root)[0]!.props.style).color)).toBe(light.ink);
    // No decorative hash: the label alone.
    expect(strings(root)).toEqual(['Housing']);
  });
  test('a linked tag is a 44pt link; pressed uses a surface highlight without an underline', () => {
    const root = render(<Tag label="Housing" onPress={noop} testID="t" />).root;
    const link = root.find(
      (n) => n.props.testID === 't' && typeof n.props.children === 'function',
    );
    expect(link.props.accessibilityRole).toBe('link');
    expect(flat(link.props.style).minHeight).toBe(44);
    const pressed = render(link.props.children({ pressed: true })).root;
    const face = pressed.find(
      (n) => typeof n.type === 'string' && flat(n.props.style).minHeight === 28,
    );
    expect(hex(flat(face.props.style).backgroundColor)).toBe(light.sunken);
    expect(flat(face.props.style).borderWidth).toBeUndefined();
    expect(flat(nativeTexts(pressed)[0]!.props.style).textDecorationLine).toBe(
      undefined,
    );
  });
});

describe('PartyLabel', () => {
  test('a dot beside the full name, the label role in ink-soft, no fill', () => {
    const root = render(
      <PartyLabel party="Labor" status="current" testID="p" />,
    ).root;
    const label = host(root, 'p');
    expect(label.props.accessibilityLabel).toBe('Labor');
    expect(label.props.accessibilityRole).toBe('link');
    expect(flat(label.props.style).backgroundColor).toBeUndefined();
    expect(flat(label.props.style).minHeight).toBe(44);
    const dot = root.find(
      (n) =>
        typeof n.type === 'string' &&
        flat(n.props.style).width === 10 &&
        flat(n.props.style).borderRadius === 5,
    );
    expect(flat(dot.props.style).backgroundColor).toBe('#B02E33');
    const text = nativeTexts(root)[0]!;
    expect(flat(text.props.style).fontSize).toBe(textStyles.secondary.fontSize);
    expect(hex(flat(text.props.style).color)).toBe(light.inkSoft);
    expect(strings(root)).toEqual(['Labor']);
  });
  test('dense shows the short label and says the full name; status is not the label’s', () => {
    // TestFlight build 32: "Formerly" only for a change of party. A former
    // member's label is the party they sat for; their row says they left.
    const root = render(
      <PartyLabel party="Liberal" status="former" dense testID="p" />,
    ).root;
    expect(strings(root)).toEqual(['LIB']);
    expect(host(root, 'p').props.accessibilityLabel).toBe('Liberal');
  });
  test('party colour is never drawn without its name; an unrecorded party has no dot', () => {
    for (const party of [
      'Labor',
      'Greens',
      'Independent',
      'Katter’s Australian Party',
    ]) {
      const root = render(<PartyLabel party={party} status="unknown" />).root;
      expect(strings(root).join('')).not.toBe('');
    }
    const none = render(<PartyLabel party={null} status="unknown" />).root;
    expect(strings(none)).toEqual(['Party not recorded']);
    expect(
      none.findAll(
        (n) => typeof n.type === 'string' && flat(n.props.style).width === 10,
      ),
    ).toHaveLength(0);
  });
  test('nested in a row it is drawn only, never a link of its own', () => {
    const root = render(
      <PartyLabel party="Labor" status="current" nested testID="p" />,
    ).root;
    const label = host(root, 'p');
    expect(label.props.accessible).toBe(false);
    expect(label.props.accessibilityRole).toBeUndefined();
  });
  test('on a navy header: onNavySoft text and a ringed dot', () => {
    const root = render(
      <PartyLabel party="Liberal" status="unknown" onDeep nested />,
    ).root;
    expect(hex(flat(nativeTexts(root)[0]!.props.style).color)).toBe(
      light.onNavySoft,
    );
    const dot = root.find(
      (n) => typeof n.type === 'string' && flat(n.props.style).width === 10,
    );
    expect(flat(dot.props.style).borderWidth).toBe(1.5);
  });
});

describe('ChoiceChip on Android', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });
  const chip = (props: Partial<Parameters<typeof ChoiceChip>[0]> = {}) =>
    render(
      <ChoiceChip
        label="Contracts"
        selected={false}
        onPress={noop}
        position="2 of 4"
        testID="c"
        {...props}
      />,
    ).root;
  const pressable = (root: ReactTestInstance) =>
    root.find(
      (n) => n.props.testID === 'c' && typeof n.props.style === 'function',
    );
  test('a Material filter chip has a checked state and a 48dp target', () => {
    const node = pressable(chip());
    expect(node.props.accessibilityState).toEqual({
      selected: false,
      checked: false,
      disabled: false,
    });
    expect(node.props.accessibilityValue).toEqual({ text: '2 of 4' });
    const style = pressedStyle(node, false);
    expect(style.borderRadius).toBe(8);
    expect(style.minHeight).toBe(48);
    expect(node.props.hitSlop).toBe(Platform.OS === 'android' ? 6 : 4);
  });
  test('rest, pressed, selected and disabled are opaque listed pairs', () => {
    const cases = [
      [{}, false, null, 'navy'],
      [{}, true, null, 'navy'],
      [{ selected: true }, false, 'navyWash', 'navy'],
      [{ selected: true }, true, 'navyWash', 'navy'],
      [{ disabled: true }, false, 'sunken', 'inkSoft'],
    ] as const;
    for (const [props, pressed, fill, ink] of cases) {
      const root = chip(props);
      expect(hex(pressedStyle(pressable(root), pressed).backgroundColor)).toBe(
        fill ? light[fill] : 'transparent',
      );
      const colour = hex(flat(nativeTexts(root)[0]!.props.style).color)!;
      expect(colour).toBe(light[ink]);
      expect(listedPair(colour, light[fill ?? 'paper'], 'text')).toBeTruthy();
    }
  });
  test('at AX5 it takes the full width with Material chip corners, word-safe', () => {
    atSize(AX5, () => {
      const root = chip();
      const style = pressedStyle(pressable(root), false);
      expect(style.alignSelf).toBe('stretch');
      expect(style.borderRadius).toBe(8);
    });
  });
});

describe('compact iOS choices', () => {
  const segments = Array.from({ length: 9 }, (_, i) => ({
    value: String(i),
    label: `Choice ${i}`,
    testID: `choice-${i}`,
  }));
  test.each([2, 3, 4, 5, 9])(
    '%s peers select through one native control',
    (count) => {
      const changed = jest.fn();
      const root = render(
        <ChoiceChips
          segments={segments.slice(0, count)}
          value="0"
          onChange={changed}
          accessibilityLabel="State or territory"
          testID="choices"
        />,
      ).root;
      expect(root.findAllByType(ChoiceChip)).toHaveLength(0);
      expect(
        root.findAllByType(count <= 4 ? SegmentedPicker : PopUpButton),
      ).toHaveLength(1);
      const picker = root.findByType(Picker);
      expect(picker.props.selection).toBe('0');
      expect(picker.props.modifiers).toContainEqual(
        expect.objectContaining({
          $type: 'pickerStyle',
          style: count <= 4 ? 'segmented' : 'menu',
        }),
      );
      const options = root
        .findAllByType(SwiftText)
        .filter((node) =>
          node.props.modifiers?.some(
            (modifier: { $type: string }) => modifier.$type === 'tag',
          ),
        );
      expect(options).toHaveLength(count);
      for (let i = 0; i < count; i++)
        expect(options[i].props.modifiers).toContainEqual(
          expect.objectContaining({
            $type: 'accessibilityIdentifier',
            identifier: `choice-${i}`,
          }),
        );
      act(() => picker.props.onSelectionChange('1'));
      expect(changed).toHaveBeenCalledWith('1');
    },
  );
  // Captures on a 402 pt iPhone: a 370 pt column inside 16 pt margins.
  test.each([
    // money-23: two of four segments truncated.
    [
      [
        'All leads',
        'Contracts by agency',
        'Party funding',
        'Companies in both',
      ],
      370,
      1,
      false,
    ],
    // money-16: "Contract va..." truncated.
    [['Contract value', 'Contracts', 'Suppliers', 'Name'], 370, 1, false],
    // money-14 and money-18 drew in full.
    [['Published awards', 'Invitations', 'Earlier grants'], 370, 1, true],
    [['Value over time', 'Suppliers', 'Contracts'], 370, 1, true],
    [['All', 'Then', 'Now'], 343, 1, true],
    [['All records', 'Speeches only'], 343, 1, true],
    // The chamber filter sheet: the House needs more than a third.
    [['All chambers', 'House of Representatives', 'Senate'], 370, 1, false],
    // Larger text needs more room; smaller text counts as the default.
    [['Published awards', 'Invitations', 'Earlier grants'], 370, 1.235, false],
    [['Contract value', 'Contracts', 'Suppliers', 'Name'], 370, 0.8, false],
    // A wider column (iPad) fits what a phone cannot.
    [['Contract value', 'Contracts', 'Suppliers', 'Name'], 640, 1, true],
    // Only two to four peers are ever segments.
    [['All'], 370, 1, false],
    [['A', 'B', 'C', 'D', 'E'], 370, 1, false],
    [['A', 'B'], 0, 1, false],
  ])('segmentsFit(%j, %s, %s) is %s', (labels, width, scale, fits) => {
    expect(
      segmentsFit(labels as string[], width as number, scale as number),
    ).toBe(fits);
  });
  test('labels that would truncate fall back to the pop-up, and the measured width decides', () => {
    atSize(1, () => {
      const changed = jest.fn();
      const root = render(
        <ChoiceChips
          segments={[
            { value: 'total', label: 'Contract value', testID: 'sort-total' },
            { value: 'count', label: 'Contracts', testID: 'sort-count' },
            { value: 'suppliers', label: 'Suppliers' },
            { value: 'name', label: 'Name' },
          ]}
          value="total"
          onChange={changed}
        />,
      ).root;
      expect(root.findAllByType(SegmentedPicker)).toHaveLength(0);
      const popUp = root.findByType(PopUpButton);
      // Unnamed choices draw the button alone; its id is the current option's.
      expect(popUp.props.row).toBe(false);
      expect(popUp.props.testID).toBe('sort-total');
      act(() => root.findByType(Picker).props.onSelectionChange('name'));
      expect(changed).toHaveBeenCalledWith('name');
      // An iPad column has room for every segment.
      act(() =>
        root
          .find((node) => typeof node.props.onLayout === 'function')
          .props.onLayout({ nativeEvent: { layout: { width: 640 } } }),
      );
      expect(root.findAllByType(SegmentedPicker)).toHaveLength(1);
      expect(root.findAllByType(PopUpButton)).toHaveLength(0);
      // Segment labels keep UIKit's own segmented size: no font override.
      for (const node of [
        root.findByType(Picker),
        ...root.findAllByType(SwiftText),
      ])
        expect(node.props.modifiers ?? []).not.toContainEqual(
          expect.objectContaining({ $type: 'font' }),
        );
    });
  });
  test('a named choice that cannot fit becomes a titled pop-up row', () => {
    atSize(1, () => {
      const root = render(
        <ChoiceChips
          segments={[
            { value: 'all', label: 'All chambers' },
            { value: 'house', label: 'House of Representatives' },
            { value: 'senate', label: 'Senate' },
          ]}
          value="all"
          onChange={noop}
          accessibilityLabel="Chamber"
          testID="chamber"
        />,
      ).root;
      const popUp = root.findByType(PopUpButton);
      expect(popUp.props).toMatchObject({
        row: true,
        label: 'Chamber',
        testID: 'chamber',
      });
    });
  });
  test('accessibility sizes replace segments with a single menu row', () => {
    atSize(AX5, () => {
      const root = render(
        <ChoiceChips
          segments={segments.slice(0, 4)}
          value="0"
          onChange={noop}
        />,
      ).root;
      expect(root.findByType(Picker).props.modifiers).toContainEqual(
        expect.objectContaining({ $type: 'pickerStyle', style: 'menu' }),
      );
      expect(root.findAllByType(ChoiceChip)).toHaveLength(0);
    });
  });
  test('Android keeps selectable chips and their identifiers', () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    try {
      const changed = jest.fn();
      const root = render(
        <ChoiceChips
          segments={segments.slice(0, 3)}
          value="0"
          onChange={changed}
        />,
      ).root;
      expect(root.findAllByType(ChoiceChip)).toHaveLength(3);
      act(() => root.findAllByType(ChoiceChip)[1].props.onPress());
      expect(changed).toHaveBeenCalledWith('1');
    } finally {
      Platform.OS = originalOS;
    }
  });
});

describe('SourceLine and SourceSheet', () => {
  beforeEach(() => jest.mocked(openSource).mockClear());
  test('date and source name, the name in the link colour; said as drawn', () => {
    const root = render(
      <SourceLine
        asOf="2026-10-04"
        citation="AEC annual returns"
        testID="src"
      />,
    ).root;
    const line = root.find(
      (n) => n.props.testID === 'src' && typeof n.props.style === 'function',
    );
    expect(line.props.accessibilityRole).toBe('button');
    expect(line.props.accessibilityLabel).toBe(
      'Updated 4 Oct 2026, AEC annual returns',
    );
    expect(line.props.accessibilityHint).toBe('Opens the sources');
    const [outer, name] = nativeTexts(root);
    expect(outer!.props.children[0]).toBe('Updated 4 Oct 2026 · ');
    expect(name!.props.children).toBe('AEC annual returns');
    expect(hex(flat(name!.props.style).color)).toBe(light.navy);
    expect(hex(flat(outer!.props.style).color)).toBe(light.inkSoft);
    // 32pt drawn, 44pt to touch.
    expect(pressedStyle(line, false).minHeight).toBe(
      Platform.OS === 'android' ? 48 : 44,
    );
    expect(line.props.hitSlop).toEqual({ top: 6, bottom: 6 });
    expect(hex(pressedStyle(line, true).backgroundColor)).toBe(light.sunken);
  });
  test('several sources, coverage and a saved copy, in one line', () => {
    const root = render(
      <SourceLine
        asOf="2026-10-03"
        citation={['They Vote For You', 'APH', 'ParlInfo']}
        coverage="Divisions to 25 Sep 2026"
        savedAt="2026-10-05"
        testID="src"
      />,
    ).root;
    expect(textContent(nativeTexts(root)[0]!.props.children)).toBe(
      'Saved 5 Oct 2026 · They Vote For You and\u00a02\u00a0more · Divisions to 25 Sep 2026',
    );
  });
  test('an undated block says so: every figure stays dated', () => {
    const root = render(<SourceLine citation="AusTender" />).root;
    expect(textContent(nativeTexts(root)[0]!.props.children)).toBe(
      'Date not published · AusTender',
    );
  });
  test('the sheet: originals, as at, sources, notes, and the licence row to Sources and licences', () => {
    const renderer = render(
      <SourceLine
        asOf="2026-10-04"
        citation={['AEC annual returns', 'AusTender']}
        originals={[
          {
            label: 'AEC Transparency Register',
            url: 'https://transparency.aec.gov.au/',
            record: 'return 2024-25',
          },
          { label: 'Duplicate', url: 'https://transparency.aec.gov.au/' },
          { label: 'Not a source', url: 'http://example.com' },
        ]}
        notes={['Party disclosures, not this person’s finances.', null]}
        licence="CC BY 4.0"
        testID="src"
      />,
    );
    const line = renderer.root.find(
      (n) => n.props.testID === 'src' && typeof n.props.onPress === 'function',
    );
    act(() => line.props.onPress());
    const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    };
    const payload = sheetPayload(params.key, 'source')!;
    const sheet = render(
      <SourceContent details={payload.details} testID="src-sheet" />,
    ).root;
    const said = strings(sheet);
    expect(said).toEqual(
      expect.arrayContaining([
        'As at 4 October 2026',
        'AEC Transparency Register',
        'return 2024-25',
        'Notes',
        'Party disclosures, not this person’s finances.',
        'Sources and licences',
        'Report a correction',
      ]),
    );
    expect(said).not.toContain('Duplicate');
    expect(said).not.toContain('Not a source');
    const original = sheet.find(
      (node) =>
        node.props.testID === 'src-sheet-original-0' &&
        typeof node.props.onPress === 'function',
    );
    act(() => original.props.onPress());
    expect(openSource).toHaveBeenCalledWith(
      'https://transparency.aec.gov.au/',
      'AEC Transparency Register',
    );
  });
  test('at AX5 the line takes the full width, word-safe', () => {
    atSize(AX5, () => {
      const root = render(
        <SourceLine
          asOf="2026-10-04"
          citation="AEC annual returns"
          testID="src"
        />,
      ).root;
      const line = root.find(
        (n) => n.props.testID === 'src' && typeof n.props.style === 'function',
      );
      expect(pressedStyle(line, false)).toMatchObject({
        alignSelf: 'stretch',
        width: '100%',
      });
      expect(nativeTexts(root)[0]!.props.onTextLayout).toEqual(
        expect.any(Function),
      );
    });
  });
});

describe('Card', () => {
  test('continuous container corners, raised, no outline or shadow; pressed is sunken', () => {
    const root = render(
      <Card onPress={noop} accessibilityLabel="Open the report" testID="card">
        <Text>Gambling</Text>
      </Card>,
    ).root;
    const card = root.find(
      (n) => n.props.testID === 'card' && typeof n.props.style === 'function',
    );
    const rest = pressedStyle(card, false);
    expect(rest).toMatchObject({
      borderRadius: radii.container,
      borderCurve: 'continuous',
      padding: 20,
    });
    expect(hex(rest.backgroundColor)).toBe(light.raised);
    expect(rest.borderColor).toBeUndefined();
    expect(rest.borderWidth).toBeUndefined();
    for (const key of ['shadowColor', 'shadowOpacity', 'elevation'])
      expect(rest[key]).toBeUndefined();
    expect(hex(pressedStyle(card, true).backgroundColor)).toBe(light.sunken);
    expect(card.props.accessibilityRole).toBe('button');
  });
  test('cards never nest', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(noop);
    render(
      <Card>
        <Card>
          <Text>Inner</Text>
        </Card>
      </Card>,
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Cards never nest'),
    );
    error.mockRestore();
  });
});

describe('Button as a toggle (Follow)', () => {
  const toggle = (on: boolean, disabled = false) =>
    render(
      <Button
        on={on}
        label={on ? 'Following' : 'Follow'}
        icon={on ? 'checkmark' : 'plus'}
        accessibilityLabel="Follow Grayndler"
        size="compact"
        disabled={disabled}
        onPress={noop}
        testID="f"
      />,
    ).root;
  const pressable = (root: ReactTestInstance) =>
    root.find(
      (n) => n.props.testID === 'f' && typeof n.props.style === 'function',
    );
  test('a switch with its state, a pill, navy while on', () => {
    const off = pressable(toggle(false));
    expect(off.props.accessibilityRole).toBe('switch');
    expect(off.props.accessibilityLabel).toBe('Follow Grayndler');
    expect(off.props.accessibilityState).toMatchObject({ checked: false });
    expect(pressedStyle(off, false).borderRadius).toBe(radii.capsule);
    expect(hex(pressedStyle(off, false).backgroundColor)).toBe(light.navyWash);
    const onRoot = toggle(true);
    const on = pressable(onRoot);
    expect(on.props.accessibilityState).toMatchObject({ checked: true });
    expect(hex(pressedStyle(on, false).backgroundColor)).toBe(light.navy);
    expect(hex(pressedStyle(on, true).backgroundColor)).toBe(light.navyRaised);
    expect(listedPair(light.onNavy, light.navyRaised, 'text')).toBeTruthy();
    expect(pressedStyle(on, false).minHeight).toBe(44);
  });
  test('the on state is drawn by its symbol and word, not colour alone', () => {
    const root = toggle(true);
    const children = pressable(root).props.children({ pressed: false });
    const drawn = render(<>{children}</>).root;
    expect(strings(drawn)).toEqual(['Following']);
    expect(drawn.findAllByType(SymbolView)[0]!.props.name).toBe('checkmark');
  });
  test('at AX5 it takes the full width with 12pt corners', () => {
    atSize(AX5, () => {
      const style = pressedStyle(pressable(toggle(false)), false);
      expect(style.alignSelf).toBe('stretch');
      expect(style.borderRadius).toBe(radii.container);
    });
  });
});

describe('IconButton', () => {
  const button = (props: Partial<Parameters<typeof IconButton>[0]> = {}) =>
    render(
      <IconButton
        symbol="ellipsis"
        accessibilityLabel="More"
        onPress={noop}
        testID="b"
        {...props}
      />,
    ).root;
  const pressable = (root: ReactTestInstance) =>
    root.find(
      (n) => n.props.testID === 'b' && typeof n.props.style === 'function',
    );
  test('a 44pt circle with a 20pt symbol and its required name', () => {
    const node = pressable(button());
    const style = pressedStyle(node, false);
    expect(style).toMatchObject({ width: 44, height: 44, borderRadius: 22 });
    expect(node.props.accessibilityLabel).toBe('More');
    expect(node.props.accessibilityShowsLargeContentViewer).toBe(true);
    const symbol = render(
      node.props.children({ pressed: false }),
    ).root.findByType(SymbolView);
    expect(symbol.props.size).toBe(20);
  });
  test('large is 56pt with a 28pt symbol (Talk)', () => {
    const node = pressable(button({ size: 'large' }));
    expect(pressedStyle(node, false)).toMatchObject({
      width: 56,
      height: 56,
      borderRadius: 28,
    });
  });
  test('the symbol keeps its size at AX5: the circle is already a target', () => {
    atSize(AX5, () => {
      const node = pressable(button());
      const symbol = render(
        node.props.children({ pressed: false }),
      ).root.findByType(SymbolView);
      expect(symbol.props.size).toBe(20);
    });
  });
  test('every variant and state is an opaque listed pair', () => {
    const cases = [
      [{ variant: 'quiet' }, false, null, 'navy'],
      [{ variant: 'default' }, false, 'navyWash', 'navy'],
      [{ variant: 'primary' }, true, 'navyRaised', 'onNavy'],
      [{ variant: 'danger' }, false, 'danger', 'onNavy'],
      [{ variant: 'danger' }, true, 'dangerPressed', 'onNavy'],
      [{ selected: true }, false, 'navy', 'onNavy'],
      [{ disabled: true, variant: 'default' }, false, 'sunken', 'inkSoft'],
    ] as const;
    for (const [props, pressed, fill, ink] of cases) {
      const node = pressable(button(props));
      const background = pressedStyle(node, pressed).backgroundColor;
      expect(background === 'transparent' ? null : hex(background)).toBe(
        fill ? light[fill] : null,
      );
      const symbol = render(node.props.children({ pressed })).root.findByType(
        SymbolView,
      );
      const colour = hex(symbol.props.tintColor)!;
      expect(colour).toBe(light[ink]);
      expect(listedPair(colour, fill ? light[fill] : light.paper)).toBeTruthy();
    }
  });
  test('selected is said; a badge keeps its size and the name says the count', () => {
    const node = pressable(
      button({
        selected: true,
        badge: 3,
        accessibilityLabel: 'Sources, 3',
      }),
    );
    expect(node.props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    const badge = render(node.props.children({ pressed: false }))
      .root.findAllByType(NativeText)
      .find((n) => n.props.children === '3')!;
    expect(badge.props.allowFontScaling).toBe(true);
  });
});

describe('SwitchRow', () => {
  test('the whole row is one switch; pressing it flips the value', () => {
    const onValueChange = jest.fn();
    const root = render(
      <SwitchRow
        label="Show former members"
        detail="Members who have left parliament"
        value={false}
        onValueChange={onValueChange}
        testID="s"
      />,
    ).root;
    const row = root.find(
      (n) => n.props.testID === 's' && typeof n.props.onPress === 'function',
    );
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityLabel).toBe(
      'Show former members, Members who have left parliament',
    );
    expect(row.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
    });
    expect(pressedStyle(row, false).minHeight).toBe(44);
    act(() => row.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith(true);
    // The native switch draws the state; it is not a second element.
    const sw = root.findByType(Switch);
    expect(hex(sw.props.trackColor.true)).toBe(light.navy);
    expect(
      root.find(
        (n) =>
          typeof n.type === 'string' && n.props.accessibilityElementsHidden,
      ),
    ).toBeTruthy();
  });
  test('at AX5 the switch drops below the word-safe label', () => {
    atSize(AX5, () => {
      const root = render(
        <SwitchRow label="Divided on" value onValueChange={noop} testID="s" />,
      ).root;
      const row = root.find(
        (n) => n.props.testID === 's' && typeof n.props.style === 'function',
      );
      expect(pressedStyle(row, false).flexDirection).toBe('column');
    });
  });
});

describe('EmptyState', () => {
  test('block: a quiet symbol and one sentence', () => {
    const root = render(
      <EmptyState message="No declared interests." testID="e" />,
    ).root;
    expect(strings(root)).toEqual(['No declared interests.']);
  });
});

describe('Increase Contrast and Android high-contrast text', () => {
  test('iOS: the new components draw role colours that step up natively', () => {
    if (Platform.OS !== 'ios') return;
    const root = render(<StatusCapsule status="Before parliament" />).root;
    const colour = flat(nativeTexts(root)[0]!.props.style).color;
    expect(strongHex(colour)).toBe(lightHighContrast.billsInk);
    expect(
      contrastRatio(lightHighContrast.billsInk!, light.billsWash),
    ).toBeGreaterThanOrEqual(7);
    const source = render(
      <SourceLine asOf="2026-10-04" citation="AEC annual returns" />,
    ).root;
    const [outer, name] = nativeTexts(source);
    expect(strongHex(flat(outer!.props.style).color)).toBe(
      lightHighContrast.inkSoft,
    );
    expect(strongHex(flat(name!.props.style).color)).toBe(
      lightHighContrast.navy ?? light.navy,
    );
  });
  test('Android: High contrast text takes the same stronger roles', () => {
    expect(roleColour('inkSoft', true)).toBe(lightHighContrast.inkSoft);
    expect(roleColour('billsInk', true)).toBe(lightHighContrast.billsInk);
    // Roles with no stronger value keep their own.
    expect(roleColour('ink', true)).toBe(light.ink);
    mockHighText = true;
    try {
      const root = render(<Text variant="secondary">Grayndler</Text>).root;
      expect(flat(nativeTexts(root)[0]!.props.style).color).toBe(
        lightHighContrast.inkSoft,
      );
    } finally {
      mockHighText = false;
    }
  });
  test('accent and status tints are roles, so they need no strengthening', () => {
    for (const tint of [accentTint('money'), statusTint('done')])
      for (const value of Object.values(tint))
        expect(
          typeof value === 'string' || 'dynamic' in (value as object),
        ).toBe(true);
    expect(hex(accentTint('people').deep)).toBe(light.navy);
    expect(hex(accentTint('people').softOnDeep)).toBe(light.onNavySoft);
    expect(hex(accentTint('money').softOnDeep)).toBe(light.onNavy);
    for (const deep of [
      'moneyInk',
      'billsInk',
      'votesInk',
      'interestsInk',
      'bronzeInk',
    ] as const)
      expect(contrastRatio(light.onNavy, light[deep])).toBeGreaterThanOrEqual(
        4.5,
      );
  });
});

test('an empty pane is a quiet centred line without a symbol or wash', () => {
  const pane = render(
    <EmptyState size="pane" message="No bill selected" testID="e" />,
  ).root;
  expect(strings(pane)).toEqual(['No bill selected']);
  const line = nativeTexts(pane)[0]!;
  expect(hex(flat(line.props.style).color)).toBe(light.inkSoft);
  expect(flat(line.props.style).textAlign).toBe('center');
  expect(
    pane.findAll(
      (n) => typeof n.type === 'string' && flat(n.props.style).width === 64,
    ),
  ).toHaveLength(0);
});

test('vertical timeline bullets centre on the first text line at Large and AX5', () => {
  for (const scale of [1, AX5])
    atSize(scale, () => {
      const root = render(
        <StageTimeline
          stages={Array.from({ length: 5 }, (_, i) => ({
            label: `Stage ${i}`,
            date: '12 Aug 2026',
          }))}
          latestIndex={4}
          dateRange={{ start: '2026-08-12', end: '2026-08-12' }}
          citation="Parliament"
        />,
      ).root;
      const stage = root
        .findAllByType(View)
        .find(
          (node) => node.props.accessibilityLabel === 'Stage 0, 12 Aug 2026',
        )!;
      const label = stage.findAllByType(Text)[0]!;
      const height = textStyles.footnote.lineHeight * scale;
      act(() =>
        label.props.onTextLayout({ nativeEvent: { lines: [{ height }] } }),
      );
      const dot = stage
        .findAllByType(View)
        .find((node) => flat(node.props.style).borderRadius === 5)!;
      const style = flat(dot.props.style);
      expect(
        (style.marginTop as number) + (style.height as number) / 2,
      ).toBeCloseTo(height / 2);
    });
});
