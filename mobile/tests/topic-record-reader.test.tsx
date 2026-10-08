import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { decodeDocument } from '../src/features/records/model';
import DocumentReader from '../src/features/records/DocumentReader';
import { SourceRows } from '../src/features/reports/parts';
import {
  allSources,
  decodeReport,
  reportSlugs,
} from '../src/features/reports/model';
import { docRoute, fromWebPath } from '../src/navigation/routes';
import { catalogs } from '../src/api/runtime';
import { openSource } from '../src/navigation/external';
import { pinned, roster, slugs } from './pinned';

// Jake, build 17/18: Today → Gambling → "Peter Costello — 1999-02-09" opened
// the reader, which failed with "The catalog response could not be read."
// The 1990s federal speeches (Zenodo) have no official link, and
// /api/resource sends url '' for them.
const responses: Record<string, unknown> = fixtures.responses;
const zenodo = '/api/resource/speech-18098';
const mockTransport = jest.fn();
jest.mock('../src/features/records/runtime', () => {
  const { ApiClient } = jest.requireActual('../src/api/client');
  const { CatalogCache } = jest.requireActual('../src/api/cache');
  const { Records } = jest.requireActual('../src/features/records/data');
  return {
    records: new Records(
      new ApiClient({
        origin: 'http://127.0.0.1:8941',
        version: 'test',
        build: '7',
        retries: 0,
        transport: (url: string) => mockTransport(url),
        cache: new CatalogCache({
          readIndex: async () => [],
          writeIndex: async () => {},
          read: async () => undefined,
          write: async () => {},
          remove: async () => {},
        }),
      }),
    ),
  };
});
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    billFor: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
    bills: jest.fn(),
  },
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => {}),
}));
let mockSlug = 'speech-18098';
jest.mock('expo-router', () => ({
  useSegments: () => [],
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ slug: mockSlug }),
}));
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
async function mount(component: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(component);
  });
  return view;
}
const textOf = (node: TestRenderer.ReactTestInstance): string =>
  node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const reportSources = reportSlugs.flatMap((slug) =>
  allSources(decodeReport(pinned(`/reports/${slug}.json`))),
);
const costello = reportSources.find((s) => s.slug === 'speech-18098')!;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(catalogs.roster).mockResolvedValue(record(roster));
  jest.mocked(catalogs.slugs).mockResolvedValue(record(slugs));
  jest.mocked(catalogs.billFor).mockResolvedValue(record(null) as never);
});

test('every cited and retrieved record on the report and topic pages opens the native reader', () => {
  expect(costello).toMatchObject({
    date: '1999-02-09',
    speaker: 'Peter Costello',
  });
  for (const s of reportSources)
    expect(fromWebPath(`/doc/${s.slug}`)).toEqual(docRoute(s.slug));
});

test('a record without an official link decodes; only View original is dropped', () => {
  expect((responses[zenodo] as { url: string }).url).toBe('');
  const doc = decodeDocument(responses[zenodo]);
  expect(doc.url).toBeNull();
  expect(doc.title).toBe('Peter Costello — 1999-02-09');
  expect(
    decodeDocument({ ...(responses[zenodo] as object), url: 'not a link' }).url,
  ).toBeNull();
});

test('the reader opened from a topic record loads the 1999 speech', async () => {
  mockSlug = 'speech-18098';
  mockTransport.mockImplementation(async (url: string) =>
    Response.json(responses[new URL(url).pathname]),
  );
  const view = await mount(<DocumentReader />);
  expect(mockTransport).toHaveBeenCalledTimes(1);
  expect(new URL(mockTransport.mock.calls[0][0]).pathname).toBe(zenodo);
  expect(view.root.findAllByProps({ testID: 'doc-error' })).toHaveLength(0);
  expect(textOf(view.root.findByProps({ testID: 'doc-title' }))).toBe(
    'Peter Costello — 1999-02-09',
  );
  expect(view.root.findAllByProps({ testID: 'doc-source' })).toHaveLength(0);
  await act(async () => view.unmount());
});

test('an unreadable record ends in an error with Try again and the web reader', async () => {
  mockSlug = 'speech-18099';
  mockTransport.mockImplementation(async () =>
    Response.json({ slug: 'speech-18099', title: 'Unreadable', labels: {} }),
  );
  const view = await mount(<DocumentReader />);
  expect(view.root.findByProps({ testID: 'doc-error' })).toBeTruthy();
  const web = view.root.findByProps({ testID: 'doc-error-web' });
  await act(async () => web.props.onPress());
  expect(openSource).toHaveBeenCalledWith(
    expect.stringMatching(/\/doc\/speech-18099$/),
    'OPAX record',
  );
  await act(async () => view.unmount());
});

test('a server failure ends in Try again only; the web reader would fail too', async () => {
  mockSlug = 'speech-18100';
  mockTransport.mockImplementation(async () =>
    Response.json({ error: 'resource fetch failed (503)' }, { status: 502 }),
  );
  const view = await mount(<DocumentReader />);
  expect(view.root.findByProps({ testID: 'doc-error' })).toBeTruthy();
  expect(view.root.findAllByProps({ testID: 'doc-error-web' })).toHaveLength(0);
  await act(async () => view.unmount());
});

test('topic record rows name the speaker once and the date once', async () => {
  const view = await mount(<SourceRows sources={[costello]} testID="row" />);
  const row = view.root.findByProps({ testID: 'row-0' });
  expect(row.props.title).toBe('Peter Costello');
  expect(row.props.detail).toBe(
    'Liberal · Federal Parliament · 9 February 1999',
  );
  await act(async () => view.unmount());
  const subject = await mount(
    <SourceRows
      sources={[
        {
          ...costello,
          title: 'Peter Costello — Gambling inquiry — 1999-02-09',
        },
      ]}
      testID="row"
    />,
  );
  expect(subject.root.findByProps({ testID: 'row-0' }).props).toMatchObject({
    title: 'Gambling inquiry',
    detail: 'Peter Costello · Liberal · Federal Parliament · 9 February 1999',
  });
  await act(async () => subject.unmount());
});
