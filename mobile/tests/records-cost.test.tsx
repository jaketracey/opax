import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ApiClient } from '../src/api/client';
import { CatalogCache } from '../src/api/cache';
import { Records } from '../src/features/records/data';
import fixtures from '../scripts/fixtures/records/contracts.json';
import {
  decodeDocument,
  decodeBillTextManifest,
  decodeBillText,
  decodeRecent,
} from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { catalogs } from '../src/api/runtime';
import Today from '../src/features/Today';
import BillDetail from '../src/features/bills/BillDetail';
import DocumentReader from '../src/features/records/DocumentReader';
import RecentRecords from '../src/features/records/RecentRecords';
import BillTextReader from '../src/features/records/BillTextReader';
import { RecordActions } from '../src/features/records/RecordActions';
import { billFor, decodeBill } from '../src/api/catalogs';
import { pinned, bills, roster, slugs } from './pinned';
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
    today: jest.fn(),
    todayEdition: jest.fn(),
    billFor: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
    bills: jest.fn(),
    corpus: jest.fn(),
  },
}));
jest.mock('../src/features/follows/FollowToggle', () => ({
  FollowToggle: () => null,
}));
jest.mock('../src/features/follows/FollowingSection', () => ({
  FollowingSection: () => null,
}));
jest.mock('expo-router', () => ({
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
beforeEach(() => {
  jest.clearAllMocks();
  const empty = {
    status: 'empty',
    data: [],
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  };
  jest
    .mocked(catalogs.today)
    .mockResolvedValue({ bills: empty, declarations: empty } as never);
  jest.mocked(catalogs.todayEdition).mockResolvedValue({
    status: 'missing',
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  } as never);
  jest
    .mocked(catalogs.billFor)
    .mockResolvedValue(
      record(
        billFor(decodeBill(pinned('/bills/au-federal-r7534.json')), bills),
      ) as never,
    );
  jest.mocked(catalogs.roster).mockResolvedValue(record(roster));
  jest.mocked(catalogs.slugs).mockResolvedValue(record(slugs));
  jest.mocked(catalogs.bills).mockResolvedValue(record(bills));
  jest.mocked(records.document).mockResolvedValue(record(speech));
  jest.mocked(records.recent).mockResolvedValue(record([]));
  jest.mocked(records.similar).mockResolvedValue(record([]));
  jest
    .mocked(records.billManifest)
    .mockImplementation(() =>
      Promise.resolve(
        record(
          decodeBillTextManifest(
            responses['/bill-texts/au-federal-r7534/index.json'],
          ),
        ),
      ),
    );
  jest
    .mocked(records.billVersion)
    .mockImplementation((_key, id) =>
      Promise.resolve(
        record(
          decodeBillText(responses[`/bill-texts/au-federal-r7534/${id}.json`]),
        ),
      ),
    );
});
test('launch/Today and Bill mount have no paid reads; result actions mount without loading a record', async () => {
  const today = await mount(<Today />),
    bill = await mount(<BillDetail recordKey="au-federal-r7534" />),
    actions = await mount(<RecordActions slug="speech-1205524" />);
  for (const method of Object.values(records))
    if (typeof method === 'function') expect(method).not.toHaveBeenCalled();
  expect(today.root.findByProps({ testID: 'today-records-open' })).toBeTruthy();
  expect(bill.root.findByProps({ testID: 'bill-read-text' })).toBeTruthy();
  await act(async () => {
    today.unmount();
    bill.unmount();
    actions.unmount();
  });
});
test('opening reader loads one record; similar loads only on tap and reopening the panel uses memory', async () => {
  const view = await mount(<DocumentReader />);
  expect(records.document).toHaveBeenCalledTimes(1);
  expect(records.similar).not.toHaveBeenCalled();
  await act(async () => {
    view.root.findByProps({ testID: 'doc-similar' }).props.onToggle(true);
  });
  expect(records.similar).toHaveBeenCalledTimes(1);
  await act(async () => {
    view.root.findByProps({ testID: 'doc-similar' }).props.onToggle(false);
  });
  await act(async () => {
    view.root.findByProps({ testID: 'doc-similar' }).props.onToggle(true);
  });
  expect(records.similar).toHaveBeenCalledTimes(1);
  expect(view.root.findByProps({ testID: 'doc-more' }).props.title).toBe(
    speech.speaker,
  );
  await act(async () => view.unmount());
});
test('a non-roster release never gets a native speaker/profile button', async () => {
  jest
    .mocked(records.document)
    .mockResolvedValue(
      record(
        decodeDocument(responses['/api/resource/press-pmt-reader-fixture']),
      ),
    );
  const view = await mount(<DocumentReader />);
  expect(view.root.findAllByProps({ testID: 'doc-speaker' })).toHaveLength(0);
  expect(view.root.findAllByProps({ testID: 'doc-more' })).toHaveLength(0);
  await act(async () => view.unmount());
});
test('opening recent calls recent once and does not fan out a resource read per row', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValue(record(decodeRecent(responses['/api/recent'])));
  const view = await mount(<RecentRecords />);
  expect(records.recent).toHaveBeenCalledTimes(1);
  expect(records.document).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});
test('bill text switches chosen bytes and never presents the old version as the new one', async () => {
  const view = await mount(<BillTextReader />);
  expect(records.billManifest).toHaveBeenCalledTimes(1);
  expect(records.billVersion).not.toHaveBeenCalled();
  await act(async () =>
    view.root.findByProps({ testID: 'bill-text-read' }).props.onPress(),
  );
  expect(records.billVersion).toHaveBeenCalledTimes(1);
  await act(async () =>
    view.root
      .findByProps({ testID: 'bill-text-version-picker' })
      .props.onToggle(true),
  );
  await act(async () =>
    view.root.findByProps({ testID: 'bill-text-version-1' }).props.onPress(),
  );
  expect(records.billVersion).toHaveBeenLastCalledWith(
    'au-federal-r7534',
    'r7534-first-reps',
  );
  expect(records.billVersion).toHaveBeenCalledTimes(2);
  expect(
    view.root.findByProps({ testID: 'bill-text-version-label' }).props.children,
  ).toBe('First reading — synthetic fixture');
  await act(async () => view.unmount());
});
test('real request client sends one GET per action, shares in-flight and session records, no retries after failure', async () => {
  const transport = jest.fn(async (url: string) =>
    Response.json(responses[new URL(url).pathname]),
  );
  const client = new ApiClient({
    origin: 'http://127.0.0.1:8941',
    version: 'test',
    build: '7',
    retries: 0,
    transport: transport as never,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
  const repository = new Records(client);
  expect(transport).not.toHaveBeenCalled();
  await Promise.all([
    repository.document(speech.slug),
    repository.document(speech.slug),
  ]);
  await repository.document(speech.slug);
  expect(transport).toHaveBeenCalledTimes(1);
  await repository.similar(speech, new Set(['gambling']));
  expect(transport).toHaveBeenLastCalledWith(
    expect.stringContaining('kind=speech&per=6&topic=gambling'),
    expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
    }),
  );
  await repository.similar(speech, new Set(['gambling']));
  expect(transport).toHaveBeenCalledTimes(2);
  await repository.recent();
  await repository.recent();
  expect(transport).toHaveBeenCalledTimes(3);
  await repository.billManifest('au-federal-r7534');
  await repository.billVersion('au-federal-r7534', 'r7534-aspassed');
  await repository.billVersion('au-federal-r7534', 'r7534-first-reps');
  await repository.billVersion('au-federal-r7534', 'r7534-aspassed');
  expect(transport).toHaveBeenCalledTimes(6);
  transport.mockImplementation(async () => {
    throw new Error('offline');
  });
  await expect(repository.document('speech-1')).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(7);
  await expect(repository.document('speech-1')).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(8);
});
