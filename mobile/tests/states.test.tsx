import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactElement, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Dimensions,
  Text as NativeText,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { ApiError } from '../src/api/errors';
import {
  contrastRatio,
  listedPair,
  requiredRatio,
} from '../src/design/contrast';
import { copy } from '../src/design/copy';
import { light, partyColors } from '../src/design/palette';
import {
  Button,
  Field,
  FilterChip,
  Heading,
  IconButton,
  PartyLabel,
  PersonRow,
  SegmentedControl,
  Tag,
  Text,
} from '../src/design/primitives';
import {
  Collapse,
  ContentUnavailable,
  ErrorState,
  InlineError,
  OfflineLine,
  Skeleton,
  StatePageProvider,
  errorMessage,
} from '../src/design/states';
import { symbols } from '../src/design/symbols';
import {
  LINE_HEIGHT_NUDGE,
  breaksMidWord,
  lineScale,
  nextWordSafeCap,
  textContent,
} from '../src/design/text';
import {
  controlHeight,
  minimumTarget,
  textStyles,
  type TextVariant,
} from '../src/design/tokens';
import { catalogStateNote } from '../src/features/CatalogNotice';
import { recordSourceState } from '../src/features/RecordStatus';

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer.root;
}
// Role colours are DynamicColorIOS values in the app; tests read the light hex.
function hex(colour: unknown): string | null {
  if (typeof colour === 'string')
    return colour === 'transparent' ? null : colour;
  if (colour && typeof colour === 'object' && 'dynamic' in colour)
    return (colour as { dynamic: { light: string } }).dynamic.light;
  return null;
}
// RN's Pressable is a memo component: find it by its state-driven props.
const pressables = (root: ReactTestInstance) => {
  const found = root.findAll(
    (node) =>
      typeof node.type !== 'string' &&
      typeof node.props.onPress === 'function' &&
      node.props.style !== undefined &&
      'accessibilityRole' in node.props,
  );
  // Count the native control once when a platform touch wrapper delegates to it.
  return found.filter(
    (node) =>
      !found.some((other) => {
        // Only collapse delegates of this same control. A row can also
        // contain a distinct party link, which must not replace the row.
        if (other === node || other.props.onPress !== node.props.onPress)
          return false;
        let parent = other.parent;
        while (parent) {
          if (parent === node) return true;
          parent = parent.parent;
        }
        return false;
      }),
  );
};
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

interface Drawn {
  background: string;
  texts: string[];
  icons: { foreground: string; background: string }[];
}
/**
 * What the first Pressable in `element` draws in a given pressed state: its
 * own background (or the surface beneath it) and every text and icon colour.
 */
function drawn(
  element: ReactElement,
  pressed: boolean,
  surface: string = light.paper,
  inner?: (root: ReactTestInstance) => string | null,
): Drawn {
  const root = render(element);
  const pressable = pressables(root)[0]!;
  const style =
    typeof pressable.props.style === 'function'
      ? pressable.props.style({ pressed, hovered: false })
      : pressable.props.style;
  const children: ReactNode =
    typeof pressable.props.children === 'function'
      ? pressable.props.children({ pressed, hovered: false })
      : pressable.props.children;
  const content = render(<View>{children}</View>);
  const background =
    (inner && inner(content)) ?? hex(flat(style).backgroundColor) ?? surface;
  const texts = content
    .findAllByType(NativeText)
    .map((node) => hex(flat(node.props.style).color))
    .filter((c): c is string => !!c);
  const icons = [
    ...content
      .findAll((node) => node.props.tintColor !== undefined)
      .map((node) => ({ foreground: hex(node.props.tintColor), background })),
    ...content
      .findAllByType(ActivityIndicator)
      .map((node) => ({ foreground: hex(node.props.color), background })),
    ...content
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityElementsHidden &&
          flat(node.props.style).borderWidth === 1.5 &&
          Object.values(partyColors).includes(
            hex(flat(node.props.style).backgroundColor) as never,
          ),
      )
      .map((node) => ({
        foreground: hex(flat(node.props.style).backgroundColor),
        // The party dot touches its raised ring, rather than the row fill.
        background: hex(flat(node.props.style).borderColor)!,
      })),
  ].filter(
    (pair): pair is { foreground: string; background: string } =>
      !!pair.foreground,
  );
  return { background, texts: [...new Set(texts)], icons };
}
function expectListed(result: Drawn) {
  for (const text of result.texts) {
    const entry = listedPair(text, result.background, 'text');
    expect({ text, background: result.background, listed: !!entry }).toEqual({
      text,
      background: result.background,
      listed: true,
    });
    expect(entry!.kind).not.toBe('non-text');
    expect(contrastRatio(text, result.background)).toBeGreaterThanOrEqual(
      requiredRatio.text,
    );
  }
  for (const { foreground, background } of result.icons) {
    expect(listedPair(foreground, background)).toBeTruthy();
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
      requiredRatio['non-text'],
    );
  }
}

const noop = () => undefined;
describe('every drawn state is in the contrast table and passes', () => {
  for (const variant of ['primary', 'default', 'quiet', 'danger'] as const) {
    test(`Button ${variant}: rest, pressed, disabled, loading`, () => {
      const button = (props = {}) => (
        <Button
          label="Search people"
          variant={variant}
          icon="square.and.arrow.up"
          onPress={noop}
          {...props}
        />
      );
      expectListed(drawn(button(), false));
      expectListed(drawn(button(), true));
      expectListed(drawn(button({ disabled: true }), false));
      expectListed(drawn(button({ disabled: true }), true));
      expectListed(drawn(button({ loading: true }), false));
    });
  }
  for (const variant of ['quiet', 'default'] as const)
    test(`IconButton ${variant}: rest, pressed, disabled`, () => {
      const icon = (disabled = false) => (
        <IconButton
          symbol="xmark"
          accessibilityLabel="Close"
          variant={variant}
          disabled={disabled}
          onPress={noop}
        />
      );
      expectListed(drawn(icon(), false));
      expectListed(drawn(icon(), true));
      expectListed(drawn(icon(true), false));
    });
  test('Tag: pressed keeps contrast with a rounded surface highlight', () => {
    const tagFill = (root: ReactTestInstance) =>
      hex(
        flat(
          root.findAll(
            (node) =>
              typeof node.type === 'string' &&
              flat(node.props.style).minHeight === 28,
          )[0]!.props.style,
        ).backgroundColor,
      );
    const tag = <Tag label="Housing" onPress={noop} />;
    const rest = drawn(tag, false, light.paper, tagFill);
    const pressed = drawn(tag, true, light.paper, tagFill);
    expectListed(rest);
    expectListed(pressed);
    expect(rest.background).toBe(light.navyWash);
    expect(pressed.background).toBe(light.sunken);
    const root = render(
      <View>
        {pressables(render(tag))[0]!.props.children({ pressed: true })}
      </View>,
    );
    const face = root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        flat(node.props.style).minHeight === 28,
    )[0]!;
    expect(flat(face.props.style).borderRadius).toBeGreaterThan(0);
    expect(flat(face.props.style).borderWidth).toBeUndefined();
    expect(
      root
        .findAllByType(NativeText)
        .some(
          (node) => flat(node.props.style).textDecorationLine === 'underline',
        ),
    ).toBe(false);
  });
  test('FilterChip: rest and pressed', () => {
    const chip = (
      <FilterChip filter="kind" value="Declared interests" onRemove={noop} />
    );
    expectListed(drawn(chip, false));
    expectListed(drawn(chip, true));
  });
  test('SegmentedControl: rest, pressed and selected segments', () => {
    const segmentFill = (root: ReactTestInstance) =>
      hex(
        flat(
          root.findAll(
            (node) =>
              typeof node.type === 'string' &&
              flat(node.props.style).position === 'absolute',
          )[0]?.props.style,
        ).backgroundColor,
      );
    for (const value of ['all', 'recent'] as const) {
      const control = (
        <SegmentedControl
          value={value}
          onChange={noop}
          segments={[
            { value: 'recent', label: 'Recent' },
            { value: 'all', label: 'All' },
          ]}
        />
      );
      expectListed(drawn(control, false, light.raised, segmentFill));
      expectListed(drawn(control, true, light.raised, segmentFill));
    }
  });
  test('PersonRow: rest and pressed, every party dot included', () => {
    for (const party of ['Labor', 'LNP', 'Nationals', 'One Nation', 'Greens']) {
      const row = (
        <PersonRow
          name="Anthony Albanese"
          party={party}
          partyStatus="current"
          place="Member for Grayndler · NSW"
          onPress={noop}
        />
      );
      const rest = drawn(row, false);
      const pressed = drawn(row, true);
      expect(
        rest.icons.some(
          (pair) =>
            Object.values(partyColors).includes(pair.foreground as never) &&
            pair.background === light.raised,
        ),
      ).toBe(true);
      expectListed(rest);
      expectListed(pressed);
    }
  });
  test('only follow confirmation and the cold skeleton crossfade fade; controls keep contrast', () => {
    const dir = resolve(__dirname, '../src/design');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      const values = [...source.matchAll(/\bopacity:\s*([^,}\n]+)/g)].map(
        (match) => match[1]!.trim(),
      );
      // The loading button's label is fully hidden (0), never faded.
      expect({ file, values: values.filter((v) => v !== '0') }).toEqual({
        file,
        // The follow confirmation and the shared cold skeleton are the two timed fades.
        values:
          file === 'controls.tsx'
            ? ['confirmation ? opacity : 1']
            : file === 'states.tsx'
              ? ['loading']
              : [],
      });
    }
  });
});

describe('segment touch targets', () => {
  test('every segment is at least 44pt tall and wide; the control is 48pt outside', () => {
    const root = render(
      <SegmentedControl
        value="all"
        onChange={noop}
        segments={[
          { value: 'all', label: 'All' },
          { value: 'recent', label: 'Recent' },
          { value: 'x', label: 'X' },
        ]}
      />,
    );
    const segments = pressables(root);
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      const style = flat(segment.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(minimumTarget);
      expect(style.minWidth).toBeGreaterThanOrEqual(minimumTarget);
      expect(segment.props.hitSlop).toBeUndefined();
    }
    const container = flat(
      root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          flat(node.props.style).borderWidth === 1,
      )[0]!.props.style,
    );
    const outside =
      minimumTarget +
      2 *
        ((container.paddingVertical as number) +
          (container.borderWidth as number));
    expect(outside).toBe(controlHeight.default);
    expect(container.minHeight).toBe(controlHeight.default);
  });
});

describe('party context', () => {
  const labelOf = (element: ReactElement) =>
    render(element).find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessible === true &&
        typeof node.props.accessibilityLabel === 'string',
    ).props.accessibilityLabel;
  // Every string a host Text node draws, in order (nested Text included once).
  const textOf = (element: ReactElement) =>
    render(element)
      .findAll((node) => node.type === 'Text')
      .flatMap((node) => [node.props.children].flat())
      .filter((child) => typeof child === 'string')
      .join('');
  // Fixed expectations per status: [visible, VoiceOver], full then dense.
  test.each([
    ['current', 'Labor', 'Labor', 'ALP'],
    ['unknown', 'Labor', 'Labor', 'ALP'],
    // Status is never the label's to say (TestFlight build 32).
    ['former', 'Labor', 'Labor', 'ALP'],
  ] as const)(
    'a %s party reads "%s", seen and heard',
    (status, visible, spoken, dense) => {
      const full = <PartyLabel party="Labor" status={status} />;
      expect(labelOf(full)).toBe(spoken);
      expect(textOf(full)).toBe(visible);
      const short = <PartyLabel party="Labor" status={status} dense />;
      expect(labelOf(short)).toBe(spoken);
      expect(textOf(short)).toBe(dense);
    },
  );
  test('an undated party never reads as former', () => {
    const label = <PartyLabel party="LNP" status="unknown" />;
    expect(labelOf(label)).toBe('LNP');
    expect(textOf(label)).not.toMatch(/formerly/i);
  });
  test('a changed party reads the current one, then formerly', () => {
    const label = (
      <PartyLabel party="One Nation" status="current" formerly="Nationals" />
    );
    expect(labelOf(label)).toBe('One Nation, formerly Nationals');
    expect(textOf(label)).toBe('One Nation · formerly Nationals');
    const dense = (
      <PartyLabel
        party="One Nation"
        status="current"
        formerly="Nationals"
        dense
      />
    );
    expect(labelOf(dense)).toBe('One Nation, formerly Nationals');
    expect(textOf(dense)).toBe('ONP · formerly NAT');
  });
  test('the same party under another name is not "formerly"', () => {
    expect(
      labelOf(
        <PartyLabel
          party="Labor"
          status="current"
          formerly="Australian Labor Party"
        />,
      ),
    ).toBe('Labor');
  });
  // Each person with the status the pinned data gives them.
  test.each([
    ['current', 'Anthony Albanese', 'Anthony Albanese, Labor'],
    ['unknown', 'Yasmin Catley', 'Yasmin Catley, Labor'],
    ['former', 'Julia Gillard', 'Julia Gillard, Labor, Former member'],
  ] as const)(
    'a %s person row reads "%s" in one label',
    (status, name, label) => {
      expect(
        labelOf(
          <PersonRow
            name={name}
            party="Labor"
            partyStatus={status}
            onPress={noop}
          />,
        ),
      ).toBe(label);
    },
  );
  test('the party colours used by rows are all listed', () => {
    for (const hexColour of Object.values(partyColors))
      expect(listedPair(hexColour, light.raised)).toBeTruthy();
  });
});

describe('word-safe text', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  beforeEach(() =>
    act(() =>
      Dimensions.set({
        window: { ...originalWindow, fontScale: 3.571 },
        screen: { ...originalScreen, fontScale: 3.571 },
      }),
    ),
  );
  afterEach(() =>
    act(() =>
      Dimensions.set({ window: originalWindow, screen: originalScreen }),
    ),
  );
  const sendFrame = (node: ReactTestInstance, width = 400) =>
    node.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 200 } },
    });
  // The cap scales the role's own size and line height: React Native's text
  // measure cache ignores maxFontSizeMultiplier, so that prop stays 0.
  const capScale = (node: ReactTestInstance, variant: TextVariant) => {
    const role = textStyles[variant];
    const style = StyleSheet.flatten(node.props.style);
    expect(node.props.maxFontSizeMultiplier).toBe(0);
    expect(style.lineHeight).toBeCloseTo(
      ((role.lineHeight + LINE_HEIGHT_NUDGE) * style.fontSize) / role.fontSize,
      6,
    );
    return Number(style.fontSize) / role.fontSize;
  };
  test.each([{ size: 'default', fontScale: 1, reserved: false }])(
    'the $size name retains its measured lines without a font or line cap',
    ({ fontScale, reserved }) => {
      const originalWindow = Dimensions.get('window');
      const originalScreen = Dimensions.get('screen');
      let renderer!: TestRenderer.ReactTestRenderer;
      try {
        act(() => {
          Dimensions.set({
            window: { width: 390, height: 844, scale: 3, fontScale },
            screen: { width: 390, height: 844, scale: 3, fontScale },
          });
          renderer = TestRenderer.create(
            <Text wordSafe variant="strong">
              Anthony Albanese
            </Text>,
          );
        });
        const name = () => renderer.root.findByType(NativeText);
        act(() =>
          name().props.onTextLayout({
            nativeEvent: {
              lines: [
                { text: 'Anthony ', y: 0, height: 64.334 },
                { text: 'Albanese', y: 64.334, height: 64.334 },
              ],
            },
          }),
        );
        const style = StyleSheet.flatten(name().props.style);
        if (reserved) {
          expect(style.minHeight).toBeGreaterThan(128.668);
        } else {
          expect(style.minHeight).toBeUndefined();
        }
        // The line box must not disable horizontal shrink beside an icon.
        expect(style.flexShrink).toBe(1);
        expect(name().props.children).toBe('Anthony Albanese');
        expect(name().props.maxFontSizeMultiplier).toBe(0);
        expect(name().props.numberOfLines).toBeUndefined();
        act(() =>
          renderer.update(
            <Text wordSafe variant="strong">
              Malcolm Roberts
            </Text>,
          ),
        );
        expect(
          StyleSheet.flatten(name().props.style).minHeight,
        ).toBeUndefined();
      } finally {
        act(() => {
          renderer?.unmount();
          Dimensions.set({ window: originalWindow, screen: originalScreen });
        });
      }
    },
  );
  test('a field label that changes starts again from full size', () => {
    for (const required of [false, true]) {
      let renderer!: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          <Field label="Representation" required={required} />,
        );
      });
      // The label is the first word-safe text; the input carries its own text.
      const label = () =>
        renderer.root
          .findAllByType(NativeText)
          .find((node) => typeof node.props.onTextLayout === 'function')!;
      // Lines carry the whole drawn text, the nested marker included.
      const marker = (on: boolean) => (on ? ' (required)' : '');
      act(() => {
        sendFrame(label());
        label().props.onTextLayout({
          nativeEvent: {
            lines: [
              {
                text: 'Representatio',
                height:
                  (textStyles.secondary.lineHeight + LINE_HEIGHT_NUDGE) *
                  (49 / 15),
              },
              {
                text: `n${marker(required)}`,
                height:
                  (textStyles.secondary.lineHeight + LINE_HEIGHT_NUDGE) *
                  (49 / 15),
              },
            ],
          },
        });
      });
      // 2.7 of the uncapped 3.
      expect(capScale(label(), 'secondary')).toBeCloseTo(2.94 / 3.27, 6);
      act(() => {
        renderer.update(<Field label="Name" required={required} />);
      });
      expect(capScale(label(), 'secondary')).toBe(1);
      // Changing only the required marker is a change of text too.
      act(() => {
        sendFrame(label());
        label().props.onTextLayout({
          nativeEvent: {
            lines: [
              {
                text: 'Na',
                height:
                  (textStyles.secondary.lineHeight + LINE_HEIGHT_NUDGE) *
                  (49 / 15),
              },
              {
                text: `me${marker(required)}`,
                height:
                  (textStyles.secondary.lineHeight + LINE_HEIGHT_NUDGE) *
                  (49 / 15),
              },
            ],
          },
        });
      });
      expect(capScale(label(), 'secondary')).toBeCloseTo(2.94 / 3.27, 6);
      act(() => {
        renderer.update(<Field label="Name" required={!required} />);
      });
      expect(capScale(label(), 'secondary')).toBe(1);
    }
  });
  test('reads the text of nested children', () => {
    expect(
      textContent([
        'Email address',
        <Text key="r" variant="secondary">
          {' '}
          (required)
        </Text>,
        null,
        false,
        3,
      ]),
    ).toBe('Email address (required)3');
  });
  test('detects a line that ends inside a word', () => {
    expect(
      breaksMidWord([{ text: 'Recorded representatio' }, { text: 'n' }]),
    ).toBe(true);
    expect(
      breaksMidWord([{ text: 'Recorded ' }, { text: 'representation' }]),
    ).toBe(false);
    expect(breaksMidWord([{ text: 'Hanson-' }, { text: 'Young' }])).toBe(false);
    expect(breaksMidWord([{ text: 'One line' }])).toBe(false);
    expect(breaksMidWord([{ text: 'Parliamentaria' }, { text: 'n' }])).toBe(
      true,
    );
  });
  test('steps the scale down, by default never below the reader default', () => {
    expect(lineScale(30 * 2.3, 30)).toBe(2.3);
    expect(nextWordSafeCap(30 * 2.3, 30)).toBe(2.07);
    expect(nextWordSafeCap(30 * 1.05, 30)).toBe(1);
    expect(nextWordSafeCap(30, 30)).toBeNull();
  });
  test('a heading lowers its own size after a mid-word break, and only then', () => {
    const lineHeight = textStyles.sectionTitle.lineHeight + LINE_HEIGHT_NUDGE;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Heading>Recorded representation</Heading>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    expect(capScale(text(), 'sectionTitle')).toBe(1);
    const layout = (at: number, broken = true) =>
      act(() => {
        sendFrame(text());
        text().props.onTextLayout({
          nativeEvent: {
            lines: broken
              ? [
                  {
                    text: 'Recorded representatio',
                    width: 330,
                    height: lineHeight * at,
                  },
                  { text: 'n', width: 20, height: lineHeight * at },
                ]
              : [
                  { text: 'Recorded ', width: 200, height: lineHeight * at },
                  {
                    text: 'representation',
                    width: 320,
                    height: lineHeight * at,
                  },
                ],
          },
        });
      });
    layout(2.55, false);
    expect(capScale(text(), 'sectionTitle')).toBe(1);
    layout(2.55);
    // Uncapped 2.55, capped 2.29: 90% of the role's size, which Dynamic Type
    // then multiplies by the same 2.55.
    expect(capScale(text(), 'sectionTitle')).toBeCloseTo(2.29 / 2.55, 6);
    // Each layout at the size now drawn that still breaks steps 10% lower,
    // always as a share of the same uncapped 2.55. A word still wider than
    // its column goes below the reader's default size, and stops at 11pt
    // (sectionTitle is 22pt, so half its role size; duo audit A5-1).
    for (const [at, next] of [
      [2.29, 2.06],
      [2.06, 1.85],
      [1.85, 1.67],
      [1.67, 1.5],
      [1.5, 1.35],
      [1.35, 1.22],
      [1.22, 1.1],
      [1.1, 0.99],
      [0.99, 0.89],
      [0.89, 0.8],
      [0.8, 0.72],
      [0.72, 0.65],
      [0.65, 0.59],
      [0.59, 0.53],
      [0.53, 0.5],
      [0.5, 0.5],
    ] as const) {
      layout(at);
      expect(capScale(text(), 'sectionTitle')).toBeCloseTo(next / 2.55, 6);
    }
    expect(text().props.accessibilityRole).toBe('header');
  });
  describe('word-safe resets and late layouts', () => {
    const base = textStyles.sectionTitle.lineHeight + LINE_HEIGHT_NUDGE;
    // "Representation" at heading scale: 212pt wide at the uncapped 2.55,
    // 191pt at 2.29 and 172pt at 2.06.
    const broken = (at: number, widths: [number, number]) => ({
      nativeEvent: {
        lines: [
          { text: 'Representatio', width: widths[0], height: base * at },
          { text: 'n', width: widths[1], height: base * at },
        ],
      },
    });
    const fits = (at: number, width = (212 * at) / 2.55) => ({
      nativeEvent: {
        lines: [{ text: 'Representation', width, height: base * at }],
      },
    });
    const frame = (width: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 200 } },
    });
    const setSize = (fontScale: number) =>
      Dimensions.set({
        window: { width: 390, height: 844, scale: 3, fontScale },
        screen: { width: 390, height: 844, scale: 3, fontScale },
      });
    let originalWindow: ReturnType<typeof Dimensions.get>;
    let originalScreen: ReturnType<typeof Dimensions.get>;
    let renderer: TestRenderer.ReactTestRenderer;
    beforeEach(() => {
      originalWindow = Dimensions.get('window');
      originalScreen = Dimensions.get('screen');
    });
    afterEach(() =>
      act(() => {
        renderer?.unmount();
        Dimensions.set({ window: originalWindow, screen: originalScreen });
      }),
    );
    function heading(
      fontScale = 3.571,
      variant: TextVariant = 'sectionTitle',
      children = 'Representation',
    ) {
      act(() => {
        setSize(fontScale);
        renderer = TestRenderer.create(
          <Text wordSafe variant={variant}>
            {children}
          </Text>,
        );
      });
      const text = () => renderer.root.findByType(NativeText);
      let frameWidth = 400;
      return {
        text,
        ratio: () => capScale(text(), variant),
        layout: (event: object) =>
          act(() => {
            sendFrame(text(), frameWidth);
            text().props.onTextLayout(event);
          }),
        resize: (width: number) =>
          act(() => {
            frameWidth = width;
            text().props.onLayout(frame(width));
          }),
      };
    }

    // Review round 2, probe 1.
    test('a modest wider column restores full size once the full word fits', () => {
      const { ratio, layout, resize } = heading();
      resize(200);
      layout(broken(2.55, [198, 14]));
      expect(ratio()).toBeCloseTo(2.29 / 2.55, 6);
      layout(fits(2.29, 191));
      // 200 to 220pt: 191pt at 2.29 is 212pt at 2.55, which now fits.
      resize(220);
      expect(ratio()).toBe(1);
      // The capped layout, delivered late to the full-size text, is ignored.
      layout(fits(2.29, 191));
      expect(ratio()).toBe(1);
    });
    test('a narrower column that widens again restores the larger cap', () => {
      const { ratio, layout, resize } = heading();
      resize(200);
      layout(broken(2.55, [198, 14]));
      resize(200);
      layout(fits(2.29));
      expect(ratio()).toBeCloseTo(2.29 / 2.55, 6);
      // The column narrows to 180pt and 191pt no longer fits.
      resize(180);
      layout(broken(2.29, [178, 13]));
      resize(180);
      layout(fits(2.06));
      expect(ratio()).toBeCloseTo(2.06 / 2.55, 6);
      // Back to 200pt: the same capped text's frame widens, so the column
      // did. Full size breaks there again and steps to the 200pt cap.
      resize(200);
      expect(ratio()).toBe(1);
      layout(broken(2.55, [198, 14]));
      expect(ratio()).toBeCloseTo(2.29 / 2.55, 6);
      // Repeated frames and lines at that width settle without restarting.
      for (let i = 0; i < 5; i++) {
        resize(200);
        layout(fits(2.29));
      }
      expect(ratio()).toBeCloseTo(2.29 / 2.55, 6);
    });
    test("the capped text's own narrowing never counts as a wider column", () => {
      const { ratio, layout, resize } = heading();
      resize(200);
      layout(broken(2.55, [198, 14]));
      // The capped text hugs its 191pt word: narrower than the column, and
      // never wider than the 200pt it broke in, so the cap stays.
      resize(191);
      layout(fits(2.29, 191));
      resize(191);
      expect(ratio()).toBeCloseTo(2.29 / 2.55, 6);
    });
    test("a change of role starts again with that role's own uncapped size", () => {
      const { text, layout } = heading(
        3.571,
        'sectionTitle',
        'Recorded representation',
      );
      layout({
        nativeEvent: {
          lines: [
            { text: 'Recorded representatio', width: 300, height: base * 2.55 },
            { text: 'n', width: 12, height: base * 2.55 },
          ],
        },
      });
      expect(capScale(text(), 'sectionTitle')).toBeCloseTo(2.29 / 2.55, 6);
      act(() =>
        renderer.update(
          <Text wordSafe variant="footnote">
            Recorded representation
          </Text>,
        ),
      );
      expect(capScale(text(), 'footnote')).toBe(1);
      // The fine role's ramp is 3.4 at this size: 3.06 of 3.4, not of 2.55.
      const fine = textStyles.footnote.lineHeight + LINE_HEIGHT_NUDGE;
      act(() => {
        sendFrame(text());
        text().props.onTextLayout({
          nativeEvent: {
            lines: [
              {
                text: 'Recorded representatio',
                width: 300,
                height: fine * 3.4,
              },
              { text: 'n', width: 12, height: fine * 3.4 },
            ],
          },
        });
      });
      expect(capScale(text(), 'footnote')).toBeCloseTo(3.06 / 3.4, 6);
    });
    test('a late layout from an earlier size can neither raise nor lower the cap', () => {
      const { ratio, layout } = heading();

      layout(broken(2.55, [300, 12]));

      layout(broken(2.29, [300, 12]));
      expect(ratio()).toBeCloseTo(2.06 / 2.55, 6);
      // Fabric delivers both queued layouts through current props.
      layout(broken(2.55, [300, 12]));
      layout(broken(2.29, [300, 12]));
      expect(ratio()).toBeCloseTo(2.06 / 2.55, 6);
      // A layout at another size arriving at the current callback is ignored.
      layout(broken(2.55, [300, 12]));
      layout(broken(1.3, [300, 12]));
      expect(ratio()).toBeCloseTo(2.06 / 2.55, 6);
      // A fresh layout at 2.06 still steps down as usual.
      layout(broken(2.06, [300, 12]));
      expect(ratio()).toBeCloseTo(1.85 / 2.55, 6);
    });
    // Review round 2, probe 2.
    test('after a switch to standard size a late AX5 layout cannot shrink below the role size', () => {
      const { ratio, layout } = heading();
      layout(broken(2.55, [198, 14]));
      expect(ratio()).toBeCloseTo(2.29 / 2.55, 6);

      act(() => setSize(1));
      expect(ratio()).toBe(1);
      // The queued AX5 layout, through current props.
      layout(broken(2.29, [198, 14]));
      layout(broken(2.29, [198, 14]));
      expect(ratio()).toBe(1);
      layout(fits(1, 92));
      expect(ratio()).toBe(1);
    });
    test('after a switch between large sizes the uncapped size comes only from a fresh layout', () => {
      const { ratio, layout } = heading();
      layout(broken(2.55, [198, 14]));

      // To a smaller accessibility size, where the heading's ramp is 2.0.
      act(() => setSize(2.643));
      expect(ratio()).toBe(1);
      // The queued AX5 layout cannot set this size's uncapped value.
      layout(broken(2.29, [198, 14]));
      expect(ratio()).toBe(1);
      layout(broken(2.0, [198, 14]));
      expect(ratio()).toBeCloseTo(1.8 / 2.0, 6);
    });
  });
});

describe('shared state kit', () => {
  let mounted: TestRenderer.ReactTestRenderer[];
  const window = Dimensions.get('window'),
    screen = Dimensions.get('screen');
  function mount(element: ReactElement) {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(element);
    });
    mounted.push(r);
    return r;
  }
  beforeEach(() => {
    mounted = [];
    jest.clearAllMocks();
  });
  afterEach(() => {
    act(() => {
      mounted.forEach((r) => r.unmount());
      Dimensions.set({ window, screen });
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  test.each([
    'rows',
    'people',
    'bills',
    'divisions',
    'card',
    'figure',
    'text',
  ] as const)(
    'Skeleton %s keeps the requested final count and announces only its name',
    (shape) => {
      const r = mount(
        <Skeleton shape={shape} count={3} label="Loading new bills" />,
      );
      const progress = r.root.findAll(
        (node) =>
          typeof node.type !== 'string' &&
          node.props.accessibilityRole === 'progressbar',
      );
      expect(progress).toHaveLength(1);
      expect(progress[0]!.props.accessibilityLabel).toBe('Loading new bills');
      expect(progress[0]!.props.accessibilityState.busy).toBe(true);
      expect(r.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    },
  );
  test('several failures announce once per page/load without moving focus', () => {
    jest.useFakeTimers();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(noop);
    const focus = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(noop);
    const page = (refreshing = false) => (
      <StatePageProvider refreshing={refreshing}>
        <InlineError subject="Bills" onRetry={noop} testID="bills-error" />
        <InlineError subject="Votes" />
        <InlineError subject="Declarations" />
      </StatePageProvider>
    );
    const r = mount(page());
    act(() => jest.runOnlyPendingTimers());
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(copy.someSectionsFailed);
    expect(focus).not.toHaveBeenCalled();
    const error = r.root.findAllByType(InlineError)[0]!.findByType(View);
    const style = StyleSheet.flatten(error.props.style);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(
      r.root.findAllByType(Text).map((node) => node.props.children),
    ).toContain("Bills couldn't be loaded.");
    act(() => r.update(page(true)));
    act(() => jest.runOnlyPendingTimers());
    expect(announce).toHaveBeenCalledTimes(1);
    act(() => r.update(page(false)));
    act(() => jest.runOnlyPendingTimers());
    expect(announce).toHaveBeenCalledTimes(2);
  });
  test('ErrorState alerts and focuses changed messages; InlineError only announces the page', () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(noop);
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(noop);
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <ErrorState
          message="Enter a valid email address. Try again."
          onRetry={noop}
        />,
        { createNodeMock: () => ({}) },
      );
    });
    mounted.push(r);
    expect(
      r.root.findAll((node) => node.props.accessibilityRole === 'alert').length,
    ).toBeGreaterThan(0);
    expect(
      r.root.findAllByType(Text).map((node) => node.props.children),
    ).toContain('Enter a valid email address.');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0]![1]).toBe('focus');
    act(() => r.update(<ErrorState message="The code has expired." />));
    expect(focus).toHaveBeenCalledTimes(2);
    expect(announce).not.toHaveBeenCalled();
    const inline = mount(
      <InlineError subject="Bills" required onRetry={noop} />,
    );
    expect(
      inline.root.findAll((node) => node.props.accessibilityRole === 'alert'),
    ).toHaveLength(0);
    expect(focus).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith(copy.someSectionsFailed);
    const outer = inline.root.findByType(View);
    expect(StyleSheet.flatten(outer.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    });
    expect(inline.root.findByType(Button).props.variant).toBe('plain');
  });
  test('separate pages announce independently', () => {
    jest.useFakeTimers();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(noop);
    mount(
      <>
        <StatePageProvider>
          <InlineError subject="Bills" />
        </StatePageProvider>
        <StatePageProvider>
          <InlineError subject="Votes" />
        </StatePageProvider>
      </>,
    );
    act(() => jest.runOnlyPendingTimers());
    expect(announce).toHaveBeenCalledTimes(2);
  });
  test('one offline sentence per page, with a new owner when the first line leaves', () => {
    const page = (first: boolean) => (
      <StatePageProvider>
        {first ? (
          <OfflineLine
            key="first"
            savedAt="2026-11-07"
            testID="first-offline"
          />
        ) : null}
        <OfflineLine
          key="second"
          savedAt="2026-11-07"
          testID="second-offline"
        />
      </StatePageProvider>
    );
    const r = mount(page(true));
    const sentences = () =>
      r.root
        .findAllByType(Text)
        .filter((node) => node.props.children === copy.offline('2026-11-07'));
    expect(sentences()).toHaveLength(1);
    act(() => r.update(page(false)));
    expect(sentences()).toHaveLength(1);
    expect(
      r.root
        .findAllByType(View)
        .filter((node) => node.props.testID === 'first-offline'),
    ).toHaveLength(0);
  });
  test('an undated offline line does not invent a saved date', () => {
    const r = mount(<OfflineLine savedAt={null} />);
    expect(r.root.findByType(Text).props.children).toBe("You're offline.");
  });
  test('ContentUnavailable at AX5 proposes the column width and never fixes its height', () => {
    act(() =>
      Dimensions.set({
        window: { ...window, width: 375, fontScale: 3.571 },
        screen,
      }),
    );
    const retry = jest.fn();
    const r = mount(
      <ContentUnavailable
        symbol={symbols.error}
        title="This person couldn't be loaded"
        body="Check your connection."
        action={{ label: 'Try again', onPress: retry }}
        testID="missing"
      />,
    );
    const host = r.root.findByType(Host);
    expect(host.props.matchContents).toEqual({ vertical: true });
    expect(StyleSheet.flatten(host.props.style)).toMatchObject({ width: 335 });
    act(() =>
      r.root
        .find(
          (node) =>
            node.props.testID === 'missing' &&
            typeof node.props.onLayout === 'function',
        )
        .props.onLayout({ nativeEvent: { layout: { width: 310 } } }),
    );
    expect(StyleSheet.flatten(host.props.style).width).toBe(310);
    expect(StyleSheet.flatten(host.props.style).height).toBeUndefined();
    expect(StyleSheet.flatten(host.props.style).maxHeight).toBeUndefined();
    expect(r.root.findByType(ContentUnavailableView).props).toMatchObject({
      title: "This person couldn't be loaded",
      description: 'Check your connection.',
    });
    act(() => r.root.findByType(Button).props.onPress());
    expect(retry).toHaveBeenCalledTimes(1);
  });
  // Sweep 2, item 2: at AX3 a stretched secondary button read from the
  // leading edge and hung left under the centred title. The action hugs
  // and a row centres it at every size.
  test.each([1, 2.353, 3.571])(
    'ContentUnavailable centres its action at font scale %s',
    (fontScale) => {
      act(() =>
        Dimensions.set({
          window: { ...window, width: 402, fontScale },
          screen,
        }),
      );
      const r = mount(
        <ContentUnavailable
          symbol={symbols.search}
          title="This bill isn’t in OPAX"
          body="The link may be old, or the bill may not be collected yet."
          action={{
            label: 'Search bills',
            onPress: noop,
            containerTestID: 'missing-action',
          }}
        />,
      );
      const row = r.root.find(
        (node) =>
          node.props.testID === 'missing-action' &&
          typeof node.type === 'string',
      );
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({
        flexDirection: 'row',
        justifyContent: 'center',
        alignSelf: 'stretch',
      });
      expect(r.root.findByType(Button).props.hug).toBe(true);
    },
  );
  test.each([false, true])(
    'ContentUnavailable action=%s is optional',
    (action) => {
      const r = mount(
        <ContentUnavailable
          symbol={symbols.search}
          title="No results"
          action={action ? { label: 'Try again', onPress: noop } : undefined}
        />,
      );
      expect(r.root.findAllByType(Button)).toHaveLength(action ? 1 : 0);
    },
  );
  test('Android has a growing RN equivalent and phone wording', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    try {
      const r = mount(
        <ContentUnavailable
          symbol={symbols.offline}
          title="Not saved on this iPhone yet"
          body="It will load when you're back online."
        />,
      );
      expect(r.root.findAllByType(Host)).toHaveLength(0);
      expect(
        r.root.findAllByType(Text).map((node) => node.props.children),
      ).toContain('Not saved on this phone yet');
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  });
  test.each([false, true])(
    'Collapse when=%s leaves no empty or failure placeholders',
    (when) => {
      const r = mount(
        <Collapse when={when}>
          <Text>Content</Text>
        </Collapse>,
      );
      expect(r.root.findAllByType(Text)).toHaveLength(when ? 0 : 1);
    },
  );
  test('error sentences leave the retry invitation to the button', () => {
    expect(errorMessage(new Error())).toBe(
      "The public record couldn't be loaded.",
    );
    expect(
      errorMessage(
        new ApiError('server', 'Bills could not be loaded. Try again.'),
      ),
    ).toBe('Bills could not be loaded.');
  });
});

test('catalogue and record source adapters retain the plain-language notes and saved date', () => {
  expect(catalogStateNote('unavailable')).toBe(
    'The latest records could not be loaded. Showing the saved copy.',
  );
  expect(catalogStateNote(undefined)).toBeNull();
  expect(
    recordSourceState({
      stale: true,
      savedAt: 100,
      partial: true,
      staleReason: 'unreadable',
    }),
  ).toEqual({
    state: null,
    savedAt: 100,
    note: 'The latest records could not be read. Showing the saved copy. Some records could not be read.',
  });
  expect(
    recordSourceState({ stale: false, savedAt: 100, partial: true }),
  ).toMatchObject({ state: 'partial', savedAt: null });
});
