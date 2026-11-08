import { confirmAction } from '../../design/menu';
import { voiceLinked } from '../../voice/linked';
import { askSession } from './session';
import {
  chatsSnapshot,
  clearAskConversations,
  deleteChats,
  saveChats,
} from './store';
import {
  ChatSyncError,
  deleteAllRemoteChats,
  deleteRemoteChat,
  reconcileChats,
} from './sync';

/** The account status the Ask conversation actions read. */
export type ChatAccount =
  | { signedIn?: boolean; accountHeld?: boolean }
  | null
  | undefined;
/** Conversations also live in an OPAX account: signed in, or an account held. */
export const inAccount = (status: ChatAccount) =>
  !!(status && (status.signedIn || status.accountHeld));
/** Sync runs when signed in, or when the status is not known yet. */
export const canSync = (status: ChatAccount) =>
  voiceLinked && (!status || inAccount(status));

/**
 * Deletes one conversation from this device and, signed in, from the
 * account. Resolves false when only the account delete failed.
 */
export async function deleteConversation(
  id: string,
  status: ChatAccount,
): Promise<boolean> {
  const s = askSession.snapshot();
  if (s.id === id && !s.busy) askSession.start();
  await deleteChats([id]);
  if (!inAccount(status)) return true;
  try {
    await deleteRemoteChat(id);
    return true;
  } catch {
    return false;
  }
}
/** Retries the account half of a delete. */
export async function retryRemoteDelete(id: string): Promise<boolean> {
  try {
    await deleteRemoteChat(id);
    return true;
  } catch {
    return false;
  }
}
/** Every conversation, here and in the account. No Undo, so it is confirmed. */
export async function deleteAllConversations(status: ChatAccount) {
  if (!askSession.snapshot().busy) askSession.start();
  await clearAskConversations();
  if (inAccount(status)) await deleteAllRemoteChats();
}
export const deleteAllCopy = {
  title: 'Delete all conversations?',
  account: "They'll also be removed from your OPAX account.",
} as const;
/** The confirmation every "Delete all" goes through (Conversations, Account › Ask). */
export function confirmDeleteAll(
  status: ChatAccount,
  label: string,
  onDone?: (ok: boolean) => void,
) {
  confirmAction(
    inAccount(status)
      ? `${deleteAllCopy.title}\n${deleteAllCopy.account}`
      : deleteAllCopy.title,
    [
      {
        title: label,
        destructive: true,
        onPress: () => {
          void deleteAllConversations(status).then(
            () => onDone?.(true),
            () => onDone?.(false),
          );
        },
      },
    ],
  );
}
/**
 * Pulls the account's conversations and pushes this device's. Resolves
 * 'synced', 'skipped' (signed out) or 'failed'.
 */
export async function syncConversations(
  isCurrent: () => boolean = () => true,
): Promise<'synced' | 'skipped' | 'failed'> {
  try {
    const next = await reconcileChats(chatsSnapshot(), isCurrent);
    if (!isCurrent()) return 'skipped';
    await saveChats(next);
    const open = askSession.snapshot();
    if (open.id && !open.busy) askSession.open(open.id);
    return 'synced';
  } catch (e) {
    if (e instanceof ChatSyncError && e.code === 'signed-out') return 'skipped';
    return isCurrent() ? 'failed' : 'skipped';
  }
}
// One pull at a time: a delete, Delete all or leaving the page makes a
// running pull stale, so it never saves or pushes an old copy.
let syncVersion = 0;
/** Starts a pull; the returned check stays true until something supersedes it. */
export function beginSync(): () => boolean {
  const mine = ++syncVersion;
  return () => mine === syncVersion;
}
export function invalidateSync() {
  syncVersion++;
}
