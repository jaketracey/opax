import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { CatalogCache } from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { assertAllowedPath } from '../src/api/policy';
import { decodeReport } from '../src/api/report-decoders';
import { openSource } from '../src/navigation/external';
import { ReportContent } from '../src/features/reports/ReportScreen';
import {
  transcriptMonths,
  transcriptTitle,
} from '../src/features/reports/report-transcripts';
import {
  Disclosure,
  Heading,
  Text,
  Link,
} from '../src/features/reports/report-ui';
import robodebt from './fixtures/reports/report-rc-robodebt.json';
import page20 from './fixtures/reports/page-rc-robodebt-20.json';
import page40 from './fixtures/reports/page-rc-robodebt-40.json';
import antisemitism from './fixtures/reports/page-rc-antisemitism.json';
import belcarra from './fixtures/reports/report-integrity-belcarra.json';
import none from './fixtures/reports/report-integrity-none.json';
import notFound from './fixtures/reports/page-404.json';

let mockClient: ApiClient;
jest.mock('../src/api/runtime', () => ({
  recordClient: {
    get: (...args: Parameters<ApiClient['get']>) => mockClient.get(...args),
  },
}));
jest.mock('../src/navigation/external', () => ({
  openSource: jest.fn(),
  webPageUrl: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void) =>
    jest.requireActual('react').useEffect(effect, [effect]),
  router: { push: jest.fn() },
}));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const origin = 'https://example.test';
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
async function show(data: unknown = robodebt) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ReportContent report={decodeReport(data)} />);
  });
  return tree;
}
async function press(tree: TestRenderer.ReactTestRenderer, id: string) {
  await act(async () =>
    tree.root
      .findAll(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress(),
  );
}
function expectHidden(tree: TestRenderer.ReactTestRenderer) {
  for (const testID of [
    'report-transcripts',
    'report-section-transcripts',
    'report-jump-transcripts',
  ])
    expect(tree.root.findAllByProps({ testID })).toHaveLength(0);
}
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => {
    throw new Error('Unexpected fetch');
  });
  jest.mocked(openSource).mockClear();
  mockClient = new ApiClient({
    origin,
    version: '1.0.0',
    build: '1',
    transport: fetchMock,
    retries: 0,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
});
test('an absent transcripts field hides the section and makes no request', async () => {
  const tree = await show(none);
  expect(decodeReport(none).transcripts).toBeUndefined();
  expectHidden(tree);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('a malformed initial envelope hides only transcripts without an error or request', async () => {
  const value = clone(robodebt);
  value.transcripts.offset = 1;
  const tree = await show(value);
  expectHidden(tree);
  expect(
    tree.root.findAllByProps({ testID: 'report-official-source' }).length,
  ).toBeGreaterThan(0);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('uses the API label, count and dates in words, with newest month open first', async () => {
  const tree = await show();
  expect(
    tree.root
      .findAllByType(Heading)
      .some((n) => n.props.children === `${robodebt.transcripts.label} 47`),
  ).toBe(true);
  expect(
    tree.root
      .findAllByType(Text)
      .some(
        (n) =>
          n.props.children ===
          '47 hearing transcripts · 27 September 2022 to 10 March 2023',
      ),
  ).toBe(true);
  const groups = tree.root
    .findAllByType(Disclosure)
    .filter((n) => n.props.id.startsWith('transcript-month-'));
  expect(groups.map((n) => n.props.title)).toEqual([
    'March 2023 (8)',
    'February 2023 (10)',
    'January 2023 (2)',
  ]);
  for (const [index, group] of groups.entries())
    expect(
      tree.root.findAllByProps({ testID: `${group.props.id}-toggle` })[0]!.props
        .accessibilityState.expanded,
    ).toBe(index === 0);
  expect(
    transcriptMonths(
      [...decodeReport(robodebt).transcripts!.items].reverse(),
    ).map((x) => x.month),
  ).toEqual(['2023-03', '2023-02', '2023-01']);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('falls back to the existing heading when label is absent', async () => {
  const { label: _label, ...summary } = robodebt.transcripts;
  const tree = await show({ ...robodebt, transcripts: summary });
  expect(
    tree.root
      .findAllByType(Heading)
      .some((n) => n.props.children === `${transcriptTitle} 47`),
  ).toBe(true);
});
test('walks all 47 Robodebt rows through mocked fetch with no duplicates', async () => {
  fetchMock.mockImplementation(async (input) => {
    const parsed = new URL(String(input));
    const path = parsed.pathname + parsed.search;
    if (path === `/api/report/${robodebt.slug}/transcripts?offset=20`)
      return response(page20);
    if (path === `/api/report/${robodebt.slug}/transcripts?offset=40`)
      return response(page40);
    throw new Error(`Unexpected fetch: ${path}`);
  });
  const tree = await show();
  expect(fetchMock).not.toHaveBeenCalled();
  await press(tree, 'report-transcripts-more');
  await press(tree, 'report-transcripts-more');
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    `${origin}/api/report/${robodebt.slug}/transcripts?offset=20`,
    `${origin}/api/report/${robodebt.slug}/transcripts?offset=40`,
  ]);
  expect(
    tree.root.findAllByProps({ testID: 'report-transcripts-more' }),
  ).toHaveLength(0);
  for (const group of tree.root
    .findAllByType(Disclosure)
    .filter((n) => n.props.id.startsWith('transcript-month-'))) {
    const id = `${group.props.id}-toggle`;
    if (
      !tree.root.findAllByProps({ testID: id })[0]!.props.accessibilityState
        .expanded
    )
      await press(tree, id);
  }
  const actual = tree.root
    .findAllByType(Link)
    .filter((n) => /^report-transcript-transcript-/.test(n.props.testID || ''))
    .map((n) => n.props.testID.replace('report-transcript-', ''));
  expect(actual).toEqual(
    [...robodebt.transcripts.items, ...page20.items, ...page40.items].map(
      (row) => row.id,
    ),
  );
  expect(new Set(actual).size).toBe(47);
});
test('a saved 404 hides the section and contents entry silently', async () => {
  fetchMock.mockResolvedValue(response(notFound, 404));
  const tree = await show();
  await press(tree, 'report-transcripts-more');
  expectHidden(tree);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    tree.root
      .findAllByType(Text)
      .some((n) => String(n.props.children).includes(notFound.error)),
  ).toBe(false);
});
test.each([
  'duplicate',
  'count',
  'first_date',
  'last_date',
  'next_offset',
  'offset',
  'malformed',
] as const)(
  'a later page with %s damage hides the section silently',
  async (damage) => {
    const page = clone(page20);
    if (damage === 'duplicate')
      page.items[0]!.id = robodebt.transcripts.items[0]!.id;
    if (damage === 'count') page.count++;
    if (damage === 'first_date') page.first_date = '2022-09-26';
    if (damage === 'last_date') page.last_date = '2023-03-11';
    if (damage === 'next_offset') page.next_offset = 39;
    if (damage === 'offset') page.offset = 19;
    if (damage === 'malformed') page.items[0]!.pages = -1;
    fetchMock.mockResolvedValue(response(page));
    const tree = await show();
    await press(tree, 'report-transcripts-more');
    expectHidden(tree);
    expect(
      tree.root
        .findAllByType(Link)
        .some((n) => n.props.title === 'Retry loading hearing days'),
    ).toBe(false);
  },
);
test('retains retry for a transport failure', async () => {
  fetchMock.mockRejectedValue(new TypeError('Offline'));
  const tree = await show();
  await press(tree, 'report-transcripts-more');
  expect(
    tree.root
      .findAllByType(Link)
      .some((n) => n.props.title === 'Retry loading hearing days'),
  ).toBe(true);
});
test('shows the Antisemitism restriction note verbatim as a quiet line', async () => {
  const tree = await show({ ...robodebt, transcripts: antisemitism });
  expect(
    tree.root
      .findAllByType(Text)
      .some(
        (n) =>
          n.props.children === antisemitism.items[0]!.notes[0] &&
          n.props.selectable &&
          n.props.variant === 'secondary',
      ),
  ).toBe(true);
});
test('PDF and publisher links name their targets for accessibility and open the source', async () => {
  const tree = await show();
  const row = robodebt.transcripts.items[0]!;
  const id = `report-transcript-${row.id}`;
  const link = tree.root
    .findAllByType(Link)
    .find((n) => n.props.testID === id)!;
  expect(link.props.title).toBe(
    'Transcript PDF, 114 pages, robodebt.royalcommission.gov.au',
  );
  const pdf = tree.root
    .findAllByProps({ testID: id })
    .find((n) => n.props.accessibilityRole === 'link')!;
  expect(pdf.props.accessibilityLabel).toBe(
    `Transcript PDF, 114 pages, robodebt.royalcommission.gov.au, 10 March 2023, ${row.title}`,
  );
  expect(pdf.props.accessibilityHint).toBe('Opens in the in-app browser');
  const pageID = `report-transcript-page-${row.id}`;
  const page = tree.root
    .findAllByProps({ testID: pageID })
    .find((n) => n.props.accessibilityRole === 'link')!;
  expect(page.props.accessibilityLabel).toBe(
    `Publisher’s hearing page, robodebt.royalcommission.gov.au, 10 March 2023, ${row.title}`,
  );
  await press(tree, id);
  expect(openSource).toHaveBeenLastCalledWith(row.url, link.props.title);
  await press(tree, pageID);
  expect(openSource).toHaveBeenLastCalledWith(row.page_url, expect.any(String));
});
test('shows each order as a short, accessible source link and omits absent hearing pages', async () => {
  const value = clone(robodebt);
  const row = value.transcripts.items[0]!;
  const order = 'https://publisher.example.test/orders/publication.pdf';
  row.orders.push(
    order,
    'https://publisher.example.test/orders/suppression.pdf',
  );
  row.publisher_redacted = true;
  const { page_url: _page, pages: _pages, ...withoutPage } = row;
  const tree = await show({
    ...value,
    transcripts: {
      ...value.transcripts,
      items: [withoutPage, ...value.transcripts.items.slice(1)],
    },
  });
  expect(
    tree.root.findAllByProps({ testID: `report-transcript-page-${row.id}` }),
  ).toHaveLength(0);
  expect(
    tree.root
      .findAllByType(Link)
      .some(
        (n) =>
          n.props.testID === `report-transcript-${row.id}` &&
          n.props.title === 'Transcript PDF, robodebt.royalcommission.gov.au',
      ),
  ).toBe(true);
  const orders = tree.root
    .findAllByType(Link)
    .filter((n) =>
      n.props.testID?.startsWith(`report-transcript-order-${row.id}-`),
    );
  expect(orders.map((n) => n.props.title)).toEqual(['Order', 'Order']);
  const id = `report-transcript-order-${row.id}-0`;
  const control = tree.root
    .findAllByProps({ testID: id })
    .find((n) => n.props.accessibilityRole === 'link')!;
  expect(control.props.accessibilityLabel).toBe(
    `Order 1, publisher.example.test, 10 March 2023, ${row.title}`,
  );
  expect(control.props.accessibilityHint).toBe('Opens in the in-app browser');
  await press(tree, id);
  expect(openSource).toHaveBeenLastCalledWith(order, 'Order');
  expect(
    tree.root
      .findAllByType(Text)
      .some((n) => n.props.children === 'Redacted by the publisher.'),
  ).toBe(true);
});
test('integrity case-only rows render and multiple files share a hearing-day group', async () => {
  const value = clone(belcarra);
  const { title: _title, ...caseOnly } = value.transcripts.items[0]!;
  const tree = await show({
    ...value,
    transcripts: {
      ...value.transcripts,
      items: [caseOnly, ...value.transcripts.items.slice(1)],
    },
  });
  expect(
    tree.root
      .findAllByType(Text)
      .some((n) => n.props.children === `14 Jun 2017 · ${caseOnly.case}`),
  ).toBe(true);
  const day = tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      n.props.testID === `report-hearing-day-${caseOnly.hearing_date}`,
  );
  expect(day).toHaveLength(1);
  expect(
    day[0]!
      .findAllByType(Link)
      .filter((n) => n.props.testID?.startsWith('report-transcript-qld_ccc-')),
  ).toHaveLength(
    value.transcripts.items.filter(
      (row) => row.hearing_date === caseOnly.hearing_date,
    ).length,
  );
});
test('cancels the mocked fetch on unmount', async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const tree = await show();
  await press(tree, 'report-transcripts-more');
  const signal = fetchMock.mock.calls[0]![1]!.signal;
  expect(signal?.aborted).toBe(false);
  await act(async () => tree.unmount());
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(response(page20)));
});
test('allows only the reviewed public GET with one canonical non-negative offset', () => {
  expect(() =>
    assertAllowedPath(`/api/report/${robodebt.slug}/transcripts?offset=20`),
  ).not.toThrow();
  for (const suffix of [
    '?offset=-1',
    '?offset=01',
    '?offset=1.5',
    '?offset=NaN',
    '?offset=2&offset=3',
    '?offset=2&fresh=1',
    '?offset=2#x',
    '',
    '?offset=9999999999',
  ])
    expect(() =>
      assertAllowedPath(`/api/report/${robodebt.slug}/transcripts${suffix}`),
    ).toThrow();
});
