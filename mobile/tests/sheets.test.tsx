import { act, type ReactElement } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  ActionSheetIOS,
  Dimensions,
  Linking,
  ScrollView,
  Text as NativeText,
} from 'react-native';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  SourceLine,
  SourceSheet as LegacySourceSheet,
  SheetBody,
} from '../src/design/source';
import { InfoButton } from '../src/design/layout';
import { MachineLabel, MachinePill } from '../src/design/labels';
import { copy } from '../src/design/copy';
import {
  presentSheet,
  presentSource,
  sheetPayload,
  setSheetSegments,
} from '../src/navigation/sheets';
import SourceSheet, {
  openOriginal,
  SourceContent,
  sourceHeader,
} from '../src/features/sheets/SourceSheet';
import MachineNoteSheet from '../src/features/sheets/MachineNoteSheet';
import RuleSheet from '../src/features/sheets/RuleSheet';
import CitationSheet, {
  citationBar,
} from '../src/features/sheets/CitationSheet';
import { routeSheetOptions } from '../src/features/sheets/frame';
import { openCorrection, openSource } from '../src/navigation/external';
import { LinkRow } from '../src/design/rows';

jest.mock('../src/design/environment', () => ({
  ...jest.requireActual('../src/design/environment'),
  isE2E: false,
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn() },
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
    expect(text(root)).toContain(`${line} · `);
    press(root, 'src');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/source',
      params: { key: expect.any(String) },
    });
    const payload = sheetPayload(lastKey(), 'source')!;
    expect(sourceHeader(payload.details)).toBe(header);
    mockParams = { key: lastKey() };
    const sheet = render(<SourceSheet />);
    expect(sheet.findByType(Stack.Screen).props.options.title).toBe(
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
    copy.reportCorrection,
  ]);
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
    pathname: '/licences',
    params: { dataset: 'bills' },
  });
});
test.each([SourceSheet, MachineNoteSheet, RuleSheet, CitationSheet])(
  'missing payload renders Nothing to show with Done (%p)',
  (Component) => {
    const root = render(<Component />);
    expect(
      root.findAll((node) => node.props.title === 'Nothing to show').length,
    ).toBeGreaterThan(0);
    const options = root.findByType(Stack.Screen).props.options;
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
test('MachineLabel and MachinePill present registry notes with unchanged props', () => {
  const root = render(
    <>
      <MachineLabel explanation="Written by a model" testID="legacy" />
      <MachinePill
        note={{ title: 'Machine-written', body: ['Check it.'] }}
        testID="pill"
      />
    </>,
  );
  press(root, 'legacy');
  expect(sheetPayload(lastKey(), 'machine')?.note.body[0]).toBe(
    'Written by a model.',
  );
  press(root, 'pill');
  expect(sheetPayload(lastKey(), 'machine')?.note.body).toEqual(['Check it.']);
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
test('legacy SheetBody and SourceSheet remain exported', () => {
  expect(SheetBody).toEqual(expect.any(Function));
  expect(LegacySourceSheet).toEqual(expect.any(Function));
});

test('InfoButton presents /rule through its retained notes adapter without changing props', () => {
  const root = render(
    <InfoButton
      title="About these figures"
      notes={['A rule.', null, 'A caveat.']}
      testID="info"
    />,
  );
  press(root, 'info');
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/rule',
    params: { key: expect.any(String) },
  });
  expect(sheetPayload(lastKey(), 'rule')?.rule).toBe('A rule.\n\nA caveat.');
});
