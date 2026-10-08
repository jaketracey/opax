import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import pin from '../scripts/fixtures/ask-recorded.json';
import clarifyFixture from '../scripts/fixtures/ask-clarify.json';
import { builderQuestion, shapes } from '../src/features/ask/builder';
import { AskController } from '../src/features/ask/controller';
import { AskFailure, AskStream } from '../src/features/ask/stream';
import {
  boundedStore,
  chips,
  clearChip,
  dateRuler,
  decodeAnswer,
  decodeChat,
  decodeFollowups,
  decodeRemoteChat,
  decodeRemoteIndex,
  decodeRanges,
  decodeStore,
  defaultOptions,
  normaliseOptions,
  requestBody,
  sourceGroups,
  syncBody,
  titleFor,
  trimTurn,
  type ChatStore,
} from '../src/features/ask/model';
import { assertAskPostPath, assertAllowedPath } from '../src/api/policy';
const rid = 'a'.repeat(32);
const payload = {
  answer: 'A recorded answer.',
  citations: { [rid + '/f/text/0']: [[0, 18]] },
  sources: [
    {
      resource: rid,
      title: 'Recorded bill',
      href: '/bill/au-federal-r7534',
      snippet: 'A pinned record passage.',
      date: '2026-01-02',
    },
    {
      resource: 'other',
      title: 'Other record',
      href: '/doc/speech-fixture',
      date: '2025-01-01',
      cited: false,
    },
  ],
};
const handlers = () => ({
  stage: jest.fn(),
  delta: jest.fn(),
  retry: jest.fn(),
  reading: jest.fn(),
});
const chat = () => ({
  id: 'fixture-chat-001',
  title: 'Question',
  kind: 'speech' as const,
  speaker: 'Roster member',
  created: 100,
  updated: 101,
  thread: [
    { role: 'user' as const, text: 'Question', askedAs: 'Resolved question' },
    {
      role: 'answer' as const,
      text: payload.answer,
      sources: decodeAnswer(payload).sources,
      next: [{ question: 'What happened next?' }],
    },
  ],
});
test('recorded stream is pinned, decoded across every split and ends in the Worker payload', () => {
  const bytes = readFileSync(
    resolve(__dirname, '../scripts/fixtures/ask-recorded.sse'),
  );
  expect(bytes.length).toBe(pin.size);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
  const text = bytes.toString();
  for (const size of [1, 3, 97, 65536]) {
    const h = handlers(),
      s = new AskStream(h);
    for (let i = 0; i < text.length; i += size) s.push(text.slice(i, i + size));
    s.push('', true);
    const a = decodeAnswer(s.result());
    expect(a.sources[0]?.href).toBe('/bill/au-federal-r7534');
    expect(h.delta.mock.calls.map((c) => c[0]).join('')).toBe(a.answer);
  }
});
test('SSE CRLF, multi-line data, retry withdrawal, comments and trailing frame', () => {
  const h = handlers(),
    s = new AskStream(h);
  s.push(
    ': hello\r\n\r\nevent: delta\r\ndata: {"text":\r\ndata: "first"}\r\n\r\nevent: retry\r\ndata: {"reason":"empty"}\r\n\r\nevent: status\r\ndata: {"phase":"writing"}\r\n\r\n',
  );
  s.push('event: done\ndata: ' + JSON.stringify(payload), true);
  expect(s.result()).toEqual(payload);
  expect(h.retry).toHaveBeenCalledTimes(1);
  expect(h.stage).toHaveBeenCalledWith('Writing the answer');
});
test.each([
  'event: error\ndata: {"error":"Refused","final":true}\n\n',
  'event: delta\ndata: {"text":"partial"}\n\n',
])('stream failures never become completed answers: %s', (text) => {
  const s = new AskStream(handlers());
  expect(() => {
    s.push(text, true);
    s.result();
  }).toThrow(AskFailure);
});
test('answer decoding preserves ranges, separates cited and retrieved and sorts source dates', () => {
  const a = decodeAnswer(payload);
  expect(a.sources[0]?.cited).toBe(true);
  expect(a.sources[0]?.answerRanges).toEqual([[0, 18]]);
  expect(sourceGroups(a.sources).also).toHaveLength(1);
  expect(dateRuler(a.sources).map((s) => s.resource)).toEqual(['other', rid]);
  expect(
    sourceGroups(a.sources.map((s) => ({ ...s, cited: false }))).also,
  ).toEqual([]);
  expect(decodeRanges([[0, 2], [-1, 4], [3, 2], [0, 2.5], null])).toEqual([
    [0, 2],
  ]);
  expect(() => decodeAnswer({ answer: null, sources: [] })).toThrow();
  expect(
    decodeAnswer({ ...payload, sources: [null, ...payload.sources] }).sources,
  ).toHaveLength(2);
});
test('calculated, clarification, evidence and rewritten answers retain their contract fields', () => {
  const a = decodeAnswer({
    ...payload,
    answer_status: 'calculated',
    money_ranking: true,
    money_context: 'Selected records',
    money_overview: 'An opening',
    money_question: 'Resolved funding question',
    pay_answer: true,
    pay_next: [{ label: 'Read determination', href: '/methods' }, null],
    asked_as: 'Standalone question',
    evidence_excerpts: [{ resource: rid, text: 'Original record' }, null],
  });
  expect(a.money_context).toBe('Selected records');
  expect(a.pay_next).toHaveLength(1);
  expect(a.evidence_excerpts).toHaveLength(1);
  expect(a.asked_as).toBe('Standalone question');
});
test('follow-ups accept historical strings and new evidence-bearing questions', () => {
  expect(
    decodeFollowups({
      questions: [
        'One?',
        { question: 'Two?', evidence: 'Passage', source: 'Source' },
        null,
        { question: ' ' },
        {},
      ],
    }),
  ).toEqual([
    { question: 'One?' },
    { question: 'Two?', evidence: 'Passage', source: 'Source' },
  ]);
  expect(decodeFollowups(null)).toEqual([]);
});
test('all five builders and every variant match web sentence shapes', () => {
  const values = {
    person: 'Roster member',
    topic: 'housing',
    party: 'Labor',
    bill: 'Recorded Bill',
    industry: 'gambling',
  };
  for (const [shape, s] of Object.entries(shapes))
    for (let i = 0; i < s.variants.length; i++)
      expect(builderQuestion(shape, i, values)).toMatch(/\?$/);
  expect(builderQuestion('bill', 0, values)).toBe(
    'What does the Recorded Bill change?',
  );
  expect(builderQuestion('person', 0, values)).toBe(
    'What did Roster member say about housing?',
  );
  expect(builderQuestion('person', 0, {})).toBeNull();
  expect(builderQuestion('unknown', 0, values)).toBeNull();
});
test('options reproduce chip keys, removal and inclusive full-year reset', () => {
  const o = {
    ...defaultOptions,
    speaker: 'Roster member',
    party: 'Labor',
    state: 'federal',
    topic: 'housing',
    from: '2026',
    to: '2000',
    kind: 'speech' as const,
  };
  expect(normaliseOptions(o)).toMatchObject({ from: '2000', to: '2026' });
  expect(normaliseOptions({ ...o, from: '1993', to: '2026' })).toMatchObject({
    from: '',
    to: '',
  });
  expect(chips(o).map((c) => c.key)).toEqual([
    'Speaker',
    'Party',
    'Parliament',
    'Topic',
    'Years',
    'Record type',
  ]);
  expect(clearChip(o, 'speaker').speaker).toBe('');
  expect(clearChip(o, 'years').from).toBe('');
  expect(clearChip(o, 'kind').kind).toBe('all');
});
test('follow-up requests keep rewritten subject, two answers of source pins and carried proof', () => {
  const c = chat(),
    o = { ...defaultOptions, speaker: c.speaker, kind: 'speech' as const };
  const body = requestBody('and housing?', o, c.thread, {
    question: 'and housing?',
    evidence: 'Pinned passage',
    source: 'Record',
  });
  expect(body.context?.[0]?.text).toBe('Resolved question');
  expect(body.context?.at(-1)?.text).toBe(
    'From the record (Record): "Pinned passage"',
  );
  expect(body.prior_resources).toEqual([rid]);
  expect(body.speaker).toBe(c.speaker);
  expect(body.kind).toBe('speech');
});
test('saved chats bound count and bytes, trim retrieved passages and retain the account shape', () => {
  const c = chat();
  const decoded = decodeChat(c)!;
  expect(decoded.thread[1]?.next).toHaveLength(1);
  expect(decoded.thread[1]?.followupsRequested).toBe(true);
  expect(decoded.speaker).toBe('Roster member');
  expect(
    decodeChat({ ...c, thread: [{ role: 'wrong', text: 'x' }] }),
  ).toBeNull();
  expect(
    decodeChat({
      ...c,
      thread: [...c.thread, { role: 'user', text: 'Unanswered' }],
    })?.thread,
  ).toHaveLength(2);
  const store = boundedStore({
    v: 1,
    active: c.id,
    chats: Array.from({ length: 25 }, (_, i) => ({
      ...c,
      id: `fixture-chat-${i}`,
      updated: 100 + i,
    })),
  });
  expect(store.chats).toHaveLength(20);
  expect(store.active).toBeNull();
  expect(decodeStore(null)).toBeNull();
  expect(decodeStore({ v: 1, active: c.id, chats: [null, c] })?.active).toBe(
    c.id,
  );
  const long = {
    ...c.thread[1]!,
    sources: [
      { ...decodeAnswer(payload).sources[0]!, snippet: 'x'.repeat(900) },
    ],
  };
  expect(trimTurn(long).sources?.[0]?.snippet.length).toBe(240);
  expect(syncBody(c)).toMatchObject({
    title: c.title,
    kind: 'speech',
    speaker: c.speaker,
    updated: 101,
  });
  expect(syncBody(c).thread[1]).not.toHaveProperty('result');
  expect(titleFor([{ role: 'user', text: 'x'.repeat(100) }])).toHaveLength(90);
});
test('remote list and detail decode matching web storage shapes', () => {
  const c = chat();
  expect(
    decodeRemoteIndex({ chats: [{ id: c.id, updated_at: 200 }, null] }),
  ).toEqual([{ id: c.id, updated_at: 200 }]);
  expect(() => decodeRemoteIndex({})).toThrow();
  expect(
    decodeRemoteChat({
      chat: {
        id: c.id,
        title: c.title,
        kind: c.kind,
        created_at: c.created,
        updated_at: c.updated,
        data: syncBody(c),
      },
    })?.speaker,
  ).toBe(c.speaker);
});
test.each(['/api/ask?stream=1', '/api/followups'])(
  'only exact Ask POST paths are admitted: %s',
  (path) => {
    expect(() => assertAskPostPath(path)).not.toThrow();
    expect(() => assertAllowedPath(path)).not.toThrow();
  },
);
test.each([
  '/api/ask',
  '/api/ask?stream=0',
  '/api/ask?stream=1&stream=1',
  '/api/ask?stream=1&q=x',
  '/api/followups?q=x',
  '/api/search',
  '/api/community/chats',
  'https://opax.com.au/api/ask',
  '//api/ask',
])('other POST paths still fail closed: %s', (path) =>
  expect(() => assertAskPostPath(path)).toThrow(),
);
function harness(post: jest.Mock) {
  let store: ChatStore = { v: 1, active: null, chats: [] };
  return {
    controller: new AskController({
      post,
      read: () => store,
      save: async (s) => {
        store = s;
      },
      now: () => 1000000,
      id: () => `fixture-chat-${store.chats.length}`,
    }),
    store: () => store,
  };
}
test('construction, restoration, options, and repeated reads cause zero paid requests', async () => {
  const post = jest.fn(),
    h = harness(post);
  h.controller.options({ ...defaultOptions, party: 'Labor' });
  h.controller.snapshot();
  h.controller.start();
  h.controller.open('missing');
  expect(post).not.toHaveBeenCalled();
});
test('one submission causes one Ask and at most one follow-ups; restore and cached reads are free', async () => {
  const post = jest
    .fn()
    .mockResolvedValueOnce(payload)
    .mockResolvedValueOnce({ questions: ['What happened next?'] });
  const h = harness(post);
  await h.controller.submit('Question');
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    '/api/ask?stream=1',
    '/api/followups',
  ]);
  const id = h.controller.snapshot().id!;
  h.controller.open(id);
  h.controller.snapshot();
  expect(post).toHaveBeenCalledTimes(2);
  expect(h.store().chats[0]?.thread[1]?.next).toHaveLength(1);
});
test('typed follow-up sends context and shows Understood as without local rewrite generation', async () => {
  const post = jest
    .fn()
    .mockResolvedValueOnce(payload)
    .mockResolvedValueOnce({ questions: [] })
    .mockResolvedValueOnce({ ...payload, asked_as: 'The standalone follow-up' })
    .mockResolvedValueOnce({ questions: [] });
  const h = harness(post);
  h.controller.options({
    ...defaultOptions,
    speaker: 'Roster member',
    kind: 'speech',
  });
  await h.controller.submit('Question');
  await h.controller.submit('and housing?');
  expect(post.mock.calls[2]?.[1]).toMatchObject({
    speaker: 'Roster member',
    kind: 'speech',
    context: [
      { author: 'user', text: 'Question' },
      { author: 'answer', text: payload.answer },
    ],
  });
  expect(h.controller.snapshot().thread[2]?.askedAs).toBe(
    'The standalone follow-up',
  );
});
test('a follow-up the Worker could not read is a prompt, not a turn: no follow-ups, nothing saved', async () => {
  const clarify = {
    answer: '“ok” doesn’t say enough to search the record on.',
    citations: {},
    sources: [],
    answer_status: 'needs_question',
  };
  const post = jest
    .fn()
    .mockResolvedValueOnce(payload)
    .mockResolvedValueOnce({ questions: [] })
    .mockResolvedValueOnce(clarify)
    .mockResolvedValueOnce({ ...clarify, suggested_question: ' A full one? ' })
    .mockResolvedValueOnce(payload)
    .mockResolvedValueOnce({ questions: [] });
  const h = harness(post);
  await h.controller.submit('Question');
  const saved = JSON.stringify(h.store());
  await h.controller.submit('ok');
  expect(post).toHaveBeenCalledTimes(3);
  expect(h.controller.snapshot()).toMatchObject({
    busy: false,
    error: null,
    clarify: { question: 'ok' },
  });
  expect(h.controller.snapshot().clarify).not.toHaveProperty('suggestion');
  expect(h.controller.snapshot().thread).toHaveLength(2);
  expect(JSON.stringify(h.store())).toBe(saved);
  await h.controller.submit('High');
  expect(h.controller.snapshot().clarify).toEqual({
    question: 'High',
    suggestion: 'A full one?',
  });
  // The next question clears the prompt and is read against the real thread.
  await h.controller.submit('A full one?');
  expect(h.controller.snapshot().clarify).toBeNull();
  expect(
    (post.mock.calls[4]?.[1] as { context: { text: string }[] }).context.map(
      (c) => c.text,
    ),
  ).toEqual(['Question', payload.answer]);
  expect(h.controller.snapshot().thread).toHaveLength(4);
});
test('the pinned clarify fixture is the Worker contract', () => {
  const fixture = clarifyFixture;
  const a = decodeAnswer(fixture);
  expect(a.answer_status).toBe('needs_question');
  expect(a.suggested_question).toBe(fixture.suggested_question);
  expect(a.sources).toEqual([]);
  expect(a.asked_as).toBeUndefined();
});
test.each(['rate-limited', 'blocked', 'partial', 'offline'] as const)(
  'failed %s submission never retries paid routes',
  async (code) => {
    const post = jest.fn().mockRejectedValue(new AskFailure(code, 'Failure'));
    const h = harness(post);
    await h.controller.submit('Question');
    expect(post).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot().error?.code).toBe(code);
    expect(h.store().chats).toHaveLength(0);
  },
);
test('empty and calculated answers skip generated follow-ups', async () => {
  for (const result of [
    { ...payload, answer: '' },
    { ...payload, money_ranking: true, answer_status: 'calculated' },
    { ...payload, pay_answer: true },
  ]) {
    const post = jest.fn().mockResolvedValue(result);
    const h = harness(post);
    await h.controller.submit('Question');
    expect(post).toHaveBeenCalledTimes(1);
  }
});
test('cancellation and account deletion discard late answers without saving', async () => {
  let finish: (v: unknown) => void = () => {};
  const post = jest.fn(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const h = harness(post);
  const pending = h.controller.submit('Question');
  h.controller.start();
  finish(payload);
  await pending;
  expect(h.controller.snapshot()).toMatchObject({
    id: null,
    thread: [],
    busy: false,
  });
  expect(h.store().chats).toHaveLength(0);
  expect(post).toHaveBeenCalledTimes(1);
});
