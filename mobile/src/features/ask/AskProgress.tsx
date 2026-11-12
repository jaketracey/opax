import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MachinePill } from '../../design/labels';
import { Skeleton } from '../../design/states';
import { rhythm } from '../../design/tokens';
import { parseAnswer } from './answer-markdown';
import { AnswerBody } from './AnswerBody';
import { machineNote } from './AnswerView';
import type { AskStage, AskStep } from './stream';
import { AskStatus } from './AskStatus';

/**
 * Streamed text under its one pill, through the same reader as the final
 * answer with links inert and no marks: while it is written, and when a
 * stream stops partway (journeys/ask.md 4.4 step 3, 4.14).
 */
export function StreamedAnswer({
  text,
  pillTestID,
  testID,
}: {
  text: string;
  pillTestID?: string;
  testID?: string;
}) {
  const blocks = useMemo(
    () => (text ? parseAnswer(text, { streaming: true }) : []),
    [text],
  );
  if (!blocks.length) return null;
  return (
    <View style={styles.block}>
      <MachinePill note={machineNote} testID={pillTestID} />
      <View accessibilityLiveRegion="none">
        <AnswerBody blocks={blocks} streaming testID={testID} />
      </View>
    </View>
  );
}

/**
 * The live half of an Ask turn (journeys/ask.md 4.4 step 2, 13 item 9):
 * one status line naming the stage beside a system activity indicator, a
 * skeleton in the answer's shape until text arrives, then the streamed
 * text. Stop is the composer's trailing button.
 */
export function AskProgress({
  stage,
  steps = [],
  announcement = stage ?? 'Reading your question',
  streaming,
}: {
  stage: AskStage | null;
  steps?: readonly AskStep[];
  announcement?: string;
  streaming: string;
}) {
  return (
    <View style={styles.progress} testID="ask-progress">
      <AskStatus stage={stage} steps={steps} announcement={announcement} />
      {streaming ? (
        <StreamedAnswer text={streaming} testID="ask-streaming" />
      ) : (
        <Skeleton shape="text" count={3} label="Loading the answer" onSunken />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  progress: { gap: rhythm.heading },
  block: { gap: rhythm.tight },
});
