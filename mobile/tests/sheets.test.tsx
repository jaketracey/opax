import { RouteOptions } from '../src/navigation/preview';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { act, Children, type ReactElement } from 'react';
import {
  ActionSheetIOS,
  Dimensions,
  Linking,
  Platform,
  Text as NativeText,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { SwitchRow } from '../src/design/controls';
import { copy } from '../src/design/copy';
import { MachinePill } from '../src/design/labels';
import { InsetGroup } from '../src/design/layout';
import { LinkRow } from '../src/design/rows';
import { SourceLine } from '../src/design/source';
import { Text } from '../src/design/text';
import { colors, minimumTarget, rhythm } from '../src/design/tokens';
import CitationSheet, {
  citationBar,
} from '../src/features/sheets/CitationSheet';
import { FilterRoute } from '../src/features/sheets/FilterRoutes';
import MachineNoteSheet from '../src/features/sheets/MachineNoteSheet';
import RuleSheet from '../src/features/sheets/RuleSheet';
import SourceSheet, {
  openOriginal,
  Paragraphs,
  SourceContent,
  sourceHeader,
  TintRow,
} from '../src/features/sheets/SourceSheet';
import {
  filterStore,
  registerFilterModel,
} from '../src/features/sheets/filter-model';
import { billsFilterModel } from '../src/features/sheets/filter-models';
import { fittedBottom, routeSheetOptions } from '../src/features/sheets/frame';
import { openCorrection, openSource } from '../src/navigation/external';
import {
  presentSheet,
  presentSource,
  setSheetSegments,
  sheetPayload,
} from '../src/navigation/sheets';

jest.mock('../src/design/environment', () => ({
  ...jest.requireActual('../src/design/environment'),
  isE2E: false,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/design/row-link', () => ({
  ...jest.requireActual('../src/design/row-link'),
  RowLink: ({ children }: { children: ReactElement }) => children,
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => {}),
}));
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer.root;
}
function press(root: ReactTestInstance, id: string) {
  act(() =>
    root
      .findAll(
        (node) =>
          node.props?.testID === id && typeof node.props.onPress === 'function',
      )
      .at(-1)!
      .props.onPress(),
  );
}
const text = (root: ReactTestInstance) =>
  root
    .findAllByType(NativeText)
    .map((node) => node.props.children)
    .flat(4)
    .filter((value) => typeof value === 'string')
    .join('\n');
function lastKey() {
  return (
    jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    }
  ).params.key;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
  });
  mockParams = {};
  setSheetSegments(['(tabs)', '(today)', 'index']);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
  jest.restoreAllMocks();
});

test('registry keeps the last eight payloads, type checks keys, and carries only ids', () => {
  presentSheet({ kind: 'rule', rule: 'Old' });
  const old = lastKey();
  for (let n = 0; n < 8; n++) presentSheet({ kind: 'rule', rule: `Rule ${n}` });
  expect(sheetPayload(old, 'rule')).toBeNull();
  expect(sheetPayload(lastKey(), 'rule')?.rule).toBe('Rule 7');
  expect(sheetPayload(lastKey(), 'source')).toBeNull();
  expect(sheetPayload('missing', 'rule')).toBeNull();
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/rule',
    params: { key: expect.any(String) },
  });
});
test('registry retains modal context through nested sheets and clears it back in a tab', () => {
  setSheetSegments(['account', 'about']);
  presentSource({});
  expect(sheetPayload(lastKey(), 'source')?.overModal).toBe(true);
  setSheetSegments(['source']);
  presentSheet({ kind: 'citation', citation: {} });
  expect(sheetPayload(lastKey(), 'citation')?.overModal).toBe(true);
  setSheetSegments(['(tabs)', '(ask)', 'index']);
  presentSource({});
  expect(sheetPayload(lastKey(), 'source')?.overModal).toBe(false);
});
test.each([
  ['recorded', '18 Aug 2026', 'Recorded 18 August 2026'],
  ['found', 'Found 18 Aug 2026', 'Found 18 August 2026'],
] as const)(
  'SourceLine renders %s and opens Sources with its payload',
  (dateRole, line, header) => {
    const root = render(
      <SourceLine
        asOf="2026-08-18"
        dateRole={dateRole}
        citation="Hansard"
        testID="src"
      />,
    );
    expect(text(root)).toContain(`${line}\u00a0· `);
    press(root, 'src');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/source',
      params: { key: expect.any(String) },
    });
    const payload = sheetPayload(lastKey(), 'source')!;
    expect(sourceHeader(payload.details)).toBe(header);
    mockParams = { key: lastKey() };
    const sheet = render(<SourceSheet />);
    expect(sheet.findByType(RouteOptions).props.options.title).toBe(
      copy.sources,
    );
    expect(text(sheet)).toContain(header);
  },
);
test('a source payload always wins over the compatibility direct-open callback', () => {
  const direct = jest.fn();
  const root = render(
    <SourceLine
      citation="Hansard"
      onPress={direct}
      title="Old title"
      testID="src"
    />,
  );
  press(root, 'src');
  expect(direct).not.toHaveBeenCalled();
  expect(sheetPayload(lastKey(), 'source')?.details.citation).toBe('Hansard');
});
test('originals deduplicate, keep their own dates, and open in one tap', () => {
  const root = render(
    <SourceContent
      testID="src-sheet"
      details={{
        asOf: '2026-10-04',
        originals: [
          {
            label: 'Hansard',
            url: 'https://example.org/original',
            asOf: '2026-08-18',
            record: 'Speech',
          },
          { label: 'Duplicate', url: 'https://example.org/original' },
          { label: 'Unsafe', url: 'http://example.org' },
        ],
      }}
    />,
  );
  expect(text(root)).toContain('Speech · 18 Aug 2026');
  expect(text(root)).not.toMatch(/Duplicate|Unsafe/);
  press(root, 'src-sheet-original-0');
  expect(openSource).toHaveBeenCalledWith(
    'https://example.org/original',
    'Hansard',
  );
});
test('in-app originals dismiss then push; originals above a modal use the browser', () => {
  const original = { label: 'Person', url: '/subject/person/anthony-albanese' };
  openOriginal(original, false);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalled();
  jest.clearAllMocks();
  const browser = jest
    .spyOn(WebBrowser, 'openBrowserAsync')
    .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
  openOriginal(original, true);
  expect(router.back).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(browser).toHaveBeenCalledWith(
    expect.stringContaining('/subject/person/anthony-albanese'),
    expect.objectContaining({ dismissButtonStyle: 'done' }),
  );
});
test('source dates stay on the record while saved and partial notes explain the state', () => {
  const root = render(
    <SourceContent
      details={{ asOf: '2026-08-18', savedAt: '2026-11-07', state: 'partial' }}
    />,
  );
  expect(text(root)).toContain('As at 18 August 2026');
  expect(text(root)).toContain(copy.savedCopyNote('2026-11-07'));
  expect(text(root)).toContain(copy.partialNote);
  expect(root.findAllByType(LinkRow).map((node) => node.props.title)).toEqual([
    'Sources and licences',
  ]);
  // Shell 9: the correction is an action, drawn as a tint row last.
  const correction = root.findByType(TintRow);
  expect(correction.props.title).toBe(copy.reportCorrection);
  expect(correction.findByType(Text).props.tone).toBe('navy');
});
test('the source line glyph sits on the centre of the first text line', () => {
  const root = render(
    <SourceLine
      asOf="2026-10-04"
      citation="OPAX daily edition"
      testID="line"
    />,
  );
  const glyph = () =>
    StyleSheet.flatten(
      root.find(
        (node) => node.type === View && node.props.testID === 'line-glyph',
      ).props.style,
    );
  expect(glyph()).toMatchObject({ justifyContent: 'center', minHeight: 18 });
  const lines = root
    .findAllByType(Text)
    .find((node) => node.props.onTextLayout)!;
  act(() =>
    lines.props.onTextLayout({
      nativeEvent: {
        lines: [
          { height: 23, width: 200 },
          { height: 23, width: 120 },
        ],
      },
    }),
  );
  expect(glyph().minHeight).toBe(23);
});
test('licence terms use their own route and Sources and licences is a separate modal', () => {
  const root = render(
    <SourceContent
      details={{ licenceDataset: 'bills', licence: 'CC BY 4.0' }}
      testID="src-sheet"
    />,
  );
  expect(
    root.findAllByType(LinkRow).find((row) => row.props.title === 'Licence')!
      .props.href,
  ).toEqual({ pathname: '/licence/[id]', params: { id: 'bills' } });
  press(root, 'src-sheet-licences');
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/licence/sources',
  });
});
test.each([SourceSheet, MachineNoteSheet, RuleSheet, CitationSheet])(
  'missing payload renders Nothing to show with Done (%p)',
  (Component) => {
    const root = render(<Component />);
    expect(
      root.findAll((node) => node.props.title === 'Nothing to show').length,
    ).toBeGreaterThan(0);
    const options = root.findByType(RouteOptions).props.options;
    const done = options.unstable_headerRightItems()[0];
    expect(done).toMatchObject({ label: 'Done', variant: 'plain' });
    act(() => done.onPress());
    expect(router.back).toHaveBeenCalled();
  },
);
test('S3 detents, grabber, scroll expansion and accessible short sheets', () => {
  expect(routeSheetOptions()).toMatchObject({
    sheetAllowedDetents: [0.5, 1],
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: true,
  });
  expect(routeSheetOptions({ short: true }).sheetAllowedDetents).toBe(
    'fitToContents',
  );
  expect(
    routeSheetOptions({ short: true, accessible: true }).sheetAllowedDetents,
  ).toEqual([1]);
  expect(
    routeSheetOptions({ short: true, table: true, accessible: true }),
  ).toMatchObject({
    sheetAllowedDetents: [0.5, 1],
    sheetInitialDetentIndex: 1,
  });
  expect(
    routeSheetOptions({ citation: true }).sheetLargestUndimmedDetentIndex,
  ).toBe(0);
});

test.each([26, 27])(
  'iOS %s sheets keep a paper bar above sunken content at every detent',
  (version) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: version,
    });
    try {
      for (const variant of [
        {},
        { short: true },
        { short: true, accessible: true },
        { table: true },
        { citation: true },
      ]) {
        const options = routeSheetOptions(variant);
        expect(options).not.toHaveProperty('scrollEdgeEffects');
        expect(options).toMatchObject({
          headerTransparent: false,
          headerStyle: { backgroundColor: colors.paper },
          headerLargeStyle: { backgroundColor: colors.paper },
          contentStyle: { backgroundColor: colors.sunken },
        });
      }
    } finally {
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);
test('rule paragraphs carry the grouped cell padding and minimum height', () => {
  presentSheet({ kind: 'rule', rule: 'Newest records first.' });
  mockParams = { key: lastKey() };
  const root = render(<RuleSheet />);
  const paragraphs = root.findByType(Paragraphs);
  expect(
    StyleSheet.flatten(paragraphs.findByType(View).props.style),
  ).toMatchObject({
    paddingVertical: rhythm.row,
    minHeight: minimumTarget,
  });
  expect(text(paragraphs)).toContain('Newest records first.');
});
test('a fitted rule has only a small top inset and leaves the lower safe area to UIKit', () => {
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 0, bottom: 34, left: 0, right: 0 });
  presentSheet({ kind: 'rule', rule: 'Newest records first.' });
  mockParams = { key: lastKey() };
  const root = render(<RuleSheet />);
  expect(root.findByType(RouteOptions).props.options.sheetAllowedDetents).toBe(
    'fitToContents',
  );
  expect(root.findAllByType(ScrollView)).toHaveLength(0);
  const body = root.find(
    (node) => node.type === View && node.props.testID === 'rule-sheet',
  );
  expect(body.props.collapsable).toBe(false);
  expect(StyleSheet.flatten(body.props.style)).toMatchObject({
    paddingTop: rhythm.tight,
    paddingBottom: 0,
  });
  expect(StyleSheet.flatten(body.props.style).flex).toBeUndefined();
});
test('an AX5 rule keeps a full-height scrollable body', () => {
  Dimensions.set({
    window: { width: 390, height: 844, scale: 3, fontScale: 3.12 },
    screen: { width: 390, height: 844, scale: 3, fontScale: 3.12 },
  });
  presentSheet({ kind: 'rule', rule: 'Newest records first.' });
  mockParams = { key: lastKey() };
  const root = render(<RuleSheet />);
  expect(
    root.findByType(RouteOptions).props.options.sheetAllowedDetents,
  ).toEqual([1]);
  expect(root.findAllByType(ScrollView)).toHaveLength(1);
});
test('short machine notes do not scroll, while tables do', () => {
  presentSheet({
    kind: 'machine',
    note: { title: 'Ignored', body: ['Check the original.'] },
  });
  mockParams = { key: lastKey() };
  const note = render(<MachineNoteSheet />);
  expect(note.findAllByType(ScrollView)).toHaveLength(0);
  expect(text(note)).toContain('Check the original.');
  presentSheet({
    kind: 'table',
    title: 'Votes',
    rows: [{ label: 'Agreed', value: '10' }],
  });
  mockParams = { key: lastKey(), variant: 'table' };
  const table = render(<RuleSheet />);
  expect(table.findAllByType(ScrollView)).toHaveLength(1);
  expect(text(table)).toContain('Agreed');
});
test('short fitted sheets put the note directly under the bar and leave the home indicator room to the sheet', () => {
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 0, bottom: 34, left: 0, right: 0 });
  presentSheet({
    kind: 'machine',
    note: { title: 'Ignored', body: ['Check the original.'] },
  });
  mockParams = { key: lastKey() };
  const note = render(<MachineNoteSheet />);
  const body = StyleSheet.flatten(
    note.find(
      (node) =>
        node.type === View && node.props.testID === 'machine-note-sheet',
    ).props.style,
  );
  // iOS lays fitted content out below the opaque sheet bar: no offset of
  // its own, so the note sits directly under the header and the sheet's
  // measured height holds all of it.
  expect(body.top).toBeUndefined();
  expect(body.paddingTop).toBe(rhythm.group);
  expect(body.paddingBottom).toBe(rhythm.group);
  expect(fittedBottom(34)).toBe(rhythm.group);
});
test('citation bar slots put previous and next leading, then More and Done trailing', () => {
  const previous = jest.fn(),
    next = jest.fn();
  const options = citationBar({
    previous,
    next,
    menu: { type: 'menu', label: 'More', menu: { items: [] } },
  });
  expect(
    options
      .unstable_headerLeftItems()
      .map((item) => (item.type === 'button' ? item.label : null)),
  ).toEqual(['Previous source', 'Next source']);
  expect(
    options.unstable_headerRightItems!({} as never).map((item) =>
      item.type === 'button' || item.type === 'menu' ? item.label : null,
    ),
  ).toEqual(['More', 'Done']);
});
test('corrections open mail when available and offer Copy address without it', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await openCorrection();
  expect(open).toHaveBeenCalledWith(`mailto:${copy.correctionsEmail}`);
  jest.mocked(Linking.canOpenURL).mockResolvedValue(false);
  const fallback = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
  await openCorrection();
  expect(fallback).toHaveBeenCalledWith(
    expect.objectContaining({ options: [copy.copyAddress, 'Cancel'] }),
    expect.any(Function),
  );
});
test('sources without originals are individual non-link rows beneath their date header', () => {
  const root = render(
    <SourceContent
      testID="grouped"
      details={{
        asOf: '2026-11-09',
        citation: [
          { label: 'A', title: 'First source', asOf: '2026-08-18' },
          { label: 'B', title: 'Second source', asOf: '2026-11-08' },
        ],
      }}
    />,
  );
  const group = root
    .findAllByType(InsetGroup)
    .find((node) => node.props.testID === 'grouped-records')!;
  expect(Children.toArray(group.props.children)).toHaveLength(2);
  expect(text(group)).toContain('First source');
  expect(text(group)).toContain('18 Aug 2026');
  expect(text(group)).toContain('Second source');
  expect(text(group)).toContain('8 Nov 2026');
  expect(group.findAllByType(LinkRow)).toHaveLength(0);
  expect(
    group.findAll((node) => typeof node.props?.onPress === 'function'),
  ).toHaveLength(0);
  expect(text(group.parent!)).toContain('As at 9 November 2026');
  expect(StyleSheet.flatten(group.parent!.props.style).gap).toBe(
    rhythm.groupHeader,
  );
  const row = group.findByProps({ testID: 'grouped-citation-0' });
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  });
});
test('source rows with the same date say that date only in the header', () => {
  const root = render(
    <SourceContent
      testID="same-date"
      details={{
        asOf: '2026-11-09',
        citation: [
          { label: 'A', asOf: '2026-11-09' },
          { label: 'B', asOf: '2026-11-09' },
        ],
      }}
    />,
  );
  const group = root
    .findAllByType(InsetGroup)
    .find((node) => node.props.testID === 'same-date-records')!;
  expect(text(group)).toBe('A\nB');
  expect(text(root)).toContain('As at 9 November 2026');
});
test('sheet frame uses the bottom safe-area inset for its content padding', () => {
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 0, bottom: 21, left: 0, right: 0 });
  const root = render(<SourceSheet />);
  expect(
    StyleSheet.flatten(root.findByType(ScrollView).props.contentContainerStyle)
      .paddingBottom,
  ).toBe(rhythm.section + 21);
});

test('interactive dismissal of FilterRoute keeps a rendered switch change', () => {
  const owner = 'route-dismissal-keep';
  const model = billsFilterModel();
  const store = registerFilterModel(model, { owner });
  const opening = store.get();
  mockParams = { list: 'bills', owner };
  const root = render(<FilterRoute />);
  const renderer = mounted.at(-1)!;
  act(() => root.findByType(SwitchRow).props.onValueChange(true));
  expect(root.findByType(SwitchRow).props.value).toBe(true);
  act(() => renderer.unmount());
  mounted.pop();
  expect(filterStore('bills', owner)!.get()).toEqual({
    ...opening,
    divided: true,
  });
  expect(router.back).not.toHaveBeenCalled();
});
test('FilterRoute Cancel restores the opening snapshot after a rendered switch change', () => {
  const owner = 'route-dismissal-cancel';
  const model = billsFilterModel();
  const store = registerFilterModel(model, {
    owner,
    value: { ...model.initial, parliament: 48 },
  });
  const opening = store.get();
  mockParams = { list: 'bills', owner };
  const root = render(<FilterRoute />);
  act(() => root.findByType(SwitchRow).props.onValueChange(true));
  expect(store.get().divided).toBe(true);
  const cancel = root
    .findByType(RouteOptions)
    .props.options.unstable_headerLeftItems()[0];
  expect(cancel.label).toBe('Cancel');
  act(() => cancel.onPress());
  expect(filterStore('bills', owner)!.get()).toEqual(opening);
  expect(root.findByType(SwitchRow).props.value).toBe(false);
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('MachinePill presents its full registry note', () => {
  const root = render(
    <MachinePill
      note={{ title: 'Machine-written', body: ['Check it.'] }}
      testID="pill"
    />,
  );
  press(root, 'pill');
  expect(sheetPayload(lastKey(), 'machine')?.note.body).toEqual(['Check it.']);
});
