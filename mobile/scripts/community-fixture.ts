// Synthetic members and discussions. Never reads or writes production.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { communityRequestAllowed } from '../src/features/community/policy';
type Account = { email: string; deleted: boolean };
type Row = Record<string, unknown>;
const created_at = 1791417600;
const self = {
  id: 'reader-self',
  name: 'Fixture Reader',
  bio: 'Reading public records.',
  joined_at: created_at,
};
const peers = [
  {
    id: 'reader-a',
    name: 'Casey Fixture',
    bio: 'Housing and the public record.',
    joined_at: created_at,
  },
  {
    id: 'reader-b',
    name: 'Morgan Fixture',
    bio: 'Comparing sources.',
    joined_at: created_at,
  },
];
const initialThreads: Row[] = [
  {
    id: 'discussion-a',
    member_id: 'reader-a',
    title: 'Reading a bill together',
    body: 'Which original records help explain this bill? Let’s compare the linked sources.',
    source_path: '/bill/au-federal-r7534',
    created_at,
    display_name: peers[0]!.name,
    replies: 1,
    likes: 2,
    liked: 0,
    saved: 0,
  },
  {
    id: 'discussion-b',
    member_id: 'reader-b',
    title: 'Finding the original record',
    body: 'I am keeping notes from original publications in a reading list.',
    source_path: '',
    created_at,
    display_name: peers[1]!.name,
    replies: 0,
    likes: 0,
    liked: 0,
    saved: 0,
  },
];
const states = new Map<string, ReturnType<typeof fresh>>();
function fresh() {
  return {
    member: { ...self },
    threads: structuredClone(initialThreads),
    replies: [
      {
        id: 'reply-a',
        member_id: 'reader-b',
        body: 'Start with the explanatory memorandum and the bill text.',
        created_at,
        display_name: peers[1]!.name,
      },
    ],
    blocks: new Set<string>(),
    follows: new Set<string>(),
    preferences: {
      message_policy: 'everyone',
      reply_email_notifications: false,
    },
    lists: [
      {
        id: 'list-a',
        member_id: 'reader-self',
        title: 'Source notes',
        description: 'A trail through the original record.',
        public: 1,
        created_at,
        count: 1,
        display_name: self.name,
      },
    ],
    items: [
      {
        id: 'item-a',
        list_id: 'list-a',
        title: 'Wage Justice for Early Childhood',
        path: '/bill/au-federal-r7534',
        note: 'Read the original documents.',
        created_at,
      },
    ],
    messages: [
      {
        id: 'message-a',
        sender_id: 'reader-b',
        body: 'Have you seen the explanatory memorandum?',
        seq: 1,
        created_at,
        hidden: 0,
      },
    ],
    read: 0,
    notifications: [
      {
        id: 1,
        actor_id: 'reader-b',
        kind: 'reply',
        display_name: peers[1]!.name,
        thread_id: 'discussion-a',
        title: 'Reading a bill together',
        created_at,
        read_at: null as number | null,
      },
    ],
  };
}
let nextID = 1;
export async function communityFixture(
  req: IncomingMessage,
  res: ServerResponse,
  account?: Account,
) {
  const path = req.url ?? '',
    method = req.method ?? 'GET';
  if (
    !path.startsWith('/api/community/') ||
    !communityRequestAllowed(path, method)
  )
    return false;
  if (
    path === '/api/community/status' &&
    !account?.email.startsWith('community')
  )
    return false;
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  const signedIn = !!account && !account.deleted;
  const name = new URL(path, 'http://127.0.0.1').pathname.slice(15),
    p = new URL(path, 'http://127.0.0.1').searchParams;
  const publicRead =
    method === 'GET' &&
    (name === 'threads' ||
      name === 'status' ||
      /^(threads|members|lists)\/[\w-]+$/.test(name));
  if (!publicRead && !signedIn) {
    reply(401, { error: 'Sign in to continue.' });
    return true;
  }
  if (method !== 'GET' && req.headers.origin !== 'https://opax.com.au') {
    reply(403, { error: 'Origin refused' });
    return true;
  }
  let state = states.get(account?.email ?? 'public');
  if (!state) {
    state = fresh();
    states.set(account?.email ?? 'public', state);
  }
  const s = state;
  const visible = (row: Row) =>
    !s.blocks.has(
      String(row.member_id ?? row.actor_id ?? row.sender_id ?? row.id),
    );
  let d: Row = {};
  if (method !== 'GET') {
    let body = '';
    for await (const c of req) {
      body += c;
      if (body.length > 16000) throw new Error('Fixture body too large');
    }
    d = body ? JSON.parse(body) : {};
  }
  const ids = name.split('/'),
    id = ids[1] ?? '';
  if (name === 'status') {
    reply(200, {
      enabled: true,
      member: signedIn ? s.member : null,
      unread: { messages: 0, activity: 0 },
    });
    return true;
  }
  if (name === 'threads' && method === 'GET') {
    reply(200, {
      threads: s.threads.filter(
        (t) =>
          visible(t) &&
          (p.get('feed') !== 'following' ||
            s.follows.has(String(t.member_id))) &&
          (p.get('feed') !== 'saved' || t.saved === 1) &&
          (!p.get('q') ||
            String(t.title).toLowerCase().includes(p.get('q')!.toLowerCase())),
      ),
      more: false,
    });
    return true;
  }
  if (name === 'threads' && method === 'POST') {
    if (String(d.title).length < 5 || String(d.body).length < 10) {
      reply(400, { error: 'Add a title and opening note.' });
      return true;
    }
    const id = `discussion-new-${nextID++}`;
    s.threads.unshift({
      id,
      member_id: self.id,
      display_name: s.member.name,
      created_at,
      ...d,
      replies: 0,
      likes: 0,
      saved: 0,
      liked: 0,
    });
    reply(201, { id });
    return true;
  }
  if (ids[0] === 'threads' && ids.length === 2) {
    const t = s.threads.find((t) => t.id === id && visible(t));
    if (!t) {
      reply(404, { error: 'This discussion is unavailable.' });
      return true;
    }
    if (method === 'GET')
      reply(200, {
        thread: t,
        replies: s.replies.filter(visible),
        more_replies: false,
      });
    else if (method === 'POST') {
      s.replies.push({
        id: `reply-new-${nextID++}`,
        member_id: self.id,
        display_name: s.member.name,
        body: String(d.body),
        created_at,
      });
      t.replies = Number(t.replies) + 1;
      reply(201, { saved: true });
    } else reply(200, { removed: true });
    return true;
  }
  if (ids[0] === 'threads' && ['like', 'save'].includes(ids[2] ?? '')) {
    const t = s.threads.find((t) => t.id === id && visible(t));
    if (!t) {
      reply(404, { error: 'This discussion is unavailable.' });
      return true;
    }
    const k = ids[2] === 'like' ? 'liked' : 'saved';
    t[k] = method === 'PUT' ? 1 : 0;
    if (k === 'liked') t.likes = method === 'PUT' ? 3 : 2;
    reply(200, { active: method === 'PUT', likes: t.likes });
    return true;
  }
  if (name === 'members') {
    reply(200, {
      members: peers.filter(
        (m) =>
          visible(m) &&
          (!p.get('q') ||
            m.name.toLowerCase().includes(p.get('q')!.toLowerCase())),
      ),
      more: false,
    });
    return true;
  }
  if (ids[0] === 'members' && ids.length === 2) {
    const m =
      peers.find((m) => m.id === id) ?? (id === self.id ? s.member : null);
    if (!m) {
      reply(404, { error: 'This member is unavailable.' });
      return true;
    }
    reply(200, {
      member: m,
      stats: {
        followers: 1,
        following: 1,
        discussions: s.threads.filter((t) => t.member_id === id).length,
      },
      relationship: {
        following: Number(s.follows.has(id)),
        blocked: Number(s.blocks.has(id)),
      },
      can_message: !s.blocks.has(id) && id !== self.id,
      conversation_id: id === 'reader-b' ? 'conversation-a' : null,
      lists: [],
      threads: s.threads.filter((t) => t.member_id === id && visible(t)),
    });
    return true;
  }
  if (ids[0] === 'members' && ids[2] === 'follow') {
    if (method === 'PUT') s.follows.add(id);
    else s.follows.delete(id);
    reply(200, { following: method === 'PUT' });
    return true;
  }
  if (ids[0] === 'members' && ids[2] === 'block') {
    if (method === 'PUT') {
      s.blocks.add(id);
      s.follows.delete(id);
    } else s.blocks.delete(id);
    reply(200, { blocked: method === 'PUT' });
    return true;
  }
  if (name === 'blocks') {
    reply(200, { members: peers.filter((m) => s.blocks.has(m.id)) });
    return true;
  }
  if (name === 'profile') {
    s.member.name = String(d.name);
    s.member.bio = String(d.bio);
    reply(200, { saved: true });
    return true;
  }
  if (name === 'preferences') {
    if (method === 'GET') reply(200, s.preferences);
    else {
      s.preferences = { ...s.preferences, ...d };
      reply(200, { saved: true });
    }
    return true;
  }
  if (name === 'reports' || ids[2] === 'report') {
    reply(200, { reported: true });
    return true;
  }
  if (name === 'conversations' && method === 'GET') {
    reply(200, {
      conversations: s.blocks.has('reader-b')
        ? []
        : [
            {
              id: 'conversation-a',
              member_id: 'reader-b',
              name: peers[1]!.name,
              preview: String(s.messages.at(-1)?.body ?? ''),
              updated_at: created_at,
              unread: s.messages.filter(
                (m) => m.seq > s.read && m.sender_id !== 'reader-self',
              ).length,
            },
          ],
      more: false,
    });
    return true;
  }
  if (ids[0] === 'conversations' && method === 'GET') {
    if (s.blocks.has('reader-b')) {
      reply(404, { error: 'This conversation is unavailable.' });
      return true;
    }
    reply(200, {
      conversation: { id: 'conversation-a', member: peers[1] },
      can_message: true,
      messages: s.messages,
      more: false,
    });
    return true;
  }
  if (ids[0] === 'conversations' && ids[2] === 'read') {
    s.read = Number(d.through);
    reply(200, { saved: true });
    return true;
  }
  if (ids[0] === 'conversations' && method === 'POST') {
    s.messages.push({
      id: String(d.client_id),
      sender_id: self.id,
      body: String(d.body),
      seq: s.messages.length + 1,
      created_at,
      hidden: 0,
    });
    reply(201, { id: 'conversation-a', sent: true });
    return true;
  }
  if (name === 'notifications') {
    reply(200, { notifications: s.notifications.filter(visible), more: false });
    return true;
  }
  if (name === 'notifications/read') {
    s.notifications.forEach((n) => {
      n.read_at = created_at;
    });
    reply(200, { saved: true });
    return true;
  }
  if (name === 'lists' && method === 'GET') {
    reply(200, { lists: s.lists });
    return true;
  }
  if (name === 'lists' && method === 'POST') {
    const id = `list-new-${nextID++}`;
    s.lists.push({
      id,
      member_id: self.id,
      title: String(d.title),
      description: String(d.description),
      public: d.public === true ? 1 : 0,
      created_at,
      count: 0,
      display_name: s.member.name,
    });
    reply(201, { id });
    return true;
  }
  if (ids[0] === 'lists' && ids.length === 2) {
    const l = s.lists.find((l) => l.id === id);
    if (!l || (!l.public && !signedIn)) {
      reply(404, { error: 'This reading list is unavailable.' });
      return true;
    }
    if (method === 'GET')
      reply(200, { list: l, items: s.items.filter((i) => i.list_id === id) });
    else if (method === 'PATCH') {
      Object.assign(l, d, { public: d.public === true ? 1 : 0 });
      reply(200, { saved: true });
    } else {
      s.lists = s.lists.filter((l) => l.id !== id);
      reply(200, { removed: true });
    }
    return true;
  }
  if (ids[0] === 'lists' && ids[2] === 'items') {
    s.items.push({
      id: `item-new-${nextID++}`,
      list_id: id,
      title: String(d.title),
      path: String(d.path),
      note: String(d.note),
      created_at,
    });
    reply(201, { saved: true });
    return true;
  }
  if (ids[0] === 'items') {
    s.items = s.items.filter((i) => i.id !== id);
    reply(200, { removed: true });
    return true;
  }
  reply(404, { error: 'This fixture page is unavailable.' });
  return true;
}
