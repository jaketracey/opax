import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';
import { useOffline } from '../../api/useOffline';
import { useLayout } from '../../design/adaptive';
import { Button } from '../../design/controls';
import { formatCount } from '../../design/format';
import { Screen } from '../../design/layout';
import { OfflineLine } from '../../design/states';
import { rhythm } from '../../design/tokens';
import { scrollToTop } from '../../design/scroll-to-top';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { ExploreChrome, toolName } from './parts';
import {
  answerComplete,
  quizShareText,
  rankFor,
  resumeLabel,
  scoreAnswer,
  type Answer,
  type Deck,
  type QuizRecord,
  type QuizResponse,
} from './quiz-model';
import {
  quizSession,
  useQuizInProgress,
  useQuizSession,
  type QuizRound,
} from './quiz-session';
import { quizStore } from './quiz-store';
import { drawRound, frontPageQuestion } from './quiz/data';
import { ProgressStrip } from './quiz/ProgressStrip';
import { QuestionView } from './quiz/QuestionView';
import { QuizFooter, type FooterAction } from './quiz/QuizFooter';
import { QuizIntro } from './quiz/QuizIntro';
import { ResultView } from './quiz/ResultView';

type Mode = 'intro' | 'round' | 'result' | 'single';
const quizName = toolName('quiz');
const todayName = 'Today’s question';

/**
 * The record quiz: one screen, four phases (intro, a round of eight with
 * its reveals, the result, and Today's question). This controller holds the
 * phase, the scoring, the saved best streak and the in-memory round; the
 * views are in `quiz/`.
 */
export default function Quiz({
  q: questionId,
  resume = false,
}: {
  /** Today's question: the front-page deck's id. Unknown ids open the intro. */
  q?: string;
  /** Open straight on the round in progress. */
  resume?: boolean;
}) {
  const offline = useOffline();
  const session = useQuizSession();
  const inProgress = useQuizInProgress();
  const single = useMemo(() => frontPageQuestion(questionId), [questionId]);
  const [mode, setMode] = useState<Mode>(() =>
    single ? 'single' : resume && quizSession.inProgress() ? 'round' : 'intro',
  );
  const [deck, setDeck] = useState<Deck>(
    () => quizSession.current()?.deck ?? 'mixed',
  );
  // Start waits for this read (a few milliseconds); it is never drawn
  // disabled while it runs.
  const [reading] = useState(() => quizStore.read().catch(() => null));
  const [record, setRecord] = useState<QuizRecord | null>(null);
  const [draft, setDraft] = useState<Answer | undefined>();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<QuizRound | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [singleResponse, setSingleResponse] = useState<QuizResponse | null>(
    null,
  );
  const [width, setWidth] = useState<number>();
  const scrollRef = useRef<ScrollView>(null);
  const headerBottom = useHeaderBottom();
  const promptRef = useRef<View>(null);
  const starting = useRef(false);
  useEffect(() => {
    let live = true;
    void reading.then((saved) => {
      if (live) setRecord(saved);
    });
    return () => {
      live = false;
    };
  }, [reading]);

  const round = mode === 'round' ? session : null;
  const q =
    mode === 'single' ? single : round ? round.round[round.index] : undefined;
  const response =
    mode === 'single'
      ? singleResponse
      : round
        ? (round.answers[round.index] ?? null)
        : null;
  const questionKey =
    mode === 'single' ? `single-${single?.id}` : `${round?.index}`;
  useEffect(() => {
    if (mode !== 'round' && mode !== 'single') return;
    const target = promptRef.current;
    if (target) AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
  }, [mode, questionKey]);
  // A new page (the next question, a round, the result, the intro) starts at
  // its resting top, below the header, once it has committed. Reset from the
  // press, the scroll was still animating when the shorter page replaced the
  // longer one, and it landed as far above the rest as the old page had been
  // scrolled: a blank band over the question (build 63, flow 48). Not
  // animated: the page it would scroll is gone, and an instant reset can't
  // race a resize.
  const page = `${mode}:${questionKey}`;
  const shownPage = useRef(page);
  useLayoutEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    scrollToTop(scrollRef.current, headerBottom);
  }, [page, headerBottom]);
  const start = async (choice: Deck) => {
    if (starting.current) return;
    starting.current = true;
    try {
      const saved = await reading;
      quizSession.begin(choice, drawRound(choice), saved?.bestStreak ?? 0);
      setDeck(choice);
      setDraft(undefined);
      setEditing(false);
      setSummary(null);
      setSaveFailed(false);
      setMode('round');
    } finally {
      starting.current = false;
    }
  };
  const resumeRound = () => {
    if (!quizSession.inProgress()) return;
    setDraft(undefined);
    setEditing(false);
    setMode('round');
  };
  const check = () => {
    if (!q || response || !answerComplete(q, draft)) return;
    if (mode === 'single') {
      const scored = scoreAnswer(q, draft!, 0);
      setSingleResponse(scored.response);
      announce(scored.response, q.fact, false);
      return;
    }
    const current = quizSession.current();
    if (!current || current.answers.length > current.index) return;
    const scored = scoreAnswer(q, draft!, current.streak);
    quizSession.update({
      ...current,
      answers: [...current.answers, scored.response],
      points: current.points + scored.response.gained,
      correct: current.correct + Number(scored.response.correct),
      streak: scored.streak,
      best: Math.max(current.best, scored.streak),
    });
    announce(scored.response, q.fact, true);
  };
  const persist = (done: QuizRound) => {
    const next: QuizRecord = {
      version: 1,
      bestStreak: done.best,
      lastPoints: done.points,
      lastCorrect: done.correct,
    };
    quizStore
      .save(next)
      .then(() => {
        setRecord(next);
        setSaveFailed(false);
      })
      .catch(() => setSaveFailed(true));
  };
  const next = () => {
    const current = quizSession.current();
    if (!current || current.answers.length <= current.index) return;
    setDraft(undefined);
    setEditing(false);
    if (current.index + 1 < current.round.length) {
      quizSession.update({ ...current, index: current.index + 1 });
      return;
    }
    const done = { ...current, index: current.round.length };
    quizSession.clear();
    setSummary(done);
    setMode('result');
    persist(done);
    AccessibilityInfo.announceForAccessibility(
      `You scored ${formatCount(done.points)} points, with ${done.correct} of ${done.round.length} right. Your rank: ${rankFor(done.correct, done.round.length).name}.`,
    );
  };

  const footer: FooterAction | null =
    (mode === 'round' || mode === 'single') && q
      ? !response
        ? {
            label: 'Check answer',
            onPress: check,
            disabled: !answerComplete(q, draft),
            testID: 'quiz-confirm',
          }
        : mode === 'round' && round
          ? {
              label:
                round.index + 1 < round.round.length
                  ? 'Next question'
                  : 'See result',
              onPress: next,
              testID: 'quiz-next',
            }
          : inProgress
            ? {
                label: resumeLabel(inProgress.index),
                onPress: resumeRound,
                testID: 'quiz-resume',
              }
            : {
                label: 'Play a round',
                onPress: () => void start('mixed'),
                testID: 'quiz-play',
              }
      : mode === 'result' && summary
        ? {
            label: 'Play again',
            onPress: () => void start(summary.deck),
            testID: 'quiz-again',
          }
        : null;

  const fixedTitle =
    mode === 'single' ? todayName : mode === 'round' ? quizName : undefined;
  return (
    <>
      <ExploreChrome
        title={fixedTitle}
        game="quiz"
        params={mode === 'single' && single ? { q: single.id } : undefined}
        name={mode === 'single' ? todayName : quizName}
        share={
          mode === 'result' && summary
            ? {
                title: quizShareText(
                  summary.points,
                  summary.correct,
                  summary.round.length,
                ),
                text: quizShareText(
                  summary.points,
                  summary.correct,
                  summary.round.length,
                ),
              }
            : undefined
        }
      />
      <Screen
        grouped
        scrollRef={scrollRef}
        scrollToOverflowEnabled
        barTitle={fixedTitle ? undefined : quizName}
        testID="explore-quiz-screen"
      >
        <ColumnWidth onWidth={setWidth} />
        {offline && mode === 'intro' ? (
          <OfflineLine
            savedAt={null}
            message="You’re offline. The record quiz still works."
            testID="quiz-offline"
          />
        ) : null}
        {mode === 'round' && round && q ? (
          <ProgressStrip
            index={round.index}
            total={round.round.length}
            points={round.points}
            results={round.answers.map((given) => given.correct)}
          />
        ) : null}
        {(mode === 'round' || mode === 'single') && q ? (
          <QuestionView
            key={questionKey}
            q={q}
            index={mode === 'round' && round ? round.index : 0}
            answer={draft}
            response={response}
            scored={mode === 'round'}
            promptRef={promptRef}
            onAnswer={setDraft}
            onEditing={setEditing}
          />
        ) : mode === 'result' && summary ? (
          <ResultView
            summary={summary}
            saveFailed={saveFailed}
            onRetrySave={() => persist(summary)}
            onDecks={() => {
              setSummary(null);
              setMode('intro');
            }}
          />
        ) : (
          <QuizIntro
            deck={deck}
            record={record}
            resumeAt={inProgress?.index ?? null}
            onDeck={setDeck}
            onStart={() => void start(deck)}
            onResume={resumeRound}
          />
        )}
        <QuizFooter action={footer} placement="content" hidden={editing} />
        {mode === 'single' && response && inProgress ? (
          <View style={styles.after}>
            <Button
              label="Start a new round"
              variant="plain"
              fullWidth
              onPress={() => void start('mixed')}
              testID="quiz-start"
            />
          </View>
        ) : null}
      </Screen>
      <QuizFooter
        action={footer}
        placement="toolbar"
        hidden={editing}
        width={width}
      />
    </>
  );
}

/**
 * One announcement per answer. A right answer in a round says its points
 * with the grade ("Correct, plus 100 points."), since the figure on screen
 * is still counting; then the fact.
 */
function announce(response: QuizResponse, fact: string, scored: boolean) {
  const points =
    scored && response.correct
      ? `, plus ${formatCount(response.gained)} points`
      : '';
  AccessibilityInfo.announceForAccessibility(
    `${response.grade}${points}. ${fact}`,
  );
}

/** Reports the content column's width, so the footer capsule lines up. */
function ColumnWidth({ onWidth }: { onWidth: (width: number) => void }) {
  const { width } = useLayout();
  useEffect(() => onWidth(width), [width, onWidth]);
  return null;
}

const styles = StyleSheet.create({
  after: { marginTop: -rhythm.block },
});
