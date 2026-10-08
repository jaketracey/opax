import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import pin from './fixtures/ask-recorded.json';
import followups from './fixtures/ask-followups.json';
import clarify from './fixtures/ask-clarify.json';
const recorded = readFileSync(resolve(__dirname, 'fixtures/ask-recorded.sse'));
if (
  recorded.length !== pin.size ||
  createHash('sha256').update(recorded).digest('hex') !== pin.sha256
)
  throw new Error('Ask fixture pin mismatch');
async function body(req: IncomingMessage) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 100000) throw new Error('Ask body too large');
  }
  return JSON.parse(text);
}
const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
// Production pacing (20–40 s from submit to the last stage), chunked over one
// open response, so a device build proves the transport streams. Only these
// synthetic questions are slow; every other journey keeps the quick replay.
const slowModes = new Set([
  'fixture slow stream',
  'fixture stages only',
  'fixture slow error',
]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function slowStream(res: ServerResponse, mode: string) {
  const blocks = recorded.toString().trim().split('\n\n');
  const send = async (block: string, ms: number) => {
    if (res.destroyed) return;
    res.write(block + '\n\n');
    await wait(ms);
  };
  const event = (name: string, data: unknown) =>
    `event: ${name}\ndata: ${JSON.stringify(data)}`;
  const [searching, retrieved, writing] = blocks;
  const done = blocks.find((b) => b.startsWith('event: done'))!;
  const answer: string = JSON.parse(
    done.slice(done.indexOf('data: ') + 6),
  ).answer;
  // Headers go first, alone: the app shows its first stage before any event.
  await wait(3000);
  await send(searching!, 9000);
  await send(retrieved!, 7000);
  await send(writing!, 5000);
  if (mode === 'fixture stages only')
    // The model is still thinking: stage events only, for a long while.
    for (let words = 40; words <= 400; words += 40)
      await send(event('status', { phase: 'reading', words }), 3000);
  const parts = answer.match(/.{1,24}(\s|$)/g) || [answer];
  for (const [i, text] of parts.entries()) {
    if (mode === 'fixture slow error' && i === 2) {
      await send(
        event('error', {
          error: 'The answer could not be finished. Try again.',
        }),
        0,
      );
      return res.end();
    }
    await send(event('delta', { text }), 2500);
  }
  await send(done, 0);
  res.end();
}
export async function askFixture(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (
    !['/api/ask?stream=1', '/api/followups'].includes(req.url || '') ||
    req.method !== 'POST'
  )
    return false;
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new Error('Ask fixture requires JSON');
  const input = await body(req);
  if (req.url === '/api/followups') {
    json(res, 200, followups);
    return true;
  }
  if (typeof input.question !== 'string' || !input.question.trim()) {
    json(res, 400, { error: 'question is required' });
    return true;
  }
  // Explicit synthetic failure questions exercise UI states without live calls.
  if (input.question === 'fixture rate limited') {
    json(res, 429, { error: 'Too many questions. Please try again shortly.' });
    return true;
  }
  if (input.question === 'fixture blocked') {
    json(res, 403, { error: 'This answer request was blocked.' });
    return true;
  }
  // A follow-up with nothing to search on: the Worker's free request for a
  // full question (portal/src/ask-rewrite.ts clarifyPayload), sent as JSON.
  if (
    input.question === 'High' &&
    Array.isArray(input.context) &&
    input.context.length
  ) {
    json(res, 200, clarify);
    return true;
  }
  if (input.question === 'fixture empty') {
    json(res, 200, { answer: '', citations: {}, sources: [] });
    return true;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (slowModes.has(input.question)) {
    await slowStream(res, input.question);
    return true;
  }
  for (const block of recorded.toString().trim().split('\n\n')) {
    if (res.destroyed) break;
    if (
      input.question === 'fixture partial stream' &&
      block.startsWith('event: done')
    )
      break;
    let next = block;
    if (
      Array.isArray(input.context) &&
      input.context.length &&
      block.startsWith('event: done')
    ) {
      const data = JSON.parse(block.slice(block.indexOf('data: ') + 6));
      data.asked_as =
        'Who spoke for and against the Interactive Gambling (Cost Recovery Levy) Bill 2026?';
      next = 'event: done\ndata: ' + JSON.stringify(data);
    }
    res.write(next + '\n\n');
    await new Promise((r) => setTimeout(r, 150));
  }
  res.end();
  return true;
}
