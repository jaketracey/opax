import type { Chat, ChatStore } from '../src/features/ask/model';
import {
  deleteConversation,
  syncConversations,
} from '../src/features/ask/conversation-actions';
import { askSession } from '../src/features/ask/session';
import { chatsSnapshot, saveChats } from '../src/features/ask/store';
import { reconcileChats } from '../src/features/ask/sync';

jest.mock('../src/features/ask/store', () => ({
  chatsSnapshot: jest.fn(),
  saveChats: jest.fn().mockResolvedValue(undefined),
  deleteChats: jest.fn(),
  clearAskConversations: jest.fn(),
}));
jest.mock('../src/features/ask/sync', () => ({
  ChatSyncError: class extends Error {},
  reconcileChats: jest.fn(),
  deleteRemoteChat: jest.fn(),
  deleteAllRemoteChats: jest.fn(),
}));
jest.mock('../src/features/ask/session', () => ({
  askSession: {
    open: jest.fn(),
    reload: jest.fn(),
    start: jest.fn(),
    snapshot: jest.fn(),
  },
}));
jest.mock('../src/design/menu', () => ({ confirmAction: jest.fn() }));
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));

const chat = (id: string, updated: number, answers = 1): Chat => ({
  id,
  title: `Fixture ${id}`,
  kind: 'all',
  speaker: '',
  created: 1,
  updated,
  thread: Array.from({ length: answers }, () => [
    { role: 'user' as const, text: `Fixture ${id}?` },
    { role: 'answer' as const, text: 'Fixture answer.' },
  ]).flat(),
});
const store = (chats: Chat[], active: string | null = null): ChatStore => ({
  v: 1,
  active,
  chats,
});

test('an answer saved while the account is read is kept, and the open conversation is reloaded, not reopened', async () => {
  let local = store([chat('fixture-open', 10)], 'fixture-open');
  jest.mocked(chatsSnapshot).mockImplementation(() => local);
  jest.mocked(askSession.snapshot).mockReturnValue({
    id: 'fixture-open',
    busy: false,
  } as ReturnType<typeof askSession.snapshot>);
  jest.mocked(reconcileChats).mockImplementation(async (start) => {
    // The running answer lands and is saved before the pull returns.
    local = store([chat('fixture-open', 20, 2)], 'fixture-open');
    return { ...start, chats: [...start.chats, chat('fixture-remote', 5)] };
  });
  expect(await syncConversations()).toBe('synced');
  const saved = jest.mocked(saveChats).mock.calls[0]![0];
  expect(saved.chats.map((c) => [c.id, c.updated, c.thread.length])).toEqual([
    ['fixture-open', 20, 4],
    ['fixture-remote', 5, 2],
  ]);
  expect(askSession.open).not.toHaveBeenCalled();
  expect(askSession.reload).toHaveBeenCalledWith('fixture-open');
});

test('a conversation deleted on this device during the pull does not come back', async () => {
  let local = store([chat('fixture-kept', 10), chat('fixture-deleted', 9)]);
  jest.mocked(chatsSnapshot).mockImplementation(() => local);
  jest.mocked(askSession.snapshot).mockReturnValue({
    id: null,
    busy: false,
  } as ReturnType<typeof askSession.snapshot>);
  jest.mocked(reconcileChats).mockImplementation(async (start) => {
    local = store([chat('fixture-kept', 10)]);
    return start;
  });
  await syncConversations();
  const saved = jest.mocked(saveChats).mock.calls.at(-1)![0];
  expect(saved.chats.map((c) => c.id)).toEqual(['fixture-kept']);
});

test('deleting the conversation being answered stops the answer so it is not saved back', async () => {
  jest.mocked(askSession.snapshot).mockReturnValue({
    id: 'fixture-running',
    busy: true,
  } as ReturnType<typeof askSession.snapshot>);
  await deleteConversation('fixture-running', null);
  expect(askSession.start).toHaveBeenCalledTimes(1);
});
