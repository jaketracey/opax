import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../../design/primitives';
import { colors } from '../../../design/tokens';
import { clusterLabelOpacity, nameOpacity } from './camera';
import type { LabelSlot } from './labels';

/** The label box the de-overlap pass assumes, in points at the default size. */
export const LABEL_WIDTH = 120;
export const LABEL_HEIGHT = 22;
/**
 * The largest text size a name on the map is drawn at, and the most its box
 * grows: past it a name outgrew its box and broke inside a word
 * ("Commonwealt / h" at AX3). Names stay hidden from VoiceOver; the panel,
 * search and the List view say them at the reader's size.
 */
export const LABEL_MAX_SCALE = 1.6;

const LabelText = memo(function LabelText({
  text,
  ink,
  strong,
  sub,
}: {
  text: string;
  ink: string;
  strong: boolean;
  sub?: string;
}) {
  const variant = strong ? 'capsule' : 'footnote';
  // A paper halo keeps a name legible over the lines it sits on: the same
  // text in paper beneath, blurred a little, under the inked text.
  return (
    <View>
      <Text
        variant={variant}
        wordSafe
        maxFontSizeMultiplier={LABEL_MAX_SCALE}
        accessible={false}
        style={[styles.underlay, styles.halo]}
      >
        {text}
      </Text>
      <Text
        variant={variant}
        wordSafe
        maxFontSizeMultiplier={LABEL_MAX_SCALE}
        accessible={false}
        style={[styles.halo, { color: ink }]}
      >
        {text}
      </Text>
      {sub ? (
        <Text
          variant="footnote"
          wordSafe
          tone="inkSoft"
          maxFontSizeMultiplier={LABEL_MAX_SCALE}
          accessible={false}
          style={styles.halo}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * One label slot: a native Text kept mounted, placed on the UI thread from
 * the camera. Cluster names fade out as the reader zooms in, node names
 * fade in; the focus and its flows stay; parties always keep their names.
 */
function Slot({
  slot,
  tx,
  ty,
  k,
  fitK,
  allowed,
  width,
}: {
  slot: LabelSlot;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  k: SharedValue<number>;
  fitK: SharedValue<number>;
  allowed: SharedValue<Record<string, 1>>;
  width: number;
}) {
  const { fontScale } = useWindowDimensions();
  const labelWidth = Math.round(
    LABEL_WIDTH * Math.min(fontScale, LABEL_MAX_SCALE),
  );
  const style = useAnimatedStyle(() => {
    const sx = slot.x * k.value + tx.value;
    const sy = slot.y * k.value + ty.value;
    const level = k.value / Math.max(1e-6, fitK.value);
    const byKind =
      slot.kind === 'cluster'
        ? clusterLabelOpacity(level)
        : slot.kind === 'name'
          ? nameOpacity(level)
          : 1;
    const shown = allowed.value[slot.key] ? 1 : 0;
    // Beside the disc's rim for a node; above the blob for a cluster.
    const dx = slot.kind === 'cluster' ? -labelWidth / 2 : slot.r * k.value + 6;
    const dy = slot.kind === 'cluster' ? -LABEL_HEIGHT - 4 : -LABEL_HEIGHT / 2;
    return {
      opacity: byKind * shown,
      transform: [{ translateX: sx + dx }, { translateY: sy + dy }],
    };
  });
  return (
    <Animated.View
      style={[styles.slot, { width: labelWidth, maxWidth: width }, style]}
    >
      <LabelText
        text={slot.text}
        sub={slot.sub}
        ink={slot.ink}
        strong={slot.kind === 'focus' || slot.kind === 'cluster'}
      />
    </Animated.View>
  );
}

export function MoneyMapLabels({
  slots,
  tx,
  ty,
  k,
  fitK,
  allowed,
  width,
}: {
  slots: readonly LabelSlot[];
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  k: SharedValue<number>;
  fitK: SharedValue<number>;
  allowed: SharedValue<Record<string, 1>>;
  width: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.overlay}
      testID="money-map-labels"
    >
      {slots.map((slot) => (
        <Slot
          key={slot.key}
          slot={slot}
          tx={tx}
          ty={ty}
          k={k}
          fitK={fitK}
          allowed={allowed}
          width={width}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  slot: { position: 'absolute', left: 0, top: 0 },
  halo: {
    textShadowColor: colors.paper,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  underlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    color: colors.paper,
  },
});
