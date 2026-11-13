import { StyleSheet, View } from 'react-native';
import { Button, SegmentedPicker } from '../../../design/controls';
import { haptic } from '../../../design/haptics';
import { TitleAnchor } from '../../../design/layout';
import { StatStrip } from '../../../design/record';
import { SourceLine } from '../../../design/source';
import { Heading, Text } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import { formatCount } from '../../../design/format';
import { resumeLabel, type Deck, type QuizRecord } from '../quiz-model';
import { quizSetDetails } from '../quiz-source';
import { quizAsOf, quizRounds } from './data';

const decks = [
  { value: 'money', label: 'Money', testID: 'quiz-deck-money' },
  { value: 'words', label: 'Words', testID: 'quiz-deck-words' },
  { value: 'mixed', label: 'Mixed', testID: 'quiz-deck-mixed' },
] as const;

/** What each deck holds that its label does not say. */
export function deckLine(deck: Deck): string | null {
  if (deck === 'money') return 'Money to parties, and who gives it';
  if (deck === 'words') return 'What parliament talks about, and who speaks';
  // Dropped, not reworded, if a regenerated file breaks the four and four.
  return quizRounds.mixed.every(
    (round) =>
      round.filter((q) => q.deck === 'money').length === 4 &&
      round.filter((q) => q.deck === 'words').length === 4,
  )
    ? 'Four from each'
    : null;
}

/**
 * The intro: the promise, the deck, past play (only once a round has been
 * played here), and Start, or Resume with "Start a new round".
 */
export function QuizIntro({
  deck,
  record,
  resumeAt,
  onDeck,
  onStart,
  onResume,
}: {
  deck: Deck;
  record: QuizRecord | null;
  resumeAt: number | null;
  onDeck: (deck: Deck) => void;
  onStart: () => void;
  onResume: () => void;
}) {
  const line = deckLine(deck);
  return (
    <>
      <TitleAnchor>
        <Heading level={1} kind="page">
          The record quiz
        </Heading>
      </TitleAnchor>
      <Text wordSafe variant="body">
        Eight questions from the public record, each with its source.
      </Text>
      <View style={styles.deck}>
        <SegmentedPicker
          options={decks}
          value={deck}
          onChange={(next) => {
            haptic('selection');
            onDeck(next);
          }}
          accessibilityLabel="Deck"
          testID="quiz-deck"
        />
        {line ? (
          <Text wordSafe variant="secondary" testID="quiz-deck-line">
            {line}
          </Text>
        ) : null}
      </View>
      {record ? (
        <StatStrip
          testID="quiz-past"
          tiles={[
            {
              value: formatCount(record.bestStreak),
              label: 'Best streak',
              testID: 'quiz-best',
            },
            {
              value: `${record.lastCorrect} of 8`,
              label: 'Last round',
              testID: 'quiz-last',
            },
          ]}
        />
      ) : null}
      <View style={styles.actions}>
        {resumeAt !== null ? (
          <>
            <Button
              label={resumeLabel(resumeAt)}
              variant="primary"
              fullWidth
              onPress={onResume}
              testID="quiz-resume"
            />
            <Button
              label="Start a new round"
              variant="plain"
              fullWidth
              onPress={onStart}
              testID="quiz-start"
            />
          </>
        ) : (
          <Button
            label="Start"
            variant="primary"
            fullWidth
            onPress={onStart}
            testID="quiz-start"
          />
        )}
      </View>
      <SourceLine
        {...quizSetDetails(quizAsOf, quizRounds[deck].length)}
        testID="quiz-as-at"
      />
    </>
  );
}

const styles = StyleSheet.create({
  deck: { gap: rhythm.tight },
  actions: { gap: rhythm.tight },
});
