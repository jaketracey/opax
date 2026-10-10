export type Row = Record<string, unknown>;
export type CommunityData = { [key: string]: unknown };
export function object(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Invalid community response');
  return v as Row;
}
export function string(v: unknown): string {
  if (typeof v !== 'string') throw new Error('Invalid community text');
  return v;
}
export function number(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
    throw new Error('Invalid community count');
  return v;
}
export const text = (row: Row, key: string) =>
  typeof row[key] === 'string' ? (row[key] as string) : '';
export const count = (row: Row, key: string) =>
  typeof row[key] === 'number' ? (row[key] as number) : 0;
export const flag = (v: unknown) => v === true || v === 1;
export const rows = (d: Row, key: string): Row[] =>
  Array.isArray(d[key]) ? (d[key] as Row[]) : [];
const rowFields: Record<string, string[]> = {
  threads: ['id', 'member_id', 'title', 'body', 'display_name'],
  replies: ['id', 'member_id', 'body', 'display_name'],
  members: ['id', 'name'],
  conversations: ['id', 'member_id', 'name', 'preview'],
  messages: ['id', 'sender_id', 'body'],
  notifications: ['actor_id', 'kind', 'display_name'],
  lists: ['id', 'title', 'description'],
  items: ['id', 'path', 'title', 'note'],
};
function validateRow(v: unknown, kind: string) {
  const r = object(v);
  for (const k of rowFields[kind] ?? []) string(r[k]);
  if ('id' in r && typeof r.id === 'string' && !/^[\w-]{1,64}$/.test(r.id))
    throw new Error('Invalid content ID');
  for (const k of [
    'created_at',
    'joined_at',
    'likes',
    'replies',
    'unread',
    'seq',
    'updated_at',
    'count',
  ])
    if (k in r && r[k] != null) number(r[k]);
  if (kind === 'threads') {
    number(r.replies);
    number(r.likes);
  }
  if (kind === 'messages') {
    number(r.seq);
    number(r.created_at);
  }
  if (kind === 'notifications') {
    number(r.id);
    number(r.created_at);
  }
  return r;
}
export function decodeCommunity(path: string, value: unknown): CommunityData {
  const d = object(value),
    name = path.slice(15).split('?')[0]!;
  const collections =
    name === 'threads'
      ? ['threads']
      : name === 'members' || name === 'blocks'
        ? ['members']
        : name === 'lists'
          ? ['lists']
          : name === 'conversations'
            ? ['conversations']
            : name === 'notifications'
              ? ['notifications']
              : /^threads\//.test(name)
                ? ['replies']
                : /^members\//.test(name)
                  ? ['lists', 'threads']
                  : /^lists\//.test(name)
                    ? ['items']
                    : /^conversations\//.test(name)
                      ? ['messages']
                      : [];
  for (const k of collections) {
    if (!Array.isArray(d[k]) || d[k].length > 250)
      throw new Error('Invalid community collection');
    d[k].forEach((v: unknown) => validateRow(v, k));
  }
  if (/^threads\//.test(name)) validateRow(d.thread, 'threads');
  if (/^lists\//.test(name)) {
    validateRow(d.list, 'lists');
    string(object(d.list).member_id);
  }
  if (name === 'status' || /^members\//.test(name)) {
    if (d.member !== null) {
      const m = object(d.member);
      string(m.id);
      string(m.name);
      string(m.bio);
    }
    if (name === 'status' && typeof d.enabled !== 'boolean')
      throw new Error('Invalid enabled flag');
  }
  if (/^members\//.test(name)) {
    const stats = object(d.stats);
    ['followers', 'following', 'discussions'].forEach((k) => number(stats[k]));
    const relationship = object(d.relationship);
    if (
      ['following', 'blocked'].some(
        (k) =>
          ![0, 1, true, false].includes(relationship[k] as number | boolean),
      )
    )
      throw new Error('Invalid member relationship');
    if (
      object(d.member).name === 'Community member' ||
      string(object(d.member).name).trim().length < 2
    )
      throw new Error('This public profile is unavailable.');
    if (typeof d.can_message !== 'boolean')
      throw new Error('Invalid messaging permission');
  }
  if (/^conversations\//.test(name)) {
    string(object(d.conversation).id);
    const m = object(object(d.conversation).member);
    string(m.id);
    string(m.name);
  }
  if (
    name === 'preferences' &&
    (!['everyone', 'following', 'nobody'].includes(String(d.message_policy)) ||
      typeof d.reply_email_notifications !== 'boolean')
  )
    throw new Error('Invalid preferences');
  if ('more' in d && typeof d.more !== 'boolean')
    throw new Error('Invalid paging flag');
  return d;
}
export const guidelines = [
  [
    'Bring a source',
    'Link to the record you are discussing. Distinguish what it says from your interpretation, and be open to corrections.',
  ],
  [
    'Discuss ideas with care',
    'No harassment, threats, discrimination, personal information about others, spam or unsupported accusations. A recorded connection is not proof of influence or wrongdoing.',
  ],
  [
    'Keep it useful',
    'Discussions and reading lists are written by members. They are separate from OPAX’s source records. Moderators can remove content that breaks these guidelines.',
  ],
  [
    'Flag a concern',
    'Use Report on a discussion, reply or received message to send a concern to moderators. Reporting a message shares only that message with moderators. You can also block a member from their profile or conversation. You can remove your own discussions and replies.',
  ],
] as const;
