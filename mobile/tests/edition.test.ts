import snapshot from '../scripts/fixture-snapshot.json';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import {
  Catalogs,
  billSummaryAttribution,
  decodeEdition,
  editionFor,
} from '../src/api/catalogs';
import { assertAllowedPath, editionPath } from '../src/api/policy';
import { responseBytes } from './fixture-bytes';
import { replaceAt } from './pinned';

// The production response pinned for the fixture (scripts/fixtures/).
const bytes = responseBytes(snapshot, editionPath);
const raw = () => JSON.parse(bytes.toString()) as Record<string, unknown>;
const decoded = decodeEdition(raw());
const at = (path: (string | number)[], value: unknown) =>
  replaceAt(raw(), path, value);
const without = (key: string) => {
  const input = raw();
  const edition = { ...(input.edition as Record<string, unknown>) };
  delete edition[key];
  return { ...input, edition };
};

describe('the edition decoder', () => {
  test('reads the pinned production response in full', () => {
    expect(decoded).toMatchObject({
      schema_version: 1,
      date: '2026-10-04',
      created_at: '2026-10-03T22:00:07.000Z',
      edition: {
        date: '2026-10-04',
        kind: 'bill',
        subject: 'bill:au-federal-r7529',
        url: 'https://opax.com.au/bill/au-federal-r7529',
      },
    });
    expect(decoded.edition.slides).toHaveLength(5);
    expect(decoded.edition.slides![4]).toMatchObject({
      type: 'source',
      rows: [
        'Explanatory memorandum on ParlInfo, CC BY-NC-ND 4.0',
        'Bill home page on ParlInfo, CC BY-NC-ND 4.0',
      ],
    });
  });
  test.each<[string, unknown]>([
    ['an extra envelope key', { ...raw(), preview: true }],
    ['an extra edition key', at(['edition', 'image'], 'https://x.test/a.png')],
    ['schema version 2', at(['schema_version'], 2)],
    ['a string schema version', at(['schema_version'], '1')],
    ['a journal date that differs', at(['date'], '2026-10-03')],
    ['an impossible date', at(['date'], '2026-02-30')],
    ['a timestamp as the journal date', at(['date'], '2026-10-04T00:00:00Z')],
    ['an unreadable freeze time', at(['created_at'], 'yesterday')],
    ['an empty freeze time', at(['created_at'], '')],
    ['an unknown kind', at(['edition', 'kind'], 'quote')],
    ['an empty title', at(['edition', 'title'], ' ')],
    ['missing text', without('text')],
    ['a numeric subject', at(['edition', 'subject'], 7)],
    ['an http link', at(['edition', 'url'], 'http://opax.com.au/bill/x')],
    ['a foreign host', at(['edition', 'url'], 'https://evil.test/bill/x')],
    [
      'a lookalike host',
      at(['edition', 'url'], 'https://opax.com.au.evil.test/bill/x'),
    ],
    [
      'a subdomain',
      at(['edition', 'url'], 'https://staging.opax.com.au/bill/x'),
    ],
    ['a port', at(['edition', 'url'], 'https://opax.com.au:8443/bill/x')],
    ['credentials', at(['edition', 'url'], 'https://a:b@opax.com.au/bill/x')],
    ['an Ask link', at(['edition', 'url'], 'https://opax.com.au/ask?q=x')],
    ['an API link', at(['edition', 'url'], 'https://opax.com.au/api/brief')],
    ['the today redirect', at(['edition', 'url'], 'https://opax.com.au/today')],
    ['a relative link', at(['edition', 'url'], '/bill/x')],
    [
      'too few slides',
      at(['edition', 'slides'], decoded.edition.slides!.slice(3)),
    ],
    [
      'eleven slides',
      at(
        ['edition', 'slides'],
        [
          decoded.edition.slides![0],
          ...Array(9).fill(decoded.edition.slides![1]),
          decoded.edition.slides![4],
        ],
      ),
    ],
    ['no cover first', at(['edition', 'slides', 0, 'type'], 'number')],
    ['no source last', at(['edition', 'slides', 4, 'type'], 'list')],
    [
      'source rows that are not text',
      at(['edition', 'slides', 4, 'rows'], [1]),
    ],
    ['slides as an object', at(['edition', 'slides'], {})],
    ['an array body', [raw()]],
    ['the 404 body', { error: 'edition_not_published', date: '2026-10-04' }],
    ['null', null],
  ])('refuses %s', (_name, input) => {
    expect(() => decodeEdition(input)).toThrow();
  });
  test('tolerates only what the contract allows: stored slide fields, and no caption or slides', () => {
    expect(() =>
      decodeEdition(at(['edition', 'slides', 0, 'insetCredit'], null)),
    ).not.toThrow();
    expect(() =>
      decodeEdition(at(['edition', 'slides', 2, 'futureField'], [1, 2])),
    ).not.toThrow();
    const plain = decodeEdition(without('slides'));
    expect(plain.edition.slides).toBeUndefined();
    expect(() => decodeEdition(at(['edition', 'caption'], ''))).not.toThrow();
  });
  test.each([
    at(['edition', 'slides', 2, 'type'], 'video'),
    at(['edition', 'slides', 1, 'alt'], undefined),
    at(['edition', 'slides', 1, 'note'], 3),
  ])(
    'drops a malformed content slide while retaining cover and source',
    (input) => {
      const slides = decodeEdition(input).edition.slides!;
      expect(slides).toHaveLength(4);
      expect(slides[0]!.type).toBe('cover');
      expect(slides.at(-1)!.type).toBe('source');
    },
  );
  test('null optional edition fields are missing', () => {
    expect(decodeEdition(at(['edition', 'caption'], null))).toEqual(
      decodeEdition(without('caption')),
    );
    expect(decodeEdition(at(['edition', 'slides'], null))).toEqual(
      decodeEdition(without('slides')),
    );
    expect(decodeEdition(at(['edition', 'slides', 1, 'note'], null))).toEqual(
      decodeEdition(at(['edition', 'slides', 1, 'note'], undefined)),
    );
  });
  test('a fragment on the link is accepted, as the Worker does, and dropped', () => {
    const anchored = decodeEdition(
      at(['edition', 'url'], 'https://opax.com.au/bill/au-federal-r7529#votes'),
    );
    expect(editionFor(anchored).data!.path).toBe('/bill/au-federal-r7529');
  });
  test.each([
    'https://opax.com.au/subject/person/Tony%20Abbott',
    'https://opax.com.au/money/grants/federal/recipient/abn:83140439239?award=GA12345',
    'https://opax.com.au/money/grants?jur=federal&program=abc',
    'https://opax.com.au/money/grants?jur=federal&largest=2026-08',
    'https://opax.com.au/reports/housing',
  ])("accepts the publisher's link form %s", (url) => {
    expect(decodeEdition(at(['edition', 'url'], url)).edition.url).toBe(url);
  });
});

describe('the edition selector', () => {
  test('keeps the post verbatim, less its link line and its clipped title', () => {
    const view = editionFor(decoded);
    expect(view).toMatchObject({
      status: 'ready',
      asAt: '2026-10-04',
      sources: [{ label: 'OPAX daily edition', url: '/bill/au-federal-r7529' }],
      stale: false,
      savedAt: null,
    });
    expect(view.data).toEqual({
      date: '2026-10-04',
      kind: 'bill',
      kindLabel: 'Bill',
      title: decoded.edition.title,
      paragraphs: [
        'This bill would keep funding grants that support pay for early childhood education and care workers.',
        'Passed 18 Sep 2026.',
      ],
      path: '/bill/au-federal-r7529',
      machineWritten: {
        attribution:
          'Written by a model from the explanatory memorandum; not the record.',
      },
      sourceRows: [
        'Explanatory memorandum on ParlInfo, CC BY-NC-ND 4.0',
        'Bill home page on ParlInfo, CC BY-NC-ND 4.0',
      ],
    });
    for (const paragraph of view.data!.paragraphs)
      expect(decoded.edition.text).toContain(paragraph);
    for (const row of view.data!.sourceRows)
      expect(JSON.stringify(decoded.edition.slides)).toContain(row);
  });
  test("a bill's attribution: its summary slide, else the caption's line, else the web's", () => {
    const own = decodeEdition(
      at(
        ['edition', 'slides', 1, 'note'],
        'Summary drafted by a model from the explanatory memorandum.',
      ),
    );
    expect(editionFor(own).data!.machineWritten).toEqual({
      attribution:
        'Summary drafted by a model from the explanatory memorandum.',
    });
    const captionOnly = decodeEdition(without('slides'));
    expect(editionFor(captionOnly).data!.machineWritten).toEqual({
      attribution:
        'Machine-written summary; check the bill text for the full detail.',
    });
    const bare = decodeEdition(
      replaceAt(without('caption'), ['edition', 'slides'], undefined),
    );
    expect(editionFor(bare).data!.machineWritten).toEqual({
      attribution: billSummaryAttribution,
    });
    expect(editionFor(bare).data!.sourceRows).toEqual([]);
  });
  test('a caption that only mentions machine-written text is not an attribution', () => {
    const topic = decodeEdition(
      replaceAt(
        replaceAt(
          replaceAt(
            replaceAt(raw(), ['edition', 'kind'], 'topic'),
            ['edition', 'url'],
            'https://opax.com.au/reports/early-childhood',
          ),
          ['edition', 'slides', 1, 'note'],
          null,
        ),
        ['edition', 'caption'],
        'Every speech is cited; machine-written briefs are labelled on the web.',
      ),
    );
    expect(editionFor(topic).data!.machineWritten).toBeNull();
  });
  test('a figures edition with no model attribution is not labelled machine-written', () => {
    const topic = decodeEdition(
      replaceAt(
        replaceAt(
          replaceAt(without('caption'), ['edition', 'kind'], 'topic'),
          ['edition', 'url'],
          'https://opax.com.au/reports/early-childhood',
        ),
        ['edition', 'slides', 1, 'note'],
        'Bars are relative to the most frequent speaker in the collection.',
      ),
    );
    const view = editionFor(topic).data!;
    expect(view.machineWritten).toBeNull();
    expect(view.kindLabel).toBe('Topic');
    expect(view.path).toBe('/reports/early-childhood');
  });
  test('server text stays plain text: markup and other links are kept as written', () => {
    const marked = decodeEdition(
      at(
        ['edition', 'text'],
        '<b>Bold</b> &amp; <a href="https://evil.test">x</a>\n\nSee https://evil.test/a\n\nhttps://opax.com.au/bill/au-federal-r7529',
      ),
    );
    expect(editionFor(marked).data!.paragraphs).toEqual([
      '<b>Bold</b> &amp; <a href="https://evil.test">x</a>',
      'See https://evil.test/a',
    ]);
  });
  test('a grant link keeps its award query for the web page', () => {
    const grant = decodeEdition(
      replaceAt(
        at(['edition', 'kind'], 'grant'),
        ['edition', 'url'],
        'https://opax.com.au/money/grants/federal/recipient/abn:83140439239?award=GA12345',
      ),
    );
    expect(editionFor(grant).data!.path).toBe(
      '/money/grants/federal/recipient/abn:83140439239?award=GA12345',
    );
  });
});

describe('the transport allow-list', () => {
  test('allows the latest edition only', () => {
    expect(() => assertAllowedPath(editionPath)).not.toThrow();
    expect(editionPath).toBe('/api/app/v1/edition/latest');
  });
  test.each([
    '/api/app/v1/edition/today',
    '/api/app/v1/edition/2026-10-04',
    '/api/app/v1/edition/latest?x=1',
    '/api/app/v1/edition/latest/',
    '/api/app/v1/edition/',
    '/api/app/v1/edition/LATEST',
    '/API/app/v1/edition/latest',
    '/api/app/v1/edition/%6catest',
    '/api/app/v1/edition/../manifest',
    '/api/app/v1/manifest',
    '/api/daily-post/preview',
    '/og/story/2026-10-04/1.png',
    '//opax.com.au/api/app/v1/edition/latest',
  ])('refuses %s', (path) => {
    expect(() => assertAllowedPath(path)).toThrow();
  });
});

class MemoryStore implements CacheStore {
  entries: CacheEntry[] = [];
  index: CacheIndexEntry[] = [];
  async readIndex() {
    return this.index;
  }
  async writeIndex(entries: CacheIndexEntry[]) {
    this.index = entries;
  }
  async read(url: string) {
    return this.entries.find((entry) => entry.url === url);
  }
  async write(entry: CacheEntry) {
    this.entries = [
      entry,
      ...this.entries.filter((item) => item.url !== entry.url),
    ];
  }
  async remove(url: string) {
    this.entries = this.entries.filter((entry) => entry.url !== url);
  }
}
const origin = 'https://api.example.test';
const served = (status = 200, body: BodyInit | null = new Uint8Array(bytes)) =>
  new Response(body, {
    status,
    headers:
      status === 200
        ? {
            'Cache-Control': 'public, max-age=300, must-revalidate',
            ETag: 'W/"pinned"',
          }
        : status === 404
          ? { 'Cache-Control': 'public, max-age=60, must-revalidate' }
          : { 'Cache-Control': 'no-store', 'Retry-After': '60' },
  });
function setup(...responses: (Response | Error)[]) {
  let time = 1_000;
  const transport = jest.fn(async (url: string) => {
    expect(url).toBe(`${origin}${editionPath}`);
    const next = responses.shift() ?? new TypeError('Network request failed');
    if (next instanceof Error) throw next;
    return next;
  });
  // The disk store outlives the app; a relaunch builds a new cache and client.
  const store = new MemoryStore();
  const launch = () =>
    new Catalogs(
      new ApiClient({
        origin,
        version: '0.1.0',
        build: '3',
        cache: new CatalogCache(store),
        transport: transport as unknown as typeof fetch,
        now: () => time,
        retries: 0,
      }),
    );
  return {
    catalogs: launch(),
    relaunch: launch,
    store,
    transport,
    later: (ms: number) => {
      time += ms;
    },
  };
}
const notPublished = () =>
  served(404, '{"error":"edition_not_published","date":"2026-10-04"}');

describe('todayEdition()', () => {
  test('reads the edition once, then serves the saved copy while it is fresh', async () => {
    const { catalogs, transport, later } = setup(served());
    const first = await catalogs.todayEdition();
    expect(first).toMatchObject({
      status: 'ready',
      stale: false,
      savedAt: 1000,
    });
    expect(first.data!.title).toBe(decoded.edition.title);
    later(299_000);
    expect((await catalogs.todayEdition()).data!.title).toBe(
      decoded.edition.title,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]).toEqual([
      `${origin}${editionPath}`,
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
    ]);
  });
  test('a pull to refresh asks again even while the copy is fresh', async () => {
    const { catalogs, transport } = setup(served(), served());
    await catalogs.todayEdition();
    await catalogs.todayEdition(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  test('offline after expiry keeps the saved edition readable and marked stale', async () => {
    const { catalogs, later } = setup(served(), new TypeError('offline'));
    await catalogs.todayEdition();
    later(301_000);
    const saved = await catalogs.todayEdition();
    expect(saved).toMatchObject({
      status: 'ready',
      stale: true,
      savedAt: 1000,
    });
    expect(saved.asAt).toBe('2026-10-04');
  });
  test('a 503 falls back to the saved copy; with nothing saved it is an error', async () => {
    const cached = setup(served(), served(503));
    await cached.catalogs.todayEdition();
    cached.later(301_000);
    expect(await cached.catalogs.todayEdition()).toMatchObject({
      status: 'ready',
      stale: true,
    });
    expect(await setup(served(503)).catalogs.todayEdition()).toMatchObject({
      status: 'error',
      data: null,
      error: { code: 'server' },
    });
  });
  test('offline with nothing saved is an offline error, never invented content', async () => {
    expect(
      await setup(new TypeError('offline')).catalogs.todayEdition(),
    ).toMatchObject({
      status: 'error',
      data: null,
      error: { code: 'offline' },
    });
  });
  test('a 404 means no edition: missing, not an error, even over a saved copy', async () => {
    const empty = await setup(
      served(404, '{"error":"edition_not_published","date":"2026-10-04"}'),
    ).catalogs.todayEdition();
    expect(empty).toEqual({
      data: null,
      status: 'missing',
      asAt: null,
      sources: [],
      stale: false,
      savedAt: null,
    });
    const { catalogs, later } = setup(served(), notPublished());
    await catalogs.todayEdition();
    later(301_000);
    expect((await catalogs.todayEdition()).status).toBe('missing');
  });
  test('a forced 404 replaces a fresh saved edition: a relaunch stays absent without asking', async () => {
    const { catalogs, relaunch, transport, store } = setup(
      served(),
      notPublished(),
    );
    expect((await catalogs.todayEdition()).status).toBe('ready');
    expect((await catalogs.todayEdition(true)).status).toBe('missing');
    // The 200 would still be fresh for four more minutes; the absence is
    // saved in its place with the 404's own minute.
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]!.body).toEqual({
      error: 'edition_not_published',
      date: '2026-10-04',
    });
    expect(await relaunch().todayEdition()).toMatchObject({
      status: 'missing',
      data: null,
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  test('after expiry, a 404 then an offline relaunch never brings the edition back', async () => {
    const { catalogs, relaunch, later } = setup(
      served(),
      notPublished(),
      new TypeError('offline'),
      new TypeError('offline'),
    );
    await catalogs.todayEdition();
    later(301_000);
    expect((await catalogs.todayEdition()).status).toBe('missing');
    // Offline within the absence's minute, then long after it.
    expect((await relaunch().todayEdition()).status).toBe('missing');
    later(61_000);
    expect(await relaunch().todayEdition()).toMatchObject({
      status: 'missing',
      data: null,
    });
    later(86_400_000);
    expect((await relaunch().todayEdition()).status).toBe('missing');
  });
  test('a saved absence gives way to the next posted edition', async () => {
    const { catalogs, relaunch, later } = setup(notPublished(), served());
    expect((await catalogs.todayEdition()).status).toBe('missing');
    later(61_000);
    const next = await relaunch().todayEdition();
    expect(next).toMatchObject({ status: 'ready', stale: false });
    expect(next.data!.title).toBe(decoded.edition.title);
  });
  test('a Worker without the reader (404 not_found) is absence too', async () => {
    expect(
      (
        await setup(
          served(404, '{"error":"not_found"}'),
        ).catalogs.todayEdition()
      ).status,
    ).toBe('missing');
  });
  test.each([
    ['an empty object', '{}'],
    [
      'an extra key',
      '{"error":"edition_not_published","date":"2026-10-04","x":1}',
    ],
    [
      'an impossible date',
      '{"error":"edition_not_published","date":"2026-02-30"}',
    ],
    ['another error', '{"error":"invalid_date"}'],
    ['an HTML page', '<html>Not found</html>'],
  ])(
    'a 404 with %s is unreadable, not absence, and keeps the saved edition',
    async (_name, body) => {
      const { catalogs, later } = setup(
        served(),
        served(404, body),
        new TypeError('offline'),
      );
      await catalogs.todayEdition();
      later(301_000);
      expect(await catalogs.todayEdition()).toMatchObject({
        status: 'ready',
        stale: true,
        savedAt: 1000,
      });
      expect(await catalogs.todayEdition()).toMatchObject({
        status: 'ready',
        stale: true,
      });
    },
  );
  test.each<[string, Response]>([
    ['broken JSON', served(200, '{"schema_version":1,')],
    ['a contract change', served(200, JSON.stringify({ ...raw(), extra: 1 }))],
    [
      'a foreign link',
      served(
        200,
        JSON.stringify(at(['edition', 'url'], 'https://evil.test/bill/x')),
      ),
    ],
  ])('%s is an invalid-data error', async (_name, response) => {
    expect(await setup(response).catalogs.todayEdition()).toMatchObject({
      status: 'error',
      data: null,
      error: { code: 'invalid-data' },
    });
  });
  test('a malformed response serves the last good saved edition', async () => {
    const { catalogs, later } = setup(
      served(),
      served(200, '{"bad":true}'),
      new TypeError('offline'),
    );
    await catalogs.todayEdition();
    later(301_000);
    expect(await catalogs.todayEdition()).toMatchObject({
      status: 'ready',
      stale: true,
      savedAt: 1000,
    });
    const saved = await catalogs.todayEdition();
    expect(saved).toMatchObject({ status: 'ready', stale: true });
    expect(saved.data!.title).toBe(decoded.edition.title);
  });
  test('a forbidden network block is an error, not a hidden card', async () => {
    expect(
      await setup(served(403, '{"error":"forbidden"}')).catalogs.todayEdition(),
    ).toMatchObject({ status: 'error', error: { code: 'forbidden' } });
  });
});
