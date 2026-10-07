import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import fixtures from '../scripts/fixtures/records/contracts.json';
import {
  decodeDocument,
  decodeBillText,
  decodeBillTextManifest,
  decodeRecent,
  decodeSimilar,
  textChunks,
} from '../src/features/records/model';
import {
  bibtexFor,
  risFor,
  citationsFor,
  titleSubject,
} from '../src/features/records/citations';
import { assertAllowedPath } from '../src/api/policy';
import { fromWebPath } from '../src/navigation/routes';
const responses: Record<string, unknown> = fixtures.responses;
const speech = decodeDocument(responses['/api/resource/speech-1205524']);
const source = readFileSync(
  resolve(__dirname, '../../portal/public/app.js'),
  'utf8',
);
function webFunctions() {
  const ast = ts.createSourceFile(
    'app.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const names = new Set([
    'fmtDate',
    'splitName',
    'opaxUrl',
    'searchResultHref',
    'searchResultUrl',
    'bibtexFor',
    'risFor',
    'citePanelHTML',
    'titleDateForms',
    'titleSubject',
  ]);
  const functions = ast.statements
    .filter((n) => ts.isFunctionDeclaration(n) && names.has(n.name?.text ?? ''))
    .map((n) => n.getText(ast))
    .join('\n');
  const context = {
    MONTHS: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    STATE_NAMES: {
      federal: 'Federal',
      nsw: 'NSW',
      vic: 'VIC',
      sa: 'SA',
      qld: 'QLD',
      act: 'ACT',
    },
    corpusVersion: () => '2026-10-03',
    localISODate: () => '2026-10-07',
    esc: (s: unknown) => String(s),
    safeUrl: (s: unknown) => (typeof s === 'string' ? s : ''),
    siteUrl: (p: string) => 'https://opax.com.au' + p,
    titleKey: (s: unknown) =>
      String(s ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
  };
  return runInNewContext(
    `${functions}; ({bibtexFor,risFor,citePanelHTML,titleSubject})`,
    context,
  );
}
const web = webFunctions();
const context = {
  origin: 'https://opax.com.au',
  corpusVersion: '2026-10-03',
  accessed: '2026-10-07',
};

test.each(
  Object.entries(responses).filter(([p]) => p.startsWith('/api/resource/')),
)('pinned record shape decodes without cutting its text: %s', (path, raw) => {
  const doc = decodeDocument(raw);
  expect(doc.text).toBe((raw as { text: string }).text);
  expect(textChunks(doc.text).join('')).toBe(doc.text);
  expect(fromWebPath(path.replace('/api/resource/', '/doc/'))).toEqual({
    pathname: '/doc/[slug]',
    params: { slug: doc.slug },
  });
});
test('division has no speaker; press-release office and witnesses remain data rather than native profiles', () => {
  const division = decodeDocument(
    responses['/api/resource/division-federal-senate-10701'],
  );
  expect(division.speaker).toBeNull();
  const release = decodeDocument(
    responses['/api/resource/press-pmt-reader-fixture'],
  );
  expect(release.labels.kind).toBe('press_release');
});
test('record, recent and similar decoders reject invalid identifiers and malformed fields', () => {
  for (const bad of [
    null,
    {},
    { ...speech, slug: '../../admin' },
    { ...speech, text: 4 },
    { ...speech, labels: [] },
  ])
    expect(() => decodeDocument(bad)).toThrow();
  expect(decodeRecent(responses['/api/recent'])).toHaveLength(3);
  expect(() =>
    decodeRecent({
      items: [{ slug: 'private-person-1', title: 'Private', indexed: null }],
    }),
  ).toThrow();
  expect(decodeSimilar(responses['/api/search'])).toHaveLength(2);
  expect(() =>
    decodeSimilar({
      results: [{ slug: 'speech-1', title: 'A', date: 'yesterday' }],
    }),
  ).toThrow();
});
test('bill version pair preserves source sections and rejects mismatched or incomplete bytes', () => {
  const manifest = decodeBillTextManifest(
    responses['/bill-texts/au-federal-r7534/index.json'],
  );
  expect(manifest.versions).toHaveLength(2);
  for (const version of manifest.versions) {
    const raw = responses[version.text_url] as Record<string, unknown>,
      doc = decodeBillText(raw);
    expect(doc.sections.map((s) => s.text).join('\n\n')).toBe(doc.text);
    expect(doc.enrichment?.evidence).toHaveLength(1);
    expect(() =>
      decodeBillText({ ...raw, text: doc.text.slice(0, -8) }),
    ).toThrow();
    expect(() => decodeBillText({ ...raw, complete: false })).toThrow();
    expect(() =>
      decodeBillText({ ...raw, bill_key: 'au-federal-r999' }),
    ).toThrow();
    expect(() =>
      decodeBillText({
        ...raw,
        enrichment: {
          brief: 'invalid',
          evidence: [{ quote: 'not in the source', section_id: 'part-1' }],
        },
      }),
    ).toThrow();
  }
  expect(() =>
    decodeBillTextManifest({ ...manifest, default_version_id: 'r7534-absent' }),
  ).toThrow();
});
test('virtualized slices retain long sentences, whitespace, Unicode and the final sentence', () => {
  const text =
    'One sentence.\n\n' +
    '😀 source words '.repeat(500) +
    'ends here.\r\nFinal sentence.';
  const chunks = textChunks(text, 100);
  expect(chunks.join('')).toBe(text);
  expect(chunks.at(-1)).toContain('Final sentence.');
  expect(chunks[0]).toContain('ends here.');
  expect(textChunks('x'.repeat(10000), 100)).toEqual(['x'.repeat(10000)]);
});
test.each([
  speech,
  { ...speech, speaker: null },
  { ...speech, speaker: 'Mononym', title: 'Title {braces}' },
  { ...speech, labels: { ...speech.labels, state: 'nsw' } },
  { ...speech, metadata: {} },
])('all four citation strings equal executed web outputs', (doc) => {
  const html = web.citePanelHTML(doc);
  const strings = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map(
    (m: RegExpMatchArray) => m[1],
  );
  expect(citationsFor(doc, context).map((c) => c.text)).toEqual(strings);
  const src = {
    slug: doc.slug,
    title: doc.title,
    speaker: doc.speaker,
    date: typeof doc.metadata.date === 'string' ? doc.metadata.date : '',
    sourceUrl: doc.url,
  };
  expect(bibtexFor(src, context)).toBe(web.bibtexFor(src));
  expect(risFor(src, context)).toBe(web.risFor(src));
});
test('original bill resource uses the web source-citation form', () => {
  const doc = decodeDocument(
    responses['/api/resource/bill-text-au-federal-r7534-aspassed'],
  );
  const text = web.citePanelHTML(doc).match(/<pre>([\s\S]*?)<\/pre>/)[1];
  expect(citationsFor(doc, context)[0]!.text).toBe(text);
});
test.each([
  speech,
  {
    title: 'Member — Budget — the reply — 2026-10-01',
    speaker: 'Member',
    date: '2026-10-01',
  },
  { title: 'Foreign Name — subject', speaker: 'Someone else' },
  {
    title: 'OFFICE — Release — 2026-10-01',
    labels: { kind: 'press_release' },
    metadata: { role: 'OFFICE', date: '2026-10-01' },
  },
])('subject transform matches the web exactly', (row) =>
  expect(titleSubject(row)).toBe(web.titleSubject(row)),
);
test.each([
  '/api/resource/speech-1',
  '/api/resource/division-federal-senate-1',
  '/api/resource/press-nsw-a',
  '/api/resource/grant-site-evidence-ga566033',
  '/bill-texts/au-federal-r7534/index.json',
  '/bill-texts/au-federal-r7534/r7534-aspassed.json',
  '/api/recent',
  '/api/search?q=Bill&kind=speech&per=6',
  '/api/search?q=Bill&kind=speech&per=6&topic=gambling',
])('exact reviewed record request passes: %s', (p) =>
  expect(() => assertAllowedPath(p)).not.toThrow(),
);
test.each([
  '/api/resource/speech-1?nocache=1',
  '/api/resource/private-1',
  '/api/resource/speech-1/extra',
  '/api/recent?limit=12',
  '/bill-texts/au-federal-r7534/other.json',
  '/bill-texts/au-federal-r7534/r7534-aspassed.json?nocache=1',
  '/api/search?q=x&kind=all&per=6',
  '/api/search?q=x&kind=speech&per=7',
  '/api/search?q=x&kind=speech&per=6&per=6',
  '/api/search?q=x&kind=speech&per=6&mode=keyword',
  '/api/search?q=x&kind=speech&per=6&topic=../private',
  '/api/brief?ids=x',
  '/api/resource/%73peech-1',
  '/api/ask',
])('unreviewed paid requests are still rejected: %s', (p) =>
  expect(() => assertAllowedPath(p)).toThrow(),
);

test('pinned resource responses are generated by the actual Worker handler', async () => {
  const ast = ts.createSourceFile(
    'index.ts',
    readFileSync(resolve(__dirname, '../../portal/src/index.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const fn = ast.statements
    .find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'apiResource')!
    .getText(ast);
  for (const [slug, seed] of Object.entries(fixtures.seeds)) {
    const handler = runInNewContext(ts.transpile(fn) + '; apiResource', {
      Request,
      Response,
      URL,
      isPublicSlug: (s: string) => !!fromWebPath('/doc/' + s),
      DIVISION_SLUG_RE: /^division-/,
      cacheRequest: () => new Request('https://opax.test/cache'),
      cacheBypass: () => true,
      kbFetch: async () => Response.json(seed),
      json: (x: unknown) => Response.json(x),
      cacheStore: () => {},
      withCacheStatus: (r: Response) => r,
      RESOURCE_CACHE_TTL: 3600,
    });
    const req = new Request('https://opax.test/api/resource/' + slug);
    expect(
      await (
        await handler(
          req,
          new URL(req.url),
          slug,
          { CACHE_EPOCH: 'fixture' },
          {},
        )
      ).json(),
    ).toEqual(responses['/api/resource/' + slug]);
  }
});
test('pinned bill manifest and full versions equal actual Worker outputs', async () => {
  const exports: {
    handleBillText?: (r: Request, deps: unknown) => Promise<Response>;
  } = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(resolve(__dirname, '../../portal/src/bill-text.ts'), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    { exports, Response, Request, URL, TextEncoder, crypto: webcrypto },
  );
  const seeds = Object.entries(fixtures.seeds)
    .filter(([slug]) => slug.startsWith('bill-text-'))
    .map(([, seed]) => seed as { slug: string });
  for (const [path, expected] of Object.entries(responses).filter(([path]) =>
    path.startsWith('/bill-texts/'),
  )) {
    const deps = {
      cache: { match: async () => undefined, put: async () => {} },
      waitUntil: () => {},
      kbFetch: async (p: string) =>
        Response.json(
          p === '/catalog'
            ? {
                resources: Object.fromEntries(seeds.map((s, i) => [i, s])),
                fulltext: { total: 2 },
              }
            : seeds.find((s) => p.includes(s.slug)),
        ),
    };
    const actual = await (
      await exports.handleBillText!(
        new Request('https://opax.test' + path),
        deps,
      )
    ).json();
    if (actual.generated_at) actual.generated_at = '2026-10-07T00:00:00.000Z';
    expect(actual).toEqual(expected);
  }
});
