import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { get, request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import snapshot from '../scripts/fixture-snapshot.json';
import {
  decodeEdition,
  decodeInterest,
  decodeRoster,
  decodeSearch,
  decodeSlugs,
} from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { decodeDocument, decodeSimilar } from '../src/features/records/model';
import { decodeRecords } from '../src/features/search/decoders';
import {
  decodeRecentDivisions,
  recentReadingVotes,
} from '../src/features/today/votes';
import {
  fixtureHookTimeout,
  startFixture,
  type Fixture,
} from './fixture-process';
import { files, pinned, servedFiles } from './pinned';
let child: ChildProcess;
let primaryFixture: Fixture;
let output = '';
let port = 0; // Each unit-test fixture reserves its own loopback port atomically.
// HTTP completion and the child process's stderr pipe are independent. Wait
// for the actual refusal log rather than assuming it reached Jest first.
function waitForOutput(
  expected: string,
  source = { child, log: () => output },
): Promise<void> {
  if (source.log().includes(expected)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      source.child.stdout!.removeListener('data', check);
      source.child.stderr!.removeListener('data', check);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (source.log().includes(expected)) finish();
    };
    const timer = setTimeout(
      () => finish(new Error(`Missing fixture refusal: ${expected}`)),
      3000,
    );
    source.child.stdout!.on('data', check);
    source.child.stderr!.on('data', check);
  });
}
function request(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = get(
      { hostname: '127.0.0.1', port, path, headers },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += String(chunk)));
        response.on('end', () =>
          resolve({
            status: response.statusCode!,
            body,
            headers: response.headers,
          }),
        );
      },
    );
    req.setTimeout(3000, () =>
      req.destroy(new Error('Fixture request timed out')),
    );
    req.on('error', reject);
  });
}
beforeAll(async () => {
  primaryFixture = startEdition('pinned', { OPAX_TARGET_PLATFORM: 'ios' });
  child = primaryFixture.child;
  const receive = (chunk: Buffer) => (output += chunk.toString());
  child.stdout!.on('data', receive);
  child.stderr!.on('data', receive);
  await primaryFixture.ready;
  port = primaryFixture.port();
}, fixtureHookTimeout);
afterAll(() => primaryFixture?.stop());
test.each([
  ['overview', ''],
  ['albert-park', '/seat/albert-park'],
  ['bendigo-west', '/seat/bendigo-west'],
  ['eureka', '/seat/eureka'],
  ['werribee', '/seat/werribee'],
  ['southern-metropolitan', '/seat/southern-metropolitan'],
  ['find-3350', '/find?q=3350'],
  ['find-9999', '/find?q=9999'],
  ['find-allan', '/find?q=allan'],
  ['find-bass', '/find?q=Bass'],
  ['find-st-kilda', '/find?q=St%20Kilda'],
])(
  'serves the pinned Vic election response %s offline',
  async (file, suffix) => {
    const result = await request(`/api/app/v1/vic-election${suffix}`);
    expect(result.status).toBe(200);
    const pin = JSON.parse(
      readFileSync(
        resolve(__dirname, `../scripts/fixtures/vic-election/${file}.json`),
        'utf8',
      ),
    );
    expect(JSON.parse(result.body)).toEqual(pin);
  },
);
test('year-photo manifest and pinned WebP subset are served as free static files; absent pictures stay offline', async () => {
  const manifest = await request('/years/pictures.json');
  expect(manifest.status).toBe(200);
  expect(JSON.parse(manifest.body)['2025']).toHaveLength(6);
  const picture = await request(
    '/years/pictures/2025/cooper-polling-place.webp',
  );
  expect(picture.status).toBe(200);
  expect(picture.headers['content-type']).toBe('image/webp');
  expect(picture.body.slice(0, 4)).toBe('RIFF');
  expect((await request('/years/pictures/2025/not-pinned.webp')).status).toBe(
    404,
  );
});
test('serves pinned public data, catalog search and conditional ETag responses offline', async () => {
  const roster = await request('/parliamentarians.json');
  expect(roster.status).toBe(200);
  const conditional = await request('/parliamentarians.json', {
    'If-None-Match': String(roster.headers.etag),
  });
  expect(conditional.status).toBe(304);
  expect(conditional.body).toBe('');
  const slugs = JSON.parse((await request('/api/person-slugs')).body);
  expect(slugs.slugs['anthony-albanese']).toBe('Anthony Albanese');
  const search = JSON.parse(
    (await request('/api/search-all?q=Anthony+Albanese&kind=person')).body,
  );
  expect(search.results[0]).toMatchObject({
    kind: 'person',
    href: '/subject/person/Anthony%20Albanese',
  });
});
test.each([
  '/graph/money.json?unreviewed=1',
  '/graph/money.qld.json?nocache=1',
  '/graph/money.vic.json?',
  '/graph/money.tas.json?year=2025',
  '/graph/money.nsw.json',
  '/graph/money.wa.json',
  '/interests/ties-by-donor.json',
  '/api/ask',
  '/api/search?q=x',
  '/api/search-all?q=x&kind=contract',
  '/api/search-all?q=x',
  '/unlisted.json',
  '/api/search-all?q=x&kind=all',
  '/og/person/x',
  '/mcp',
  '/api/resource?id=x',
  '/api/brief',
  '/topics.json',
  '/api/app/v1/edition/today',
  '/api/app/v1/edition/2026-10-04',
  '/api/app/v1/edition/latest?preview=1',
  '/api/app/v1/manifest',
  '/api/daily-post/preview',
  '/reports/index.json',
  '/reports/housing.json',
])('unknown fixture route %s returns 404 and logs loudly', async (path) => {
  const result = await request(path);
  expect(result.status).toBe(404);
  await waitForOutput(`OUTSIDE_ALLOW_LIST GET ${path}`);
  expect(output).toContain(`OUTSIDE_ALLOW_LIST GET ${path}`);
});

test.each(
  servedFiles.filter(
    (p) =>
      p.endsWith('.json') &&
      !['/parliamentarians.json', '/votes.json'].includes(p) &&
      !/^\/electorates\/releases\/[^/]+\/people.json$/.test(p) &&
      (!p.startsWith('/reports/') || p === '/reports/grants-allocation.json'),
  ),
)('serves the exact pinned JSON bytes at %s', async (path) => {
  const result = await request(path);
  expect(result.status).toBe(200);
  expect(createHash('sha256').update(result.body).digest('hex')).toBe(
    files[path],
  );
});
test.each(['person', 'interest', 'pay', 'expense'])(
  'local catalog search serves %s without outbound requests',
  async (kind) => {
    const result = await request(`/api/search-all?q=Albanese&kind=${kind}`);
    expect(result.status).toBe(200);
    const data = decodeSearch(JSON.parse(result.body));
    expect(data.results.length).toBeGreaterThan(0);
    expect(
      data.results.every(
        (row) => row.kind === kind && !row.href.startsWith('/ask'),
      ),
    ).toBe(true);
  },
);
test('serves the pinned production edition byte for byte, with its cache policy', async () => {
  const pin = snapshot.responses[editionPath];
  const result = await request(editionPath);
  expect(result.status).toBe(200);
  expect(createHash('sha256').update(result.body).digest('hex')).toBe(
    pin.sha256,
  );
  expect(result.headers['cache-control']).toBe(pin.cacheControl);
  expect(decodeEdition(JSON.parse(result.body)).date).toBe('2026-10-04');
  const conditional = await request(editionPath, {
    'If-None-Match': String(result.headers.etag),
  });
  expect(conditional.status).toBe(304);
});
// The Worker's appRead: ETag W/"<sha256>"; If-None-Match matches the weak or
// strong form, within a list, or "*", and answers 304 with the same headers.
const editionTag = `W/"${snapshot.responses[editionPath].sha256}"`;
test("the edition carries the Worker's weak validator and content type", async () => {
  const result = await request(editionPath);
  expect(result.headers.etag).toBe(editionTag);
  expect(result.headers['content-type']).toBe(
    'application/json; charset=utf-8',
  );
});
test.each([
  ['the weak tag', editionTag],
  ['the strong form', editionTag.slice(2)],
  ['a list', `"other", ${editionTag}`],
  ['a list with the strong form', `W/"other",${editionTag.slice(2)}`],
  ['any tag', '*'],
])(
  'If-None-Match with %s answers 304, as the Worker does',
  async (_name, tag) => {
    const result = await request(editionPath, { 'If-None-Match': tag });
    expect(result.status).toBe(304);
    expect(result.body).toBe('');
    expect(result.headers.etag).toBe(editionTag);
    expect(result.headers['cache-control']).toBe(
      snapshot.responses[editionPath].cacheControl,
    );
  },
);
test.each(['"other"', 'W/"other"', 'W/"other", "else"'])(
  'If-None-Match %s that names another version gets the full edition',
  async (tag) => {
    const result = await request(editionPath, { 'If-None-Match': tag });
    expect(result.status).toBe(200);
    expect(createHash('sha256').update(result.body).digest('hex')).toBe(
      snapshot.responses[editionPath].sha256,
    );
  },
);
test('catalog files keep their strong validators', async () => {
  const roster = await request('/parliamentarians.json');
  expect(String(roster.headers.etag)).toMatch(/^"[a-f0-9]{64}"$/);
  expect(
    (
      await request('/parliamentarians.json', {
        'If-None-Match': `W/${String(roster.headers.etag)}`,
      })
    ).status,
  ).toBe(200);
});
test('slug API projection validates its full envelope', async () => {
  expect(
    decodeSlugs(JSON.parse((await request('/api/person-slugs')).body)).slugs[
      'madonna-jarrett'
    ],
  ).toBe('Madonna Jarrett');
});

test.each(Object.keys(files).filter((p) => p.endsWith('.webp')))(
  'portrait bytes and MIME stay pinned: %s',
  async (path) => {
    const result = await new Promise<{
      bytes: Buffer;
      mime: string | undefined;
    }>((resolve, reject) => {
      const req = get({ hostname: '127.0.0.1', port, path }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            bytes: Buffer.concat(chunks),
            mime: response.headers['content-type'],
          }),
        );
      });
      req.on('error', reject);
    });
    expect(result.mime).toBe('image/webp');
    expect(createHash('sha256').update(result.bytes).digest('hex')).toBe(
      files[path],
    );
  },
);
test('fixture rejects POST even for an approved GET catalog', async () => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port, path: '/pay.json', method: 'POST' },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
  expect(status).toBe(404);
  await waitForOutput('OUTSIDE_ALLOW_LIST POST /pay.json');
  expect(output).toContain('OUTSIDE_ALLOW_LIST POST /pay.json');
});

test('a production Host header is rejected even on the loopback socket', async () => {
  expect(
    (await request('/parliamentarians.json', { Host: 'opax.com.au' })).status,
  ).toBe(404);
  expect(
    (await request('/parliamentarians.json', { Host: `10.0.2.2:${port}` }))
      .status,
  ).toBe(404);
  await waitForOutput('Host is outside the loopback fixture boundary');
  expect(output).toContain('Host is outside the loopback fixture boundary');
});

// Second servers, as e2e.sh starts them for the edition journeys 13b and 13c.
function startEdition(mode: string, env: Record<string, string> = {}) {
  return startFixture({ OPAX_FIXTURE_EDITION: mode, ...env });
}
function getAt(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    get({ hostname: '127.0.0.1', port, path, headers }, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += String(chunk)));
      response.on('end', () =>
        resolve({
          status: response.statusCode!,
          body,
          headers: response.headers,
        }),
      );
    }).on('error', reject);
  });
}
const notPublished = { error: 'edition_not_published', date: '2026-10-04' };

test(
  'the follow fixture is empty by default and opts into 50 distinct pinned canonical identities',
  async () => {
    expect(
      JSON.parse((await request('/__fixture/follows')).body).follows,
    ).toEqual([]);
    const fixture = startFixture({ OPAX_FIXTURE_FOLLOWS: '50' });
    try {
      await fixture.ready;
      const result = await getAt(fixture.port(), '/__fixture/follows');
      const follows = JSON.parse(result.body).follows as {
        id: string;
        title: string;
      }[];
      const manifest = JSON.parse(
        (await getAt(fixture.port(), '/electorates/manifest.json')).body,
      );
      const pinnedPeople = JSON.parse(
        (await getAt(fixture.port(), manifest.people_url)).body,
      );
      expect(result.status).toBe(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(follows).toHaveLength(50);
      expect(new Set(follows.map((follow) => follow.id)).size).toBe(50);
      for (const { id, title } of follows) {
        expect(pinnedPeople.people).toContainEqual(
          expect.objectContaining({ person_id: id, name: title }),
        );
      }
      expect(
        (
          await getAt(fixture.port(), '/__fixture/follows', {
            Host: 'opax.com.au',
          })
        ).status,
      ).toBe(404);
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

test(
  'Android opts into only its emulator host alias and keeps the path boundary',
  async () => {
    const fixture = startEdition('pinned', {
      OPAX_TARGET_PLATFORM: 'android',
    });
    try {
      await fixture.ready;
      const port = fixture.port();
      expect(
        (
          await getAt(port, '/parliamentarians.json', {
            Host: `10.0.2.2:${port}`,
          })
        ).status,
      ).toBe(200);
      for (const Host of [
        `10.0.2.3:${port}`,
        `10.0.2.2:${port + 1}`,
        'opax.com.au',
      ])
        expect(
          (await getAt(port, '/parliamentarians.json', { Host })).status,
        ).toBe(404);
      expect(
        (await getAt(port, '/api/report', { Host: `10.0.2.2:${port}` })).status,
      ).toBe(404);
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

describe('the no-edition fixture', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = startEdition('absent');
    return fixture.ready;
  }, fixtureHookTimeout);
  afterAll(() => fixture?.stop());
  test('answers the edition as the Worker does when none is posted, without a boundary alarm', async () => {
    expect(fixture.log()).toContain('edition=absent');
    const result = await getAt(fixture.port(), editionPath);
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual(notPublished);
    expect(result.headers['cache-control']).toBe(
      'public, max-age=60, must-revalidate',
    );
    expect(result.headers.etag).toBeUndefined();
    await waitForOutput(
      `"path":"${editionPath}","status":404,"allowed":true`,
      fixture,
    );
    expect(fixture.log()).not.toContain('OUTSIDE_ALLOW_LIST');
    expect(fixture.log()).toContain(
      `"path":"${editionPath}","status":404,"allowed":true`,
    );
  });
});

describe('the withdrawn-edition fixture', () => {
  let fixture: Fixture;
  beforeAll(() => {
    fixture = startEdition('withdrawn');
    return fixture.ready;
  }, fixtureHookTimeout);
  afterAll(() => fixture?.stop());
  test('serves the edition until the app revalidates it, then 404s for good', async () => {
    expect(fixture.log()).toContain('edition=withdrawn');
    // e2e.sh's warm-up launch and the journey's own launch both get it.
    const first = await getAt(fixture.port(), editionPath);
    expect(first.status).toBe(200);
    expect((await getAt(fixture.port(), editionPath)).status).toBe(200);
    // A pull to refresh revalidates with the saved validator.
    const refreshed = await getAt(fixture.port(), editionPath, {
      'If-None-Match': String(first.headers.etag),
    });
    expect(refreshed.status).toBe(404);
    expect(JSON.parse(refreshed.body)).toEqual(notPublished);
    // A relaunch after the absence's minute asks again: still gone.
    expect((await getAt(fixture.port(), editionPath)).status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fixture.log()).not.toContain('OUTSIDE_ALLOW_LIST');
  });
});

test(
  'the fixture refuses an unknown edition mode at startup',
  async () => {
    const fixture = startEdition('preview');
    try {
      await expect(fixture.ready).rejects.toThrow(
        'OPAX_FIXTURE_EDITION must be pinned, absent or withdrawn',
      );
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

// Journey 26: the follows fixture moves one declaration and one bill stage.
describe('the changed-data fixture', () => {
  let fixture: Fixture;
  const port = () => fixture.port();
  beforeAll(() => {
    fixture = startEdition('pinned', { OPAX_FIXTURE_DATA: 'changed' });
    return fixture.ready;
  }, fixtureHookTimeout);
  afterAll(() => fixture?.stop());
  test('serves pinned bytes with a long max-age until a revalidation, then the bumped catalogs', async () => {
    expect(fixture.log()).toContain('data=changed');
    const bills = await getAt(port(), '/bills/index.json');
    const register = await getAt(port(), '/interests/index.json');
    for (const [path, first] of [
      ['/bills/index.json', bills],
      ['/interests/index.json', register],
    ] as const) {
      expect(first.status).toBe(200);
      expect(createHash('sha256').update(first.body).digest('hex')).toBe(
        files[path],
      );
      expect(first.headers['cache-control']).toBe('public, max-age=86400');
      // Unconditional launches (e2e.sh's warm-up) never move the data.
      expect((await getAt(port(), path)).headers.etag).toBe(first.headers.etag);
    }
    // A pull to refresh revalidates with the saved validator.
    const moved = await getAt(port(), '/bills/index.json', {
      'If-None-Match': String(bills.headers.etag),
    });
    expect(moved.status).toBe(200);
    const row = JSON.parse(moved.body).bills.find(
      (b: { key: string }) => b.key === 'au-federal-r7549',
    );
    expect(row).toMatchObject({ status: 'passed', status_as_of: '2026-10-01' });
    // Both files have moved from then on, including the one not yet asked.
    const bumped = JSON.parse(
      (await getAt(port(), '/interests/index.json')).body,
    );
    expect(bumped.people['10007']).toEqual({
      name: 'Anthony Albanese',
      total: 29,
    });
    // Other catalogs are untouched.
    const roster = await getAt(port(), '/parliamentarians.json');
    expect(roster.headers['cache-control']).toBe('public, max-age=300');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fixture.log()).not.toContain('OUTSIDE_ALLOW_LIST');
  });
});

test(
  'the fixture refuses an unknown data mode at startup',
  async () => {
    const fixture = startEdition('pinned', { OPAX_FIXTURE_DATA: 'live' });

    try {
      await expect(fixture.ready).rejects.toThrow(
        'OPAX_FIXTURE_DATA must be pinned or changed',
      );
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

test(
  'null-optional roster mode changes one field and preserves the People record',
  async () => {
    const fixture = startEdition('pinned', {
      OPAX_FIXTURE_ROSTER: 'null-optional',
    });
    try {
      await fixture.ready;
      const response = await getAt(fixture.port(), '/parliamentarians.json');
      expect(response.status).toBe(200);
      const raw = JSON.parse(response.body);
      const normal = JSON.parse((await request('/parliamentarians.json')).body);
      const index = normal.people.findIndex(
        (row: { pid?: string }) => row.pid === '10007',
      );
      normal.people[index].speeches = null;
      expect(raw).toEqual(normal);
      const decoded = decodeRoster(raw);
      expect(decoded.people).toHaveLength(normal.people.length);
      expect(decoded.people.find((row) => row.pid === '10007')).toMatchObject({
        name: 'Anthony Albanese',
        speeches: undefined,
      });
      expect(fixture.log()).toContain('pid=10007 speeches=null');
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

test(
  'vacant roster removes the member from the electorate index as well as both people catalogs',
  async () => {
    const fixture = startEdition('pinned', {
      OPAX_FIXTURE_ROSTER: 'vacant',
    });
    try {
      await fixture.ready;
      const manifest = JSON.parse(
        (await getAt(fixture.port(), '/electorates/manifest.json')).body,
      );
      const index = JSON.parse(
        (await getAt(fixture.port(), manifest.index_url)).body,
      );
      const normal = JSON.parse((await request(manifest.index_url)).body);
      const seat = index.electorates.find(
        (row: { name: string }) => row.name === 'Grayndler',
      );
      expect(seat.representatives).toEqual([]);
      expect(
        index.electorates.filter(
          (row: { name: string }) => row.name !== 'Grayndler',
        ),
      ).toEqual(
        normal.electorates.filter(
          (row: { name: string }) => row.name !== 'Grayndler',
        ),
      );
      for (const path of [manifest.people_url, '/parliamentarians.json']) {
        const people = JSON.parse(
          (await getAt(fixture.port(), path)).body,
        ).people;
        expect(JSON.stringify(people)).not.toContain('Anthony Albanese');
      }
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

test(
  'the fixture refuses an unknown roster mode at startup',
  async () => {
    const fixture = startEdition('pinned', { OPAX_FIXTURE_ROSTER: 'live' });
    try {
      await expect(fixture.ready).rejects.toThrow(
        'OPAX_FIXTURE_ROSTER must be pinned, null-optional or vacant',
      );
    } finally {
      await fixture.stop();
    }
  },
  fixtureHookTimeout,
);

test('search results open matching native excerpt resources and preserve related-speech fixtures', async () => {
  const response = await request(
    '/api/search?q=housing&kind=speech&party=Labor&from=2025&to=2026&sort=newest&per=20&page=1&mode=hybrid',
  );
  const row = decodeRecords(JSON.parse(response.body)).results[0]!;
  const resource = await request('/api/resource/' + row.slug);
  expect(resource.status).toBe(200);
  const doc = decodeDocument(JSON.parse(resource.body));
  expect(doc.slug).toBe(row.slug);
  expect(doc.title).toBe(row.title);
  expect(doc.text).toBe(row.snippet);
  expect(doc.metadata.fixture_excerpt).toBe(true);
  const related = await request('/api/search?q=fixture&kind=speech&per=6');
  expect(decodeSimilar(JSON.parse(related.body)).length).toBeGreaterThan(0);
  const unknown = await request('/api/resource/speech-999999997');
  expect(unknown.status).toBe(404);
});

// The federal-and-state-seat flows open the Melbourne member's register
// page. Without this pinned record the fixture refused it (build 60).
test('serves the Melbourne member register record the seat flows open', async () => {
  const result = await request('/interests/11053.json');
  expect(result.status).toBe(200);
  const record = decodeInterest(JSON.parse(result.body));
  expect(record.total).toBe(42);
});

test('serves official report search rows in the live API shape', async () => {
  const endpoint = '/api/search-all';
  const response = await request(`${endpoint}?q=report&kind=report`);
  expect(response.status).toBe(200);
  const page = decodeRecords(JSON.parse(response.body));
  expect(page.results.length).toBeGreaterThan(0);
  for (const row of page.results) {
    expect(row.report_type).toMatch(
      /^(royal_commission|integrity_report|annual_report|agency_report)$/,
    );
    expect(row.href).toBe(`/report/${row.slug}`);
    expect(row.citation?.url).toBe(row.source_url);
  }
  const empty = await request(`${endpoint}?q=zzzxqvnomatch&kind=report`);
  expect(empty.status).toBe(200);
  expect(decodeRecords(JSON.parse(empty.body)).results).toEqual([]);
});

// Today's How parliament voted: the D1 index, projected from the pinned
// bills, answers as a static catalog (strong validator, 304 on a match) and
// gives the block its three reading votes.
test('serves the recent divisions index projected from the pinned bills', async () => {
  const result = await request('/divisions/recent.json');
  expect(result.status).toBe(200);
  expect(result.headers['content-type']).toBe('application/json');
  expect(String(result.headers.etag)).toMatch(/^"[a-f0-9]{64}"$/);
  const file = decodeRecentDivisions(JSON.parse(result.body));
  expect(file.divisions.length).toBeGreaterThan(100);
  const rows = recentReadingVotes(file, 3);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.stageWords).toMatch(/^(Second|Third) reading$/);
    expect(servedFiles).toContain(`/bills/${row.bill_key}.json`);
  }
  const conditional = await request('/divisions/recent.json', {
    'If-None-Match': String(result.headers.etag),
  });
  expect(conditional.status).toBe(304);
  expect(output).not.toContain('OUTSIDE_ALLOW_LIST GET /divisions/recent.json');
});

// These reviewed fixture overlays are additions to real pinned identities and
// an existing vote. Every other byte-decoded field must remain unchanged.
test('member profile links are limited to the three verified APH identities', async () => {
  const expected: Record<string, string> = {
    'Anthony Albanese':
      'https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=R36',
    'Sussan Ley':
      'https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=00AMN',
    'Zali Steggall':
      'https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=175696',
  };
  const withoutLinks = (value: any): any =>
    Array.isArray(value)
      ? value.map(withoutLinks)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => key !== 'source_url')
              .map(([key, item]) => [key, withoutLinks(item)]),
          )
        : value;
  const release = servedFiles.find((path) =>
    /^\/electorates\/releases\/[^/]+\/people.json$/.test(path),
  )!;
  for (const path of ['/parliamentarians.json', release]) {
    const served = JSON.parse((await request(path)).body);
    expect(withoutLinks(served)).toEqual(withoutLinks(pinned(path)));
    const rows = Array.isArray(served.people)
      ? served.people
      : Object.values(served.people);
    for (const [name, url] of Object.entries(expected))
      expect(rows.find((row: any) => row.name === name)?.source_url).toBe(url);
    for (const name of ['Tanya Plibersek', 'Dan Tehan', 'Helen Haines'])
      expect(
        rows.find((row: any) => row.name === name)?.source_url,
      ).toBeUndefined();
  }
});
test('the member vote overlay identifies the existing pinned division without changing the vote', async () => {
  const served = JSON.parse((await request('/votes.json')).body);
  const votes = served['10007'].against as any[];
  const vote = votes.find(
    (row) => row.division_key === 'federal-representatives-10534',
  );
  expect(vote).toMatchObject({
    billKey: 'au-federal-r7512',
    date: '2026-07-01',
    stage: 'Second reading',
  });
  delete vote.billKey;
  delete vote.division_key;
  expect(served).toEqual(pinned('/votes.json'));
});
