// Records, Apple-design wave 4 (records.md 2 to 5), after design pass 5:
// the reader has one meta line, the title in the record face, the speaker as
// a PersonRow, one SourceLine holding the original, notes and licence, and
// Cite / Copy link / Open on opax.com.au under the bar's ⋯. Bill text opens
// on its text with the version as a bar menu. Just added is a list of
// record rows grouped by the day they were added.
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import {
  decodeBillText,
  decodeBillTextManifest,
  decodeDocument,
  decodeRecent,
  metaLine,
} from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { catalogs } from '../src/api/runtime';
import DocumentReader from '../src/features/records/DocumentReader';
import BillTextReader from '../src/features/records/BillTextReader';
import RecentRecords from '../src/features/records/RecentRecords';
import {
  RecordActions,
  recordActions,
  recordBarItems,
} from '../src/features/records/RecordActions';
import { recordSource } from '../src/features/records/source';
import { menuLeaves } from '../src/design/row-link';
import {
  ContentUnavailable,
  Heading,
  InsetGroup,
  MachinePill,
  PersonRow,
  RecordRow,
  SourceLine,
} from '../src/design/primitives';
import { index, manifest, people, roster, slugs } from './pinned';

const responses: Record<string, unknown> = fixtures.responses;
const doc = (path: string) => decodeDocument(responses[path]);
const speech = doc('/api/resource/speech-1205524');
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
let mockOptions: Record<string, unknown> = {};
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
    useLocalSearchParams: () => ({
      slug: 'speech-1205524',
      key: 'au-federal-r7534',
    }),
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
const barLabels = () => {
  const items = (
    mockOptions.unstable_headerRightItems as
      | (() => { label: string }[])
      | undefined
  )?.();
  return items?.map((item) => item.label) ?? [];
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOptions = {};
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

test('one meta line says the kind and the chamber; the date is in the source line', async () => {
  expect(metaLine(speech, { date: false })).toBe(
    'Speech · House of Representatives',
  );
  const view = await mount(<DocumentReader />);
  expect(textOfId(view, 'doc-meta')).toBe('Speech · House of Representatives');
  const drawn = text(view);
  expect(drawn).not.toMatch(/Speech date|View original|More by this speaker/);
  expect(view.root.findAllByProps({ testID: 'doc-date' })).toHaveLength(0);
  // The title is the record's own words, in the record face.
  const title = view.root.findByType(Heading);
  expect(title.props).toMatchObject({ level: 1, testID: 'doc-title' });
  expect(title.props.kind).toBeUndefined();
  await act(async () => view.unmount());
});

test('the speaker is a person row with their party, opening their profile', async () => {
  const view = await mount(<DocumentReader />);
  const row = view.root.findByType(PersonRow);
  expect(row.props).toMatchObject({
    name: speech.speaker,
    testID: 'doc-more',
  });
  expect(row.props.party).toBeTruthy();
  expect(row.props.href ?? row.props.onPress).toBeTruthy();
  expect(typeof row.props.yourMP).toBe('boolean');
  await act(async () => view.unmount());
});

test('the record has one source line, holding the original, notes and licence', async () => {
  const view = await mount(<DocumentReader />);
  const line = view.root
    .findAllByType(SourceLine)
    .find((node) => node.props.testID === 'doc-source')!;
  expect(line.props).toMatchObject({
    dateRole: 'recorded',
    citation: [{ label: 'Hansard', title: 'Hansard' }],
    licence: 'CC BY-NC-ND',
    licenceDataset: 'hansard',
    originals: [expect.objectContaining({ url: speech.url })],
  });
  await act(async () => view.unmount());
});

test('the bar holds ⋯ only: Cite inline, Copy link, Open on opax.com.au', async () => {
  const view = await mount(<DocumentReader />);
  expect(barLabels()).toEqual(['More']);
  // Ask about this and Share are the bottom toolbar on iPhone.
  const toolbar = view.root.findAll(
    (node) => (node.type as unknown) === 'ToolbarButton',
  );
  expect(toolbar.map((node) => node.props.accessibilityLabel)).toEqual(
    expect.arrayContaining(['Ask about this record']),
  );
  // No drawn Ask row on iPhone (pane and Android only).
  expect(view.root.findAllByProps({ testID: 'doc-ask' })).toHaveLength(0);
  await act(async () => view.unmount());
  const target = { slug: 'speech-1205524', title: 'A speech' };
  const actions = recordActions(target);
  expect(actions.map((a) => a.title)).toEqual([
    'Cite',
    'Copy link',
    'Open on opax.com.au',
  ]);
  expect(actions[0]).toMatchObject({ inline: true });
  expect(menuLeaves(actions).map((a) => a.title)).toEqual([
    'Copy APA 7',
    'Copy AGLC',
    'Copy BibTeX',
    'Copy RIS',
    'Citation formats…',
    'Copy link',
    'Open on opax.com.au',
  ]);
  const item = recordBarItems(target)()[0]!;
  expect(item).toMatchObject({
    type: 'menu',
    label: 'More',
    accessibilityLabel: 'More for this record',
  });
  const inline = await mount(<RecordActions {...target} />);
  expect(inline.toJSON()).toBeNull();
  await act(async () => inline.unmount());
});

test('an embedded reader draws Ask about this as a row under the source line', async () => {
  const view = await mount(<DocumentReader embedded />);
  expect(
    view.root.findAllByProps({ testID: 'doc-ask' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test('each record kind names its own source and only a verified licence', () => {
  expect(recordSource(speech)).toMatchObject({
    citation: { label: 'Hansard' },
    licenceDataset: 'hansard',
  });
  const division = recordSource(
    doc('/api/resource/division-federal-senate-10701'),
  );
  expect(division).toMatchObject({
    citation: { label: 'They Vote For You' },
    licence: 'ODbL',
  });
  const zenodo = recordSource(doc('/api/resource/speech-18098'));
  expect(zenodo.citation.title).toMatch(/Zenodo/);
  const bill = recordSource(
    doc('/api/resource/bill-text-au-federal-r7534-aspassed'),
  );
  expect(bill).toMatchObject({ licenceDataset: 'bills' });
  expect(bill.licence).toBeUndefined();
  expect(bill.notes.join(' ')).toMatch(/bill text/i);
  // A state speech never borrows federal Hansard's terms.
  const state = recordSource({
    ...speech,
    labels: { ...speech.labels, state: 'nsw' },
  });
  expect(state.licence).toBeUndefined();
});

const textOfId = (view: TestRenderer.ReactTestRenderer, testID: string) =>
  view.root
    .findAll((node) => node.props.testID === testID)
    .slice(0, 1)
    .flatMap((node) => node.findAllByType(NativeText))
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join('');

function mockBillText() {
  jest
    .mocked(records.billManifest)
    .mockResolvedValue(
      record(
        decodeBillTextManifest(
          responses['/bill-texts/au-federal-r7534/index.json'],
        ),
      ) as never,
    );
  jest
    .mocked(records.billVersion)
    .mockImplementation(
      (_key, id) =>
        Promise.resolve(
          record(
            decodeBillText(
              responses[`/bill-texts/au-federal-r7534/${id}.json`],
            ),
          ),
        ) as never,
    );
}

test('bill text opens on its text with the stage, one source line and the bar items', async () => {
  mockBillText();
  const view = await mount(<BillTextReader />);
  expect(records.billVersion).toHaveBeenCalledWith(
    'au-federal-r7534',
    'r7534-aspassed',
  );
  expect(view.root.findAllByProps({ testID: 'bill-text-read' })).toHaveLength(
    0,
  );
  expect(textOfId(view, 'bill-text-meta')).toBe('Bill text');
  expect(textOfId(view, 'bill-text-stage')).toBe(
    'As passed: synthetic fixture',
  );
  expect(
    view.root.findAllByProps({ testID: 'reader-text-0' }).length,
  ).toBeGreaterThan(0);
  const source = view.root
    .findAllByType(SourceLine)
    .find((node) => node.props.testID === 'bill-text-source')!;
  expect(source.props).toMatchObject({
    dateRole: 'recorded',
    licenceDataset: 'bills',
  });
  expect(source.props.originals).toHaveLength(1);
  expect(barLabels()).toEqual(['As passed', 'Contents', 'More']);
  // The overview is a closed disclosure with its machine pill inside.
  const overview = view.root.find(
    (node) =>
      node.props.testID === 'bill-text-overview' && !!node.props.onPress,
  );
  await act(async () => overview.props.onPress());
  expect(
    view.root
      .findAllByType(MachinePill)
      .some((pill) => pill.props.testID === 'bill-text-overview-label'),
  ).toBe(true);
  await act(async () => view.unmount());
});

test('choosing another version from the bar menu loads it in place', async () => {
  mockBillText();
  const view = await mount(<BillTextReader />);
  const version = (
    mockOptions.unstable_headerRightItems as () => {
      label: string;
      menu?: { items: { label: string; state: string; onPress: () => void }[] };
    }[]
  )()[0]!;
  expect(version.menu!.items.map((item) => [item.label, item.state])).toEqual([
    ['As passed: synthetic fixture, 1 Oct 2026', 'on'],
    ['First reading: synthetic fixture, 1 Oct 2026', 'off'],
  ]);
  await act(async () => version.menu!.items[1]!.onPress());
  expect(records.billVersion).toHaveBeenLastCalledWith(
    'au-federal-r7534',
    'r7534-first-reps',
  );
  expect(textOfId(view, 'bill-text-stage')).toBe(
    'First reading: synthetic fixture',
  );
  await act(async () => view.unmount());
});

test('Just added: rows are record rows grouped by the day added, with a source line', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValue(record(decodeRecent(responses['/api/recent'])));
  const view = await mount(<RecentRecords />);
  expect(textOfId(view, 'recent-title')).toBe('Just added');
  const rows = view.root.findAllByType(RecordRow);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.props.title).not.toMatch(/—|\d{4}-\d{2}-\d{2}/);
    expect(row.props.meta).toBeTruthy();
    expect(
      (row.props.menu as { title: string }[]).map((item) => item.title),
    ).toContain('Cite');
  }
  const line = view.root.findByProps({ testID: 'recent-source' });
  expect(line.props.citation).toBe('OPAX');
  expect(line.props.notes[0]).toMatch(/date.*added to OPAX/);
  expect(text(view)).not.toMatch(/indexed|Just added to the record/i);
  await act(async () => view.unmount());
});

test('Just added says so when nothing is new, without a loading state', async () => {
  jest.mocked(records.recent).mockResolvedValue(record([]));
  const view = await mount(<RecentRecords />);
  expect(view.root.findByType(ContentUnavailable).props.title).toBe(
    'No new records yet',
  );
  expect(view.root.findAllByProps({ testID: 'recent-loading' })).toHaveLength(
    0,
  );
  await act(async () => view.unmount());
});

test('Just added shows its loading state before the first response', async () => {
  let finish!: (value: Awaited<ReturnType<typeof records.recent>>) => void;
  jest.mocked(records.recent).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await mount(<RecentRecords />);
  expect(
    view.root.findAllByProps({ testID: 'recent-loading' }).length,
  ).toBeGreaterThan(0);
  expect(text(view)).not.toContain('No new records yet');
  await act(async () => finish(record([])));
  expect(view.root.findAllByProps({ testID: 'recent-loading' })).toHaveLength(
    0,
  );
  await act(async () => view.unmount());
});

test('Just added: a failed first read offers Try again', async () => {
  jest
    .mocked(records.recent)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(record([]));
  const view = await mount(<RecentRecords />);
  const failure = view.root.findByType(ContentUnavailable);
  expect(failure.props).toMatchObject({
    title: "New records couldn't be loaded",
    testID: 'recent-error',
  });
  await act(async () => failure.props.action.onPress());
  expect(records.recent).toHaveBeenCalledTimes(2);
  await act(async () => view.unmount());
});

test('Just added: rows without a date added follow in a final group with no header', async () => {
  const feed = decodeRecent(responses['/api/recent']);
  jest
    .mocked(records.recent)
    .mockResolvedValue(
      record([{ ...feed[0]!, indexed: null }, ...feed.slice(1)]),
    );
  const view = await mount(<RecentRecords />);
  const headers = view.root
    .findAllByType(InsetGroup)
    .map((group) => group.props.header);
  expect(headers.at(-1)).toBeUndefined();
  expect(headers.slice(0, -1).every((h) => /^Added \d/.test(h))).toBe(true);
  expect(text(view)).not.toMatch(/not recorded/);
  await act(async () => view.unmount());
});
