import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ApiError } from '../src/api/errors';
import { assertAllowedPath } from '../src/api/policy';
import {
  decodeReport,
  decodeReportTranscripts,
} from '../src/api/report-decoders';
import { recordClient } from '../src/api/runtime';
import { ReportContent } from '../src/features/reports/ReportScreen';
import { transcriptMonths } from '../src/features/reports/report-transcripts';
import { Disclosure, Text, Link } from '../src/features/reports/report-ui';
import fixture from './fixtures/reports/transcripts.json';
import royal from './fixtures/reports/royal.json';
jest.mock('../src/api/runtime', () => ({ recordClient: { get: jest.fn() } }));
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
async function show(data: unknown = fixture) {
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
const more = () => ({
  ...fixture.transcripts,
  next_offset: null,
  items: [
    {
      id: 'gloucester-2019-02-04',
      hearing_date: '2019-02-04',
      title: 'Operation Gloucester hearing transcript, 4 February 2019',
      pages: 41,
      url: 'https://www.ibac.vic.gov.au/media/1052/download',
      notes: ['Publisher’s suppression order applies.'],
      orders: [],
    },
  ],
});
beforeEach(() => jest.mocked(recordClient.get).mockReset());

test('missing additive summary hides transcripts and never requests the endpoint', async () => {
  const tree = await show(royal);
  expect(decodeReport(royal).transcripts).toBeUndefined();
  expect(
    tree.root.findAllByProps({ testID: 'report-transcripts' }),
  ).toHaveLength(0);
  expect(recordClient.get).not.toHaveBeenCalled();
});
test.each([
  (x: any) => {
    x.count = '3';
  },
  (x: any) => {
    x.items = {};
  },
  (x: any) => {
    x.first_date = '2019-02-30';
  },
  (x: any) => {
    x.last_date = '2018-01-01';
  },
  (x: any) => {
    x.items[0].hearing_date = '2019-04-01';
  },
  (x: any) => {
    x.items[0].url = 'javascript:alert(1)';
  },
  (x: any) => {
    x.items[0].pages = -1;
  },
  (x: any) => {
    x.items[0].publisher_redacted = 'false';
  },
  (x: any) => {
    x.items[0].orders = ['not a link'];
  },
  (x: any) => {
    x.items[0].notes = [{}];
  },
  (x: any) => {
    x.items[0].title = null;
    x.items[0].case = null;
  },
  (x: any) => {
    x.items[1].id = x.items[0].id;
  },
  (x: any) => {
    x.next_offset = 0;
  },
  (x: any) => {
    x.next_offset = 4;
  },
])('strictly rejects a malformed transcripts block', (damage) => {
  const value = clone(fixture);
  damage(value.transcripts);
  expect(() => decodeReport(value)).toThrow(ApiError);
});

test('shows count and range, groups newest month first and opens only the first group', async () => {
  const tree = await show();
  const groups = tree.root
    .findAllByType(Disclosure)
    .filter((n) => n.props.id.startsWith('transcript-month-'));
  expect(groups.map((n) => n.props.title)).toEqual([
    'March 2019 (1)',
    'February 2019 (1)',
  ]);
  expect(
    tree.root.findAllByProps({ testID: 'transcript-month-2019-03-toggle' })[0]!
      .props.accessibilityState.expanded,
  ).toBe(true);
  expect(
    tree.root.findAllByProps({ testID: 'transcript-month-2019-02-toggle' })[0]!
      .props.accessibilityState.expanded,
  ).toBe(false);
  expect(
    tree.root
      .findAllByType(Text)
      .some(
        (n) =>
          n.props.children ===
          '3 hearing transcripts · 4 Feb 2019 to 1 Mar 2019',
      ),
  ).toBe(true);
  expect(
    tree.root
      .findAllByType(Text)
      .some(
        (n) => n.props.children === fixture.transcripts.items[0]!.notes?.[0],
      ),
  ).toBe(true);
  expect(
    tree.root
      .findAllByType(Link)
      .some(
        (n) => n.props.title === 'Publication order 1: Operation Gloucester',
      ),
  ).toBe(true);
  expect(recordClient.get).not.toHaveBeenCalled();
  await press(tree, 'transcript-month-2019-02-toggle');
  expect(
    tree.root
      .findAllByType(Link)
      .some((n) => n.props.title === '28 Feb 2019 · Operation Gloucester'),
  ).toBe(true);
  const decoded = decodeReport(fixture).transcripts!;
  expect(
    transcriptMonths([...decoded.items].reverse()).map((x) => x.month),
  ).toEqual(['2019-03', '2019-02']);
});

test('loads only the stated next offset, appends rows within the month and stops at the last page', async () => {
  jest
    .mocked(recordClient.get)
    .mockImplementation(
      async (_path, decode) => ({ data: decode(more()) }) as never,
    );
  const tree = await show();
  await press(tree, 'report-transcripts-more');
  expect(recordClient.get).toHaveBeenCalledTimes(1);
  expect(jest.mocked(recordClient.get).mock.calls[0]![0]).toBe(
    `/api/report/${fixture.slug}/transcripts?offset=2`,
  );
  expect(
    tree.root.findAllByProps({ testID: 'report-transcripts-more' }),
  ).toHaveLength(0);
  await press(tree, 'transcript-month-2019-02-toggle');
  expect(
    tree.root
      .findAllByType(Link)
      .filter((n) => n.props.testID?.startsWith('report-transcript-'))
      .map((n) => n.props.title),
  ).toEqual([
    '1 Mar 2019 · Operation Gloucester hearing transcript, 1 March 2019',
    '28 Feb 2019 · Operation Gloucester',
    '4 Feb 2019 · Operation Gloucester hearing transcript, 4 February 2019',
  ]);
  expect(
    tree.root
      .findAllByType(Text)
      .some(
        (n) => n.props.children === 'Publisher’s suppression order applies.',
      ),
  ).toBe(true);
});

test('missing paged endpoint removes the whole section and jump entry silently', async () => {
  jest
    .mocked(recordClient.get)
    .mockRejectedValue(new ApiError('not-found', 'Missing endpoint.', 404));
  const tree = await show();
  await press(tree, 'report-transcripts-more');
  expect(
    tree.root.findAllByProps({ testID: 'report-section-transcripts' }),
  ).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ testID: 'report-jump-transcripts' }),
  ).toHaveLength(0);
  expect(
    tree.root
      .findAllByType(Text)
      .some((n) => String(n.props.children).includes('Missing endpoint')),
  ).toBe(false);
});

test.each(['duplicate', 'count', 'nonadvancing', 'malformed'] as const)(
  'never appends a %s transcript page',
  async (damage) => {
    const page = more();
    if (damage === 'duplicate')
      page.items[0]!.id = fixture.transcripts.items[0]!.id;
    if (damage === 'count') page.count = 4;
    if (damage === 'nonadvancing') (page as any).next_offset = 2;
    if (damage === 'malformed') (page.items[0] as any).pages = '41';
    jest
      .mocked(recordClient.get)
      .mockImplementation(
        async (_path, decode) => ({ data: decode(page) }) as never,
      );
    const tree = await show();
    await press(tree, 'report-transcripts-more');
    expect(
      tree.root
        .findAllByType(Link)
        .some((n) => n.props.title === 'Retry loading hearing days'),
    ).toBe(true);
    expect(
      tree.root
        .findAllByType(Disclosure)
        .find((n) => n.props.id === 'transcript-month-2019-02')!.props.title,
    ).toBe('February 2019 (1)');
  },
);

test('cancels a page when the screen unmounts, without updating the old record', async () => {
  jest
    .mocked(recordClient.get)
    .mockImplementation(() => new Promise(() => {}) as never);
  const tree = await show();
  await press(tree, 'report-transcripts-more');
  const signal = jest.mocked(recordClient.get).mock.calls[0]![3]!.signal;
  expect(signal?.aborted).toBe(false);
  await act(async () => tree.unmount());
  expect(signal?.aborted).toBe(true);
});

test('allows only the reviewed public transcript GET with one canonical non-negative offset', () => {
  expect(() =>
    assertAllowedPath(`/api/report/${fixture.slug}/transcripts?offset=2`),
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
      assertAllowedPath(`/api/report/${fixture.slug}/transcripts${suffix}`),
    ).toThrow();
  expect(() =>
    decodeReportTranscripts({
      count: 0,
      first_date: null,
      last_date: null,
      items: [],
      next_offset: null,
    }),
  ).not.toThrow();
});

test('multiple published files for a hearing date share one day row', async () => {
  const value = clone(fixture);
  value.transcripts.count = 2;
  value.transcripts.first_date = '2019-03-01';
  value.transcripts.next_offset = null as never;
  value.transcripts.items[1]!.hearing_date = '2019-03-01';
  const tree = await show(value);
  const days = tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      n.props.testID?.startsWith('report-hearing-day-'),
  );
  expect(days).toHaveLength(1);
  expect(
    tree.root
      .findAllByType(Link)
      .filter((n) => n.props.testID?.startsWith('report-transcript-')),
  ).toHaveLength(2);
});
