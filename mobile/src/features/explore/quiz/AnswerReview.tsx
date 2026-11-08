import { StyleSheet, View } from 'react-native';
import { Disclosure } from '../../../design/disclosure';
import { InsetGroup, SectionHeader } from '../../../design/layout';
import { Text } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import {
  answerText,
  correctText,
  type Question,
  type QuizResponse,
} from '../quiz-model';
import { marks } from './marks';
import { QuizSourceLine } from './Reveal';

/**
 * "Your answers": one row per question. Opened, the reader's answer as it
 * was shown, the right one for choice and order questions, then the fact
 * (the same string as the reveal; figures and years are written only there)
 * and the question's source line.
 */
export function AnswerReview({
  round,
  answers,
}: {
  round: readonly Question[];
  answers: readonly QuizResponse[];
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Your answers" />
      <InsetGroup testID="quiz-review">
        {round.map((q, i) => {
          const response = answers[i];
          if (!response) return null;
          const right = correctText(q);
          return (
            <Disclosure
              key={`${i}-${q.prompt}`}
              label={q.prompt}
              icon={response.correct ? marks.correct : marks.wrong}
              accessibilityLabel={`${response.correct ? 'Correct' : 'Not correct'}. ${q.prompt}`}
              testID={`quiz-review-${i}`}
            >
              <View style={styles.body}>
                <Text wordSafe variant="secondary">
                  Your answer: {answerText(q, response.answer)}
                </Text>
                {right ? (
                  <Text wordSafe variant="secondary">
                    Answer: {right}
                  </Text>
                ) : null}
                <Text wordSafe variant="strong">
                  {q.fact}
                </Text>
                <QuizSourceLine q={q} testID={`quiz-review-source-${i}`} />
              </View>
            </Disclosure>
          );
        })}
      </InsetGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: rhythm.heading },
  body: { gap: rhythm.tight, paddingBottom: rhythm.row },
});
