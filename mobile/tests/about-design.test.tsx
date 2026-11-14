import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { apiClient } from '../src/api/runtime';
import type { RecordResult } from '../src/api/client';
import { dataAsOf } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { decodeCorpus } from '../src/api/catalog-decoders';
import {
  Heading,
  InlineError,
  LinkRow,
  MachinePill,
  SourceLine,
  Text,
} from '../src/design/primitives';
import About from '../src/features/About';
import { coverageRoute } from '../src/navigation/routes/reference';
import { pinned } from './pinned';

// account.md 3: About is a reading page. Header, intro and independence,
// then Cultural notice, Privacy, Machine-written text and Coverage; its one
// row is Coverage, under the figure it details.
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn(), getForAction: jest.fn() },
  catalogs: {},
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  return { router: { push: jest.fn() }, Stack: { Screen: () => null }, Link };
});
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));
let mockAnalytics = false;
jest.mock('../src/analytics', () => ({
  analyticsEnabled: () => mockAnalytics,
}));

const corpus = pinned('/corpus.json');
const record = (stale = false): RecordResult<unknown> => ({
  data: decodeCorpus(corpus),
  asOf: dataAsOf(corpus),
  stale,
  savedAt: Date.UTC(2026, 9, 3),
});
const get = jest.mocked(apiClient.get);

let renderer: TestRenderer.ReactTestRenderer;
async function render() {
  await act(async () => {
    renderer = TestRenderer.create(<About />);
  });
}
afterEach(() => act(() => renderer.unmount()));
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .flatMap((node) => node.props.children)
    .filter((value) => typeof value === 'string')
    .join('\n');

describe('with coverage', () => {
  beforeEach(async () => {
    get.mockResolvedValue(record() as never);
    await render();
  });

  test('the header is the icon, OPAX and the full name, then intro and independence in body ink', () => {
    const h1 = renderer.root
      .findAllByType(Heading)
      .filter((node) => node.props.level === 1);
    expect(h1.map((node) => [node.props.children, node.props.kind])).toEqual([
      ['OPAX', 'page'],
    ]);
    expect(texts()).toContain('Open Parliamentary Accountability Exchange');
    const independence = renderer.root.findByProps({
      testID: 'about-independence',
    });
    expect(independence.props.variant).toBe('body');
    expect(independence.props.children).toMatch(
      /^OPAX is independent and non-partisan\./,
    );
    expect(
      renderer.root.findByProps({ testID: 'about-name' }).props.children,
    ).toMatch(/^OPAX brings together Australian parliamentary speeches/);
  });

  test('sections run Cultural notice, Privacy, Machine-written text, Coverage, all section titles', () => {
    const sections = renderer.root
      .findAllByType(Heading)
      .filter((node) => node.props.level === 2);
    expect(sections.map((node) => node.props.children)).toEqual([
      'Cultural notice',
      'Privacy',
      'Machine-written text',
      'Coverage',
    ]);
  });

  test('the only row is Coverage, into the Account stack; no Account sheet rows', () => {
    const rows = renderer.root.findAllByType(LinkRow);
    expect(rows.map((row) => row.props.title)).toEqual(['Coverage']);
    expect(rows[0]!.props.href).toEqual(coverageRoute);
    expect(rows[0]!.props.testID).toBe('about-coverage');
    // The 1.0 identifier stays on the same row for one release.
    expect(renderer.root.findAllByProps({ testID: 'about-stats' })).not.toEqual(
      [],
    );
    for (const gone of [
      'Report a correction',
      'OPAX support',
      'Privacy policy',
      'Sources and licences',
      'Methods',
      'Topics A–Z',
      'We aim to respond within 2 business days.',
    ])
      expect(texts()).not.toContain(gone);
  });

  test('privacy is four short paragraphs, the follows line among them', () => {
    const privacy = renderer.root.findByProps({
      testID: 'about-privacy-section',
    });
    const paragraphs = privacy
      .findAllByType(Text)
      .filter((node) => node.props.variant === 'body');
    expect(paragraphs).toHaveLength(4);
    const words = paragraphs.map((node) => node.props.children).join(' ');
    expect(words).toContain(
      'Your electorate and follows are saved on this iPhone only. Device backups may include them.',
    );
    for (const gone of ['Cloudflare', 'member ID', 'reference', '30 days'])
      expect(words).not.toContain(gone);
  });

  test('builds without analytics say nothing about it', () => {
    expect(
      renderer.root.findAllByProps({ testID: 'about-privacy-usage' }),
    ).toHaveLength(0);
  });

  test('machine text shows the label itself, not quoted UI labels', () => {
    const specimen = renderer.root.findByProps({
      testID: 'about-machine-label',
    });
    expect(specimen.props.pointerEvents).toBe('none');
    expect(specimen.props.accessibilityLabel).toBe(
      'Example label: Machine-written',
    );
    expect(specimen.findAllByType(MachinePill)).toHaveLength(1);
    expect(
      specimen.findAll(
        (node) =>
          node.props.accessibilityElementsHidden &&
          node.props.importantForAccessibility === 'no-hide-descendants',
      ).length,
    ).toBeGreaterThan(0);
    expect(texts()).not.toMatch(/[“"]Machine-written[”"]/);
  });

  test('coverage is one figure, one grey line and one navy source line', () => {
    expect(texts()).toContain('691,104');
    expect(texts()).toContain('parliamentary speeches in OPAX');
    const line = renderer.root
      .findAllByType(SourceLine)
      .find((node) => node.props.testID === 'about-coverage-as-at')!;
    expect(line.props.citation).toBe('OPAX');
    expect(line.props.asOf).toBe('2026-10-03');
    expect(line.props.notes).toContain(
      'These counts are what OPAX holds, not search totals.',
    );
    // The refresh job's status lines are pipeline notes, not coverage.
    const limitations = (
      corpus as { refresh: { source_limitations: string[] } }
    ).refresh.source_limitations;
    expect(limitations.length).toBeGreaterThan(0);
    for (const status of limitations)
      expect(line.props.notes).not.toContain(status);
    for (const gone of [
      'Expected resources',
      'Snapshot',
      'Record counts',
      'Structured sources',
      'collection coverage snapshot',
    ])
      expect(texts()).not.toContain(gone);
    expect(texts()).not.toMatch(/\b[a-z]+ [a-z]+_|\w_\w/);
  });
});

test('a saved copy shows the figure with its saved line and no error', async () => {
  get.mockResolvedValue(record(true) as never);
  await render();
  expect(renderer.root.findAllByType(InlineError)).toEqual([]);
  const line = renderer.root
    .findAllByType(SourceLine)
    .find((node) => node.props.testID === 'about-coverage-as-at')!;
  expect(line.props.savedAt).toBe(Date.UTC(2026, 9, 3));
  expect(texts()).toContain('691,104');
});

test('a failed read with nothing saved shows the error and keeps the Coverage row', async () => {
  get.mockRejectedValue(new ApiError('offline', 'Offline.'));
  await render();
  const error = renderer.root.findByType(InlineError);
  expect(error.props.message).toBe('Coverage couldn’t be loaded.');
  expect(
    renderer.root.findAllByType(LinkRow).map((row) => row.props.title),
  ).toEqual(['Coverage']);
  expect(texts()).not.toContain('691,104');
});

describe('with anonymous analytics', () => {
  beforeEach(async () => {
    mockAnalytics = true;
    get.mockResolvedValue(record() as never);
    await render();
  });
  afterEach(() => {
    mockAnalytics = false;
  });

  test('privacy adds one plain line: counts, a random ID, crash reports, never what is typed', () => {
    const privacy = renderer.root.findByProps({
      testID: 'about-privacy-section',
    });
    const paragraphs = privacy
      .findAllByType(Text)
      .filter((node) => node.props.variant === 'body');
    expect(paragraphs).toHaveLength(5);
    const usage = renderer.root.findByProps({
      testID: 'about-privacy-usage',
    });
    expect(usage.props.children).toBe(
      'OPAX counts how the app is used, such as which screens open and how many sources an answer had, with a random ID made on this iPhone. It also sends anonymous crash and error reports, which say where in the app something went wrong. The counts and reports never include what you type, ask or search for, and aren’t linked to your account.',
    );
    expect(usage.props.children).not.toMatch(/[—–]/);
  });
});
