import { TextDecoder, TextEncoder } from 'node:util';
import { CatalogCache } from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { decodeAnswer } from '../src/features/ask/model';
import { askErrorCopy } from '../src/features/ask/turn-copy';
import { AskFailure } from '../src/features/ask/stream';
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
  'HTTP %s is terminal, one request without exposing Worker error text',
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
    ).rejects.toMatchObject({ code, message: `Request failed (${status}).` });
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

test.each([
  // Seconds, up to the 120 s cap.
  ['60', 60_000],
  [' 90 ', 90_000],
  ['120', 120_000],
  ['121', 120_000],
  ['3600', 120_000],
  // A huge value is a long wait, not garbage: it takes the cap.
  ['999999999999999999999999999', 120_000],
  ['9'.repeat(400), 120_000],
  // HTTP dates (all three formats), measured from the response.
  ['Thu, 01 Jan 1970 00:02:40 GMT', 60_000],
  ['Thursday, 01-Jan-70 00:02:40 GMT', 60_000],
  ['Thu Jan  1 00:02:40 1970', 60_000],
  ['Thu, 01 Jan 1970 00:03:40 GMT', 120_000],
  ['Thu, 01 Jan 1970 01:00:00 GMT', 120_000],
  ['Fri, 31 Dec 9999 23:59:59 GMT', 120_000],
  // A past date takes the short default; the response's own second is now.
  ['Thu, 01 Jan 1970 00:00:00 GMT', 30_000],
  ['Thu, 01 Jan 1970 00:01:39 GMT', 30_000],
  ['Thu, 01 Jan 1970 00:01:40 GMT', 0],
  ['0', 0],
  // Garbage takes the short default.
  [null, 30_000],
  ['', 30_000],
  ['invalid', 30_000],
  ['-1', 30_000],
  ['1.5', 30_000],
  ['60 s', 30_000],
  ['1970-01-01T00:02:40Z', 30_000],
  ['Thu, 32 Jan 1970 00:00:00 GMT', 30_000],
  ['Thu, 01 Jan 1970 25:00:00 GMT', 30_000],
] as const)(
  'rate limit Retry-After %s is anchored to the response deadline',
  async (header, wait) => {
    jest.useFakeTimers();
    jest.setSystemTime(100_000);
    const t = jest.fn().mockResolvedValue(
      response(
        429,
        { error: 'Private server text' },
        {
          headers: {
            get: (key: string) =>
              key === 'retry-after' ? header : 'application/json',
          },
        },
      ),
    );
    try {
      const failure = await api(t)
        .askPost('/api/ask?stream=1', {}, controller().signal)
        .catch((error) => error);
      expect(failure).toBeInstanceOf(AskFailure);
      expect(failure).toMatchObject({
        code: 'rate-limited',
        retryAt: 100_000 + wait,
      });
      expect(t).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  },
);

test.each([
  ['Thu, 01 Jan 1970 00:01:40 GMT', 100_400],
  ['Thu, 01 Jan 1970 00:01:39 GMT', 130_400],
  ['Thu, 01 Jan 1970 00:02:40 GMT', 160_000],
  ['Thu, 01 Jan 1970 01:00:00 GMT', 220_400],
  ['3600', 220_400],
] as const)(
  'Retry-After %s part-way through a second keeps the date absolute and the cap from the response',
  async (header, retryAt) => {
    jest.useFakeTimers();
    jest.setSystemTime(100_400);
    const t = jest
      .fn()
      .mockResolvedValue(response(429, {}, { headers: { get: () => header } }));
    try {
      expect(
        await api(t)
          .askPost('/api/ask?stream=1', {}, controller().signal)
          .catch((error) => error),
      ).toMatchObject({ code: 'rate-limited', retryAt });
    } finally {
      jest.useRealTimers();
    }
  },
);

test('the retry deadline starts when the response arrives, after any request wait', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(100_000);
  let respond!: (value: Response) => void;
  const t = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  const pending = api(t)
    .askPost('/api/ask?stream=1', {}, controller().signal)
    .catch((error) => error);
  try {
    await jest.advanceTimersByTimeAsync(5000);
    respond(response(429, {}, { headers: { get: () => '60' } }));
    expect(await pending).toMatchObject({
      code: 'rate-limited',
      retryAt: 165_000,
    });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  [401, {}],
  [403, {}],
  [302, {}],
  [200, { redirected: true }],
] as const)(
  'HTTP %s block with %j never infers content rejection from status or raw error text',
  async (status, extras) => {
    const t = jest
      .fn()
      .mockResolvedValue(
        response(status, { error: 'Try rewording your question' }, extras),
      );
    const failure = await api(t)
      .askPost('/api/ask?stream=1', {}, controller().signal)
      .catch((error) => error);
    expect(failure).toBeInstanceOf(AskFailure);
    if (!(failure instanceof AskFailure)) throw failure;
    expect(askErrorCopy(failure)).toEqual({
      message: 'This question couldn’t be sent.',
      retry: false,
    });
  },
);
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
  expect(t).toHaveBeenCalledTimes(1);
});

test.each(['headers', 'json', 'stream'] as const)(
  'a stalled %s fails without a short paid retry and permits manual retry',
  async (phase) => {
    jest.useFakeTimers();
    Object.assign(globalThis, { TextDecoder, TextEncoder });
    const never = new Promise<never>(() => {});
    const reader = {
      read: jest.fn(() => never),
      cancel: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn(),
    };
    const t = jest.fn((_url: string, _init: RequestInit) =>
      phase === 'headers'
        ? never
        : Promise.resolve(
            response(
              200,
              payload,
              phase === 'json'
                ? { json: () => never }
                : {
                    headers: { get: () => 'text/event-stream' },
                    body: { getReader: () => reader },
                  },
            ),
          ),
    );
    const client = api(t);
    const on = { stage: jest.fn(), delta: jest.fn(), retry: jest.fn() };
    const pending = client.askPost(
      '/api/ask?stream=1',
      {},
      controller().signal,
      on,
    );
    const failure = expect(pending).rejects.toMatchObject({
      code: 'timeout',
      reason: 'stall',
    });
    try {
      await jest.advanceTimersByTimeAsync(85_000);
      await failure;
      expect(
        t.mock.calls.every(([, init]) => (init as RequestInit).signal?.aborted),
      ).toBe(true);
      expect(t).toHaveBeenCalledTimes(1);
      expect(on.retry).not.toHaveBeenCalled();
      t.mockResolvedValue(response(200));
      await expect(
        client.askPost('/api/ask?stream=1', {}, controller().signal),
      ).resolves.toEqual(payload);
      expect(askErrorCopy({ code: 'timeout' })).toEqual({
        message: 'This answer took too long.',
        retry: true,
      });
      expect(jest.getTimerCount()).toBe(0);
      if (phase === 'stream')
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  },
);

test('cancelling a stalled request settles immediately without sending a second request', async () => {
  const t = jest.fn().mockReturnValue(new Promise<never>(() => {}));
  const c = controller();
  const pending = api(t).askPost('/api/ask?stream=1', {}, c.signal);
  const cancelled = expect(pending).rejects.toMatchObject({
    code: 'cancelled',
  });
  c.abort();
  await cancelled;
  expect(t.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(t).toHaveBeenCalledTimes(1);
});

test('a transport that rejects on abort still reports timeout rather than offline', async () => {
  jest.useFakeTimers();
  const t = jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(new Error('AbortError')),
        );
      }),
  );
  const pending = api(t).askPost('/api/ask?stream=1', {}, controller().signal);
  const timedOut = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  try {
    await jest.advanceTimersByTimeAsync(120_000);
    await timedOut;
  } finally {
    jest.useRealTimers();
  }
});

test.each(['missing stream body', 'malformed JSON'] as const)(
  '%s produces a visible, retryable failure',
  async (failure) => {
    const t = jest.fn().mockResolvedValue(
      response(
        200,
        payload,
        failure === 'missing stream body'
          ? { headers: { get: () => 'text/event-stream' }, body: null }
          : {
              json: async () => {
                throw new SyntaxError('Private response content');
              },
            },
      ),
    );
    const result = await api(t)
      .askPost('/api/ask?stream=1', {}, controller().signal, {
        stage: jest.fn(),
        delta: jest.fn(),
        retry: jest.fn(),
      })
      .catch((error: unknown) => error);
    expect(result).toMatchObject({ code: 'invalid' });
    expect(askErrorCopy(result as Parameters<typeof askErrorCopy>[0])).toEqual({
      message: 'The answer couldn’t be read.',
      retry: true,
    });
    expect(t).toHaveBeenCalledTimes(1);
  },
);

test('timeout after words arrive preserves an explicitly partial answer', async () => {
  jest.useFakeTimers();
  Object.assign(globalThis, { TextDecoder, TextEncoder });
  const reader = {
    read: jest
      .fn()
      .mockResolvedValueOnce({
        value: new TextEncoder().encode(
          'event: delta\ndata: {"text":"Fixture partial answer"}\n\n',
        ),
        done: false,
      })
      .mockReturnValue(new Promise<never>(() => {})),
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
  const pending = api(t)
    .askPost('/api/ask?stream=1', {}, controller().signal, on)
    .catch((error: unknown) => error);
  try {
    await jest.advanceTimersByTimeAsync(120_000);
    expect(await pending).toMatchObject({ code: 'partial' });
    expect(on.delta).toHaveBeenCalledWith('Fixture partial answer');
    expect(on.retry).not.toHaveBeenCalled();
    expect(t).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('done completes the answer without waiting for the server to close the stream', async () => {
  Object.assign(globalThis, { TextDecoder, TextEncoder });
  const reader = {
    read: jest
      .fn()
      .mockResolvedValueOnce({
        value: new TextEncoder().encode(
          `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
        ),
        done: false,
      })
      .mockRejectedValue(new Error('The connection stayed open after done')),
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
  ).resolves.toEqual(payload);
  expect(reader.read).toHaveBeenCalledTimes(1);
  expect(reader.cancel).toHaveBeenCalledTimes(1);
  expect(reader.releaseLock).toHaveBeenCalledTimes(1);
});

test.each([
  ['', 'invalid'],
  ['event: delta\ndata: {"text":"Part of an answer"}\n\n', 'partial'],
  [
    'event: delta\ndata: {"text":"Withdrawn"}\n\nevent: retry\ndata: {}\n\n',
    'invalid',
  ],
])(
  'stream errors describe only words still shown: %s',
  async (prefix, code) => {
    Object.assign(globalThis, { TextDecoder, TextEncoder });
    const reader = {
      read: jest.fn().mockResolvedValueOnce({
        value: new TextEncoder().encode(
          `${prefix}event: error\ndata: {"error":"Private provider details","final":true}\n\n`,
        ),
        done: false,
      }),
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
    ).rejects.toMatchObject({ code, message: 'The answer stream failed.' });
    expect(t).toHaveBeenCalledTimes(1);
  },
);

test('an answer streaming steadily every 20 seconds can complete after 180 seconds', async () => {
  jest.useFakeTimers();
  Object.assign(globalThis, { TextDecoder, TextEncoder });
  const later = (text: string) =>
    new Promise((resolve) =>
      setTimeout(
        () => resolve({ value: new TextEncoder().encode(text), done: false }),
        20_000,
      ),
    );
  const frames = Array.from(
    { length: 8 },
    (_, index) =>
      `event: delta\ndata: ${JSON.stringify({ text: index === 7 ? 'slow answer' : 'Fixture ' })}\n\n`,
  );
  frames.push(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
  const reader = {
    read: jest.fn(() => later(frames.shift()!)),
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
  const pending = api(t)
    .askPost('/api/ask?stream=1', {}, controller().signal, on)
    .catch((error: unknown) => error);
  try {
    await jest.advanceTimersByTimeAsync(180_000);
    expect(await pending).toMatchObject({ answer: 'Recorded answer' });
    expect(on.delta).toHaveBeenCalledWith('slow answer');
    expect(on.delta).toHaveBeenCalledTimes(8);
    expect(t).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test.each([
  ['', 'invalid'],
  ['event: delta\ndata: {"text":"Part of an answer"}\n\n', 'partial'],
  [
    'event: delta\ndata: {"text":"Withdrawn"}\n\nevent: retry\ndata: {}\n\n',
    'invalid',
  ],
])(
  'a stream that closes before done says partway only with words shown: %s',
  async (prefix, code) => {
    Object.assign(globalThis, { TextDecoder, TextEncoder });
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          value: new TextEncoder().encode(
            `event: status\ndata: {"phase":"searching"}\n\n${prefix}`,
          ),
          done: false,
        })
        .mockResolvedValueOnce({ value: undefined, done: true }),
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
    ).rejects.toMatchObject({ code });
  },
);
