import { act, type ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  billFor,
  decodeBill,
  decodeRoster,
  decodeSlugs,
} from '../src/api/catalogs';
import { catalogs, peopleDepth, portraits } from '../src/api/runtime';
import { Disclosure } from '../src/design/disclosure';
import { Portrait } from '../src/design/people';
import { RecordRow } from '../src/design/rows';
import { PaneHost } from '../src/design/split';
import { Text } from '../src/design/text';
import { CitedRecordRow } from '../src/features/ask/AskRows';
import { decodeAnswer } from '../src/features/ask/model';
import { YearBrief } from '../src/features/explore/YearBrief';
import { decodeYear } from '../src/features/explore/model';
import BillDetail from '../src/features/bills/BillDetail';
import RecordList from '../src/features/people/RecordList';
import { decodeRecords } from '../src/features/people/model';
import DocumentReader from '../src/features/records/DocumentReader';
import RecentRecords from '../src/features/records/RecentRecords';
import {
  decodeDocument,
  decodeRecent,
  decodeSimilar,
} from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { TopicSpeeches } from '../src/features/reports/TopicSpeeches';
import { decodeSpeeches } from '../src/features/reports/model';
import { docRoute, personRoute } from '../src/navigation/routes';
import { bills, pinned } from './pinned';
import { withNavigationOptions } from './navigation-options';

jest.mock('expo-router', () => {
  const pass = ({ children }: { children?: unknown }) => children;
  return {
    Link: Object.assign(pass, {
      Trigger: pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: {
      Screen: () => null,
      Toolbar: Object.assign(pass, {
        Button: () => null,
        Spacer: () => null,
        View: pass,
      }),
    },
    useSegments: () => [],
    useLocalSearchParams: () => ({
      key: 'au-federal-r7534',
      slug: 'don-farrell',
      name: 'Don Farrell',
    }),
    router: { push: jest.fn(), setParams: jest.fn() },
  };
});
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    roster: jest.fn(),
    slugs: jest.fn(),
    billFor: jest.fn(),
    directory: jest.fn(),
    bills: jest.fn(),
    corpus: jest.fn(),
    billIndexRow: () => null,
  },
  portraits: { get: jest.fn() },
  peopleDepth: { list: jest.fn() },
}));
jest.mock('../src/features/records/runtime', () => ({
  records: { document: jest.fn(), recent: jest.fn(), similar: jest.fn() },
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/your-mp/useIsMyMember', () => ({
  useIsMyMember: () => false,
}));

const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const roster = decodeRoster({
  meta: { generated: '2026-11-11' },
  people: [{ name: 'Don Farrell', party: 'Labor' }],
});
// Deliberately unlike a slug made from the printed name.
const slugs = decodeSlugs({
  generated: '2026-11-11',
  slugs: { 'verified-person-42': 'Don Farrell' },
});
const names = ['Don Farrell', 'Unidentified witness'];
const rawRows = names.map((speaker, i) => ({
  slug: `speech-${100 + i}`,
  title: 'Housing',
  speaker,
  party: 'Labor',
  date: '2026-10-11',
  state: 'federal',
  chamber: 'senate',
  snippet: 'A passage about housing.',
  resource: `speech-${100 + i}`,
}));
const sources = decodeAnswer({
  answer: 'Housing.',
  sources: rawRows.map((row) => ({
    ...row,
    href: `/doc/${row.slug}`,
    cited: true,
  })),
}).sources;
const year = decodeYear({
  year: 2025,
  generated_at: '2026-11-11',
  brief: {
    answer: 'The year in brief.',
    sources: rawRows.map((row) => ({ ...row, cited: true })),
  },
  voices: {
    unique_speeches: 2,
    unlabelled_party: 0,
    probes: [],
    speakers: [],
    parties: [],
  },
});
const bill = {
  ...decodeBill(pinned('/bills/au-federal-r7534.json')),
  speeches: rawRows.map((row) => ({
    ...row,
    stage_hint: null,
    brief: row.snippet,
  })),
};
const originalPlatform = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  jest.mocked(catalogs.roster).mockResolvedValue(result(roster));
  jest.mocked(catalogs.slugs).mockResolvedValue(result(slugs));
  jest.mocked(catalogs.directory).mockRejectedValue(new Error('No directory'));
  jest.mocked(catalogs.bills).mockResolvedValue(result(bills));
  jest.mocked(catalogs.billFor).mockResolvedValue(result(billFor(bill, bills)));
  jest.mocked(peopleDepth.list).mockResolvedValue({
    records: result(decodeRecords({ results: rawRows })),
    briefs: {},
  });
  jest.mocked(portraits.get).mockResolvedValue({
    localURI: 'file:///cache/speaker.webp',
    info: { key: '123' },
  } as never);
  jest
    .mocked(records.recent)
    .mockResolvedValue(result(decodeRecent({ items: rawRows })));
  jest
    .mocked(records.similar)
    .mockResolvedValue(result(decodeSimilar({ results: rawRows })));
  jest.mocked(records.document).mockResolvedValue(
    result(
      decodeDocument({
        slug: 'speech-99',
        title: 'Housing',
        text: 'A housing speech.',
        metadata: {},
        labels: { kind: 'speech' },
      }),
    ),
  );
});
afterEach(() => {
  Platform.OS = originalPlatform;
});

async function draw(element: ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(withNavigationOptions(element, () => {}));
  });
  return view;
}
function target(row: ReactTestInstance, testID: string) {
  return row.find(
    (node) =>
      node.props.accessibilityRole === 'link' &&
      node.props.testID === testID &&
      typeof node.props.onPress === 'function',
  );
}
function press(node: ReactTestInstance) {
  const stopPropagation = jest.fn();
  act(() => node.props.onPress({ stopPropagation }));
  return stopPropagation;
}
const topic = () => (
  <TopicSpeeches
    slug="housing"
    title="Housing"
    phrase="housing"
    read={{
      record: result(decodeSpeeches({ results: rawRows })),
      error: null,
      retry: jest.fn(),
    }}
    filters={{}}
    decades={[]}
    onClear={jest.fn()}
    visible={30}
    onVisible={jest.fn()}
  />
);
const families: {
  name: string;
  render: () => ReactElement;
  prepare?: (root: ReactTestInstance) => Promise<void>;
}[] = [
  { name: 'bill speeches', render: () => <BillDetail /> },
  { name: 'topic speeches', render: topic },
  {
    name: 'reader related speeches',
    render: () => <DocumentReader recordSlug="speech-99" />,
    prepare: async (root) => {
      await act(async () =>
        root
          .findAllByType(Disclosure)
          .find((row) => row.props.label === 'Similar speeches')!
          .props.onToggle(true),
      );
    },
  },
  { name: 'member speeches', render: () => <RecordList kind="speeches" /> },
  {
    name: 'Time Machine cited speeches',
    render: () => (
      <YearBrief data={year} meta={{ asOf: null, savedAt: null }} />
    ),
  },
  { name: 'Just added speeches', render: () => <RecentRecords /> },
  {
    name: 'Ask speech sources',
    render: () => (
      <>
        {sources.map((source, i) => (
          <CitedRecordRow
            key={source.slug}
            record={source}
            profiles={
              new Map([
                [
                  'Don Farrell',
                  {
                    name: 'Don Farrell',
                    slug: 'verified-person-42',
                    party: 'Labor',
                    place: null,
                  },
                ],
              ])
            }
            testID={`ask-source-${i}`}
          />
        ))}
      </>
    ),
  },
];

test.each(families)(
  '$name: the verified speaker opens their catalogue route and an unmatched speaker stays text',
  async ({ render, prepare }) => {
    const view = await draw(render());
    if (prepare) await prepare(view.root);
    const rows = view.root.findAllByType(RecordRow);
    expect(rows).toHaveLength(2);
    const [matched, unmatched] = rows;
    const speaker = target(matched!, `${matched!.props.testID}-speaker`);
    expect(speaker.props.accessibilityRole).toBe('link');
    const layout = StyleSheet.flatten(speaker.props.style);
    expect(layout.minHeight).toBeGreaterThanOrEqual(44);
    expect(layout.minWidth).toBeGreaterThanOrEqual(44);
    expect(press(speaker)).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      personRoute('verified-person-42', 'Don Farrell'),
    );
    expect(matched!.findAllByType(Portrait)).toHaveLength(1);
    const reader = target(matched!, matched!.props.testID);
    expect(reader).not.toBe(speaker);
    expect(reader.props.accessible).toBe(true);
    expect(
      StyleSheet.flatten(reader.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    expect(
      StyleSheet.flatten(reader.props.style).minWidth,
    ).toBeGreaterThanOrEqual(44);
    expect(matched!.props.href).toMatchObject(docRoute('speech-100'));
    jest.mocked(router.push).mockClear();
    press(reader);
    expect(router.push).toHaveBeenCalledWith(matched!.props.href);
    expect(unmatched!.props.speaker).toMatchObject({
      name: 'Unidentified witness',
      href: undefined,
      portrait: undefined,
    });
    const text = unmatched!
      .findAllByType(Text)
      .find((node) => node.props.children === 'Unidentified witness')!;
    expect(text.props.onPress).toBeUndefined();
    expect(text.props.accessibilityRole).toBeUndefined();
    expect(unmatched!.findAllByType(Portrait)).toHaveLength(0);
    expect(portraits.get).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Unidentified witness' }),
    );
    await act(async () => view.unmount());
  },
);

test('Ask source selection stays separate from the speaker target', async () => {
  const select = jest.fn();
  const view = await draw(
    <CitedRecordRow
      record={sources[0]!}
      onPress={select}
      selected
      n={1}
      profiles={
        new Map([
          [
            'Don Farrell',
            {
              name: 'Don Farrell',
              slug: 'verified-person-42',
              party: 'Labor',
              place: null,
            },
          ],
        ])
      }
      testID="selected-source"
    />,
  );
  press(target(view.root, 'selected-source-speaker'));
  expect(select).not.toHaveBeenCalled();
  press(target(view.root, 'selected-source'));
  expect(select).toHaveBeenCalledTimes(1);
  expect(target(view.root, 'selected-source').props.accessibilityState).toEqual(
    { selected: true },
  );
  await act(async () => view.unmount());
});

test.each([
  'unavailable roster',
  'unavailable slugs',
  'ambiguous roster',
  'ambiguous slugs',
])('%s leaves a familiar name plain with no portrait', async (failure) => {
  if (failure === 'unavailable roster')
    jest.mocked(catalogs.roster).mockRejectedValue(new Error('Offline'));
  if (failure === 'unavailable slugs')
    jest.mocked(catalogs.slugs).mockRejectedValue(new Error('Offline'));
  if (failure === 'ambiguous roster')
    jest.mocked(catalogs.roster).mockResolvedValue(
      result({
        ...roster,
        people: [...roster.people, { ...roster.people[0]! }],
      }),
    );
  if (failure === 'ambiguous slugs')
    jest.mocked(catalogs.slugs).mockResolvedValue(
      result({
        ...slugs,
        slugs: { ...slugs.slugs, 'another-person': 'Don Farrell' },
      }),
    );
  const view = await draw(topic());
  const row = view.root.findAllByType(RecordRow)[0]!;
  expect(row.props.speaker.href).toBeUndefined();
  expect(row.findAllByType(Portrait)).toHaveLength(0);
  expect(portraits.get).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});

test('the iPad related-speech title opens in its pane independently of the speaker', async () => {
  Platform.OS = 'ios';
  const push = jest.fn();
  const pane = {
    push,
    back: () => false,
    select: jest.fn(),
    entries: [],
    depth: 0,
  };
  const view = await draw(
    <PaneHost pane={pane} bar={null}>
      <DocumentReader recordSlug="speech-99" embedded />
    </PaneHost>,
  );
  await families.find((family) => family.name === 'reader related speeches')!
    .prepare!(view.root);
  const row = view.root.findAllByType(RecordRow)[0]!;
  const container = row.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'doc-similar-0-container',
  );
  expect(container.props.accessible).toBe(false);
  press(target(row, 'doc-similar-0-speaker'));
  expect(router.push).toHaveBeenCalledWith(
    personRoute('verified-person-42', 'Don Farrell'),
  );
  expect(push).not.toHaveBeenCalled();
  press(target(row, 'doc-similar-0'));
  expect(push).toHaveBeenCalledWith({
    kind: 'doc',
    key: 'speech-100',
    title: 'Housing',
  });
  await act(async () => view.unmount());
});
