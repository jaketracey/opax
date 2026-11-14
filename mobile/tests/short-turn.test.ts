import { ApiClient } from '../src/api/client';
import { CatalogCache, type CacheStore } from '../src/api/cache';
import {
  briefRids,
  isShortSpeechTurn,
  SHORT_TURN_WORDS,
} from '../src/api/short-turn';
import { PeopleDepth } from '../src/features/people/data';
import {
  cleanPassage,
  decodeRecords as decodePeopleRecords,
} from '../src/features/people/model';
import { RecordSearch } from '../src/features/search/api';
import { decodeRecord, decodeRecords } from '../src/features/search/decoders';

const rid = (n: number) => n.toString(16).padStart(32, '0');
const snippet = 'The fixture member asked one question.';

describe('isShortSpeechTurn (mirrors the web briefWanted rule)', () => {
  const speech = { kind: 'speech', snippet };
  test('a short speech turn is left out', () => {
    expect(isShortSpeechTurn({ ...speech, word_count: 42 })).toBe(true);
    expect(isShortSpeechTurn({ ...speech, word_count: 1 })).toBe(true);
    expect(
      isShortSpeechTurn({ ...speech, word_count: SHORT_TURN_WORDS - 1 }),
    ).toBe(true);
  });
  test('a short press release or other kind keeps its brief', () => {
    for (const kind of ['press', 'bill_text', 'report', 'grant', 'division'])
      expect(isShortSpeechTurn({ kind, snippet, word_count: 12 })).toBe(false);
    expect(isShortSpeechTurn({ snippet, word_count: 12 })).toBe(false);
  });
  test('an unknown length keeps the brief', () => {
    expect(isShortSpeechTurn(speech)).toBe(false);
    expect(isShortSpeechTurn({ ...speech, word_count: null })).toBe(false);
    expect(isShortSpeechTurn({ ...speech, word_count: 0 })).toBe(false);
    expect(isShortSpeechTurn({ ...speech, word_count: NaN })).toBe(false);
  });
  test('a long speech keeps its brief', () => {
    expect(isShortSpeechTurn({ ...speech, word_count: SHORT_TURN_WORDS })).toBe(
      false,
    );
    expect(isShortSpeechTurn({ ...speech, word_count: 640 })).toBe(false);
  });
  test('a short turn with no passage to show keeps its brief, so no row is bare', () => {
    for (const blank of [undefined, '', '  \n '])
      expect(
        isShortSpeechTurn({ kind: 'speech', word_count: 24, snippet: blank }),
      ).toBe(false);
    // Judged on the text the row shows: a speech list's cleaned passage
    // drops a bare "full listing" link.
    const listing = {
      kind: 'speech',
      word_count: 24,
      snippet: 'The full listing can be found at: https://example.test/list',
    };
    expect(isShortSpeechTurn(listing)).toBe(true);
    expect(cleanPassage(listing.snippet)).toBe('');
    expect(isShortSpeechTurn(listing, cleanPassage)).toBe(false);
  });
  test('briefRids drops short speech turns, bad ids and repeats, in order', () => {
    expect(
      briefRids([
        { kind: 'speech', word_count: 30, resource: rid(1), snippet },
        { kind: 'speech', word_count: 300, resource: rid(2) },
        { kind: 'press', word_count: 30, resource: rid(3), snippet },
        { kind: 'speech', resource: rid(4) },
        { kind: 'speech', word_count: 300, resource: rid(2) },
        { kind: 'speech', word_count: 300, resource: 'not-a-rid' },
        { kind: 'speech', word_count: 300 },
      ]),
    ).toEqual([rid(2), rid(3), rid(4)]);
  });
});

describe('a malformed or absent word_count reads as unknown, never failing a list', () => {
  const row = {
    kind: 'speech',
    title: 'Fixture speech',
    slug: 'fixture-speech',
    resource: rid(1),
    snippet: 'A short turn.',
  };
  test.each([
    ['search', (v: unknown) => decodeRecord(v)],
    [
      'people',
      (v: unknown) => decodePeopleRecords({ results: [v] }).results[0]!,
    ],
  ])('%s decoder', (_, decode) => {
    expect(decode(row).word_count).toBeUndefined();
    expect(decode({ ...row, word_count: null }).word_count).toBeUndefined();
    expect(decode({ ...row, word_count: 42 }).word_count).toBe(42);
    for (const bad of ['42', NaN, Infinity, true, {}])
      expect(decode({ ...row, word_count: bad }).word_count).toBeUndefined();
  });
  test('a page with one bad word_count row decodes all its rows', () => {
    const results = [
      { ...row, slug: 'a', word_count: 30 },
      { ...row, slug: 'b', word_count: 'many' },
      { ...row, slug: 'c' },
    ];
    const page = decodeRecords({
      query: 'fixture',
      kind: 'speech',
      sort: 'relevance',
      page: 1,
      per_page: 20,
      page_count: 1,
      total: 3,
      count: 3,
      truncated: false,
      results,
      years: {},
    });
    expect(page.results.map((r) => [r.slug, r.word_count])).toEqual([
      ['a', 30],
      ['b', undefined],
      ['c', undefined],
    ]);
    expect(
      decodePeopleRecords({ results }).results.map((r) => r.word_count),
    ).toEqual([30, undefined, undefined]);
  });
});

const store: CacheStore = {
  readIndex: async () => [],
  writeIndex: async () => {},
  read: async () => undefined,
  write: async () => {},
  remove: async () => {},
};
function client(transport: typeof fetch) {
  return new ApiClient({
    origin: 'https://example.test',
    version: '1',
    build: '7',
    cache: new CatalogCache(store),
    transport,
    retries: 0,
    sleep: async () => {},
  });
}
const rows = [
  { slug: 'short', kind: 'speech', resource: rid(1), word_count: 25, snippet },
  { slug: 'long', kind: 'speech', resource: rid(2), word_count: 400, snippet },
  { slug: 'press', kind: 'press', resource: rid(3), word_count: 25, snippet },
  { slug: 'unknown', kind: 'speech', resource: rid(4), snippet },
  { slug: 'bare', kind: 'speech', resource: rid(5), word_count: 25 },
];
/** Answers search with `rows` and /api/brief with a brief for every rid asked. */
function server(results: unknown[]) {
  const asked: string[][] = [];
  const transport = jest.fn(async (url: RequestInfo | URL) => {
    const u = new URL(String(url));
    if (u.pathname === '/api/brief') {
      const rids = u.searchParams.get('rids')!.split(',');
      asked.push(rids);
      return new Response(
        JSON.stringify({
          briefs: Object.fromEntries(rids.map((r) => [r, `Brief ${r}`])),
        }),
      );
    }
    return new Response(JSON.stringify({ results }));
  });
  return { transport, asked };
}

test('a person’s record list never asks /api/brief about a short speech turn', async () => {
  const { transport, asked } = server(rows);
  const page = await new PeopleDepth(client(transport)).list(
    'Fixture Member',
    'speeches',
    1,
  );
  // The bare short turn (no snippet) still asks, so its row is not empty.
  expect(asked).toEqual([[rid(2), rid(3), rid(4), rid(5)]]);
  expect(Object.keys(page.briefs).sort()).toEqual([
    rid(2),
    rid(3),
    rid(4),
    rid(5),
  ]);
});

test('a page of only short speech turns makes no brief call', async () => {
  const { transport, asked } = server([rows[0]]);
  const page = await new PeopleDepth(client(transport)).list(
    'Fixture Member',
    'speeches',
    1,
  );
  expect(asked).toEqual([]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(page.briefs).toEqual({});
});

test('record search briefs leave short speech turns out of the batch', async () => {
  const { transport, asked } = server([]);
  const search = new RecordSearch(client(transport));
  await search.briefs(rows);
  expect(asked).toEqual([[rid(2), rid(3), rid(4), rid(5)]]);
  await expect(search.briefs([rows[0]!])).resolves.toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
});
