import { StyleSheet, View } from 'react-native';
import { Button } from '../../../design/controls';
import { formatCount } from '../../../design/format';
import { TitleAnchor } from '../../../design/layout';
import { InlineError } from '../../../design/states';
import { Heading, Text } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import { rankFor, resultLine } from '../quiz-model';
import type { QuizRound } from '../quiz-session';
import { AnswerReview } from './AnswerReview';

/**
 * The score (the reader's, so in ink), the rank, the line, a save failure
 * only when there is one, the eight answers, and "Choose another deck".
 * "Play again" is the footer's primary.
 */
export function ResultView({
  summary,
  saveFailed,
  onRetrySave,
  onDecks,
}: {
  summary: QuizRound;
  saveFailed: boolean;
  onRetrySave: () => void;
  onDecks: () => void;
}) {
  const total = summary.round.length;
  const rank = rankFor(summary.correct, total);
  return (
    <>
      <TitleAnchor>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${formatCount(summary.points)} points`}
          testID="quiz-score"
        >
          <Text variant="figure" tabular>
            {formatCount(summary.points)}
          </Text>
          <Text variant="secondary">points</Text>
        </View>
      </TitleAnchor>
      <View style={styles.rank}>
        <Heading level={2} testID="quiz-rank">
          {rank.name}
        </Heading>
        <Text wordSafe variant="body">
          {rank.blurb}
        </Text>
        <Text wordSafe variant="secondary" testID="quiz-result">
          {resultLine(summary.correct, total, summary.best)}
        </Text>
      </View>
      {saveFailed ? (
        <InlineError
          subject="your best streak"
          message="Your best streak couldn’t be saved."
          onRetry={onRetrySave}
          testID="quiz-save"
        />
      ) : null}
      <AnswerReview round={summary.round} answers={summary.answers} />
      <Button
        label="Choose another deck"
        variant="plain"
        fullWidth
        onPress={onDecks}
        testID="quiz-decks"
      />
    </>
  );
}

const styles = StyleSheet.create({
  rank: { gap: rhythm.line },
});
