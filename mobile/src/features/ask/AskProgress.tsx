import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MachinePill } from '../../design/labels';
import { Skeleton } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { parseAnswer } from './answer-markdown';
import { AnswerBody } from './AnswerBody';
import { machineNote } from './AnswerView';
import type { AskStage } from './stream';

/**
 * The live half of an Ask turn (journeys/ask.md 4.4 step 2, 13 item 9):
 * one status line naming the stage, a skeleton in the answer's shape until
 * text arrives, then the text through the same reader as the final answer,
 * links inert and no marks. Stop is the composer's send button.
 */
export function AskProgress({
  stage,
  streaming,
}: {
  stage: AskStage | null;
  streaming: string;
}) {
  const blocks = useMemo(
    () => (streaming ? parseAnswer(streaming, { streaming: true }) : []),
    [streaming],
  );
  return (
    <View style={styles.progress} testID="ask-progress">
      <Text
        wordSafe
        variant="secondary"
        accessibilityLiveRegion="none"
        testID="ask-status"
      >
        {stage ?? 'Reading your question'}
      </Text>
      {blocks.length ? (
        <View style={styles.block}>
          <MachinePill note={machineNote} />
          <View accessibilityLiveRegion="none">
            <AnswerBody blocks={blocks} streaming testID="ask-streaming" />
          </View>
        </View>
      ) : (
        <Skeleton shape="text" count={3} label="Loading the answer" />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  progress: { gap: rhythm.heading },
  block: { gap: rhythm.tight },
});
