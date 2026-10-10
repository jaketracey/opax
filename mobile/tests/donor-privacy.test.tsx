import { act } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { apiClient, catalogs as runtime } from '../src/api/runtime';
import {
  Catalogs,
  decodeRecentInterests,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { decodeInterest, decodeDiscovery } from '../src/api/catalog-decoders';
import { decodeAccess } from '../src/features/people/model';
import MoneyScreen from '../src/features/money/MoneyScreen';
import MoneyNodeScreen from '../src/features/money/MoneyNodeScreen';
import { NativeMoneyMap } from '../src/features/money/NativeMoneyMap';
import {
  decodeMoneyGraph,
  moneyCatalogs,
  type MoneyJurisdiction,
} from '../src/features/money/data';
import { PartyPage } from '../src/features/Party';
import { FeedRow } from '../src/features/declarations/FeedRow';
import { leadsFor } from '../src/features/leads/model';
import { publicDiscovery } from '../src/features/money-public/discovery';
import { isOrganisation } from '../src/features/money-public/privacy';
import { LeadCard } from '../src/design/primitives';
import {
  donorNotNamed,
  isOrganisationDonor,
  publicTie,
} from '../src/privacy/donorEntity';
import quiz from '../src/features/explore/quiz-rounds.json';
import snapshot from '../scripts/fixture-snapshot.json';
import { catalogs, people, pinned, roster, slugs } from './pinned';

// Every donor the pinned exports hold without organisation evidence is derived
// here at run time; no name is typed into this file. A rendered screen, its
// accessibility labels and every string prop must hold none of them.

jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn() },
  catalogs: { partyPage: jest.fn(), followSources: jest.fn() },
  peopleDepth: {
    access: jest.fn(),
    funding: jest.fn(),
    mentions: jest.fn(),
    news: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('../src/features/money/NativeMoneyMap', () => ({
  NativeMoneyMap: jest.fn(() => null),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const value: Record<string, unknown> = {};
    for (const name of [
      'runOnJS',
      'activeOffsetX',
      'failOffsetY',
      'onBegin',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ])
      value[name] = () => value;
    return value;
  };
  return {
    GestureHandlerRootView: jest.requireActual('react-native').View,
    GestureDetector: jest.requireActual('react-native').View,
    Gesture: { Pan: chain, Tap: chain, Race: chain },
  };
});
const mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  useSegments: () => [],
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type RawNode = {
  id: string;
  label: string;
  kind: string;
  aliases?: string[];
  industry?: string;
};
type RawGraph = { nodes: RawNode[] };
const phrase = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const rawGraphs = Object.fromEntries(
  (Object.keys(moneyCatalogs) as MoneyJurisdiction[]).map((j) => [
    j,
    pinned(moneyCatalogs[j].path) as RawGraph,
  ]),
) as Record<MoneyJurisdiction, RawGraph>;
const namesOf = (n: { label: string; aliases?: string[] }) => [
  n.label,
  ...(n.aliases ?? []),
];
const allDonors = Object.values(rawGraphs).flatMap((g) =>
  g.nodes.filter((n) => n.kind === 'donor'),
);
// As the web's donorPrivacyIndex and withheldPhrases: a name any graph vouches for
// as an organisation, an office holder's name and a party's name are not a withheld donor's.
const organisations = new Set(
  allDonors.filter(isOrganisationDonor).flatMap(namesOf).map(phrase),
);
const officeHolders = new Set(
  [
    ...roster.people.map((p) => p.name),
    ...people.people.flatMap((p) => [p.name, ...p.aliases]),
    ...Object.values(slugs.slugs),
  ].map(phrase),
);
const parties = Object.values(rawGraphs).flatMap((g) =>
  g.nodes.filter((n) => n.kind !== 'donor').flatMap(namesOf),
);
const exempt = [...organisations, ...parties.map(phrase)]
  .filter((p) => p.length > 1)
  .sort((a, b) => b.length - a.length);
function withheldPhrases(names: string[]) {
  const out = new Set<string>();
  for (const name of names) {
    const inverted = /^([^,]+),\s*([^,]+)$/.exec(name);
    for (const p of [
      name,
      ...(inverted ? [`${inverted[2]} ${inverted[1]}`] : []),
    ].map(phrase))
      if (p.length > 2 && !organisations.has(p) && !officeHolders.has(p))
        out.add(p);
  }
  return [...out];
}
const withheldDonors = Object.fromEntries(
  (Object.keys(rawGraphs) as MoneyJurisdiction[]).map((j) => [
    j,
    rawGraphs[j].nodes.filter(
      (n) => n.kind === 'donor' && !isOrganisationDonor(n),
    ),
  ]),
) as Record<MoneyJurisdiction, RawNode[]>;
const moneyNames = withheldPhrases(
  Object.values(withheldDonors).flat().flatMap(namesOf),
);

// Node ids are keys, never drawn; a withheld donor's id is anonymised at decode.
const nodeId = /^(?:donor|party|grantor|agency|supplier):/;
// A short string with organisation evidence is an organisation's own name
// ("<name> Pty Ltd"), as the web excuses a name inside a longer organisation's.
const organisationName = (s: string) =>
  s.trim().split(/\s+/).length <= 8 && isOrganisationDonor({ label: s });
/** Every string a screen can show or speak: text children and string props, nested. */
function shownStrings(root: ReactTestInstance) {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (typeof v === 'string') {
      if (!nodeId.test(v) && !organisationName(v)) out.push(v);
    } else if (depth > 0 && Array.isArray(v))
      v.forEach((x) => visit(x, depth - 1));
    else if (depth > 0 && v && typeof v === 'object' && !('$$typeof' in v))
      Object.values(v).forEach((x) => visit(x, depth - 1));
  };
  for (const node of root.findAll(() => true))
    for (const [key, value] of Object.entries(node.props))
      if (key !== 'testID' && key !== 'ref' && typeof value !== 'function')
        visit(value, 6);
  return out;
}
/** The withheld phrases found in the texts, once organisations' and parties' own names are taken out. */
function leaks(texts: string[], names: string[]) {
  let text = ` ${texts.map(phrase).join(' | ')} `;
  for (const p of exempt) text = text.split(` ${p} `).join(' # ');
  return names.filter((p) => text.includes(` ${p} `)).length;
}

jest.setTimeout(120_000);
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
let answerReader: (value: boolean) => void = () => undefined;
const decoded = new Map<string, unknown>();
beforeEach(() => {
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockImplementation(
      () => new Promise((resolve) => (answerReader = resolve)),
    );
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(() => ({ remove: () => undefined }) as never);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => {
    if (!decoded.has(path)) decoded.set(path, decode(pinned(path)));
    return {
      data: decoded.get(path),
      stale: false,
      asOf: '2026-09-21',
      savedAt: 1,
    } as never;
  });
});

test('the fixtures hold withheld donors to test against', () => {
  for (const j of Object.keys(withheldDonors) as MoneyJurisdiction[])
    expect([j, withheldDonors[j].length > 0]).toEqual([j, true]);
  expect(moneyNames.length).toBeGreaterThan(300);
});

describe.each(Object.keys(moneyCatalogs) as MoneyJurisdiction[])(
  'the %s money map',
  (jurisdiction) => {
    test('the ranked list and the 3D map name no withheld donor and fold them into counted aggregates', async () => {
      mockParams.jurisdiction = jurisdiction;
      const r = await render(<MoneyScreen />);
      const list = r.root.findByProps({ testID: 'money-screen' });
      const rows = list.props.data as {
        id: string;
        label: string;
        withheldCount?: number;
      }[];
      const aggregates = rows.filter((n) => n.withheldCount);
      expect(aggregates.reduce((n, a) => n + a.withheldCount!, 0)).toBe(
        withheldDonors[jurisdiction].length,
      );
      const texts = shownStrings(r.root);
      for (const [index, item] of rows.entries()) {
        const row = await render(list.props.renderItem({ item, index }));
        texts.push(...shownStrings(row.root));
        if (item.withheldCount)
          expect(shownStrings(row.root).join(' ')).not.toMatch(/^\d+\. /);
        act(() => row.unmount());
      }
      expect(texts.join('\n')).toMatch(/Individual donors \(\d+\)/);
      expect(leaks(texts, moneyNames)).toBe(0);
      // The 3D map: every prop handed to the native scene.
      await act(async () => answerReader(false));
      const scene = jest.mocked(NativeMoneyMap).mock.calls.at(-1)?.[0];
      expect(scene).toBeDefined();
      const sceneText: string[] = [];
      const visit = (v: unknown, depth: number) => {
        if (typeof v === 'string') {
          if (!nodeId.test(v) && !organisationName(v)) sceneText.push(v);
        } else if (depth > 0 && v && typeof v === 'object')
          Object.values(v).forEach((x) => visit(x, depth - 1));
      };
      visit(scene, 6);
      expect(sceneText.length).toBeGreaterThan(0);
      expect(leaks(sceneText, moneyNames)).toBe(0);
      act(() => r.unmount());
    });

    test('every party, public-money and aggregate record names no withheld donor', async () => {
      const graph = decodeMoneyGraph(pinned(moneyCatalogs[jurisdiction].path));
      const targets = graph.nodes.filter(
        (n) => n.kind !== 'donor' || n.withheld,
      );
      expect(targets.some((n) => n.withheld)).toBe(true);
      for (const node of targets) {
        Object.assign(mockParams, { jurisdiction, node: node.id });
        const r = await render(<MoneyNodeScreen />);
        const texts = shownStrings(r.root);
        expect([node.id, leaks(texts, moneyNames)]).toEqual([node.id, 0]);
        if (node.withheld) {
          expect(texts).toContain(node.label);
          expect(
            r.root.findAll((n) => n.props.testID === 'money-web-profile'),
          ).toHaveLength(0);
        }
        act(() => r.unmount());
      }
    });

    test('a deep link to a withheld donor resolves to the neutral record, with no name', async () => {
      for (const donor of withheldDonors[jurisdiction]) {
        Object.assign(mockParams, { jurisdiction, node: donor.id });
        const r = await render(<MoneyNodeScreen />);
        const texts = shownStrings(r.root);
        expect([donor.id.length, texts.includes(donorNotNamed)]).toEqual([
          donor.id.length,
          true,
        ]);
        expect(leaks(texts, withheldPhrases(namesOf(donor)))).toBe(0);
        act(() => r.unmount());
      }
    });
  },
);

test('every federal party page, with its donors by year open, names no withheld donor', async () => {
  const cache = new Map<string, unknown>();
  const api = new Catalogs({
    get: async (path, decoder) => ({
      data: (cache.get(path) ??
        cache
          .set(
            path,
            decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
          )
          .get(path)) as never,
      stale: false,
      savedAt: 1000,
      asOf: null,
    }),
  } as never);
  const { peopleDepth } = jest.requireMock('../src/api/runtime');
  jest.mocked(peopleDepth.access).mockResolvedValue({
    data: decodeAccess(pinned('/access.json')),
    stale: false,
    savedAt: 1,
    asOf: null,
  });
  jest.mocked(peopleDepth.funding).mockRejectedValue(new Error('offline'));
  const labels = rawGraphs.federal.nodes
    .filter((n) => n.kind === 'party' && !('via' in n))
    .map((n) => n.label);
  expect(labels.length).toBeGreaterThan(5);
  let aggregated = 0;
  for (const label of labels) {
    const view = await api.partyPage(label);
    jest.mocked(runtime.partyPage).mockResolvedValue(view);
    const r = await render(<PartyPage input={label} />);
    const toggle = r.root.findAll(
      (n) =>
        n.props.testID === 'party-donor-years-toggle' &&
        typeof n.props.onToggle === 'function',
    );
    if (toggle[0]) await act(async () => toggle[0]!.props.onToggle(true));
    // The receipts block holds the donors ("Where it came from", by year);
    // meetings, lobbyists and returns elsewhere on the page are not donor lists.
    const texts = shownStrings(
      r.root.findByProps({ testID: 'party-receipts' }),
    );
    if (texts.some((t) => /^Individual donors \(\d+\)/.test(t))) aggregated++;
    expect([label, leaks(texts, moneyNames)]).toEqual([label, 0]);
    act(() => r.unmount());
  }
  expect(aggregated).toBeGreaterThan(0);
});

test('register ties never name a withheld donor, in a member’s register or the declarations feed', async () => {
  const files = Object.keys(snapshot.files).filter(
    (p) =>
      /^\/interests\/[^/]+\.json$/.test(p) &&
      !/(index|recent|ties-by-donor)\.json$/.test(p),
  );
  const raw = [
    ...files.flatMap(
      (p) =>
        (
          pinned(p) as {
            ties?: { organisation: string; kind: string; kinds: string[] }[];
          }
        ).ties ?? [],
    ),
    ...(
      pinned('/interests/recent.json') as {
        items: {
          ties?: { organisation: string; kind: string; kinds: string[] }[];
        }[];
      }
    ).items.flatMap((i) => i.ties ?? []),
  ];
  const names = withheldPhrases(
    raw.filter((t) => !publicTie(t)).map((t) => t.organisation),
  );
  expect(names.length).toBeGreaterThan(0);
  const texts = files.flatMap((p) =>
    (decodeInterest(pinned(p)).ties ?? []).map((t) => t.organisation),
  );
  const recent = decodeRecentInterests(pinned('/interests/recent.json'));
  for (const [index, item] of recentDeclarationsFor(
    recent,
    300,
    catalogs,
  ).data!.entries()) {
    const r = await render(<FeedRow item={item} index={index} />);
    // The name-match line; the member's own declaration text is the register's.
    for (const ties of r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.testID === `declaration-ties-${index}`,
    ))
      texts.push(...shownStrings(ties));
    act(() => r.unmount());
  }
  expect(leaks(texts, names)).toBe(0);
});

test('leads name no withheld donor and drop a "companies in both" lead about one', async () => {
  const discovery = decodeDiscovery(pinned('/discovery.json'));
  const donorNames = discovery.signals.flatMap((s) =>
    s.category === 'procurement_concentration'
      ? []
      : [s.entity, ...(s.chart?.participants.map((p) => p.name) ?? [])].filter(
          (n) =>
            !isOrganisationDonor({ label: n }) ||
            (s.category === 'donor_contract_overlap' && !isOrganisation(n)),
        ),
  );
  const names = withheldPhrases(donorNames);
  expect(names.length).toBeGreaterThan(0);
  const shown = publicDiscovery(discovery);
  expect(shown.withheld).toBeGreaterThan(0);
  const texts: string[] = [];
  for (const lead of leadsFor(shown)) {
    const r = await render(
      <LeadCard
        lead={lead}
        category={lead.categoryLabel}
        asAt={{ asOf: '2026-09-21', citation: lead.citation }}
        testID="card"
      />,
    );
    texts.push(...shownStrings(r.root));
    act(() => r.unmount());
  }
  expect(leaks(texts, names)).toBe(0);
});

test('the bundled quiz names no withheld donor', () => {
  expect(
    leaks(
      [JSON.stringify(quiz.rounds)],
      withheldPhrases(withheldDonors.federal.flatMap(namesOf)),
    ),
  ).toBe(0);
});
