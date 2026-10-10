import { act, type ReactElement } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text as NativeText,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SymbolView } from 'expo-symbols';
import { openSource } from '../src/navigation/external';
import {
  contrastRatio,
  listedPair,
  requiredRatio,
} from '../src/design/contrast';
import { light, lightHighContrast } from '../src/design/palette';
import {
  AsAtLine,
  Button,
  Card,
  ChoiceChip,
  EmptyState,
  IconButton,
  InfoButton,
  MACHINE_GUIDANCE,
  MachineLabel,
  MachineWritten,
  PartyChip,
  PartyLabel,
  SourceLine,
  SourceLink,
  StatusLabel,
  SwitchRow,
  SplitEmpty,
  Tag,
  Text,
  statusTone,
} from '../src/design/primitives';
import { roleColour, textContent } from '../src/design/text';
import {
  accentTint,
  radii,
  statusTint,
  statusTones,
  textStyles,
} from '../src/design/tokens';

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

describe('StatusLabel', () => {
  test.each([
    ['Passed', 'done'],
    ['Assented', 'done'],
    ['Agreed to', 'done'],
    ['Voted for', 'done'],
    ['Before parliament', 'active'],
    ['Introduced', 'active'],
    ['Second reading', 'active'],
    ['Exposure draft', 'draft'],
    ['Lapsed', 'ended'],
    ['Negatived', 'ended'],
    ['Not passed', 'ended'],
    ['Not agreed to', 'ended'],
    ['Voted against', 'ended'],
    ['Withdrawn', 'ended'],
    ['Outcome not recorded', 'ended'],
  ] as const)('"%s" reads as %s', (word, tone) => {
    expect(statusTone(word)).toBe(tone);
  });
  test('a word on its tone: 4-radius wash, the label role, said as the word', () => {
    const root = render(<StatusLabel label="Passed" testID="s" />).root;
    const box = host(root, 's');
    expect(box.props.accessible).toBe(true);
    expect(box.props.accessibilityLabel).toBe('Passed');
    const style = flat(box.props.style);
    expect(style.borderRadius).toBe(radii.sm);
    expect(hex(style.backgroundColor)).toBe(light.moneyWash);
    const text = nativeTexts(root)[0]!;
    const textStyle = flat(text.props.style);
    expect(textStyle.fontSize).toBe(textStyles.label.fontSize);
    expect(hex(textStyle.color)).toBe(light.moneyInk);
    expect(strings(root)).toEqual(['Passed']);
  });
  test('inside a row that says it, it is drawn only', () => {
    const box = host(
      render(<StatusLabel label="Lapsed" hidden testID="s" />).root,
      's',
    );
    expect(box.props.accessible).toBe(false);
    expect(box.props.accessibilityElementsHidden).toBe(true);
  });
  test('every tone is a listed text pair, and 7:1 under Increase Contrast', () => {
    for (const { ink, wash } of Object.values(statusTones)) {
      expect(listedPair(light[ink], light[wash], 'text')).toBeTruthy();
      expect(contrastRatio(light[ink], light[wash])).toBeGreaterThanOrEqual(
        requiredRatio.text,
      );
      const strong = lightHighContrast[ink] ?? light[ink];
      expect(contrastRatio(strong, light[wash])).toBeGreaterThanOrEqual(
        ink === 'inkSoft' ? 7 : 7,
      );
    }
  });
  test('hugs its word, and takes the full width (word-safe) at AX5', () => {
    const style = (fontScale: number) => {
      let s: Record<string, unknown> = {};
      atSize(fontScale, () => {
        const root = render(
          <StatusLabel label="Before parliament" testID="s" />,
        ).root;
        s = flat(host(root, 's').props.style);
        expect(nativeTexts(root)[0]!.props.dynamicTypeRamp).toBe('footnote');
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
    expect(flat(face.props.style).borderRadius).toBe(radii.sm);
    expect(hex(flat(face.props.style).backgroundColor)).toBe(light.bronzeWash);
    expect(hex(flat(nativeTexts(root)[0]!.props.style).color)).toBe(
      light.bronzeInk,
    );
    // No decorative hash: the label alone.
    expect(strings(root)).toEqual(['Housing']);
  });
  test('a linked tag is a 44pt link; pressed adds an outline and underline', () => {
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
    expect(flat(face.props.style).borderWidth).toBe(1);
    expect(flat(nativeTexts(pressed)[0]!.props.style).textDecorationLine).toBe(
      'underline',
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
    expect(flat(text.props.style).fontSize).toBe(textStyles.label.fontSize);
    expect(hex(flat(text.props.style).color)).toBe(light.inkSoft);
    expect(strings(root)).toEqual(['Labor']);
  });
  test('dense shows the short label and says the full name; former is said', () => {
    const root = render(
      <PartyLabel party="Liberal" status="former" dense testID="p" />,
    ).root;
    expect(strings(root)).toEqual(['Formerly LIB']);
    expect(host(root, 'p').props.accessibilityLabel).toBe('Formerly Liberal');
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
  test('the retired PartyChip draws a PartyLabel: no capsule fill', () => {
    const root = render(<PartyChip party="Greens" status="current" />).root;
    expect(root.findAllByType(PartyLabel)).toHaveLength(1);
    expect(strings(root)).toEqual(['GRN']);
    for (const node of root.findAll((n) => typeof n.type === 'string'))
      expect(flat(node.props.style).borderRadius).not.toBe(999);
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

describe('ChoiceChip', () => {
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
  test('a pill, 36pt drawn and 44pt to touch, said with its state and place', () => {
    const node = pressable(chip());
    expect(node.props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    expect(node.props.accessibilityValue).toEqual({ text: '2 of 4' });
    const style = pressedStyle(node, false);
    expect(style.borderRadius).toBe(radii.pill);
    expect(style.minHeight).toBe(36);
    expect(node.props.hitSlop).toBe(Platform.OS === 'android' ? 6 : 4);
  });
  test('rest, pressed, selected and disabled are opaque listed pairs', () => {
    const cases = [
      [{}, false, 'navyWash', 'navy'],
      [{}, true, 'sunken', 'navy'],
      [{ selected: true }, false, 'navy', 'onNavy'],
      [{ selected: true }, true, 'navyRaised', 'onNavy'],
      [{ disabled: true }, false, 'sunken', 'inkSoft'],
    ] as const;
    for (const [props, pressed, fill, ink] of cases) {
      const root = chip(props);
      expect(hex(pressedStyle(pressable(root), pressed).backgroundColor)).toBe(
        light[fill],
      );
      const colour = hex(flat(nativeTexts(root)[0]!.props.style).color)!;
      expect(colour).toBe(light[ink]);
      expect(listedPair(colour, light[fill], 'text')).toBeTruthy();
    }
  });
  test('at AX5 it takes the full width with 12pt corners, word-safe', () => {
    atSize(AX5, () => {
      const root = chip();
      const style = pressedStyle(pressable(root), false);
      expect(style.alignSelf).toBe('stretch');
      expect(style.borderRadius).toBe(radii.md);
    });
  });
});

describe('MachineLabel', () => {
  test('one phrase, drawn and spoken, whatever the old label said', () => {
    const root = render(
      <>
        <MachineLabel
          explanation="Written by a model from the explanatory memorandum; not the record"
          testID="m"
        />
        <MachineWritten
          label="Machine brief"
          explanation="An automated summary written by a model; not the record."
          testID="w"
        />
      </>,
    ).root;
    const pill = (id: string) =>
      root.find(
        (n) => n.props?.testID === id && typeof n.props.children === 'function',
      );
    expect(pill('m').props.accessibilityLabel).toBe(
      'Machine-written. Written by a model from the explanatory memorandum; not the record.',
    );
    expect(pill('w').props.accessibilityLabel).toBe(
      'Machine-written. An automated summary written by a model; not the record.',
    );
    const face = render(pill('w').props.children({ pressed: false })).root;
    expect(strings(face)).toEqual(['Machine-written']);
    const style = flat(
      face.find(
        (n) =>
          typeof n.type === 'string' && flat(n.props.style).minHeight === 26,
      ).props.style,
    );
    expect(style.borderRadius).toBe(radii.pill);
    expect(hex(style.backgroundColor)).toBe(light.billsWash);
    expect(flat(pill('m').props.style).minHeight).toBe(44);
  });
  test('tapping it opens the attribution and the guidance', () => {
    const renderer = render(
      <MachineLabel explanation="Written by a model" testID="m" />,
    );
    const pill = renderer.root.find(
      (n) => n.props.testID === 'm' && typeof n.props.onPress === 'function',
    );
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    act(() => pill.props.onPress());
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
    expect(strings(renderer.root)).toEqual(
      expect.arrayContaining([
        'Machine-written',
        'Written by a model.',
        MACHINE_GUIDANCE,
      ]),
    );
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
    expect(line.props.accessibilityHint).toBe(
      'Opens the sources, notes and licence',
    );
    const [outer, name] = nativeTexts(root);
    expect(outer!.props.children[0]).toBe('Updated 4 Oct 2026 · ');
    expect(name!.props.children).toBe('AEC annual returns');
    expect(hex(flat(name!.props.style).color)).toBe(light.bronzeInk);
    expect(hex(flat(outer!.props.style).color)).toBe(light.inkSoft);
    // 32pt drawn, 44pt to touch.
    expect(pressedStyle(line, false).minHeight).toBe(
      Platform.OS === 'android' ? 48 : 32,
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
      'Updated 3 Oct 2026 · They Vote For You and 2 more · Divisions to 25 Sep 2026 · Saved 5 Oct 2026',
    );
  });
  test('an undated block says so: every figure stays dated', () => {
    const root = render(<SourceLine citation="AusTender" />).root;
    expect(textContent(nativeTexts(root)[0]!.props.children)).toBe(
      'Date not published · AusTender',
    );
  });
  test('the sheet: originals, as at, sources, notes, licence, Sources and licences', () => {
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
    const sheet = renderer.root.findByType(Modal);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.presentationStyle).toBe('pageSheet');
    const said = strings(sheet);
    for (const text of [
      'Sources and notes',
      'Original records',
      'AEC Transparency Register',
      'return 2024-25',
      'As at',
      'As at 4 October 2026',
      'Sources',
      'AEC annual returns',
      'AusTender',
      'Notes',
      'Party disclosures, not this person’s finances.',
      'Licence',
      'CC BY 4.0',
      'Sources and licences',
    ])
      expect(said).toContain(text);
    // Only https originals, once each.
    expect(said).not.toContain('Duplicate');
    expect(said).not.toContain('Not a source');
    const original = host(sheet, 'src-sheet-original-0');
    expect(original.props.accessibilityLabel).toBe(
      'View original, AEC Transparency Register, return 2024-25',
    );
    // The original opens once the sheet has gone (iOS: on dismiss).
    const pressableOriginal = sheet.find(
      (n) =>
        n.props.testID === 'src-sheet-original-0' &&
        typeof n.props.onPress === 'function' &&
        typeof n.type !== 'string',
    );
    act(() => pressableOriginal.props.onPress());
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    act(() => renderer.root.findByType(Modal).props.onDismiss());
    expect(openSource).toHaveBeenCalledWith(
      'https://transparency.aec.gov.au/',
      'AEC Transparency Register · return 2024-25',
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
  test('AsAtLine draws a SourceLine and keeps its spoken sentence', () => {
    const root = render(
      <AsAtLine
        asOf="2026-09-21"
        citation={['AEC annual returns', 'AusTender']}
        testID="asat"
      />,
    ).root;
    expect(root.findAllByType(SourceLine)).toHaveLength(1);
    const line = root.find(
      (n) => n.props.testID === 'asat' && typeof n.props.style === 'function',
    );
    expect(line.props.accessibilityLabel).toBe(
      'As at 21 September 2026 · Source: AEC annual returns; AusTender',
    );
    expect(textContent(nativeTexts(root)[0]!.props.children)).toBe(
      'Updated 21 Sep 2026 · AEC annual returns and 1 more',
    );
  });
  test('SourceLink keeps opening its original directly, in the line’s anatomy', () => {
    const root = render(
      <SourceLink
        citation="They Vote For You"
        record="division, 19 Aug 2026"
        url="https://theyvoteforyou.org.au/divisions/1"
        kind="record"
        testID="sl"
      />,
    ).root;
    const link = root.find(
      (n) => n.props.testID === 'sl' && typeof n.props.onPress === 'function',
    );
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toBe(
      'View original, They Vote For You, division, 19 Aug 2026',
    );
    expect(strings(root)).toEqual(['View original']);
    act(() => link.props.onPress());
    expect(openSource).toHaveBeenCalledWith(
      'https://theyvoteforyou.org.au/divisions/1',
      'They Vote For You · division, 19 Aug 2026',
    );
  });
  test('the ⓘ opens the same sheet, with its notes', () => {
    const renderer = render(
      <InfoButton title="About these figures" notes={['A note.']} testID="i" />,
    );
    const button = renderer.root.find(
      (n) => n.props.testID === 'i' && typeof n.props.onPress === 'function',
    );
    expect(flat(button.props.style({ pressed: false })).borderRadius).toBe(
      radii.pill,
    );
    act(() => button.props.onPress());
    const sheet = renderer.root.findByType(Modal);
    expect(sheet.props.visible).toBe(true);
    expect(strings(sheet)).toEqual(
      expect.arrayContaining(['About these figures', 'A note.']),
    );
    // Notes alone: no provenance headings, no licences row.
    expect(strings(sheet)).not.toContain('Sources and licences');
  });
});

describe('Card', () => {
  test('radius 12, raised, a hairline, no shadow; pressed is sunken', () => {
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
      borderRadius: radii.md,
      borderWidth: 1,
      padding: 16,
    });
    expect(hex(rest.backgroundColor)).toBe(light.raised);
    expect(hex(rest.borderColor)).toBe(light.dividerSubtle);
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
    expect(pressedStyle(off, false).borderRadius).toBe(radii.pill);
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
      expect(style.borderRadius).toBe(radii.md);
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
    expect(badge.props.allowFontScaling).toBe(false);
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
  test('pane: one quiet line, the same in every split; SplitEmpty is this size', () => {
    const pane = render(
      <EmptyState size="pane" message="No bill selected" testID="e" />,
    ).root;
    expect(strings(pane)).toEqual(['No bill selected']);
    const line = nativeTexts(pane)[0]!;
    expect(hex(flat(line.props.style).color)).toBe(light.inkSoft);
    expect(flat(line.props.style).textAlign).toBe('center');
    // No symbol, no wash, no heading: nothing 64pt wide, no category colour.
    expect(
      pane.findAll(
        (n) => typeof n.type === 'string' && flat(n.props.style).width === 64,
      ),
    ).toHaveLength(0);
    // An older call with a title and a count draws the title alone.
    const older = render(
      <EmptyState
        size="pane"
        icon="doc.text"
        accent="bills"
        title="No bill selected"
        message="12 bills"
        testID="e"
      />,
    ).root;
    expect(strings(older)).toEqual(['No bill selected']);
    const alias = render(
      <SplitEmpty icon="doc.text" title="No bill selected" testID="e" />,
    ).root;
    expect(alias.findAllByType(EmptyState)[0]!.props.size).toBe('pane');
    expect(strings(alias)).toEqual(['No bill selected']);
  });
});

describe('Increase Contrast and Android high-contrast text', () => {
  test('iOS: the new components draw role colours that step up natively', () => {
    if (Platform.OS !== 'ios') return;
    const root = render(<StatusLabel label="Before parliament" />).root;
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
      lightHighContrast.bronzeInk,
    );
  });
  test('Android: High contrast text takes the same stronger roles', () => {
    expect(roleColour('inkSoft', true)).toBe(lightHighContrast.inkSoft);
    expect(roleColour('billsInk', true)).toBe(lightHighContrast.billsInk);
    // Roles with no stronger value keep their own.
    expect(roleColour('ink', true)).toBe(light.ink);
    mockHighText = true;
    try {
      const root = render(<Text variant="metadata">Grayndler</Text>).root;
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
