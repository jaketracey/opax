import { useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { Heading } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import {
  answerValue,
  type Answer,
  type Guess,
  type Question,
  type QuizResponse,
} from '../quiz-model';
import { ChoiceList } from './ChoiceList';
import { ComparisonTiles } from './ComparisonTiles';
import { GuessSlider } from './GuessSlider';
import { RankList } from './RankList';
import { Reveal } from './Reveal';

/**
 * One question: the prompt (the largest text on the screen), its answer
 * control by kind, and after Check the reveal. The progress strip, when the
 * question is part of a round, sits above it.
 */
export function QuestionView({
  q,
  index,
  answer,
  response,
  scored,
  promptRef,
  onAnswer,
  onEditing,
}: {
  q: Question;
  index: number;
  answer: Answer | undefined;
  response: QuizResponse | null;
  scored: boolean;
  promptRef?: Ref<View>;
  onAnswer: (answer: Answer) => void;
  onEditing: (editing: boolean) => void;
}) {
  const revealed = !!response;
  // The answer landed on this page, in front of the reader: its reveal may
  // move. A question reopened already answered (a resumed round) is still.
  const [landing] = useState(!response);
  const shown = response ? response.answer : answer;
  const value = shown === undefined ? undefined : answerValue(shown);
  return (
    <View style={styles.block}>
      {/* One element, so focus can move to the prompt on Next. */}
      <View
        ref={promptRef}
        accessible
        accessibilityRole="header"
        accessibilityLabel={q.prompt}
        testID="quiz-question"
      >
        <Heading level={2}>{q.prompt}</Heading>
      </View>
      {q.kind === 'higher-lower' ? (
        <ComparisonTiles q={q} revealed={revealed} />
      ) : null}
      {q.kind === 'order' ? (
        <RankList
          q={q}
          value={Array.isArray(value) ? value : undefined}
          revealed={revealed}
          onChange={onAnswer}
        />
      ) : q.kind === 'slider' || q.kind === 'year' ? (
        <GuessSlider
          q={q}
          guess={
            shown && typeof shown === 'object' && !Array.isArray(shown)
              ? (shown as Guess)
              : undefined
          }
          revealed={revealed}
          onChange={onAnswer}
          onEditing={onEditing}
        />
      ) : (
        <ChoiceList
          q={q}
          value={typeof value === 'number' ? value : undefined}
          revealed={revealed}
          landing={landing}
          onChange={onAnswer}
        />
      )}
      {response ? (
        <Reveal
          q={q}
          response={response}
          index={index}
          scored={scored}
          landing={landing}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.group },
});
