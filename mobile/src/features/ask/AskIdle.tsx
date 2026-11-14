import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { rhythm } from '../../design/tokens';
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
  readFailed: 'Saved conversations couldn’t be read.',
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
  // When that state has no room for its words (very large text, a
  // keyboard), or the saved conversations could not be read, the line is
  // here as on a phone.
  const wordsCentred = useSyncExternalStore(
    centredWords.subscribe,
    centredWords.get,
    centredWords.get,
  );
  const centred =
    !showStarters && !recent.length && !readFailed && wordsCentred;
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

// Whether the centred state is drawing its words. AskIdle prints the line
// itself whenever it is not, so the line is on the page exactly once.
const centredWords = (() => {
  let shown = true;
  const listeners = new Set<() => void>();
  return {
    get: () => shown,
    set(next: boolean) {
      if (next === shown) return;
      shown = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();

const MARK = 96;
const MARK_SCALE = 1.5;
/** How long the centred state takes to fade once a question is sent. */
export const EMPTY_FADE_MS = 200;
/** The fade itself: a transition Reanimated runs on the UI thread. */
const emptyFade = {
  transitionProperty: 'opacity',
  transitionDuration: `${EMPTY_FADE_MS}ms`,
  transitionTimingFunction: 'ease-out',
} as const;

/**
 * The docked conversation column with nothing asked and nothing saved
 * (iPad, an unfolded Duo): the starters are in the pane beside it, so the
 * column would be one grey line over empty paper (sweep 3, item 5). The
 * mark, as a bronze hairline engraving, sits centred between the bar and
 * the composer with the idle line and one more sentence under it. No
 * control: the composer and the pane's starters are the ways in.
 *
 * AskColumns gives it the room above the composer band and the keyboard;
 * it never draws outside that room or under the bar. It measures its words:
 * when the mark and the words do not both fit (AX5, a keyboard up in
 * landscape) the mark goes, and when the words alone do not fit the whole
 * state goes and AskIdle prints the line in the scrolling page instead.
 *
 * It fades out as the first question is sent (at once under Reduce
 * Motion), goes at once when a saved conversation takes the column, and
 * is not shown beside a failed read of the saved conversations.
 */
export function AskEmptyState({
  readFailed = false,
}: {
  readFailed?: boolean;
}) {
  const idle = useAskIdle();
  const saved = useSyncExternalStore(
    subscribeChats,
    chatsSnapshot,
    chatsSnapshot,
  );
  const empty = idle && !saved.chats.length && !readFailed;
  const reduced = useReduceMotion();
  const top = useHeaderBottom();
  const margin = useScreenMargin();
  const { fontScale } = useWindowDimensions();
  // Shown stays true while the state fades after a question is sent. A
  // saved conversation taking the column, or Reduce Motion, ends it at once.
  const [shown, setShown] = useState(empty);
  if (empty && !shown) setShown(true);
  if (shown && !empty && (idle || reduced)) setShown(false);
  const leaving = shown && !idle;
  // The fade is a transition on the view's own opacity, so it starts on the
  // UI thread with the commit that draws the question. Both earlier fades
  // were started from JS after that commit, and on an iPad the JS thread is
  // busy with the first turn from then until the answer lands: the state
  // stayed whole beside the question for 0.3 to 0.45 s, then went in one
  // frame (sweep 3 captures, D5, and the 8b8296b1e recapture). The timer
  // only unmounts a view that is already clear, so it may run late.
  useEffect(() => {
    if (!leaving) return;
    const gone = setTimeout(() => setShown(false), EMPTY_FADE_MS);
    return () => clearTimeout(gone);
  }, [leaving]);
  // The room under the bar, and the words' own height at this text size.
  const [area, setArea] = useState<number | null>(null);
  const [words, setWords] = useState<number | null>(null);
  const room = area === null ? null : Math.max(0, area - top);
  const measured = room !== null && words !== null;
  const mark =
    Math.round(MARK * Math.min(Math.max(fontScale, 1), MARK_SCALE)) +
    rhythm.group;
  const wordsFit = !measured || words <= room;
  const markFits = measured && words + mark <= room;
  useLayoutEffect(() => {
    centredWords.set(!shown || wordsFit);
    return () => centredWords.set(true);
  }, [shown, wordsFit]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(event) => setArea(event.nativeEvent.layout.height)}
      style={[
        styles.empty,
        { paddingTop: top, paddingHorizontal: margin },
        emptyFade,
        { opacity: leaving ? 0 : 1 },
      ]}
      // Leaving, it is already not the page: VoiceOver skips it.
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      testID="ask-empty"
    >
      {markFits ? (
        <EngravedMark
          size={MARK}
          maxScale={MARK_SCALE}
          testID="ask-empty-mark"
        />
      ) : null}
      {/* Kept mounted to be measured; drawn once it is known to fit. */}
      <View
        onLayout={(event) => setWords(event.nativeEvent.layout.height)}
        style={[styles.emptyWords, measured && wordsFit ? null : styles.unseen]}
        accessibilityElementsHidden={!(measured && wordsFit)}
        importantForAccessibility={
          measured && wordsFit ? 'auto' : 'no-hide-descendants'
        }
        testID="ask-empty-words"
      >
        <Text
          wordSafe
          variant="secondary"
          style={styles.centredText}
          testID={measured && wordsFit ? 'ask-idle-line' : undefined}
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.group,
    overflow: 'hidden',
  },
  emptyWords: { gap: rhythm.line, maxWidth: 420 },
  unseen: { opacity: 0 },
  centredText: { textAlign: 'center' },
});
