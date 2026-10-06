import { act, type ReactElement, type ReactNode } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text as NativeText,
  View,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  Button,
  Field,
  FilterChip,
  Heading,
  IconButton,
  OpaxWebLink,
  PartyLabel,
  PersonRow,
  SegmentedControl,
  SourceLink,
  Tag,
  Text,
} from '../src/design/primitives';
import {
  contrastRatio,
  listedPair,
  requiredRatio,
} from '../src/design/contrast';
import { light, partyColors } from '../src/design/palette';
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
  // The memo wrapper and its inner component share one props object.
  return found.filter(
    (node, index) => found.findIndex((n) => n.props === node.props) === index,
  );
};
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

interface Drawn {
  background: string;
  texts: string[];
  icons: string[];
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
      .map((node) => hex(node.props.tintColor)),
    ...content
      .findAllByType(ActivityIndicator)
      .map((node) => hex(node.props.color)),
    ...content
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityElementsHidden &&
          flat(node.props.style).borderRadius === 5,
      )
      .map((node) => hex(flat(node.props.style).backgroundColor)),
  ].filter((c): c is string => !!c);
  return { background, texts: [...new Set(texts)], icons: [...new Set(icons)] };
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
  for (const icon of result.icons) {
    expect(listedPair(icon, result.background)).toBeTruthy();
    expect(contrastRatio(icon, result.background)).toBeGreaterThanOrEqual(
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
  test('Tag: pressed keeps a 4.5:1 label and adds an outline', () => {
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
    expect(
      contrastRatio(light.bronzeInk, pressed.background),
    ).toBeGreaterThanOrEqual(4.5);
    const root = render(
      <View>
        {pressables(render(tag))[0]!.props.children({ pressed: true })}
      </View>,
    );
    const outline = root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        flat(node.props.style).borderWidth === 1,
    )[0]!;
    expect(hex(flat(outline.props.style).borderColor)).toBe(light.bronzeInk);
    expect(listedPair(light.bronzeInk, light.paper)).toBeTruthy();
    expect(
      root
        .findAllByType(NativeText)
        .some(
          (node) => flat(node.props.style).textDecorationLine === 'underline',
        ),
    ).toBe(true);
    expect(JSON.stringify(flat(outline.props.style))).not.toContain('opacity');
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
  test('SourceLink and OpaxWebLink: rest and pressed', () => {
    for (const link of [
      <SourceLink
        key="s"
        citation="AusTender register"
        record="record CN3407266"
        url="https://www.tenders.gov.au/"
        kind="register"
      />,
      <OpaxWebLink key="w" label="Speeches" path="/subject/person/x" />,
    ]) {
      expectListed(drawn(link, false));
      expectListed(drawn(link, true));
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
      expect(rest.icons.length).toBeGreaterThan(0);
      expectListed(rest);
      expectListed(pressed);
    }
  });
  test('no design component changes state with opacity', () => {
    const dir = resolve(__dirname, '../src/design');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(resolve(dir, file), 'utf8');
      const values = [...source.matchAll(/\bopacity:\s*([^,}\n]+)/g)].map(
        (match) => match[1]!.trim(),
      );
      // The loading button's label is fully hidden (0), never faded.
      expect({ file, values: values.filter((v) => v !== '0') }).toEqual({
        file,
        values: [],
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
    ['former', 'Formerly Labor', 'Formerly Labor', 'Formerly ALP'],
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
    ['former', 'Julia Gillard', 'Julia Gillard, Formerly Labor'],
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
        label().props.onTextLayout({
          nativeEvent: {
            lines: [
              { text: 'Representatio', height: 22 * 3 },
              { text: `n${marker(required)}`, height: 22 * 3 },
            ],
          },
        });
      });
      // 2.7 of the uncapped 3.
      expect(capScale(label(), 'control')).toBeCloseTo(0.9, 6);
      act(() => {
        renderer.update(<Field label="Name" required={required} />);
      });
      expect(capScale(label(), 'control')).toBe(1);
      // Changing only the required marker is a change of text too.
      act(() => {
        label().props.onTextLayout({
          nativeEvent: {
            lines: [
              { text: 'Na', height: 22 * 3 },
              { text: `me${marker(required)}`, height: 22 * 3 },
            ],
          },
        });
      });
      expect(capScale(label(), 'control')).toBeCloseTo(0.9, 6);
      act(() => {
        renderer.update(<Field label="Name" required={!required} />);
      });
      expect(capScale(label(), 'control')).toBe(1);
    }
  });
  test('reads the text of nested children', () => {
    expect(
      textContent([
        'Email address',
        <Text key="r" variant="metadata">
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
  test('steps the scale down, never below the reader default', () => {
    expect(lineScale(30 * 2.3, 30)).toBe(2.3);
    expect(nextWordSafeCap(30 * 2.3, 30)).toBe(2.07);
    expect(nextWordSafeCap(30 * 1.05, 30)).toBe(1);
    expect(nextWordSafeCap(30, 30)).toBeNull();
  });
  test('a SourceLink label is word-safe', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SourceLink
          citation="Parliamentary Library"
          record="Bills Digest"
          url="https://www.aph.gov.au/"
          kind="record"
        />,
      );
    });
    const label = () =>
      renderer.root
        .findAllByType(NativeText)
        .find((node) => typeof node.props.onTextLayout === 'function')!;
    expect(label().props.children).toBe('Parliamentary Library · Bills Digest');
    expect(capScale(label(), 'body')).toBe(1);
    act(() => {
      label().props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Parliamentar', height: 25 * 3 },
            { text: 'y Library · Bills Digest', height: 25 * 3 },
          ],
        },
      });
    });
    // 2.7 of the uncapped 3, through the role's own size and line height.
    expect(capScale(label(), 'body')).toBeCloseTo(0.9, 6);
  });
  test('a heading lowers its own size after a mid-word break, and only then', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Heading>Recorded representation</Heading>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    expect(capScale(text(), 'heading')).toBe(1);
    const layout = (at: number, broken = true) =>
      act(() => {
        text().props.onTextLayout({
          nativeEvent: {
            lines: broken
              ? [
                  {
                    text: 'Recorded representatio',
                    width: 330,
                    height: 30 * at,
                  },
                  { text: 'n', width: 20, height: 30 * at },
                ]
              : [
                  { text: 'Recorded ', width: 200, height: 30 * at },
                  { text: 'representation', width: 320, height: 30 * at },
                ],
          },
        });
      });
    layout(2.3, false);
    expect(capScale(text(), 'heading')).toBe(1);
    layout(2.3);
    // Uncapped 2.3, capped 2.07: 90% of the role's size, which Dynamic Type
    // then multiplies by the same 2.3.
    expect(capScale(text(), 'heading')).toBeCloseTo(2.07 / 2.3, 6);
    // Each layout at the size now drawn that still breaks steps 10% lower,
    // always as a share of the same uncapped 2.3, and stops at the reader's
    // default size.
    for (const [at, next] of [
      [2.07, 1.86],
      [1.86, 1.67],
      [1.67, 1.5],
      [1.5, 1.35],
      [1.35, 1.22],
      [1.22, 1.1],
      [1.1, 1],
      [1, 1],
    ] as const) {
      layout(at);
      expect(capScale(text(), 'heading')).toBeCloseTo(next / 2.3, 6);
    }
    expect(text().props.accessibilityRole).toBe('header');
  });
  describe('word-safe resets and late layouts', () => {
    const base = textStyles.heading.lineHeight + LINE_HEIGHT_NUDGE;
    // "Representation" at heading scale: 212pt wide at the uncapped 2.3,
    // 191pt at 2.07 and 172pt at 1.86.
    const broken = (at: number, widths: [number, number]) => ({
      nativeEvent: {
        lines: [
          { text: 'Representatio', width: widths[0], height: base * at },
          { text: 'n', width: widths[1], height: base * at },
        ],
      },
    });
    const fits = (at: number, width = (212 * at) / 2.3) => ({
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
      fontScale = 2.3,
      variant: TextVariant = 'heading',
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
      return {
        text,
        ratio: () => capScale(text(), variant),
        layout: (event: object) => act(() => text().props.onTextLayout(event)),
        resize: (width: number) =>
          act(() => text().props.onLayout(frame(width))),
      };
    }

    // Review round 2, probe 1.
    test('a modest wider column restores full size once the full word fits', () => {
      const { ratio, layout, resize } = heading();
      resize(200);
      layout(broken(2.3, [198, 14]));
      expect(ratio()).toBeCloseTo(0.9, 6);
      layout(fits(2.07, 191));
      // 200 to 220pt: 191pt at 2.07 is 212pt at 2.3, which now fits.
      resize(220);
      expect(ratio()).toBe(1);
      // The capped layout, delivered late to the full-size text, is ignored.
      layout(fits(2.07, 191));
      expect(ratio()).toBe(1);
    });
    test('a narrower column that widens again restores the larger cap', () => {
      const { ratio, layout, resize } = heading();
      resize(200);
      layout(broken(2.3, [198, 14]));
      resize(200);
      layout(fits(2.07));
      expect(ratio()).toBeCloseTo(2.07 / 2.3, 6);
      // The column narrows to 180pt and 191pt no longer fits.
      resize(180);
      layout(broken(2.07, [178, 13]));
      resize(180);
      layout(fits(1.86));
      expect(ratio()).toBeCloseTo(1.86 / 2.3, 6);
      // Back to 200pt: the same capped text's frame widens, so the column
      // did. Full size breaks there again and steps to the 200pt cap.
      resize(200);
      expect(ratio()).toBe(1);
      layout(broken(2.3, [198, 14]));
      expect(ratio()).toBeCloseTo(2.07 / 2.3, 6);
      // Repeated frames and lines at that width settle without restarting.
      for (let i = 0; i < 5; i++) {
        resize(200);
        layout(fits(2.07));
      }
      expect(ratio()).toBeCloseTo(2.07 / 2.3, 6);
    });
    test("the capped text's own narrowing never counts as a wider column", () => {
      const { ratio, layout, resize } = heading();
      resize(200);
      layout(broken(2.3, [198, 14]));
      // The capped text hugs its 191pt word: narrower than the column, and
      // never wider than the 200pt it broke in, so the cap stays.
      resize(191);
      layout(fits(2.07, 191));
      resize(191);
      expect(ratio()).toBeCloseTo(2.07 / 2.3, 6);
    });
    test("a change of role starts again with that role's own uncapped size", () => {
      const { text, layout } = heading(
        2.3,
        'heading',
        'Recorded representation',
      );
      layout({
        nativeEvent: {
          lines: [
            { text: 'Recorded representatio', width: 300, height: base * 2.3 },
            { text: 'n', width: 12, height: base * 2.3 },
          ],
        },
      });
      expect(capScale(text(), 'heading')).toBeCloseTo(2.07 / 2.3, 6);
      act(() =>
        renderer.update(
          <Text wordSafe variant="fine">
            Recorded representation
          </Text>,
        ),
      );
      expect(capScale(text(), 'fine')).toBe(1);
      // The fine role's ramp is 3.4 at this size: 3.06 of 3.4, not of 2.3.
      const fine = textStyles.fine.lineHeight + LINE_HEIGHT_NUDGE;
      act(() =>
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
        }),
      );
      expect(capScale(text(), 'fine')).toBeCloseTo(3.06 / 3.4, 6);
    });
    test('a late layout from an earlier size can neither raise nor lower the cap', () => {
      const { text, ratio, layout } = heading();
      const fullSizeText = text().props.onTextLayout;
      layout(broken(2.3, [300, 12]));
      const firstCap = text().props.onTextLayout;
      layout(broken(2.07, [300, 12]));
      expect(ratio()).toBeCloseTo(1.86 / 2.3, 6);
      // Events from the earlier native instances, as Fabric delivers them.
      act(() => fullSizeText(broken(2.3, [300, 12])));
      act(() => firstCap(broken(2.07, [300, 12])));
      expect(ratio()).toBeCloseTo(1.86 / 2.3, 6);
      // A layout at another size arriving at the current instance is ignored.
      layout(broken(2.3, [300, 12]));
      layout(broken(1.3, [300, 12]));
      expect(ratio()).toBeCloseTo(1.86 / 2.3, 6);
      // A fresh layout at 1.86 still steps down as usual.
      layout(broken(1.86, [300, 12]));
      expect(ratio()).toBeCloseTo(1.67 / 2.3, 6);
    });
    // Review round 2, probe 2.
    test('after a switch to standard size a late AX5 layout cannot shrink below the role size', () => {
      const { text, ratio, layout } = heading();
      layout(broken(2.3, [198, 14]));
      expect(ratio()).toBeCloseTo(0.9, 6);
      const ax5Text = text().props.onTextLayout;
      act(() => setSize(1));
      expect(ratio()).toBe(1);
      // The AX5 layout, from the old instance and through the current one.
      act(() => ax5Text(broken(2.07, [198, 14])));
      layout(broken(2.07, [198, 14]));
      expect(ratio()).toBe(1);
      layout(fits(1, 92));
      expect(ratio()).toBe(1);
    });
    test('after a switch between large sizes the uncapped size comes only from a fresh layout', () => {
      const { text, ratio, layout } = heading();
      layout(broken(2.3, [198, 14]));
      const ax5Text = text().props.onTextLayout;
      // To a smaller accessibility size, where the heading's ramp is 2.0.
      act(() => setSize(2.643));
      expect(ratio()).toBe(1);
      // The old instance's AX5 layout cannot set this size's uncapped value.
      act(() => ax5Text(broken(2.07, [198, 14])));
      expect(ratio()).toBe(1);
      layout(broken(2.0, [198, 14]));
      expect(ratio()).toBeCloseTo(1.8 / 2.0, 6);
    });
  });
});
