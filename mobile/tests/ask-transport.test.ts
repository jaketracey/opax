import { TextDecoder, TextEncoder } from 'node:util';
import { ApiClient } from '../src/api/client';
import { CatalogCache } from '../src/api/cache';
import { decodeAnswer } from '../src/features/ask/model';
const origin = 'http://127.0.0.1:8940';
const payload = { answer: 'Recorded answer', citations: {}, sources: [] };
function response(status: number, raw: unknown = payload, extras: object = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: false,
    url: origin + '/api/ask?stream=1',
    headers: {
      get: (k: string) => (k === 'content-type' ? 'application/json' : null),
    },
    json: async () => raw,
    ...extras,
  } as unknown as Response;
}
const controller = () => new AbortController();
function api(transport: jest.Mock) {
  return new ApiClient({
    origin,
    version: '0.1.0',
    build: '7',
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
    transport,
  });
}
test.each([
  [429, 'rate-limited'],
  [403, 'blocked'],
  [401, 'blocked'],
  [503, 'invalid'],
])(
  'HTTP %s is terminal, one request with unchanged Worker error',
  async (status, code) => {
    const t = jest
      .fn()
      .mockResolvedValue(response(Number(status), { error: 'Worker refusal' }));
    await expect(
      api(t).askPost(
        '/api/ask?stream=1',
        { question: 'A question' },
        controller().signal,
      ),
    ).rejects.toMatchObject({ code, message: 'Worker refusal' });
    expect(t).toHaveBeenCalledTimes(1);
    expect(t.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'manual',
    });
    expect(t.mock.calls[0]?.[1].headers).not.toHaveProperty('Cookie');
  },
);
test('redirects, cross-origin replies and unreviewed paths fail closed before another call', async () => {
  for (const extra of [
    { redirected: true },
    { status: 302 },
    { url: 'https://elsewhere.invalid/api/ask' },
  ]) {
    const t = jest.fn().mockResolvedValue(response(200, payload, extra));
    await expect(
      api(t).askPost('/api/ask?stream=1', {}, controller().signal),
    ).rejects.toMatchObject({ code: 'blocked' });
    expect(t).toHaveBeenCalledTimes(1);
  }
  const t = jest.fn();
  await expect(
    api(t).askPost('/api/search', {}, controller().signal),
  ).rejects.toThrow();
  await expect(api(t).get('/api/ask?stream=1', (x) => x)).rejects.toThrow();
  await expect(api(t).get('/api/followups', (x) => x)).rejects.toThrow();
  expect(t).not.toHaveBeenCalled();
});
test('the same submitted request can return JSON without a synchronous fallback call', async () => {
  const t = jest.fn().mockResolvedValue(response(200));
  expect(
    decodeAnswer(
      await api(t).askPost(
        '/api/ask?stream=1',
        { question: 'Question' },
        controller().signal,
      ),
    ),
  ).toMatchObject(payload);
  expect(t).toHaveBeenCalledTimes(1);
});
test('native stream decoding handles split UTF-8 and releases its reader', async () => {
  Object.assign(globalThis, { TextDecoder, TextEncoder });
  const raw =
    'event: delta\ndata: {"text":"Café 🏛"}\n\nevent: done\ndata: ' +
    JSON.stringify({ ...payload, answer: 'Café 🏛' }) +
    '\n\n';
  const bytes = new TextEncoder().encode(raw),
    chunks = Array.from(bytes, (v) => ({
      value: Uint8Array.of(v),
      done: false,
    }));
  const reader = {
    read: jest
      .fn()
      .mockImplementation(async () => chunks.shift() || { done: true }),
    cancel: jest.fn().mockResolvedValue(undefined),
    releaseLock: jest.fn(),
  };
  const t = jest.fn().mockResolvedValue(
    response(200, payload, {
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => reader },
    }),
  );
  const on = { stage: jest.fn(), delta: jest.fn(), retry: jest.fn() };
  const result = decodeAnswer(
    await api(t).askPost('/api/ask?stream=1', {}, controller().signal, on),
  );
  expect(result.answer).toBe('Café 🏛');
  expect(on.delta).toHaveBeenCalledWith('Café 🏛');
  expect(t).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
});
test('network loss after words arrived is an explicitly partial stream', async () => {
  const reader = {
    read: jest
      .fn()
      .mockResolvedValueOnce({
        value: new TextEncoder().encode(
          'event: delta\ndata: {"text":"partial"}\n\n',
        ),
        done: false,
      })
      .mockRejectedValue(new Error('connection lost')),
    cancel: jest.fn().mockResolvedValue(undefined),
    releaseLock: jest.fn(),
  };
  const t = jest.fn().mockResolvedValue(
    response(200, payload, {
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => reader },
    }),
  );
  await expect(
    api(t).askPost('/api/ask?stream=1', {}, controller().signal, {
      stage: jest.fn(),
      delta: jest.fn(),
      retry: jest.fn(),
    }),
  ).rejects.toMatchObject({ code: 'partial' });
  expect(t).toHaveBeenCalledTimes(1);
});
test('offline and explicit cancel never retry', async () => {
  const t = jest.fn().mockRejectedValue(new Error('Offline')),
    c = controller();
  await expect(
    api(t).askPost('/api/ask?stream=1', {}, c.signal),
  ).rejects.toMatchObject({ code: 'offline' });
  c.abort();
  await expect(
    api(t).askPost('/api/ask?stream=1', {}, c.signal),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(t).toHaveBeenCalledTimes(2);
});
