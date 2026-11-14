import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useReduceMotionSetting } from '../../../design/accessibility';
import { InsetGroup } from '../../../design/layout';
import { LinkRow } from '../../../design/rows';
import { SourceLine } from '../../../design/source';
import { symbols } from '../../../design/symbols';
import { Text } from '../../../design/text';
import { motion, rhythm } from '../../../design/tokens';
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
 * A right answer's points, counted up from nothing as the reveal lands
 * (sweep 3, item 6). Still, at the final figure, when the answer was not
 * right, the reveal is being reread, or Reduce Motion is on or not yet
 * known.
 */
function useCountUp(target: number, run: boolean) {
  const [shown, setShown] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) return;
    const progress = new Animated.Value(0);
    const listener = progress.addListener(({ value }) =>
      setShown(Math.round(value * target)),
    );
    const count = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration.gentle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    count.start(() => setShown(target));
    return () => {
      count.stop();
      progress.removeListener(listener);
    };
  }, [run, target]);
  return run ? shown : target;
}

/**
 * After Check: the grade, the points (not in Today's question), the fact,
 * which is the one place the answer is written, the explanation, and the
 * source line. A right answer's points sit beside the grade in ink and
 * count up once; anything else keeps its quiet line under the grade.
 */
export function Reveal({
  q,
  response,
  index,
  scored,
  landing = false,
}: {
  q: Question;
  response: QuizResponse;
  index: number;
  scored: boolean;
  /** The answer was just checked on this page (not a reopened reveal). */
  landing?: boolean;
}) {
  const reduced = useReduceMotionSetting();
  const right = scored && response.correct;
  // Decided as the reveal mounts: a setting that changes mid-count does not
  // restart it.
  const [counts] = useState(landing && right && reduced === false);
  const gained = useCountUp(response.gained, counts);
  return (
    <View style={styles.block} testID="quiz-reveal">
      <View style={styles.lines}>
        <View style={styles.grade}>
          <Text
            wordSafe
            variant="subsectionTitle"
            accessibilityRole="text"
            testID="quiz-grade"
          >
            {response.grade}
          </Text>
          {right ? (
            // The final line holds the place (unseen while the figure is in
            // flight), so "+0" growing to "+100 points" never changes the
            // row's width or wraps mid-count at large text.
            <View>
              {counts ? (
                <Text
                  wordSafe
                  variant="strong"
                  tabular
                  style={styles.unseen}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  testID="quiz-points-place"
                >
                  {pointsLine(response)}
                </Text>
              ) : null}
              <Text
                wordSafe
                variant="strong"
                tabular
                style={counts ? styles.over : undefined}
                // The figure in flight is never read out.
                accessibilityLabel={pointsLine(response)}
                testID="quiz-points"
              >
                {pointsLine({ ...response, gained })}
              </Text>
            </View>
          ) : null}
        </View>
        {scored && !right ? (
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
  unseen: { opacity: 0 },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
  // The grade and a right answer's points share a baseline, and wrap onto
  // two lines at large text.
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
});
