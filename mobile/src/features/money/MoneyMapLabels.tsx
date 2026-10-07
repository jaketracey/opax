import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import type { MoneyGraph } from './data';
import type { ProjectedLabel } from './NativeMoneyScene';
import { clusterColour } from './ported/palette';

export function moneyLabelGroups(graph: MoneyGraph): string[] {
  return [
    ...new Set(
      graph.nodes.map((node) =>
        node.kind === 'grantor' ? 'public money' : node.group,
      ),
    ),
  ].filter((group) => group !== 'parties');
}

const LabelText = memo(function LabelText({
  label,
  ink,
}: {
  label: string;
  ink: string;
}) {
  return (
    <Text variant="fine" wordSafe accessible={false} style={{ color: ink }}>
      {label}
    </Text>
  );
});

/** Keep native text mounted; camera movement changes only wrapper transforms. */
export function MoneyMapLabels({
  groups,
  labels,
  width,
  labelWidth = 110,
  clamp = true,
}: {
  groups: readonly string[];
  labels: readonly ProjectedLabel[];
  width: number;
  labelWidth?: number;
  clamp?: boolean;
}) {
  const projected = new Map(labels.map((label) => [label.id, label]));
  const groupIds = new Set(groups);
  const focus = labels.find((label) => !groupIds.has(label.id));
  const slots = groups.map((group) => ({
    key: group,
    label: group,
    ink: clusterColour(group).ink,
    point: projected.get(group),
  }));
  slots.push({
    key: 'money-focus-label',
    label: focus?.label ?? '\u00a0',
    ink: focus?.ink ?? '#23271F',
    point: focus,
  });
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.overlay}
    >
      {slots.map(({ key, label, ink, point }) => {
        const left = (point?.x ?? 0) - labelWidth / 2;
        const x = clamp
          ? Math.max(0, Math.min(width - labelWidth, left))
          : left;
        return (
          <View
            key={key}
            style={[
              styles.slot,
              {
                width: labelWidth,
                opacity: point ? 1 : 0,
                transform: [
                  { translateX: x },
                  {
                    translateY: clamp
                      ? Math.max(0, point?.y ?? 0)
                      : (point?.y ?? 0),
                  },
                ],
              },
            ]}
          >
            <LabelText label={label} ink={ink} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', inset: 0 },
  slot: { position: 'absolute', left: 0, top: 0 },
});
