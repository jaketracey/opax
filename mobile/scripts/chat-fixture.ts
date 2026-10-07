import type { IncomingMessage, ServerResponse } from 'node:http';
type Account = { email: string; deleted: boolean };
const chats = new Map<string, Map<string, Record<string, unknown>>>();
export async function chatFixture(
  req: IncomingMessage,
  res: ServerResponse,
  account?: Account,
) {
  const path = req.url || '',
    id = /^\/api\/community\/chats\/([\w-]{8,64})$/.exec(path)?.[1];
  if (path !== '/api/community/chats' && !id) return false;
  const reply = (status: number, value: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  };
  if (!account || account.deleted) {
    reply(401, { error: 'Sign in required' });
    return true;
  }
  if (req.method !== 'GET' && req.headers.origin !== 'https://opax.com.au') {
    reply(403, { error: 'Origin refused' });
    return true;
  }
  let store = chats.get(account.email);
  if (!store) {
    store = new Map();
    chats.set(account.email, store);
  }
  if (!id && req.method === 'GET') {
    reply(200, { chats: [...store.values()].map(({ data, ...row }) => row) });
    return true;
  }
  if (id && req.method === 'DELETE') {
    store.delete(id);
    reply(200, { ok: true });
    return true;
  }
  if (id && req.method === 'GET') {
    const chat = store.get(id);
    reply(
      chat ? 200 : 404,
      chat ? { chat } : { error: 'This conversation is unavailable.' },
    );
    return true;
  }
  if (id && req.method === 'PUT') {
    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 600000) throw new Error('Chat fixture body too large');
    }
    const data = JSON.parse(text);
    const old = store.get(id);
    if (old && Number(old.updated_at) > data.updated) {
      reply(200, { ok: true, stale: true, updated_at: old.updated_at });
      return true;
    }
    store.set(id, {
      id,
      title: data.title,
      kind: data.kind,
      turns: data.thread.length,
      created_at: old?.created_at || Math.floor(Date.now() / 1000),
      updated_at: data.updated,
      data,
    });
    reply(200, { ok: true, updated_at: data.updated });
    return true;
  }
  reply(405, { error: 'Method refused' });
  return true;
}
