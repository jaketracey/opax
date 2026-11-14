import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import { Button } from '../../design/controls';
import { haptic } from '../../design/haptics';
import { Icon } from '../../design/icon';
import { requestFocus } from '../../design/keyboard';
import { Pressable } from '../../design/pressable';
import { InsetGroup } from '../../design/layout';
import { InlineError } from '../../design/states';
import { Text } from '../../design/text';
import { symbols } from '../../design/symbols';
import { minimumTarget, rhythm } from '../../design/tokens';
import { AnswerView, SearchOpaxRow, type LegacyDate } from './AnswerView';
import { AskProgress, StreamedAnswer } from './AskProgress';
import { AskSuggestionRow } from './AskRows';
import { AskNext } from './AskNext';
import { fillComposer } from './AskIdle';
import type { AskState } from './controller';
import type { Chat, Turn } from './model';
import type { AskPerson } from './people';
import { retryAfterCap, type AskFailure } from './stream';
import { askErrorCopy, clarifyCopy, showAnsweredAs } from './turn-copy';

/** A legacy answer's date: the first from `created`, later ones bound by `updated`. */
export function legacyDate(
  turn: Turn,
  index: number,
  thread: readonly Turn[],
  chat: Pick<Chat, 'created' | 'updated'> | undefined,
): LegacyDate {
  if (turn.at || !chat) return null;
  const first = thread.findIndex((t) => t.role === 'answer') === index;
  return first
    ? { at: chat.created, bound: false }
    : { at: chat.updated, bound: true };
}

// A failure owns its deadline and announcement across component remounts.
const failureKeys = new WeakMap<object, number>();
const announcedRetries = new WeakSet<AskFailure>();
let nextKey = 0;
function errorKey(failure: object) {
  if (!failureKeys.has(failure)) failureKeys.set(failure, ++nextKey);
  return failureKeys.get(failure)!;
}

/** The reader's question as the turn's heading, with "Answered as" when the meaning changed. */
export function QuestionLine({
  turn,
  names,
  topics,
  testID = 'ask-user-question',
}: {
  turn: Turn;
  names?: readonly string[];
  topics?: readonly string[];
  testID?: string;
}) {
  return (
    <View style={styles.question}>
      <Text
        wordSafe
        selectable
        variant="subsectionTitle"
        accessibilityRole="header"
        testID={testID}
      >
        {turn.text}
      </Text>
      {showAnsweredAs(turn.text, turn.askedAs, { names, topics }) ? (
        <Text
          wordSafe
          variant="footnote"
          tone="inkSoft"
          testID="ask-answered-as"
        >
          {`Answered as: ${turn.askedAs}`}
        </Text>
      ) : null}
    </View>
  );
}

// Never more than the cap, even if the device clock is set back mid-wait.
const secondsUntil = (deadline: number | undefined) =>
  deadline === undefined
    ? 0
    : Math.min(
        retryAfterCap / 1000,
        Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
      );

/** Count from the rate-limit failure's deadline, including after a remount. */
function RetryButton({
  failure,
  onPress,
}: {
  failure: AskFailure;
  onPress: () => void;
}) {
  const deadline = failure.retryAt;
  const wait = failure.code === 'rate-limited';
  const [remaining, setRemaining] = useState(() => secondsUntil(deadline));
  useEffect(() => {
    if (!wait) return;
    const tick = () => {
      const seconds = secondsUntil(deadline);
      setRemaining(seconds);
      if (seconds === 0) {
        clearInterval(timer);
        if (!announcedRetries.has(failure)) {
          announcedRetries.add(failure);
          AccessibilityInfo.announceForAccessibilityWithOptions(
            'You can try again now',
            { queue: true },
          );
        }
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [wait, deadline, failure]);
  if (!wait)
    return (
      <Button
        label="Try again"
        icon={symbols.retry}
        onPress={onPress}
        testID="ask-retry"
      />
    );
  const waiting = remaining > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Try again"
      accessibilityState={{ disabled: waiting }}
      accessibilityLiveRegion="none"
      disabled={waiting}
      accessibilityHint={
        waiting ? 'Available when the countdown ends' : undefined
      }
      onPress={onPress}
      testID="ask-retry"
      style={styles.retry}
    >
      <Icon name={symbols.retry} tone={waiting ? 'inkSoft' : 'navy'} />
      <Text
        variant="strong"
        tone={waiting ? 'inkSoft' : 'navy'}
        tabular
        wordSafe
      >
        {waiting ? `Try again in ${remaining} s` : 'Try again'}
      </Text>
    </Pressable>
  );
}

/** A tap only for words that took this long after the question. */
const slowArrival = 3000;
/** Felt as the words appear: an arrival seen later than this stays silent. */
const arrivalLate = 1000;

/**
 * Arrivals already felt or passed over, shared by every mounted thread: Ask
 * can be open in more than one tab stack at once, all on one session.
 */
const feltArrivals = new WeakSet<object>();

/**
 * One light haptic when a slow answer's first words appear. The arrival is
 * the controller's (`s.firstText`), consumed once per question across all
 * mounted threads, including fast, failed and background arrivals. A view
 * that mounts after the words came counts them as felt, so a remount never
 * taps again or late.
 */
function useAnswerArrival(s: AskState) {
  useState(() => {
    if (s.firstText) feltArrivals.add(s.firstText);
  });
  const first = s.firstText;
  const failed = !!(s.error || s.clarify);
  useEffect(() => {
    if (!first || feltArrivals.has(first)) return;
    feltArrivals.add(first);
    if (
      !failed &&
      first.waited >= slowArrival &&
      Date.now() - first.at < arrivalLate &&
      AppState.currentState === 'active'
    )
      haptic('light');
  }, [first, failed]);
}

/**
 * The open conversation (journeys/ask.md 4.4 to 4.8, 4.14): each question
 * and its answer, then the current turn: the status line and streamed text,
 * a clarify turn, or one error sentence with Try again where retrying can
 * succeed; under the newest answer, Ask next.
 */
export function AskThread({
  s,
  chat,
  profiles,
  names,
  topics,
  paneShowsSources,
  onAsk,
  onRetry,
  onTurnLayout,
  onAnchorLayout,
  minHeight,
  statusAnnouncement,
  onTailFocus,
}: {
  s: AskState;
  chat: Pick<Chat, 'created' | 'updated'> | undefined;
  profiles: Map<string, AskPerson>;
  names: readonly string[];
  topics: readonly string[];
  paneShowsSources: boolean;
  onAsk: (question: string, carry?: NonNullable<Turn['next']>[number]) => void;
  onRetry: () => void;
  /** The current turn's top, so a new question can be brought under the bar. */
  onTurnLayout: (y: number) => void;
  onAnchorLayout?: (index: number, y: number, latest: boolean) => void;
  minHeight: number;
  statusAnnouncement?: string;
  onTailFocus?: () => void;
}) {
  useAnswerArrival(s);
  const thread = s.thread;
  const failure =
    s.error && s.error.code !== 'empty' ? askErrorCopy(s.error) : null;
  const lastQuestion = thread.map((t) => t.role).lastIndexOf('user');
  // A failed or clarified question never joined the thread: it is drawn from
  // its own copy as the current turn's heading.
  const split =
    failure || s.clarify || lastQuestion < 0 ? thread.length : lastQuestion;
  const id = s.id ?? 'draft';
  const answer = thread.at(-1)?.role === 'answer' ? thread.at(-1) : undefined;
  const render = (turn: Turn, i: number): ReactNode =>
    turn.role === 'user' ? (
      <QuestionLine key={i} turn={turn} names={names} topics={topics} />
    ) : (
      <AnswerView
        key={i}
        turn={turn}
        question={thread[i - 1]!}
        index={i}
        chat={id}
        legacy={legacyDate(turn, i, thread, chat)}
        profiles={profiles}
        paneShowsSources={paneShowsSources}
        onRephrase={fillComposer}
      />
    );
  const row = (turn: Turn, i: number) =>
    onAnchorLayout ? (
      <View
        key={i}
        testID={`ask-anchor-${i}`}
        onLayout={(event) =>
          onAnchorLayout(i, event.nativeEvent.layout.y, i >= split)
        }
      >
        {render(turn, i)}
      </View>
    ) : (
      render(turn, i)
    );
  return (
    <View style={styles.thread} testID="ask-thread">
      {thread.slice(0, split).map((turn, i) => row(turn, i))}
      <View
        testID="ask-turn"
        style={[styles.thread, { minHeight }]}
        onLayout={(e) => onTurnLayout(e.nativeEvent.layout.y)}
      >
        {thread.slice(split).map((turn, i) => row(turn, split + i))}
        {failure && s.failed ? (
          <QuestionLine
            turn={{ role: 'user', text: s.failed.question }}
            testID="ask-failed-question"
          />
        ) : null}
        {s.clarify && !s.busy ? (
          <View style={styles.block} testID="ask-clarify">
            <QuestionLine
              turn={{ role: 'user', text: s.clarify.question }}
              testID="ask-clarify-question"
            />
            <Text wordSafe testID="ask-clarify-message">
              {clarifyCopy}
            </Text>
            <InsetGroup>
              {s.clarify.suggestion ? (
                <AskSuggestionRow
                  question={s.clarify.suggestion}
                  variant="fill"
                  onPress={() => fillComposer(s.clarify!.suggestion!)}
                  testID="ask-clarify-suggestion"
                />
              ) : null}
              <SearchOpaxRow question={s.clarify.question} grouped />
            </InsetGroup>
          </View>
        ) : null}
        {s.busy ? (
          <AskProgress
            stage={s.stage}
            steps={s.steps}
            announcement={statusAnnouncement}
            streaming={s.streaming}
            onTailFocus={onTailFocus}
          />
        ) : null}
        {failure ? (
          <View style={styles.block} testID={`ask-error-${s.error!.code}`}>
            {s.error!.code === 'partial' && s.streaming ? (
              <StreamedAnswer
                text={s.streaming}
                pillTestID="ask-machine-label"
                testID="ask-partial"
              />
            ) : null}
            <InlineError
              subject="answer"
              message={failure.message}
              testID="ask-error"
            />
            {s.error!.code === 'blocked' ? (
              <Button
                label="Edit question"
                variant="plain"
                onPress={() => requestFocus('ask')}
                testID="ask-edit-question"
              />
            ) : null}
            {failure.retry ? (
              <RetryButton
                key={errorKey(s.error!)}
                failure={s.error!}
                onPress={onRetry}
              />
            ) : null}
          </View>
        ) : null}
        {s.notice ? (
          <Text wordSafe variant="footnote" tone="inkSoft" testID="ask-notice">
            {s.notice}
          </Text>
        ) : null}
        {answer &&
        !s.busy &&
        !failure &&
        (s.nextLoading || answer.next?.length) ? (
          <AskNext
            key={`${id}:${thread.length}`}
            next={answer.next}
            onAsk={onAsk}
          />
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  thread: { gap: rhythm.section },
  question: { gap: rhythm.line },
  block: { gap: rhythm.tight },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    alignSelf: 'flex-start',
  },
});
