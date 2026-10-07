import { client } from '../../api/runtime';
import { AskController } from './controller';
import {
  chatsSnapshot,
  saveChats,
  subscribeChats,
  subscribeChatDeletion,
} from './store';
import { syncSubmittedChat } from './sync';
import { accountSnapshot } from '../account/store';
export const askSession = new AskController({
  post: (...args) => client.askPost(...args),
  read: chatsSnapshot,
  save: saveChats,
  id: () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
  now: Date.now,
  sync: async (id) => {
    const c = chatsSnapshot().chats.find((c) => c.id === id);
    if (c) await syncSubmittedChat(c, accountSnapshot().status);
  },
});
subscribeChats(() => {
  if (
    !chatsSnapshot().chats.length &&
    askSession.snapshot().id &&
    !askSession.snapshot().busy
  )
    askSession.start();
});
subscribeChatDeletion(() => askSession.start());
