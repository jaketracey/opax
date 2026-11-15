import {
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { track } from '../../analytics';
import {
  useAccessibilitySize,
  useReduceMotion,
} from '../../design/accessibility';
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
import {
  savedSeatDirectory,
  useSavedChoice,
  useSeat,
} from '../your-mp/useSeat';
import { AskSuggestionRow } from './AskRows';
import { conversationWhen } from './conversation-dates';
import { defaultOptions } from './model';
import { askSession } from './session';
import { seatStarter, startersFor, sydneyDayIndex } from './starters';
import { chatsSnapshot, subscribeChats } from './store';
import { starterTerm } from '../learn/term-map';

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
/**
 * True while the reader's member may still turn up: the saved seat is being
 * read, and the device has not already said there is none. Try asking then
 * holds its one row's box instead of drawing the general starter and
 * swapping it. With no seat saved the general starter is final at once.
 */
function useSeatPending(): boolean {
  const loading = useSeat().status === 'loading';
  return useSavedChoice() !== null && loading;
}
/**
 * Members' names for sizing the held box, never seen. The roster itself is
 * not on hand while the seat is still being read, so these are constants,
 * chosen by drawn height, not by letter count: laid out in the system font
 * at every text size from 17 to 53 pt and every row width from 200 to
 * 330 pt, the taller of the two questions is never shorter than the
 * question about any verified member of the House (worst margin 0 pt).
 *
 * A name sets the question's height in two ways, so there are two:
 *
 * - one with long words. At large text sizes the row's type steps down
 *   until its longest word fits the line, so this question is drawn
 *   smaller, as a real long-worded name's is;
 * - one whose every part is shorter than "parliament", the longest word in
 *   the question itself, so it is never stepped down further than a real
 *   question (a ten-letter name can draw wider than "parliament" and was).
 *   It is long, and hyphenated, because a hyphen is a place to break: the
 *   tallest real questions are for hyphenated names.
 *
 * The box takes the tallest of its candidates, so it holds either kind.
 * Changing a name here means running that layout sweep again.
 */
export const SIZING_MEMBERS = [
  'Alexandrina Wetherington',
  'Annabelle Margaret Lee-Ray',
] as const;
const noop = () => {};
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
 * title, Try asking, then the newest Conversations. Try asking is one row:
 * the seat starter when a seat is saved (it only fills the composer), else
 * the first of today's starters (it asks at once).
 */
export function AskIdle({
  onAsk,
  offline,
  readFailed,
  now: nowProp,
  showStarters = true,
  showConversations = true,
  conversationCount = 3,
  testPrefix = 'ask',
}: {
  onAsk: (question: string) => void;
  offline: boolean;
  readFailed: boolean;
  now?: number;
  /** False in the docked conversation column: the pane has the starters. */
  showStarters?: boolean;
  /** False in the sources pane: the conversation column has them. */
  showConversations?: boolean;
  conversationCount?: number;
  /** `ask-pane` in the iPad pane, so its rows keep their own IDs. */
  testPrefix?: string;
}) {
  const stacked = useAccessibilitySize();
  // At accessibility sizes the stacked heading takes back part of its
  // parent's gap (a negative margin under it). These bare groups have no
  // gap, so the card was drawn over the foot of "Try asking", cutting its
  // descenders (build 78 sweep, AX3). The gap is given on both platforms.
  const sectionStyle = stacked ? styles.stackedSection : undefined;
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
  const pending = useSeatPending();
  // One starter (Jake, 15 Nov): the reader's own member when a seat is
  // saved, else the first of the day's reviewed questions. Never a list.
  const general = useMemo(
    () => startersFor(now, 1)[0]!,
    // `now` only matters through its Sydney day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day],
  );
  // The answer last known. A later read of the seat (a retry) keeps the
  // row that is drawn until it answers, so the group is never left empty.
  const [known, setKnown] = useState<{ member: string | null } | null>(
    pending ? null : { member },
  );
  if (!pending && known?.member !== member) setKnown({ member });
  const shown = pending ? known : { member };
  const recent = saved.chats.slice(0, conversationCount);
  const menu = (question: string) => [
    { title: idleCopy.edit, onPress: () => fillComposer(question) },
    {
      title: idleCopy.copy,
      onPress: () =>
        void copyText(question).then((ok) => ok && haptic('success')),
    },
  ];
  // Decided once, as Try asking is first drawn: a seat still being read
  // then means the row's box is held for the life of the page.
  const [held] = useState(pending);
  const theirs = shown?.member ?? null;
  // Nothing is drawn only in the held box, before the first answer.
  const starters = theirs || !shown ? [] : [general];
  const row = theirs ? (
    <AskSuggestionRow
      question={seatStarter(theirs)}
      variant="fill"
      onPress={() => fillComposer(seatStarter(theirs), theirs)}
      testID={`${testPrefix}-starter-seat`}
    />
  ) : (
    starters.map((question, i) => (
      <AskSuggestionRow
        key={question}
        question={question}
        variant="send"
        offline={offline}
        term={starterTerm(question)}
        onPress={() => {
          if (seatFill && askSession.composerOptions().speaker === seatFill)
            askSession.options({ ...defaultOptions });
          seatFill = null;
          track('opax_chip', { chip_kind: 'ask', placement: 'ask' });
          onAsk(question);
        }}
        menu={menu(question)}
        testID={`${testPrefix}-starter-${i}`}
      />
    ))
  );
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
        <View style={sectionStyle}>
          <SectionHeader title={idleCopy.tryAsking} />
          <InsetGroup testID={`${testPrefix}-starters`}>
            {held ? (
              // The seat was still being read when Try asking was first
              // drawn. One row holds the chosen starter and, unseen beside
              // it, every candidate in the row's own type and width. The
              // row is as tall as the tallest of them, so the box is
              // never shorter than the starter drawn in it and never
              // changes size when the member is known.
              <View style={styles.sizing} testID={`${testPrefix}-starter-held`}>
                {(Array.isArray(row) ? row.length : row) ? (
                  <View
                    style={styles.sized}
                    testID={`${testPrefix}-starter-chosen`}
                  >
                    {row}
                  </View>
                ) : null}
                {[general, ...SIZING_MEMBERS.map(seatStarter)].map(
                  (question) => (
                    <View
                      key={question}
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[styles.sized, styles.unseen]}
                      testID={`${testPrefix}-starter-place`}
                    >
                      <AskSuggestionRow
                        question={question}
                        variant="fill"
                        onPress={noop}
                      />
                    </View>
                  ),
                )}
              </View>
            ) : (
              row
            )}
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
        <View style={sectionStyle}>
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
/** How far past its threshold the room must be before the mark changes. */
const MARK_SLACK = 1;

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
  // The room under the bar, and the words' own height at this text size.
  const [area, setArea] = useState<number | null>(null);
  const [words, setWords] = useState<number | null>(null);
  const room = area === null ? null : Math.max(0, area - top);
  const measured = room !== null && words !== null;
  const mark =
    Math.round(MARK * Math.min(Math.max(fontScale, 1), MARK_SCALE)) +
    rhythm.group;
  const wordsFit = !measured || words <= room;
  // The mark is shown while there is room for it under the words. Showing
  // or hiding it recentres the words, which can move their measured height
  // by a pixel; within a point of the threshold that would flip the mark
  // back, and so on without end. So once it is shown or hidden it changes
  // again only when the room is at least `MARK_SLACK` past the threshold.
  const [markOn, setMarkOn] = useState<boolean | null>(null);
  const spare = measured ? room - words - mark : null;
  const markNext =
    spare === null
      ? null
      : markOn === null
        ? spare >= 0
        : markOn
          ? spare >= -MARK_SLACK
          : spare >= MARK_SLACK;
  if (markNext !== markOn) setMarkOn(markNext);
  const markFits = markNext === true;
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
        { paddingTop: top, paddingHorizontal: margin, opacity },
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
  // The held box: the chosen starter and the unseen candidates side by
  // side, each the box's full width, so the row is as tall as the tallest.
  // The candidates lie past the box's right edge, unseen and untouchable;
  // the box itself clips nothing, so the starter's highlight and tap area
  // reach the group's edges as they do in any row.
  sizing: { flexDirection: 'row' },
  sized: { width: '100%', flexShrink: 0, justifyContent: 'center' },
  centredText: { textAlign: 'center' },
  stackedSection: { gap: rhythm.block },
});
