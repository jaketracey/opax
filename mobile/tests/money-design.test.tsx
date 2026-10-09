import { act } from 'react';
import { Text as NativeText, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { decodeDiscovery } from '../src/api/catalog-decoders';
import { catalogs } from '../src/api/runtime';
import { money } from '../src/features/money-public/runtime';
import {
  AsAtLine,
  BigFigure,
  Heading,
  InfoButton,
  LinkRow,
  OpaxWebLink,
  RowList,
  Section,
  SourceLine,
  SourceLink,
  ViewOriginal,
} from '../src/design/primitives';
import Hub from '../src/features/money-public/Hub';
import Grants from '../src/features/money-public/Grants';
import Program from '../src/features/money-public/Program';
import Largest from '../src/features/money-public/Largest';
import Agencies, { Agency } from '../src/features/money-public/Agencies';
import Discover from '../src/features/money-public/Discover';
import Allocation from '../src/features/money-public/Allocation';
import Connections from '../src/features/money-public/Connections';

// Design programme pass 4A (docs/design/DESIGN-REVIEW-2026-10.md, section 2
// and "Money and leads"): one accent per view, on the section marks and the
// one display figure; one source line per block; no as-at lines, ⓘ or "View
// original" beside it; titles in ink; word-safe text at AX5.
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { discovery: jest.fn() } }));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const raw = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public' + path), 'utf8'),
  );
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (v: unknown) => T,
  ): Promise<RecordResult<T>> {
    return {
      data: decode(raw(path)),
      stale: false,
      savedAt: 10,
      asOf: null,
    };
  },
};
const fixture = new MoneyCatalogs(client);
const screens = [
  ['Public money', Hub, {}],
  ['Grants', Grants, { jur: 'federal' }],
  ['Program', Program, { jur: 'federal', id: 'GO3141' }],
  ['Largest', Largest, {}],
  ['Agencies', Agencies, {}],
  ['Agency', Agency, { id: 'a-7431f054588d4251c0b4' }],
  ['Discover', Discover, {}],
  ['Allocation', Allocation, {}],
  ['Programs & places', Connections, {}],
] as const;
beforeEach(() => {
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  for (const name of [
    'grants',
    'notes',
    'program',
    'largest',
    'agencies',
    'agency',
    'report',
    'allocation',
    'history',
    'locations',
    'connections',
    'evidence',
  ] as const)
    money[name] = fixture[name].bind(fixture) as never;
  (catalogs.discovery as jest.Mock).mockImplementation(() =>
    client.get('/discovery.json', decodeDiscovery),
  );
});
async function render(Screen: () => React.ReactElement | null) {
  let rendered!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Screen />);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

test.each(screens)(
  '%s: one accent, source lines only, a title in ink',
  async (_name, Screen, params) => {
    Object.assign(mockParams, params);
    const r = await render(Screen);
    for (const retired of [
      AsAtLine,
      InfoButton,
      ViewOriginal,
      SourceLink,
      OpaxWebLink,
    ])
      expect(r.root.findAllByType(retired)).toHaveLength(0);
    // The accent is the money ink, on section marks and one figure only.
    const accented = r.root
      .findAllByType(BigFigure)
      .filter((figure) => figure.props.accent);
    expect(accented.length).toBeLessThanOrEqual(1);
    for (const figure of accented) expect(figure.props.accent).toBe('money');
    for (const row of r.root.findAllByType(LinkRow))
      expect(row.props.accent).toBeUndefined();
    const title = r.root
      .findAllByType(Heading)
      .find((heading) => heading.props.level === 1)!;
    expect(title.props.tone).toBeUndefined();
    await act(async () => r.unmount());
  },
);

test.each(screens)(
  '%s at AX5: every line of text wraps whole, never clipped',
  async (_name, Screen, params) => {
    Object.assign(mockParams, params);
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
    const r = await render(Screen);
    for (const text of r.root.findAllByType(NativeText))
      expect(text.props.numberOfLines).toBeUndefined();
    await act(async () => r.unmount());
  },
);

test('public money is one heading and one list, every row saying where it goes', async () => {
  const r = await render(Hub);
  expect(r.root.findAllByType(Section)).toHaveLength(0);
  expect(r.root.findAllByType(RowList)).toHaveLength(1);
  const titles = r.root.findAllByType(LinkRow).map((row) => row.props.title);
  expect(titles).toEqual([
    'Commonwealth grants',
    'Queensland grants',
    'The month’s largest grants',
    'Where community funding goes',
    'Government agencies',
    'Discover',
    'Programs & places',
    'Money map',
  ]);
  await act(async () => r.unmount());
});

test('grants: the total, the donor overlap in one sentence and one source line', async () => {
  Object.assign(mockParams, { jur: 'federal' });
  const r = await render(Grants);
  const figure = r.root.findByType(BigFigure);
  expect(figure.props.testID).toBe('grants-total');
  const sources = r.root.findAllByType(SourceLine);
  expect(sources.map((s) => s.props.testID)).toEqual(['grants-source']);
  // The overlap table and the per-row caption fold into the head and rows.
  expect(
    r.root.findAll((n) => n.props.testID === 'grants-donor-headline'),
  ).not.toHaveLength(0);
  await act(async () => r.unmount());
});

test('largest grants: one dated line for the month, then one source per award', async () => {
  const r = await render(Largest);
  const sources = r.root.findAllByType(SourceLine);
  expect(sources[0]!.props.testID).toBe('largest-source');
  expect(sources[0]!.props.asOf).toBeTruthy();
  const rows = sources.slice(1);
  expect(rows.length).toBeGreaterThan(0);
  rows.forEach((row, i) => {
    expect(row.props.testID).toBe(`largest-source-${i}`);
    // The month's line dates the list; a row names its register and record.
    expect(row.props.dateLabel).toBeNull();
    expect(row.props.citation).toBe('GrantConnect');
  });
  await act(async () => r.unmount());
});

test('program notes and audits live in the program’s source sheet', async () => {
  Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
  const r = await render(Program);
  const notes = r.root
    .findAllByType(SourceLine)
    .find((s) => s.props.testID === 'program-notes')!;
  expect(notes.props.title).toBe('Program notes');
  expect(notes.props.notes.filter(Boolean).length).toBeGreaterThan(0);
  await act(async () => r.unmount());
});
