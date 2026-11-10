import { AskController } from '../src/features/ask/controller';
import { defaultOptions, type ChatStore } from '../src/features/ask/model';

const answer = {
  answer: 'A fixture answer.',
  citations: {},
  sources: [
    {
      resource: 'a'.repeat(32),
      title: 'Fixture record',
      snippet: 'Fixture passage',
    },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(post: jest.Mock) {
  let store: ChatStore = {
    v: 1,
    active: null,
    chats: [
      {
        id: 'fixture-saved',
        title: 'Saved question',
        kind: 'all',
        speaker: '',
        created: 1,
        updated: 2,
        thread: [
          { role: 'user', text: 'Saved question' },
          { role: 'answer', text: 'Saved answer', sources: [] },
        ],
      },
    ],
  };
  const save = jest.fn(async (next: ChatStore) => {
    store = next;
  });
  const controller = new AskController({
    post,
    read: () => store,
    save,
    now: () => 10000,
    id: () => 'fixture-new',
  });
  return { controller, save, store: () => store };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test('suggestions reserve their rows as soon as the answer finishes, before saving completes', async () => {
  const saved = deferred<void>();
  const next = deferred<unknown>();
  const post = jest
    .fn()
    .mockResolvedValueOnce(answer)
    .mockReturnValueOnce(next.promise);
  const h = harness(post);
  h.save.mockImplementationOnce(() => saved.promise);
  const asking = h.controller.submit('First question');
  await flush();
  expect(h.controller.snapshot()).toMatchObject({
    busy: false,
    nextLoading: true,
  });
  expect(h.controller.snapshot().thread.at(-1)?.text).toBe(answer.answer);
  expect(post).toHaveBeenCalledTimes(1);
  saved.resolve();
  await flush();
  expect(post.mock.calls[1]?.[0]).toBe('/api/followups');
  next.resolve({ questions: [] });
  await asking;
  expect(h.controller.snapshot().nextLoading).toBe(false);
});

test.each([false, true])(
  'empty or failed suggestions stop loading (failure: %s)',
  async (fails) => {
    const post = jest.fn().mockResolvedValueOnce(answer);
    if (fails) post.mockRejectedValueOnce(new Error('Fixture failure'));
    else post.mockResolvedValueOnce({ questions: [] });
    const h = harness(post);
    await h.controller.submit('First question');
    expect(h.controller.snapshot().nextLoading).toBe(false);
    expect(h.controller.snapshot().thread.at(-1)?.next ?? []).toEqual([]);
  },
);

test('opening history cancels pending suggestions and ignores their late completion', async () => {
  const next = deferred<unknown>();
  const post = jest
    .fn()
    .mockResolvedValueOnce(answer)
    .mockReturnValueOnce(next.promise);
  const h = harness(post);
  const asking = h.controller.submit('First question');
  await flush();
  expect(h.controller.snapshot().nextLoading).toBe(true);
  const signal = post.mock.calls[1]![2] as AbortSignal;
  h.controller.open('fixture-saved');
  expect(signal.aborted).toBe(true);
  expect(h.controller.snapshot().nextLoading).toBe(false);
  const saves = h.save.mock.calls.length;
  next.resolve({ questions: ['A stale suggestion?'] });
  await asking;
  expect(h.save).toHaveBeenCalledTimes(saves);
  expect(h.controller.snapshot().thread.at(-1)?.next).toBeUndefined();
});

test('a new question clears the old suggestions spinner and cancels its request', async () => {
  const next = deferred<unknown>(),
    second = deferred<unknown>();
  const post = jest
    .fn()
    .mockResolvedValueOnce(answer)
    .mockReturnValueOnce(next.promise)
    .mockReturnValueOnce(second.promise);
  const h = harness(post);
  const first = h.controller.submit('First');
  await flush();
  const signal = post.mock.calls[1]![2] as AbortSignal;
  const later = h.controller.submit('Second');
  expect(h.controller.snapshot().nextLoading).toBe(false);
  expect(signal.aborted).toBe(true);
  second.resolve({ ...answer, sources: [] });
  next.resolve({ questions: ['Old follow-up?'] });
  await Promise.all([first, later]);
  expect(h.controller.snapshot().nextLoading).toBe(false);
  expect(h.controller.snapshot().thread.at(-1)?.next).toBeUndefined();
});

test('opening a saved conversation clears the previous draft and held send, and remembers the selection', async () => {
  const h = harness(jest.fn());
  h.controller.setDraft('Question for another conversation');
  h.controller.hold('Held elsewhere', undefined, true);
  h.controller.open('fixture-saved');
  await flush();
  expect(h.controller.snapshot()).toMatchObject({
    draft: '',
    pending: null,
    id: 'fixture-saved',
  });
  expect(h.store().active).toBe('fixture-saved');
  expect(h.store().chats[0]?.updated).toBe(2);
});

test('Mining follow-ups use the latest typed question and rewrite, and New clears their context', async () => {
  const post = jest
    .fn()
    .mockResolvedValueOnce({
      ...answer,
      sources: [],
      asked_as: 'What records concern the Mining and Energy Union?',
    })
    .mockResolvedValueOnce({
      ...answer,
      sources: [],
      asked_as: 'What housing records were published in 2025?',
    })
    .mockResolvedValueOnce({ ...answer, sources: [] })
    .mockResolvedValueOnce({ ...answer, sources: [] });
  const h = harness(post);
  await h.controller.submit(
    'What records concern the Mining and Energy Union?',
  );
  await h.controller.submit('What housing records were published in 2025?');
  await h.controller.submit('And in 2026?');
  expect(post.mock.calls[1]![1]).toMatchObject({
    question: 'What housing records were published in 2025?',
  });
  const third = post.mock.calls[2]![1] as {
    question: string;
    context: { author: string; text: string }[];
  };
  expect(third.question).toBe('And in 2026?');
  expect(
    third.context.filter((turn) => turn.author === 'user').at(-1)?.text,
  ).toBe('What housing records were published in 2025?');
  h.controller.newConversation();
  await h.controller.submit('What records concern housing?');
  expect(post.mock.calls[3]![1]).toEqual({
    question: 'What records concern housing?',
    kind: defaultOptions.kind,
  });
});

test('a synced copy of the open conversation shows its turns and keeps the draft', async () => {
  const h = harness(jest.fn());
  h.controller.open('fixture-saved');
  h.controller.setDraft('Fixture draft in progress');
  const saved = h.store().chats[0]!;
  await h.save({
    ...h.store(),
    chats: [
      {
        ...saved,
        updated: 3,
        thread: [
          ...saved.thread,
          { role: 'user', text: 'Asked on another device' },
          { role: 'answer', text: 'Answer from another device', sources: [] },
        ],
      },
    ],
  });
  h.controller.reload('fixture-saved');
  expect(h.controller.snapshot().thread).toHaveLength(4);
  expect(h.controller.snapshot().draft).toBe('Fixture draft in progress');
});

test('sending a failed follow-up again from the composer keeps its quoted evidence', async () => {
  const { AskFailure } = jest.requireActual('../src/features/ask/stream');
  const replies = [
    Promise.resolve(answer),
    Promise.reject(new AskFailure('offline', 'Fixture offline.')),
    Promise.resolve(answer),
  ];
  replies[1]!.catch(() => undefined);
  const post = jest.fn((path: string) =>
    path === '/api/followups' ? Promise.resolve({ next: [] }) : replies.shift(),
  );
  const h = harness(post);
  await h.controller.submit('Fixture first question');
  const carry = {
    question: 'Fixture follow-up?',
    evidence: 'Fixture quoted passage',
    source: 'Fixture record',
  };
  await h.controller.submit(carry.question, carry);
  expect(h.controller.snapshot().draft).toBe(carry.question);
  await h.controller.sendDraft();
  const asks = post.mock.calls.filter(
    ([path]) => path !== '/api/followups',
  ) as unknown as [string, object][];
  const body = asks[2]![1] as {
    context: { author: string; text: string }[];
  };
  expect(body.context.at(-1)?.text).toContain('Fixture quoted passage');
});
