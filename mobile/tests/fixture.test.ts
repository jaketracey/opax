import { createHash } from 'node:crypto';
import snapshot from '../scripts/fixture-snapshot.json';
import { files, servedFiles } from './pinned';
import {
  decodeEdition,
  decodeSearch,
  decodeSlugs,
  decodeRoster,
} from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { spawn, type ChildProcess } from 'node:child_process';
import { get, request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
let child: ChildProcess;
let output = '';
let port = 0; // Each unit-test fixture reserves its own loopback port atomically.
// HTTP completion and the child process's stderr pipe are independent. Wait
// for the actual refusal log rather than assuming it reached Jest first.
function waitForOutput(expected: string): Promise<void> {
  if (output.includes(expected)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.stdout!.removeListener('data', check);
      child.stderr!.removeListener('data', check);
      if (error) reject(error); else resolve();
    };
    const check = () => { if (output.includes(expected)) finish(); };
    const timer = setTimeout(() => finish(new Error(`Missing fixture refusal: ${expected}`)), 3000);
    child.stdout!.on('data', check);
    child.stderr!.on('data', check);
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
  child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/fixture-server.ts'],
    {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, OPAX_FIXTURE_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Fixture startup timeout')),
      15000,
    );
    const receive = (chunk: Buffer) => {
      output += chunk.toString();
      const ready = /OPAX_FIXTURE_READY port=(\d+)/.exec(output);
      if (ready) {
        port = Number(ready[1]);
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout!.on('data', receive);
    child.stderr!.on('data', receive);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Fixture exited ${code}: ${output}`));
    });
  });
}, 20000);
afterAll(async () => {
  if (child && child.exitCode === null) {
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  }
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
  '/api/search-all?q=x&kind=bill',
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
])('unknown fixture route %s returns 404 and logs loudly', async (path) => {
  const result = await request(path);
  expect(result.status).toBe(404);
  await waitForOutput(`OUTSIDE_ALLOW_LIST GET ${path}`);
  expect(output).toContain(`OUTSIDE_ALLOW_LIST GET ${path}`);
});

test.each(servedFiles.filter((p) => p.endsWith('.json')))(
  'serves the exact pinned JSON bytes at %s',
  async (path) => {
    const result = await request(path);
    expect(result.status).toBe(200);
    expect(createHash('sha256').update(result.body).digest('hex')).toBe(
      files[path],
    );
  },
);
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
  expect(output).toContain('OUTSIDE_ALLOW_LIST POST /pay.json');
});

test('a production Host header is rejected even on the loopback socket', async () => {
  expect(
    (await request('/parliamentarians.json', { Host: 'opax.com.au' })).status,
  ).toBe(404);
  expect(output).toContain('Host is outside the loopback fixture boundary');
});

// Second servers, as e2e.sh starts them for the edition journeys 13b and 13c.
function startFixture(
  mode: string,
  port = 0,
  env: Record<string, string> = {},
) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/fixture-server.ts'],
    {
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        OPAX_FIXTURE_PORT: String(port),
        OPAX_FIXTURE_EDITION: mode,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Fixture startup timeout')),
      15000,
    );
    const receive = (chunk: Buffer) => {
      log += chunk.toString();
      const ready = /OPAX_FIXTURE_READY port=(\d+)/.exec(log);
      if (ready) {
        port = Number(ready[1]);
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout!.on('data', receive);
    child.stderr!.on('data', receive);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Fixture exited ${code}: ${log}`));
    });
  });
  // Exits are expected after the test; only startup failures reject.
  ready.catch(() => undefined);
  return {
    child,
    ready,
    log: () => log,
    port: () => port,
    stop: () =>
      child.exitCode === null
        ? new Promise<void>((resolve) => {
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
          })
        : Promise.resolve(),
  };
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

describe('the no-edition fixture', () => {
  let fixture: ReturnType<typeof startFixture>;
  beforeAll(() => {
    fixture = startFixture('absent');
    return fixture.ready;
  }, 20000);
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
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fixture.log()).not.toContain('OUTSIDE_ALLOW_LIST');
    expect(fixture.log()).toContain(
      `"path":"${editionPath}","status":404,"allowed":true`,
    );
  });
});

describe('the withdrawn-edition fixture', () => {
  let fixture: ReturnType<typeof startFixture>;
  beforeAll(() => {
    fixture = startFixture('withdrawn');
    return fixture.ready;
  }, 20000);
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

test('the fixture refuses an unknown edition mode at startup', async () => {
  const fixture = startFixture('preview');
  try {
    await expect(fixture.ready).rejects.toThrow(
      'OPAX_FIXTURE_EDITION must be pinned, absent or withdrawn',
    );
  } finally {
    await fixture.stop();
  }
}, 20000);

// Journey 26: the follows fixture moves one declaration and one bill stage.
describe('the changed-data fixture', () => {
  let fixture: ReturnType<typeof startFixture>;
  const port = () => fixture.port();
  beforeAll(() => {
    fixture = startFixture('pinned', 0, { OPAX_FIXTURE_DATA: 'changed' });
    return fixture.ready;
  }, 20000);
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

test('the fixture refuses an unknown data mode at startup', async () => {
  const fixture = startFixture('pinned', 0, { OPAX_FIXTURE_DATA: 'live' });

  try {
    await expect(fixture.ready).rejects.toThrow(
      'OPAX_FIXTURE_DATA must be pinned or changed',
    );
  } finally {
    await fixture.stop();
  }
}, 20000);

test('null-optional roster mode changes one field and preserves the People record', async () => {
  const fixture = startFixture('pinned', 0, {
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
}, 20000);

test('the fixture refuses an unknown roster mode at startup', async () => {
  const fixture = startFixture('pinned', 0, { OPAX_FIXTURE_ROSTER: 'live' });
  try {
    await expect(fixture.ready).rejects.toThrow(
      'OPAX_FIXTURE_ROSTER must be pinned or null-optional',
    );
  } finally {
    await fixture.stop();
  }
}, 20000);
