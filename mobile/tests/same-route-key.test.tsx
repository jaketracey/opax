import { act, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import MoneyRecordRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/money-record';
import PartyRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/party/[slug]';
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

test('the key is the Back guard identity and refuses a path that is not a record route', () => {
  expect(recordKey('party/[slug]', { slug: 'labor' })).toBe(
    recordKey('party/[slug]', { slug: 'labor', name: 'Labor' }),
  );
  expect(recordKey('money-record', { node: 'party:Labor' })).not.toBe(
    recordKey('money-record', { node: 'party:Liberal' }),
  );
  expect(() => recordKey('not-a-route', {})).toThrow(/not a record route/);
});
