import { act } from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Button, PopUpButton, Text } from '../src/design/primitives';
import Matrix from '../src/features/explore/Matrix';
import WordsDollars, {
  pairFigures,
} from '../src/features/explore/WordsDollars';
import { pairSpeechText } from '../src/features/explore/PairRow';
import { pairings } from '../src/features/explore/model';
import { decodeDatedMatrix } from '../src/features/explore/repository';
import {
  decodeIndustryMoney,
  decodeMatrix,
} from '../src/features/reports/model';
import { exploreFixture } from '../scripts/explore-fixture';
import { reportsFixture } from '../scripts/reports-fixture';
import { pinnedBytes } from './pinned';

// The bytes the e2e fixture server sends for a path, in its own order
// (scripts/fixture-server.ts): the Explore fixture first, then the reports
// fixture, then the pinned files. Unit mocks of the matrix bypassed the
// Explore fixture, which answered /api/matrix with the tide.
const reportBytes = reportsFixture(pinnedBytes);
const served = (path: string) =>
  exploreFixture(path, reportBytes) ?? reportBytes(path) ?? pinnedBytes(path);
const json = (path: string): unknown => JSON.parse(served(path).toString());

jest.mock('../src/api/runtime', () => {
  const { ApiClient } = jest.requireActual('../src/api/client');
  const { CatalogCache } = jest.requireActual('../src/api/cache');
  const { ReportsRepository } = jest.requireActual(
    '../src/features/reports/repository',
  );
  const { exploreFixture: explore } = jest.requireActual(
    '../scripts/explore-fixture',
  );
  const { reportsFixture: reportsBytes } = jest.requireActual(
    '../scripts/reports-fixture',
  );
  const { pinnedBytes: pinned } = jest.requireActual('./pinned');
  const report = reportsBytes(pinned);
  const apiClient = new ApiClient({
    origin: 'http://127.0.0.1:8951',
    version: '1',
    build: '1',
    transport: (async (input: string | URL) => {
      const url = new URL(String(input));
      const path = url.pathname + url.search;
      return new Response(
        explore(path, report) ?? report(path) ?? pinned(path),
        {
          status: 200,
        },
      );
    }) as typeof fetch,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
  return { apiClient, reports: new ReportsRepository(apiClient) };
});
jest.mock('../src/storage/two-slot', () => ({
  TwoSlotStore: class {
    read = async () => null;
    save = async () => undefined;
  },
}));
// As tests/row-hosting.test.tsx: the real Link.Trigger inside an asChild
// Slot, the two Radix merges a row's style goes through on iOS.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const actual = jest.requireActual('expo-router');
  const { Slot } = jest.requireActual('expo-router/build/ui/Slot');
  const { LinkTrigger } = jest.requireActual('expo-router/build/link/elements');
  function Link({
    children,
    href,
  }: {
    children?: React.ReactNode;
    href: string;
  }) {
    const kids = React.Children.toArray(children) as React.ReactElement[];
    const trigger =
      kids.find((child) => child.type === LinkTrigger) ??
      React.createElement(LinkTrigger, null, children);
    return React.createElement(Slot, { href, role: 'link' }, trigger);
  }
  return {
    ...actual,
    Link: Object.assign(Link, {
      Trigger: LinkTrigger,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: { Screen: () => null },
    router: { push: jest.fn(), navigate: jest.fn() },
  };
});

let renderer: TestRenderer.ReactTestRenderer | null = null;
async function render(element: React.ReactElement) {
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  // The client resolves the fixture over a few microtask turns.
  for (let i = 0; i < 5; i++) await act(async () => {});
  return renderer!.root;
}
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});
const hosts = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const texts = (root: ReactTestInstance) =>
  root
    .findAllByType(Text)
    .flatMap((node) => [node.props.children].flat())
    .filter((value): value is string => typeof value === 'string');

describe('Who owns which debate, on the served fixture', () => {
  test('/api/matrix is the matrix, not the tide, and decodes with its parties', () => {
    const raw = json('/api/matrix');
    expect(Object.keys(raw as object).sort()).toEqual([
      'cells',
      'labelled',
      'parties',
      'totals',
    ]);
    const data = decodeMatrix(raw);
    expect(decodeDatedMatrix(raw).parties).toEqual(data.parties);
    expect(data.parties).toEqual(expect.arrayContaining(['Labor', 'Liberal']));
    expect(data.labelled).toBeGreaterThan(0);
  });

  test('the screen draws party chips, not the read error', async () => {
    const root = await render(<Matrix />);
    expect(texts(root).join('\n')).not.toMatch(/could not be read/);
    const chips = root
      .findAllByType(Button)
      .filter((node) => /^matrix-cell-/.test(node.props.testID ?? ''));
    expect(chips.length).toBeGreaterThan(0);
    const data = decodeMatrix(json('/api/matrix'));
    const [slug, cells] = Object.entries(data.cells).find(
      ([, c]) => (c.Labor ?? 0) > 0,
    )!;
    const pct = ((cells.Labor ?? 0) / data.totals[slug]!) * 100;
    expect(chips.map((node) => node.props.label)).toContain(
      `Labor · ${pct < 1 ? '<1' : Math.round(pct)}%`,
    );
  });
});

describe('Words per dollar, on the served fixture', () => {
  const matrix = decodeDatedMatrix(json('/api/matrix'));
  const money = decodeIndustryMoney(json('/graph/money.json'));
  // The pairing whose subject has the most speeches with a party recorded.
  const pairing = pairings.reduce((best, p) =>
    pairFigures(p, matrix, money).panel.base >
    pairFigures(best, matrix, money).panel.base
      ? p
      : best,
  );

  test('a party speech share is a percentage, not "Not loaded"', () => {
    const figures = pairFigures(pairing, matrix, money);
    const labor = figures.rows.find((r) => r.party === 'Labor')!;
    expect(labor.speechMissing).toBe(false);
    expect(typeof labor.share).toBe('number');
    expect(labor.count).toBeGreaterThan(0);
    expect(pairSpeechText(labor)).toMatch(/^(<1|\d+)% · [\d,]+ speech/);
    expect(figures.rows.every((r) => pairSpeechText(r) !== 'Not loaded')).toBe(
      true,
    );
  });

  test('the screen loads speech shares, and each linked line lays out as one row', async () => {
    const root = await render(<WordsDollars />);
    const subject = root
      .findAllByType(PopUpButton)
      .find((node) => node.props.testID === 'wd-subject')!;
    act(() => subject.props.onChange(pairing.topic));
    expect(hosts(root, 'wd-speech-error')).toHaveLength(0);
    const all = texts(root);
    expect(all).not.toContain('Not loaded');
    expect(all.some((t) => /^(<1|\d+)% · [\d,]+ speech/.test(t))).toBe(true);
    // The Pressable inside each accessible RowLink host keeps the row style
    // (the wave 4 regression stacked glyph, bar, value, chevron).
    const linked = root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        /^wd-(money|speech)-/.test(node.props.testID ?? '') &&
        node.props.accessibilityRole === 'link',
    );
    expect(linked.length).toBeGreaterThan(0);
    for (const line of linked) {
      const pressable = line.find(
        (node) =>
          typeof node.type !== 'string' &&
          typeof node.props.style === 'function',
      );
      const style = StyleSheet.flatten(
        pressable.props.style({ pressed: false }),
      ) as Record<string, unknown>;
      expect(style.flexDirection).toBe('row');
      expect(style.alignItems).toBe('center');
    }
  });
});
