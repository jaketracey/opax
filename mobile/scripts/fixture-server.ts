// Offline, data-only server. No Worker import, proxy, fetch, email or model path.
import { createVoiceFixture } from './voice-fixture';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import snapshot from './fixture-snapshot.json';
import recordFixtures from './fixtures/records/contracts.json';
import {
  assertAllowedPath,
  editionPath,
  type CatalogKind,
} from '../src/api/policy';
import { assertPortraitPath } from '../src/api/portrait-policy';
import { fixtureBytes, responseBytes } from '../tests/fixture-bytes';
import { catalogSearchRows } from '../src/api/catalog-search';
import { searchFixture, searchResourceFixture } from './search-fixture';
import {
  decodeEdition,
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
let port = Number(process.env.OPAX_FIXTURE_PORT ?? 8910);
if (!Number.isInteger(port) || (port !== 0 && (port < 8900 || port > 8999)))
  throw new Error(
    'Fixture port must be 8900–8999 or 0 (OS-assigned loopback port)',
  );

// W13 edition reader: the pinned production response, served verbatim with
// the Worker's validators (appRead). OPAX_FIXTURE_EDITION picks the journal:
// - pinned: the edition is posted;
// - absent: no edition is posted (404 edition_not_published), journey 13b;
// - withdrawn: the edition is served until the app revalidates it (a
//   conditional GET, as a pull to refresh sends), then 404 from then on, as
//   when the posted edition goes, journey 13c. Unconditional launches,
//   including e2e.sh's warm-up, cannot withdraw it early.
// - politician: a parliamentarian's edition, for Today's party-coloured
//   front page (scripts/fixtures/edition-politician.json). It is the 6 Oct
//   2026 Alex Hawke post as the build-4 Today showed it (text and source
//   rows verbatim), with its slides rebuilt by portal/src/daily-post.ts's
//   rules from those figures and the pinned roster row (pid 10290). Its
//   third topic label was not shown, so it is left out, not guessed.
const editionModes = ['pinned', 'absent', 'withdrawn', 'politician'];
const editionMode = process.env.OPAX_FIXTURE_EDITION ?? 'pinned';
if (!editionModes.includes(editionMode))
  throw new Error('OPAX_FIXTURE_EDITION must be pinned, absent or withdrawn');
// Local follows (journey 26). OPAX_FIXTURE_DATA picks the catalogs:
// - pinned: the pinned bytes, as always;
// - changed: one declaration and one bill stage move on, as after a nightly
//   refresh, once the app revalidates either changed file (a conditional GET,
//   as a pull to refresh sends). Until then both are served pinned with a
//   day's max-age, so no expiry mid-journey revalidates them early. The
//   bumps are synthetic: Anthony Albanese's register index count (28 to 29)
//   and the Ending Financial Abuse bill's status (before parliament to
//   passed, as at 1 October 2026). Never used outside this mode.
const dataModes = ['pinned', 'changed'];
const dataMode = process.env.OPAX_FIXTURE_DATA ?? 'pinned';
if (!dataModes.includes(dataMode))
  throw new Error('OPAX_FIXTURE_DATA must be pinned or changed');
const rosterMode = process.env.OPAX_FIXTURE_ROSTER ?? 'pinned';
if (!['pinned', 'null-optional'].includes(rosterMode))
  throw new Error('OPAX_FIXTURE_ROSTER must be pinned or null-optional');
const files = new Map<string, Buffer>();
for (const [path, body] of Object.entries(recordFixtures.responses)) {
  if (path === '/api/search') continue;
  assertAllowedPath(path);
  files.set(path, Buffer.from(JSON.stringify(body)));
}
const pinnedBytes = fixtureBytes(snapshot);
for (const path of Object.keys(snapshot.files)) {
  if (snapshot.testOnlyFiles.includes(path)) continue;
  if (path.endsWith('.webp')) assertPortraitPath(path);
  else assertAllowedPath(path);
  files.set(path, pinnedBytes(path));
}
// Robustness-only opt-in: change one optional field, preserving every
// source fact and all other pinned bytes in the normal fixture mode.
if (rosterMode === 'null-optional') {
  const path = '/parliamentarians.json';
  const raw = JSON.parse(files.get(path)!.toString());
  const row = raw.people.find((p: { pid?: string }) => p.pid === '10007');
  if (!row) throw new Error('Null-optional fixture person is absent');
  row.speeches = null;
  files.set(path, Buffer.from(JSON.stringify(raw)));
  console.log('OPAX_FIXTURE_ROSTER null-optional: pid=10007 speeches=null');
}
let editionWithdrawn = editionMode === 'absent';
let dataChanged = false;
const changedFiles = new Map<string, Buffer>();
if (dataMode === 'changed') {
  const register = JSON.parse(files.get('/interests/index.json')!.toString());
  register.people['10007'].total += 1;
  changedFiles.set(
    '/interests/index.json',
    Buffer.from(JSON.stringify(register)),
  );
  const index = JSON.parse(files.get('/bills/index.json')!.toString());
  const moved = index.bills.find(
    (row: { key: string }) => row.key === 'au-federal-r7549',
  );
  Object.assign(moved, { status: 'passed', status_as_of: '2026-10-01' });
  changedFiles.set('/bills/index.json', Buffer.from(JSON.stringify(index)));
}
const edition =
  editionMode === 'politician'
    ? readFileSync(join(__dirname, 'fixtures/edition-politician.json'))
    : responseBytes(snapshot, editionPath);
const editionDate = decodeEdition(JSON.parse(edition.toString())).date;
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
const bill = JSON.parse(files.get('/bills/au-federal-r7534.json')!.toString());
let voice: Awaited<ReturnType<typeof createVoiceFixture>> | undefined;
export const server = createServer(async (request, response) => {
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
    if (request.socket.remoteAddress !== '127.0.0.1')
      throw new Error('Peer is outside the loopback boundary');
    if (await voice?.route(request, response)) {
      status = response.statusCode;
      return;
    }
    if (request.method !== 'GET') throw new Error('Only GET is allowed');
    if (path.endsWith('.webp')) assertPortraitPath(path);
    else assertAllowedPath(path);
    const url = new URL(path, `http://127.0.0.1:${port}`);
    const search = searchFixture(url, roster);
    if (search) {
      response.writeHead(200, {
        'Content-Type': search.contentType ?? 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(search.body);
      return;
    }
    let body =
      files.get(url.pathname) ?? searchResourceFixture(url.pathname) ?? undefined;
    let cacheControl = 'public, max-age=300';
    const isEdition = url.pathname === editionPath;
    if (
      isEdition &&
      editionMode === 'withdrawn' &&
      request.headers['if-none-match'] !== undefined
    )
      editionWithdrawn = true;
    if (isEdition && editionWithdrawn) {
      status = 404;
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, must-revalidate',
      });
      response.end(
        JSON.stringify({ error: 'edition_not_published', date: editionDate }),
      );
      return;
    }
    if (isEdition) {
      body = edition;
      cacheControl = snapshot.responses[editionPath].cacheControl;
    } else if (url.pathname === '/api/search') {
      body = Buffer.from(JSON.stringify(recordFixtures.responses['/api/search']));
    } else if (url.pathname === '/api/person-slugs') {
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
    if (!body && url.pathname.endsWith('.webp')) {
      status = 404;
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(
        JSON.stringify({ error: 'Portrait not in the pinned image subset' }),
      );
      return;
    }
    if (changedFiles.has(url.pathname)) {
      if (request.headers['if-none-match'] !== undefined) dataChanged = true;
      if (dataChanged) body = changedFiles.get(url.pathname);
      cacheControl = 'public, max-age=86400';
    }
    if (!body) throw new Error('Path not in the pinned journey snapshot');
    const opaque = `"${createHash('sha256').update(body).digest('hex')}"`;
    // The edition answers as appRead does: a weak validator, matched in its
    // weak or strong form, within a list, or by "*".
    const etag = isEdition ? `W/${opaque}` : opaque;
    const validators = String(request.headers['if-none-match'] ?? '')
      .split(',')
      .map((tag) => tag.trim().replace(/^W\//, ''));
    const unchanged = isEdition
      ? validators.includes('*') || validators.includes(opaque)
      : request.headers['if-none-match'] === etag;
    response.setHeader(
      'Content-Type',
      url.pathname.endsWith('.webp')
        ? 'image/webp'
        : isEdition
          ? 'application/json; charset=utf-8'
          : 'application/json',
    );
    response.setHeader('Cache-Control', cacheControl);
    response.setHeader('ETag', etag);
    if (unchanged) {
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
// Authenticated, numeric-loopback fake relay. Never proxies a provider.
server.on('upgrade', (request, socket, head) => {
  if (voice?.upgrade(request, socket, head)) return;
  console.error(`OUTSIDE_ALLOW_LIST UPGRADE ${request.url}`);
  socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
});
server.listen(port, '127.0.0.1', async () => {
  port = (server.address() as { port: number }).port;
  try {
    voice = await createVoiceFixture(port, {
      title: bill.title,
      path: '/bill/au-federal-r7534',
    });
  } catch (error) {
    console.error(
      `VOICE_FIXTURE_DISABLED: ${error instanceof Error ? error.message : 'contract validation failed'}`,
    );
  }
  console.log(
    `OPAX_FIXTURE_READY port=${port} files=${files.size} edition=${editionMode} data=${dataMode} offline=true`,
  );
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    voice?.close();
    server.close(() => process.exit(0));
  });
