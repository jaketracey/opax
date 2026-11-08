import { useSyncExternalStore } from 'react';
import type { VoiceSource } from '../../voice';
import type { OrbPhase } from './VoiceOrb';

/**
 * The call as the Talk stack's other screens see it: the Sources sheet and a
 * record pushed during the call (specs/account.md 7.4). The call itself
 * belongs to the Talk screen's mount (useTalk); this is a read-only mirror it
 * publishes, plus the one action those screens can take, End.
 */
export type TalkLive = {
  sources: readonly VoiceSource[];
  /** A call is connecting, live or ending. */
  active: boolean;
  live: boolean;
  /** The status the orb speaks ("Listening"). */
  status: string;
  phase: OrbPhase;
  end: () => void;
};
const idle: TalkLive = {
  sources: [],
  active: false,
  live: false,
  status: '',
  phase: 'rest',
  end: () => undefined,
};
let current = idle;
let chosen: VoiceSource | null = null;
const listeners = new Set<() => void>();

export function publishTalk(next: TalkLive) {
  current = next;
  listeners.forEach((listener) => listener());
}
export function resetTalk() {
  chosen = null;
  publishTalk(idle);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const useTalkLive = () =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );

/** A source chosen on the Sources sheet, opened once the sheet has gone. */
export function chooseSource(source: VoiceSource) {
  chosen = source;
}
export function takeChosenSource(): VoiceSource | null {
  const value = chosen;
  chosen = null;
  return value;
}
