import { withNavigationOptions } from './navigation-options';
// The record reader (records.md 2): Ask and Share in the bottom toolbar,
// a grant or contract's organisation row only with its id, plain-language
// states, the find bar for an incoming query, the Citation formats deep
// link, and the Contents hand-back for bill text (records.md 4.2).
import { router } from 'expo-router';
import { act } from 'react';
import {
  LayoutAnimation,
  Text as NativeText,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { ApiError } from '../src/api/errors';
import { catalogs } from '../src/api/runtime';
import {
  ContentUnavailable,
  Disclosure,
  Icon,
  LinkRow,
  MachinePill,
} from '../src/design/primitives';
import { useReduceMotion } from '../src/design/accessibility';
import DocumentReader from '../src/features/records/DocumentReader';
import {
  publishContents,
  subscribeContents,
} from '../src/features/records/contentsChannel';
import { decodeDocument } from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { citeRoute, moneyRecordRoute } from '../src/navigation/routes';
import { sheetPayload } from '../src/navigation/sheets';
import { index, manifest, people, roster, slugs } from './pinned';

const responses: Record<string, unknown> = fixtures.responses;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: jest.fn(() => false),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const speech = decodeDocument(responses['/api/resource/speech-1205524']);
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
jest.mock('../src/features/records/runtime', () => ({
  records: {
    document: jest.fn(),
    recent: jest.fn(),
    similar: jest.fn(),
    billManifest: jest.fn(),
    billVersion: jest.fn(),
  },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    billFor: jest.fn(),
    directory: jest.fn(),
    bills: jest.fn(),
    corpus: jest.fn(),
  },
}));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
const mockOpenAsk = jest.fn();
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => mockOpenAsk,
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof React>('react');
  const part = (name: string) => (props: { children?: React.ReactNode }) =>
    createElement(name, props, props.children);
  return {
    useSegments: () => [],
    router: { push: jest.fn(), setParams: jest.fn(), back: jest.fn() },
    Link: Object.assign(part('Link'), {
      Trigger: part('LinkTrigger'),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: {
      Screen: ({ options }: { options?: Record<string, unknown> }) => {
        if (options) mockOptions = options;
        return null;
      },
      Toolbar: Object.assign(part('Toolbar'), {
        Button: part('ToolbarButton'),
        Spacer: () => null,
        View: part('ToolbarView'),
      }),
    },
    useLocalSearchParams: () => mockParams,
  };
});

async function mount(component: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(component, (options) => {
        mockOptions = options;
      }),
    );
  });
  return view;
}
const text = (view: TestRenderer.ReactTestRenderer) =>
  view.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('\n');
function hostParent(node: ReactTestInstance) {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent!;
}
let mockOptions: Record<string, unknown> = {};
const toolbars = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findAll((node) => (node.type as unknown) === 'Toolbar');
/** The bar's items, as iOS draws them (the last is rightmost). */
const barItems = () =>
  (
    mockOptions.unstable_headerRightItems as
      | (() => { label: string; onPress?: () => void }[])
      | undefined
  )?.() ?? [];

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest.mocked(useReduceMotion).mockReturnValue(false);
  mockParams = { slug: 'speech-1205524' };
  jest.mocked(catalogs.directory).mockResolvedValue({
    roster: record(roster),
    slugs: record(slugs),
    people: record(people),
    manifest: record(manifest),
    electorates: record(index),
  } as never);
  jest.mocked(catalogs.bills).mockResolvedValue(record({ bills: [] }) as never);
  jest.mocked(catalogs.billFor).mockRejectedValue(new Error('none'));
  jest.mocked(records.document).mockResolvedValue(record(speech));
  jest.mocked(records.similar).mockResolvedValue(record([]) as never);
});

test.each([false, true])(
  'speech summaries start open and keep a collapsed choice with Reduce Motion %s',
  async (reduced) => {
    jest.mocked(useReduceMotion).mockReturnValue(reduced);
    const animate = jest.spyOn(LayoutAnimation, 'configureNext');
    jest
      .mocked(records.document)
      .mockResolvedValue(record({ ...speech, summary: 'A speech summary.' }));
    const view = await mount(<DocumentReader />);
    const toggle = () =>
      view.root.find(
        (node) =>
          node.props.testID === 'doc-brief' &&
          typeof node.props.onPress === 'function',
      );
    expect(toggle().props.accessibilityState).toEqual({ expanded: true });
    expect(text(view)).toContain('A speech summary.');
    expect(text(view)).toContain('Machine-written');
    const pill = view.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'doc-brief-label',
    );
    const header = hostParent(hostParent(pill));
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    });
    expect(StyleSheet.flatten(hostParent(pill).props.style)).toMatchObject({
      marginLeft: 'auto',
      maxWidth: '100%',
    });
    // These are separate buttons: opening provenance must not collapse the summary.
    expect(
      toggle().findAll((node) => node.props.testID === 'doc-brief-label'),
    ).toHaveLength(0);
    await act(async () =>
      view.root
        .find(
          (node) =>
            node.props.testID === 'doc-brief-label' &&
            typeof node.props.onPress === 'function',
        )
        .props.onPress(),
    );
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/machine-note' }),
    );
    expect(toggle().props.accessibilityState).toEqual({ expanded: true });
    animate.mockClear();
    await act(async () => toggle().props.onPress());
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    expect(text(view)).not.toContain('A speech summary.');
    expect(text(view)).toContain('Machine-written');
    if (reduced) expect(animate).not.toHaveBeenCalled();
    else expect(animate).toHaveBeenCalledTimes(1);
    await act(async () =>
      view.update(
        withNavigationOptions(<DocumentReader />, (options) => {
          mockOptions = options;
        }),
      ),
    );
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    // Another speech on the same reader gets its own default.
    await act(async () =>
      view.update(
        withNavigationOptions(
          <DocumentReader recordSlug="speech-another" />,
          (options) => {
            mockOptions = options;
          },
        ),
      ),
    );
    expect(toggle().props.accessibilityState).toEqual({ expanded: true });
    await act(async () => view.unmount());
    // A fresh visit starts open again.
    const revisit = await mount(<DocumentReader />);
    expect(
      revisit.root.find(
        (node) =>
          node.props.testID === 'doc-brief' &&
          typeof node.props.onPress === 'function',
      ).props.accessibilityState,
    ).toEqual({ expanded: true });
    await act(async () => revisit.unmount());
    animate.mockRestore();
  },
);

test.each(
  [
    'speech',
    'press_release',
    'government_release',
    'bill_text',
    'division',
    'grant_invitation',
    'grant_award',
    'contract',
    'research_report',
    'legal',
    'another_kind',
  ].flatMap((kind) =>
    [1, 1.786, 3.571].map((fontScale) => [kind, fontScale] as const),
  ),
)(
  '%s summary keeps independent header controls at font scale %s',
  async (kind, fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
    jest.mocked(records.document).mockResolvedValue(
      record({
        ...speech,
        speaker: null,
        labels: { ...speech.labels, kind },
        summary: 'Another record summary.',
      }),
    );
    const view = await mount(<DocumentReader />);
    const toggle = view.root.find(
      (node) =>
        node.props.testID === 'doc-brief' &&
        typeof node.props.onPress === 'function',
    );
    const disclosure = view.root.find(
      (node) => node.type === Disclosure && node.props.testID === 'doc-brief',
    );
    expect(disclosure.props.accessory.type).toBe(MachinePill);
    const pill = view.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'doc-brief-label',
    );
    const header = hostParent(toggle);
    expect(header).toBe(hostParent(hostParent(pill)));
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    });
    const label = toggle.findByType(NativeText);
    expect(label.props.children).toBe('In short');
    const textStyle = StyleSheet.flatten(
      hostParent(hostParent(label)).props.style,
    );
    // A zero flex basis squeezes the heading before the pill can wrap.
    expect(textStyle).toMatchObject({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
    });
    expect(textStyle.flex).toBeUndefined();
    expect(toggle.findByType(Icon).props.name).toBe('chevron.down');
    expect(toggle.findAllByType(MachinePill)).toHaveLength(0);
    expect(
      view.root
        .findByProps({ testID: 'doc-brief-body' })
        .findAllByType(MachinePill),
    ).toHaveLength(0);
    expect(
      header
        .findAllByType(NativeText)
        .every((node) => node.props.numberOfLines === undefined),
    ).toBe(true);
    const expectedNote = {
      title: 'Machine-written',
      body: [
        kind === 'speech'
          ? 'Written by a model from this speech. It is not part of the record.'
          : kind === 'bill_text'
            ? 'Written by a model from this bill text. It is not part of the bill.'
            : 'Written by a model. It is not part of the record.',
      ],
    };
    const openNote = async () => {
      await act(async () =>
        view.root
          .find(
            (node) =>
              node.props.testID === 'doc-brief-label' &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress(),
      );
      const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
        pathname: string;
        params: { key: string };
      };
      expect(route.pathname).toBe('/machine-note');
      expect(sheetPayload(route.params.key, 'machine')).toMatchObject({
        testID: 'doc-brief-label',
        note: expectedNote,
      });
    };
    expect(toggle.props.accessibilityState).toEqual({ expanded: true });
    await openNote();
    expect(toggle.props.accessibilityState).toEqual({ expanded: true });
    expect(text(view)).toContain('Another record summary.');
    await act(async () => toggle.props.onPress());
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(text(view)).not.toContain('Another record summary.');
    expect(text(view)).toContain('Machine-written');
    await openNote();
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    await act(async () =>
      view.update(
        withNavigationOptions(<DocumentReader />, (options) => {
          mockOptions = options;
        }),
      ),
    );
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    await act(async () => view.unmount());
    const revisit = await mount(<DocumentReader />);
    expect(text(revisit)).toContain('Another record summary.');
    await act(async () => revisit.unmount());
  },
);

test.each([null, ''])(
  'a record with summary %s has no In short section',
  async (summary) => {
    jest
      .mocked(records.document)
      .mockResolvedValue(record({ ...speech, summary }));
    const view = await mount(<DocumentReader />);
    expect(view.root.findAllByProps({ testID: 'doc-brief' })).toHaveLength(0);
    await act(async () => view.unmount());
  },
);

test('closing the document aborts its pending speaker directory read', async () => {
  let finish!: () => void;
  jest.mocked(catalogs.directory).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({} as never);
      }),
  );
  const view = await mount(<DocumentReader />);
  const signal = jest.mocked(catalogs.directory).mock.calls[0]![1];
  expect(signal).toBeInstanceOf(AbortSignal);
  await act(async () => view.unmount());
  expect(signal!.aborted).toBe(true);
  await act(async () => finish());
});

test('Ask about this is a row that drafts a question and never sends it', async () => {
  const view = await mount(<DocumentReader />);
  // iOS draws no bottom toolbar, which the floating tab bar would cover.
  expect(toolbars(view)).toHaveLength(0);
  const ask = view.root.find(
    (node) =>
      node.props.testID === 'doc-ask' &&
      typeof node.props.onPress === 'function',
  );
  await act(async () => ask.props.onPress());
  expect(mockOpenAsk).toHaveBeenCalledTimes(1);
  const scope = mockOpenAsk.mock.calls[0][0];
  expect(scope.question).toEqual(expect.any(String));
  expect(scope).not.toHaveProperty('send');
  await act(async () => view.unmount());
});

const org = 'Example Research Ltd';
test.each([
  [
    'with a recipient id',
    { recipient_id: 'org-123', recipient_name: org },
    {},
    'federal',
  ],
  ['without a recipient id', { recipient_name: org }, {}, null],
  // A private individual is never named or linked (money-public/privacy.ts).
  [
    'to a named person',
    { recipient_id: 'org-124', recipient_name: 'Mr John Smith' },
    {},
    null,
  ],
  [
    'to a person id',
    { recipient_id: 'person:42', recipient_name: org },
    {},
    null,
  ],
  [
    'in Queensland',
    {
      recipient_id: 'org-123',
      recipient_name: org,
      jurisdiction: 'Queensland',
    },
    {},
    'qld',
  ],
  // Money records know federal and Queensland only.
  [
    'labelled NSW',
    { recipient_id: 'org-123', recipient_name: org },
    { state: 'nsw' },
    'federal',
  ],
] as const)(
  'a grant record %s: the organisation row follows',
  async (_case, metadata, labels, jur) => {
    jest.mocked(records.document).mockResolvedValue(
      record({
        ...speech,
        speaker: null,
        labels: { ...speech.labels, ...labels, kind: 'grant_award' },
        metadata: { ...speech.metadata, ...metadata },
      }),
    );
    const view = await mount(<DocumentReader />);
    const rows = view.root
      .findAllByType(LinkRow)
      .filter((row) => row.props.testID === 'doc-organisation');
    if (jur) {
      expect(rows).toHaveLength(1);
      expect(rows[0]!.props.title).toBe(`Open ${org}`);
      expect(rows[0]!.props.href).toEqual(
        moneyRecordRoute({ rid: 'org-123', jur }, org),
      );
    } else expect(rows).toHaveLength(0);
    await act(async () => view.unmount());
  },
);

test('an undated division draws no vote split', async () => {
  const division = decodeDocument(
    responses['/api/resource/division-federal-senate-10701'],
  );
  mockParams = { slug: 'division-federal-senate-10701' };
  jest.mocked(records.document).mockResolvedValue(record(division));
  const dated = await mount(<DocumentReader />);
  expect(
    dated.root.findAllByProps({ testID: 'doc-votes' }).length,
  ).toBeGreaterThan(0);
  await act(async () => dated.unmount());
  // No date anywhere: not in the record, its metadata or its title.
  const { date: _date, ...metadata } = division.metadata;
  jest.mocked(records.document).mockResolvedValue(
    record({
      ...division,
      date: undefined,
      title: 'That the motion be agreed to',
      metadata,
    } as never),
  );
  mockParams = { slug: 'division-federal-senate-10701' };
  const view = await mount(<DocumentReader />);
  expect(view.root.findAllByProps({ testID: 'doc-votes' })).toHaveLength(0);
  await act(async () => view.unmount());
});

test.each([
  [
    'offline',
    new ApiError('offline', 'The request failed'),
    /^Not saved on this .+ yet$/,
  ],
  [
    'not found',
    new ApiError('not-found', 'HTTP 404'),
    /^This record isn't available$/,
  ],
  [
    'unreadable',
    new ApiError('invalid-data', 'Decoder failed'),
    /^This record couldn't be loaded$/,
  ],
])('%s: the reader says so in plain words', async (_case, error, title) => {
  jest.mocked(records.document).mockRejectedValue(error);
  const view = await mount(<DocumentReader />);
  const state = view.root.findByType(ContentUnavailable);
  expect(state.props.title).toMatch(title);
  expect(text(view)).not.toMatch(
    /HTTP|404|decod|invalid|ApiError|request failed/i,
  );
  await act(async () => view.unmount());
});

test('a link that names no record says so', async () => {
  mockParams = { slug: '../nope' };
  jest
    .mocked(records.document)
    .mockRejectedValue(new ApiError('invalid-data', 'bad slug'));
  const view = await mount(<DocumentReader />);
  expect(view.root.findByType(ContentUnavailable).props.title).toBe(
    "This link doesn't open a record",
  );
  await act(async () => view.unmount());
});

test('an incoming search query puts the find controls in the bar, above the tab bar', async () => {
  mockParams = { slug: 'speech-1205524', q: 'paragraph' };
  const view = await mount(<DocumentReader />);
  expect(toolbars(view)).toHaveLength(0);
  expect(barItems().map((item) => item.label)).toEqual([
    'Previous match',
    'Next match',
    'Done',
  ]);
  const status = view.root.find(
    (node) =>
      node.props.testID === 'doc-find-status' &&
      typeof node.props.onPress === 'function',
  );
  expect(status.props.accessibilityLabel).toMatch(
    /^Match 1 of \d+ for paragraph$/,
  );
  // Done gives the bar back to ⋯.
  const done = barItems().find((item) => item.label === 'Done')!;
  await act(async () => done.onPress!());
  expect(barItems().map((item) => item.label)).toContain('More');
  expect(view.root.findAllByProps({ testID: 'doc-find-status' })).toHaveLength(
    0,
  );
  await act(async () => view.unmount());
});

test('the Citation formats deep link opens the record, then the sheet', async () => {
  mockParams = { slug: 'speech-1205524', cite: '1' };
  const view = await mount(<DocumentReader />);
  expect(router.setParams).toHaveBeenCalledWith({ cite: undefined });
  expect(router.push).toHaveBeenCalledWith(citeRoute('speech-1205524'));
  expect(
    view.root.findAllByProps({ testID: 'doc-title' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test('Contents hands back each choice to its own bill and version only', () => {
  const mine = jest.fn();
  const other = jest.fn();
  const offMine = subscribeContents('au-federal-r7534', 'r7534-aspassed', mine);
  const offOther = subscribeContents(
    'au-federal-r9999',
    'r9999-aspassed',
    other,
  );
  publishContents('au-federal-r7534', 'r7534-aspassed', 'part-1');
  publishContents('au-federal-r7534', 'r7534-aspassed', 'part-1');
  // The same section twice still arrives twice, with a new nonce each time.
  expect(mine).toHaveBeenCalledTimes(2);
  expect(mine.mock.calls[0][0].section).toBe('part-1');
  expect(mine.mock.calls[1][0].nonce).toBeGreaterThan(
    mine.mock.calls[0][0].nonce,
  );
  expect(other).not.toHaveBeenCalled();
  // Another version of the same bill is another reader.
  publishContents('au-federal-r7534', 'r7534-first-reps', 'part-1');
  expect(mine).toHaveBeenCalledTimes(2);
  offMine();
  offOther();
  publishContents('au-federal-r7534', 'r7534-aspassed', 'part-1');
  expect(mine).toHaveBeenCalledTimes(2);
});

test('a cited passage opens in place with a highlight and keeps the usual reader bar', async () => {
  mockParams = { slug: 'speech-1205524', passage: 'paragraph' };
  const view = await mount(<DocumentReader />);
  expect(
    view.root.findAllByProps({ testID: 'doc-passage-highlight' }).length,
  ).toBeGreaterThan(0);
  expect(view.root.findAllByProps({ testID: 'doc-find-status' })).toHaveLength(
    0,
  );
  expect(barItems().map((item) => item.label)).toContain('More');
  await act(async () => view.unmount());
});
