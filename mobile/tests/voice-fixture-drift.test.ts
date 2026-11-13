import { request } from 'node:http';
import { resolve } from 'node:path';
import {
  fixtureHookTimeout,
  startFixture,
  type Fixture,
} from './fixture-process';

let fixture: Fixture;
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
  fixture = startFixture(
    {
      OPAX_VOICE_FIXTURE_WORKER_SOURCE: resolve(
        __dirname,
        'fixtures/voice-worker-origin-main.ts.txt',
      ),
    },
    // The drift notice is on stderr, so it can arrive after the ready line.
    (log) => log.includes('VOICE_FIXTURE_DISABLED:'),
  );
  await fixture.ready;
  port = fixture.port();
}, fixtureHookTimeout);
afterAll(() => fixture?.stop());
test('origin/main drift disables only voice routes and keeps catalog journeys available', async () => {
  expect(fixture.log()).toContain(
    'VOICE_FIXTURE_DISABLED: Voice fixture drift: statusResponseShapes changed',
  );
  expect(await get('/parliamentarians.json')).toBe(200);
  expect(await get('/api/search-all?kind=person&q=Anthony')).toBe(200);
  expect(await get('/bills/au-federal-r7534.json')).toBe(200);
  expect(await get('/api/voice/status')).toBe(404);
  expect(await get('/api/voice/connect')).toBe(404);
  expect(await get('/parliamentarians.json')).toBe(200);
  expect(fixture.child.exitCode).toBeNull();
});
