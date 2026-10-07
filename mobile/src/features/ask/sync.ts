import native from '../../../modules/opax-voice';
import {
  decodeRemoteChat,
  decodeRemoteIndex,
  syncBody,
  type Chat,
  type ChatStore,
} from './model';
let queue: Promise<unknown> = Promise.resolve();
export class ChatSyncError extends Error {
  constructor(public readonly code: 'signed-out' | 'unavailable') {
    super(
      code === 'signed-out'
        ? 'Sign in to sync conversations.'
        : 'Your conversations are saved on this iPhone. Account sync could not complete.',
    );
  }
}
export function chatRequest(
  path: string,
  method: 'GET' | 'PUT' | 'DELETE',
  body?: object,
): Promise<unknown> {
  const run = queue.then(() => performChatRequest(path, method, body));
  queue = run.catch(() => undefined);
  return run;
}
async function performChatRequest(
  path: string,
  method: 'GET' | 'PUT' | 'DELETE',
  body?: object,
): Promise<unknown> {
  if (!native) throw new Error('Account sync is unavailable.');
  const raw = (await native.chatRequest(
    path,
    method,
    body ? JSON.stringify(body) : null,
  )) as { ok?: boolean; value?: unknown; error?: string };
  if (!raw.ok || typeof raw.value !== 'string')
    throw new ChatSyncError(
      raw.error === 'signedOut' ? 'signed-out' : 'unavailable',
    );
  return JSON.parse(raw.value);
}
export const pushChat = (c: Chat) =>
  chatRequest(`/api/community/chats/${c.id}`, 'PUT', syncBody(c));
/** Native credential preflight handles a relaunch without a voice status read. */
export async function syncSubmittedChat(
  c: Chat,
  status?: { signedIn?: boolean; accountHeld?: boolean } | null,
) {
  if (status && !status.signedIn && !status.accountHeld) return;
  try {
    await pushChat(c);
  } catch (e) {
    if (!status && e instanceof ChatSyncError && e.code === 'signed-out')
      return;
    throw e;
  }
}
export const deleteRemoteChat = (id: string) =>
  chatRequest(`/api/community/chats/${id}`, 'DELETE');
export async function reconcileChats(
  local: ChatStore,
  isCurrent: () => boolean = () => true,
): Promise<ChatStore> {
  const check = () => {
    if (!isCurrent()) throw new Error('Conversation sync was cancelled.');
  };
  const index = decodeRemoteIndex(
    await chatRequest('/api/community/chats', 'GET'),
  );
  check();
  const chats = local.chats.slice();
  for (const row of index) {
    const own = chats.find((c) => c.id === row.id);
    if (own && own.updated >= row.updated_at) continue;
    const next = decodeRemoteChat(
      await chatRequest(`/api/community/chats/${row.id}`, 'GET'),
    );
    check();
    if (next) {
      const at = chats.findIndex((c) => c.id === next.id);
      if (at >= 0) chats[at] = next;
      else chats.push(next);
    }
  }
  for (const c of local.chats) {
    const remote = index.find((r) => r.id === c.id);
    if (!remote || c.updated > remote.updated_at) {
      check();
      await pushChat(c);
    }
  }
  return {
    ...local,
    chats: chats.sort((a, b) => b.updated - a.updated).slice(0, 20),
  };
}
export async function deleteAllRemoteChats() {
  const index = decodeRemoteIndex(
    await chatRequest('/api/community/chats', 'GET'),
  );
  for (const c of index) await deleteRemoteChat(c.id);
}
