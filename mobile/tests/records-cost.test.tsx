import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SectionHeader } from '../src/design/layout';
import TestRenderer from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { CatalogCache } from '../src/api/cache';
import { billFor, decodeBill } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import { catalogs } from '../src/api/runtime';
import Today from '../src/features/Today';
import BillDetail from '../src/features/bills/BillDetail';
import BillTextReader from '../src/features/records/BillTextReader';
import DocumentReader from '../src/features/records/DocumentReader';
import RecentRecords from '../src/features/records/RecentRecords';
import { recordBarItems } from '../src/features/records/RecordActions';
import { Records } from '../src/features/records/data';
import {
  decodeBillText,
  decodeBillTextManifest,
  decodeDocument,
  decodeRecent,
} from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { sheetPayload } from '../src/navigation/sheets';
import {
  bills,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';
const responses: Record<string, unknown> = fixtures.responses;
const speech = decodeDocument(responses['/api/resource/speech-1205524']);
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/features/records/runtime', () => ({
  records: {
    document: jest.fn(),
    recent: jest.fn(),
    similar: jest.fn(),
    billManifest: jest.fn(),
    billVersion: jest.fn(),
  },
}));
const mockMissing = {
  status: 'missing',
  data: null,
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
};
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    today: jest.fn(),
    todayEdition: jest.fn(),
    todayBills: jest.fn(async () => mockMissing),
    todayDeclarations: jest.fn(async () => mockMissing),
    todayDeclarationsProfiled: jest.fn(async () => mockMissing),
    recentDivisions: jest.fn(async () => ({ status: 'missing' })),
    billFor: jest.fn(),
    billIndexRow: () => null,
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
    bills: jest.fn(),
    corpus: jest.fn(),
  },
}));
jest.mock('../src/features/follows/FollowingSection', () => ({
  FollowingSection: () => null,
}));
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof React>('react');
  const part = (name: string) => (props: { children?: React.ReactNode }) =>
    createElement(name, props, props.children);
  return {
    useSegments: () => [],
    router: { push: jest.fn(), setParams: jest.fn() },
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
    view = TestRenderer.create(
      withNavigationOptions(component, (options) => {
        mockOptions = options;
      }),
    );
  });
  return view;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
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
  // The reader joins its speaker as a bill joins its sponsors.
  jest.mocked(catalogs.directory).mockResolvedValue({
    roster: record(roster),
    slugs: record(slugs),
    people: record(people),
    manifest: record(manifest),
    electorates: record(index),
  } as never);
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
test('opening reader loads one record; similar loads only on tap and reopening the panel uses memory', async () => {
  const view = await mount(<DocumentReader />);
  expect(records.document).toHaveBeenCalledTimes(1);
  expect(records.similar).not.toHaveBeenCalled();
  await act(async () => {
    view.root.findByProps({ testID: 'doc-similar' }).props.onToggle(true);
  });
  expect(records.similar).toHaveBeenCalledTimes(1);
  expect(
    view.root
      .findAllByType(Text)
      .some((node) => node.props.children === 'No similar speeches found.'),
  ).toBe(true);
  expect(
    view.root
      .findAllByType(Text)
      .some(
        (node) =>
          node.props.children === 'Similar speeches couldn’t be loaded.',
      ),
  ).toBe(false);
  await act(async () => {
    view.root.findByProps({ testID: 'doc-similar' }).props.onToggle(false);
  });
  await act(async () => {
    view.root.findByProps({ testID: 'doc-similar' }).props.onToggle(true);
  });
  expect(records.similar).toHaveBeenCalledTimes(1);
  expect(view.root.findByProps({ testID: 'doc-more' }).props.name).toBe(
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
test('a synchronously rejected record identifier shows the reader error state', async () => {
  jest.mocked(records.document).mockImplementation(() => {
    throw new Error('This record identifier cannot be read.');
  });
  const view = await mount(<DocumentReader />);
  expect(view.root.findByProps({ testID: 'doc-error' })).toBeTruthy();
  expect(records.similar).not.toHaveBeenCalled();
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
  // The default version loads on open (records.md 4.4).
  expect(records.billVersion).toHaveBeenCalledTimes(1);
  const version = (
    mockOptions.unstable_headerRightItems as () => {
      menu?: { items: { onPress: () => void }[] };
    }[]
  )()[0]!;
  await act(async () => version.menu!.items[1]!.onPress());
  expect(records.billVersion).toHaveBeenLastCalledWith(
    'au-federal-r7534',
    'r7534-first-reps',
    expect.any(AbortSignal),
  );
  expect(records.billVersion).toHaveBeenCalledTimes(2);
  expect(
    view.root.findByProps({ testID: 'bill-text-stage' }).props.children,
  ).toBe('First reading: synthetic fixture');
  await act(async () => view.unmount());
});
test.each([1, 1.786, 3.571])(
  'bill text keeps its summary pill beside In short at font scale %s',
  async (fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
    const bill = decodeBill(pinned('/bills/au-federal-r7534.json'));
    const view = await mount(<BillTextReader />);
    // Only the pill shows; its sheet holds the stored attribution.
    const pill = view.root
      .findAllByProps({ testID: 'bill-text-summary-label' })
      .find((node) => node.props.note);
    expect(pill!.props.note.body).toContain(bill.summary!.attribution);
    const header = view.root
      .findAllByType(SectionHeader)
      .find((node) => node.props.title === 'In short');
    expect(
      header!.findAllByProps({ testID: 'bill-text-summary-label' }),
    ).toContain(pill);
    expect(
      StyleSheet.flatten(header!.findByType(View).props.style),
    ).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    });
    expect(
      header!
        .findAllByType(Text)
        .every((node) => node.props.numberOfLines === undefined),
    ).toBe(true);
    const button = header!.find(
      (node) =>
        node.props.testID === 'bill-text-summary-label' &&
        typeof node.props.onPress === 'function',
    );
    await act(async () => button.props.onPress());
    const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      pathname: string;
      params: { key: string };
    };
    expect(route.pathname).toBe('/machine-note');
    expect(sheetPayload(route.params.key, 'machine')).toMatchObject({
      testID: 'bill-text-summary-label',
      note: { title: 'Machine-written', body: [bill.summary!.attribution] },
    });
    // VoiceOver hears the pill as plain "Machine-written".
    expect(
      view.root
        .findAllByProps({ testID: 'bill-text-summary-label' })
        .find((node) => node.props.accessibilityLabel)?.props
        .accessibilityLabel,
    ).toBe('Machine-written');
    expect(
      view.root
        .findByProps({ testID: 'bill-text-summary-text' })
        .findAllByType(Text)
        .map((node) => node.props.children),
    ).toEqual(bill.summary!.sentences.slice(0, 3));
    // The summary sits above the version and the reading action.
    const order = view.root
      .findAll((node) => typeof node.props.testID === 'string')
      .map((node) => node.props.testID as string);
    expect(order.indexOf('bill-text-stage')).toBeLessThan(
      order.indexOf('bill-text-summary'),
    );
    expect(order.indexOf('bill-text-summary')).toBeLessThan(
      order.indexOf('reader-text-0'),
    );
    await act(async () => view.unmount());
  },
);
test.each([
  [
    'has no summary',
    () => {
      const bill = decodeBill(pinned('/bills/au-federal-r7534.json'));
      jest
        .mocked(catalogs.billFor)
        .mockResolvedValue(
          record(billFor({ ...bill, summary: null }, bills)) as never,
        );
    },
  ],
  [
    'cannot be read',
    () => {
      jest.mocked(catalogs.billFor).mockRejectedValue(new Error('offline'));
    },
  ],
])(
  'bill text for a bill that %s shows the reading actions and no placeholder',
  async (_case, arrange) => {
    arrange();
    const view = await mount(<BillTextReader />);
    expect(
      view.root.findAllByProps({ testID: 'bill-text-summary' }),
    ).toHaveLength(0);
    expect(
      view.root.findAllByProps({ testID: 'bill-summary-none' }),
    ).toHaveLength(0);
    expect(
      view.root.findAllByProps({ testID: 'reader-text-0' }).length,
    ).toBeGreaterThan(0);
    expect(
      view.root.findAllByProps({ testID: 'bill-text-stage' }).length,
    ).toBeGreaterThan(0);
    await act(async () => view.unmount());
  },
);
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
    expect.stringContaining('kind=speech&per=6&top_k=20&topic=gambling'),
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

test('launch/Today and Bill mount have no paid reads; bar actions are built without loading a record', async () => {
  const today = await mount(<Today />),
    bill = await mount(<BillDetail recordKey="au-federal-r7534" />);
  recordBarItems({ slug: 'speech-1205524', title: 'A speech' })();
  for (const method of Object.values(records))
    if (typeof method === 'function') expect(method).not.toHaveBeenCalled();
  expect(today.root.findByProps({ testID: 'today-screen' })).toBeTruthy();
  expect(bill.root.findByProps({ testID: 'bill-read-text' })).toBeTruthy();
  await act(async () => {
    today.unmount();
    bill.unmount();
  });
});
