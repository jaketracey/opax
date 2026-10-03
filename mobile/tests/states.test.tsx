import { act, type ReactElement, type ReactNode } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ActivityIndicator,
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
  breaksMidWord,
  nextWordSafeCap,
  textContent,
} from '../src/design/text';
import { controlHeight, minimumTarget } from '../src/design/tokens';

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
          partyCurrent
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
  test('a historical party reads "Formerly …", seen and heard', () => {
    const label = <PartyLabel party="Labor" current={false} />;
    expect(labelOf(label)).toBe('Formerly Labor');
    expect(textOf(label)).toBe('Formerly Labor');
  });
  test('a changed party reads the current one, then formerly', () => {
    const label = (
      <PartyLabel party="One Nation" current formerly="Nationals" />
    );
    expect(labelOf(label)).toBe('One Nation, formerly Nationals');
    expect(textOf(label)).toContain('One Nation');
    expect(textOf(label)).toContain(' · formerly Nationals');
  });
  test('the same party under another name is not "formerly"', () => {
    expect(
      labelOf(
        <PartyLabel party="Labor" current formerly="Australian Labor Party" />,
      ),
    ).toBe('Labor');
  });
  test('dense rows keep the context with the short label', () => {
    const label = <PartyLabel party="Labor" current={false} dense />;
    expect(labelOf(label)).toBe('Formerly Labor');
    expect(textOf(label)).toBe('Formerly ALP');
  });
  test('a person row reads the status in its single label', () => {
    expect(
      labelOf(
        <PersonRow
          name="Julia Gillard"
          party="Labor"
          partyCurrent={false}
          onPress={noop}
        />,
      ),
    ).toBe('Julia Gillard, Formerly Labor');
  });
  test('the party colours used by rows are all listed', () => {
    for (const hexColour of Object.values(partyColors))
      expect(listedPair(hexColour, light.raised)).toBeTruthy();
  });
});

describe('word-safe text', () => {
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
      act(() => {
        label().props.onTextLayout({
          nativeEvent: {
            lines: [
              { text: 'Representatio', height: 22 * 3 },
              { text: 'n', height: 22 * 3 },
            ],
          },
        });
      });
      expect(label().props.maxFontSizeMultiplier).toBe(2.7);
      act(() => {
        renderer.update(<Field label="Name" required={required} />);
      });
      expect(label().props.maxFontSizeMultiplier).toBe(0);
      // Changing only the required marker is a change of text too.
      act(() => {
        label().props.onTextLayout({
          nativeEvent: {
            lines: [
              { text: 'Na', height: 22 * 3 },
              { text: 'me', height: 22 * 3 },
            ],
          },
        });
      });
      expect(label().props.maxFontSizeMultiplier).toBe(2.7);
      act(() => {
        renderer.update(<Field label="Name" required={!required} />);
      });
      expect(label().props.maxFontSizeMultiplier).toBe(0);
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
    expect(nextWordSafeCap(30 * 2.3, 30)).toBe(2.07);
    expect(nextWordSafeCap(30 * 1.05, 30)).toBe(1);
    expect(nextWordSafeCap(30, 30)).toBeNull();
  });
  test('a heading lowers its own cap after a mid-word break, and only then', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Heading>Recorded representation</Heading>,
      );
    });
    const text = () => renderer.root.findByType(NativeText);
    expect(text().props.maxFontSizeMultiplier).toBe(0);
    const layout = (lines: { text: string; height: number }[]) =>
      act(() => {
        text().props.onTextLayout({ nativeEvent: { lines } });
      });
    layout([
      { text: 'Recorded ', height: 30 * 2.2 },
      { text: 'representation', height: 30 * 2.2 },
    ]);
    expect(text().props.maxFontSizeMultiplier).toBe(0);
    layout([
      { text: 'Recorded representatio', height: 30 * 2.3 },
      { text: 'n', height: 30 * 2.3 },
    ]);
    expect(text().props.maxFontSizeMultiplier).toBe(2.07);
    expect(text().props.accessibilityRole).toBe('header');
  });
});
