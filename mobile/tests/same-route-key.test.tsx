import { act, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import AgencyRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/agency';
import BillRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/bill/[key]';
import ConnectionRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/connection';
import DocumentRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/doc/[slug]';
import LeadRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/lead/[id]';
import MoneyItemRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/money-item';
import MoneyRecordRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/money-record';
import PartyRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/party/[slug]';
import PersonRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/person/[slug]';
import { recordKey } from '../src/navigation/record-link';

// Sweep 2, item 11: a link to another money record or party while one shows
// reuses the route's screen with new params (seen on the device: the Labor
// record opened at the Westpac record's foot). The route keys its screen on
// the record, so a new record mounts fresh and starts at its own top.

let mockParams: Record<string, string> = {};
const mockMounts: string[] = [];

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-router/react-navigation', () => ({
  NavigationContext: jest.requireActual('react').createContext(undefined),
}));

function mockProbe(name: string) {
  return function Probe() {
    useEffect(() => {
      mockMounts.push(`${name} ${JSON.stringify(mockParams)}`);
    }, []);
    return null;
  };
}
jest.mock('../src/features/money/MoneyRecord', () => ({
  __esModule: true,
  default: mockProbe('money'),
}));
jest.mock('../src/features/Party', () => ({
  __esModule: true,
  default: mockProbe('party'),
}));
jest.mock('../src/features/Person', () => ({
  __esModule: true,
  default: mockProbe('person'),
}));
jest.mock('../src/features/bills/BillDetail', () => ({
  __esModule: true,
  default: mockProbe('bill'),
}));
jest.mock('../src/features/money-public/MoneyItem', () => ({
  __esModule: true,
  default: mockProbe('money-item'),
}));
jest.mock('../src/features/money-public/Agencies', () => ({
  __esModule: true,
  Agency: mockProbe('agency'),
}));
jest.mock('../src/features/money-public/Connection', () => ({
  __esModule: true,
  default: mockProbe('connection'),
}));
jest.mock('../src/features/leads/LeadDetail', () => ({
  __esModule: true,
  default: mockProbe('lead'),
}));
jest.mock('../src/features/records/DocumentReader', () => ({
  __esModule: true,
  default: mockProbe('doc'),
}));

beforeEach(() => {
  mockMounts.length = 0;
});

async function show(Route: () => React.JSX.Element) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(<Route />);
  });
  return {
    to: async (params: Record<string, string>) => {
      mockParams = params;
      await act(async () => r.update(<Route />));
    },
    unmount: () => act(() => r.unmount()),
  };
}

test('a link to another money record mounts it fresh; the same record keeps its screen', async () => {
  mockParams = { node: 'donor:westpac banking corporation' };
  const page = await show(MoneyRecordRoute);
  // A label or presentation hint is not a different record.
  await page.to({
    node: 'donor:westpac banking corporation',
    name: 'Westpac',
  });
  // The jurisdiction default is the same record spelled out.
  await page.to({
    node: 'donor:westpac banking corporation',
    jurisdiction: 'federal',
  });
  expect(mockMounts).toHaveLength(1);
  await page.to({ node: 'party:Labor' });
  expect(mockMounts).toEqual([
    'money {"node":"donor:westpac banking corporation"}',
    'money {"node":"party:Labor"}',
  ]);
  page.unmount();
});

test('a link to another party mounts its own page, so no title carries over', async () => {
  mockParams = { slug: 'libertarian-party' };
  const page = await show(PartyRoute);
  await page.to({ slug: 'libertarian-party', name: 'Libertarian' });
  expect(mockMounts).toHaveLength(1);
  await page.to({ slug: 'opax-fixture-unresolved' });
  expect(mockMounts).toEqual([
    'party {"slug":"libertarian-party"}',
    'party {"slug":"opax-fixture-unresolved"}',
  ]);
  page.unmount();
});

// The other record routes key their screens the same way (backlog 4j). Each
// case opens a record, follows links that name the same record (a label, an
// arrival hint, a default spelled out), then a link to another record of the
// same route. Only that last link mounts a new screen, which draws its own
// scroll view at the top instead of keeping the previous record's offset.
type SameRouteCase = {
  probe: string;
  Route: () => React.JSX.Element;
  first: Record<string, string>;
  same: Record<string, string>[];
  next: Record<string, string>;
};
const sameRouteCases: [string, SameRouteCase][] = [
  [
    'person',
    {
      probe: 'person',
      Route: PersonRoute,
      first: { slug: 'penny-wong' },
      same: [
        { slug: 'penny-wong', name: 'Penny Wong' },
        { slug: 'penny-wong', section: 'votes' },
      ],
      next: { slug: 'anthony-albanese' },
    },
  ],
  [
    'bill',
    {
      probe: 'bill',
      Route: BillRoute,
      first: { key: 'r7001' },
      same: [{ key: 'r7001', name: 'Fixture Bill 2026', section: 'votes' }],
      next: { key: 'r7002' },
    },
  ],
  [
    'money item',
    {
      probe: 'money-item',
      Route: MoneyItemRoute,
      first: { kind: 'grant', program: 'fixture-program', id: 'grant-1' },
      same: [
        {
          kind: 'grant',
          program: 'fixture-program',
          id: 'grant-1',
          jur: 'federal',
        },
        {
          kind: 'grant',
          program: 'fixture-program',
          id: 'grant-1',
          from: 'program',
        },
      ],
      next: { kind: 'grant', program: 'fixture-program', id: 'grant-2' },
    },
  ],
  [
    'agency',
    {
      probe: 'agency',
      Route: AgencyRoute,
      first: { id: 'fixture-agency' },
      same: [{ id: 'fixture-agency', name: 'Fixture Agency' }],
      next: { id: 'other-agency' },
    },
  ],
  [
    'connection',
    {
      probe: 'connection',
      Route: ConnectionRoute,
      first: { id: 'fixture-connection' },
      same: [{ id: 'fixture-connection', name: 'Fixture connection' }],
      next: { id: 'other-connection' },
    },
  ],
  [
    'lead',
    {
      probe: 'lead',
      Route: LeadRoute,
      first: { id: 'lead-1' },
      same: [{ id: 'lead-1', name: 'Fixture lead' }],
      next: { id: 'lead-2' },
    },
  ],
  [
    'document',
    {
      probe: 'doc',
      Route: DocumentRoute,
      // Clearing cite with setParams is the same record: the reader stays.
      first: { slug: 'speech-100', cite: '1' },
      same: [
        { slug: 'speech-100' },
        { slug: 'speech-100', q: 'housing', match: '2' },
      ],
      next: { slug: 'speech-200' },
    },
  ],
];

test.each(sameRouteCases)(
  'a link to another %s mounts it fresh at its own top; the same one keeps its screen',
  async (_kind, { probe, Route, first, same, next }) => {
    mockParams = first;
    const page = await show(Route);
    for (const params of same) await page.to(params);
    expect(mockMounts).toEqual([`${probe} ${JSON.stringify(first)}`]);
    await page.to(next);
    expect(mockMounts).toEqual([
      `${probe} ${JSON.stringify(first)}`,
      `${probe} ${JSON.stringify(next)}`,
    ]);
    page.unmount();
  },
);

test('the key is the Back guard identity and refuses a path that is not a record route', () => {
  expect(recordKey('party/[slug]', { slug: 'labor' })).toBe(
    recordKey('party/[slug]', { slug: 'labor', name: 'Labor' }),
  );
  expect(recordKey('money-record', { node: 'party:Labor' })).not.toBe(
    recordKey('money-record', { node: 'party:Liberal' }),
  );
  expect(() => recordKey('not-a-route', {})).toThrow(/not a record route/);
});
