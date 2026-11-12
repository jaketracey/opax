import { MoneyRow } from '../src/design/rows';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { Text as NativeText, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { decodeDiscovery } from '../src/api/catalog-decoders';
import type { ApiClient, RecordResult } from '../src/api/client';
import Agencies, { Agency } from '../src/features/money-public/Agencies';
import Allocation from '../src/features/money-public/Allocation';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import Connections from '../src/features/money-public/Connections';
import Grants from '../src/features/money-public/Grants';
import Hub from '../src/features/money-public/Hub';
import Largest from '../src/features/money-public/Largest';
import Program from '../src/features/money-public/Program';
import { money } from '../src/features/money-public/runtime';

// Design programme pass 4A (docs/design/DESIGN-REVIEW-2026-10.md, section 2
// and "Money and leads"): one accent per view, on the section marks and the
// one display figure; one source line per block; no as-at lines, ⓘ or "View
// original" beside it; titles in ink; word-safe text at AX5.
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
    router: { push: jest.fn(), setParams: jest.fn() },
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
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
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
    return {
      data: decode(raw(path)),
      stale: false,
      savedAt: 10,
      asOf: null,
    };
  },
};
const fixture = new MoneyCatalogs(client);
const screens = [
  ['Public money', Hub, {}],
  ['Grants', Grants, { jur: 'federal' }],
  ['Program', Program, { jur: 'federal', id: 'GO3141' }],
  ['Largest', Largest, {}],
  ['Agencies', Agencies, {}],
  ['Agency', Agency, { id: 'a-7431f054588d4251c0b4' }],
  ['Allocation', Allocation, {}],
  ['Programs & places', Connections, {}],
] as const;
beforeEach(() => {
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
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
async function render(Screen: () => React.ReactElement | null) {
  let rendered!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Screen />);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

test.each(screens)(
  '%s at AX5: record text wraps and money interface text uses the requested clamps',
  async (_name, Screen, params) => {
    Object.assign(mockParams, params);
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
    const r = await render(Screen);
    const clamped = new Set(
      r.root
        .findAllByType(MoneyRow)
        .flatMap((row) =>
          row
            .findAllByType(NativeText)
            .filter((text) => text.props.numberOfLines === 2),
        ),
    );
    for (const text of r.root.findAllByType(NativeText))
      expect(text.props.numberOfLines).toBe(clamped.has(text) ? 2 : undefined);
    await act(async () => r.unmount());
  },
);

// The hub, grants, largest and program layout tests of pass 4A were
// replaced by the Apple-design money screens (specs/money.md 2.1 to 2.5):
// tests/design-p5-C-money.test.tsx and tests/money-rows.test.tsx cover them.
