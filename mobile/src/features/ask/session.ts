import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';
import { client, catalogs } from '../../api/runtime';
import { requestFocus } from '../../design/keyboard';
import { askConsentRoute } from '../../navigation/routes/ask';
import { AskController } from './controller';
import { askConsentGiven, giveAskConsent } from './consent';
import {
  defaultOptions,
  parseTurnKey,
  type AskOptions,
  type Followup,
  type Turn,
} from './model';
import {
  chatsSnapshot,
  forgetActiveChat,
  saveChats,
  subscribeChats,
  subscribeChatDeletion,
} from './store';
import { syncSubmittedChat } from './sync';
import { accountSnapshot } from '../account/store';
import { currentSection, track } from '../../analytics';
export const askSession = new AskController({
  post: (...args) => client.askPost(...args),
  read: chatsSnapshot,
  save: saveChats,
  forgetActive: forgetActiveChat,
  id: () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
  now: Date.now,
  measure: (event, properties) => track(event, properties),
  section: currentSection,
  sendQueued: () => sendQueued(),
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

/** An arrival's scope, as `useOpenAsk` and `askRoute` carry it. */
export type AskScope = {
  question: string;
  speaker?: string;
  party?: string;
  state?: string;
  topic?: string;
  from?: string;
  to?: string;
  kind?: string;
};
export function scopeOptions(scope: Partial<AskScope>): AskOptions {
  const o = { ...defaultOptions };
  for (const k of ['speaker', 'party', 'state', 'topic', 'from', 'to'] as const)
    if (typeof scope[k] === 'string' && scope[k]) o[k] = scope[k]!;
  o.kind = scope.kind === 'speech' ? 'speech' : 'all';
  return o;
}
// Each arrival is handled once: by `useOpenAsk` at the tap, or by the Ask
// screen from a deep link's `entry` param.
const handled = new Set<string>();
export function markArrival(entry: string) {
  handled.add(entry);
  if (handled.size > 32) handled.delete(handled.values().next().value!);
}
/** True the first time an arrival's entry is seen. */
function firstArrival(entry?: string) {
  if (!entry) return true;
  if (handled.has(entry)) return false;
  markArrival(entry);
  return true;
}
/**
 * A generic "Ask about …" from outside Ask: a new conversation with the
 * scope's draft in the composer, the keyboard up, nothing sent, and a
 * running answer left running (journeys/ask.md 4.2).
 */
export function arriveInAsk(scope: AskScope, entry?: string) {
  if (!firstArrival(entry)) return;
  const running = askSession.snapshot().busy;
  askSession.arrive(scope.question ?? '', scopeOptions(scope));
  requestFocus('ask');
  AccessibilityInfo.announceForAccessibilityWithOptions(
    running ? 'Draft added. Starts a new conversation.' : 'Draft added.',
    { queue: true },
  );
}

export const askNowCopy = {
  waits: 'Asks when this answer finishes',
  offline: "Draft added. You're offline, so it hasn't been asked.",
} as const;
/**
 * A tapped question (Today's starters and any row that shows the exact
 * question it asks): a new conversation that asks it at once
 * (journeys/ask.md 4.2). A running answer keeps running in its own
 * conversation and the question waits, marked "Asks when this answer
 * finishes", then sends. Offline it only fills the composer, as a generic
 * Ask does; nothing is queued out of sight. VoiceOver moves to the answer's
 * status, not the composer.
 */
export function askNow(
  scope: AskScope,
  entry?: string,
  { offline = false }: { offline?: boolean } = {},
) {
  if (!firstArrival(entry)) return;
  const question = (scope.question ?? '').trim();
  if (offline || !question) {
    askSession.arrive(question, scopeOptions(scope));
    requestFocus('ask');
    AccessibilityInfo.announceForAccessibilityWithOptions(
      offline ? askNowCopy.offline : 'Draft added.',
      { queue: true },
    );
    return;
  }
  const running = askSession.snapshot().busy;
  askSession.arrive(question, scopeOptions(scope), { queue: true });
  requestFocus('ask-status');
  if (running) {
    AccessibilityInfo.announceForAccessibilityWithOptions(
      `${askNowCopy.waits}.`,
      { queue: true },
    );
    return;
  }
  void askQuestion(question, { fromDraft: true }).then(refused);
}
/** A refused send (the Person check) leaves the question to edit. */
function refused(error: string | null) {
  if (!error) return;
  requestFocus('ask');
  AccessibilityInfo.announceForAccessibilityWithOptions(error, {
    queue: true,
  });
}
/** The queued question, once the answer it waited for has ended. */
async function sendQueued() {
  const s = askSession.snapshot();
  if (s.busy || !s.draft.trim()) return;
  refused(await askQuestion(s.draft, { fromDraft: true }));
}

export const inputCopy = {
  roster: 'Choose a person from the list in Options.',
  offline: "People couldn't be checked. Try again when you're online.",
} as const;
/**
 * Every Ask send goes through here: the consent sheet first (once per
 * device), then the Person option checked against the roster. Returns the
 * input error to draw in the dock, or null.
 */
export async function askQuestion(
  question: string,
  { carry, fromDraft = false }: { carry?: Followup; fromDraft?: boolean } = {},
): Promise<string | null> {
  const s = askSession.snapshot();
  if (s.busy || !question.trim()) return null;
  if (!fromDraft) askSession.clearDraft();
  if (!(await askConsentGiven())) {
    askSession.hold(question, carry, fromDraft);
    router.push(askConsentRoute);
    return null;
  }
  const speaker = askSession.composerOptions().speaker;
  if (speaker && (fromDraft || !s.thread.length)) {
    try {
      const roster = await catalogs.roster();
      if (!roster.data.people.some((p) => p.name === speaker))
        return inputCopy.roster;
    } catch {
      return inputCopy.offline;
    }
  }
  if (fromDraft) await askSession.sendDraft();
  else await askSession.submit(question, carry);
  return null;
}
/** Consent's Continue: agreed on this device, then the held question goes. */
export async function continueHeld() {
  // Held for this launch at once; a failed save only asks again later.
  void giveAskConsent().catch(() => undefined);
  const held = askSession.takePending();
  if (!held) return;
  if (held.fromDraft) await askSession.sendDraft();
  else {
    askSession.clearDraft();
    await askSession.submit(held.question, held.carry);
  }
}

/** One answer and its question, from the open conversation or a saved one. */
export function answerTurn(
  key: string | undefined,
): { chat: string; index: number; question: Turn; answer: Turn } | null {
  const parsed = key ? parseTurnKey(key) : null;
  if (!parsed) return null;
  const s = askSession.snapshot();
  const thread =
    s.id === parsed.chat
      ? s.thread
      : chatsSnapshot().chats.find((c) => c.id === parsed.chat)?.thread;
  const answer = thread?.[parsed.index];
  const question = thread?.[parsed.index - 1];
  return answer?.role === 'answer' && question?.role === 'user'
    ? { ...parsed, question, answer }
    : null;
}
