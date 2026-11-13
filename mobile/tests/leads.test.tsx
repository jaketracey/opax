import { withNavigationOptions } from './navigation-options';
import { router } from 'expo-router';
import { createHash } from 'node:crypto';
import { act } from 'react';
import {
  Dimensions,
  Linking,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import {
  Catalogs,
  decodeDiscovery,
  decodeRecentInterests,
  recentBillsFor,
  recentDeclarationsFor,
  type Discovery,
} from '../src/api/catalogs';
import { ApiClient, dataAsOf, type RecordResult } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { apiClient, catalogs as runtime } from '../src/api/runtime';
import { isPartialCatalog } from '../src/api/validation';
import { copy } from '../src/design/copy';
import { Icon } from '../src/design/icon';
import { chamberName } from '../src/design/parliament';
import {
  Card,
  ContentUnavailable,
  Text as DesignText,
  RowLink,
  StatStrip,
} from '../src/design/primitives';
import { accents } from '../src/design/tokens';
import Today from '../src/features/Today';
import Declarations from '../src/features/declarations/Declarations';
import {
  feedCountLine,
  feedFacets,
  filterFeed,
  noFilters,
} from '../src/features/declarations/model';
import LeadDetail, { evidenceRow } from '../src/features/leads/LeadDetail';
import { ConcentrationChart } from '../src/features/leads/Chart';
import Leads, {
  kindCaption,
  leadsCitation,
  leadsLede,
} from '../src/features/leads/Leads';
import {
  aboutLede,
  categoryLabel,
  categorySearch,
  categorySeeAll,
  categorySource,
  discoverPath,
  discoveryAsOf,
  decodeLeadSupplierAliases,
  isCategory,
  leadCardFigure,
  leadCategories,
  leadEvidenceFor,
  leadFor,
  leadSupplierAliasPaths,
  leadSupplierRoute,
  leadSections,
  leadsAbout,
  leadsFor,
  leadsHiddenNotes,
  plainCaveat,
  searchLeads,
  supplierPath,
} from '../src/features/leads/model';
import {
  decodeAgencies,
  decodeAgency,
} from '../src/features/money-public/data';
import { publicDiscovery } from '../src/features/money-public/discovery';
import { money } from '../src/features/money-public/runtime';
import MoneyItem, {
  itemParams,
  loadMoneyItem,
} from '../src/features/money-public/MoneyItem';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  forgetMoneyGraphs,
  rememberMoneyGraph,
} from '../src/features/money/lookup';
import { sourceHeader } from '../src/features/sheets/SourceSheet';
import { filterStore } from '../src/features/sheets/filter-model';
import { openOnWeb, openSource, webPageUrl } from '../src/navigation/external';
import {
  declarationsRoute,
  leadRoute,
  leadsRoute,
  personRoute,
} from '../src/navigation/routes';
import { leadsKindRoute, moneyRoute } from '../src/navigation/routes/money-map';
import { partyRoute } from '../src/navigation/routes/people';
import {
  agencyListRoute,
  agencyRoute,
  moneyItemRoute,
  moneyRecordRoute,
} from '../src/navigation/routes/public-money';
import { sheetPayload } from '../src/navigation/sheets';
import {
  bills,
  pinned,
  pinnedBytes,
  catalogs as pinnedCatalogs,
  slugs,
} from './pinned';

jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn() },
  catalogs: {
    discovery: jest.fn(),
    declarations: jest.fn(),
    today: jest.fn(),
    todayEdition: jest.fn(),
    todayBills: jest.fn(() => new Promise(() => {})),
    todayDeclarations: jest.fn(() => new Promise(() => {})),
    todayDeclarationsProfiled: jest.fn(() => new Promise(() => {})),
    recentDivisions: jest.fn(() => new Promise(() => {})),
  },
}));
jest.mock('../src/api/image-policy', () => ({
  remoteImageURI: (path: string) => `http://127.0.0.1:8918${path}`,
}));
// The lead page looks its agency up in the agency directory.
jest.mock('../src/features/money-public/runtime', () => ({
  money: { agencies: jest.fn(), agency: jest.fn() },
}));
// No step on Leads or a lead leaves the app.
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
}));
const mockParams: Record<string, string> = {};
let mockOptions: Record<string, unknown> = {};
// The Just declared feed's tests read the last screen options here.
const mockScreen: { options?: Record<string, unknown> } = {};
// One router for `router` and useRouter(); a Link is drawn as an
// "ExpoLink" host element holding its href, as the native link would.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const router = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  const Link = Object.assign(
    ({ href, children }: { href: unknown; children?: unknown }) =>
      React.createElement('ExpoLink', { href }, children),
    {
      Trigger: ({ children }: { children?: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  );
  return {
    router,
    useRouter: () => router,
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    Link,
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockOptions = options;
        mockScreen.options = options;
        return null;
      },
    },
  };
});

const discovery = decodeDiscovery(pinned('/discovery.json'));
const signals = discovery.signals;
// What the screens read: every lead, donors named as the web names them.
const shown = publicDiscovery(discovery);
const companies = shown.signals.filter(
  (s) => s.category === 'donor_contract_overlap',
).length;
const evidence = signals.flatMap((s) => s.evidence);
const agencies = decodeAgencies(pinned('/agencies.json'));
const homeAgency = agencies.agencies.find(
  (agency) => agency.name === 'Department of Home Affairs',
)!;
const homeProfile = decodeAgency(pinned(homeAgency.path));

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
const linkingOpen = jest.spyOn(Linking, 'openURL');
beforeEach(() => {
  Object.values(mock).forEach((fn) => fn.mockReset());
  jest.mocked(router.push).mockReset();
  jest.mocked(router.navigate).mockReset();
  jest.mocked(openOnWeb).mockReset();
  jest.mocked(openSource).mockReset();
  linkingOpen.mockReset();
  for (const key of Object.keys(mockParams))
    delete mockParams[key as keyof typeof mockParams];
  mockOptions = {};
  const catalogs = fixture();
  mock.discovery.mockImplementation((refresh) => catalogs.discovery(refresh));
  mock.declarations.mockImplementation((refresh) =>
    catalogs.declarations(refresh),
  );
  jest.mocked(money.agencies).mockReset();
  jest.mocked(money.agencies).mockResolvedValue({
    data: agencies,
    asOf: null,
    stale: false,
    savedAt: 200,
  } as Awaited<ReturnType<typeof money.agencies>>);
  jest.mocked(money.agency).mockReset();
  jest.mocked(money.agency).mockImplementation(async (id) => {
    const entry = agencies.agencies.find((agency) => agency.id === id)!;
    return {
      data: { meta: agencies.meta, profile: decodeAgency(pinned(entry.path)) },
      asOf: null,
      stale: false,
      savedAt: 200,
    };
  });
});
afterEach(() => forgetMoneyGraphs());

async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(element, (options) => {
        mockOptions = options;
        mockScreen.options = options;
      }),
    );
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
const has = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  ).length > 0;
const testIDs = (root: ReactTestInstance) =>
  root
    .findAll(
      (node) =>
        typeof node.type === 'string' && typeof node.props.testID === 'string',
    )
    .map((node) => node.props.testID as string);
/** The href associated with this target: where tapping it goes. */
function hrefOf(root: ReactTestInstance, testID: string) {
  let node: ReactTestInstance | null = byTestID(root, testID);
  const inner = node.findAll((child) => child.type === 'ExpoLink');
  if (inner.length) {
    expect(inner).toHaveLength(1);
    return inner[0]!.props.href;
  }
  while (node && node.type !== 'ExpoLink') node = node.parent;
  return node?.props.href;
}
/** The cards' testIDs in reading order. */
const cardIDs = (root: ReactTestInstance) =>
  testIDs(root).filter((id) => /^lead-\d+$/.test(id));
/** A ContentUnavailable's title (a native view on iOS, not a Text). */
const unavailable = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (n) => n.type === ContentUnavailable && n.props.testID === testID,
  )[0]?.props.title as string | undefined;
const cardOf = (root: ReactTestInstance, testID: string) =>
  root.findAll((n) => n.type === Card && n.props.testID === testID)[0]!;
type Modifier = { $type: string; identifier?: string; tag?: string };
// iOS ChoiceChips options are native picker items: choose one by its tag.
const choose = (root: ReactTestInstance, testID: string) => {
  const isOption = (node: ReactTestInstance) =>
    (node.props.modifiers as Modifier[] | undefined)?.some(
      (m) => m.$type === 'accessibilityIdentifier' && m.identifier === testID,
    ) ?? false;
  const option = root.find(isOption);
  const tag = (option.props.modifiers as Modifier[]).find(
    (m) => m.$type === 'tag',
  )!.tag;
  root
    .findAll(
      (node) =>
        typeof node.props.onSelectionChange === 'function' &&
        node.findAll(isOption).length > 0,
    )[0]!
    .props.onSelectionChange(tag);
};
// Pressable is a memo component: find it by its props, not its type.
const press = (root: ReactTestInstance, testID: string) =>
  act(async () => {
    const [pressable] = root.findAll(
      (node) =>
        node.props.testID === testID &&
        typeof node.props.onPress === 'function',
    );
    if (pressable) pressable.props.onPress();
    else choose(root, testID);
  });
/** Types into the bar search, as the native search field reports it. */
const search = (text: string) =>
  act(async () => {
    const bar = mockOptions.headerSearchBarOptions as {
      onChangeText: (event: { nativeEvent: { text: string } }) => void;
    };
    bar.onChangeText({ nativeEvent: { text } });
  });
const cancelSearch = () =>
  act(async () => {
    (
      mockOptions.headerSearchBarOptions as { onCancelButtonPress: () => void }
    ).onCancelButtonPress();
  });

function lastSource() {
  const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
    params: { key: string };
  };
  return sheetPayload(params.key, 'source')!.details;
}
function expectNoWeb() {
  expect(openOnWeb).not.toHaveBeenCalled();
  expect(openSource).not.toHaveBeenCalled();
  expect(Linking.openURL).not.toHaveBeenCalled();
}

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
    // Companies in both have no share: they sort by their party receipts,
    // the figure each card shows, so the list reads largest first.
    const both = leadsFor(discovery, 'donor_contract_overlap', 'share');
    const receipts = (l: { metrics: { label: string; value: number }[] }) =>
      l.metrics.find((m) => m.label === 'Recorded party receipts')!.value;
    for (let i = 1; i < both.length; i++)
      expect(receipts(both[i - 1]!)).toBeGreaterThanOrEqual(receipts(both[i]!));
    expect(leadsFor(discovery, 'recipient_concentration')).toHaveLength(3);
  });
  test('a concentration without its chart is left out, and the source notes say how many', async () => {
    const chartless = { ...signals[1]!, chart: undefined };
    expect(leadFor(chartless)).toBeNull();
    const short = { ...discovery, signals: [signals[0]!, chartless] };
    expect(leadsFor(short).map((l) => l.id)).toEqual([signals[0]!.id]);
    expect(leadsHiddenNotes({ ...short, unreadable: 1 })).toEqual([
      '2 leads could not be read and are not shown.',
    ]);
    mock.discovery.mockResolvedValueOnce({
      data: { ...short, unreadable: 1 },
      asOf: null,
      stale: false,
      savedAt: 200,
    });
    const renderer = await render(<Leads />);
    const root = renderer.root;
    // Only the kind with a lead is drawn; the count is not on the screen.
    expect(has(root, 'leads-section-donor_contract_overlap')).toBe(true);
    expect(has(root, 'leads-section-procurement_concentration')).toBe(false);
    expect(has(root, 'leads-section-recipient_concentration')).toBe(false);
    expect(cardIDs(root)).toEqual(['lead-0']);
    expect(texts(root).join('\n')).not.toMatch(/not shown|could not be read/);
    await press(root, 'leads-source-donor_contract_overlap');
    expect(lastSource().notes).toContain(
      '2 leads could not be read and are not shown.',
    );
    act(() => renderer.unmount());
  });
  test('a signal of a category the app does not know is left out', () => {
    const unknown = { ...signals[0]!, category: 'new_family' };
    expect(leadFor(unknown)).toBeNull();
    expect(
      leadsFor({ ...discovery, signals: [unknown, signals[1]!] }),
    ).toHaveLength(1);
    expect(isCategory('new_family')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
    expect(isCategory(['recipient_concentration'])).toBe(false);
    for (const category of leadCategories)
      expect(isCategory(category)).toBe(true);
  });
  test('comparisons use the web’s words and the export’s numbers', () => {
    const homeAffairs = leadFor(signals[2]!)!;
    expect(homeAffairs.comparison).toMatchObject({
      type: 'concentration',
      heading: 'Department of Home Affairs',
      takeaway:
        '38.7% of recorded contract value went to SECURE JOURNEYS PTY LTD.',
      chartTitle: 'Who got the contracts?',
      figureLabel: 'in contracts from this agency, started 2009 to 2026',
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
      chartTitle: 'Who gave to the party?',
      figureLabel: 'in party receipts, 2007–08 to 2024–25',
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
  test('supplier destinations use the recorded supplier id and agency, including the full list', () => {
    const comparison = leadFor(signals[2]!)!.comparison;
    if (comparison.type !== 'concentration')
      throw new Error('Expected a concentration');
    for (const row of comparison.rows.filter((row) => !row.other)) {
      const supplier = homeProfile.suppliers.find(
        (supplier) => supplier.name.toLowerCase() === row.name.toLowerCase(),
      )!;
      expect(leadSupplierRoute(row, homeProfile)).toEqual({
        pathname: '/money-record',
        params: {
          rid: supplier.id,
          agency: homeProfile.id,
          name: supplier.name,
        },
      });
    }
    const [row] = comparison.rows;
    expect(
      leadSupplierRoute({ ...row!, name: `  ${row!.name}  ` }, homeProfile),
    ).toEqual(leadSupplierRoute(row!, homeProfile));
    expect(leadSupplierRoute(comparison.rows[5]!, homeProfile)).toEqual({
      pathname: '/agency-list',
      params: {
        id: homeProfile.id,
        kind: 'suppliers',
        name: homeProfile.name,
      },
    });
  });
  test('unresolved, ambiguous and individual suppliers have no destination or search fallback', () => {
    const comparison = leadFor(signals[2]!)!.comparison;
    if (comparison.type !== 'concentration')
      throw new Error('Expected a concentration');
    const row = comparison.rows[0]!;
    const supplier = homeProfile.suppliers.find(
      (supplier) => supplier.name.toLowerCase() === row.name.toLowerCase(),
    )!;
    expect(leadSupplierRoute(row, null)).toBeNull();
    expect(leadSupplierRoute(comparison.rows[5]!, null)).toBeNull();
    expect(
      leadSupplierRoute(row, { id: homeAgency.id, name: homeAgency.name }),
    ).toBeNull();
    expect(
      leadSupplierRoute({ ...row, name: 'No matching supplier' }, homeProfile),
    ).toBeNull();
    expect(
      leadSupplierRoute(
        { ...row, name: 'Secure Journeys Limited' },
        homeProfile,
      ),
    ).toBeNull();
    expect(
      leadSupplierRoute(row, {
        ...homeProfile,
        suppliers: [supplier, { ...supplier, id: 'another-id' }],
      }),
    ).toBeNull();
    expect(
      leadSupplierRoute(row, {
        ...homeProfile,
        suppliers: [{ ...supplier, organisation: false }],
      }),
    ).toBeNull();
    expect(
      leadSupplierRoute({ ...row, supplierPath: null }, homeProfile),
    ).toBeNull();
  });
  test('recorded supplier aliases resolve to an agency id, while a similar name alone does not', () => {
    const lead = leadFor(signals[2]!)!;
    if (lead.comparison.type !== 'concentration')
      throw new Error('Expected a concentration');
    const row = lead.comparison.rows[0]!;
    const supplier = homeProfile.suppliers.find(
      (supplier) => supplier.name.toLowerCase() === row.name.toLowerCase(),
    )!;
    const agency = {
      ...homeProfile,
      suppliers: [{ ...supplier, name: 'Secure Journeys Services' }],
    };
    expect(leadSupplierRoute(row, agency)).toBeNull();
    expect(leadSupplierAliasPaths(lead, agency)).toEqual([
      '/suppliers/5a.json',
    ]);
    const aliases = decodeLeadSupplierAliases({
      profiles: {
        [supplier.id]: {
          id: supplier.id,
          aliases: [row.name],
          lookup_names: ['Another recorded name'],
        },
      },
    });
    expect(aliases[supplier.id]).toEqual([row.name, 'Another recorded name']);
    expect(leadSupplierRoute(row, { ...agency, aliases })).toEqual(
      moneyRecordRoute(
        { rid: supplier.id, agency: agency.id },
        'Secure Journeys Services',
      ),
    );
    expect(
      leadSupplierRoute(row, {
        ...agency,
        aliases: { 's-unrelated': [row.name] },
      }),
    ).toBeNull();
    expect(leadSupplierAliasPaths(lead, homeProfile)).toEqual([]);
    expect(
      leadSupplierAliasPaths(lead, {
        ...agency,
        suppliers: Array.from({ length: 5 }, () => agency.suppliers[0]!),
      }),
    ).toEqual([]);
    for (const profile of [
      { id: 's-other', aliases: [row.name] },
      { id: supplier.id, aliases: 'not an array' },
    ])
      expect(() =>
        decodeLeadSupplierAliases({ profiles: { [supplier.id]: profile } }),
      ).toThrow();
  });
  test('a single period reads once in the figure label', () => {
    const chart = signals[1]!.chart!;
    const one = leadFor({
      ...signals[1]!,
      chart: {
        ...chart,
        period: { ...chart.period!, from: '2024-25', to: '2024-25' },
      },
    })!;
    expect(
      one.comparison.type === 'concentration' && one.comparison.figureLabel,
    ).toBe('in party receipts, 2024–25');
  });
  test('every chart’s rows cover the whole: named participants plus Other make 100%', () => {
    for (const s of signals.filter((x) => x.chart)) {
      const c = leadFor(s)!.comparison;
      if (c.type !== 'concentration') throw new Error('expected a chart');
      const sum = c.rows.reduce((t, r) => t + r.share, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.1);
    }
  });
  test('the web comparison and supplier profiles stay addressable for ⋯, never /search', () => {
    expect(discoverPath(signals[1]!)).toBe(
      '/discover?category=recipient_concentration&item=recipient_concentration%3Aa186427ec7f0b918',
    );
    for (const s of signals) {
      const path = discoverPath(s);
      expect(path).not.toMatch(/^\/search/);
      expect(webPageUrl(path)).not.toBeNull();
    }
    expect(webPageUrl(supplierPath('SECURE JOURNEYS PTY LTD'))).not.toBeNull();
  });
  test('the kind words: section titles, See all, search placeholders and sources', () => {
    expect(leadCategories.map(categoryLabel)).toEqual([
      'Government contracts',
      'Party funding',
      'Companies in both',
    ]);
    expect(categorySeeAll('procurement_concentration', 28)).toBe(
      'See all 28 government contract leads',
    );
    expect(categorySeeAll('recipient_concentration', 3)).toBe(
      'See all 3 party funding leads',
    );
    expect(categorySeeAll('donor_contract_overlap', 1200)).toBe(
      'See all 1,200 company leads',
    );
    expect(leadCategories.map(categorySearch)).toEqual([
      'Agencies',
      'Parties',
      'Companies',
    ]);
    expect(leadCategories.map(categorySource)).toEqual([
      'AusTender',
      'AEC',
      'AEC and AusTender',
    ]);
  });
  test('a card’s one figure: compact money in plain words', () => {
    const figure = (signal: (typeof signals)[number]) =>
      leadCardFigure(leadFor(signal)!);
    expect(figure(signals[0]!)).toEqual({
      text: '$77m',
      spoken: '77 million dollars',
      label: 'in party receipts',
    });
    expect(figure(signals[1]!)).toEqual({
      text: '$124.7m',
      spoken: '124.7 million dollars',
      label: 'from the largest donor',
    });
    expect(figure(signals[2]!)).toEqual({
      text: '$2.3bn',
      spoken: '2.3 billion dollars',
      label: 'to the largest supplier',
    });
    // Every pinned lead's figure has a plain label, never the export's own.
    for (const lead of leadsFor(discovery))
      expect(leadCardFigure(lead)!.label).toMatch(
        /^(in party receipts|to the largest supplier|from the largest donor)$/,
      );
    // A label the app has no words for is lower-cased; a count stays a count.
    expect(
      leadCardFigure({
        metrics: [{ label: 'Contract records', value: 4, format: 'count' }],
      }),
    ).toEqual({ text: '4', spoken: '4', label: 'contract records' });
    expect(leadCardFigure({ metrics: [] })).toBeNull();
  });
  test('caveats in plain language: the pipeline caveat replaced, any other pipeline clause dropped', () => {
    // The pipeline's own caveat, as portal/public/discovery.json writes it.
    const pipeline =
      'Annual party receipts are not all verified gifts; source donation_type=direct is an ingestion classification. State, election and referendum disclosures are excluded.';
    expect(signals[1]!.caveats).toContain(pipeline);
    expect(plainCaveat(pipeline)).toBe(
      'Annual party receipts include more than gifts. State, election and referendum disclosures are not included.',
    );
    // A caveat in plain words is kept verbatim.
    const plain =
      'Matching names are not verified legal identities; unrelated entities can share a name.';
    expect(plainCaveat(plain)).toBe(plain);
    // Another pipeline clause: cut from the first ";" or ",", or the whole
    // sentence when the identifier comes before it.
    expect(
      plainCaveat(
        'Values are as reported, using the contract_value field. Some years are missing.',
      ),
    ).toBe('Values are as reported. Some years are missing.');
    expect(
      plainCaveat(
        'The supplier_abn match is exact; spellings differ. Some years are missing.',
      ),
    ).toBe('Some years are missing.');
    expect(
      plainCaveat('Rows come from ingestion. Some years are missing.'),
    ).toBe('Some years are missing.');
    // No pinned caveat reaches the reader in pipeline words.
    for (const caveat of new Set(signals.flatMap((s) => s.caveats))) {
      const shownCaveat = plainCaveat(caveat);
      expect(shownCaveat).toBeTruthy();
      expect(shownCaveat).not.toMatch(/\w_\w|ingestion|=/i);
    }
  });
  test('the root’s sections: fixed order, largest total first, a kind with none left out', () => {
    const sections = leadSections(shown);
    expect(sections.map((s) => s.category)).toEqual([...leadCategories]);
    for (const { category, leads } of sections)
      expect(leads.map((l) => l.id)).toEqual(
        leadsFor(shown, category).map((l) => l.id),
      );
    expect(sections.map((s) => s.leads.length)).toEqual([28, 3, companies]);
    expect(
      leadSections({
        ...shown,
        signals: shown.signals.filter(
          (s) => s.category !== 'recipient_concentration',
        ),
      }).map((s) => s.category),
    ).toEqual(['procurement_concentration', 'donor_contract_overlap']);
  });
  test('search matches every word of the subject, its chart’s group or the title, in kind order', () => {
    const westpac = searchLeads(shown, '  westpac   BANKING ');
    expect(westpac.map((l) => l.id)).toContain(signals[0]!.id);
    for (const lead of westpac)
      expect(`${lead.entity} ${lead.title}`.toLowerCase()).toMatch(
        /westpac banking/,
      );
    // Words need not be adjacent; every one must match.
    expect(
      searchLeads(shown, 'home affairs department').map((l) => l.id),
    ).toEqual([signals[2]!.id]);
    expect(searchLeads(shown, 'home affairs zzz')).toEqual([]);
    // Not the sentence's other words: no lead is found by its summary alone.
    expect(searchLeads(shown, 'canonical')).toEqual([]);
    // Across kinds, in the root's order.
    const all = searchLeads(shown, 'pty');
    const order = all.map((l) => leadCategories.indexOf(l.category));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // An empty search is the whole pool; within a kind, the chosen order.
    expect(searchLeads(shown, ' ')).toHaveLength(28 + 3 + companies);
    expect(
      searchLeads(shown, '', 'procurement_concentration', 'share').map(
        (l) => l.id,
      ),
    ).toEqual(
      leadsFor(shown, 'procurement_concentration', 'share').map((l) => l.id),
    );
  });
  test('every lead is shown, with only the unreadable count in the source sheet’s notes', () => {
    expect(shown.signals).toHaveLength(signals.length);
    expect(leadsHiddenNotes(shown)).toEqual([]);
    expect(leadsHiddenNotes({ ...shown, unreadable: 1 })).toEqual([
      '1 lead could not be read and is not shown.',
    ]);
    expect(leadsHiddenNotes(discovery)).toEqual([]);
  });
  test('leads about one organisation or party: on its subject, never on its sentence', () => {
    expect(leadsAbout(shown, 'WESTPAC BANKING CORPORATION')).toEqual([
      { id: signals[0]!.id, title: signals[0]!.title },
    ]);
    expect(
      leadsAbout(shown, 'Department of Home Affairs').map((l) => l.id),
    ).toEqual([signals[2]!.id]);
    expect(
      leadsAbout(shown, 'United Australia Party').map((l) => l.id),
    ).toContain(signals[1]!.id);
    // A concentration's subject is its group: its largest participant
    // (the export's entity) is not the subject, nor are its other rows.
    expect(
      leadsAbout(shown, 'Mineralogy Pty Ltd').map((l) => l.id),
    ).not.toContain(signals[1]!.id);
    expect(
      leadsAbout(shown, 'Queensland Nickel Pty Ltd').map((l) => l.id),
    ).not.toContain(signals[1]!.id);
    // Never on the sentence's own words.
    expect(leadsAbout(shown, 'awarded to one supplier')).toEqual([]);
    expect(leadsAbout(shown, '')).toEqual([]);
  });
  test('the kind list’s caption and the shown cards’ sources', () => {
    expect(leadsLede).toBe(
      'Patterns in the public record are leads, not findings.',
    );
    expect(
      kindCaption('procurement_concentration', 'value', 28, 28, false),
    ).toBe('28 leads, largest totals first');
    expect(kindCaption('recipient_concentration', 'share', 3, 3, false)).toBe(
      '3 leads, biggest share first',
    );
    expect(kindCaption('donor_contract_overlap', 'share', 15, 15, false)).toBe(
      '15 leads, largest first',
    );
    expect(kindCaption('procurement_concentration', 'value', 3, 28, true)).toBe(
      '3 of 28 leads',
    );
    expect(kindCaption('recipient_concentration', 'value', 1, 1, false)).toBe(
      '1 lead, largest totals first',
    );
    const lead = (category: (typeof leadCategories)[number]) =>
      leadsFor(shown, category)[0]!;
    expect(leadsCitation([lead('procurement_concentration')])).toBe(
      'AusTender',
    );
    expect(
      leadsCitation([
        lead('donor_contract_overlap'),
        lead('recipient_concentration'),
      ]),
    ).toBe('AEC and AusTender');
    expect(
      leadsCitation([
        lead('procurement_concentration'),
        lead('recipient_concentration'),
      ]),
    ).toBe('AusTender and AEC');
    expect(leadsCitation([])).toBe('AEC and AusTender');
  });
  test('an example record as a money row: "to", no party code, plain detail', () => {
    const westpac = evidence.find((e) => e.record_id === '643745')!;
    expect(evidenceRow(leadEvidenceFor(westpac))).toEqual({
      name: 'Westpac Banking Corporation to Australian Labor Party',
      detail: 'AEC annual receipt · 2024–25',
      amount: 1803,
    });
    const contract = evidence.find((e) => e.record_id === 'CN3407266')!;
    expect(evidenceRow(leadEvidenceFor(contract))).toEqual({
      name: 'Australian Office of Financial Management to Westpac Banking Corporation',
      detail: 'Contract · from 6 Feb 2017',
      amount: 4537500,
    });
    // A label the app could not read is not a money row.
    expect(
      evidenceRow(leadEvidenceFor({ ...westpac, label: 'Donation record 1' })),
    ).toBeNull();
  });
});

describe('the Leads screen', () => {
  const sections = leadSections(shown);
  test('opens on the lede and three named sections, three cards each, with See all', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    expect(mockOptions).toMatchObject({
      title: 'Leads',
      headerLargeTitle: true,
    });
    expect(
      (mockOptions.headerSearchBarOptions as { placeholder: string })
        .placeholder,
    ).toBe('Agencies, parties and companies');
    expect(byTestID(root, 'leads-lede').props.children).toBe(
      'Patterns in the public record are leads, not findings.',
    );
    // The fixed order, each section's header and its "See all".
    const order = testIDs(root).filter((id) => id.startsWith('leads-section-'));
    expect(order).toEqual(leadCategories.map((c) => `leads-section-${c}`));
    expect(texts(root)).toEqual(
      expect.arrayContaining([
        'Government contracts',
        'Party funding',
        'Companies in both',
      ]),
    );
    for (const { category, leads } of sections) {
      const all = byTestID(root, `leads-all-${category}`);
      expect(all.props.accessibilityLabel).toBe(
        categorySeeAll(category, leads.length),
      );
      expect(hrefOf(root, `leads-all-${category}`)).toEqual(
        leadsKindRoute(category),
      );
    }
    expect(
      byTestID(root, 'leads-all-procurement_concentration').props
        .accessibilityLabel,
    ).toBe('See all 28 government contract leads');
    // Cards numbered in reading order across sections, three per kind.
    expect(cardIDs(root)).toEqual(
      Array.from({ length: 9 }, (_, i) => `lead-${i}`),
    );
    const firstThree = sections.flatMap((s) => s.leads.slice(0, 3));
    firstThree.forEach((lead, i) => {
      expect(hrefOf(root, `lead-${i}`)).toEqual(leadRoute(lead.id));
      expect(
        byTestID(root, `leads-section-${lead.category}`).findAll(
          (n) => n.props.testID === `lead-${i}`,
        ).length,
      ).toBeGreaterThan(0);
    });
    // Under a section header the card does not say its kind again.
    expect(testIDs(root).filter((id) => id.endsWith('-kind'))).toEqual([]);
    // No count, withheld line, filter chips or "Show more" on the screen.
    const ids = testIDs(root);
    for (const retired of [
      'leads-count',
      'leads-withheld',
      'leads-hidden',
      'leads-more',
      'leads-source',
    ])
      expect(ids).not.toContain(retired);
    expect(ids.some((id) => id.startsWith('leads-filter-'))).toBe(false);
    expect(texts(root).join('\n')).not.toMatch(
      /not shown|\d+ leads$|Show more|Evidence \(/m,
    );
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('a card is one link: title, one money-ink figure and its plain label', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    const lead = sections[0]!.leads[0]!;
    expect(lead.id).toBe(signals[2]!.id);
    const card = cardOf(root, 'lead-0');
    expect(card.props.href).toEqual(leadRoute(lead.id));
    expect(card.props.accessibilityRole).toBe('link');
    expect(card.props.accessibilityLabel).toBe(
      'Department of Home Affairs: 39% awarded to one supplier. 2.3 billion dollars, to the largest supplier.',
    );
    expect(card.props.accessibilityHint).toBe('Opens the lead.');
    // Long press: Share and Copy link, never the web.
    expect(
      (card.props.menu as { title: string }[]).map((item) => item.title),
    ).toEqual(['Share', 'Copy link']);
    expect(byTestID(root, 'lead-0-title').props.children).toBe(lead.title);
    const figure = byTestID(root, 'lead-0-figure');
    expect(texts(figure)).toEqual(['$2.3bn', 'to the largest supplier']);
    const [value] = figure.findAllByType(DesignText);
    expect(value!.props.variant).toBe('tileFigure');
    expect(value!.props.tone).toBe(accents.money.ink);
    // A party's card and a company's card say where their figure sits.
    expect(cardOf(root, 'lead-3').props.accessibilityLabel).toMatch(
      /\. [\d.]+ (million|thousand) dollars, from the largest donor\.$/,
    );
    expect(cardOf(root, 'lead-6').props.accessibilityLabel).toMatch(
      /\. [\d.]+ (million|thousand) dollars, in party receipts\.$/,
    );
    // One target: no Evidence row, sheet, summary or kicker on any card.
    const cardsText = texts(root).join('\n');
    for (const l of sections.flatMap((s) => s.leads.slice(0, 3))) {
      expect(cardsText).not.toContain(l.summary);
      for (const caveat of l.caveats) expect(cardsText).not.toContain(caveat);
    }
    expect(
      testIDs(root).some((id) => /^lead-\d+-(source|open|summary)$/.test(id)),
    ).toBe(false);
    act(() => renderer.unmount());
  });
  test('each section’s source line holds the methodology, and no withheld count', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    expect(labels(root)).toEqual(
      expect.arrayContaining([
        'Updated 21 Sep 2026, AusTender',
        'Updated 21 Sep 2026, AEC',
        'Updated 21 Sep 2026, AEC and AusTender',
      ]),
    );
    for (const category of leadCategories) {
      await press(root, `leads-source-${category}`);
      const details = lastSource();
      expect(details.citation).toBe(categorySource(category));
      expect(sourceHeader(details)).toBe('As at 21 September 2026');
      expect(details.notes).toContain(aboutLede(discovery));
      for (const method of discovery.methodology)
        expect(details.notes).toContain(method);
      expect(details.notes.join('\n')).not.toMatch(/not named in OPAX/);
    }
    expect(aboutLede(discovery)).toMatch(/not proof of wrongdoing/);
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('searching turns the sections into one flat list with a caption and one source line', async () => {
    const renderer = await render(<Leads />);
    const root = renderer.root;
    await search('department');
    const results = searchLeads(shown, 'department');
    expect(results.length).toBeGreaterThan(3);
    expect(has(root, 'leads-search-results')).toBe(true);
    expect(testIDs(root).some((id) => id.startsWith('leads-section-'))).toBe(
      false,
    );
    expect(byTestID(root, 'leads-search-caption').props.children).toBe(
      `${results.length} leads match`,
    );
    expect(cardIDs(root)).toHaveLength(results.length);
    results.forEach((lead, i) =>
      expect(hrefOf(root, `lead-${i}`)).toEqual(leadRoute(lead.id)),
    );
    // Each card says its kind, as no section header does.
    expect(byTestID(root, 'lead-0-kind').props.children).toBe(
      'Government contracts',
    );
    expect(cardOf(root, 'lead-0').props.accessibilityLabel).toMatch(
      /^Government contracts\. Department of /,
    );
    // One source line, naming the shown cards' sources.
    expect(byTestID(root, 'leads-source').props.accessibilityLabel).toBe(
      'Updated 21 Sep 2026, AusTender',
    );
    // One match is "1 lead matches", with the kind line.
    await search('Westpac Banking');
    const westpac = searchLeads(shown, 'Westpac Banking');
    expect(westpac).toHaveLength(1);
    expect(byTestID(root, 'leads-search-caption').props.children).toBe(
      '1 lead matches',
    );
    expect(byTestID(root, 'lead-0-kind').props.children).toBe(
      'Companies in both',
    );
    expect(byTestID(root, 'leads-source').props.accessibilityLabel).toBe(
      'Updated 21 Sep 2026, AEC and AusTender',
    );
    // Nothing matching says so, with the query in the web's quotes.
    // under the caption, in one plain line.
    await search('zzzz');
    expect(byTestID(root, 'leads-search-caption').props.children).toBe(
      '0 leads match',
    );
    const none = root.find(
      (n) => n.type === DesignText && n.props.testID === 'leads-empty',
    );
    expect(none.props).toMatchObject({ variant: 'body', tone: 'inkSoft' });
    expect(none.props.children).toBe('No leads match “zzzz”.');
    expect(unavailable(root, 'leads-empty')).toBeUndefined();
    expect(has(root, 'leads-source')).toBe(false);
    // Clearing the field restores the sections.
    await cancelSearch();
    expect(has(root, 'leads-search-results')).toBe(false);
    expect(cardIDs(root)).toHaveLength(9);
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('a kind list: its picker orders concentrations, its caption counts, no paging', async () => {
    mockParams.category = 'procurement_concentration';
    const renderer = await render(<Leads />);
    const root = renderer.root;
    expect(mockOptions.title).toBe('Government contracts');
    expect(
      (mockOptions.headerSearchBarOptions as { placeholder: string })
        .placeholder,
    ).toBe('Agencies');
    expect(has(root, 'leads-sort')).toBe(true);
    expect(byTestID(root, 'leads-caption').props.children).toBe(
      '28 leads, largest totals first',
    );
    // Every lead, no "Show more", no kind line; the list's own source line.
    expect(cardIDs(root)).toHaveLength(28);
    expect(testIDs(root).some((id) => id.endsWith('-kind'))).toBe(false);
    expect(has(root, 'leads-more')).toBe(false);
    expect(
      byTestID(root, 'leads-source-procurement_concentration').props
        .accessibilityLabel,
    ).toBe('Updated 21 Sep 2026, AusTender');
    const byValue = leadsFor(shown, 'procurement_concentration');
    expect(hrefOf(root, 'lead-0')).toEqual(leadRoute(byValue[0]!.id));
    await press(root, 'leads-sort-share');
    expect(byTestID(root, 'leads-caption').props.children).toBe(
      '28 leads, biggest share first',
    );
    const byShare = leadsFor(shown, 'procurement_concentration', 'share');
    expect(byShare[0]!.id).not.toBe(byValue[0]!.id);
    byShare.forEach((lead, i) =>
      expect(hrefOf(root, `lead-${i}`)).toEqual(leadRoute(lead.id)),
    );
    // Searching within the kind: "{m} of {n} leads".
    await search('health');
    const matched = searchLeads(
      shown,
      'health',
      'procurement_concentration',
      'share',
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(byTestID(root, 'leads-caption').props.children).toBe(
      `${matched.length} of 28 leads`,
    );
    expect(cardIDs(root)).toHaveLength(matched.length);
    // No match keeps the picker and the caption, with one plain line.
    await search('zzzz');
    expect(has(root, 'leads-sort')).toBe(true);
    expect(byTestID(root, 'leads-caption').props.children).toBe(
      '0 of 28 leads',
    );
    expect(byTestID(root, 'leads-empty').props.children).toBe(
      'No leads match “zzzz”.',
    );
    expect(cardIDs(root)).toHaveLength(0);
    act(() => renderer.unmount());
  });
  test('companies in both have one order: no picker', async () => {
    mockParams.category = 'donor_contract_overlap';
    const renderer = await render(<Leads />);
    const root = renderer.root;
    expect(mockOptions.title).toBe('Companies in both');
    expect(has(root, 'leads-sort')).toBe(false);
    expect(byTestID(root, 'leads-caption').props.children).toBe(
      `${companies} leads, largest first`,
    );
    expect(cardIDs(root)).toHaveLength(companies);
    act(() => renderer.unmount());
  });
  test('a plain kind name opens its list; an unknown kind opens the root', async () => {
    mockParams.category = 'party_funding';
    const plain = await render(<Leads />);
    expect(mockOptions.title).toBe('Party funding');
    act(() => plain.unmount());
    mockParams.category = 'not_a_kind';
    const renderer = await render(<Leads />);
    expect(mockOptions.title).toBe('Leads');
    expect(cardIDs(renderer.root)).toHaveLength(9);
    act(() => renderer.unmount());
  });
  test('a Discover link with a lead pushes the lead once, after the leads load', async () => {
    mockParams.category = 'recipient_concentration';
    mockParams.item = signals[1]!.id;
    let resolve!: (value: RecordResult<Discovery>) => void;
    mock.discovery.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const renderer = await render(<Leads />);
    expect(has(renderer.root, 'leads-loading')).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    await act(async () =>
      resolve({ data: shown, asOf: null, stale: false, savedAt: 200 }),
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(leadRoute(signals[1]!.id));
    expect(mockOptions.title).toBe('Party funding');
    // A refresh does not push it again.
    await act(async () =>
      renderer.root
        .findAll((node) => !!node.props.refreshControl)[0]!
        .props.refreshControl.props.onRefresh(),
    );
    expect(router.push).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });
  test('an export with no leads says so', async () => {
    mock.discovery.mockResolvedValueOnce({
      data: { ...shown, signals: [] },
      asOf: null,
      stale: false,
      savedAt: 200,
    });
    const renderer = await render(<Leads />);
    expect(unavailable(renderer.root, 'leads-empty')).toBe('No leads yet');
    act(() => renderer.unmount());
  });
  test('a kind with no leads in this export says so, not "0 leads"', async () => {
    mockParams.category = 'companies_in_both';
    mock.discovery.mockResolvedValueOnce({
      data: {
        ...shown,
        signals: shown.signals.filter(
          (signal: { category: string }) =>
            signal.category !== 'donor_contract_overlap',
        ),
      },
      asOf: null,
      stale: false,
      savedAt: 200,
    });
    const renderer = await render(<Leads />);
    expect(unavailable(renderer.root, 'leads-kind-empty')).toBe(
      'No company leads yet',
    );
    expect(has(renderer.root, 'leads-caption')).toBe(false);
    act(() => renderer.unmount());
  });
  test('a failed first load says so and retries; offline says nothing is saved', async () => {
    mock.discovery.mockRejectedValueOnce(
      new ApiError('invalid-data', 'This catalog could not be read.'),
    );
    let renderer = await render(<Leads />);
    expect(unavailable(renderer.root, 'leads-error')).toBe(
      'Leads couldn’t be loaded',
    );
    await press(renderer.root, 'leads-error-retry');
    expect(cardIDs(renderer.root)).toHaveLength(9);
    act(() => renderer.unmount());
    mock.discovery.mockRejectedValueOnce(new ApiError('offline', 'Offline'));
    renderer = await render(<Leads />);
    expect(unavailable(renderer.root, 'leads-error')).toBe(copy.notSaved);
    expect(has(renderer.root, 'leads-error-retry')).toBe(false);
    act(() => renderer.unmount());
  });
});

describe('a lead’s page', () => {
  test.each([
    [320, 1, 'column'],
    [390, 1, 'column'],
    [700, 1, 'row'],
    [700, 1.35, 'column'],
    [1180, 1.65, 'column'],
    [1180, 3.12, 'column'],
  ])(
    'the table at %s pt and scale %s uses %s with wrapping values',
    async (width, fontScale, direction) => {
      const previous = Dimensions.get('window');
      Dimensions.set({ window: { ...previous, fontScale } });
      const comparison = leadFor(signals[1]!)!.comparison;
      if (comparison.type !== 'concentration')
        throw new Error('Expected a concentration');
      const renderer = await render(
        <ConcentrationChart comparison={comparison} testID="lead-chart" />,
      );
      try {
        await press(renderer.root, 'lead-table-toggle');
        act(() =>
          byTestID(renderer.root, 'lead-chart-table').props.onLayout({
            nativeEvent: { layout: { width } },
          }),
        );
        const row = byTestID(renderer.root, 'lead-chart-cell-0');
        expect(
          StyleSheet.flatten(
            byTestID(renderer.root, 'lead-chart-cell-0-layout').props.style,
          ).flexDirection,
        ).toBe(direction);
        expect(row.props.accessibilityLabel).toBe(
          'Mineralogy Pty Ltd, $124,655,455 · 78.4% · 230 records',
        );
        const [name, value] = row.findAllByType(DesignText);
        expect(name!.props).toMatchObject({
          wordSafe: true,
          children: 'Mineralogy Pty Ltd',
        });
        expect(value!.props).toMatchObject({ wordSafe: true, tabular: true });
        for (const text of [name!, value!]) {
          expect(text.props.numberOfLines).toBeUndefined();
          if (direction === 'row')
            expect(StyleSheet.flatten(text.props.style).flex).toBe(1);
        }
      } finally {
        act(() => renderer.unmount());
        Dimensions.set({ window: previous });
      }
    },
  );
  test.each([false, true])(
    'a long supplier name wraps in its column with amount and share together (linked: %s)',
    async (linked) => {
      const comparison = leadFor(signals[2]!)!.comparison;
      if (comparison.type !== 'concentration')
        throw new Error('Expected a concentration');
      const name = 'SANOFI-AVENTIS AUSTRALIA PTY LTD';
      const renderer = await render(
        <ConcentrationChart
          comparison={{
            ...comparison,
            rows: [
              { ...comparison.rows[0]!, name, value: 137100000, share: 3.3 },
            ],
          }}
          rowHref={
            linked
              ? () =>
                  moneyRecordRoute(
                    { rid: 'sanofi', agency: homeAgency.id },
                    name,
                  )
              : undefined
          }
          testID="lead-chart"
        />,
      );
      const root = renderer.root;
      const row = byTestID(root, 'lead-chart-row-0');
      const label = byTestID(root, 'lead-chart-row-0-label');
      const figures = byTestID(root, 'lead-chart-row-0-figures');
      const supplierName = label.findAllByType(DesignText)[0]!;
      expect(supplierName.props.children).toBe(name);
      expect(supplierName.props.wordSafe).toBe(true);
      expect(supplierName.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(supplierName.props.style)).toMatchObject({
        flex: 1,
        minWidth: 0,
      });
      expect(StyleSheet.flatten(label.props.style)).toMatchObject({
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'flex-start',
      });
      expect(StyleSheet.flatten(figures.props.style)).toMatchObject({
        flexDirection: 'row',
        flexWrap: 'nowrap',
        flexShrink: 0,
      });
      const values = figures.findAllByType(DesignText);
      expect(values.map((value) => value.props.children)).toEqual([
        '$137.1m',
        '3.3%',
      ]);
      for (const value of values) {
        expect(value.props.numberOfLines).toBe(1);
        expect(StyleSheet.flatten(value.props.style).flexShrink).toBe(0);
      }
      expect(
        StyleSheet.flatten(row.props.style).minHeight,
      ).toBeGreaterThanOrEqual(44);
      expect(row.props.accessibilityLabel).toBe(
        `${name}, 137.1 million dollars, 3.3 percent`,
      );
      expect(
        row
          .findAllByType(Icon)
          .some((icon) => icon.props.name === 'chevron.right'),
      ).toBe(linked);
      act(() => renderer.unmount());
    },
  );
  test('a party lead: meta, subject, takeaway, the party’s page, its figure and chart', async () => {
    mockParams.id = signals[1]!.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    expect(byTestID(root, 'lead-meta').props.children).toEqual([
      'Lead · ',
      'Party funding',
    ]);
    expect(texts(root)).toContain('Lead · Party funding');
    expect(byTestID(root, 'lead-heading').props.children).toBe(
      'United Australia Party',
    );
    expect(byTestID(root, 'lead-takeaway').props.children).toBe(
      '78.4% of recorded receipts came from Mineralogy Pty Ltd.',
    );
    expect(byTestID(root, 'lead-subject').props.accessibilityLabel).toBe(
      'United Australia Party',
    );
    expect(hrefOf(root, 'lead-subject')).toEqual(
      partyRoute('United Australia Party'),
    );
    expect(texts(root)).toContain('Who gave to the party?');
    expect(
      labels(root).find((l) => l.startsWith('159 million dollars, ')),
    ).toBe('159 million dollars, in party receipts, 2007–08 to 2024–25');
    expect(texts(byTestID(root, 'lead-total'))).toEqual(
      expect.arrayContaining([
        '$159m',
        'in party receipts, 2007–08 to 2024–25',
      ]),
    );
    // The party is on the money map.
    expect(hrefOf(root, 'lead-money-map')).toEqual(
      moneyRoute('United Australia Party'),
    );
    expect(byTestID(root, 'lead-money-map').props.accessibilityLabel).toBe(
      'Open in the money map',
    );
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('the chart: plain bars, one per row, and the same rows as a table', async () => {
    mockParams.id = signals[1]!.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    const row0 = byTestID(root, 'lead-chart-row-0');
    expect(row0.props.accessibilityLabel).toBe(
      'Mineralogy Pty Ltd, 124.7 million dollars, 78.4 percent',
    );
    expect(byTestID(root, 'lead-chart-row-5').props.accessibilityLabel).toBe(
      'Other 23 contributors, 1.7 million dollars, 1.1 percent',
    );
    // The amount reads in plain ink; only the bar fill is money ink.
    const [amount] = row0.findAll(
      (n) => n.type === DesignText && n.props.tabular,
    );
    expect(amount!.props.children).toBe('$124.7m');
    expect(amount!.props.tone).toBeUndefined();
    // A picture of the rows, not links: nothing to press, no web.
    for (let i = 0; i < 6; i++) {
      const bar = byTestID(root, `lead-chart-row-${i}`);
      expect(bar.props.onPress).toBeUndefined();
      expect(bar.props.accessibilityRole).toBeUndefined();
      let node: ReactTestInstance | null = bar;
      while (node && node.type !== 'ExpoLink') node = node.parent;
      expect(node).toBeNull();
    }
    expect(texts(root).join('\n')).not.toMatch(/opax\.com\.au/);
    expect(byTestID(root, 'lead-table-toggle').props.accessibilityLabel).toBe(
      'Show as table',
    );
    await press(root, 'lead-table-toggle');
    expect(has(root, 'lead-chart-bars')).toBe(false);
    expect(has(root, 'lead-chart-table')).toBe(true);
    expect(byTestID(root, 'lead-chart-cell-0').props.accessibilityLabel).toBe(
      'Mineralogy Pty Ltd, $124,655,455 · 78.4% · 230 records',
    );
    expect(byTestID(root, 'lead-chart-cell-5').props.accessibilityLabel).toBe(
      'Other 23 contributors, $1,721,102 · 1.1%',
    );
    expect(byTestID(root, 'lead-table-toggle').props.accessibilityLabel).toBe(
      'Show as chart',
    );
    await press(root, 'lead-table-toggle');
    expect(has(root, 'lead-chart-row-0')).toBe(true);
    expect(has(root, 'lead-chart-table')).toBe(false);
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('how the lead was found: the method, plain caveats with a dot, and example records that push the record', async () => {
    const lead = leadFor(signals[1]!)!;
    mockParams.id = lead.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    expect(texts(byTestID(root, 'lead-method'))).toContain(
      'How this lead was found',
    );
    expect(byTestID(root, 'lead-note').props.children).toBe(
      lead.comparison.note,
    );
    lead.caveats.forEach((caveat, i) =>
      expect(byTestID(root, `lead-caveat-${i}`).props.children).toBe(
        plainCaveat(caveat),
      ),
    );
    expect(byTestID(root, 'lead-caveat-2').props.children).toBe(
      'Annual party receipts include more than gifts. State, election and referendum disclosures are not included.',
    );
    expect(texts(root).join('\n')).not.toMatch(/donation_type|ingestion/);
    // A dot, not a warning triangle.
    expect(
      root.findAll(
        (n) =>
          n.props.name === 'exclamationmark.triangle' ||
          n.props.symbol === 'exclamationmark.triangle',
      ),
    ).toHaveLength(0);
    expect(texts(byTestID(root, 'lead-evidence'))).toContain('Example records');
    // Examples are a page section, outside the method's tight text rhythm.
    const method = byTestID(root, 'lead-method');
    expect(
      method.findAll((node) => node.props.testID === 'lead-evidence'),
    ).toHaveLength(0);
    expect(texts(root).join('\n')).not.toMatch(/→|Example records \(/);
    lead.evidence.forEach((item, i) => {
      const row = evidenceRow(item)!;
      expect(hrefOf(root, `lead-evidence-${i}`)).toEqual(
        moneyItemRoute(
          { kind: 'evidence', lead: lead.id, i: String(i) },
          row.name,
        ),
      );
    });
    // No web rows: the comparison and the money map stay in the app.
    expect(testIDs(root).some((id) => id.startsWith('lead-link-'))).toBe(false);
    expect(texts(root)).not.toContain('On opax.com.au');
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test.each([
    [0, 'AEC Transparency Register', 'https://transparency.aec.gov.au/'],
    [1, 'AusTender register · record CN3407266', 'https://www.tenders.gov.au/'],
  ])(
    'Maestro 27 example %i opens its money item and register original',
    async (index, label, url) => {
      // The pinned /discovery.json is the same fixture that 27-leads uses.
      rememberMoneyGraph(
        'federal',
        decodeMoneyGraph(pinned('/graph/money.json')),
      );
      mockParams.id = signals[0]!.id;
      const lead = await render(<LeadDetail />);
      const href = hrefOf(lead.root, `lead-evidence-${index}`);
      expect(href).toMatchObject({
        pathname: '/money-item',
        params: { kind: 'evidence', lead: signals[0]!.id, i: String(index) },
      });
      act(() => lead.unmount());
      Object.keys(mockParams).forEach((key) => delete mockParams[key]);
      Object.assign(mockParams, href.params);
      const item = await render(<MoneyItem />);
      expect(texts(item.root).join('\n')).not.toMatch(
        /This record isn't available any more|643745/,
      );
      const original = byTestID(item.root, 'money-item-original-0');
      expect(original.props.accessibilityLabel).toBe(label);
      expectNoWeb();
      await press(item.root, 'money-item-original-0');
      expect(openSource).toHaveBeenCalledWith(url, label);
      expect(openOnWeb).not.toHaveBeenCalled();
      expect(Linking.openURL).not.toHaveBeenCalled();
      act(() => item.unmount());
    },
  );
  test('every pinned lead evidence route resolves with its amount and original', async () => {
    for (const signal of shown.signals) {
      const lead = leadFor(signal)!;
      for (const [index, evidence] of lead.evidence.entries()) {
        const row = evidenceRow(evidence)!;
        const params = itemParams({
          kind: 'evidence',
          lead: lead.id,
          i: String(index),
        });
        expect(params).not.toBeNull();
        const item = (await loadMoneyItem(params!, false)).data;
        expect(item).toMatchObject({
          name: row.name,
          amount: row.amount,
          register: evidence.register,
          originals: [{ url: evidence.url }],
        });
      }
    }
  });
  test.each([
    ['missing URL', { url: null }],
    ['unsafe URL', { url: 'http://transparency.aec.gov.au/' }],
    ['unreadable record', { label: 'Donation record 643745' }],
  ])('an example with a %s has no link or preview', async (_name, change) => {
    rememberMoneyGraph(
      'federal',
      decodeMoneyGraph(pinned('/graph/money.json')),
    );
    const signal = signals[0]!;
    mock.discovery.mockResolvedValue({
      data: {
        ...shown,
        signals: [
          { ...signal, evidence: [{ ...signal.evidence[0]!, ...change }] },
        ],
      },
      asOf: null,
      stale: false,
      savedAt: 200,
    });
    mockParams.id = signal.id;
    const lead = await render(<LeadDetail />);
    expect(hrefOf(lead.root, 'lead-evidence-0')).toBeUndefined();
    expect(
      byTestID(lead.root, 'lead-evidence-0').props.accessibilityRole,
    ).not.toBe('link');
    await expect(
      loadMoneyItem({ kind: 'evidence', lead: signal.id, i: '0' }, false),
    ).rejects.toMatchObject({ code: 'not-found' });
    act(() => lead.unmount());
  });
  test.each(['', '-1', '1.5', '01', 'NaN', 'Infinity'])(
    'an invalid evidence index %s cannot form a money item route',
    (i) =>
      expect(
        itemParams({ kind: 'evidence', lead: signals[0]!.id, i }),
      ).toBeNull(),
  );
  test('absent leads and out-of-range evidence fail safely, while refresh preserves source metadata', async () => {
    for (const params of [
      { kind: 'evidence' as const, lead: 'missing', i: '0' },
      { kind: 'evidence' as const, lead: signals[0]!.id, i: '99' },
    ])
      await expect(loadMoneyItem(params, false)).rejects.toMatchObject({
        code: 'not-found',
      });
    mock.discovery.mockResolvedValue({
      data: shown,
      asOf: null,
      stale: true,
      savedAt: 100,
      partial: true,
    });
    expect(
      await loadMoneyItem(
        { kind: 'evidence', lead: signals[0]!.id, i: '0' },
        true,
      ),
    ).toMatchObject({ stale: true, savedAt: 100, partial: true });
    expect(mock.discovery).toHaveBeenLastCalledWith(true, undefined);
  });
  test('a contracts lead: its agency’s page, found in the agency directory by name', async () => {
    mockParams.id = signals[2]!.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    expect(texts(root)).toContain('Lead · Government contracts');
    expect(texts(root)).toContain('Who got the contracts?');
    const agency = agencies.agencies.find(
      (a) => a.name === 'Department of Home Affairs',
    )!;
    expect(hrefOf(root, 'lead-subject')).toEqual(
      agencyRoute(agency.id, agency.name),
    );
    expect(labels(root)).toContain(
      '6.1 billion dollars, in contracts from this agency, started 2009 to 2026',
    );
    expect(byTestID(root, 'lead-chart-row-0').props.accessibilityLabel).toBe(
      'SECURE JOURNEYS PTY LTD, 2.3 billion dollars, 38.7 percent',
    );
    expect(money.agency).toHaveBeenCalledWith(
      agency.id,
      false,
      expect.any(AbortSignal),
    );
    for (let index = 0; index < 5; index++) {
      const row = byTestID(root, `lead-chart-row-${index}`);
      expect(row.props.accessibilityRole).toBe('link');
      expect(
        StyleSheet.flatten(row.props.style).minHeight,
      ).toBeGreaterThanOrEqual(44);
      const supplier = homeProfile.suppliers.find(
        (supplier) =>
          supplier.name.toLowerCase() === texts(row)[0]!.toLowerCase(),
      )!;
      expect(hrefOf(root, `lead-chart-row-${index}`)).toEqual(
        moneyRecordRoute(
          { rid: supplier.id, agency: agency.id },
          supplier.name,
        ),
      );
    }
    const otherHref = agencyListRoute(agency.id, 'suppliers', agency.name);
    expect(hrefOf(root, 'lead-chart-row-5')).toEqual(otherHref);
    const supplierHref = hrefOf(root, 'lead-chart-row-0');
    await press(root, 'lead-table-toggle');
    expect(hrefOf(root, 'lead-chart-cell-0')).toEqual(supplierHref);
    expect(hrefOf(root, 'lead-chart-cell-5')).toEqual(otherHref);
    // A contracts lead has no money-map row.
    expect(has(root, 'lead-money-map')).toBe(false);
    act(() => renderer.unmount());
    // An agency the directory does not hold, or a directory that fails,
    // draws no subject row.
    jest.mocked(money.agencies).mockRejectedValueOnce(new Error('offline'));
    const again = await render(<LeadDetail />);
    expect(has(again.root, 'lead-subject')).toBe(false);
    expect(has(again.root, 'lead-chart')).toBe(true);
    for (let index = 0; index < 6; index++) {
      expect(hrefOf(again.root, `lead-chart-row-${index}`)).toBeUndefined();
      expect(
        byTestID(again.root, `lead-chart-row-${index}`).props.accessibilityRole,
      ).toBeUndefined();
    }
    act(() => again.unmount());
  });
  test('an unavailable supplier profile keeps named rows static and Other opens the agency list', async () => {
    jest.mocked(money.agency).mockRejectedValueOnce(new Error('offline'));
    mockParams.id = signals[2]!.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    expect(hrefOf(root, 'lead-subject')).toEqual(
      agencyRoute(homeAgency.id, homeAgency.name),
    );
    for (let index = 0; index < 5; index++) {
      expect(hrefOf(root, `lead-chart-row-${index}`)).toBeUndefined();
      expect(
        byTestID(root, `lead-chart-row-${index}`).props.accessibilityRole,
      ).toBeUndefined();
    }
    const otherHref = agencyListRoute(
      homeAgency.id,
      'suppliers',
      homeAgency.name,
    );
    expect(hrefOf(root, 'lead-chart-row-5')).toEqual(otherHref);
    await press(root, 'lead-table-toggle');
    expect(hrefOf(root, 'lead-chart-cell-0')).toBeUndefined();
    expect(hrefOf(root, 'lead-chart-cell-5')).toEqual(otherHref);
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('a late supplier profile cannot add the previous agency’s routes to a different lead', async () => {
    let complete!: (record: Awaited<ReturnType<typeof money.agency>>) => void;
    jest.mocked(money.agency).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    mockParams.id = signals[2]!.id;
    const renderer = await render(<LeadDetail />);
    const signal = jest.mocked(money.agency).mock.calls[0]![2]!;
    expect(hrefOf(renderer.root, 'lead-chart-row-5')).toEqual(
      agencyListRoute(homeAgency.id, 'suppliers', homeAgency.name),
    );
    mockParams.id = signals[1]!.id;
    await act(async () =>
      renderer.update(
        withNavigationOptions(<LeadDetail />, (options) => {
          mockOptions = options;
        }),
      ),
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      complete({
        data: { meta: agencies.meta, profile: homeProfile },
        asOf: null,
        stale: false,
        savedAt: 200,
      }),
    );
    expect(hrefOf(renderer.root, 'lead-subject')).toEqual(
      partyRoute('United Australia Party'),
    );
    for (let index = 0; index < 6; index++)
      expect(hrefOf(renderer.root, `lead-chart-row-${index}`)).toBeUndefined();
    act(() => renderer.unmount());
  });
  test.each(['recorded', 'different', 'unavailable'])(
    'the Health suppliers open their records using a checked source alias (%s)',
    async (alias) => {
      const signal = signals.find(
        (signal) =>
          signal.chart?.group_label ===
          'Department of Health, Disability and Ageing',
      )!;
      const agency = agencies.agencies.find(
        (agency) => agency.name === signal.chart!.group_label,
      )!;
      const supplierIds = [
        's-080bce177f3677949a10',
        's-3a526e2d700c22013a71',
        's-4ab45a8e989b36de2112',
        's-8f22c19d3fc22a56c78a',
        's-a5d4868a661a82881512',
      ];
      const suppliers = signal.chart!.participants.map(
        (participant, index) => ({
          id: supplierIds[index]!,
          name: index === 2 ? 'Symbion Pharmacy Services' : participant.name,
          organisation: true,
          total: participant.value,
          count: participant.record_count,
        }),
      );
      const profile = {
        ...homeProfile,
        id: agency.id,
        name: agency.name,
        suppliers,
      };
      jest.mocked(money.agency).mockResolvedValueOnce({
        data: { meta: agencies.meta, profile },
        asOf: null,
        stale: false,
        savedAt: 200,
      });
      if (alias === 'unavailable')
        jest.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
      else
        jest
          .mocked(apiClient.get)
          .mockImplementationOnce(async (_path, decode) => ({
            data: decode({
              profiles: {
                [supplierIds[2]!]: {
                  id: supplierIds[2],
                  aliases: [
                    alias === 'recorded'
                      ? 'SYMBION PTY LTD'
                      : 'Unrelated supplier',
                  ],
                },
              },
            }),
            stale: false,
            asOf: null,
            savedAt: 200,
          }));
      mockParams.id = signal.id;
      const renderer = await render(<LeadDetail />);
      expect(apiClient.get).toHaveBeenLastCalledWith(
        '/suppliers/4a.json',
        decodeLeadSupplierAliases,
        false,
        { signal: expect.any(AbortSignal) },
      );
      for (const [index, supplier] of suppliers.entries()) {
        const href =
          index === 2 && alias !== 'recorded'
            ? undefined
            : moneyRecordRoute(
                { rid: supplier.id, agency: agency.id },
                supplier.name,
              );
        expect(hrefOf(renderer.root, `lead-chart-row-${index}`)).toEqual(href);
      }
      expect(hrefOf(renderer.root, 'lead-chart-row-5')).toEqual(
        agencyListRoute(agency.id, 'suppliers', agency.name),
      );
      expectNoWeb();
      act(() => renderer.unmount());
    },
  );
  test('a named supplier absent from the agency profile remains static', async () => {
    const signal = signals[2]!;
    mock.discovery.mockResolvedValueOnce({
      data: {
        ...shown,
        signals: [
          {
            ...signal,
            chart: {
              ...signal.chart!,
              participants: signal.chart!.participants.map(
                (participant, index) =>
                  index === 0
                    ? { ...participant, name: 'No matching supplier' }
                    : participant,
              ),
            },
          },
        ],
      },
      asOf: null,
      stale: false,
      savedAt: 200,
    });
    mockParams.id = signal.id;
    const renderer = await render(<LeadDetail />);
    expect(hrefOf(renderer.root, 'lead-chart-row-0')).toBeUndefined();
    expect(
      byTestID(renderer.root, 'lead-chart-row-0').props.accessibilityRole,
    ).toBeUndefined();
    expect(hrefOf(renderer.root, 'lead-chart-row-1')).toMatchObject({
      pathname: '/money-record',
      params: { agency: homeAgency.id },
    });
    expectNoWeb();
    act(() => renderer.unmount());
  });
  test('companies in both: two flows side by side, never added, the donor’s money record', async () => {
    rememberMoneyGraph(
      'federal',
      decodeMoneyGraph(pinned('/graph/money.json')),
    );
    mockParams.id = signals[0]!.id;
    const renderer = await render(<LeadDetail />);
    const root = renderer.root;
    expect(texts(root)).toContain('Lead · Companies in both');
    expect(byTestID(root, 'lead-takeaway').props.children).toBe(
      'This name appears in both sets of records.',
    );
    expect(byTestID(root, 'lead-subject').props.accessibilityLabel).toBe(
      'Westpac Banking Corporation, Donor on the money map',
    );
    expect(hrefOf(root, 'lead-subject')).toMatchObject({
      pathname: '/money-record',
      params: { name: 'Westpac Banking Corporation' },
    });
    const tiles = root.findByType(StatStrip).props.tiles as {
      value: string;
      label: string;
      ink?: string;
      testID: string;
    }[];
    expect(tiles).toEqual([
      {
        value: '$77m',
        label: 'in 1,041 party receipts',
        ink: 'money',
        testID: 'lead-flows-receipts',
      },
      {
        value: '$9.1m',
        label: 'in 4 government contracts',
        testID: 'lead-flows-contracts',
      },
    ]);
    expect(byTestID(root, 'lead-flows-caveat').props.children).toBe(
      'Shown beside each other, never added together.',
    );
    // Never one total: $86.1m appears nowhere.
    expect(texts(root).join('\n')).not.toMatch(/\$86/);
    expect(byTestID(root, 'lead-source').props.accessibilityLabel).toBe(
      'Updated 21 Sep 2026, AEC and AusTender',
    );
    await press(root, 'lead-source');
    expect(lastSource().notes).toContain(aboutLede(discovery));
    for (const method of discovery.methodology)
      expect(lastSource().notes).toContain(method);
    // Example records: the receipt without its party code or local row.
    expect(byTestID(root, 'lead-evidence-0').props.accessibilityLabel).toBe(
      'Westpac Banking Corporation to Australian Labor Party, AEC annual receipt · 2024–25, 1,803 dollars',
    );
    expect(texts(root).join('\n')).not.toMatch(/643745|local record|\(ALP\)/);
    expect(has(root, 'lead-chart')).toBe(false);
    expect(has(root, 'lead-money-map')).toBe(false);
    act(() => renderer.unmount());
    // A graph that fails to load draws no donor row, and nothing else moves.
    forgetMoneyGraphs();
    jest.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    const again = await render(<LeadDetail />);
    expect(has(again.root, 'lead-subject')).toBe(false);
    expect(has(again.root, 'lead-takeaway')).toBe(true);
    act(() => again.unmount());
  });
  test('companies in both: with no graph cached, the lead loads it and draws the donor row', async () => {
    forgetMoneyGraphs();
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    }));
    mockParams.id = signals[0]!.id;
    const renderer = await render(<LeadDetail />);
    expect(apiClient.get).toHaveBeenCalledWith(
      '/graph/money.json',
      expect.any(Function),
      false,
      { signal: expect.any(AbortSignal) },
    );
    expect(hrefOf(renderer.root, 'lead-subject')).toMatchObject({
      pathname: '/money-record',
      params: {
        node: expect.stringMatching(/^donor:/),
        name: 'Westpac Banking Corporation',
      },
    });
    act(() => renderer.unmount());
    // A concentration lead never loads the money graph.
    jest.mocked(apiClient.get).mockClear();
    forgetMoneyGraphs();
    mockParams.id = signals[1]!.id;
    const party = await render(<LeadDetail />);
    expect(apiClient.get).not.toHaveBeenCalled();
    act(() => party.unmount());
  });
  test('an ID not in the export says so and offers every lead', async () => {
    mockParams.id = 'procurement_concentration:missing';
    const renderer = await render(<LeadDetail />);
    expect(unavailable(renderer.root, 'lead-missing')).toBe(
      'This lead is no longer listed',
    );
    expect(texts(renderer.root)).toContain('See all leads');
    await press(renderer.root, 'lead-missing-retry');
    expect(router.navigate).toHaveBeenCalledWith(leadsRoute);
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
  // people.md 2.7: the bar's search field and filter sheet; a footnote
  // line says what is on.
  const search = async (text: string) => {
    const bar = mockScreen.options!.headerSearchBarOptions as {
      onSearchButtonPress: (e: { nativeEvent: { text: string } }) => void;
    };
    await act(async () => bar.onSearchButtonPress({ nativeEvent: { text } }));
  };
  const filterLine = (root: ReactTestInstance) =>
    root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.testID === 'declarations-filter-line',
      )
      .map((n) => [n.props.children].flat(3).join(''));
  test('the screen filters by chamber and a row opens the member’s native profile', async () => {
    const renderer = await render(<Declarations />);
    const root = renderer.root;
    // Nothing above the first row while nothing is filtered.
    expect(filterLine(root)).toHaveLength(0);
    expect(texts(root)).toContain('300 changes');
    const store = filterStore('declarations')!;
    // A single jurisdiction is named, not offered.
    expect(store.model.rows.map((row) => row.title)).toEqual(['Chamber']);
    await act(async () => store.set({ ...store.get(), chamber: 'house' }));
    expect(filterLine(root)).toEqual([
      'House of Representatives · 176 changes',
    ]);
    await search('Briskey');
    expect(filterLine(root)).toEqual(['House of Representatives · 3 changes']);
    // The category alone; the PersonRow's place says the chamber.
    expect(byTestID(root, 'declaration-change-0').props.children).toMatch(
      /^[A-Z][^·]+$/,
    );
    await press(root, 'declaration-person-0');
    expect(router.push).toHaveBeenCalledWith(personRoute('jo-briskey'));
    // The name match is one short line; the caveat is in the sheet.
    await search('Susan McDonald');
    await act(async () => store.set(store.model.initial));
    expect(texts(root)).toContain(
      'Same name as an AEC donor: Adani Mining Pty Ltd',
    );
    expect(texts(root).some((t) => t.includes('wrongdoing'))).toBe(false);
    // An entry opens its own sheet: the register page, dated.
    // The entry is a RowLink whose tap selects (Link handles it on iOS).
    const entry = root
      .findAllByType(RowLink)
      .find(
        (link) =>
          link.findAll((n) => n.props.testID === 'declaration-entry-0').length,
      )!;
    await act(async () => entry.props.select());
    expect(lastSource().originals![0]!.label).toBe(
      'Register of Senators’ Interests',
    );
    expect(lastSource().notes!.join(' ')).toContain(
      'not evidence of wrongdoing',
    );
    // The export's coverage note is in its one source line's sheet.
    await press(root, 'declarations-source');
    expect(lastSource().notes).toContain(
      'Showing the newest 300 of 1,660 dated register changes.',
    );
    await act(async () => store.set(store.model.initial));
    act(() => renderer.unmount());
  });
  test('nothing matching offers to clear the filters', async () => {
    const renderer = await render(<Declarations />);
    const root = renderer.root;
    await search('Nobody');
    const empty = root.findByType(ContentUnavailable);
    expect(empty.props.title).toBe('No results');
    expect(empty.props.body).toBe('No declaration matches “Nobody”.');
    await act(async () => empty.props.action.onPress());
    expect(filterLine(root)).toHaveLength(0);
    expect(texts(root)).toContain('300 changes');
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
  // Both are links now (w5-today): where tapping them goes.
  expect(hrefOf(renderer.root, 'today-leads-open')).toEqual(leadsRoute);
  expect(hrefOf(renderer.root, 'today-declarations-all')).toEqual(
    declarationsRoute,
  );
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
      expect(mock[loader]).toHaveBeenLastCalledWith(
        false,
        expect.any(AbortSignal),
      );
      await pull(renderer.root);
      expect(mock[loader]).toHaveBeenCalledTimes(2);
      expect(mock[loader]).toHaveBeenLastCalledWith(
        true,
        expect.any(AbortSignal),
      );
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
