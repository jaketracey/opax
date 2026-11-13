import {
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { track } from '../../analytics';
import { useReduceMotion } from '../../design/accessibility';
import { useScreenMargin } from '../../design/adaptive';
import { EngravedMark } from '../../design/engraving';
import { haptic } from '../../design/haptics';
import { requestFocus } from '../../design/keyboard';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { InlineError } from '../../design/states';
import { Text } from '../../design/text';
import { motion, rhythm } from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
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
  own: 'Ask in your own words. Every answer lists the records it used.',
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
  // Docked with nothing saved, the column's centred empty state carries the
  // line (AskEmptyState, drawn by AskColumns), so it is not said twice.
  const centred = !showStarters && !recent.length;
  return (
    <View style={styles.page} testID={`${testPrefix}-idle`}>
      {testPrefix === 'ask' && !centred ? (
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

/** Nothing asked, nothing being asked. AskScreen's own idle test. */
function useAskIdle() {
  const s = useSyncExternalStore(
    askSession.subscribe,
    askSession.snapshot,
    askSession.snapshot,
  );
  return !s.thread.length && !s.busy && !s.error && !s.clarify;
}

/**
 * The docked conversation column with nothing asked and nothing saved
 * (iPad, an unfolded Duo): the starters are in the pane beside it, so the
 * column would be one grey line over empty paper (sweep 3, item 5). The
 * mark, as a bronze hairline engraving, sits centred between the bar and
 * the composer with the idle line and one more sentence under it. No
 * control: the composer and the pane's starters are the ways in. It fades
 * out as the first question is sent (at once under Reduce Motion), and
 * goes at once when a saved conversation takes the column instead.
 */
export function AskEmptyState({
  bottom,
}: {
  /** The composer band's height (and the keyboard's), in the column. */
  bottom: number;
}) {
  const idle = useAskIdle();
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const empty = idle && !saved.chats.length;
  const reduced = useReduceMotion();
  const top = useHeaderBottom();
  const margin = useScreenMargin();
  const [opacity] = useState(() => new Animated.Value(1));
  // Shown stays true while the state fades after a question is sent. A
  // saved conversation taking the column, or Reduce Motion, ends it at once.
  const [shown, setShown] = useState(empty);
  if (empty && !shown) setShown(true);
  if (shown && !empty && (idle || reduced)) setShown(false);
  const leaving = shown && !idle;
  useLayoutEffect(() => {
    if (!leaving) {
      opacity.setValue(1);
      return;
    }
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: motion.duration.standard,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) setShown(false);
    });
    return () => fade.stop();
  }, [leaving, opacity]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.empty,
        {
          paddingTop: top,
          paddingBottom: bottom,
          paddingHorizontal: margin,
          opacity,
        },
      ]}
      // Leaving, it is already not the page: VoiceOver skips it.
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      testID="ask-empty"
    >
      <EngravedMark testID="ask-empty-mark" />
      <View style={styles.emptyWords}>
        <Text
          wordSafe
          variant="secondary"
          style={styles.centredText}
          testID="ask-idle-line"
        >
          {idleCopy.line}
        </Text>
        <Text
          wordSafe
          variant="secondary"
          style={styles.centredText}
          testID="ask-empty-own"
        >
          {idleCopy.own}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { gap: rhythm.section },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.group,
    overflow: 'hidden',
  },
  emptyWords: { gap: rhythm.line, maxWidth: 420 },
  centredText: { textAlign: 'center' },
});
