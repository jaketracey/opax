import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { InsetGroup } from '../../../design/layout';
import { LinkRow } from '../../../design/rows';
import { SourceLine } from '../../../design/source';
import { symbols } from '../../../design/symbols';
import { Text } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import { useOpenAsk } from '../../ask/open';
import { quizDestination } from '../quiz-links';
import { useQuizMoneyGraph } from './money-graph';
import { pointsLine, type Question, type QuizResponse } from '../quiz-model';
import { quizSourceDetails } from '../quiz-source';
import { quizAsOf } from './data';

/**
 * A question's dated source line. Its sheet holds the question's record
 * (opened natively) and its notes; a speaker's year in the record is offered
 * as an Ask draft instead, which never sends.
 */
export function QuizSourceLine({ q, testID }: { q: Question; testID: string }) {
  const openAsk = useOpenAsk();
  const graph = useQuizMoneyGraph(q);
  const destination = quizDestination(q, graph);
  const extra =
    destination?.kind === 'ask' ? (
      <InsetGroup>
        <LinkRow
          title={destination.label}
          symbol={symbols.ask}
          onPress={() => {
            router.back();
            openAsk(destination.draft);
          }}
          testID={`${testID}-sheet-ask`}
        />
      </InsetGroup>
    ) : undefined;
  return (
    <SourceLine
      {...quizSourceDetails(q, quizAsOf, graph)}
      {...(extra ? { extra } : {})}
      testID={testID}
    />
  );
}

/**
 * After Check: the grade, the points (not in Today's question), the fact,
 * which is the one place the answer is written, the explanation, and the
 * source line.
 */
export function Reveal({
  q,
  response,
  index,
  scored,
}: {
  q: Question;
  response: QuizResponse;
  index: number;
  scored: boolean;
}) {
  return (
    <View style={styles.block} testID="quiz-reveal">
      <View style={styles.lines}>
        <Text
          wordSafe
          variant="subsectionTitle"
          accessibilityRole="text"
          testID="quiz-grade"
        >
          {response.grade}
        </Text>
        {scored ? (
          <Text variant="secondary" testID="quiz-points">
            {pointsLine(response)}
          </Text>
        ) : null}
      </View>
      <Text wordSafe variant="strong" testID="quiz-fact">
        {q.fact}
      </Text>
      <Text wordSafe variant="body">
        {q.explanation}
      </Text>
      <QuizSourceLine q={q} testID={`quiz-source-${index}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.block },
  lines: { gap: rhythm.line },
});
