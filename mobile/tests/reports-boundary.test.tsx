/* eslint-disable @typescript-eslint/no-require-imports -- Jest factory builds an isolated fixture client before app imports. */
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { AppState } from 'react-native';
import { reports } from '../src/api/runtime';
import { SegmentedControl } from '../src/design/primitives';
import Today from '../src/features/Today';
import TopicsIndex from '../src/features/reports/TopicsIndex';
import ReportPage from '../src/features/reports/ReportPage';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ slug: 'gambling' }),
}));
jest.mock('../src/api/runtime', () => {
  const { ReportsRepository } = require('../src/features/reports/repository');
  const { pinnedBytes } = require('./pinned');
  const fixture = require('../scripts/reports-fixture').reportsFixture(
    pinnedBytes,
  );
  const get = jest.fn(
    async (path: string, decode: (v: unknown) => unknown) => ({
      data: decode(JSON.parse((fixture(path) ?? pinnedBytes(path)).toString())),
      stale: false,
      savedAt: 100,
      asOf: null,
    }),
  );
  const block = {
    status: 'ready',
    data: [],
    sources: [],
    asAt: null,
    stale: false,
    savedAt: null,
  };
  return {
    reports: new ReportsRepository({ get, getForAction: get }),
    catalogs: {
      today: jest.fn(async () => ({ bills: block, declarations: block })),
      todayEdition: jest.fn(async () => ({
        ...block,
        data: null,
        status: 'missing',
      })),
    },
  };
});

test('Today mount and application foreground send only static coverage/report reads; paid counts are chosen later', async () => {
  const client = (reports as unknown as { client: { get: jest.Mock } }).client;
  let screen!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    screen = TestRenderer.create(<Today />);
  });
  expect(
    client.get.mock.calls.map((c) => c[0]).some((p) => p.startsWith('/api/')),
  ).toBe(false);
  expect(client.get.mock.calls.map((c) => c[0])).toContain('/corpus.json');
  expect(client.get.mock.calls.map((c) => c[0])).toContain(
    '/reports/gambling.json',
  );
  await act(async () => {
    (
      AppState as unknown as { emit?: (event: string, state: string) => void }
    ).emit?.('change', 'active');
  });
  expect(
    client.get.mock.calls.map((c) => c[0]).some((p) => p.startsWith('/api/')),
  ).toBe(false);
  await act(async () => screen.unmount());
  await act(async () => {
    screen = TestRenderer.create(<TopicsIndex />);
  });
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/topics'),
  ).toHaveLength(1);
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/tide'),
  ).toHaveLength(1);
  await act(async () => screen.unmount());
  await act(async () => {
    screen = TestRenderer.create(<TopicsIndex />);
  });
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/topics'),
  ).toHaveLength(1);
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/tide'),
  ).toHaveLength(1);
  await act(async () => screen.unmount());
  await act(async () => {
    screen = TestRenderer.create(<ReportPage />);
  });
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/matrix'),
  ).toHaveLength(0);
  await act(async () =>
    screen.root.findByType(SegmentedControl).props.onChange('money'),
  );
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/matrix'),
  ).toHaveLength(1);
  await act(async () =>
    screen.root.findAllByType(SegmentedControl)[0]!.props.onChange('now'),
  );
  await act(async () =>
    screen.root.findAllByType(SegmentedControl)[0]!.props.onChange('money'),
  );
  expect(
    client.get.mock.calls.filter((c) => c[0] === '/api/matrix'),
  ).toHaveLength(1);
  await act(async () => screen.unmount());
});
