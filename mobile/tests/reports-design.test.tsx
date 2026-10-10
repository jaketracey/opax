/* eslint-disable @typescript-eslint/no-require-imports -- Jest factory builds an isolated fixture client before app imports. */
import { act } from 'react';
import { Text as NativeText, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Stack } from 'expo-router';
import {
  AsAtLine,
  BigFigure,
  Button,
  ChoiceChips,
  Disclosure,
  Heading,
  IconTile,
  InfoButton,
  LinkRow,
  MachineLabel,
  RowList,
  Section,
  SegmentedControl,
  SourceLine,
  StaleNotice,
} from '../src/design/primitives';
import ReportsIndex from '../src/features/reports/ReportsIndex';
import ReportPage from '../src/features/reports/ReportPage';
import TopicsIndex from '../src/features/reports/TopicsIndex';
import TopicPage from '../src/features/reports/TopicPage';
import Stats from '../src/features/reports/Stats';
import Methods from '../src/features/reports/Methods';
import ExploreHub from '../src/features/explore/Hub';
import { RecordsLine } from '../src/features/reports/parts';

// Design programme pass 4B (docs/design/DESIGN-REVIEW-2026-10.md, section 2
// and "Reports and Explore"): a report's title once, one machine label per
// report, the views as the pill segmented control, one source line per
// section, citations inline; one level of container, no icon tiles and one
// accent per view on the topics and Explore screens; word-safe at AX5.
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: jest.fn(() => null) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/api/runtime', () => {
  const { ReportsRepository } = require('../src/features/reports/repository');
  const { pinnedBytes } = require('./pinned');
  const fixture = require('../scripts/reports-fixture').reportsFixture(
    pinnedBytes,
  );
  const get = jest.fn(
    async (path: string, decode: (v: unknown) => unknown) => ({
      data: decode(JSON.parse((fixture(path) ?? pinnedBytes(path)).toString())),
      stale: false,
      savedAt: 100,
      asOf: null,
    }),
  );
  return { reports: new ReportsRepository({ get, getForAction: get }) };
});

beforeEach(() => {
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest.mocked(Stack.Screen).mockClear();
});
async function render(Screen: () => React.ReactElement | null) {
  let rendered!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Screen />);
  });
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await Promise.resolve();
    });
  return rendered;
}
type Instance = TestRenderer.ReactTestInstance;
const lines = (node: Instance) => [
  ...node.findAllByType(SourceLine),
  ...node.findAllByType(RecordsLine),
];
const sections = (root: Instance) =>
  root.findAllByType(Section).filter((s) => typeof s.props.testID === 'string');
const retired = [AsAtLine, InfoButton, StaleNotice, ChoiceChips];

describe('report page', () => {
  const tabs = ['now', 'over', 'money'] as const;
  test.each(tabs)(
    '%s: the title once, one machine label, one source line per section',
    async (tab) => {
      mockParams.slug = 'gambling';
      const r = await render(ReportPage);
      const control = r.root.findByType(SegmentedControl);
      expect(control.props.testID).toBe('report-tabs');
      await act(async () => control.props.onChange(tab));
      for (let i = 0; i < 3; i++)
        await act(async () => {
          await Promise.resolve();
        });
      // The nav bar names the screen for the back stack, but draws no title:
      // the level 1 heading is the title.
      const options = jest.mocked(Stack.Screen).mock.calls.at(-1)![0] as {
        options: { title: string; headerTitle: string };
      };
      expect(options.options.title).toBe('Gambling');
      expect(options.options.headerTitle).toBe('');
      const titles = r.root
        .findAllByType(Heading)
        .filter((h) => h.props.level === 1);
      expect(titles).toHaveLength(1);
      expect(titles[0]!.props.children).toBe('Gambling');
      expect(r.root.findAllByType(MachineLabel)).toHaveLength(1);
      for (const recipe of retired)
        expect(r.root.findAllByType(recipe)).toHaveLength(0);
      // No capsules per citation or per section.
      const buttons = r.root.findAllByType(Button).map((b) => b.props.label);
      expect(buttons.filter((l) => /^Citation \d/.test(l))).toEqual([]);
      expect(buttons).not.toContain('Share this section');
      // Every block that shows records or figures ends in one source line;
      // the two indexes of sections and records are the records themselves.
      const blocks = sections(r.root).filter(
        (s) =>
          !['report-sections-index'].includes(s.props.testID) &&
          !s.props.title?.startsWith('Every record'),
      );
      expect(blocks.length).toBeGreaterThan(tab === 'money' ? 1 : 2);
      for (const block of blocks)
        expect([block.props.testID, lines(block).length]).toEqual([
          block.props.testID,
          1,
        ]);
      // One accent: the money view's mark; the other views mark nothing.
      const marked = sections(r.root).filter((s) => s.props.accent);
      expect(marked.map((s) => s.props.accent)).toEqual(
        tab === 'money' ? ['money'] : [],
      );
      for (const figure of r.root.findAllByType(BigFigure))
        expect(figure.props.accent).toBe('votes');
      await act(async () => r.unmount());
    },
  );

  test('citations are inline links, and a clamped opening reads on with Read more', async () => {
    mockParams.slug = 'gambling';
    const r = await render(ReportPage);
    const citations = r.root.findAll(
      (n) =>
        n.type === NativeText &&
        n.props.accessibilityRole === 'link' &&
        /^Citation \d+: /.test(n.props.accessibilityLabel ?? ''),
    );
    expect(citations.length).toBeGreaterThan(0);
    for (const c of citations) expect(c.props.children).toMatch(/^\[\d+\]$/);
    const more = r.root
      .findAllByType(Disclosure)
      .find((d) => d.props.testID === 'report-lede-toggle')!;
    expect(more.props.label).toBe('Read more');
    // The opening's records are one line, not a "Records for this opening"
    // fold.
    const lede = r.root
      .findAllByType(RecordsLine)
      .find((l) => l.props.testID === 'report-lede-sources')!;
    expect(lede.props.sources.length).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });

  test('a section’s records line opens its records, numbered as the prose cites them', async () => {
    mockParams.slug = 'gambling';
    const r = await render(ReportPage);
    const line = r.root
      .findAllByType(RecordsLine)
      .find((l) => l.props.testID === 'report-section-sources-1')!;
    const press = line.find(
      (n) =>
        n.props.testID === 'report-section-sources-1' &&
        typeof n.props.onPress === 'function',
    );
    expect(press.props.accessibilityLabel).toMatch(
      /^Updated \d+ \w+ 2026, Hansard, \d+ records? cited/,
    );
    await act(async () => press.props.onPress());
    const first = r.root
      .findAllByType(LinkRow)
      .find((row) => row.props.testID === 'report-section-sources-1-cited-0')!;
    expect(first.props.title).toMatch(/^\[\d+\] /);
    await act(async () => r.unmount());
  });

  test('a section on its own page keeps the title, the label and its records', async () => {
    Object.assign(mockParams, { slug: 'gambling', section: '1' });
    const r = await render(ReportPage);
    expect(r.root.findAllByType(MachineLabel)).toHaveLength(1);
    expect(r.root.findAllByType(SegmentedControl)).toHaveLength(0);
    const essay = sections(r.root).find(
      (s) => s.props.testID === 'report-section-1',
    )!;
    expect(lines(essay)).toHaveLength(1);
    await act(async () => r.unmount());
  });
});

test('reports: no self-titled section, one dated line for the set', async () => {
  const r = await render(ReportsIndex);
  expect(r.root.findAllByType(Section).map((s) => s.props.title)).toEqual([
    undefined,
    undefined,
  ]);
  const rows = r.root
    .findAllByType(LinkRow)
    .filter((row) => String(row.props.testID).startsWith('report-open-'));
  expect(rows.length).toBe(7);
  for (const row of rows) expect(row.props.detail).not.toMatch(/Updated/);
  const sources = r.root.findAllByType(SourceLine);
  expect(sources).toHaveLength(1);
  // Dated by the reports themselves, never "Date not published"; each
  // report's own date is in the line's sheet.
  expect(sources[0]!.props.asOf).toBeTruthy();
  expect(sources[0]!.props.extra).toBeTruthy();
  expect(
    r.root.findAllByType(Section).filter((s) => s.props.accent),
  ).toHaveLength(1);
  await act(async () => r.unmount());
});

test('topics: one list, its notes in the source line, one accent', async () => {
  const r = await render(TopicsIndex);
  for (const recipe of retired)
    expect(r.root.findAllByType(recipe)).toHaveLength(0);
  // The topics are rows of one list, not a ruled section each.
  expect(r.root.findAllByType(Section)).toHaveLength(1);
  const list = r.root.findAllByType(RowList)[0]!;
  expect(
    list.findAll((n) => String(n.props.testID).startsWith('topic-open-'))
      .length,
  ).toBeGreaterThan(20);
  const source = r.root
    .findAllByType(SourceLine)
    .find((s) => s.props.testID === 'topics-as-at')!;
  expect(source.props.notes.length).toBe(2);
  expect(
    r.root.findAllByType(Section).filter((s) => s.props.accent),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});

test('topic: one accent on the count, one source line per section', async () => {
  mockParams.slug = 'gambling';
  const r = await render(TopicPage);
  for (const recipe of retired)
    expect(r.root.findAllByType(recipe)).toHaveLength(0);
  expect(
    r.root.findAllByType(Section).filter((s) => s.props.accent),
  ).toHaveLength(0);
  expect(r.root.findByType(BigFigure).props.accent).toBe('votes');
  for (const block of sections(r.root).filter(
    (s) => s.props.testID !== 'topic-more',
  ))
    expect([block.props.testID, lines(block).length]).toEqual([
      block.props.testID,
      1,
    ]);
  await act(async () => r.unmount());
});

test('stats and methods: no accent marks on figures lists or prose, no icon tiles', async () => {
  for (const Screen of [Stats, Methods]) {
    const r = await render(Screen);
    expect(
      r.root.findAllByType(Section).filter((s) => s.props.accent),
    ).toHaveLength(0);
    expect(r.root.findAllByType(IconTile)).toHaveLength(0);
    for (const recipe of retired)
      expect(r.root.findAllByType(recipe)).toHaveLength(0);
    await act(async () => r.unmount());
  }
});

test('Explore: one list of rows, no icon tiles, no accent', async () => {
  const r = await render(ExploreHub);
  expect(r.root.findAllByType(IconTile)).toHaveLength(0);
  for (const row of r.root.findAllByType(LinkRow)) {
    expect(row.props.icon).toBeUndefined();
    expect(row.props.accent).toBeUndefined();
  }
  expect(r.root.findAllByType(RowList)).toHaveLength(1);
  await act(async () => r.unmount());
});

test.each([
  ['Reports', ReportsIndex, {}],
  ['Report', ReportPage, { slug: 'gambling' }],
  ['Topics', TopicsIndex, {}],
  ['Topic', TopicPage, { slug: 'gambling' }],
  ['Explore', ExploreHub, {}],
] as const)(
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
