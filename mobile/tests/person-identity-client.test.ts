// Reviewer real-client invalidation proof, retained for snapshot-index regressions.
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheStore,
  type CacheIndexEntry,
} from '../src/api/cache';
import { Catalogs } from '../src/api/catalogs';
import {
  manifest as pinnedManifest,
  pinned,
  slugs as pinnedSlugs,
} from './pinned';

class MemoryStore implements CacheStore {
  entries: CacheEntry[] = [];
  index: CacheIndexEntry[] = [];
  async readIndex() {
    return this.index;
  }
  async writeIndex(e: CacheIndexEntry[]) {
    this.index = e;
  }
  async read(url: string) {
    return this.entries.find((e) => e.url === url);
  }
  async write(entry: CacheEntry) {
    this.entries = [entry, ...this.entries.filter((i) => i.url !== entry.url)];
  }
  async remove(url: string) {
    this.entries = this.entries.filter((e) => e.url !== url);
  }
}
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16) + ':' + s.length;
};
const peopleUrl = pinnedManifest.people_url;
type Server = {
  overrides: Map<string, unknown>;
  offline: boolean;
  requests: number;
  notModified: number;
};
function makeServer(): Server {
  return { overrides: new Map(), offline: false, requests: 0, notModified: 0 };
}
function client(server: Server) {
  const raw = (path: string) =>
    server.overrides.has(path)
      ? server.overrides.get(path)
      : path === '/api/person-slugs'
        ? JSON.parse(JSON.stringify(pinnedSlugs))
        : pinned(path);
  const transport = (async (input: RequestInfo | URL, init?: RequestInit) => {
    server.requests++;
    if (server.offline) throw new TypeError('Network request failed');
    const url = new URL(String(input));
    const text = JSON.stringify(raw(url.pathname + url.search));
    const etag = `"${hash(text)}"`;
    const headers = { etag, 'cache-control': 'max-age=300' };
    if ((init?.headers as Record<string, string>)?.['If-None-Match'] === etag) {
      server.notModified++;
      return new Response(null, { status: 304, headers });
    }
    return new Response(text, {
      status: 200,
      headers: { ...headers, 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const api = new ApiClient({
    origin: 'https://example.test',
    version: '0.1.0',
    build: '1',
    cache: new CatalogCache(new MemoryStore(), 64 * 1024 * 1024, 500),
    transport,
    retries: 0,
  });
  return new Catalogs(api);
}
const strip = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (k, x) =>
      k === 'savedAt' || k === 'stale' ? undefined : x,
    ),
  );
const SLUGS = [
  'anthony-albanese',
  'penny-wong',
  'adam-bandt',
  'pauline-hanson',
  'peter-dutton',
  'barnaby-joyce',
];
async function snapshot(c: Catalogs, refresh: boolean) {
  const party = await c.partyPage('Labor', refresh);
  const greens = await c.partyPage('Greens', refresh);
  const people: unknown[] = [];
  for (const s of SLUGS) {
    try {
      people.push(strip((await c.person(s)).data));
    } catch (e) {
      people.push((e as Error).message);
    }
  }
  return strip({ party: party.data, greens: greens.data, people });
}
function mutatePeople() {
  const p = structuredClone(pinned(peopleUrl)) as {
    people: { electorates: { current: boolean; party?: string }[] }[];
  };
  let moved = 0;
  for (const person of p.people)
    for (const s of person.electorates)
      if (s.current && s.party === 'Labor' && moved < 5) {
        s.party = 'Greens';
        moved++;
      }
  expect(moved).toBe(5);
  return p;
}
function mutateRoster() {
  const r = structuredClone(pinned('/parliamentarians.json')) as {
    people: { name: string; party?: string }[];
  };
  let changed = 0;
  for (const row of r.people)
    if (/labor/i.test(row.party ?? '') && changed < 25) {
      row.party = 'Greens';
      changed++;
    }
  r.people = r.people.filter((row) => row.name !== 'Albanese');
  return r;
}
function mutateSlugs() {
  const s = JSON.parse(JSON.stringify(pinnedSlugs));
  delete s.slugs['anthony-albanese'];
  delete s.slugs['penny-wong'];
  return s;
}
function mutateManifest() {
  const m = structuredClone(pinned('/electorates/manifest.json')) as {
    sources: unknown[];
  };
  m.sources = [];
  return m;
}
test('forced refresh, 304, fresh cache and offline fallback never serve a stale join', async () => {
  const server = makeServer();
  const warm = client(server);
  const baseline = await snapshot(warm, false);
  // 304 path: same bytes, same objects, same output.
  const before304 = server.notModified;
  expect(await snapshot(warm, true)).toEqual(baseline);
  expect(server.notModified).toBeGreaterThan(before304);
  const steps: [string, string, () => unknown][] = [
    ['people only', peopleUrl, mutatePeople],
    ['roster only', '/parliamentarians.json', mutateRoster],
    ['slugs only', '/api/person-slugs', mutateSlugs],
    ['manifest only', '/electorates/manifest.json', mutateManifest],
  ];
  let previous = baseline;
  for (const [label, path, mutate] of steps) {
    server.overrides.set(path, mutate());
    const after = await snapshot(warm, true);
    const coldServer = makeServer();
    coldServer.overrides = new Map(server.overrides);
    const expected = await snapshot(client(coldServer), false);
    expect({ label, after }).toEqual({ label, after: expected });
    expect({
      label,
      changed: JSON.stringify(after) !== JSON.stringify(previous),
    }).toEqual({ label, changed: true });
    // Within max-age, a non-forced read returns the refreshed record, not the old join.
    expect(await snapshot(warm, false)).toEqual(expected);
    // Offline: the last good saved copy (the refreshed one) is served.
    server.offline = true;
    expect(await snapshot(warm, true)).toEqual(expected);
    server.offline = false;
    previous = expected;
  }
}, 600000);
