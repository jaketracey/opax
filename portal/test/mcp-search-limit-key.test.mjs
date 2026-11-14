// The whole Worker: an MCP search from an assistant's shared address reaches the website's search limit
// (SEARCH_LIMITER) under one person's key, and an ordinary address under its IP, as on the website.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {loadWorker, offline} from './worker-harness.mjs';

const restore = offline();
test.after(restore);
const h = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);

function communityDb() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_community.sql', '0002_free_community.sql', '0006_member_chats.sql', '0009_community_social.sql', '0010_reply_email_notifications.sql', '0011_native_signin.sql', '0019_mcp_oauth.sql']) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({bind(...values) { return statement(sql, values); }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return {results: db.prepare(sql).all(...args)}; }, async run() { db.prepare(sql).run(...args); return {success: true}; }});
  return {prepare: statement, async batch(statements) { return Promise.all(statements.map(s => s.run())); }};
}

test('an MCP search is counted by the search limit per person on a shared address, per IP elsewhere', async () => {
  const keys = [];
  Object.assign(h.env, {COMMUNITY_DB: communityDb(), COMMUNITY_ENABLED: 'true', MCP_ANON_ENABLED: 'true',
    SEARCH_LIMITER: {async limit({key}) { keys.push(key); return {success: true}; }}});
  const search = (ip, session) => h.fetch('/mcp', {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', 'cf-connecting-ip': ip, 'user-agent': 'test-client/1', ...(session ? {'mcp-session-id': session} : {})},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'search_records', arguments: {query: 'housing supply'}}})});
  for (const [ip, session, expected] of [
    ['160.79.104.10', 'conversation-one', 'shared:session:conversation-one'], // Claude's servers: one conversation
    ['160.79.104.10', 'conversation-two', 'shared:session:conversation-two'], // the next person behind the same address
    ['160.79.104.10', null, '160.79.104.10'], // no session: the address, as before
    ['203.0.113.7', 'session-aaaa', '203.0.113.7'], // an ordinary address keeps the website's per-IP key
  ]) {
    keys.length = 0;
    const response = await search(ip, session);
    assert.equal(response.status, 200, ip + ' ' + session);
    assert.ok(keys.length >= 1, 'the search limit was checked');
    assert.deepEqual([...new Set(keys)], [expected], ip + ' ' + session);
  }
});
