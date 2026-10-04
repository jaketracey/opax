import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { resolve } from 'node:path';

let child: ChildProcess;
let output = '';
let port = 0;
function get(path: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode!));
    });
    req.on('error', reject);
    req.setTimeout(3000, () =>
      req.destroy(new Error('Fixture request timed out')),
    );
    req.end();
  });
}
beforeAll(async () => {
  child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/fixture-server.ts'],
    {
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        OPAX_FIXTURE_PORT: '0',
        OPAX_VOICE_FIXTURE_WORKER_SOURCE: resolve(
          __dirname,
          'fixtures/voice-worker-origin-main.ts.txt',
        ),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Fixture startup timed out: ${output}`)),
      15000,
    );
    const onData = (bytes: Buffer) => {
      output += bytes.toString();
      const ready = /OPAX_FIXTURE_READY port=(\d+)/.exec(output);
      if (ready && output.includes('VOICE_FIXTURE_DISABLED:')) {
        port = Number(ready[1]);
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout!.on('data', onData);
    child.stderr!.on('data', onData);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Fixture exited ${code}: ${output}`));
    });
  });
}, 20000);
afterAll(async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });
});
test('origin/main drift disables only voice routes and keeps catalog journeys available', async () => {
  expect(output).toContain(
    'VOICE_FIXTURE_DISABLED: Voice fixture drift: statusResponseShapes changed',
  );
  expect(await get('/parliamentarians.json')).toBe(200);
  expect(await get('/api/search-all?kind=person&q=Anthony')).toBe(200);
  expect(await get('/bills/au-federal-r7534.json')).toBe(200);
  expect(await get('/api/voice/status')).toBe(404);
  expect(await get('/api/voice/connect')).toBe(404);
  expect(await get('/parliamentarians.json')).toBe(200);
  expect(child.exitCode).toBeNull();
});
