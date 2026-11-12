import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import fixtures from '../scripts/fixtures/records/contracts.json';
import { catalogs } from '../src/api/runtime';
import {
  MachinePill,
  SectionHeader,
  SourceLine,
} from '../src/design/primitives';
import DocumentReader from '../src/features/records/DocumentReader';
import { decodeDocument } from '../src/features/records/model';
import {
  allSources,
  decodeReport,
  reportSlugs,
} from '../src/features/reports/model';
import { openSource } from '../src/navigation/external';
import { docRoute, fromWebPath } from '../src/navigation/routes';
import { index, manifest, people, pinned, roster, slugs } from './pinned';

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
    directory: jest.fn(),
    bills: jest.fn(),
  },
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openSource: jest.fn(async () => {}),
}));
let mockSlug = 'speech-18098';
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
      Screen: () => null,
      Toolbar: Object.assign(part('Toolbar'), {
        Button: part('ToolbarButton'),
        Spacer: () => null,
        View: part('ToolbarView'),
      }),
    },
    useLocalSearchParams: () => ({ slug: mockSlug }),
  };
});
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
  // The reader joins its speaker as a bill joins its sponsors.
  jest.mocked(catalogs.directory).mockResolvedValue({
    roster: record(roster),
    slugs: record(slugs),
    people: record(people),
    manifest: record(manifest),
    electorates: record(index),
  } as never);
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
  // The record title binds its short last word (design/record-title.ts).
  expect(
    textOf(view.root.findByProps({ testID: 'doc-title' })).replace(
      /\u00A0/g,
      ' ',
    ),
  ).toBe('Speech · 9 February 1999');
  // No official link: the record's one source line opens no original.
  const line = view.root.findByType(SourceLine);
  expect(line.props.testID).toBe('doc-source');
  expect(line.props.originals).toEqual([]);
  await act(async () => view.unmount());
});

// Jake, 10 Oct: "In brief" is labelled by the Machine-written pill alone; the
// disclosure is the pill's sheet and VoiceOver label, never a visible line.
test('a speech brief is labelled by the pill, not a sentence', async () => {
  // A slug of its own: the reader's records client keeps speech-18098.
  mockSlug = 'speech-18101';
  const brief = 'A synthetic brief of this speech.';
  mockTransport.mockImplementation(async () =>
    Response.json({
      ...(responses[zenodo] as object),
      slug: mockSlug,
      summary: brief,
    }),
  );
  const view = await mount(<DocumentReader />);
  const heading = view.root
    .findAllByType(SectionHeader)
    .find((n) => n.props.testID === 'doc-brief')!;
  expect(heading.props.title).toBe('In short');
  expect(heading.props.onPress).toBeUndefined();
  const label = view.root.find(
    (n) => n.props.testID === 'doc-brief-label' && n.props.accessibilityLabel,
  );
  // The pill says "Machine-written"; how it was written is in its sheet.
  expect(label.props.accessibilityLabel).toBe('Machine-written');
  expect(view.root.findByType(MachinePill).props.note.body).toEqual([
    'Written by a model from this speech. It is not part of the record.',
  ]);
  const shown = textOf(view.root);
  expect(shown).toContain('Machine-written');
  expect(shown).toContain(brief);
  expect(shown).not.toMatch(/by a model|part of the record/);
  // A parent render keeps the summary visible.
  await act(async () => view.update(<DocumentReader />));
  expect(textOf(view.root)).toContain(brief);
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
