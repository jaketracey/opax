import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { decodeDiscovery } from '../src/api/catalog-decoders';
import { money } from '../src/features/money-public/runtime';
import { SegmentedPicker } from '../src/design/controls';
import { LinkRow, MoneyRow } from '../src/design/rows';
import { Card } from '../src/design/card';
import Hub from '../src/features/money-public/Hub';
import Grants from '../src/features/money-public/Grants';
import Program from '../src/features/money-public/Program';
import Largest from '../src/features/money-public/Largest';
import Agencies, { Agency } from '../src/features/money-public/Agencies';
import Allocation from '../src/features/money-public/Allocation';
import Connections from '../src/features/money-public/Connections';
import MoneyItem, {
  loadMoneyItem,
} from '../src/features/money-public/MoneyItem';

// journeys/money.md 4.10 and DIRECTION 4.10: every money row opens a native
// page (chevron) or its original (external glyph). No row is inert, no list
// ends on "End of record", and nothing opens the website early.
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
  useSeat: () => ({ status: 'chosen', choice: { seatId: 'seat-1' } }),
  savedSeatDirectory: () => ({
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: 'seat-1',
            name: 'Grayndler',
            state_code: 'NSW',
            jurisdiction: 'federal',
            chamber: 'representatives',
          },
        ],
      },
    },
  }),
}));
const raw = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public' + path), 'utf8'),
  );
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (v: unknown) => T,
  ): Promise<RecordResult<T>> {
    return { data: decode(raw(path)), stale: false, savedAt: 10, asOf: null };
  },
};
const fixture = new MoneyCatalogs(client);
beforeEach(() => {
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
  const runtime = jest.requireMock('../src/api/runtime');
  runtime.catalogs.discovery.mockImplementation(() =>
    client.get('/discovery.json', decodeDiscovery),
  );
  runtime.catalogs.directory.mockRejectedValue(new Error('offline'));
  runtime.apiClient.get.mockImplementation(client.get);
});
async function render(Screen: () => React.ReactNode) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Screen />);
  });
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
  return r;
}
/** Every row on the screen goes somewhere: a native page or its original. */
function expectNoDeadEnds(root: ReactTestInstance, label: string) {
  const money = root.findAllByType(MoneyRow);
  for (const row of money)
    expect([
      label,
      row.props.name,
      !!(row.props.href || row.props.external),
    ]).toEqual([label, row.props.name, true]);
  for (const row of root.findAllByType(LinkRow))
    expect([
      label,
      row.props.title,
      !!(row.props.href || row.props.onPress || row.props.external),
    ]).toEqual([label, row.props.title, true]);
  const text = root
    .findAll((n) => typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
  expect(text).not.toContain('End of record');
  return money.length;
}
async function eachSegment(
  r: TestRenderer.ReactTestRenderer,
  label: string,
  check: (segment: string) => void = () => undefined,
) {
  const picker = r.root.findAllByType(SegmentedPicker)[0];
  const values: string[] = picker
    ? picker.props.options.map((o: { value: string }) => o.value)
    : [''];
  for (const value of values) {
    if (picker)
      await act(async () =>
        r.root.findAllByType(SegmentedPicker)[0]!.props.onChange(value),
      );
    const rows = expectNoDeadEnds(r.root, `${label} ${value}`);
    // Years is a chart, not rows.
    if (value !== 'years')
      expect([label, value, rows > 0]).toEqual([label, value, true]);
    check(value);
  }
}

const agency = 'a-7431f054588d4251c0b4';
const program = raw('/grants/federal/programs/go3141.json');
test.each([
  ['Commonwealth grants', Grants, { jur: 'federal' }],
  ['Queensland grants', Grants, { jur: 'qld' }],
  ['Program', Program, { jur: 'federal', id: 'GO3141' }],
  ['Largest grants', Largest, {}],
  ['Government agencies', Agencies, {}],
  ['Agency', Agency, { id: agency }],
  ['Community funding', Allocation, {}],
  [
    'Recipient money item',
    MoneyItem,
    {
      kind: 'recipient',
      jur: 'federal',
      program: program.key,
      recipient: program.grants.find((g: { rid?: string }) =>
        g.rid?.startsWith('abn:'),
      ).rid,
    },
  ],
  [
    'Supplier money item',
    MoneyItem,
    {
      kind: 'supplier',
      agency,
      supplier: raw(`/agencies/${agency}.json`).contracts[0].supplier_id,
    },
  ],
] as const)('%s: every money row opens a page', async (label, Screen, p) => {
  Object.assign(mockParams, p);
  const r = await render(Screen as () => React.ReactNode);
  await eachSegment(r, label);
  await act(async () => r.unmount());
});

test('Programs and places: every row opens its native page', async () => {
  const r = await render(Connections);
  const rows = r.root.findAllByType(LinkRow);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows)
    expect(row.props.href).toMatchObject({ pathname: '/connection' });
  expectNoDeadEnds(r.root, 'Programs and places');
  await act(async () => r.unmount());
});

test('the hub: no Money map row; the parties card opens the map list', async () => {
  const r = await render(Hub);
  const titles = r.root.findAllByType(LinkRow).map((row) => row.props.title);
  expect(titles).toEqual([
    'Grants in Grayndler',
    'Leads',
    'Largest grants',
    'Queensland grants',
    'Community funding',
    'Programs and places',
  ]);
  expect(titles).not.toContain('Money map');
  const parties = r.root
    .findAllByType(Card)
    .find((c) => c.props.testID === 'money-card-parties')!;
  expect(parties.props.href).toMatchObject({
    pathname: '/money',
    params: { view: 'list' },
  });
  expectNoDeadEnds(r.root, 'Public money');
  await act(async () => r.unmount());
});

test('no screen opens the website or Safari except the ⋯ item', () => {
  const root = resolve(__dirname, '../src/features/money-public');
  for (const file of readdirSync(root).filter(
    (f) => /\.tsx?$/.test(f) && f !== 'Discover.tsx',
  )) {
    const source = readFileSync(resolve(root, file), 'utf8');
    expect([file, /Linking\.openURL/.test(source)]).toEqual([file, false]);
    if (file !== 'parts.tsx')
      expect([file, /\bopenOnWeb\(/.test(source)]).toEqual([file, false]);
  }
});

test('a money item names its state in full, and leaves an unknown one out', async () => {
  const awards = raw('/research/mlci.json').awards as {
    ga_id: string;
    delivery_state: string | null;
  }[];
  const vic = awards.find((a) => a.delivery_state === 'VIC')!;
  const none = awards.find((a) => !a.delivery_state)!;
  const state = async (id: string) =>
    (await loadMoneyItem({ kind: 'award', id }, false)).data.facts.find(
      (f) => f.label === 'State',
    )?.value;
  expect(await state(vic.ga_id)).toBe('Victoria');
  expect(await state(none.ga_id)).toBeUndefined();
  const project = raw('/research/mlci.json').projects[0] as {
    id: string;
    state: string;
  };
  expect(project.state).toBe('ACT');
  expect(
    (
      await loadMoneyItem({ kind: 'project', id: project.id }, false)
    ).data.facts.find((f) => f.label === 'State')?.value,
  ).toBe('Australian Capital Territory');
});
