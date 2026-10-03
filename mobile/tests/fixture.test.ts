import { createHash } from 'node:crypto';
import { files, servedFiles } from './pinned';
import { decodeSearch, decodeSlugs } from '../src/api/catalogs';
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
