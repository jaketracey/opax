import { useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { track } from '../../analytics';
import { haptic } from '../../design/haptics';
import { requestFocus } from '../../design/keyboard';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { InlineError } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { conversationsRoute } from '../../navigation/routes/ask';
import { copyText } from '../records/actions';
import { representativeProfile } from '../your-mp/model';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';
import { AskSuggestionRow } from './AskRows';
import { conversationWhen } from './conversation-dates';
import { defaultOptions } from './model';
import { askSession } from './session';
import { seatStarter, startersFor, sydneyDayIndex } from './starters';
import { chatsSnapshot, subscribeChats } from './store';

export const idleCopy = {
  line: 'Answers come from parliamentary records and are machine-written.',
  tryAsking: 'Try asking',
  conversations: 'Conversations',
  seeAll: 'See all conversations',
  readFailed: "Saved conversations couldn't be read.",
  edit: 'Edit before asking',
  copy: 'Copy',
} as const;

/** The saved seat's member of the House, resolved on the device (never sent). */
export function useSeatMember(): string | null {
  const seat = useSeat();
  if (seat.status !== 'chosen') return null;
  const directory = savedSeatDirectory();
  const chosen = directory?.electorates.data.electorates.find(
    (s) => s.electorate_id === seat.choice.seatId,
  );
  if (
    !directory ||
    !chosen ||
    chosen.status === 'historical' ||
    chosen.jurisdiction !== 'federal' ||
    chosen.chamber !== 'representatives' ||
    chosen.representation_status !== 'verified'
  )
    return null;
  const member = chosen.representatives
    .map((r) => representativeProfile(r.person_id, directory))
    .find(Boolean);
  return member?.name ?? null;
}
// The member the seat starter put in Person, so a starter tapped next does
// not inherit it.
let seatFill: string | null = null;
/** Fills the composer without sending: a starter to edit, or the seat starter. */
export function fillComposer(question: string, speaker?: string) {
  seatFill = speaker ?? null;
  if (speaker)
    askSession.options({ ...defaultOptions, speaker, kind: 'speech' });
  askSession.setDraft(question);
  requestFocus('ask');
}

/**
 * Ask with nothing asked yet (journeys/ask.md 4.1): one line under the
 * title, Try asking (the seat starter first when a seat is saved, which
 * only fills the composer, then today's starters, which ask at once), then
 * the newest Conversations. Four rows either way.
 */
export function AskIdle({
  onAsk,
  offline,
  readFailed,
  now: nowProp,
  starterCount = 4,
  showStarters = true,
  showConversations = true,
  conversationCount = 3,
  testPrefix = 'ask',
}: {
  onAsk: (question: string) => void;
  offline: boolean;
  readFailed: boolean;
  now?: number;
  starterCount?: number;
  /** False in the docked conversation column: the pane has the starters. */
  showStarters?: boolean;
  /** False in the sources pane: the conversation column has them. */
  showConversations?: boolean;
  conversationCount?: number;
  /** `ask-pane` in the iPad pane, so its rows keep their own IDs. */
  testPrefix?: string;
}) {
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const member = useSeatMember();
  // The day's starters are read once as the page mounts.
  const [mounted] = useState(() => Date.now());
  const now = nowProp ?? mounted;
  // Sydney's day, as Today's rotation counts it (DIRECTION 6.5).
  const day = sydneyDayIndex(now);
  const starters = useMemo(
    () => startersFor(now, member ? starterCount - 1 : starterCount),
    // `now` only matters through its Sydney day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, member, starterCount],
  );
  const recent = saved.chats.slice(0, conversationCount);
  const menu = (question: string) => [
    { title: idleCopy.edit, onPress: () => fillComposer(question) },
    {
      title: idleCopy.copy,
      onPress: () =>
        void copyText(question).then((ok) => ok && haptic('success')),
    },
  ];
  return (
    <View style={styles.page} testID={`${testPrefix}-idle`}>
      {testPrefix === 'ask' ? (
        <Text wordSafe variant="secondary" testID="ask-idle-line">
          {idleCopy.line}
        </Text>
      ) : null}
      {showStarters ? (
        <View>
          <SectionHeader title={idleCopy.tryAsking} />
          <InsetGroup testID={`${testPrefix}-starters`}>
            {/* With a seat saved, the first row is about the reader's own
              member (sweep 1 item 7.2); the day's starters follow. */}
            {member ? (
              <AskSuggestionRow
                question={seatStarter(member)}
                variant="fill"
                onPress={() => fillComposer(seatStarter(member), member)}
                testID={`${testPrefix}-starter-seat`}
              />
            ) : null}
            {starters.map((question, i) => (
              <AskSuggestionRow
                key={question}
                question={question}
                variant="send"
                offline={offline}
                onPress={() => {
                  if (
                    seatFill &&
                    askSession.composerOptions().speaker === seatFill
                  )
                    askSession.options({ ...defaultOptions });
                  seatFill = null;
                  track('opax_chip', { chip_kind: 'ask', placement: 'ask' });
                  onAsk(question);
                }}
                menu={menu(question)}
                testID={`${testPrefix}-starter-${i}`}
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
      {!showConversations ? null : readFailed ? (
        <InlineError
          subject="conversations"
          message={idleCopy.readFailed}
          testID={`${testPrefix}-conversations-failed`}
        />
      ) : recent.length ? (
        <View>
          <SectionHeader
            title={idleCopy.conversations}
            action={{
              label: idleCopy.seeAll,
              accessibilityLabel: idleCopy.seeAll,
              onPress: () => router.push(conversationsRoute),
              testID: `${testPrefix}-see-all-conversations`,
            }}
          />
          <InsetGroup testID={`${testPrefix}-conversations`}>
            {recent.map((chat, i) => (
              <LinkRow
                key={chat.id}
                title={chat.title}
                value={conversationWhen(chat.updated, now)}
                onPress={() => askSession.open(chat.id)}
                testID={`${testPrefix}-conversation-${i}`}
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  page: { gap: rhythm.section },
});
