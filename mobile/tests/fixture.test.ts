import { createHash } from 'node:crypto';
import snapshot from '../scripts/fixture-snapshot.json';
import { files, servedFiles } from './pinned';
import { decodeEdition, decodeSearch, decodeSlugs } from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { spawn, type ChildProcess } from 'node:child_process';
import { get, request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
let child: ChildProcess;
let output = '';
let port = 0; // Each unit-test fixture reserves its own loopback port atomically.
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
  '/graph/money.json',
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
function startFixture(mode: string, port = 0) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/fixture-server.ts'],
    {
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        OPAX_FIXTURE_PORT: String(port),
        OPAX_FIXTURE_EDITION: mode,
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
  await expect(fixture.ready).rejects.toThrow(
    'OPAX_FIXTURE_EDITION must be pinned, absent or withdrawn',
  );
});
