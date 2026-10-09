import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { colors } from '../../design/tokens';
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
/** Every party on the map, each with a fixed label slot. */
export function moneyLabelParties(
  graph: MoneyGraph,
): { id: string; label: string }[] {
  return graph.nodes
    .filter((node) => node.kind === 'party')
    .map(({ id, label }) => ({ id, label }));
}

const LabelText = memo(function LabelText({
  label,
  ink,
}: {
  label: string;
  /** A cluster's ink; a party or the selection takes the ink role. */
  ink?: string;
}) {
  return (
    <Text
      variant="fine"
      wordSafe
      accessible={false}
      style={{ color: ink ?? colors.ink }}
    >
      {label}
    </Text>
  );
});

/** Keep native text mounted; camera movement changes only wrapper transforms. */
export function MoneyMapLabels({
  groups,
  parties = [],
  labels,
  width,
  labelWidth = 110,
  clamp = true,
}: {
  groups: readonly string[];
  /** The map's parties: named beside their nodes, in the ink role. */
  parties?: readonly { id: string; label: string }[];
  labels: readonly ProjectedLabel[];
  width: number;
  labelWidth?: number;
  clamp?: boolean;
}) {
  const projected = new Map(
    labels
      .filter((label) => label.kind !== 'focus')
      .map((label) => [label.id, label]),
  );
  const focus = labels.find((label) => label.kind === 'focus');
  const slots: {
    key: string;
    label: string;
    ink?: string;
    point: ProjectedLabel | undefined;
  }[] = [
    ...groups.map((group) => ({
      key: group,
      label: group,
      ink: clusterColour(group).ink,
      point: projected.get(group),
    })),
    ...parties.map((party) => ({
      key: `party-${party.id}`,
      label: party.label,
      point: projected.get(party.id),
    })),
  ];
  slots.push({
    key: 'money-focus-label',
    label: focus?.label ?? '\u00a0',
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
