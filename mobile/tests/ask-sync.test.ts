import native from '../modules/opax-voice';
import {
  deleteAllRemoteChats,
  deleteRemoteChat,
  reconcileChats,
  pushChat,
} from '../src/features/ask/sync';
import type { Chat, ChatStore } from '../src/features/ask/model';
jest.mock('../modules/opax-voice', () => ({
  __esModule: true,
  default: { chatRequest: jest.fn() },
}));
const request = native!.chatRequest as jest.Mock;
const c: Chat = {
  id: 'fixture-chat-001',
  title: 'Question',
  kind: 'speech',
  speaker: 'Roster member',
  created: 1,
  updated: 10,
  thread: [
    { role: 'user', text: 'Question' },
    { role: 'answer', text: 'Answer', sources: [] },
  ],
};
const store: ChatStore = { v: 1, active: c.id, chats: [c] };
const response = (value: unknown) => ({
  ok: true,
  value: JSON.stringify(value),
});
beforeEach(() => request.mockReset());
test('a newer remote chat wins without rewriting the newer record', async () => {
  request
    .mockResolvedValueOnce(response({ chats: [{ id: c.id, updated_at: 20 }] }))
    .mockResolvedValueOnce(
      response({
        chat: {
          id: c.id,
          title: 'Newer',
          kind: 'speech',
          created_at: 1,
          updated_at: 20,
          data: { thread: c.thread, speaker: 'Roster member' },
        },
      }),
    );
  const result = await reconcileChats(store);
  expect(result.chats[0]?.title).toBe('Newer');
  expect(request.mock.calls.map((a) => [a[0], a[1]])).toEqual([
    ['/api/community/chats', 'GET'],
    [`/api/community/chats/${c.id}`, 'GET'],
  ]);
});
test('local newer and missing conversations each push once with exact web shapes', async () => {
  request
    .mockResolvedValueOnce(response({ chats: [{ id: c.id, updated_at: 5 }] }))
    .mockResolvedValue(response({ ok: true }));
  await reconcileChats(store);
  expect(request).toHaveBeenCalledTimes(2);
  const [path, method, text] = request.mock.calls[1]!;
  expect(path).toBe(`/api/community/chats/${c.id}`);
  expect(method).toBe('PUT');
  expect(JSON.parse(text)).toEqual({
    title: c.title,
    kind: c.kind,
    speaker: c.speaker,
    updated: 10,
    thread: c.thread,
  });
});
test('a deletion invalidates a late account pull before any old chat can be pushed', async () => {
  request.mockResolvedValue(response({ chats: [] }));
  await expect(reconcileChats(store, () => false)).rejects.toThrow('cancelled');
  expect(request).toHaveBeenCalledTimes(1);
});
test('delete all includes every remote conversation, beyond the local twenty', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: `fixture-chat-${i}`,
    updated_at: 10,
  }));
  request
    .mockResolvedValueOnce(response({ chats: rows }))
    .mockResolvedValue(response({ ok: true }));
  await deleteAllRemoteChats();
  expect(request).toHaveBeenCalledTimes(26);
  expect(
    request.mock.calls
      .slice(1)
      .every((a) => a[1] === 'DELETE' && a[2] === null),
  ).toBe(true);
});
test('account PUT and DELETE are serialized, preserving deletion as the final write', async () => {
  let finish: (v: unknown) => void = () => {};
  request
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    )
    .mockResolvedValue(response({ ok: true }));
  const write = pushChat(c);
  await Promise.resolve();
  const deletion = deleteRemoteChat(c.id);
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  finish(response({ ok: true }));
  await Promise.all([write, deletion]);
  expect(request.mock.calls.map((a) => a[1])).toEqual(['PUT', 'DELETE']);
});
test('revoked sign-in is reported without exposing native tokens', async () => {
  request.mockResolvedValue({ ok: false, error: 'signedOut' });
  await expect(reconcileChats(store)).rejects.toThrow('Sign in to sync');
});
