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
import Connections from '../src/features/money-public/Connections';
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { discovery: jest.fn() } }));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
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
});
test.each([
  ['Public money', Hub, {}],
  ['Grants', Grants, { jur: 'federal' }],
  ['Program', Program, { jur: 'federal', id: 'GO3141' }],
  ['Largest', Largest, {}],
  ['Agencies', Agencies, {}],
  ['Agency', Agency, { id: 'a-7431f054588d4251c0b4' }],
  ['Discover', Discover, {}],
  ['Allocation', Allocation, {}],
  ['Programs & places', Connections, {}],
] as const)(
  '%s mounts with only static catalog calls and no paid request',
  async (_name, Screen, params) => {
    Object.assign(mockParams, params);
    let rendered: TestRenderer.ReactTestRenderer;
    await act(async () => {
      rendered = TestRenderer.create(<Screen />);
      await Promise.resolve();
    });
    expect(calls.every((path) => !path.startsWith('/api/'))).toBe(true);
    expect(rendered!.toJSON()).not.toBeNull();
    await act(async () => rendered!.unmount());
  },
);
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
  let rendered: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Program />);
    await Promise.resolve();
  });
  const drawn = rendered!.root
    .findAll(() => true)
    .flatMap((n) =>
      [
        n.props.accessibilityLabel,
        ...(Array.isArray(n.props.children)
          ? n.props.children
          : [n.props.children]),
      ].filter((v) => typeof v === 'string'),
    )
    .join(' ');
  expect(drawn).not.toContain('Ada Privacy Example');
  expect(drawn).toContain('Individual recipient (not named in the app)');
  await act(async () => rendered!.unmount());
});
