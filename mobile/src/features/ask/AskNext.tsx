import { useContext, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotionSetting } from '../../design/accessibility';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { RowCellInsetContext, useRowInset } from '../../design/row-padding';
import { Skeleton } from '../../design/states';
import { LINE_HEIGHT_NUDGE } from '../../design/text';
import { minimumTarget, motion, rhythm, textStyles } from '../../design/tokens';
import { track } from '../../analytics';
import { AskSuggestionRow } from './AskRows';
import type { Followup } from './model';

type FadeStyle = ReturnType<typeof useAnimatedStyle<{ opacity: number }>>;

/** One card and the same three row slots throughout loading and the reveal. */
export function AskNext({
  next,
  onAsk,
}: {
  next?: readonly Followup[];
  onAsk: (question: string, carry: Followup) => void;
}) {
  const ready = !!next?.length;
  const [revealed, setRevealed] = useState(ready);
  const progress = useSharedValue(ready ? 1 : 0);
  const reduceMotion = useReduceMotionSetting() !== false;
  const { fontScale } = useWindowDimensions();
  // Reserve two visible lines, including Text's rounding guard, at every text size.
  const rowHeight = Math.max(
    minimumTarget,
    Math.ceil(
      2 * (textStyles.body.lineHeight + LINE_HEIGHT_NUDGE) * fontScale,
    ) +
      1 +
      2 * rhythm.row,
  );
  useEffect(() => {
    if (!ready) return;
    cancelAnimation(progress);
    if (reduceMotion || revealed) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, {
      duration: motion.duration.standard,
      easing: Easing.bezier(...motion.easing.standard),
    });
    const timer = setTimeout(() => setRevealed(true), motion.duration.standard);
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [ready, revealed, reduceMotion, progress]);
  const incoming = useAnimatedStyle(() => ({
    opacity: reduceMotion && ready ? 1 : progress.value,
  }));
  const outgoing = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  // Remember the immediate swap if Reduce Motion is turned off again later.
  if (ready && reduceMotion && !revealed) setRevealed(true);
  return (
    <View testID="ask-followups">
      <SectionHeader title="Ask next" />
      <InsetGroup testID="ask-next-card">
        {(ready ? next! : [undefined, undefined, undefined]).map(
          (suggestion, i) => (
            <NextRow
              key={i}
              index={i}
              height={rowHeight}
              suggestion={suggestion}
              onAsk={onAsk}
              incoming={incoming}
              outgoing={outgoing}
              showPlaceholder={!revealed}
            />
          ),
        )}
      </InsetGroup>
    </View>
  );
}

function NextRow({
  index,
  height,
  suggestion,
  onAsk,
  incoming,
  outgoing,
  showPlaceholder,
}: {
  index: number;
  height: number;
  suggestion?: Followup;
  onAsk: (question: string, carry: Followup) => void;
  incoming: FadeStyle;
  outgoing: FadeStyle;
  showPlaceholder: boolean;
}) {
  useRowInset(44);
  const inset = useContext(RowCellInsetContext);
  return (
    <View
      style={{ minHeight: height, marginHorizontal: -inset }}
      testID={`ask-next-row-${index}`}
    >
      {suggestion ? (
        <Animated.View
          // Keep the animated wrapper as wide as the row's tap target.
          style={[{ paddingHorizontal: inset }, incoming]}
          testID={`ask-next-content-${index}`}
        >
          <AskSuggestionRow
            question={suggestion.question}
            variant="send"
            minimumHeight={height}
            onPress={() => {
              // Its place in the card (1 to 3) and the coarse kind; never the question.
              track('opax_ask_followup_click', {
                position: index + 1,
                kind: suggestion.kind ?? 'detail',
              });
              onAsk(suggestion.question, suggestion);
            }}
            testID={`ask-followup-${index}`}
          />
        </Animated.View>
      ) : null}
      {showPlaceholder ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.placeholder, { marginHorizontal: inset }, outgoing]}
          testID={`ask-next-placeholder-${index}`}
        >
          <Skeleton
            shape="rows"
            count={1}
            testID={`ask-next-loading-${index}`}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
});
