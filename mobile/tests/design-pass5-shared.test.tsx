import { act, type ReactElement } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { sourceLabel, sourceName } from '../src/design/format';
import {
  BillRow,
  EXTERNAL_GLYPH,
  LinkRow,
  PartyLabel,
  SourceLine,
  Text,
} from '../src/design/primitives';
import { partyDotSize } from '../src/design/people';
import { licenceText } from '../src/design/source';
import { textContent, titleSizeCap } from '../src/design/text';
import { textStyles } from '../src/design/tokens';
import { closeSheetItem } from '../src/navigation/chrome';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => undefined),
  openOnWeb: jest.fn(async () => undefined),
}));

// Design programme pass 5, lane D: the shared components the critique's
// lanes A to C build on (docs/design/review-2026-10/pass5-app-critique.md).

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
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
const nativeTexts = (root: ReactTestInstance) => root.findAllByType(NativeText);
const strings = (root: ReactTestInstance) =>
  nativeTexts(root)
    .map((node) => [node.props.children].flat(3))
    .flat()
    .filter((child): child is string => typeof child === 'string' && !!child);
const setSize = (fontScale: number) =>
  act(() => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 3, fontScale },
      screen: { width: 390, height: 844, scale: 3, fontScale },
    });
  });
const AX2 = 2.143;
const AX5 = 3.571;
beforeEach(() => setSize(1));
const openSheet = (root: ReactTestInstance, testID: string) => {
  const line = root.find(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  );
  act(() => line.props.onPress());
  return root.findByType(Modal);
};

describe('sourceLabel (P2-5)', () => {
  test('AEC results files: one short name, the full title in words', () => {
    expect(sourceName('AEC 2019-05-18 tcp votes')).toEqual({
      label: 'AEC election results',
      title: 'AEC two-candidate preferred votes, 18 May 2019 election',
    });
    expect(sourceLabel('AEC 2025-05-03 candidates')).toBe(
      'AEC election results',
    );
    expect(sourceName('AEC 2022-05-21 primary votes').title).toBe(
      'AEC first preference votes, 21 May 2022 election',
    );
  });
  test('a publisher before a title, a department or a note', () => {
    const pay = sourceName(
      'Parliamentary Library: The base salary for senators and members (Background Note, 17 August 2012)',
    );
    expect(pay.label).toBe('Parliamentary Library');
    expect(pay.title).toBe(
      'Parliamentary Library: The base salary for senators and members (Background Note, 17 August 2012)',
    );
    expect(
      sourceLabel(
        'AusTender, Department of Finance. Latest contract notice per amendment lineage.',
      ),
    ).toBe('AusTender');
    expect(
      sourceLabel(
        'Independent Parliamentary Expenses Authority quarterly expenditure reports (data.gov.au, CC BY 4.0)',
      ),
    ).toBe('IPEA');
    expect(sourceLabel('AEC disclosure returns, CC BY 4.0')).toBe(
      'AEC disclosure returns',
    );
  });
  test('no ISO date or pipeline word reaches the screen', () => {
    const roster = sourceName(
      'OPAX federal roster reconciled against APH, 2026-09-04',
    );
    expect(roster).toEqual({
      label: 'OPAX parliamentary roster',
      title: 'OPAX federal roster reconciled against APH, 4 September 2026',
    });
    const ecq = sourceName(
      'Electoral Commission of Queensland, Electronic Disclosure System (gifts to registered political parties) via parli.db `ext_donations` (source qld_ecq)',
    );
    expect(ecq.label).toBe('Electoral Commission of Queensland');
    expect(ecq.title).not.toMatch(/parli\.db|ext_|qld_ecq|`/);
    expect(
      sourceName('ABS Census 2021 federal electorate profiles, OPAX import'),
    ).toEqual({
      label: 'ABS Census 2021',
      title: 'ABS Census 2021 federal electorate profiles',
    });
    for (const raw of [
      'AEC 2019-05-18 tcp votes',
      'OPAX federal roster reconciled against APH, 2026-09-04',
    ]) {
      const { label, title } = sourceName(raw);
      expect(`${label} ${title}`).not.toMatch(/\d{4}-\d{2}-\d{2}|\btcp\b/);
    }
  });
  test('a name that is already short comes back unchanged', () => {
    for (const name of [
      'They Vote For You',
      'AEC annual returns',
      'ABC News; The Guardian',
      'Wikimedia Commons',
    ])
      expect(sourceName(name)).toEqual({ label: name, title: name });
  });
});

describe('SourceLine and its sheet (P2-4)', () => {
  test('the line names each short label once; the sheet lists every full title', () => {
    const root = render(
      <SourceLine
        asOf="2026-09-09"
        citation={[
          'AEC 2019-05-18 tcp votes',
          'AEC 2025-05-03 tcp votes',
          'AEC 2025-05-03 candidates',
          'OpenAustralia parliamentary service records',
        ]}
        testID="src"
      />,
    ).root;
    expect(textContent(nativeTexts(root)[0]!.props.children)).toBe(
      'Updated 9 Sep 2026 · AEC election results and 1 more',
    );
    const said = strings(openSheet(root, 'src'));
    for (const title of [
      'AEC two-candidate preferred votes, 18 May 2019 election',
      'AEC two-candidate preferred votes, 3 May 2025 election',
      'AEC candidates, 3 May 2025 election',
      'OpenAustralia parliamentary service records',
    ])
      expect(said).toContain(title);
    expect(said.join('\n')).not.toMatch(/\btcp\b|\d{4}-\d{2}-\d{2}/);
  });
  test('per-source dates: each source says its own when they differ; the line takes the newest', () => {
    const root = render(
      <SourceLine
        citation={[
          {
            label: 'ParlInfo',
            title: 'ParlInfo bill records',
            asOf: '2026-10-04',
          },
          {
            label: 'Registers',
            title: 'Registers of interests',
            asOf: '2026-09-04',
          },
        ]}
        testID="src"
      />,
    ).root;
    expect(textContent(nativeTexts(root)[0]!.props.children)).toBe(
      'Updated 4 Oct 2026 · ParlInfo and 1 more',
    );
    const said = strings(openSheet(root, 'src'));
    expect(said).toEqual(
      expect.arrayContaining([
        'As at',
        '4 October 2026',
        'ParlInfo bill records · 4 Oct 2026',
        'Registers of interests · 4 Sep 2026',
      ]),
    );
    expect(said.filter((text) => /^As at/.test(text))).toEqual(['As at']);
  });
  test('one date for every source is said once, under As at', () => {
    const root = render(
      <SourceLine
        asOf="2026-10-04"
        citation={[
          { label: 'A', asOf: '2026-10-04' },
          { label: 'B', asOf: '2026-10-04' },
        ]}
        testID="src"
      />,
    ).root;
    const said = strings(openSheet(root, 'src'));
    expect(said).toEqual(expect.arrayContaining(['A', 'B', '4 October 2026']));
    expect(said.join('\n')).not.toMatch(/· 4 Oct/);
  });
  test('the licence row opens Sources and licences at its dataset', () => {
    const renderer = render(
      <SourceLine
        asOf="2026-09-09"
        citation="AEC 2019-05-18 tcp votes"
        licence="See source terms"
        licenceDataset="release"
        testID="src"
      />,
    );
    const sheet = openSheet(renderer.root, 'src');
    const said = strings(sheet);
    expect(said).toContain('The source’s own terms');
    expect(said).not.toContain('See source terms');
    const row = sheet.find(
      (n) =>
        n.props.testID === 'src-sheet-licences' &&
        typeof n.props.onPress === 'function' &&
        typeof n.type !== 'string',
    );
    act(() => row.props.onPress());
    act(() => renderer.root.findByType(Modal).props.onDismiss());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/account/sources',
      params: { dataset: 'release' },
    });
    expect(licenceText('CC BY 4.0')).toBe('CC BY 4.0');
  });
  test('originals carry their own date beside the record', () => {
    const root = render(
      <SourceLine
        asOf="2026-09-09"
        citation="They Vote For You"
        originals={[
          {
            label: 'They Vote For You',
            url: 'https://theyvoteforyou.org.au/divisions/1',
            record: 'division',
            asOf: '2026-08-19',
          },
        ]}
        testID="src"
      />,
    ).root;
    const sheet = openSheet(root, 'src');
    expect(strings(sheet)).toContain('division · 19 Aug 2026');
    const glyphs = sheet
      .findAllByType(SymbolView)
      .map((node) => node.props.name);
    expect(glyphs).toContain(EXTERNAL_GLYPH);
  });
});

describe('one external glyph (P3-7)', () => {
  test('an external LinkRow draws ↗, never the Safari compass', () => {
    const root = render(
      <LinkRow
        title="Check your electorate with the AEC"
        external
        onPress={() => {}}
      />,
    ).root;
    const glyphs = root
      .findAllByType(SymbolView)
      .map((node) => node.props.name);
    expect(glyphs).toEqual([EXTERNAL_GLYPH]);
    expect(glyphs).not.toContain('safari');
  });
});

describe('sheet Done (P3-8)', () => {
  test('the native sheet Done is plain text, not the filled done pill', () => {
    expect(closeSheetItem()).toMatchObject({ label: 'Done', variant: 'plain' });
  });
});

describe('title size cap at AX2 (P2-18)', () => {
  test('the title role stops at its AX2 size; other roles scale on', () => {
    expect(titleSizeCap('title', 1, 'ios')).toBe(1);
    expect(titleSizeCap('title', AX2, 'ios')).toBe(1);
    // largeTitle ramp: 60pt at AX5, capped at AX2's 48pt.
    expect(titleSizeCap('title', AX5, 'ios')).toBeCloseTo(48 / 60, 5);
    expect(titleSizeCap('padTitle', AX5, 'ios')).toBeCloseTo(48 / 60, 5);
    expect(titleSizeCap('heading', AX5, 'ios')).toBe(1);
    expect(titleSizeCap('body', AX5, 'ios')).toBe(1);
    expect(titleSizeCap('display', AX5, 'ios')).toBe(1);
    // Android scales by the font scale itself: 34pt x 2 is held to 48pt.
    expect(34 * 2 * titleSizeCap('title', 2, 'android')).toBeCloseTo(48, 5);
  });
  test('a title at AX5 draws its font size scaled (the text cache ignores maxFontSizeMultiplier)', () => {
    setSize(AX5);
    const root = render(<Text variant="title">A bill title</Text>).root;
    const style = flat(nativeTexts(root)[0]!.props.style);
    const cap = titleSizeCap('title', AX5, Platform.OS);
    expect(style.fontSize).toBeCloseTo(textStyles.title.fontSize * cap, 5);
    expect(nativeTexts(root)[0]!.props.maxFontSizeMultiplier).toBe(0);
    const body = render(<Text variant="heading">Section</Text>).root;
    expect(flat(nativeTexts(body)[0]!.props.style).fontSize).toBe(
      textStyles.heading.fontSize,
    );
  });
});

describe('the party dot grows with text (P3-14)', () => {
  test('10pt at standard size, 16pt at most', () => {
    expect(partyDotSize(1)).toBe(10);
    expect(partyDotSize(0.823)).toBe(10);
    expect(partyDotSize(1.353)).toBe(14);
    expect(partyDotSize(AX5)).toBe(16);
  });
  test('drawn at AX5 as a 16pt circle', () => {
    setSize(AX5);
    const root = render(<PartyLabel party="Labor" status="current" />).root;
    const dot = root.find(
      (n) =>
        typeof n.type === 'string' &&
        flat(n.props.style).backgroundColor === '#B02E33',
    );
    expect(flat(dot.props.style)).toMatchObject({
      width: 16,
      height: 16,
      borderRadius: 8,
    });
  });
});

describe('BillRow (P2-8)', () => {
  test('status and date, a serif title, who brought it with a party dot and name', () => {
    const onPress = jest.fn();
    const root = render(
      <BillRow
        title="Example Amendment Bill 2026"
        status="Introduced"
        date="Introduced 17 Sep 2026"
        by="A sponsor"
        party={{ party: 'Labor', status: 'current' }}
        onPress={onPress}
        accessibilityLabel="Example Amendment Bill 2026, Introduced"
        testID="bill"
      />,
    ).root;
    const title = root.find(
      (n) => n.type === NativeText && n.props.testID === 'bill-title',
    );
    expect(flat(title.props.style).fontFamily).toBe(
      textStyles.subheading.fontFamily,
    );
    expect(textStyles.subheading.fontFamily).toMatch(/Merriweather/);
    expect(strings(root)).toEqual(
      expect.arrayContaining([
        'Introduced',
        'Introduced 17 Sep 2026',
        'Example Amendment Bill 2026',
        'A sponsor',
        'Labor',
      ]),
    );
    const row = root.find(
      (n) =>
        n.props.testID === 'bill' &&
        n.props.accessibilityRole === 'button' &&
        typeof n.type !== 'string',
    );
    expect(row.props.accessibilityLabel).toBe(
      'Example Amendment Bill 2026, Introduced',
    );
    expect(row.props.accessibilityHint).toBe('Opens the bill');
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalled();
    expect(
      root.findAllByType(SymbolView).map((node) => node.props.name),
    ).toEqual(['chevron.right']);
  });
  test('in a split list the selected row has no chevron and says its state', () => {
    const root = render(
      <BillRow
        title="Example Bill"
        status="Passed"
        onPress={() => {}}
        accessibilityLabel="Example Bill, Passed"
        selected
        testID="bill"
      />,
    ).root;
    const row = root.find(
      (n) =>
        n.props.testID === 'bill' &&
        n.props.accessibilityRole === 'button' &&
        typeof n.type !== 'string',
    );
    expect(row.props.accessibilityState).toEqual({ selected: true });
    expect(root.findAllByType(SymbolView)).toHaveLength(0);
  });
});
