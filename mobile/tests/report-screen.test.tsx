import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import * as Native from 'react-native';
import { BackHandler, Platform, ScrollView, StyleSheet } from 'react-native';
import {
  Text as NativeText,
  Heading as NativeHeading,
  Screen,
} from '../src/design/primitives';
import { decodeReport } from '../src/api/report-decoders';
import ReportScreen, {
  ReportContent,
} from '../src/features/reports/ReportScreen';
import { ReportProvenance } from '../src/features/reports/report-provenance';
import { officialReports } from '../src/features/reports/official';
import { openSource } from '../src/navigation/external';
import {
  Text,
  Heading,
  Link,
  Disclosure,
  styles,
} from '../src/features/reports/report-ui';
import {
  sections,
  figures,
  metaLine,
  recommendationIndex,
  statusCounts,
  splitRuns,
  source,
  factReadable,
  factPrinted,
} from '../src/features/reports/report-model';
import { dark } from '../src/design/palette';
import { rhythm } from '../src/design/tokens';
import royal from './fixtures/reports/royal.json';
import integrity from './fixtures/reports/integrity.json';
import empty from './fixtures/reports/integrity-unextracted.json';
import annual from './fixtures/reports/annual.json';
import agency from './fixtures/reports/agency.json';
jest.mock('../src/api/runtime', () => ({}));
jest.mock('../src/features/reports/official', () => ({
  officialReports: { read: jest.fn() },
}));
jest.mock('../src/navigation/external', () => ({
  openSource: jest.fn(),
  webPageUrl: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  useFocusEffect: (effect: () => void) =>
    jest.requireActual('react').useEffect(effect, [effect]),
  router: { push: jest.fn() },
}));
const texts = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => n.props.children);
async function show(
  fixture: unknown,
  options?: TestRenderer.TestRendererOptions,
) {
  jest.mocked(officialReports.read).mockImplementation(async () => ({
    data: decodeReport(fixture),
    stale: false,
    savedAt: 1,
    asOf: null,
  }));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ReportScreen recordSlug={(fixture as typeof royal).slug} />,
      options,
    );
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
afterEach(() => jest.restoreAllMocks());

test.each([royal, integrity, empty, annual, agency])(
  'renders $report_type with reachable caveats, verbatim evidence and provenance last',
  async (fixture) => {
    const tree = await show(fixture);
    expect(tree.root.findByType(ReportContent).props.report.title).toBe(
      fixture.title,
    );
    expect(tree.root.findAllByType(Disclosure)[0]!.props.title).toBe(
      'How to read this record',
    );
    const toggle = tree.root.findAllByProps({
      testID: 'report-caveats-toggle',
    })[0]!;
    expect(toggle.props.accessibilityState.expanded).toBe(false);
    await press(tree, 'report-caveats-toggle');
    for (const note of fixture.caveats) expect(texts(tree)).toContain(note);
    for (const part of ['findings', 'recommendations'] as const)
      for (const [i, item] of (
        decodeReport(fixture).record[part] || []
      ).entries()) {
        const prose = tree.root.findAllByProps({
          testID: `report-${part}-${i}-text`,
        })[0]!;
        expect(
          prose
            .findAllByType(Text)
            .map((n) => n.props.children)
            .join(''),
        ).toBe(item.text);
        expect(
          prose.findAll((n) => n.props.accessibilityLabel === item.text).length,
        ).toBeGreaterThan(0);
        if (item.label) expect(texts(tree)).toContain(item.label);
      }
    const content = tree.root.findByType(ReportContent);
    const footer = content.findByType(ReportProvenance);
    expect(footer.props.report.snapshot_at).toBe(
      decodeReport(fixture).snapshot_at,
    );
    const ids = JSON.stringify(tree.toJSON());
    expect(ids.lastIndexOf('report-provenance')).toBeGreaterThan(
      ids.lastIndexOf('report-section-'),
    );
  },
);

test('one quiet meta line avoids repeated title/body and preserves null dates', () => {
  expect(metaLine(decodeReport(royal))).toBe(
    'Royal commission · Commonwealth · Dated 7 July 2023',
  );
  const meta = metaLine(decodeReport(annual));
  expect(meta).toContain('Commonwealth Company · Commonwealth');
  expect(meta).not.toContain(annual.body);
  expect(meta).toContain('No published or tabled day is recorded.');
  expect(meta).not.toContain('2026');
});

test('section order and counts follow the web parts for every record type', () => {
  const map = (fixture: unknown) =>
    sections(decodeReport(fixture)).map(({ id, count }) => [id, count]);
  expect(map(royal)).toEqual([
    ['recommendations', 56],
    ['commission', undefined],
    ['documents', 1],
    ['notes', undefined],
    ['coverage', undefined],
  ]);
  expect(map(integrity)).toEqual([
    ['findings', 2],
    ['recommendations', 1],
    ['responses', undefined],
    ['documents', 1],
    ['about', undefined],
    ['notes', undefined],
    ['coverage', undefined],
  ]);
  expect(map(empty).map((x) => x[0])).toEqual([
    'unextracted',
    'responses',
    'documents',
    'about',
    'notes',
    'coverage',
  ]);
  expect(map(annual)).toEqual([
    ['figures', undefined],
    ['tables', 1],
  ]);
  expect(map(agency)).toEqual([
    ['other-figures', 2],
    ['document', undefined],
  ]);
});

test('section headings and jump list use the same labelled counts', async () => {
  const tree = await show(integrity);
  const list = sections(decodeReport(integrity));
  for (const section of list) {
    const title = `${section.title}${section.count == null ? '' : ` ${section.count}`}`;
    expect(
      tree.root.findAllByType(Heading).some((n) => n.props.children === title),
    ).toBe(true);
    expect(
      tree.root
        .findAllByType(Link)
        .find((n) => n.props.testID === `report-jump-${section.id}`)?.props
        .title,
    ).toBe(title);
  }
  for (const heading of tree.root.findAllByType(NativeHeading))
    expect(heading.findByType(NativeText).props.accessibilityRole).toBe(
      'header',
    );
});

test('official original has labelled metadata, publisher page and in-app browser target', async () => {
  const tree = await show(agency);
  const original = source(decodeReport(agency));
  expect(original.meta).toContain('38 pages');
  expect(original.meta).toContain('parliament.nsw.gov.au');
  const link = tree.root
    .findAllByType(Link)
    .find((n) => n.props.testID === 'report-official-source')!;
  await press(tree, 'report-official-source');
  expect(openSource).toHaveBeenCalledWith(original.url, original.label);
  expect(link.props.url).toContain(`#page=${agency.citation.page}`);
  for (const row of tree.root.findAllByType(Link))
    expect(row.props.title).not.toMatch(/^https?:/);
  expect(
    original.more.some((row) => row.label === 'Tabled document record'),
  ).toBe(true);
  expect(source(decodeReport(royal)).meta).toBe(
    'PDF · 1,052 pages · 20.2 MB · royalcommission.gov.au',
  );
});

test('empty extraction gets one unknown-coverage section and a report link', async () => {
  const tree = await show(empty);
  expect(texts(tree)).toContain(
    'No findings or recommendations are reproduced in this record. This does not establish that the report contains none.',
  );
  expect(tree.root.findAllByProps({ testID: 'report-findings' })).toHaveLength(
    0,
  );
  expect(
    tree.root.findAllByProps({ testID: 'report-recommendations' }),
  ).toHaveLength(0);
  expect(
    tree.root
      .findAllByType(Link)
      .some((n) => n.props.title === 'Read the report (PDF, 30 pages)'),
  ).toBe(true);
});

test('inline runs retain every character and set each bullet on its own line', async () => {
  const text = 'The body says: • First item ◦ Nested item • Last item.';
  expect(splitRuns(text)).toEqual([
    'The body says:',
    ' • First item',
    ' ◦ Nested item',
    ' • Last item.',
  ]);
  const tree = await show({
    ...integrity,
    record: {
      ...integrity.record,
      findings: [{ ...integrity.record.findings[0], text }],
    },
  });
  const runs = tree.root
    .findAllByProps({ testID: 'report-findings-0-text' })[0]!
    .findAllByType(Text);
  expect(runs.map((n) => n.props.children).join('')).toBe(text);
  expect(runs[2]!.props.style.paddingLeft).toBe(rhythm.group);
});

test('allegations caveat leads findings and finding kinds have equal neutral treatment', async () => {
  const tree = await show(integrity);
  const list = tree.root.findAllByProps({ testID: 'report-findings' })[0]!;
  expect(list.findAllByType(Text)[0]!.props.children).toBe(
    integrity.caveats.find((x) => x.startsWith('Allegations are not findings')),
  );
  const kinds = list
    .findAllByType(Text)
    .filter((n) => ['Finding', 'No finding'].includes(n.props.children));
  expect(kinds).toHaveLength(2);
  expect(kinds.map((n) => n.props.variant)).toEqual(['secondary', 'secondary']);
  expect(kinds.map((n) => n.props.tone)).toEqual([undefined, undefined]);
});

test('the recommendation index folds only above 60, without hiding item evidence', async () => {
  const report = decodeReport(royal);
  expect(recommendationIndex(report).folded).toBe(false);
  const make = (n: number) => ({
    ...royal,
    record: {
      ...royal.record,
      recommendations: Array.from({ length: n }, (_, i) => ({
        ...royal.record.recommendations[0],
        number: String(i + 1),
      })),
    },
  });
  expect(recommendationIndex(decodeReport(make(60))).folded).toBe(false);
  const tree = await show(make(61));
  expect(
    tree.root
      .findAllByType(Disclosure)
      .find((n) => n.props.id === 'report-recommendation-picker')!.props.title,
  ).toBe('Go to a recommendation (1 to 61)');
  expect(tree.root.findAllByProps({ testID: 'report-number-0' })).toHaveLength(
    0,
  );
  expect(
    tree.root.findAllByProps({ testID: 'report-recommendations-60-text' })
      .length,
  ).toBeGreaterThan(0);
  await press(tree, 'report-recommendation-picker-toggle');
  expect(
    tree.root
      .findAllByType(Link)
      .filter((n) => n.props.testID?.startsWith('report-number-')),
  ).toHaveLength(61);
});

test('government status counts preserve first-seen order and each item has one status line and source', async () => {
  const statuses = [
    'Accepted in principle',
    'Implemented',
    'Accepted in principle',
  ];
  const fixture = {
    ...royal,
    record: {
      ...royal.record,
      recommendations: statuses.map((status, i) => ({
        ...royal.record.recommendations[0],
        number: String(i + 1),
        status: {
          as_published: status,
          lead: 'Responsible department',
          updated: '2026-11-10',
          cite: royal.citation,
        },
      })),
    },
  };
  expect(statusCounts(decodeReport(fixture))).toEqual([
    { label: 'Accepted in principle', count: 2 },
    { label: 'Implemented', count: 1 },
  ]);
  const tree = await show(fixture);
  for (let i = 0; i < 3; i++)
    expect(texts(tree)).toContain(
      `Government-published status: ${statuses[i]} · Lead: Responsible department · Updated 10 November 2026`,
    );
});

test('court notice comes before the title, unchanged and cited to the court page', async () => {
  const quote = 'Court context quoted by the publisher.';
  const cite = {
    url: 'https://www.courts.act.gov.au/decision',
    document: 'Court decision',
  };
  const tree = await show({
    ...royal,
    record: {
      ...royal.record,
      court_context: [{ text: quote, applies_to: 'Recommendation 10.1', cite }],
    },
  });
  const notice = tree.root.findAllByProps({
    testID: 'report-court-notice',
  })[0]!;
  expect(
    notice.findAllByType(Text).some((n) => n.props.children === quote),
  ).toBe(true);
  expect(notice.findByType(Link).props.url).toBe(cite.url);
  const json = JSON.stringify(tree.toJSON());
  expect(json.indexOf('report-court-notice')).toBeLessThan(
    json.indexOf('report-title'),
  );
});

test('figures speak the count before the label and never invent missing values', async () => {
  const tree = await show(royal);
  expect(
    tree.root.findAllByProps({ testID: 'report-figure-0' })[0]!.props
      .accessibilityLabel,
  ).toBe('56 recommendations');
  expect(figures(decodeReport(empty)).map((x) => x.label)).toEqual([
    'Report length',
  ]);
  expect(
    figures(decodeReport(annual)).some(
      (x) => x.spoken === '0 people, ongoing staff',
    ),
  ).toBe(true);
});

test('large dollar amounts keep the published unit, quote and page in readable phone rows', async () => {
  const fact = {
    ...agency.facts[0]!,
    metric: 'total_expenses',
    label: 'Total expenses',
    value: 22115.9,
    value_as_published: '22,115.9',
    unit: 'millions_of_dollars',
    page: 120,
  };
  const tree = await show({ ...agency, facts: [fact] });
  expect(factReadable(fact)).toBe('$22.12 billion');
  expect(factPrinted(fact)).toBe('$22,115.9 million');
  expect(texts(tree)).toContain(
    'Printed as $22,115.9 million · Report, page 120',
  );
  expect(texts(tree)).toContain(fact.quote);
  expect(tree.root.findAllByType(ScrollView)).toHaveLength(1);
});

test('largest Android font scale keeps unbounded text and 48dp targets, using the dark palette', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  jest
    .spyOn(Native, 'useWindowDimensions')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.5 });
  jest.spyOn(Native, 'useColorScheme').mockReturnValue('dark');
  try {
    const tree = await show(annual);
    for (const text of tree.root.findAllByType(NativeText)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    }
    expect(StyleSheet.flatten(styles.target).minHeight).toBeGreaterThanOrEqual(
      48,
    );
    const firstText = tree.root.findAllByType(Text)[0]!;
    expect(
      StyleSheet.flatten(firstText.findByType(NativeText).props.style).color,
    ).toBe(dark.inkSoft);
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: previous,
    });
  }
});

test('Android back closes the latest disclosure before allowing navigation, and removes handlers', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  const listeners = new Set<() => boolean>();
  const add = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      listeners.add(handler as () => boolean);
      return { remove: () => listeners.delete(handler as () => boolean) };
    });
  try {
    const fixture = {
      ...royal,
      record: {
        ...royal.record,
        recommendations: Array.from({ length: 61 }, (_, i) => ({
          ...royal.record.recommendations[0],
          number: String(i + 1),
        })),
      },
    };
    const tree = await show(fixture);
    expect(listeners.size).toBe(0);
    await press(tree, 'report-caveats-toggle');
    await press(tree, 'report-recommendation-picker-toggle');
    expect(listeners.size).toBe(1);
    await act(async () => expect([...listeners][0]!()).toBe(true));
    expect(
      tree.root.findAllByProps({ testID: 'report-number-0' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'report-caveats-toggle' })[0]!.props
        .accessibilityState.expanded,
    ).toBe(true);
    await act(async () => expect([...listeners][0]!()).toBe(true));
    expect(listeners.size).toBe(0);
    await act(async () => tree.unmount());
    expect(listeners.size).toBe(0);
    expect(add).toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: previous,
    });
  }
});

test('iOS disclosures do not register Android back handlers', async () => {
  const back = jest.spyOn(BackHandler, 'addEventListener');
  const tree = await show(royal);
  await press(tree, 'report-caveats-toggle');
  expect(back).not.toHaveBeenCalled();
});

test('jump uses the latest section measurement and header offset', async () => {
  const scrollTo = jest.fn();
  jest.spyOn(ScrollView.prototype, 'getNativeScrollRef').mockReturnValue({
    measureInWindow: (cb: Function) => cb(0, 0, 390, 844),
  } as never);
  jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
  const tree = await show(integrity);
  let node = tree.root.find(
    (n) =>
      typeof n.type === 'string' &&
      n.props.testID === 'report-section-recommendations',
  );
  while (typeof node.instance?.measureInWindow !== 'function')
    node = node.parent!;
  node.instance.measureInWindow = (cb: Function) => cb(0, 500, 390, 200);
  await act(async () => tree.root.findByType(Screen).props.onScroll(200));
  await press(tree, 'report-jump-recommendations');
  expect(scrollTo).toHaveBeenCalledWith({
    y: 200 + 500 - 44 - rhythm.block,
    animated: true,
  });
});

test('invalid responses keep the existing retry for the same record', async () => {
  const tree = await show({ ...royal, schema: 2 });
  expect(
    tree.root.findAllByProps({ testID: 'report-error' }).length,
  ).toBeGreaterThan(0);
  expect(tree.root.findAllByType(ReportContent)).toHaveLength(0);
  jest.mocked(officialReports.read).mockResolvedValue({
    data: decodeReport(royal),
    stale: false,
    savedAt: 1,
    asOf: null,
  });
  const { RecordLoadError } = jest.requireActual(
    '../src/features/records/RecordLoadError',
  );
  await act(async () => tree.root.findByType(RecordLoadError).props.onRetry());
  expect(tree.root.findByType(ReportContent).props.report.slug).toBe(
    royal.slug,
  );
});

test('annual headline groups follow the web order rather than JSON key order', async () => {
  const tree = await show(annual);
  const head = tree.root.findAll(
    (n) => n.props.testID === 'report-headline',
  )[0]!;
  expect(head.findAllByType(Heading).map((n) => n.props.children)).toEqual([
    'Income statement extract',
    'Ongoing staff',
    'Non-ongoing staff',
  ]);
});
