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
const port = 8998;
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
      if (output.includes('OPAX_FIXTURE_READY')) {
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

describe('the no-edition fixture', () => {
  // A second server, as e2e.sh starts it for the hidden-card journey.
  const absentPort = 8996;
  let absent: ChildProcess;
  let log = '';
  const start = (mode: string, port: number) =>
    spawn(process.execPath, ['--import', 'tsx', 'scripts/fixture-server.ts'], {
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        OPAX_FIXTURE_PORT: String(port),
        OPAX_FIXTURE_EDITION: mode,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  beforeAll(async () => {
    absent = start('absent', absentPort);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Fixture startup timeout')),
        15000,
      );
      const receive = (chunk: Buffer) => {
        log += chunk.toString();
        if (log.includes('OPAX_FIXTURE_READY')) {
          clearTimeout(timer);
          resolve();
        }
      };
      absent.stdout!.on('data', receive);
      absent.stderr!.on('data', receive);
      absent.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Fixture exited ${code}: ${log}`));
      });
    });
  }, 20000);
  afterAll(async () => {
    if (absent && absent.exitCode === null)
      await new Promise<void>((resolve) => {
        absent.once('exit', () => resolve());
        absent.kill('SIGTERM');
      });
  });
  test('answers the edition as the Worker does when none is posted, without a boundary alarm', async () => {
    expect(log).toContain('edition=absent');
    const result = await new Promise<{
      status: number;
      body: string;
      cache: unknown;
    }>((resolve, reject) => {
      get(
        { hostname: '127.0.0.1', port: absentPort, path: editionPath },
        (response) => {
          let body = '';
          response.on('data', (chunk) => (body += String(chunk)));
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              body,
              cache: response.headers['cache-control'],
            }),
          );
        },
      ).on('error', reject);
    });
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      error: 'edition_not_published',
      date: '2026-10-04',
    });
    expect(result.cache).toBe('public, max-age=60, must-revalidate');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(log).not.toContain('OUTSIDE_ALLOW_LIST');
    expect(log).toContain(
      `"path":"${editionPath}","status":404,"allowed":true`,
    );
  });
  test('refuses an unknown edition mode at startup', async () => {
    const child = start('preview', 8995);
    let output = '';
    child.stderr!.on('data', (chunk) => (output += String(chunk)));
    const code = await new Promise<number | null>((resolve) =>
      child.once('exit', resolve),
    );
    expect(code).not.toBe(0);
    expect(output).toContain('OPAX_FIXTURE_EDITION must be pinned or absent');
  });
});
