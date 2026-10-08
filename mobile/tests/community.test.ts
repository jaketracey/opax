import native from '../modules/opax-voice';
import { assertAllowedPath } from '../src/api/policy';
import { communityRequestAllowed } from '../src/features/community/policy';
import { decodeCommunity } from '../src/features/community/model';
import { communityFromWebPath } from '../src/features/community/routes';
import { canonicalUrl } from '../src/navigation/external';
import {
  agreeGuidelines,
  blockLocally,
  clearCommunity,
  communityRead,
  communityRequest,
  hasAgreed,
  isBlocked,
  ownsList,
} from '../src/features/community/session';
jest.mock('../modules/opax-voice', () => ({
  __esModule: true,
  default: { communityRequest: jest.fn() },
}));
const request = jest.mocked(native!.communityRequest);
const reply = (body: unknown, status = 200) => ({
  ok: true,
  value: { status, body: JSON.stringify(body) },
});
beforeEach(() => {
  clearCommunity();
  request.mockReset();
});
const admissions: [string, string][] = [
  ['threads?feed=all&q=&page=0', 'GET'],
  ['threads/discussion-a', 'GET'],
  ['members?q=casey&following=false&page=0', 'GET'],
  ['members/reader-a', 'GET'],
  ['conversations', 'GET'],
  ['conversations/conversation-a?before=3', 'GET'],
  ['notifications?before=5', 'GET'],
  ['preferences', 'GET'],
  ['blocks', 'GET'],
  ['lists', 'GET'],
  ['lists/list-a', 'GET'],
  ['status', 'GET'],
  ['threads', 'POST'],
  ['threads/discussion-a', 'POST'],
  ['threads/discussion-a/like', 'PUT'],
  ['threads/discussion-a/save', 'DELETE'],
  ['reports', 'POST'],
  ['members/reader-a/follow', 'PUT'],
  ['members/reader-a/block', 'DELETE'],
  ['members/reader-a/report', 'POST'],
  ['messages/message-a/report', 'POST'],
  ['conversations', 'POST'],
  ['conversations/conversation-a/messages', 'POST'],
  ['conversations/conversation-a/read', 'POST'],
  ['notifications/read', 'POST'],
  ['profile', 'PATCH'],
  ['preferences', 'PATCH'],
  ['lists', 'POST'],
  ['lists/list-a', 'PATCH'],
  ['lists/list-a/items', 'POST'],
  ['items/item-a', 'DELETE'],
];
it.each(admissions)('admits reviewed %s %s only', (path, method) => {
  expect(communityRequestAllowed('/api/community/' + path, method)).toBe(true);
  if (method === 'GET')
    expect(() => assertAllowedPath('/api/community/' + path)).not.toThrow();
});
it.each([
  '/api/community/keys',
  '/api/community/reports',
  '/api/community/chats',
  '/api/community/auth/consume',
  '/api/community/account/delete',
  '/api/community/members/../threads',
  '/api/community/threads?feed=other',
  '/api/community/threads?feed=all&feed=saved',
  '/api/community/threads?token=x',
  '/api/community/conversations/x?before=NaN',
  '/api/community/members?following=1',
  '/api/community/members?q=' + 'a'.repeat(121),
  '/api/community/threads/x%2fy',
  '//opax.com.au/api/community/threads',
])('refuses unreviewed %s', (path) => {
  expect(communityRequestAllowed(path)).toBe(false);
  expect(() => assertAllowedPath(path)).toThrow();
});
it('has no launch read, coalesces explicit opens and back navigation, retries only on an explicit refresh', async () => {
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(reply({ threads: [], more: false }));
  const a = communityRead('/api/community/threads?feed=all');
  const b = communityRead('/api/community/threads?feed=all');
  await Promise.all([a, b]);
  await communityRead('/api/community/threads?feed=all');
  expect(request).toHaveBeenCalledTimes(1);
  await communityRead('/api/community/threads?feed=all', true);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every((c) => c[1] === 'GET' && c[2] === null)).toBe(
    true,
  );
});
it('does not retry failed mutations and never exposes a credential', async () => {
  request.mockResolvedValue(reply({ error: 'Try again.' }, 503));
  await expect(
    communityRequest('/api/community/reports', 'POST', {
      target: 't',
      reason: 'Concern',
    }),
  ).rejects.toThrow('Try again.');
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]).toEqual([
    '/api/community/reports',
    'POST',
    '{"target":"t","reason":"Concern"}',
  ]);
});
it('clears consent, private ownership, blocks and cached content on deletion or sign-out', async () => {
  request.mockResolvedValue(
    reply({ lists: [{ id: 'list-a', title: 'Reading', description: '' }] }),
  );
  await communityRead('/api/community/lists');
  expect(ownsList('list-a', 'reader-self')).toBe(true);
  agreeGuidelines();
  blockLocally('reader-a', true);
  expect(isBlocked('reader-a')).toBe(true);
  expect(hasAgreed()).toBe(true);
  clearCommunity();
  expect(isBlocked('reader-a')).toBe(false);
  expect(hasAgreed()).toBe(false);
  expect(ownsList('list-a', 'reader-self')).toBe(false);
  await communityRead('/api/community/lists');
  expect(request).toHaveBeenCalledTimes(2);
});
it('refuses a pending response from the deleted account', async () => {
  let resolve!: (v: unknown) => void;
  request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = communityRead('/api/community/lists');
  clearCommunity();
  resolve(reply({ lists: [] }));
  await expect(pending).rejects.toThrow('session changed');
});
it.each([
  ['/api/community/threads', { threads: [{ id: 't' }], more: false }],
  ['/api/community/threads/t', { thread: {}, replies: [] }],
  ['/api/community/members', { members: [{ id: 'm', name: 3 }] }],
  [
    '/api/community/members/m',
    {
      member: { id: 'm', name: 'M', bio: '' },
      stats: {},
      relationship: {},
      lists: [],
      threads: [],
      can_message: true,
    },
  ],
  [
    '/api/community/conversations',
    {
      conversations: [
        { id: 'c', name: 'M', member_id: 'm', preview: 'ok', unread: -1 },
      ],
    },
  ],
  [
    '/api/community/conversations/c',
    { conversation: { id: 'c', member: {} }, messages: [] },
  ],
  [
    '/api/community/notifications',
    {
      notifications: [
        {
          id: 'bad',
          actor_id: 'm',
          kind: 'follow',
          display_name: 'M',
          created_at: 1,
        },
      ],
    },
  ],
  [
    '/api/community/preferences',
    { message_policy: 'unknown', reply_email_notifications: 0 },
  ],
  [
    '/api/community/lists/l',
    { list: { id: 'l', title: 'L', description: '' }, items: [] },
  ],
] as [string, unknown][])(
  'validates the Worker response for %s',
  (path, data) => expect(() => decodeCommunity(path, data)).toThrow(),
);
it('maps only safe Community links and preserves the public list ID in shares', () => {
  expect(
    communityFromWebPath('/community?view=list&id=list-a')?.params,
  ).toMatchObject({ view: 'list', id: 'list-a' });
  expect(canonicalUrl('/community?view=list&id=list-a')).toContain(
    '/community?view=list&id=list-a',
  );
  for (const p of [
    '/community?token=abc',
    '/community?view=tools',
    '/community?view=member&id=../x',
    '/community?view=report&id=x',
    '/community?view=member&id=x&id=y',
  ])
    expect(communityFromWebPath(p)).toBeNull();
});

it('does not display an account that has not chosen a public profile', () => {
  expect(() =>
    decodeCommunity('/api/community/members/unnamed', {
      member: { id: 'unnamed', name: 'Community member', bio: '' },
      stats: { followers: 0, following: 0, discussions: 0 },
      relationship: { following: 0, blocked: 0 },
      can_message: false,
      threads: [],
      lists: [],
    }),
  ).toThrow('public profile');
});
