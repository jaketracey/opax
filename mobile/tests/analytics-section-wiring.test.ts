import { connectSectionReports } from '../src/analytics/sections';
import { apiClient, recordClient } from '../src/api/runtime';

// The real clients the app reads with (src/api/runtime.ts), with only the
// network mocked: a failed read must reach the analytics sink from both, and
// a failure hidden behind a saved copy must reach it too.
const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        variant: 'production',
        apiOrigin: 'https://example.test',
        appVersion: '1.1.4',
        appBuild: '71',
      },
    },
  },
}));
jest.mock('../modules/opax-voice', () => ({ __esModule: true, default: null }));

const send = jest.fn();
const answer = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ generated: '2026-11-15' }), {
    status,
    headers,
  });
const decode = (value: unknown) => value as { generated: string };
beforeEach(() => {
  send.mockClear();
  mockFetch.mockReset();
  connectSectionReports({ route: () => '/money', send });
});
afterAll(() => connectSectionReports(null));

test('a 503 on the catalog client reaches the sink', async () => {
  mockFetch.mockImplementation(async () => answer(503));
  await expect(
    apiClient.get('/agencies.json', decode, false, { retries: 0 }),
  ).rejects.toMatchObject({ code: 'server' });
  expect(send.mock.calls).toEqual([['read_agencies', '5xx', '/money']]);
});

test('a 503 hidden behind the saved copy reaches the sink, and the reader still gets the copy', async () => {
  mockFetch.mockImplementationOnce(async () => answer(200));
  const first = await apiClient.get('/graph/money.json', decode);
  expect(first.stale).toBe(false);
  expect(send).not.toHaveBeenCalled();
  mockFetch.mockImplementation(async () => answer(503));
  // A refresh, over and over, through the outage.
  for (let attempt = 0; attempt < 5; attempt++) {
    const saved = await apiClient.get('/graph/money.json', decode, true, {
      retries: 0,
    });
    expect(saved).toMatchObject({
      data: { generated: '2026-11-15' },
      stale: true,
      staleReason: 'unavailable',
    });
  }
  expect(send.mock.calls).toEqual([['read_money', '5xx', '/money']]);
  // Rate limiting and a dead connection are reported behind a copy as well.
  mockFetch.mockImplementation(async () => answer(429));
  await apiClient.get('/graph/money.json', decode, true, { retries: 0 });
  mockFetch.mockImplementation(async () => {
    throw new TypeError('Network request failed');
  });
  const offline = await apiClient.get('/graph/money.json', decode, true, {
    retries: 0,
  });
  expect(offline.stale).toBe(true);
  expect(offline.staleReason).toBeUndefined();
  expect(send.mock.calls.slice(1)).toEqual([
    ['read_money', '4xx', '/money'],
    ['read_money', 'network', '/money'],
  ]);
});

test('a newer export that cannot be read is reported as decode behind the saved copy', async () => {
  mockFetch.mockImplementationOnce(async () => answer(200));
  await apiClient.get('/pay.json', decode);
  mockFetch.mockImplementation(
    async () => new Response('not json', { status: 200 }),
  );
  const saved = await apiClient.get('/pay.json', decode, true, { retries: 0 });
  expect(saved.staleReason).toBe('unreadable');
  expect(send.mock.calls).toEqual([['read_pay', 'decode', '/money']]);
});

test('a 503 on the reader client reaches the sink', async () => {
  mockFetch.mockImplementation(async () => answer(503));
  await expect(recordClient.get('/api/recent', decode)).rejects.toMatchObject({
    code: 'server',
  });
  expect(send.mock.calls).toEqual([['read_api', '5xx', '/money']]);
});
