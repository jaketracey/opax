import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../../design/primitives';
import { colors } from '../../design/tokens';
import type { MoneyGraph } from './data';
import type { ProjectedLabel } from './NativeMoneyScene';
import { clusterColour } from './ported/palette';
import { industryLabel } from './records';

/**
 * Labels grow with Dynamic Type to the AX1 size and are held there, never
 * hidden (map 3.11): AX1 is about 1.65 times the default text size.
 */
export const LABEL_SCALE_CAP = 28 / 17;
/** The scale a label is drawn at for the window's text size. */
export const labelScale = (fontScale: number) =>
  Math.min(fontScale, LABEL_SCALE_CAP);
/** "Mining and energy", "Public money": the drawn words for a cluster. */
export const clusterLabel = (group: string) => industryLabel(group);

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
  shrink = 1,
}: {
  label: string;
  /** A cluster's ink; a party or the selection takes the ink role. */
  ink?: string;
  /** Below 1 above AX1, holding the label at the AX1 size. */
  shrink?: number;
}) {
  return (
    <Text
      variant="footnote"
      wordSafe
      accessible={false}
      style={[
        { color: ink ?? colors.ink },
        shrink < 1 ? { fontSize: 13 * shrink, lineHeight: 18 * shrink } : null,
      ]}
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
  const { fontScale } = useWindowDimensions();
  // Above AX1 the role's size is scaled back so the drawn size holds.
  const shrink = fontScale > LABEL_SCALE_CAP ? LABEL_SCALE_CAP / fontScale : 1;
  const slot = Math.round(labelWidth * Math.max(1, labelScale(fontScale)));
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
      label: clusterLabel(group),
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
        const left = (point?.x ?? 0) - slot / 2;
        const x = clamp
          ? Math.max(0, Math.min(width - slot, left))
          : left;
        return (
          <View
            key={key}
            style={[
              styles.slot,
              {
                width: slot,
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
            <LabelText label={label} ink={ink} shrink={shrink} />
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
