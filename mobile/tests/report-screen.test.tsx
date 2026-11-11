import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text, LinkRow } from '../src/design/primitives';
import { decodeReport } from '../src/api/report-decoders';
import ReportScreen, {
  ReportContent,
} from '../src/features/reports/ReportScreen';
import { officialReports } from '../src/features/reports/official';
import { openSource } from '../src/navigation/external';
import royal from './fixtures/reports/royal.json';
import integrity from './fixtures/reports/integrity.json';
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
  router: { push: jest.fn() },
}));
const texts = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => n.props.children);
async function show(fixture: unknown) {
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
    );
  });
  return tree;
}
test.each([royal, integrity, annual, agency])(
  'renders the native $report_type record with its provenance and caveats',
  async (fixture) => {
    const tree = await show(fixture);
    expect(tree.root.findByType(ReportContent).props.report.title).toBe(
      fixture.title,
    );
    expect(
      tree.root.findAllByProps({ testID: 'report-provenance' }).length,
    ).toBeGreaterThan(0);
    const strings = texts(tree);
    for (const note of fixture.caveats) expect(strings).toContain(note);
    for (const part of ['findings', 'recommendations'] as const) {
      const items = decodeReport(fixture).record[part] ?? [];
      for (const item of items) {
        expect(strings).toContain(item.text);
        if (item.label) expect(strings).toContain(item.label);
      }
    }
    for (const fact of fixture.facts) {
      expect(strings).toContain(fact.quote);
      expect(strings).toContain(fact.value_as_published);
    }
  },
);
test('annual report dates never borrow the snapshot and table units and headline values are readable', async () => {
  const tree = await show(annual);
  expect(texts(tree)).toContain('No published or tabled day is recorded.');
  expect(
    tree.root.findAllByProps({ testID: 'report-headline' }).length,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(tree.toJSON())).toContain(annual.tables[0]!.unit);
  expect(JSON.stringify(tree.toJSON())).toContain('Headcount');
});
test('a report original opens through the in-app browser with its own page', async () => {
  const tree = await show(agency);
  const link = tree.root
    .findAllByType(LinkRow)
    .find((n) => n.props.testID === 'report-official-source')!;
  const button = tree.root.findAll(
    (n) =>
      n.props.testID === 'report-official-source' &&
      typeof n.props.onPress === 'function',
  )[0]!;
  await act(async () => button.props.onPress());
  expect(openSource).toHaveBeenCalledWith(
    link.props.external.url,
    link.props.external.label,
  );
  expect(link.props.external.url).toContain(`#page=${agency.citation.page}`);
});
test('empty extracted lists say that coverage is unknown', async () => {
  const tree = await show({
    ...integrity,
    record: {
      ...integrity.record,
      findings: [],
      recommendations: [],
      findings_status: 'not_extracted',
      recommendations_status: 'not_extracted',
    },
  });
  expect(texts(tree)).toContain(
    'No findings are reproduced in this record. This does not establish that the report contains none.',
  );
  expect(texts(tree)).toContain(
    'No recommendations are reproduced in this record. This does not establish that the report contains none.',
  );
});
test('keeps court context and the government-published status beside the verbatim recommendation', async () => {
  const cite = royal.record.recommendations[0]!.cite;
  const tree = await show({
    ...royal,
    record: {
      ...royal.record,
      court_context: [
        {
          text: 'Court context quoted by the publisher.',
          applies_to: 'Recommendation 10.1',
          cite,
        },
      ],
      recommendations: [
        {
          ...royal.record.recommendations[0],
          status: {
            as_published: 'Accepted in principle',
            lead: 'Responsible department',
            updated: '2026-11-10',
            cite,
          },
        },
      ],
    },
  });
  expect(texts(tree)).toContain('Court context quoted by the publisher.');
  expect(texts(tree)).toContain('Accepted in principle');
});
test('invalid responses reach the existing error state and retry the same record', async () => {
  const bad = { ...royal, schema: 2 };
  const tree = await show(bad);
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
