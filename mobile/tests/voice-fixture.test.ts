import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { resolve } from 'node:path';
import WebSocket from 'ws';
let child: ChildProcess;
let output = '';
let port = 0;
function http(
  path: string,
  data?: unknown,
  cookie?: string,
  origin = 'https://opax.com.au',
) {
  return new Promise<{ status: number; body: any; cookie?: string }>(
    (resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: data === undefined ? 'GET' : 'POST',
          headers: {
            Origin: origin,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(data === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
          },
        },
        (response) => {
          let text = '';
          response.on('data', (bytes) => {
            text += String(bytes);
          });
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              body: JSON.parse(text),
              cookie: response.headers['set-cookie']?.[0]?.split(';')[0],
            }),
          );
        },
      );
      req.on('error', reject);
      req.setTimeout(3000, () => req.destroy(new Error('fixture timeout')));
      req.end(data === undefined ? undefined : JSON.stringify(data));
    },
  );
}
async function signIn(scenario: string) {
  const proof = await http('/api/community/auth/request', {
    email: `${scenario}@example.invalid`,
    client: 'ios',
  });
  expect(proof.status).toBe(200);
  expect(proof.body.challenge_id).toHaveLength(43);
  const result = await http('/api/community/auth/consume-code', {
    challenge_id: proof.body.challenge_id,
    code: '01234567',
  });
  expect(result.status).toBe(200);
  expect(result.cookie).toMatch(/^__Host-opax_session=/);
  return result.cookie!;
}
beforeAll(async () => {
  child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/fixture-server.ts'],
    {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, OPAX_FIXTURE_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(output || 'fixture startup timeout')),
      15000,
    );
    const receive = (bytes: Buffer) => {
      output += bytes.toString();
      if (output.includes('OPAX_FIXTURE_READY')) {
        port = Number(/OPAX_FIXTURE_READY port=(\d+)/.exec(output)?.[1]);
        if (!port) return reject(new Error('Missing OS-assigned fixture port'));
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout!.on('data', receive);
    child.stderr!.on('data', receive);
    child.on('error', reject);
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(output));
    });
  });
}, 20000);
afterAll(async () => {
  if (child?.exitCode === null)
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
});
test('code proof is generic, single-use, and requires native request mode and Origin', async () => {
  const proof = await http('/api/community/auth/request', {
    email: 'happy@example.invalid',
    client: 'ios',
  });
  const bad = await http('/api/community/auth/consume-code', {
    challenge_id: proof.body.challenge_id,
    code: '11111111',
  });
  expect(bad.status).toBe(400);
  const exchange = { challenge_id: proof.body.challenge_id, code: '01234567' };
  expect(
    (await http('/api/community/auth/consume-code', exchange)).status,
  ).toBe(200);
  expect(
    (await http('/api/community/auth/consume-code', exchange)).body,
  ).toEqual(bad.body);
  expect(
    (
      await http('/api/community/auth/request', {
        email: 'real@example.org',
        client: 'ios',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await http(
        '/api/community/auth/request',
        { email: 'happy@example.invalid', client: 'ios' },
        undefined,
        'https://foreign.invalid',
      )
    ).status,
  ).toBe(403);
});
test('generated status, secure cookie, logout and disabled-member deletion contract', async () => {
  expect((await http('/api/voice/status')).body.signed_in).toBe(false);
  const cookie = await signIn('disabled');
  expect(
    (await http('/api/voice/status', undefined, cookie)).body.enabled,
  ).toBe(false);
  expect(
    (await http('/api/community/status', undefined, cookie)).body,
  ).toMatchObject({ member: null, can_delete_account: true });
  const proof = await http('/api/community/account/deletion-code', {}, cookie);
  expect(
    (
      await http(
        '/api/community/account/delete',
        { challenge_id: proof.body.challenge_id, code: '01234567' },
        cookie,
      )
    ).body,
  ).toEqual({ deleted: true, signed_out: true });
  expect(
    (await http('/api/community/account/deletion-code', {}, cookie)).status,
  ).toBe(401);
});
async function connect(scenario: string, end: 'user' | 'deadline' | 'drop') {
  const cookie = await signIn(scenario);
  const reservation = await http('/api/voice/start', {}, cookie);
  expect(reservation.status).toBe(201);
  const events: any[] = [];
  const ws = new WebSocket(reservation.body.signed_url, 'convai', {
    headers: { Cookie: cookie, Origin: 'https://opax.com.au' },
  });
  const close = new Promise<number>((resolve, reject) => {
    ws.once('error', reject);
    ws.once('close', (code) => resolve(code));
  });
  ws.on('open', () =>
    ws.send(
      JSON.stringify({
        type: 'conversation_initiation_client_data',
        overrides: 'must be discarded',
      }),
    ),
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('canned events missing')),
      3000,
    );
    ws.on('message', (raw) => {
      const event = JSON.parse(raw.toString());
      events.push(event);
      if (event.type === 'ping') {
        ws.send(
          JSON.stringify({ type: 'pong', event_id: event.ping_event.event_id }),
        );
        clearTimeout(timer);
        resolve();
      }
    });
  });
  expect(events.some((e) => e.type === 'user_transcript')).toBe(true);
  expect(
    events.filter((e) => e.type === 'agent_tool_response_full_payload'),
  ).toHaveLength(3);
  const audio = events.find((e) => e.type === 'audio').audio_event
    .audio_base_64;
  expect([...Buffer.from(audio, 'base64')].every((byte) => byte === 0)).toBe(
    true,
  );
  if (end === 'user') ws.close(1000, 'User ended conversation');
  const code = await close;
  expect(code).toBe(end === 'drop' ? 1006 : 1000);
  await http(
    '/api/voice/finish',
    { session_id: reservation.body.session_id },
    cookie,
  );
  return { cookie, reservation };
}
test('real loopback WebSocket, canned metadata/audio/evidence, finish and non-refunding deletion', async () => {
  const { cookie } = await connect('happy', 'user');
  const before = (await http('/__fixture/voice/log')).body.usage;
  const proof = await http('/api/community/account/deletion-code', {}, cookie);
  expect(
    (
      await http(
        '/api/community/account/delete',
        { challenge_id: proof.body.challenge_id, code: '11111111' },
        cookie,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await http(
        '/api/community/account/delete',
        { challenge_id: proof.body.challenge_id, code: '01234567' },
        cookie,
      )
    ).status,
  ).toBe(200);
  const after = (await http('/__fixture/voice/log')).body;
  expect(after.usage.map(({ orphaned: _o, ...v }: any) => v)).toEqual(
    before.map(({ orphaned: _o, ...v }: any) => v),
  );
  expect(after.headers).toContainEqual({
    type: 'upgrade',
    cookiePresent: true,
    originValid: true,
    protocol: 'convai',
  });
});
test('deadline exhaustion refuses a new reservation; logout revokes fixture credential', async () => {
  const { cookie } = await connect('deadline', 'deadline');
  expect(
    (await http('/api/voice/status', undefined, cookie)).body.remaining_seconds,
  ).toBe(0);
  expect((await http('/api/voice/start', {}, cookie)).status).toBe(403);
  expect(
    (await http('/api/community/auth/logout', { everywhere: false }, cookie))
      .status,
  ).toBe(200);
  expect(
    (await http('/api/voice/status', undefined, cookie)).body.signed_in,
  ).toBe(false);
}, 10000);
test('abnormal drop retains an open call and full charge until expiry, with no replay', async () => {
  const { cookie, reservation } = await connect('drop', 'drop');
  expect(
    (await http('/api/voice/status', undefined, cookie)).body.active_session
      .state,
  ).toBe('active');
  expect((await http('/api/voice/start', {}, cookie)).status).toBe(409);
  await http('/__fixture/voice/clock', { seconds: 3 });
  const status = (await http('/api/voice/status', undefined, cookie)).body;
  expect(status.active_session).toBeNull();
  expect(status.remaining_seconds).toBe(0);
  const ws = new WebSocket(reservation.body.signed_url, 'convai', {
    headers: { Cookie: cookie, Origin: 'https://opax.com.au' },
  });
  ws.on('error', () => {});
  await new Promise<void>((resolve) =>
    ws.once('unexpected-response', (_req, response) => {
      expect(response.statusCode).toBe(409);
      response.resume();
      ws.terminate();
      resolve();
    }),
  );
  ws.on('error', () => {});
}, 10000);
