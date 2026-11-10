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
/**
 * A draft from outside Ask: a new conversation, the keyboard up, nothing
 * sent, and a running answer left running (journeys/ask.md 4.2).
 */
export function arriveInAsk(scope: AskScope, entry?: string) {
  if (entry) {
    if (handled.has(entry)) return;
    markArrival(entry);
  }
  const running = askSession.snapshot().busy;
  askSession.arrive(scope.question ?? '', scopeOptions(scope));
  requestFocus('ask');
  AccessibilityInfo.announceForAccessibilityWithOptions(
    running ? 'Draft added. Starts a new conversation.' : 'Draft added.',
    { queue: true },
  );
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
  else await askSession.submit(held.question, held.carry);
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
