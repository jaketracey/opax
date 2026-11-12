import { TextDecoder, TextEncoder } from 'node:util';
import { CatalogCache } from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { AskController } from '../src/features/ask/controller';
import { decodeChat, type ChatStore } from '../src/features/ask/model';
import { AskFailure } from '../src/features/ask/stream';
import { ASK_DEADLINE_MS, ASK_STALL_MS } from '../src/features/ask/transport';

const origin = 'http://127.0.0.1:8940';
const question = 'What did parliament say about the fixture bill?';
const answer = { answer: 'Fixture answer.', sources: [], citations: {} };
const on = () => ({ stage: jest.fn(), delta: jest.fn(), retry: jest.fn() });
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};

class FakeStream {
  private queue: { value?: Uint8Array; done: boolean }[] = [];
  private waiting?: (part: { value?: Uint8Array; done: boolean }) => void;
  reader = {
    read: jest.fn(
      () =>
        new Promise((resolve) => {
          if (this.queue.length) resolve(this.queue.shift());
          else this.waiting = resolve;
        }),
    ),
    cancel: jest.fn(async () => {
      this.waiting?.({ done: true });
      this.waiting = undefined;
    }),
    releaseLock: jest.fn(),
  };
  raw(text: string) {
    const part = { value: new TextEncoder().encode(text), done: false };
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve(part);
    } else this.queue.push(part);
  }
  event(event: string, data: object) {
    this.raw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  response() {
    return {
      status: 200,
      ok: true,
      url: `${origin}/api/ask?stream=1`,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => this.reader },
    } as unknown as Response;
  }
}
function api(transport: jest.Mock) {
  return new ApiClient({
    origin,
    version: '1.0.0',
    build: '1',
    transport,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  Object.assign(globalThis, { TextDecoder, TextEncoder });
});
afterEach(() => jest.useRealTimers());

test.each([20_000, 70_000])(
  'a token at %i ms then a stall preserves partial text, even past the pre-text deadline',
  async (firstTokenAt) => {
    const stream = new FakeStream();
    const transport = jest.fn().mockResolvedValue(stream.response());
    const handlers = on();
    const pending = api(transport)
      .askPost('/api/ask?stream=1', {}, new AbortController().signal, handlers)
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(firstTokenAt);
    stream.event('status', { phase: 'writing' });
    stream.event('delta', { text: 'A partial answer' });
    await flush();
    await jest.advanceTimersByTimeAsync(ASK_STALL_MS - 1);
    expect(transport.mock.calls[0]![1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ code: 'partial', reason: 'stall' });
    expect(handlers.delta).toHaveBeenCalledWith('A partial answer');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
    expect(stream.reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('keep-alives and empty frames cannot postpone a stall or justify a short paid retry', async () => {
  const stream = new FakeStream();
  const transport = jest.fn().mockResolvedValue(stream.response());
  const handlers = on();
  const pending = api(transport)
    .askPost('/api/ask?stream=1', {}, new AbortController().signal, handlers)
    .catch((error: unknown) => error);
  const ping = setInterval(
    () =>
      stream.raw(
        ': keep-alive\n\nevent: ping\ndata: {}\n\nevent: delta\ndata: {"text":""}\n\nevent: status\ndata: {"phase":"ping"}\n\ndata: malformed\n\n',
      ),
    5_000,
  );
  await jest.advanceTimersByTimeAsync(ASK_STALL_MS - 1);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]![1].signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ code: 'timeout', reason: 'stall' });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(handlers.retry).not.toHaveBeenCalled();
  clearInterval(ping);
  expect(jest.getTimerCount()).toBe(0);
});

// Inject a stream-reported stall before the client's own 85 s guard. This
// exercises both sides of the recovery budget, including the exact boundary.
test.each([
  { elapsed: 60_000, retry: true },
  { elapsed: 60_001, retry: false },
])(
  'a stream reports a stall at $elapsed ms: automatic retry is $retry',
  async ({ elapsed, retry }) => {
    const first = new FakeStream();
    first.reader.read.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new AskFailure('timeout', 'Fixture stream stalled.', 'stall'),
              ),
            elapsed,
          );
        }),
    );
    const second = new FakeStream();
    second.event('done', answer);
    const transport = jest
      .fn()
      .mockResolvedValueOnce(first.response())
      .mockResolvedValueOnce(second.response());
    const handlers = on();
    const pending = api(transport)
      .askPost('/api/ask?stream=1', {}, new AbortController().signal, handlers)
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(elapsed);
    expect(transport).toHaveBeenCalledTimes(retry ? 2 : 1);
    expect(handlers.retry).toHaveBeenCalledTimes(retry ? 1 : 0);
    if (retry) expect(await pending).toEqual(answer);
    else
      expect(await pending).toMatchObject({ code: 'timeout', reason: 'stall' });
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('a valid step resets the stall window', async () => {
  const stream = new FakeStream();
  const transport = jest.fn().mockResolvedValue(stream.response());
  const pending = api(transport).askPost(
    '/api/ask?stream=1',
    {},
    new AbortController().signal,
    on(),
  );
  await jest.advanceTimersByTimeAsync(50_000);
  stream.event('status', {
    phase: 'step',
    step: { id: 'records', label: 'Reading records', state: 'running' },
  });
  await flush();
  await jest.advanceTimersByTimeAsync(40_000);
  stream.event('done', answer);
  expect(await pending).toEqual(answer);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('real stage progress cannot extend the overall deadline or trigger another request', async () => {
  const stream = new FakeStream();
  const transport = jest.fn().mockResolvedValue(stream.response());
  const pending = api(transport)
    .askPost('/api/ask?stream=1', {}, new AbortController().signal, on())
    .catch((error: unknown) => error);
  const progress = setInterval(
    () => stream.event('status', { phase: 'reading', words: 10 }),
    20_000,
  );
  await jest.advanceTimersByTimeAsync(ASK_DEADLINE_MS);
  expect(await pending).toMatchObject({ code: 'timeout', reason: 'deadline' });
  expect(transport).toHaveBeenCalledTimes(1);
  clearInterval(progress);
  expect(jest.getTimerCount()).toBe(0);
});

test('a server withdrawal never permits automatic retry after words were shown', async () => {
  const stream = new FakeStream();
  const transport = jest.fn().mockResolvedValue(stream.response());
  const pending = api(transport)
    .askPost('/api/ask?stream=1', {}, new AbortController().signal, on())
    .catch((error: unknown) => error);
  await flush();
  stream.event('delta', { text: 'Withdrawn words' });
  stream.event('retry', { reason: 'citations' });
  await flush();
  await jest.advanceTimersByTimeAsync(ASK_STALL_MS);
  expect(await pending).toMatchObject({ reason: 'stall' });
  expect(transport).toHaveBeenCalledTimes(1);
});

test('network recovery retries once before output and never duplicates history or analytics', async () => {
  const stream = new FakeStream();
  stream.event('done', answer);
  const transport = jest
    .fn()
    .mockRejectedValueOnce(new Error('Fixture network failure'))
    .mockResolvedValueOnce(stream.response());
  const client = api(transport);
  let store: ChatStore = { v: 1, active: null, chats: [] };
  const measure = jest.fn();
  const controller = new AskController({
    post: client.askPost.bind(client),
    read: () => store,
    save: async (next) => {
      store = next;
    },
    id: () => 'fixture-chat',
    now: Date.now,
    measure,
  });
  await controller.submit(question);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual(
    [
      { question, kind: 'all' },
      { question, kind: 'all' },
    ],
  );
  expect(store.chats).toHaveLength(1);
  expect(store.chats[0]!.thread.map((turn) => turn.role)).toEqual([
    'user',
    'answer',
  ]);
  expect(controller.snapshot().thread).toHaveLength(2);
  expect(measure.mock.calls.map(([event]) => event)).toEqual([
    'opax_ask_started',
    'opax_ask_completed',
  ]);
  expect(JSON.stringify(measure.mock.calls)).not.toContain(question);
  expect(jest.getTimerCount()).toBe(0);
});

test('a second network failure is terminal and manual retry keeps the question once', async () => {
  const stream = new FakeStream();
  stream.event('done', answer);
  const transport = jest.fn().mockRejectedValue(new Error('Fixture offline'));
  const client = api(transport);
  let store: ChatStore = { v: 1, active: null, chats: [] };
  const controller = new AskController({
    post: client.askPost.bind(client),
    read: () => store,
    save: async (next) => {
      store = next;
    },
    id: () => 'fixture-chat',
    now: Date.now,
  });
  controller.setDraft(question);
  await controller.sendDraft();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(controller.snapshot()).toMatchObject({
    busy: false,
    draft: question,
    thread: [],
    error: { reason: 'network' },
  });
  expect(store.chats).toHaveLength(0);
  transport.mockResolvedValueOnce(stream.response());
  await controller.retry();
  expect(controller.snapshot().draft).toBe('');
  expect(store.chats[0]!.thread).toHaveLength(2);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([
  { answer: '' },
  { answer: ' \n ' },
  { answer: ' \n ', answer_status: 'evidence_gap' },
  { answer: '', answer_status: 'no_answer' },
])(
  'a no-answer done payload is saved once with scope and a private-safe outcome: %j',
  async (outcome) => {
    const stream = new FakeStream();
    stream.event('done', {
      ...answer,
      ...outcome,
      scope: { kind: 'speech', state: 'vic' },
    });
    const transport = jest.fn().mockResolvedValue(stream.response());
    const client = api(transport);
    let store: ChatStore = { v: 1, active: null, chats: [] };
    const measure = jest.fn();
    const controller = new AskController({
      post: client.askPost.bind(client),
      read: () => store,
      save: async (next) => {
        store = next;
      },
      id: () => 'fixture-chat',
      now: Date.now,
      measure,
    });
    await controller.submit(question);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({
      busy: false,
      error: null,
      nextLoading: false,
    });
    const restored = decodeChat(store.chats[0]);
    expect(restored?.thread).toHaveLength(2);
    expect(restored?.thread[1]?.result?.scope).toEqual({
      kind: 'speech',
      state: 'vic',
    });
    expect(measure).toHaveBeenLastCalledWith(
      'opax_ask_completed',
      expect.objectContaining({ has_answer: false, reason: 'no_answer' }),
    );
    expect(JSON.stringify(measure.mock.calls)).not.toContain(question);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test.each(['evidence_gap', 'no_answer'])(
  'written text with status %s is an answer in history and analytics',
  async (answer_status) => {
    const stream = new FakeStream();
    const limitation =
      'The selected fixture records do not establish that no receipts occurred.';
    const payload = {
      ...answer,
      answer: limitation,
      answer_status,
      money_ranking: true,
      citations: { 'fixture-record/f/text/0': [[0, limitation.length]] },
      sources: [
        { resource: 'fixture-record', title: 'Fixture receipts', cited: true },
      ],
    };
    stream.event('done', payload);
    const transport = jest.fn().mockResolvedValue(stream.response());
    const client = api(transport);
    let store: ChatStore = { v: 1, active: null, chats: [] };
    const measure = jest.fn();
    const controller = new AskController({
      post: client.askPost.bind(client),
      read: () => store,
      save: async (next) => {
        store = next;
      },
      id: () => 'fixture-chat',
      now: Date.now,
      measure,
    });
    await controller.submit(question);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(store.chats[0]?.thread[1]?.text).toBe(payload.answer);
    expect(store.chats[0]?.thread[1]?.result?.citations).toEqual(
      payload.citations,
    );
    expect(measure).toHaveBeenLastCalledWith(
      'opax_ask_completed',
      expect.objectContaining({ has_answer: true, source_count: 1 }),
    );
    expect(measure.mock.calls.at(-1)![1]).not.toHaveProperty('reason');
    expect(JSON.stringify(measure.mock.calls)).not.toContain(question);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('automatic retry clears the first attempt record count while searching again', async () => {
  const first = new FakeStream();
  const status = `event: status\ndata: ${JSON.stringify({ phase: 'retrieved', sources: [{ title: 'Fixture one' }, { title: 'Fixture two' }] })}\n\n`;
  first.reader.read
    .mockResolvedValueOnce({
      value: new TextEncoder().encode(status),
      done: false,
    })
    .mockRejectedValueOnce(new Error('Fixture connection lost'));
  const second = new FakeStream();
  const transport = jest
    .fn()
    .mockResolvedValueOnce(first.response())
    .mockResolvedValueOnce(second.response());
  const client = api(transport);
  let store: ChatStore = { v: 1, active: null, chats: [] };
  const controller = new AskController({
    post: client.askPost.bind(client),
    read: () => store,
    save: async (next) => {
      store = next;
    },
    id: () => 'fixture-chat',
    now: Date.now,
  });
  const counts: number[] = [];
  controller.subscribe(() => counts.push(controller.snapshot().reading));
  const asking = controller.submit(question);
  await flush();
  expect(counts).toContain(2);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(controller.snapshot()).toMatchObject({
    busy: true,
    reading: 0,
    streaming: '',
    steps: [],
  });
  second.event('done', answer);
  await asking;
  expect(store.chats[0]?.thread).toHaveLength(2);
  expect(jest.getTimerCount()).toBe(0);
});
