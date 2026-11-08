import { useEffect, useSyncExternalStore } from 'react';
import * as voice from '../../voice';
import type { VoiceFailure, VoiceStatus } from '../../voice';
import { TwoSlotStore } from '../../storage/two-slot';
import { accountCopy, isOfflineFailure } from './copy';
import { accountSessionChanged } from './session-change';

// What the app knows about the voice account. The session token stays in the
// native Keychain. The address is remembered in the app's own storage while
// signed in (specs/account.md 2.6), so the sheet still says whose account it
// is after a relaunch; it is never sent anywhere or logged.
export type AccountNotice = 'signedOut' | 'deleted' | 'localChatsError';
export type AccountState = {
  status: VoiceStatus | null;
  error: VoiceFailure | null;
  checking: boolean;
  /** From a confirmed code exchange, or remembered from one on this device. */
  email: string | null;
  /** The native controller cleared its status; the account is unknown. */
  cleared: boolean;
  notice: AccountNotice | null;
};
export type AccountView =
  | { kind: 'checking'; email: string | null }
  | { kind: 'failed'; email: string | null; offline: boolean }
  | { kind: 'signedOut' }
  | { kind: 'unavailable'; email: string | null }
  | { kind: 'signedIn'; status: VoiceStatus; email: string | null };

const initial: AccountState = {
  status: null,
  error: null,
  checking: false,
  email: null,
  cleared: false,
  notice: null,
};
let state = initial;
let request = 0;
const listeners = new Set<() => void>();

const remembered = new TwoSlotStore<{ email: string | null }>(
  ['opax-account-v1.json', 'opax-account-v1.b.json'],
  (raw) => {
    const email = (raw as { email?: unknown } | null)?.email;
    return typeof email === 'string' || email === null ? { email } : null;
  },
  (value) => value,
);
let loaded: Promise<void> | null = null;
/** Reads the remembered address once per launch. */
export function loadRememberedAccount(): Promise<void> {
  loaded ??= remembered
    .read()
    .then((value) => {
      // A status that says no account is held, or a sign-in in the meantime,
      // wins over the file.
      if (!value?.email || state.email) return;
      if (state.status && !held(state.status)) return forget();
      update({ email: value.email });
    })
    .catch(() => undefined);
  return loaded;
}
function remember(email: string) {
  void remembered.save({ email }).catch(() => undefined);
}
function forget() {
  void remembered.save({ email: null }).catch(() => undefined);
}

const held = (status: VoiceStatus | null) =>
  status !== null && (status.signedIn || status.accountHeld === true);

function update(next: Partial<AccountState>) {
  state = { ...state, ...next };
  if (state.status && !held(state.status) && state.email) {
    state = { ...state, email: null };
    forget();
  }
  for (const listener of listeners) listener();
}

export function accountView(value: AccountState): AccountView {
  if (value.status?.signedIn)
    return { kind: 'signedIn', status: value.status, email: value.email };
  // Voice refuses the member, but the account is still held on this iPhone
  // (a disabled member): sign-out and deletion stay offered, after a relaunch
  // or a later moderation too, because the native status says so.
  if (held(value.status)) return { kind: 'unavailable', email: value.email };
  if (value.status) return { kind: 'signedOut' };
  if (value.checking) return { kind: 'checking', email: value.email };
  return value.error || value.cleared
    ? {
        kind: 'failed',
        email: value.email,
        offline: isOfflineFailure(value.error),
      }
    : { kind: 'checking', email: value.email };
}

/** The bar's Account symbol: filled while an account is held (1.2). */
export function accountSignedIn(value: AccountState): boolean {
  if (value.status) return held(value.status);
  return value.email !== null;
}

/** The sentence a notice shows (2.4); the chats error draws as an error. */
export const noticeText = (notice: AccountNotice) =>
  notice === 'signedOut'
    ? accountCopy.signedOutNotice
    : notice === 'deleted'
      ? accountCopy.deletedNotice
      : accountCopy.localChatsError;

/** A fresh status read; the latest request wins. */
export async function refreshAccount(): Promise<void> {
  const mine = ++request;
  update({ checking: true });
  const result = await voice.status();
  if (mine !== request) return;
  if (result.ok)
    update({
      status: result.value,
      error: null,
      checking: false,
      cleared: false,
    });
  else update({ error: result.error, checking: false });
}

/**
 * After a confirmed code exchange only: the status it returned, labelled with
 * the address the code went to. Never after a failed or unknown exchange.
 */
export function codeAccepted(email: string, status: VoiceStatus) {
  accountSessionChanged();
  request++;
  const address = email.trim().toLowerCase();
  update({
    status,
    error: null,
    checking: false,
    email: address,
    cleared: false,
    notice: null,
  });
  if (held(status)) remember(address);
}

/**
 * The token is removed on this iPhone even when the server cannot be told,
 * so the notice is the same either way (2.4).
 */
export async function signOut(): Promise<void> {
  accountSessionChanged();
  await voice.logout();
  forget();
  update({ status: null, email: null, notice: 'signedOut' });
  await refreshAccount();
}

/** Deleted on the server: signed out, with the deletion notice (6.5). */
export function accountDeleted(localChatsCleared = true) {
  accountSessionChanged();
  forget();
  update({
    status: null,
    email: null,
    notice: localChatsCleared ? 'deleted' : 'localChatsError',
  });
  void refreshAccount();
}

/** The local conversations were cleared on a retry after deletion. */
export function localChatsCleared() {
  if (state.notice === 'localChatsError') update({ notice: 'deleted' });
}

/** The session ended on the server (401): show signed out. */
export function sessionEnded() {
  accountSessionChanged();
  forget();
  update({ status: null, email: null });
  void refreshAccount();
}

export function clearNotice() {
  if (state.notice) update({ notice: null });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;
export const accountSnapshot = () => state;

/** The account as the Account sheet shows it. */
export function useAccount(): AccountState {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void loadRememberedAccount();
    // Status the native controller publishes (after a call, deletion or a
    // revoked token) replaces the cached copy.
    return voice.subscribe((event) => {
      // A failed refresh also clears it, so a cleared status never starts
      // another read: Try again does.
      if (event.type !== 'status') return;
      if (event.status)
        update({ status: event.status, error: null, cleared: false });
      else update({ status: null, cleared: true });
    });
  }, []);
  return value;
}

/** True while an account is held, or remembered before status arrives. */
export function useAccountSignedIn(): boolean {
  return accountSignedIn(useAccount());
}

/** Tests only. */
export function resetAccountStore() {
  state = initial;
  request = 0;
  loaded = null;
}
