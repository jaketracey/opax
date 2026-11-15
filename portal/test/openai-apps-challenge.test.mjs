import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openaiAppsChallenge, OPENAI_APPS_CHALLENGE_PATH } from '../src/openai-apps-challenge.ts';
import { mcpToolTitle, MCP_TOOL_TITLES } from '../src/mcp-tool-titles.ts';

const url = 'https://opax.com.au' + OPENAI_APPS_CHALLENGE_PATH;
const sample = 'test-token_0123456789.abcDEF';

test('the challenge path is the one the ChatGPT app directory reads', () => {
  assert.equal(OPENAI_APPS_CHALLENGE_PATH, '/.well-known/openai-apps-challenge');
});

test('a set token is served as the exact plain-text body', async () => {
  const response = openaiAppsChallenge(new Request(url), sample);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), sample, 'no JSON, no newline, nothing added');
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store', 'a replaced token is served at once');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  const head = openaiAppsChallenge(new Request(url, { method: 'HEAD' }), sample);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('no token, or anything that is not one printable token, is a 404', async () => {
  for (const token of [undefined, '', '   ', 'short', 'two tokens here', 'line\nbreak-in-token', sample + '\n', ' ' + sample, 'x'.repeat(513), 'tökén-with-accents']) {
    const response = openaiAppsChallenge(new Request(url), token);
    assert.equal(response.status, 404, JSON.stringify(token));
    assert.equal(await response.text(), 'Not found');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(openaiAppsChallenge(new Request(url, { method: 'HEAD' }), undefined).status, 404);
});

test('only reads are answered', () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS'])
    assert.equal(openaiAppsChallenge(new Request(url, { method }), sample).status, 404, method);
});

test('the Worker routes the path to the handler with the configured token and ships none', () => {
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(index, /if \(url\.pathname === OPENAI_APPS_CHALLENGE_PATH\) return openaiAppsChallenge\(request, env\.OPENAI_APPS_CHALLENGE\)/);
  // The token is issued by the portal and set as a secret or var at submission time; none is committed.
  assert.doesNotMatch(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /OPENAI_APPS_CHALLENGE/);
});

test('every MCP tool gets a title: a written one, or one made from its name', () => {
  assert.equal(mcpToolTitle('search_records'), 'Search the public record');
  assert.equal(mcpToolTitle('member_divisions'), 'Member divisions');
  assert.equal(mcpToolTitle('division'), 'Division');
  for (const [name, title] of Object.entries(MCP_TOOL_TITLES)) {
    assert.match(name, /^[a-z][a-z0-9_]{0,63}$/);
    assert.ok(title.length >= 3 && title.length <= 60 && !/\u2014/.test(title), name);
  }
});
