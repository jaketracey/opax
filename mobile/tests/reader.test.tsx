// The record reader (records.md 2): Ask and Share in the bottom toolbar,
// a grant or contract's organisation row only with its id, plain-language
// states, the find bar for an incoming query, the Citation formats deep
// link, and the Contents hand-back for bill text (records.md 4.2).
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { ApiError } from '../src/api/errors';
import { catalogs } from '../src/api/runtime';
import { records } from '../src/features/records/runtime';
import { decodeDocument } from '../src/features/records/model';
import DocumentReader from '../src/features/records/DocumentReader';
import {
  publishContents,
  subscribeContents,
} from '../src/features/records/contentsChannel';
import { ContentUnavailable, LinkRow } from '../src/design/primitives';
import { citeRoute, moneyRecordRoute } from '../src/navigation/routes';
import { index, manifest, people, roster, slugs } from './pinned';

const responses: Record<string, unknown> = fixtures.responses;
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
      Screen: () => null,
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
    view = TestRenderer.create(component);
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
const toolbarButtons = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findAll((node) => (node.type as unknown) === 'ToolbarButton');

beforeEach(() => {
  jest.clearAllMocks();
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

test('Ask about this in the toolbar drafts a question and never sends it', async () => {
  const view = await mount(<DocumentReader />);
  const ask = toolbarButtons(view).find(
    (node) => node.props.accessibilityLabel === 'Ask about this record',
  )!;
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

test('an incoming search query opens the find bar on its first match', async () => {
  mockParams = { slug: 'speech-1205524', q: 'paragraph' };
  const view = await mount(<DocumentReader />);
  const labels = toolbarButtons(view).map(
    (node) => node.props.accessibilityLabel as string,
  );
  expect(labels).toEqual(
    expect.arrayContaining(['Previous match', 'Next match', 'Done']),
  );
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^Match 1 of \d+ for paragraph$/),
    ]),
  );
  // Done returns the reading toolbar.
  const done = toolbarButtons(view).find(
    (node) => node.props.accessibilityLabel === 'Done',
  )!;
  await act(async () => done.props.onPress());
  expect(
    toolbarButtons(view).some(
      (node) => node.props.accessibilityLabel === 'Ask about this record',
    ),
  ).toBe(true);
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
