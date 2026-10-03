// Offline, data-only server. No Worker import, proxy, fetch, email or model path.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import snapshot from './fixture-snapshot.json';
import { assertAllowedPath, type CatalogKind } from '../src/api/policy';
import { assertPortraitPath } from '../src/api/portrait-policy';
import { fixtureBytes } from '../tests/fixture-bytes';
import { catalogSearchRows } from '../src/api/catalog-search';
import {
  decodePay,
  decodeExpenses,
  decodeInterest,
  decodeRecentInterests,
} from '../src/api/catalogs';
import type {
  Roster,
  PeopleCatalog,
  Manifest,
  CatalogRecord,
} from '../src/api/catalogs';
const port = Number(process.env.OPAX_FIXTURE_PORT ?? 8910);
if (!Number.isInteger(port) || port < 8900 || port > 8999)
  throw new Error('Fixture port must be 8900–8999');
const files = new Map<string, Buffer>();
const pinnedBytes = fixtureBytes(snapshot);
for (const path of Object.keys(snapshot.files)) {
  if (snapshot.testOnlyFiles.includes(path)) continue;
  if (path.endsWith('.webp')) assertPortraitPath(path);
  else assertAllowedPath(path);
  files.set(path, pinnedBytes(path));
}
const manifest = JSON.parse(
  files.get('/electorates/manifest.json')!.toString(),
) as Manifest;
const roster = JSON.parse(
  files.get('/parliamentarians.json')!.toString(),
) as Roster;
const people = JSON.parse(
  files.get(manifest.people_url)!.toString(),
) as PeopleCatalog;
// OPAX's public slug contract; highest speech count owns colliding spellings.
const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘ʼ`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const rows = new Map<string, { name: string; speeches: number }>();
for (const row of roster.people as (Roster['people'][number] & {
  speeches: number;
})[]) {
  const slug = slugOf(row.name);
  const previous = rows.get(slug);
  if (!previous || row.speeches > previous.speeches) rows.set(slug, row);
}
for (const person of people.people) {
  if (
    person.electorates.some((seat) => seat.current) &&
    ![person.name, ...person.aliases].some((name) => rows.has(slugOf(name)))
  )
    rows.set(slugOf(person.name), { name: person.name, speeches: 0 });
}
const slugs = Object.fromEntries(
  [...rows].map(([slug, row]) => [slug, row.name]),
);
const fixtureCatalogs = {
  pay: decodePay(JSON.parse(files.get('/pay.json')!.toString())),
  expenses: decodeExpenses(JSON.parse(files.get('/expenses.json')!.toString())),
  recent: decodeRecentInterests(
    JSON.parse(files.get('/interests/recent.json')!.toString()),
  ),
  interests: [...files]
    .filter(([path]) => /^\/interests\/(?:\d+|n-[a-z0-9-]+)\.json$/.test(path))
    .map(([, body]) => decodeInterest(JSON.parse(body.toString()))),
};
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export const server = createServer((request, response) => {
  let status = 200;
  let loud = false;
  const path = request.url ?? '/';
  response.on('finish', () =>
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        method: request.method,
        path,
        status,
        allowed: !loud,
        host: request.headers.host,
        userAgent: request.headers['user-agent'],
      }),
    ),
  );
  try {
    if (request.headers.host !== `127.0.0.1:${port}`)
      throw new Error('Host is outside the loopback fixture boundary');
    if (request.method !== 'GET') throw new Error('Only GET is allowed');
    if (path.endsWith('.webp')) assertPortraitPath(path);
    else assertAllowedPath(path);
    const url = new URL(path, `http://127.0.0.1:${port}`);
    let body = files.get(url.pathname);
    let cacheControl = 'public, max-age=300';
    if (url.pathname === '/api/person-slugs') {
      body = Buffer.from(
        JSON.stringify({ generated: roster.meta.generated, slugs }),
      );
      cacheControl = 'public, max-age=3600';
    } else if (url.pathname === '/api/search-all') {
      const kind = url.searchParams.get('kind') as CatalogKind;
      const query = url.searchParams.get('q')!;
      const terms = normalize(query).trim().split(/\s+/);
      const results: CatalogRecord[] =
        kind !== 'person'
          ? catalogSearchRows(kind, fixtureCatalogs).filter((row) =>
              terms.every((term) =>
                normalize(`${row.title} ${row.snippet}`).includes(term),
              ),
            )
          : Object.entries(slugs)
              .filter(([, name]) =>
                terms.every((term) => normalize(name).includes(term)),
              )
              .map(([slug, name]) => {
                const member = people.people.find(
                  (person) =>
                    person.name === name || person.aliases.includes(name),
                );
                const seat = member?.electorates.find((seat) => seat.current);
                return {
                  kind: 'person',
                  slug: `catalog-${roster.people.findIndex((person) => person.name === name) >= 0 ? roster.people.findIndex((person) => person.name === name) : roster.people.length + Object.keys(slugs).indexOf(slug)}`,
                  title: name,
                  href: `/subject/person/${encodeURIComponent(name)}`,
                  resource: '',
                  snippet: seat
                    ? `${seat.party ?? 'Party not recorded'} · ${seat.name} · as at ${seat.as_of}`
                    : 'In the public parliamentary record',
                };
              });
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const per = Math.min(
        200,
        Math.max(1, Number(url.searchParams.get('per') ?? 20)),
      );
      body = Buffer.from(
        JSON.stringify({
          query,
          kind,
          sort: 'relevance',
          page,
          per_page: per,
          page_count: Math.ceil(results.length / per),
          total: results.length,
          count: Math.min(per, results.length),
          truncated: false,
          years: {},
          results: results.slice((page - 1) * per, page * per),
          warnings: [],
          catalog_matches: results.length,
          coverage:
            'Pinned public catalogs; local matching, not production index ranking. Register detail search covers only pinned members; recent declarations retain the complete pinned feed.',
        }),
      );
      cacheControl = 'no-store';
    }
    if (!body) throw new Error('Path not in the pinned journey snapshot');
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    response.setHeader(
      'Content-Type',
      url.pathname.endsWith('.webp') ? 'image/webp' : 'application/json',
    );
    response.setHeader('Cache-Control', cacheControl);
    response.setHeader('ETag', etag);
    if (request.headers['if-none-match'] === etag) {
      status = 304;
      response.writeHead(status);
      response.end();
    } else {
      response.writeHead(200);
      response.end(body);
    }
  } catch (error) {
    status = 404;
    loud = true;
    console.error(
      `OUTSIDE_ALLOW_LIST ${request.method} ${path}: ${error instanceof Error ? error.message : 'Rejected'}`,
    );
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(
      JSON.stringify({ error: 'Route is outside the fixture allow-list' }),
    );
  }
});
// Future fake voice relay hook: replace this rejection with a local, explicit upgrade handler.
server.on('upgrade', (request, socket) => {
  console.error(`OUTSIDE_ALLOW_LIST UPGRADE ${request.url}`);
  socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `OPAX_FIXTURE_READY port=${port} files=${files.size} offline=true`,
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
