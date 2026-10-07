import { TwoSlotStore } from '../../storage/two-slot';
import { boundedStore, decodeStore, type ChatStore } from './model';
const slots = ['opax-chats-a.json', 'opax-chats-b.json'] as const;
const disk = new TwoSlotStore<ChatStore>(slots, decodeStore, boundedStore);
export const emptyChats = (): ChatStore => ({ v: 1, active: null, chats: [] });
let state = emptyChats();
let loading: Promise<void> | null = null;
let revision = 0;
const listeners = new Set<() => void>();
const deletionListeners = new Set<() => void>();
export function subscribeChatDeletion(f: () => void) {
  deletionListeners.add(f);
  return () => {
    deletionListeners.delete(f);
  };
}
export function chatsSnapshot() {
  return state;
}
export function subscribeChats(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next: ChatStore) {
  state = next;
  for (const f of listeners) f();
}
export async function loadChats() {
  if (!loading) {
    const mine = revision;
    loading = disk.read().then((v) => {
      if (mine === revision && v) publish(v);
    });
  }
  await loading;
}
export async function saveChats(next: ChatStore) {
  revision++;
  publish({
    ...next,
    chats: next.chats
      .slice()
      .sort((a, b) => b.updated - a.updated)
      .slice(0, 20),
  });
  await disk.save(boundedStore(state));
}
// Writing an empty newest generation makes both old saves unreachable. A
// second write replaces the other slot, so deletion leaves no old local copy.
export async function clearAskConversations() {
  revision++;
  for (const f of deletionListeners) f();
  publish(emptyChats());
  loading = Promise.resolve();
  await disk.save(emptyChats());
  await disk.save(emptyChats());
}
