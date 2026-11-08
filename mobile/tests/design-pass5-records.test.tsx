// Design pass 5, lane A, P1-2 (docs/design/review-2026-10/pass5-app-critique.md):
// the records reader is migrated. One title with no kicker, one meta line
// ("Speech · House of Representatives · 18 Aug 2026"), the speaker as a
// PersonRow with their party, one SourceLine holding the original, the
// text's notes and the licence, Cite / Copy link / Share under one ⋯, and
// "Ask about this" as the one drawn action, a plain row.
import { act } from 'react';
import { Platform, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import {
  decodeBillText,
  decodeBillTextManifest,
  decodeDocument,
  decodeRecent,
} from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { catalogs } from '../src/api/runtime';
import DocumentReader, {
  metaLine,
} from '../src/features/records/DocumentReader';
import BillTextReader from '../src/features/records/BillTextReader';
import RecentRecords from '../src/features/records/RecentRecords';
import * as recordReads from '../src/features/records/useRead';
import {
  RecordActions,
  recordActions,
  recordPageActions,
  recordMenuItem,
} from '../src/features/records/RecordActions';
import { recordSource } from '../src/features/records/source';
import { menuLeaves } from '../src/design/row-link';
import { SectionHeader } from '../src/design/layout';
import {
  AsAtLine,
  Button,
  LinkRow,
  EmptyState,
  ErrorState,
  LoadingState,
  MachineLabel,
  PersonRow,
  SourceLine,
  ViewOriginal,
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
  },
}));
jest.mock('../src/design/menu', () => ({ showMenu: jest.fn() }));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    slug: 'speech-1205524',
    key: 'au-federal-r7534',
  }),
}));

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

beforeEach(() => {
  jest.clearAllMocks();
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
});

test('one meta line says the kind, the chamber and the date; no kicker or date line', async () => {
  expect(metaLine(speech)).toBe(
    'Speech · House of Representatives · 18 Aug 2026',
  );
  // A title that is the kind and date leaves them off the line.
  expect(metaLine(doc('/api/resource/speech-18098'))).toBe(
    'House of Representatives',
  );
  const view = await mount(<DocumentReader />);
  const drawn = text(view);
  expect(drawn).toContain('Speech · House of Representatives · 18 Aug 2026');
  expect(drawn).not.toMatch(/^Speech$/m);
  expect(drawn).not.toMatch(/Speech date|View original|More by this speaker/);
  expect(view.root.findAllByProps({ testID: 'doc-date' })).toHaveLength(0);
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
  expect(typeof row.props.onPress).toBe('function');
  await act(async () => view.unmount());
});

test('the record has one source line, holding the original, notes and licence', async () => {
  const view = await mount(<DocumentReader />);
  expect(view.root.findAllByType(ViewOriginal)).toHaveLength(0);
  expect(view.root.findAllByType(AsAtLine)).toHaveLength(0);
  const line = view.root.findByProps({ testID: 'doc-source' });
  expect(line.type).toBe(SourceLine);
  expect(line.props).toMatchObject({
    citation: [{ label: 'Hansard', title: 'Hansard' }],
    licence: 'CC BY-NC-ND',
    licenceDataset: 'hansard',
    originals: [
      expect.objectContaining({
        label: 'Speech in Hansard',
        url: speech.url,
      }),
    ],
  });
  await act(async () => view.unmount());
});

test('Cite, Copy link and Share are one menu; Ask about this is a plain row', async () => {
  const view = await mount(<DocumentReader />);
  expect(
    view.root
      .findAllByType(Button)
      .filter((b) => /Cite|Copy link/.test(b.props.label)),
  ).toHaveLength(0);
  const ask = view.root
    .findAllByType(LinkRow)
    .find((r) => r.props.testID === 'doc-ask')!;
  expect(ask.props.icon).toBeUndefined();
  // The disclosure for similar speeches carries no icon tile either.
  expect(
    view.root.findByProps({ testID: 'doc-similar' }).props.icon,
  ).toBeUndefined();
  await act(async () => view.unmount());
  const target = { slug: 'speech-1205524', title: 'A speech' };
  expect(recordActions(target).map((a) => a.title)).toEqual([
    'Cite',
    'Copy link',
    'Share',
  ]);
  expect(recordActions({ slug: '../nope', title: 'x' })).toEqual([]);
  const item = recordMenuItem(target);
  expect(Platform.OS).toBe('ios');
  expect(item).toMatchObject({ type: 'menu', label: 'More' });
  expect(
    (item as Extract<typeof item, { type: 'menu' }>).menu.items.map(
      (i) => (i as { label: string }).label,
    ),
  ).toEqual(['Cite', 'Copy link', 'Share']);
  expect(
    menuLeaves(recordPageActions(target)).map((action) => action.title),
  ).toEqual(['Cite', 'Copy link', 'Open on opax.com.au']);
  const inline = await mount(<RecordActions {...target} />);
  expect(inline.toJSON()).toBeNull();
  await act(async () => inline.unmount());
});

test('an embedded reader draws its ⋯ beside the meta line', async () => {
  const view = await mount(<DocumentReader embedded />);
  expect(view.root.findAllByType(RecordActions)).toHaveLength(1);
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

test('the bill-text reader: no kicker, one source line per block, a machine pill', async () => {
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
  const view = await mount(<BillTextReader />);
  expect(view.root.findAllByType(AsAtLine)).toHaveLength(0);
  expect(view.root.findAllByType(ViewOriginal)).toHaveLength(0);
  expect(
    view.root.findByProps({ testID: 'bill-text-collected-source' }).props.notes,
  ).toHaveLength(1);
  expect(text(view)).not.toMatch(/^Bill text$/m);
  await act(async () =>
    view.root.findByProps({ testID: 'bill-text-read' }).props.onPress(),
  );
  const source = view.root.findByProps({ testID: 'bill-text-source' });
  expect(source.type).toBe(SourceLine);
  expect(source.props.originals).toHaveLength(1);
  expect(view.root.findAllByProps({ testID: 'bill-text-info' })).toHaveLength(
    0,
  );
  if (view.root.findAllByProps({ testID: 'bill-text-overview' }).length)
    expect(
      view.root
        .findAllByType(MachineLabel)
        .some((l) => l.props.testID === 'bill-text-overview-label'),
    ).toBe(true);
  await act(async () => view.unmount());
});

test('Just added: the indexed-date note is in a source line, not an ⓘ', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValue(record(decodeRecent(responses['/api/recent'])));
  const view = await mount(<RecentRecords />);
  const line = view.root.findByProps({ testID: 'recent-source' });
  expect(line.props.notes[0]).toMatch(/date.*added to OPAX/);
  expect(view.root.findAllByProps({ testID: 'recent-info' })).toHaveLength(0);
  await act(async () => view.unmount());
});

test('Just added explains a successful empty response and keeps its source line', async () => {
  jest.mocked(records.recent).mockResolvedValue(record([]));
  const view = await mount(<RecentRecords />);
  expect(
    view.root
      .findAllByType(SectionHeader)
      .filter((node) => node.props.title === 'New in OPAX'),
  ).toHaveLength(1);
  expect(view.root.findByType(EmptyState).props.message).toBe(
    'No new records yet.',
  );
  expect(view.root.findAllByType(LoadingState)).toHaveLength(0);
  expect(text(view)).not.toContain('Loading new records');
  expect(
    view.root.findAllByProps({ testID: 'recent-source' }).length,
  ).toBeGreaterThan(0);
  await act(async () => view.unmount());
});

test('Just added shows its loading state without empty copy before the first response', async () => {
  let finish!: (value: Awaited<ReturnType<typeof records.recent>>) => void;
  jest.mocked(records.recent).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await mount(<RecentRecords />);
  expect(
    view.root
      .findAllByType(SectionHeader)
      .filter((node) => node.props.title === 'New in OPAX'),
  ).toHaveLength(1);
  expect(view.root.findByType(LoadingState).props.label).toBe(
    'Loading new records',
  );
  expect(view.root.findAllByType(EmptyState)).toHaveLength(0);
  expect(text(view)).not.toContain('No new records yet.');
  await act(async () => finish(record([])));
  expect(view.root.findAllByType(LoadingState)).toHaveLength(0);
  expect(view.root.findByType(EmptyState).props.message).toBe(
    'No new records yet.',
  );
  await act(async () => view.unmount());
});

test('Just added keeps a refresh error visible when its saved response is empty', async () => {
  const retry = jest.fn();
  const read = jest.spyOn(recordReads, 'useRead').mockReturnValue({
    value: record([]),
    error: new Error('Unavailable'),
    retry,
  });
  let view: TestRenderer.ReactTestRenderer | undefined;
  try {
    view = await mount(<RecentRecords />);
    expect(
      view.root
        .findAllByType(SectionHeader)
        .filter((node) => node.props.title === 'New in OPAX'),
    ).toHaveLength(1);
    const failure = view.root.findByType(ErrorState);
    expect(view.root.findAllByType(LoadingState)).toHaveLength(0);
    expect(view.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(
      view.root.findAllByProps({ testID: 'recent-source' }).length,
    ).toBeGreaterThan(0);
    await act(async () => failure.props.onRetry());
    expect(retry).toHaveBeenCalledTimes(1);
  } finally {
    if (view) await act(async () => view!.unmount());
    read.mockRestore();
  }
});
