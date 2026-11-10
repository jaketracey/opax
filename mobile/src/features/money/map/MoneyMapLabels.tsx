import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../../design/primitives';
import { clusterLabelOpacity, nameOpacity } from './camera';
import type { LabelSlot } from './labels';

/** The label box the de-overlap pass assumes, in points at the default size. */
export const LABEL_WIDTH = 120;
export const LABEL_HEIGHT = 22;

const LabelText = memo(function LabelText({
  text,
  ink,
  strong,
}: {
  text: string;
  ink: string;
  strong: boolean;
}) {
  return (
    <Text
      variant={strong ? 'capsule' : 'footnote'}
      wordSafe
      accessible={false}
      style={{ color: ink }}
    >
      {text}
    </Text>
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
  const labelWidth = Math.round(LABEL_WIDTH * Math.min(fontScale, 1.6));
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
});
