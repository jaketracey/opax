import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { assertAllowedPath } from '../src/api/policy';
import { decodeDiscovery } from '../src/api/catalog-decoders';
import { catalogs } from '../src/api/runtime';
import { money } from '../src/features/money-public/runtime';
import Hub from '../src/features/money-public/Hub';
import Grants from '../src/features/money-public/Grants';
import Program from '../src/features/money-public/Program';
import Largest from '../src/features/money-public/Largest';
import Agencies, { Agency } from '../src/features/money-public/Agencies';
import Discover from '../src/features/money-public/Discover';
import Allocation from '../src/features/money-public/Allocation';
import FundingBySeatType from '../src/features/money-public/FundingBySeatType';
import Connections from '../src/features/money-public/Connections';
import Connection from '../src/features/money-public/Connection';
import MoneyItem from '../src/features/money-public/MoneyItem';
import { unnamedRecipient } from '../src/features/money-public/privacy';

const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const Wrap = (props: object) => React.createElement(View, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    Redirect: () => null,
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { discovery: jest.fn(), directory: jest.fn() },
  apiClient: { get: jest.fn() },
}));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
const raw = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public' + path), 'utf8'),
  );
const calls: string[] = [];
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (v: unknown) => T,
  ): Promise<RecordResult<T>> {
    assertAllowedPath(path);
    calls.push(path);
    return { data: decode(raw(path)), stale: false, savedAt: 10, asOf: null };
  },
};
const fixture = new MoneyCatalogs(client);
const runtime = jest.requireMock('../src/api/runtime');
beforeEach(() => {
  calls.length = 0;
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
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
  (catalogs.directory as jest.Mock).mockRejectedValue(new Error('offline'));
  runtime.apiClient.get.mockImplementation(client.get);
});

const agencyId = 'a-7431f054588d4251c0b4';
const connectionId = () =>
  (raw('/evidence/index.json').entities as { id: string }[])[0]!.id;
const program = raw('/grants/federal/programs/go3141.json');

async function mount(Screen: () => React.ReactElement | null) {
  let rendered!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Screen />);
  });
  // Let chained catalog reads settle.
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  return rendered;
}
const ids = (r: TestRenderer.ReactTestRenderer) =>
  new Set(
    r.root
      .findAll((n) => typeof n.props.testID === 'string')
      .map((n) => n.props.testID as string),
  );

test.each([
  ['Public money', Hub, {}, 'money-hub-title'],
  ['Grants', Grants, { jur: 'federal' }, 'grants-total'],
  ['Program', Program, { jur: 'federal', id: 'GO3141' }, 'program-title'],
  ['Largest', Largest, {}, 'largest-title'],
  ['Agencies', Agencies, {}, 'agencies-total'],
  ['Agency', Agency, { id: agencyId }, 'agency-total'],
  ['Discover', Discover, {}, null],
  ['Community funding', Allocation, {}, 'allocation-figure'],
  ['Funding by seat type', FundingBySeatType, {}, 'seat-type-0'],
  ['Programs and places', Connections, {}, 'connections-caption'],
  [
    'Connection',
    Connection,
    () => ({ id: connectionId() }),
    'connection-title',
  ],
  [
    'Money item',
    MoneyItem,
    () => ({
      kind: 'grant',
      jur: 'federal',
      program: program.key,
      id: program.grants[0].id,
    }),
    'money-item-title',
  ],
] as const)(
  '%s mounts with only static catalog calls and no paid request',
  async (_name, Screen, params, loaded) => {
    Object.assign(mockParams, typeof params === 'function' ? params() : params);
    const rendered = await mount(Screen as () => React.ReactElement);
    expect(calls.every((path) => !path.startsWith('/api/'))).toBe(true);
    expect(rendered.toJSON()).not.toBeNull();
    if (loaded) expect(ids(rendered)).toContain(loaded);
    await act(async () => rendered.unmount());
  },
);

test('a money item that is no longer in the data says so', async () => {
  Object.assign(mockParams, { kind: 'contract', agency: agencyId, id: 'CN0' });
  const rendered = await mount(MoneyItem);
  expect(ids(rendered)).toContain('money-item-missing');
  await act(async () => rendered.unmount());
});

test('private recipient names are absent from visible and accessibility props', async () => {
  Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
  const privateClient: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (v: unknown) => T,
    ): Promise<RecordResult<T>> {
      const input = raw(path);
      if (path.includes('/programs/'))
        input.grants[0] = {
          ...input.grants[0],
          rn: 'Ada Privacy Example',
          k: 'individual',
          rid: 'person:ada',
          n: 'Grant for Ada Privacy Example',
        };
      return { data: decode(input), stale: false, savedAt: 10, asOf: null };
    },
  };
  const catalog = new MoneyCatalogs(privateClient);
  money.program = catalog.program.bind(catalog);
  const rendered = await mount(Program);
  const drawn = rendered.root
    .findAll(() => true)
    .flatMap((n) =>
      [
        n.props.accessibilityLabel,
        n.props.name,
        n.props.title,
        ...(Array.isArray(n.props.children)
          ? n.props.children
          : [n.props.children]),
      ].filter((v) => typeof v === 'string'),
    )
    .join(' ');
  expect(drawn).not.toContain('Ada Privacy Example');
  // Recipients lists organisations; individuals are a footnote, unnamed.
  expect(drawn).not.toContain(unnamedRecipient);
  expect(drawn).toMatch(
    /1 grant to individual recipients, \$[\d,]+, not named\./,
  );
  await act(async () => rendered.unmount());
});
