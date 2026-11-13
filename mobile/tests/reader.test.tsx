import { withNavigationOptions } from './navigation-options';
// The record reader (records.md 2): Ask and Share in the bottom toolbar,
// a grant or contract's organisation row only with its id, plain-language
// states, the find bar for an incoming query, the Citation formats deep
// link, and the Contents hand-back for bill text (records.md 4.2).
import { router } from 'expo-router';
import { act } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Text as NativeText,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { ApiError } from '../src/api/errors';
import { catalogs } from '../src/api/runtime';
import {
  ContentUnavailable,
  Disclosure,
  Button,
  SectionHeader,
  LinkRow,
  MachinePill,
} from '../src/design/primitives';
import { useReduceMotion } from '../src/design/accessibility';
import DocumentReader from '../src/features/records/DocumentReader';
import { FindControls } from '../src/features/records/FindControls';
import { ReaderList } from '../src/features/records/ReaderList';
import {
  publishContents,
  subscribeContents,
} from '../src/features/records/contentsChannel';
import { decodeDocument } from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { citeRoute, moneyRecordRoute } from '../src/navigation/routes';
import { sheetPayload } from '../src/navigation/sheets';
import { rhythm } from '../src/design/tokens';
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
  '%s has a permanent summary heading and an Ask button after the text at font scale %s',
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
    const heading = view.root
      .findAllByType(SectionHeader)
      .find((node) => node.props.testID === 'doc-brief')!;
    expect(heading.props.title).toBe('In short');
    expect(heading.props.accessory.type).toBe(MachinePill);
    expect(
      view.root
        .findAllByType(Disclosure)
        .some((node) => node.props.testID === 'doc-brief'),
    ).toBe(false);
    const ask = view.root
      .findAllByType(Button)
      .find((node) => node.props.testID === 'doc-ask')!;
    expect(ask.props).toMatchObject({
      variant: 'primary',
      label: 'Ask about this',
    });
    const subject: Record<string, string> = {
      speech: 'speech',
      division: 'division',
      bill_text: 'bill text',
      press_release: 'release',
      government_release: 'release',
      research_report: 'report',
      grant_invitation: 'grant invitation',
      grant_award: 'grant award',
      contract: 'contract',
      legal: 'legal record',
    };
    expect(ask.props.accessibilityLabel).toContain(
      `this ${subject[kind] ?? 'record'}:`,
    );
    expect(ask.props.accessibilityHint).toBe(
      'Opens Ask with a question drafted',
    );
    const ids = view.root
      .findAll((node) => typeof node.type === 'string' && node.props.testID)
      .map((node) => node.props.testID);
    expect(ids.indexOf('doc-ask')).toBeGreaterThan(
      ids.indexOf('doc-brief-body'),
    );
    expect(text(view)).toContain('Another record summary.');
    expect(text(view)).toContain('Machine-written');
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
      note: {
        title: 'Machine-written',
        body: [
          kind === 'speech'
            ? 'Written by a model from this speech. It is not part of the record.'
            : kind === 'bill_text'
              ? 'Written by a model from this bill text. It is not part of the bill.'
              : 'Written by a model. It is not part of the record.',
        ],
      },
    });
    expect(text(view)).toContain('Another record summary.');
    await act(async () => view.unmount());
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

test('Ask about this is a button that drafts a question and never sends it', async () => {
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
    /^This record isn’t in OPAX$/,
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
  // The shared not-found pattern (sweep 2, item 2): a title, a body and
  // Search, centred on the page.
  const state = view.root.findByType(ContentUnavailable);
  expect(state.props.title).toBe('This record isn’t in OPAX');
  expect(state.props.body).toBe('The link may be old.');
  expect(state.props.action.label).toBe('Search the record');
  expect(view.root.findByType(ReaderList).props.centred).toBe(true);
  // Screen's foot, not the reader's double one: the block sat 18 pt above
  // the other not-found pages on the device.
  const list = view.root.findAll(
    (node) =>
      node.props.testID === 'doc-reader' && !!node.props.contentContainerStyle,
  )[0]!;
  const content = StyleSheet.flatten(list.props.contentContainerStyle);
  expect(content.paddingTop).toBe(rhythm.block);
  expect(content.paddingBottom).toBe(rhythm.section);
  expect(content.justifyContent).toBe('center');
  await act(async () => view.unmount());
});

test('an incoming search query puts the find controls in the bar, above the tab bar', async () => {
  mockParams = { slug: 'speech-1205524', q: 'paragraph' };
  const view = await mount(<DocumentReader />);
  expect(toolbars(view)).toHaveLength(0);
  expect(view.root.findAllByType(FindControls)).toHaveLength(0);
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
  expect(StyleSheet.flatten(status.props.style).position).toBeUndefined();
  expect(
    view.root
      .findByType(ReaderList)
      .findAllByProps({ testID: 'doc-find-status' }).length,
  ).toBeGreaterThan(0);
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

test('Android search arrivals expose Previous, Next and Done while the native selection remains available', async () => {
  const original = Platform.OS;
  Platform.OS = 'android';
  try {
    mockParams = { slug: 'speech-1205524', q: 'paragraph' };
    const view = await mount(<DocumentReader />);
    const controls = () => view.root.findByType(FindControls);
    expect(controls().props.total).toBeGreaterThan(1);
    expect(controls().props.current).toBe(0);
    await act(async () => controls().props.onNext());
    expect(view.root.findByType(ReaderList).props.jumpTo).toMatchObject({
      position: 0.33,
    });
    await act(async () => controls().props.onNext());
    expect(controls().props.current).toBe(1);
    expect(barItems().map((item) => item.label)).toContain('More');
    expect(
      view.root.findAllByType(NativeText).some((n) => n.props.selectable),
    ).toBe(true);
    await act(async () => controls().props.onDone());
    expect(view.root.findAllByType(FindControls)).toHaveLength(0);
    expect(view.root.findByType(ReaderList).props.find).toBeNull();
    await act(async () => view.unmount());
  } finally {
    Platform.OS = original;
  }
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

test('an explicit find with no hits says No matches, with no zero-of-zero counter', async () => {
  mockParams = { slug: speech.slug, q: 'no-such-phrase' };
  const view = await mount(<DocumentReader />);
  expect(text(view)).toContain('No matches for no-such-phrase');
  expect(text(view)).not.toContain('0 of 0');
  const status = view.root.find(
    (node) =>
      node.props.testID === 'doc-find-status' &&
      typeof node.props.onPress === 'function',
  );
  expect(status.props.disabled).toBe(true);
  expect(status.props.accessibilityHint).toBeUndefined();
  await act(async () => view.unmount());
});

test.each([
  [
    'CFMEU Construction & General Division VIC/TAS Branch',
    'CFMEU Construction and General Division Victoria–Tasmania branch',
  ],
  ['Example & Co', 'Example and Co spoke.'],
])('an arriving find matches tolerant spelling: %s', async (q, body) => {
  mockParams = {
    slug: speech.slug,
    q: q!,
    find: 'auto',
  };
  jest
    .mocked(records.document)
    .mockResolvedValue(record({ ...speech, text: body! }));
  const view = await mount(<DocumentReader />);
  expect(barItems().map((item) => item.label)).toContain('Done');
  expect(text(view)).toContain('1 of 1');
  expect(view.root.findByType(ReaderList).props.find.current).toEqual({
    part: 0,
    start: 0,
  });
  await act(async () => view.unmount());
});

test('a search arrival with no matching entity opens the normal speech and its actions', async () => {
  mockParams = { slug: speech.slug, q: 'An absent organisation', find: 'auto' };
  const view = await mount(<DocumentReader />);
  expect(barItems().map((item) => item.label)).toContain('More');
  expect(barItems().map((item) => item.label)).not.toContain('Done');
  expect(view.root.findAllByProps({ testID: 'doc-find-status' })).toHaveLength(
    0,
  );
  expect(
    view.root
      .findByType(ReaderList)
      .props.parts.map((part: { text: string }) => part.text)
      .join(''),
  ).toBe(speech.text.trim());
  await act(async () => view.unmount());
});

test.each(
  (['ios', 'android'] as const).flatMap((os) =>
    [390, 1024].flatMap((width) =>
      ['paragraph', 'no-such-phrase'].map((q) => ({ os, width, q })),
    ),
  ),
)(
  '$os at width $width has exactly one find status for $q',
  async ({ os, width, q }) => {
    const original = Platform.OS;
    Platform.OS = os;
    jest.mocked(useWindowDimensions).mockReturnValue({
      width,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });
    try {
      mockParams = { slug: speech.slug, q };
      const view = await mount(<DocumentReader />);
      const status = view.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'doc-find-status',
      );
      expect(status).toHaveLength(1);
      const inList = view.root
        .findByType(ReaderList)
        .findAll(
          (node) =>
            typeof node.type === 'string' &&
            node.props.testID === 'doc-find-status',
        );
      expect(inList).toHaveLength(os === 'ios' ? 1 : 0);
      if (q === 'no-such-phrase') {
        expect(text(view)).toContain(`No matches for ${q}`);
        expect(text(view)).not.toContain('0 of 0');
      }
      await act(async () => view.unmount());
    } finally {
      Platform.OS = original;
    }
  },
);

test.each(['ios', 'android'] as const)(
  '%s Next and Previous announce once through the platform mechanism, including wraparound',
  async (os) => {
    const original = Platform.OS;
    Platform.OS = os;
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    try {
      mockParams = { slug: speech.slug, q: 'tax', find: 'auto' };
      jest
        .mocked(records.document)
        .mockResolvedValue(record({ ...speech, text: 'tax and tax' }));
      const view = await mount(<DocumentReader />);
      const step = async (which: 'Next' | 'Previous') => {
        await act(async () => {
          if (os === 'ios')
            barItems().find((item) => item.label === `${which} match`)!
              .onPress!();
          else
            view.root
              .findByType(FindControls)
              .props[which === 'Next' ? 'onNext' : 'onPrevious']();
        });
      };
      const expectPosition = (position: number) => {
        if (os === 'ios')
          expect(announce).toHaveBeenLastCalledWith(`Match ${position} of 2`);
        else {
          expect(announce).not.toHaveBeenCalled();
          const status = view.root
            .findAllByType(NativeText)
            .find((node) => node.props.testID === 'doc-find-status')!;
          expect(status.props.accessibilityLiveRegion).toBe('polite');
          expect(status.props.children).toBe(`Match ${position} of 2 for tax`);
        }
      };
      await step('Next');
      expectPosition(1);
      await step('Next');
      expectPosition(2);
      await step('Next');
      expectPosition(1);
      await step('Previous');
      expectPosition(2);
      expect(announce).toHaveBeenCalledTimes(os === 'ios' ? 4 : 0);
      await act(async () => view.unmount());
    } finally {
      announce.mockRestore();
      Platform.OS = original;
    }
  },
);

test('an embedded iPad reader keeps a citation highlight without an undismissable find status', async () => {
  mockParams = { slug: speech.slug, q: 'paragraph', find: 'auto' };
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 1024, height: 1366, scale: 2, fontScale: 1 });
  const view = await mount(
    <DocumentReader
      recordSlug={speech.slug}
      citedPassage="paragraph"
      embedded
    />,
  );
  expect(view.root.findAllByProps({ testID: 'doc-find-status' })).toHaveLength(
    0,
  );
  expect(
    view.root.findAllByProps({ testID: 'doc-passage-highlight' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test.each(['tax', 'housing afford'])(
  'a search arrival for %s retains a literal substring highlight',
  async (q) => {
    mockParams = { slug: speech.slug, q, find: 'auto' };
    jest
      .mocked(records.document)
      .mockResolvedValue(
        record({ ...speech, text: 'Taxes and housing affordability.' }),
      );
    const view = await mount(<DocumentReader />);
    expect(barItems().map((item) => item.label)).toContain('Done');
    expect(text(view)).toContain('1 of 1');
    expect(view.root.findByType(ReaderList).props.find.current).toEqual({
      part: 0,
      start: q === 'tax' ? 0 : 10,
    });
    await act(async () => view.unmount());
  },
);
