import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import { catalogs as runtime } from '../src/api/runtime';
// Reports' launch/static-read boundary is exercised in reports-boundary.test.
jest.mock('../src/features/reports/TodayReports', () => ({
  Spotlight: () => null,
  ReportsEntry: () => null,
  FromRecord: () => null,
  TodayCoverage: () => null,
}));
import {
  Catalogs,
  decodeDiscovery,
  decodeRecentInterests,
  recentBillsFor,
  recentDeclarationsFor,
  type DiscoverySignal,
} from '../src/api/catalogs';
import { createHash } from 'node:crypto';
import { ApiClient, dataAsOf, type RecordResult } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { isPartialCatalog } from '../src/api/validation';
import { ApiError } from '../src/api/errors';
import { LeadCard } from '../src/design/primitives';
import { chamberName } from '../src/design/parliament';
import { webPageUrl } from '../src/navigation/external';
import {
  declarationsRoute,
  leadRoute,
  leadsRoute,
  personRoute,
} from '../src/navigation/routes';
import Today from '../src/features/Today';
import Leads from '../src/features/leads/Leads';
import LeadDetail from '../src/features/leads/LeadDetail';
import Declarations from '../src/features/declarations/Declarations';
import {
  feedCountLine,
  feedFacets,
  filterFeed,
  noFilters,
} from '../src/features/declarations/model';
import {
  aboutLede,
  discoveryAsOf,
  leadEvidenceFor,
  leadFor,
  leadsFor,
} from '../src/features/leads/model';
import {
  bills,
  catalogs as pinnedCatalogs,
  pinned,
  pinnedBytes,
  slugs,
} from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    discovery: jest.fn(),
    declarations: jest.fn(),
    today: jest.fn(),
    todayEdition: jest.fn(),
  },
}));
jest.mock('../src/api/image-policy', () => ({
  remoteImageURI: (path: string) => `http://127.0.0.1:8918${path}`,
}));
const mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));

const discovery = decodeDiscovery(pinned('/discovery.json'));
const signals = discovery.signals;
const evidence = signals.flatMap((s) => s.evidence);

// A catalog client over the pinned files; `fail` refuses the named paths.
function fixture(fail: string[] = []) {
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (input: unknown) => T,
    ): Promise<RecordResult<T>> {
      if (fail.includes(path))
        throw new ApiError('invalid-data', 'This catalog could not be read.');
      const raw = path === '/api/person-slugs' ? slugs : pinned(path);
      return {
        data: decode(raw),
        asOf: dataAsOf(raw),
        stale: false,
        savedAt: 200,
      };
    },
  };
  return new Catalogs(client);
}
const mock = jest.mocked(runtime);
beforeEach(() => {
  Object.values(mock).forEach((fn) => fn.mockReset());
  jest.mocked(router.push).mockReset();
  const catalogs = fixture();
  mock.discovery.mockImplementation((refresh) => catalogs.discovery(refresh));
  mock.declarations.mockImplementation((refresh) =>
    catalogs.declarations(refresh),
  );
});

async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
const texts = (root: ReactTestInstance) =>
  root
    .findAllByType(NativeText)
    .map((node) => [node.props.children].flat(3).join(''))
    .filter(Boolean);
const labels = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.accessibilityLabel === 'string',
    )
    .map((node) => node.props.accessibilityLabel as string);
const byTestID = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
// Pressable is a memo component: find it by its props, not its type.
const press = (root: ReactTestInstance, testID: string) =>
  act(async () =>
    root
      .find(
        (node) =>
          node.props.testID === testID &&
          typeof node.props.onPress === 'function',
      )
      .props.onPress(),
  );

describe('the discovery export', () => {
  test('decodes whole: 60 signals in three categories, every one with caveats', () => {
    expect(signals).toHaveLength(60);
    const counts: Record<string, number> = {};
    for (const s of signals) counts[s.category] = (counts[s.category] ?? 0) + 1;
    expect(counts).toEqual({
      donor_contract_overlap: 29,
      procurement_concentration: 28,
      recipient_concentration: 3,
    });
    expect(signals.every((s) => s.caveats.length >= 2)).toBe(true);
    expect(discoveryAsOf(discovery)).toBe('2026-09-21');
    expect(aboutLede(discovery)).toBe(
      'A concentration is a reason to look closer, not proof of wrongdoing. This page covers 19,301 contracts and 92,642 party receipts.',
    );
  });
  test('leaves out and counts a signal that does not read; refuses a malformed envelope', () => {
    const raw = pinned('/discovery.json') as { signals: unknown[] };
    // No lead ever shows without its caveats, and one odd signal (a metric
    // format the app does not know) never hides the others.
    const odd = decodeDiscovery({
      ...raw,
      signals: [
        { ...(raw.signals[0] as object), caveats: [] },
        {
          ...(raw.signals[1] as object),
          metrics: [{ label: 'Ratio', value: 2, format: 'ratio' }],
        },
        raw.signals[2],
      ],
    });
    expect(odd.unreadable).toBe(2);
    expect(odd.signals).toEqual([signals[2]]);
    expect(isPartialCatalog(odd)).toBe(true);
    expect(() =>
      decodeDiscovery({
        ...raw,
        signals: raw.signals.map((s) => ({ ...(s as object), caveats: [] })),
      }),
    ).toThrow(ApiError);
    expect(discovery.unreadable).toBe(0);
    expect(() => decodeDiscovery({ ...raw, signals: {} })).toThrow(ApiError);
    expect(() =>
      decodeDiscovery({ ...raw, generated_at: '2026-02-30T00:00:00+00:00' }),
    ).toThrow(ApiError);
    expect(() => decodeDiscovery({ ...raw, methodology: [] })).toThrow(
      ApiError,
    );
  });
});

describe('evidence labels', () => {
  test('all 89 pinned records read into amount, names, detail and register, with no local row ID', () => {
    expect(evidence).toHaveLength(89);
    for (const item of evidence) {
      const view = leadEvidenceFor(item);
      const shownText = JSON.stringify(view);
      expect(view.amount).not.toBeNull();
      expect(item.label).toContain(`${view.from} → ${view.to}: ${view.amount}`);
      expect(shownText).not.toMatch(/local record/);
      if (item.table === 'donations') {
        expect(item.label).toMatch(/ · local record \d+$/);
        expect(view.register).toBe('AEC Transparency Register');
        expect(view.record).toBeNull();
        // The local row number never reaches the reader.
        expect(shownText).not.toContain(item.record_id);
        expect(view.detail).toMatch(/^AEC annual receipt · FY \d{4}–\d{2}$/);
      } else {
        expect(view.register).toBe('AusTender register');
        expect(view.record).toBe(`record ${item.record_id}`);
        expect(view.detail).toMatch(
          /^Contract value · starts \d{1,2} [A-Z][a-z]{2} \d{4}$/,
        );
      }
      expect(view.kind).toBe('register');
      expect(view.url).toBe(item.url);
    }
  });
  test('all 89 records rewritten as the web export now writes them read the same', () => {
    // web/discovery-local-id (66d7bf45) drops " · local record N" from
    // donation labels; contract labels keep " · record CN…".
    const rewritten = evidence.map((item) => ({
      ...item,
      label: item.label.replace(/ · local record \d+$/, ''),
    }));
    expect(rewritten.filter((item) => item.table === 'donations')).toHaveLength(
      32,
    );
    for (const [index, item] of rewritten.entries()) {
      if (item.table === 'donations') {
        expect(item.label).toMatch(/ · AEC annual receipt$/);
      } else expect(item.label).toBe(evidence[index]!.label);
      expect(leadEvidenceFor(item)).toEqual(leadEvidenceFor(evidence[index]!));
    }
  });
  test('a receipt reads the same with or without its local row number; a contract without its ID shows none', () => {
    const westpac = evidence.find((e) => e.record_id === '643745')!;
    const read = {
      amount: '$1,803',
      amountSpoken: '1,803 dollars',
      from: 'Westpac Banking Corporation',
      to: 'Australian Labor Party (ALP)',
      detail: 'AEC annual receipt · FY 2024–25',
      register: 'AEC Transparency Register',
      record: null,
      url: 'https://transparency.aec.gov.au/',
      kind: 'register',
    };
    expect(westpac.label).toMatch(/ · local record 643745$/);
    expect(leadEvidenceFor(westpac)).toEqual(read);
    expect(
      leadEvidenceFor({
        ...westpac,
        label:
          'Westpac Banking Corporation → Australian Labor Party (ALP): $1,803.00 · FY 2024-25 · AEC annual receipt',
      }),
    ).toEqual(read);
    const contract = evidence.find((e) => e.record_id === 'CN3407266')!;
    expect(
      leadEvidenceFor({
        ...contract,
        label: contract.label.replace(' · record CN3407266', ''),
      }),
    ).toMatchObject({
      amount: '$4,537,500',
      detail: 'Contract value · starts 6 Feb 2017',
      register: 'AusTender register',
      record: null,
    });
  });
  test('the UX example reads as the design shows it', () => {
    const contract = evidence.find((e) => e.record_id === 'CN3407266')!;
    expect(leadEvidenceFor(contract)).toEqual({
      amount: '$4,537,500',
      amountSpoken: '4,537,500 dollars',
      from: 'Australian Office of Financial Management',
      to: 'Westpac Banking Corporation',
      detail: 'Contract value · starts 6 Feb 2017',
      register: 'AusTender register',
      record: 'record CN3407266',
      url: 'https://www.tenders.gov.au/',
      kind: 'register',
    });
  });
  const receipt = evidence.find((e) => e.table === 'donations')!;
  test.each([
    ['an unknown shape', { label: 'Donation record 643745' }],
    [
      'an unknown qualifier',
      {
        label: receipt.label.replace(
          ' · AEC annual receipt',
          ' · state return',
        ),
      },
    ],
    ['a mismatched record ID', { record_id: '1' }],
    [
      'a malformed amount',
      { label: receipt.label.replace(/\$[\d,.]+/, '$12.3') },
    ],
  ])('%s keeps the register link and hides the label', (_name, change) => {
    const view = leadEvidenceFor({ ...receipt, ...change });
    expect(view).toMatchObject({
      amount: null,
      from: null,
      to: null,
      detail: null,
      record: null,
      register: 'AEC Transparency Register',
      url: receipt.url,
    });
  });
  test('a register the app does not know is named generically, without its label', () => {
    expect(
      leadEvidenceFor({ ...receipt, url: 'https://example.org/register' }),
    ).toMatchObject({
      register: 'Source register',
      amount: null,
      record: null,
    });
    expect(leadEvidenceFor({ ...receipt, table: 'grants' })).toMatchObject({
      register: 'Source register',
      amount: null,
    });
    // Inherited names are not registers.
    expect(
      leadEvidenceFor({ ...receipt, table: 'constructor', url: null }),
    ).toMatchObject({ register: 'Source register', amount: null });
  });
  test('a link the source guard refuses is shown unlinked; no scope means a register', () => {
    const plain = leadEvidenceFor({
      ...receipt,
      url: 'http://transparency.aec.gov.au/',
    });
    expect(plain.url).toBeNull();
    expect(plain.amount).not.toBeNull();
    const unscoped = { ...receipt };
    delete unscoped.link_scope;
    expect(leadEvidenceFor(unscoped).kind).toBe('register');
    expect(leadEvidenceFor({ ...receipt, link_scope: 'record' }).kind).toBe(
      'record',
    );
  });
  test('a local contract row number is not shown as a register ID', () => {
    const contract = evidence.find((e) => e.table === 'contracts')!;
    const local = {
      ...contract,
      label: contract.label.replace(
        ` · record ${contract.record_id}`,
        ` · local record ${contract.record_id}`,
      ),
    };
    expect(leadEvidenceFor(local).record).toBeNull();
    expect(leadEvidenceFor(local).amount).not.toBeNull();
  });
});

describe('leads', () => {
  test('"All leads" keeps the export’s order; categories sort as the web does', () => {
    expect(leadsFor(discovery).map((l) => l.id)).toEqual(
      signals.map((s) => s.id),
    );
    const contracts = leadsFor(discovery, 'procurement_concentration');
    expect(contracts).toHaveLength(28);
    const total = (l: { id: string }) =>
      signals.find((s) => s.id === l.id)!.chart!.group_total;
    for (let i = 1; i < contracts.length; i++)
      expect(total(contracts[i - 1]!)).toBeGreaterThanOrEqual(
        total(contracts[i]!),
      );
    const byShare = leadsFor(discovery, 'procurement_concentration', 'share');
    const share = (l: { id: string }) =>
      signals.find((s) => s.id === l.id)!.chart!.participants[0]!.share;
    for (let i = 1; i < byShare.length; i++)
      expect(share(byShare[i - 1]!)).toBeGreaterThanOrEqual(share(byShare[i]!));
    // Companies in both have no share: the web orders them by contract value.
    const both = leadsFor(discovery, 'donor_contract_overlap', 'share');
    const contractValue = (l: {
      metrics: { label: string; value: number }[];
    }) => l.metrics.find((m) => m.label === 'Recorded contract value')!.value;
    for (let i = 1; i < both.length; i++)
      expect(contractValue(both[i - 1]!)).toBeGreaterThanOrEqual(
        contractValue(both[i]!),
      );
    expect(leadsFor(discovery, 'recipient_concentration')).toHaveLength(3);
  });
  test('a concentration without its chart is left out, and the screen says how many', async () => {
    const chartless = { ...signals[1]!, chart: undefined };
    expect(leadFor(chartless)).toBeNull();
    const short = { ...discovery, signals: [signals[0]!, chartless] };
    expect(leadsFor(short).map((l) => l.id)).toEqual([signals[0]!.id]);
    mock.discovery.mockResolvedValueOnce({
      data: { ...short, unreadable: 1 },
      asOf: null,
      stale: false,
      savedAt: 200,
    });
    const renderer = await render(<Leads />);
    expect(texts(renderer.root)).toContain('1 lead');
    expect(texts(renderer.root)).toContain(
      '2 leads in this export could not be read and are not shown.',
    );
    act(() => renderer.unmount());
  });
  test('a signal of a category the app does not know is left out', () => {
    const unknown = { ...signals[0]!, category: 'new_family' };
    expect(leadFor(unknown)).toBeNull();
    expect(
      leadsFor({ ...discovery, signals: [unknown, signals[1]!] }),
    ).toHaveLength(1);
  });
  test('comparisons use the web’s words and the export’s numbers', () => {
    const homeAffairs = leadFor(signals[2]!)!;
    expect(homeAffairs.comparison).toMatchObject({
      type: 'concentration',
      heading: 'Department of Home Affairs',
      takeaway:
        '38.7% of recorded contract value went to SECURE JOURNEYS PTY LTD.',
      chartTitle: 'Who got the contracts?',
      note: '931 contracts · Contract start years 2009–2026. Recorded contract values, not the agency’s whole budget.',
    });
    const rows =
      homeAffairs.comparison.type === 'concentration'
        ? homeAffairs.comparison.rows
        : [];
    expect(rows).toHaveLength(6);
    expect(rows[5]).toMatchObject({
      name: 'Other 529 suppliers',
      other: true,
      supplierPath: null,
    });
    expect(rows[0]!.supplierPath).toBe(
      '/subject/supplier/SECURE%20JOURNEYS%20PTY%20LTD',
    );
    const uap = leadFor(signals[1]!)!;
    expect(uap.comparison).toMatchObject({
      takeaway: '78.4% of recorded receipts came from Mineralogy Pty Ltd.',
      chartTitle: 'Where did the funding come from?',
      note: '973 receipts · FY 2007–08 to 2024–25. Party receipts include more than gifts.',
    });
    expect(
      uap.comparison.type === 'concentration' && uap.comparison.rows[5]!.name,
    ).toBe('Other 23 contributors');
    const westpac = leadFor(signals[0]!)!;
    expect(westpac.comparison).toEqual({
      type: 'overlap',
      heading: 'Westpac Banking Corporation',
      takeaway: 'This name appears in both sets of records.',
      receipts: { value: 76984493, records: 1041 },
      contracts: { value: 9102500, records: 4 },
      note: 'Different money flows and reporting periods. A shared name doesn’t show that one led to the other.',
    });
  });
  test('every chart’s rows cover the whole: named participants plus Other make 100%', () => {
    for (const s of signals.filter((x) => x.chart)) {
      const c = leadFor(s)!.comparison;
      if (c.type !== 'concentration') throw new Error('expected a chart');
      const sum = c.rows.reduce((t, r) => t + r.share, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.1);
    }
  });
  test('links follow the web’s actions, never /search, and pass the link guard', () => {
    const kinds = (s: DiscoverySignal) =>
      leadFor(s)!.links.map((l) => l.testID);
    expect(kinds(signals[0]!)).toEqual(['supplier', 'web', 'money-map']);
    expect(kinds(signals[1]!)).toEqual(['web', 'money-map']);
    expect(kinds(signals[2]!)).toEqual(['supplier', 'web']);
    // The money map is the web's own "Open the full money map".
    expect(leadFor(signals[1]!)!.links[1]).toMatchObject({
      label: 'Open the full money map',
      path: '/money',
    });
    for (const s of signals)
      for (const link of leadFor(s)!.links) {
        expect(link.path).not.toMatch(/^\/search/);
        expect(webPageUrl(link.path)).not.toBeNull();
      }
    expect(leadFor(signals[1]!)!.links[0]!.path).toBe(
      '/discover?category=recipient_concentration&item=recipient_concentration%3Aa186427ec7f0b918',
    );
  });
  test('every card keeps every caveat verbatim, its figures and its as-at line, and no local row ID', async () => {
    for (const lead of leadsFor(discovery)) {
      const renderer = await render(
        <LeadCard
          lead={lead}
          category={lead.categoryLabel}
          asAt={{ asOf: discoveryAsOf(discovery), citation: lead.citation }}
          testID="card"
        />,
      );
      const shownText = [...texts(renderer.root), ...labels(renderer.root)];
      for (const caveat of lead.caveats) expect(shownText).toContain(caveat);
      for (const metric of lead.metrics)
        expect(shownText.some((t) => t.startsWith(`${metric.label}, `))).toBe(
          true,
        );
      expect(shownText).toContain(
        `As at 21 September 2026 · Source: ${lead.citation.join('; ')}`,
      );
      expect(shownText.join('\n')).not.toMatch(/local record/);
      act(() => renderer.unmount());
    }
  });
});

describe('the Leads screen', () => {
  test('opens on the export’s first lead: its title, figures, sentence, one caveat and one source line', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    const first = signals[0]!;
    expect(texts(root)).toContain('60 leads');
    // A lead is a reason to look closer, never a finding.
    expect(texts(root)).toContain(aboutLede(discovery));
    expect(aboutLede(discovery)).toMatch(/not proof of wrongdoing/);
    // The card's upper part is one element that opens the comparison: the
    // category, the export's title, the two flows and its one sentence.
    const open = root.find(
      (n) =>
        n.props.testID === 'lead-0-open' &&
        typeof n.props.onPress === 'function',
    );
    expect(open.props.accessibilityLabel).toBe(
      `Lead, Companies in both. ${first.title}. Recorded party receipts, 76,984,493 dollars. Recorded contract value, 9,102,500 dollars. ${first.summary}`,
    );
    expect(open.props.accessibilityHint).toBe('Opens the comparison');
    expect(texts(root)).toEqual(
      expect.arrayContaining(['$76,984,493', '$9,102,500', first.summary]),
    );
    // One caveat line, the export's first, verbatim; the rest are one tap away.
    expect(byTestID(root, 'lead-0-caveat').props.children).toBe(
      first.caveats[0],
    );
    expect(texts(root)).not.toContain(first.caveats[1]);
    // The export is dated once, at the top; each card's source line names its
    // example records and publishers.
    expect(
      texts(root).filter((t) => t.startsWith('Updated 21 Sep 2026 · ')),
    ).toHaveLength(1);
    expect(labels(root)).toContain(
      'Updated 21 Sep 2026, AEC annual returns and 1 more',
    );
    expect(labels(root)).toContain(
      '2 example records, AEC annual returns and 1 more',
    );
    // No as-at line, methodology or "See the comparison" row per card.
    expect(texts(root).join('\n')).not.toMatch(/As at |See the comparison/);
    for (const method of discovery.methodology)
      expect(texts(root)).not.toContain(method);
    // Ten cards, then Show more.
    const cards = () =>
      root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          /^lead-\d+-title$/.test(n.props.testID ?? ''),
      );
    expect(cards()).toHaveLength(10);
    await press(root, 'leads-more');
    expect(cards()).toHaveLength(20);
    await press(root, 'lead-1-open');
    expect(router.push).toHaveBeenCalledWith(leadRoute(signals[1]!.id));
    act(() => renderer.unmount());
  });
  test('the top source line holds the methodology; a card’s holds every caveat and its example records', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    const first = signals[0]!;
    await press(root, 'leads-source');
    for (const method of discovery.methodology)
      expect(texts(root)).toContain(method);
    expect(texts(root)).toContain('As at 21 September 2026');
    await press(root, 'leads-source-sheet-done');
    await press(root, 'lead-0-source');
    for (const caveat of first.caveats) expect(texts(root)).toContain(caveat);
    // Each example record opens from the sheet, named by its register, with
    // no local row number.
    expect(labels(root)).toEqual(
      expect.arrayContaining([
        'View original, AEC Transparency Register, $1,803 from Westpac Banking Corporation to Australian Labor Party (ALP) · AEC annual receipt · FY 2024–25',
        'View original, AusTender register, $4,537,500 from Australian Office of Financial Management to Westpac Banking Corporation · Contract value · starts 6 Feb 2017 · record CN3407266',
      ]),
    );
    expect(texts(root).join('\n')).not.toMatch(/643745|local record/);
    act(() => renderer.unmount());
  });
  test('a concentration card shows its largest value: the title and sentence already give the share', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    const lead = leadsFor(discovery)[2]!;
    expect(lead.category).toBe('procurement_concentration');
    const open = root.find(
      (n) =>
        n.props.testID === 'lead-2-open' &&
        typeof n.props.onPress === 'function',
    );
    expect(open.props.accessibilityLabel).toBe(
      `Lead, Government contracts. ${lead.title}. Largest supplier value, 2,343,038,544 dollars. ${lead.summary}`,
    );
    expect(byTestID(root, 'lead-2-caveat').props.children).toBe(
      'This share describes available records only; missing disclosures can materially change it.',
    );
    act(() => renderer.unmount());
  });
  test('filters by category, sorts concentrations, and counts in the web’s nouns', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    await press(root, 'leads-filter-procurement_concentration');
    expect(texts(root)).toContain('28 agencies');
    const first = leadsFor(discovery, 'procurement_concentration')[0]!;
    const openLabel = () =>
      root.find(
        (n) =>
          n.props.testID === 'lead-0-open' &&
          typeof n.props.onPress === 'function',
      ).props.accessibilityLabel as string;
    expect(openLabel()).toMatch(
      `Lead, Government contracts. ${first.title}. `,
    );
    await press(root, 'leads-sort-share');
    expect(openLabel()).toMatch(
      `Lead, Government contracts. ${leadsFor(discovery, 'procurement_concentration', 'share')[0]!.title}. `,
    );
    await press(root, 'leads-filter-recipient_concentration');
    expect(texts(root)).toContain('3 parties');
    await press(root, 'leads-filter-donor_contract_overlap');
    expect(texts(root)).toContain('29 companies');
    // No share to sort companies in both by.
    expect(root.findAll((n) => n.props.testID === 'leads-sort')).toHaveLength(
      0,
    );
    act(() => renderer.unmount());
  });
  test('a failed first load says so and retries', async () => {
    mock.discovery.mockRejectedValueOnce(new ApiError('offline', 'Offline'));
    const renderer = await render(<Leads />);
    expect(
      renderer.root.findAll((n) => n.props.testID === 'leads-offline-uncached')
        .length,
    ).toBeGreaterThan(0);
    await press(renderer.root, 'leads-retry');
    expect(texts(renderer.root)).toContain('60 leads');
    act(() => renderer.unmount());
  });
});

describe('a lead’s comparison', () => {
  test('draws the chart with one element per row, and the same rows as a table', async () => {
    mockParams.id = signals[1]!.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    expect(texts(root)).toContain(
      '78.4% of recorded receipts came from Mineralogy Pty Ltd.',
    );
    expect(byTestID(root, 'lead-chart-row-0').props.accessibilityLabel).toBe(
      'Mineralogy Pty Ltd, 124.7 million dollars, 78.4 percent',
    );
    expect(byTestID(root, 'lead-chart-row-5').props.accessibilityLabel).toBe(
      'Other 23 contributors, 1.7 million dollars, 1.1 percent',
    );
    await press(root, 'lead-chart-show-table');
    expect(byTestID(root, 'lead-chart-cell-0').props.accessibilityLabel).toBe(
      'Mineralogy Pty Ltd, value 124,655,455 dollars, share 78.4 percent, 230 records',
    );
    expect(byTestID(root, 'lead-chart-cell-5').props.accessibilityLabel).toBe(
      'Other 23 contributors, value 1,721,102 dollars, share 1.1 percent',
    );
    for (const caveat of signals[1]!.caveats)
      expect(texts(root)).toContain(caveat);
    // "About these numbers" is the page's one source line: the web's lede
    // and the methodology in full are in its sheet.
    expect(labels(root)).toContain(
      'Updated 21 Sep 2026, AEC annual returns',
    );
    expect(texts(root)).not.toContain(aboutLede(discovery));
    await press(root, 'lead-source');
    expect(texts(root)).toContain(aboutLede(discovery));
    for (const method of discovery.methodology)
      expect(texts(root)).toContain(method);
    // The heading says the lead's category once, as its meta line.
    expect(texts(root)).toContain('Lead · Party funding');
    expect(
      root.findAll((n) => n.props.testID === 'lead-link-money-map').length,
    ).toBeGreaterThan(0);
    expect(
      root.findAll((n) => n.props.testID === 'lead-link-supplier'),
    ).toHaveLength(0);
    act(() => renderer.unmount());
  });
  test('supplier rows link their profile on the web; companies in both show two separate flows', async () => {
    mockParams.id = signals[2]!.id;
    let renderer = await render(<LeadDetail />);
    const row = renderer.root.find(
      (n) =>
        n.props.testID === 'lead-chart-row-0' &&
        typeof n.props.onPress === 'function',
    );
    expect(row.props.accessibilityRole).toBe('link');
    expect(row.props.accessibilityHint).toBe(
      'Opens the supplier profile on opax.com.au',
    );
    act(() => renderer.unmount());
    mockParams.id = signals[0]!.id;
    renderer = await render(<LeadDetail />);
    expect(labels(renderer.root)).toEqual(
      expect.arrayContaining([
        '77 million dollars, Party receipts · 1,041 records',
        '9.1 million dollars, Government contracts · 4 records',
      ]),
    );
    expect(texts(renderer.root)).toContain(
      'Different money flows and reporting periods. A shared name doesn’t show that one led to the other.',
    );
    act(() => renderer.unmount());
  });
  test('an ID not in the export says so', async () => {
    mockParams.id = 'procurement_concentration:missing';
    const renderer = await render(<LeadDetail />);
    expect(texts(renderer.root)).toContain(
      'This lead is not in the current export.',
    );
    act(() => renderer.unmount());
  });
});

describe('the declared-interests feed', () => {
  test('loads every pinned row, newest first, with profile links the ID bridge resolves', async () => {
    const feed = await fixture().declarations();
    expect(feed.data).toHaveLength(300);
    expect(feed.meta).toMatchObject({ rows: 300, available: 1660 });
    expect(feed.asAt).toBe('2026-09-04');
    const dates = feed.data!.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    const briskey = feed.data!.find((r) => r.name === 'Jo Briskey')!;
    expect(briskey.profileSlug).toBe('jo-briskey');
    // Nearly every sitting member resolves, by the register's own ID: the
    // register's "Alison Brynes" is the directory's Alison Byrnes.
    const linked = feed.data!.filter((r) => r.profileSlug);
    expect(linked.length).toBeGreaterThan(280);
    const renamed = new Map([['Alison Brynes', 'Alison Byrnes']]);
    for (const row of linked)
      expect(slugs.slugs[row.profileSlug!]!.split(' ').at(-1)).toBe(
        (renamed.get(row.name) ?? row.name).split(' ').at(-1),
      );
  });
  test('without the directory the rows stay readable, with no profile links', async () => {
    const feed = await fixture([
      '/api/person-slugs',
      '/parliamentarians.json',
    ]).declarations();
    expect(feed.data).toHaveLength(300);
    expect(feed.data!.every((r) => r.profileSlug === null)).toBe(true);
    expect(feed.data!.every((r) => r.party === undefined)).toBe(true);
  });
  test('filters by chamber, jurisdiction and member; chambers are named, never IDs', async () => {
    const rows = (await fixture().declarations()).data!;
    const facets = feedFacets(rows);
    // A fixed order, although the newest row is a Senate row.
    expect(rows[0]!.chamber).toBe('senate');
    expect(facets.chambers).toEqual([
      { id: 'house', label: 'House of Representatives', count: 176 },
      { id: 'senate', label: 'Senate', count: 124 },
    ]);
    expect(
      feedFacets([
        { ...rows[0]!, chamber: 'qld_la', jurisdiction: 'qld' },
        ...rows,
      ]).jurisdictions.map((f) => f.label),
    ).toEqual(['Federal', 'Queensland']);
    expect(facets.jurisdictions).toEqual([
      { id: 'federal', label: 'Federal', count: 300 },
    ]);
    expect(filterFeed(rows, { ...noFilters, chamber: 'house' })).toHaveLength(
      176,
    );
    expect(
      filterFeed(rows, { ...noFilters, jurisdiction: 'qld' }),
    ).toHaveLength(0);
    expect(
      filterFeed(rows, { ...noFilters, member: 'briskey' }).map((r) => r.name),
    ).toEqual(['Jo Briskey', 'Jo Briskey', 'Jo Briskey']);
    expect(
      filterFeed(rows, { ...noFilters, chamber: 'senate', member: 'briskey' }),
    ).toHaveLength(0);
    expect(feedCountLine(176, 300)).toBe('176 of 300 declarations');
    expect(feedCountLine(1, 1)).toBe('1 declaration');
    expect(chamberName('house', 'federal')).toBe('House of Representatives');
    expect(chamberName('house', 'qld')).toBeNull();
  });
  test('the screen filters by chamber and a row opens the member’s native profile', async () => {
    const renderer = await render(<Declarations />);
    const root = renderer.root;
    // One summary line; the chamber and jurisdiction chips are in a sheet,
    // and a single jurisdiction is named, not offered.
    expect(texts(root)).toContain('300 declarations · All chambers · Federal');
    expect(
      root.findAll((n) => n.props.testID === 'declarations-chamber-house'),
    ).toHaveLength(0);
    await press(root, 'declarations-filters');
    expect(
      root.findAll((n) => n.props.testID === 'declarations-jurisdiction'),
    ).toHaveLength(0);
    // No label sits over chips that name themselves.
    expect(texts(root)).not.toContain('Chamber');
    await press(root, 'declarations-chamber-house');
    await press(root, 'declarations-filters-sheet-done');
    expect(texts(root)).toContain(
      '176 of 300 declarations · House of Representatives · Federal',
    );
    const field = root.find(
      (n) =>
        n.props.testID === 'declarations-member' &&
        typeof n.props.onChangeText === 'function',
    );
    await act(async () => field.props.onChangeText('Briskey'));
    await act(async () => field.props.onSubmitEditing());
    expect(texts(root)).toContain(
      '3 of 300 declarations · House of Representatives · Federal',
    );
    // Today's anatomy: the category joins the date line; no chip per row.
    expect(byTestID(root, 'declaration-change-0').props.children).toMatch(
      /^[A-Z][^·]+ · (added|deleted|changed) \d{1,2} [A-Z][a-z]{2}( \d{4})? · House of Representatives$/,
    );
    await press(root, 'declaration-person-0');
    expect(router.push).toHaveBeenCalledWith(personRoute('jo-briskey'));
    // The feed adds the export's name matches and their caveat.
    await act(async () => field.props.onChangeText('Susan McDonald'));
    await act(async () => field.props.onSubmitEditing());
    await press(root, 'declarations-filters');
    await press(root, 'declarations-filters-clear');
    await press(root, 'declarations-filters-sheet-done');
    expect(
      texts(root).some((t) =>
        t.startsWith(
          'Name match: Adani Mining Pty Ltd, AEC donor · mining. Exact names only;',
        ),
      ),
    ).toBe(true);
    // The export's coverage note is in its one source line's sheet, in full.
    await press(root, 'declarations-source');
    expect(texts(root)).toContain(
      'This export holds the newest 300 of 1,660 dated register alterations. Entries are as declared, not verified by OPAX. Additions and deletions carry the date the register records. A gift or trip with no organisation match names one the AEC and lobbyist registers do not list under that spelling. Organisation matches to AEC Transparency Register returns, the lobbyist registers and FITS use exact normalised names.',
    );
    act(() => renderer.unmount());
  });
  test('nothing matching offers to clear the filters', async () => {
    const renderer = await render(<Declarations />);
    const root = renderer.root;
    const field = root.find(
      (n) =>
        n.props.testID === 'declarations-member' &&
        typeof n.props.onChangeText === 'function',
    );
    await act(async () => field.props.onChangeText('Nobody'));
    await act(async () => field.props.onSubmitEditing());
    expect(texts(root)).toContain('No alterations match these filters.');
    await press(root, 'declarations-clear');
    expect(texts(root)).toContain('300 declarations · All chambers · Federal');
    act(() => renderer.unmount());
  });
});

test('Today opens Leads and the full declarations feed without loading either', async () => {
  mock.today.mockResolvedValue({
    bills: recentBillsFor(bills, 6),
    declarations: recentDeclarationsFor(
      decodeRecentInterests(pinned('/interests/recent.json')),
      6,
      pinnedCatalogs,
    ),
  });
  mock.todayEdition.mockResolvedValue({
    status: 'missing',
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  });
  const renderer = await render(<Today />);
  await press(renderer.root, 'today-leads-open');
  expect(router.push).toHaveBeenLastCalledWith(leadsRoute);
  await press(renderer.root, 'today-declarations-all');
  expect(router.push).toHaveBeenLastCalledWith(declarationsRoute);
  expect(mock.discovery).not.toHaveBeenCalled();
  expect(mock.declarations).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

describe('pull to refresh', () => {
  // The screen's own native refresh control (the first one in the tree).
  const pull = (root: ReactTestInstance) =>
    act(async () =>
      root
        .findAll((node) => !!node.props.refreshControl)[0]!
        .props.refreshControl.props.onRefresh(),
    );
  test.each([
    ['Leads', () => <Leads />, 'discovery'],
    ['a lead’s comparison', () => <LeadDetail />, 'discovery'],
    ['the declarations feed', () => <Declarations />, 'declarations'],
  ] as const)(
    '%s forces its loader on a refresh, and not on the first load',
    async (_name, screen, loader) => {
      mockParams.id = signals[1]!.id;
      const renderer = await render(screen());
      expect(mock[loader]).toHaveBeenCalledTimes(1);
      expect(mock[loader]).toHaveBeenLastCalledWith(false);
      await pull(renderer.root);
      expect(mock[loader]).toHaveBeenCalledTimes(2);
      expect(mock[loader]).toHaveBeenLastCalledWith(true);
      act(() => renderer.unmount());
    },
  );

  // The real client and cache over the pinned files, served for an hour
  // (the published JSON cache policy), counting reads that reach the network.
  class MemoryStore implements CacheStore {
    entries: CacheEntry[] = [];
    index: CacheIndexEntry[] = [];
    async readIndex() {
      return this.index;
    }
    async writeIndex(entries: CacheIndexEntry[]) {
      this.index = entries;
    }
    async read(url: string) {
      return this.entries.find((entry) => entry.url === url);
    }
    async write(entry: CacheEntry) {
      this.entries = [
        entry,
        ...this.entries.filter((item) => item.url !== entry.url),
      ];
    }
    async remove(url: string) {
      this.entries = this.entries.filter((entry) => entry.url !== url);
    }
  }
  function cachedCatalogs() {
    const reads: string[] = [];
    const transport = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      reads.push(path);
      const bytes =
        path === '/api/person-slugs'
          ? Buffer.from(JSON.stringify(slugs))
          : pinnedBytes(path);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          ETag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
        },
      });
    }) as typeof fetch;
    const client = new ApiClient({
      origin: 'https://example.test',
      version: '1.0.0',
      build: '1',
      cache: new CatalogCache(new MemoryStore()),
      transport,
      now: () => 1000,
      retries: 0,
    });
    return { catalogs: new Catalogs(client), reads };
  }
  test.each([
    ['Leads', () => <Leads />, 'discovery', '/discovery.json'],
    [
      'a lead’s comparison',
      () => <LeadDetail />,
      'discovery',
      '/discovery.json',
    ],
    [
      'the declarations feed',
      () => <Declarations />,
      'declarations',
      '/interests/recent.json',
    ],
  ] as const)(
    '%s re-reads a still-fresh cached export from the network on a refresh',
    async (_name, screen, loader, path) => {
      mockParams.id = signals[1]!.id;
      const { catalogs, reads } = cachedCatalogs();
      mock.discovery.mockImplementation((refresh) =>
        catalogs.discovery(refresh),
      );
      mock.declarations.mockImplementation((refresh) =>
        catalogs.declarations(refresh),
      );
      const renderer = await render(screen());
      expect(mock[loader]).toHaveBeenCalledTimes(1);
      expect(reads.filter((p) => p === path)).toHaveLength(1);
      await pull(renderer.root);
      expect(reads.filter((p) => p === path)).toHaveLength(2);
      act(() => renderer.unmount());
    },
  );
});
