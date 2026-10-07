// Test server only. No provider, email delivery, Worker imports or outbound I/O.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import statusFixture from '../modules/opax-voice/ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/Fixtures/worker-status.json';
import { chatFixture } from './chat-fixture';
import {
  assertWorkerContract,
  workerMessageFilter,
} from './voice-worker-contract';
import deletionFixture from '../modules/opax-voice/ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/Fixtures/worker-deletion.json';

type Scenario =
  | 'happy'
  | 'deadline'
  | 'exhausted'
  | 'drop'
  | 'disabled'
  | 'unlimited'
  | 'budget';
type Account = {
  email: string;
  scenario: Scenario;
  remaining: number;
  deleted: boolean;
};
type Proof = {
  account: Account;
  deletion: boolean;
  expires: number;
  attempts: number;
};
type Call = {
  account: Account;
  state:
    | 'reserved'
    | 'active'
    | 'connecting'
    | 'closed'
    | 'expired'
    | 'cancelled';
  expires: number;
  seconds: number;
  charged: number;
  socket?: WebSocket;
};
const proofCode = '01234567'; // Synthetic only; never sends email.
const originHeader = 'https://opax.com.au';
export async function createVoiceFixture(
  port: number,
  record: { title: string; path: string },
) {
  const origin = `http://127.0.0.1:${port}`;
  const accounts = new Map<string, Account>();
  const credentials = new Map<string, Account>();
  const proofs = new Map<string, Proof>();
  const calls = new Map<string, Call>();
  const log: Record<string, unknown>[] = [];
  let clockOffset = 0;
  const now = () => Math.floor(Date.now() / 1000) + clockOffset;
  const random = () => randomBytes(32).toString('base64url');
  // Execute only the reviewed pure Worker message filter, pinned by its contract only.
  const worker = readFileSync(
    process.env.OPAX_VOICE_FIXTURE_WORKER_SOURCE ??
      new URL('../../portal/src/voice.ts', import.meta.url),
    'utf8',
  );
  await assertWorkerContract(worker);
  const filter = runInNewContext(
    `${stripTypeScriptTypes(workerMessageFilter(worker).replace('export ', ''))}; voiceClientEvent`,
    {},
    { timeout: 1000 },
  ) as (
    raw: string,
    session: string,
    seconds: number,
    initialized: boolean,
  ) => { payload: string | null; initializes?: boolean };
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 192000,
    perMessageDeflate: false,
    handleProtocols: (protocols) =>
      protocols.has('convai') ? 'convai' : false,
  });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(ms: number, action: () => void) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      action();
    }, ms);
    timers.add(timer);
    return timer;
  }
  function expire() {
    for (const call of calls.values())
      if (
        ['reserved', 'connecting', 'active'].includes(call.state) &&
        call.expires <= now()
      ) {
        if (call.state === 'reserved') {
          call.state = 'cancelled';
          call.charged = 0;
        } else {
          call.state = 'expired';
          call.account.remaining =
            call.account.scenario === 'unlimited'
              ? 600
              : Math.max(0, call.account.remaining - call.seconds);
          call.socket?.close(1000, 'Your free voice time has finished');
        }
      }
  }
  const accountFor = (request: IncomingMessage) =>
    credentials.get(
      /(?:^|;\s*)__Host-opax_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
        request.headers.cookie ?? '',
      )?.[1] ?? '',
    );
  function voiceStatus(account?: Account) {
    expire();
    if (!account || account.deleted)
      return structuredClone(statusFixture.shapes.signedOut);
    if (account.scenario === 'disabled')
      return structuredClone(statusFixture.shapes.disabledSignedOut);
    const base = structuredClone(
      account.scenario === 'unlimited'
        ? statusFixture.shapes.unlimited
        : statusFixture.shapes.allowance,
    );
    const active = [...calls].find(
      ([, call]) =>
        call.account === account &&
        ['reserved', 'connecting', 'active'].includes(call.state),
    );
    return {
      ...base,
      remaining_seconds: account.remaining,
      active_session: active
        ? {
            id: active[0],
            state: active[1].state,
            expires_at: active[1].expires,
          }
        : null,
      ...(account.scenario === 'budget' ? { budget_open: false } : {}),
    };
  }
  function reply(
    response: ServerResponse,
    status: number,
    body: unknown,
    headers = {},
  ) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      ...headers,
    });
    response.end(JSON.stringify(body));
  }
  async function body(request: IncomingMessage) {
    if (!request.headers['content-type']?.startsWith('application/json'))
      throw new Error('body');
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 2000) throw new Error('body');
      chunks.push(chunk);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString()) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('body');
    return value as Record<string, unknown>;
  }
  async function route(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (await chatFixture(request, response, accountFor(request))) return true;
    const path = request.url ?? '';
    const routes: Record<string, string> = {
      '/api/voice/status': 'GET',
      '/api/voice/start': 'POST',
      '/api/voice/finish': 'POST',
      '/api/voice/connect': 'GET',
      '/api/community/status': 'GET',
      '/api/community/auth/request': 'POST',
      '/api/community/auth/consume-code': 'POST',
      '/api/community/auth/logout': 'POST',
      '/api/community/account/deletion-code': 'POST',
      '/api/community/account/delete': 'POST',
      '/__fixture/voice/log': 'GET',
      '/__fixture/voice/clock': 'POST',
    };
    if (routes[path] !== request.method) return false; // No query/alias broadening.
    const account = accountFor(request);
    if (path === '/__fixture/voice/log') {
      reply(response, 200, {
        messages: log,
        usage: [...calls.values()].map((c) => ({
          state: c.state,
          charged: c.charged,
          orphaned: c.account.deleted,
        })),
        headers: log.filter((e) => e.type === 'upgrade'),
      });
      return true;
    }
    if (request.method === 'POST' && request.headers.origin !== originHeader) {
      reply(response, 403, { error: 'Forbidden' });
      return true;
    }
    if (path === '/api/voice/status') {
      reply(response, 200, voiceStatus(account));
      return true;
    }
    if (path === '/api/community/status') {
      const template = structuredClone(
        account?.scenario === 'disabled'
          ? deletionFixture.shapes.requestDisabledStatus.body
          : account
            ? deletionFixture.shapes.requestSuccessStatus.body
            : deletionFixture.shapes.request401Status.body,
      );
      reply(response, 200, template);
      return true;
    }
    if (path === '/api/voice/connect') {
      reply(response, 426, { error: 'WebSocket upgrade required' });
      return true;
    }
    try {
      const data = await body(request);
      if (path === '/__fixture/voice/clock') {
        if (
          !Number.isSafeInteger(data.seconds) ||
          Number(data.seconds) < 0 ||
          Number(data.seconds) > 3600
        )
          throw new Error('clock');
        clockOffset += Number(data.seconds);
        expire();
        reply(response, 200, { advanced: true });
        return true;
      }
      if (path === '/api/community/auth/request') {
        if (
          data.client !== 'ios' ||
          typeof data.email !== 'string' ||
          !/^[a-z]+@example\.invalid$/.test(data.email)
        )
          throw new Error('synthetic account');
        const email = data.email.toLowerCase();
        const scenario = email.split('@')[0] as Scenario;
        if (
          ![
            'happy',
            'deadline',
            'exhausted',
            'drop',
            'disabled',
            'unlimited',
            'budget',
          ].includes(scenario)
        )
          throw new Error('scenario');
        let target = accounts.get(email);
        if (!target || target.deleted) {
          target = {
            email,
            scenario,
            remaining:
              scenario === 'deadline'
                ? 5
                : scenario === 'exhausted'
                  ? 0
                  : scenario === 'unlimited'
                    ? 600
                    : 480,
            deleted: false,
          };
          accounts.set(email, target);
        }
        for (const [key, proof] of proofs)
          if (proof.account === target && !proof.deletion) proofs.delete(key);
        const challenge = random();
        proofs.set(challenge, {
          account: target,
          deletion: false,
          attempts: 0,
          expires: now() + 900,
        });
        reply(response, 200, { sent: true, challenge_id: challenge });
        return true;
      }
      if (
        path === '/api/community/auth/consume-code' ||
        path === '/api/community/account/delete'
      ) {
        const deletion = path.endsWith('/delete');
        const proof = proofs.get(String(data.challenge_id));
        if (deletion && !account) {
          reply(response, 401, { error: 'Sign in required' });
          return true;
        }
        if (
          !proof ||
          proof.deletion !== deletion ||
          proof.account.deleted ||
          proof.expires <= now() ||
          ++proof.attempts > 5 ||
          data.code !== proofCode ||
          (deletion && proof.account !== account)
        ) {
          reply(response, 400, { error: 'Verification failed' });
          return true;
        }
        proofs.delete(String(data.challenge_id));
        if (deletion) {
          proof.account.deleted = true;
          for (const [key, value] of credentials)
            if (value === proof.account) credentials.delete(key);
          for (const [key, value] of proofs)
            if (value.account === proof.account) proofs.delete(key);
          // Keep every call/charge/slot unchanged; accounting is never refunded by deletion.
          reply(
            response,
            200,
            { deleted: true, signed_out: true },
            {
              'Set-Cookie':
                '__Host-opax_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
            },
          );
        } else {
          const credential = random();
          credentials.set(credential, proof.account);
          reply(
            response,
            200,
            { signed_in: true },
            {
              'Set-Cookie': `__Host-opax_session=${credential}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
            },
          );
        }
        return true;
      }
      if (!account || account.deleted) {
        reply(response, 401, { error: 'Sign in required' });
        return true;
      }
      if (path === '/api/community/auth/logout') {
        const token = /__Host-opax_session=([^;]+)/.exec(
          request.headers.cookie ?? '',
        )?.[1];
        if (token) credentials.delete(token);
        reply(response, 200, { signed_out: true });
        return true;
      }
      if (path === '/api/community/account/deletion-code') {
        for (const [key, proof] of proofs)
          if (proof.account === account && proof.deletion) proofs.delete(key);
        const challenge = random();
        proofs.set(challenge, {
          account,
          deletion: true,
          attempts: 0,
          expires: now() + 900,
        });
        reply(response, 200, {
          ...deletionFixture.shapes.requestSuccess.body,
          challenge_id: challenge,
        });
        return true;
      }
      if (path === '/api/voice/start') {
        const status = voiceStatus(account);
        if (!status.enabled)
          reply(response, 503, { error: 'Voice unavailable' });
        else if (status.active_session)
          reply(response, 409, { error: 'Call already open' });
        else if (account.remaining <= 0)
          reply(response, 403, { error: 'Allowance exhausted' });
        else if (account.scenario === 'budget')
          reply(response, 429, { error: 'Voice busy', reason: 'budget' });
        else {
          const id = randomUUID();
          const seconds =
            account.scenario === 'unlimited' ? 5 : account.remaining;
          calls.set(id, {
            account,
            state: 'reserved',
            seconds,
            expires: now() + 60,
            charged: seconds,
          });
          reply(response, 201, {
            session_id: id,
            transport: 'websocket',
            signed_url: `ws://127.0.0.1:${port}/api/voice/connect?session_id=${id}`,
            remaining_seconds: seconds,
            expires_at: now() + 60,
          });
        }
        return true;
      }
      if (path === '/api/voice/finish') {
        const call = calls.get(String(data.session_id));
        if (call?.account === account && call.state === 'reserved') {
          call.state = 'cancelled';
          call.charged = 0;
        }
        reply(response, 200, voiceStatus(account));
        return true;
      }
    } catch {
      reply(response, 400, { error: 'Verification failed' });
      return true;
    }
    return false;
  }
  function upgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    const url = new URL(request.url ?? '', origin);
    if (
      url.pathname !== '/api/voice/connect' ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.hash ||
      [...url.searchParams.keys()].some((key) => key !== 'session_id') ||
      url.searchParams.getAll('session_id').length !== 1
    )
      return false;
    const id = url.searchParams.get('session_id') ?? '';
    const account = accountFor(request);
    const call = calls.get(id);
    expire();
    let failure = 0;
    if (
      request.socket.remoteAddress !== '127.0.0.1' ||
      request.headers.host !== `127.0.0.1:${port}` ||
      request.headers.origin !== originHeader ||
      request.headers['sec-websocket-protocol'] !== 'convai'
    )
      failure = 403;
    else if (!account || account.deleted) failure = 401;
    else if (!call || call.account !== account || call.state !== 'reserved')
      failure = 409;
    if (failure) {
      socket.end(
        `HTTP/1.1 ${failure} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      return true;
    }
    const active = call!;
    active.state = 'connecting';
    active.expires = now() + active.seconds + 30;
    wss.handleUpgrade(request, socket, head, (ws) => {
      active.socket = ws;
      active.state = 'active';
      log.push({
        type: 'upgrade',
        cookiePresent: true,
        originValid: true,
        protocol: ws.protocol,
      });
      let initialized = false;
      let count = 0;
      let window = Date.now();
      let started = now();
      const initiate = later(10000, () => ws.close(1008, 'Initiation timeout'));
      const ping = setInterval(() => {
        if (initialized && ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              type: 'ping',
              ping_event: { event_id: 90, ping_ms: 5 },
            }),
          );
      }, 5000);
      function send(value: unknown) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
      }
      function canned() {
        send({
          type: 'conversation_initiation_metadata',
          conversation_initiation_metadata_event: {
            conversation_id: 'conv_fixture',
            user_input_audio_format: 'pcm_16000',
            agent_output_audio_format: 'pcm_16000',
          },
        });
        send({
          type: 'agent_response',
          agent_response_event: {
            event_id: 1,
            agent_response: 'Synthetic fixture greeting',
          },
        });
        send({
          type: 'audio',
          audio_event: {
            event_id: 1,
            audio_base_64: Buffer.alloc(6400).toString('base64'),
          },
        });
        send({
          type: 'user_transcript',
          user_transcription_event: {
            event_id: 2,
            user_transcript: 'Synthetic fixture question',
          },
        });
        send({
          type: 'agent_tool_response_full_payload',
          agent_tool_response_full_payload: {
            tool_name: 'lookup',
            full_tool_result: {
              source_url: record.path,
              sources: [{ title: record.title, url: record.path }],
            },
          },
        });
        send({
          type: 'agent_tool_response_full_payload',
          agent_tool_response_full_payload: {
            tool_name: 'receipts',
            full_tool_result: {
              sources: [
                { title: 'Public receipt records', url: '/money/receipts' },
              ],
              data: { answer: 'Synthetic fixture receipt response' },
            },
          },
        });
        send({
          type: 'agent_tool_response_full_payload',
          agent_tool_response_full_payload: {
            tool_name: 'receipts',
            full_tool_result: { sources: [], data: { needs_period: true } },
          },
        });
        send({ type: 'interruption', interruption_event: { event_id: 3 } });
        send({
          type: 'audio',
          audio_event: {
            event_id: 1,
            audio_base_64: Buffer.alloc(800).toString('base64'),
          },
        });
        send({
          type: 'agent_response_correction',
          agent_response_correction_event: {
            event_id: 1,
            corrected_agent_response: 'Synthetic corrected greeting',
          },
        });
        send({ type: 'ping', ping_event: { event_id: 91, ping_ms: 5 } });
        if (account!.scenario !== 'drop')
          later(active.seconds * 1000, () => {
            if (active.state !== 'active') return;
            active.state = 'closed';
            active.charged = active.seconds;
            account!.remaining = account!.scenario === 'unlimited' ? 600 : 0;
            ws.close(1000, 'Your free voice time has finished');
          });
        if (account!.scenario === 'drop') later(5000, () => ws.terminate());
      }
      ws.on('message', (bytes, binary) => {
        try {
          if (Date.now() - window >= 1000) {
            window = Date.now();
            count = 0;
          }
          if (++count > 150 || binary) {
            ws.close(1008, 'Invalid voice message');
            return;
          }
          const accepted = filter(
            bytes.toString(),
            id,
            active.seconds,
            initialized,
          );
          if (accepted.initializes) {
            initialized = true;
            clearTimeout(initiate);
            timers.delete(initiate);
            started = now();
            canned();
          }
          if (accepted.payload) {
            const value = JSON.parse(accepted.payload);
            log.push({
              type: value.type ?? 'user_audio_chunk',
              bytes: value.user_audio_chunk
                ? Buffer.from(value.user_audio_chunk, 'base64').length
                : 0,
              at: Date.now(),
            });
            if (log.length > 5000) log.shift();
          }
        } catch {
          ws.close(1008, 'Invalid voice message');
        }
      });
      ws.on('error', () => {});
      ws.on('close', (code) => {
        clearInterval(ping);
        clearTimeout(initiate);
        timers.delete(initiate);
        if (active.state !== 'active') return;
        if (code === 1006) {
          active.expires = now() + 2;
        } // Retained charge, then status-triggered expiry.
        else {
          active.state = 'closed';
          active.charged = Math.min(
            active.seconds,
            Math.max(1, now() - started),
          );
          account!.remaining =
            account!.scenario === 'unlimited'
              ? 600
              : Math.max(0, account!.remaining - active.charged);
        }
      });
    });
    return true;
  }
  return {
    route,
    upgrade,
    close() {
      for (const timer of timers) clearTimeout(timer);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
