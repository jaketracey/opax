import {
  boundedStore,
  decodeStore,
  type ChatStore,
} from '../src/features/ask/model';
import { TwoSlotStore } from '../src/storage/two-slot';
import {
  clearAskConversations,
  chatsSnapshot,
  saveChats,
  subscribeChatDeletion,
} from '../src/features/ask/store';
const mockDisk = new Map<string, string>();
let mockTorn = false;
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) { this.name = name; }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(text: string) {
      mockDisk.set(this.name, mockTorn ? text.slice(0, 20) : text);
      if (mockTorn) throw new Error('Interrupted');
    }
  },
}));
const value: ChatStore = {
  v: 1,
  active: 'fixture-chat-001',
  chats: [
    {
      id: 'fixture-chat-001',
      title: 'Question',
      kind: 'speech',
      speaker: 'Roster member',
      created: 1,
      updated: 2,
      thread: [
        { role: 'user', text: 'Question' },
        { role: 'answer', text: 'Answer', sources: [] },
      ],
    },
  ],
};
beforeEach(() => {
  mockDisk.clear();
  mockTorn = false;
});
test('two-slot saved conversation survives an interrupted newer write after relaunch', async () => {
  const store = new TwoSlotStore(['a', 'b'], decodeStore, boundedStore);
  await store.save(value);
  mockTorn = true;
  await expect(store.save({ ...value, active: null })).rejects.toThrow();
  mockTorn = false;
  const relaunched = new TwoSlotStore(['a', 'b'], decodeStore, boundedStore);
  expect((await relaunched.read())?.chats[0]?.speaker).toBe('Roster member');
  expect((await relaunched.read())?.active).toBe(value.active);
});
test('account deletion clears both copies and publishes a cancellation event', async () => {
  const cleared = jest.fn(),
    unsubscribe = subscribeChatDeletion(cleared);
  await saveChats(value);
  await saveChats(value);
  await clearAskConversations();
  expect(chatsSnapshot().chats).toEqual([]);
  expect(cleared).toHaveBeenCalledTimes(1);
  for (const text of mockDisk.values())
    expect(JSON.parse(text).chats).toEqual([]);
  unsubscribe();
});
