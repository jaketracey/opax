import { useEffect, useSyncExternalStore } from 'react';
import * as voice from '../../voice';
import type { VoiceFailure, VoiceStatus } from '../../voice';
import { accountCopy } from './copy';

// What the app knows about the voice account. Memory only: the session token
// stays in the native Keychain, and the bridge never exposes the address, so
// the address is remembered only from a sign-in in this app session.
export type AccountState = {
  status: VoiceStatus | null;
  error: VoiceFailure | null;
  checking: boolean;
  email: string | null;
  /** A code was accepted, but voice treats the member as signed out (disabled). */
  unavailable: boolean;
  /** The native controller cleared its status; the account is unknown. */
  cleared: boolean;
  notice: string | null;
};
export type AccountView =
  | { kind: 'checking' }
  | { kind: 'failed' }
  | { kind: 'signedOut' }
  | { kind: 'unavailable' }
  | { kind: 'signedIn'; status: VoiceStatus; email: string | null };

const initial: AccountState = {
  status: null,
  error: null,
  checking: false,
  email: null,
  unavailable: false,
  cleared: false,
  notice: null,
};
let state = initial;
let request = 0;
const listeners = new Set<() => void>();

function update(next: Partial<AccountState>) {
  state = { ...state, ...next };
  if (state.status?.signedIn) state = { ...state, unavailable: false };
  else if (state.status && !state.unavailable)
    state = { ...state, email: null };
  for (const listener of listeners) listener();
}

export function accountView(value: AccountState): AccountView {
  if (value.status?.signedIn)
    return { kind: 'signedIn', status: value.status, email: value.email };
  if (value.unavailable) return { kind: 'unavailable' };
  if (value.status) return { kind: 'signedOut' };
  if (value.checking) return { kind: 'checking' };
  return value.error || value.cleared
    ? { kind: 'failed' }
    : { kind: 'checking' };
}

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

/** After an accepted code: the status the exchange returned. */
export function codeAccepted(email: string, status: VoiceStatus) {
  request++;
  update({
    status,
    error: null,
    checking: false,
    email: email.trim().toLowerCase(),
    unavailable: !status.signedIn,
    cleared: false,
    notice: null,
  });
}

export async function signOut(): Promise<void> {
  const result = await voice.logout();
  // The token is removed on this iPhone even when the server cannot be told.
  update({
    status: null,
    unavailable: false,
    email: null,
    notice: result.ok
      ? accountCopy.signedOutNotice
      : accountCopy.signedOutLocally,
  });
  await refreshAccount();
}

export function accountDeleted() {
  update({ status: null, unavailable: false, email: null, notice: null });
  void refreshAccount();
}

/** The session ended on the server (401): show signed out. */
export function sessionEnded() {
  update({ status: null, unavailable: false, email: null });
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

/** The account as the Account and about sheet shows it. */
export function useAccount(): AccountState {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(
    () =>
      // Status the native controller publishes (after a call, deletion or a
      // revoked token) replaces the cached copy.
      voice.subscribe((event) => {
        // A failed refresh also clears it, so a cleared status never starts
        // another read: Try again does.
        if (event.type !== 'status') return;
        if (event.status)
          update({ status: event.status, error: null, cleared: false });
        else update({ status: null, cleared: true });
      }),
    [],
  );
  return value;
}

/** Tests only. */
export function resetAccountStore() {
  state = initial;
  request = 0;
}
