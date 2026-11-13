import {
  associatedLine,
  donorAssociated,
  donorAssociatedTo,
} from '../../../api/associated';
import { AssociatedEntityLabel } from '../../../design/AssociatedEntityLabel';
import type { Href } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../../design/accessibility';
import { Icon } from '../../../design/icon';
import { useAccessibilityFocusRequest } from '../../../design/keyboard';
import {
  counted,
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../../design/format';
import {
  Button,
  IconButton,
  LinkRow,
  MoneyRow,
  SectionHeader,
  StepButtons,
  Text,
} from '../../../design/primitives';
import { symbols } from '../../../design/symbols';
import {
  colors,
  hairline,
  minimumTarget,
  motion,
  radii,
  rhythm,
} from '../../../design/tokens';
import { useRecordLink } from '../../../navigation/record-link';
import { moneyMapEntityRoute } from '../record-routes';
import { moneyYears } from '../records';
import {
  clusterLabel,
  type MapEdge,
  type MapModel,
  type MapNode,
} from './model';

/** How much of the stage the panel takes when expanded. */
const EXPANDED_SHARE = 0.58;
const FLOWS = 15;

export interface PanelFocus {
  node: MapNode;
  /** The node's flows, strongest first, with the disc at the other end. */
  flows: { edge: MapEdge; other: MapNode }[];
  record: Href;
  flowRecord: (other: MapNode) => Href;
  next: { label: string; onPress: () => void } | null;
  previous: { label: string; onPress: () => void } | null;
}

/** "disclosed donations", "disclosed receipts", "in grants to donors on the map". */
export function focusFigureLine(node: MapNode) {
  const years = moneyYears(node.firstYear, node.lastYear);
  if (node.kind === 'party')
    return `disclosed receipts · ${years} · ${counted(node.count, 'receipt')}`;
  if (node.kind === 'hub')
    return `in ${node.flow === 'contracts' ? 'contracts' : 'grants'} to donors on the map · ${years}`;
  return `disclosed donations · ${years} · ${counted(node.count, 'donation')}`;
}
export function focusMetaLine(node: MapNode) {
  return node.kind === 'party'
    ? 'Party'
    : node.kind === 'hub'
      ? 'Public money'
      : `Donor · ${clusterLabel(node.cluster)}`;
}
/** The node's strongest flows with their other ends, for the panel. */
export function focusFlows(model: MapModel, index: number) {
  return (model.flows[index] ?? []).slice(0, FLOWS).flatMap((i) => {
    const edge = model.edges[i]!;
    const other = model.nodes[edge.a === index ? edge.b : edge.a];
    return other ? [{ edge, other }] : [];
  });
}

export interface FlowGroup {
  key: 'donations' | 'public';
  title: string;
  /** Rows keep their place in the strongest-first list, for their test ids. */
  rows: (PanelFocus['flows'][number] & { index: number })[];
  note?: string;
}
export const PUBLIC_MONEY_NOTE =
  'A different register: grants and contracts are recorded apart and never added to donations.';
/**
 * The panel's flow sections. A party's flows are all donations and a hub's
 * all public money; a donor's are split, so money it gave never sits under
 * one heading with money it was paid.
 */
export function focusFlowGroups(
  node: MapNode,
  flows: PanelFocus['flows'],
): FlowGroup[] {
  const rows = flows.map((flow, index) => ({ ...flow, index }));
  if (node.kind === 'hub')
    return [{ key: 'public', title: 'Largest recipients on the map', rows }];
  if (node.kind === 'party')
    return [{ key: 'donations', title: 'Largest donors', rows }];
  const donations = rows.filter((r) => r.edge.type === 'donations');
  const publicMoney = rows.filter((r) => r.edge.type !== 'donations');
  return [
    ...(donations.length
      ? [{ key: 'donations' as const, title: 'Where it went', rows: donations }]
      : []),
    ...(publicMoney.length
      ? [
          {
            key: 'public' as const,
            title: 'Public money received',
            rows: publicMoney,
            note: PUBLIC_MONEY_NOTE,
          },
        ]
      : []),
  ];
}

/**
 * The stage's bottom panel. At rest: the two totals and a Legend button.
 * With a focus: the disc's name, kind and figure, previous and next along
 * its strongest flows, Open record, and its flows (each opening the record
 * at the other end). Two heights, dragged by the handle; a cut under
 * Reduce Motion.
 */
export function MoneyMapPanel({
  focus,
  totals,
  caption,
  legend,
  sourceLine,
  stageHeight,
  maxHeight,
  expanded,
  onExpanded,
  onClear,
  onPeekHeight,
}: {
  focus: PanelFocus | null;
  totals: { donations: number; publicMoney: number | null };
  /** What the map shows: "413 nodes · 1,159 recorded flows". */
  caption: string;
  legend: ReactNode;
  sourceLine: ReactNode;
  stageHeight: number;
  /** The space below fixed controls in the current clear interaction region. */
  maxHeight?: number;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  onClear: () => void;
  /** The panel's resting height, so the stage keeps its map above it. */
  onPeekHeight: (height: number) => void;
}) {
  const reduced = useReduceMotion();
  const entityRoute = focus
    ? moneyMapEntityRoute(focus.node, focus.record)
    : null;
  const entityLink = useRecordLink(entityRoute ?? undefined);
  const [peek, setPeek] = useState(0);
  const height = useSharedValue(0);
  const wanted = expanded
    ? Math.max(peek, Math.round(stageHeight * EXPANDED_SHARE))
    : peek;
  const target = maxHeight === undefined ? wanted : Math.min(wanted, maxHeight);
  useEffect(() => {
    if (!peek) return;
    height.value = reduced
      ? target
      : withTiming(target, { duration: motion.duration.standard });
  }, [target, peek, reduced, height]);
  const style = useAnimatedStyle(() => ({
    height: height.value || undefined,
  }));
  const toggle = useCallback(
    () => onExpanded(!expanded),
    [expanded, onExpanded],
  );
  const set = useCallback((next: boolean) => onExpanded(next), [onExpanded]);
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onEnd((e) => {
          if (e.translationY < -24 || e.velocityY < -300) runOnJS(set)(true);
          else if (e.translationY > 24 || e.velocityY > 300)
            runOnJS(set)(false);
        }),
    [set],
  );
  useEffect(() => {
    if (peek) onPeekHeight(peek);
  }, [peek, onPeekHeight]);
  const figure = (
    value: number,
    label: string,
    testID: string,
    tone: 'moneyInk' | 'ink' = 'moneyInk',
  ) => (
    <View
      style={styles.figure}
      accessible
      accessibilityLabel={`${moneyAccessibilityLabel(value, true)}, ${label}`}
      testID={testID}
    >
      {/* A figure is one word: at accessibility sizes it steps down
          rather than break ("$305.9b / n" at AX3). */}
      <Text variant="tileFigure" tone={tone} tabular wordSafe>
        {formatMoneyCompact(value)}
      </Text>
      <Text variant="footnote" wordSafe>
        {label}
      </Text>
    </View>
  );
  // A search result's subject is where VoiceOver goes next: the search
  // field it was chosen from has closed.
  const titleRef = useAccessibilityFocusRequest('money-map-focus');
  const entityTitle = focus ? (
    <View
      style={styles.grow}
      // Without a page to open, the title still reads as one line.
      ref={entityRoute ? undefined : titleRef}
      accessible={!entityRoute}
      accessibilityLabel={
        entityRoute
          ? undefined
          : `${focusMetaLine(focus.node)}, ${focus.node.label}`
      }
      testID="money-map-focus-title"
    >
      <Text variant="footnote" wordSafe testID="money-map-focus-meta">
        {focusMetaLine(focus.node)}
      </Text>
      <Text
        variant="name"
        tone={entityRoute ? 'navy' : 'ink'}
        wordSafe
        testID="money-map-focus-name"
      >
        {focus.node.label}
      </Text>
    </View>
  ) : null;
  return (
    <Animated.View
      style={[
        styles.panel,
        style,
        maxHeight === undefined ? null : { maxHeight },
      ]}
      testID={focus ? 'money-map-panel-focus' : 'money-map-panel'}
    >
      <GestureDetector gesture={drag}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse details' : 'Expand details'}
          onPress={toggle}
          style={styles.handleRow}
          testID="money-map-handle"
        >
          <View style={styles.handle} />
        </Pressable>
      </GestureDetector>
      <ScrollView
        scrollEnabled={
          expanded || (maxHeight !== undefined && peek > maxHeight)
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View
          onLayout={(event) => {
            const h =
              Math.ceil(event.nativeEvent.layout.height) +
              HANDLE +
              rhythm.block;
            setPeek((previous) => (previous === h ? previous : h));
          }}
        >
          {focus ? (
            <View style={styles.block}>
              <View style={styles.titleRow}>
                {entityRoute ? (
                  <Pressable
                    ref={titleRef}
                    accessibilityRole="link"
                    accessibilityLabel={`${focusMetaLine(focus.node)}, ${focus.node.label}`}
                    onPress={entityLink.open}
                    style={({ pressed }) => [
                      styles.entityLink,
                      pressed && styles.pressed,
                    ]}
                    testID="money-map-focus-link"
                  >
                    {entityTitle}
                    <Icon name={symbols.chevron} size={16} />
                  </Pressable>
                ) : (
                  entityTitle
                )}
                <IconButton
                  symbol={symbols.close}
                  accessibilityLabel="Clear the focus"
                  onPress={onClear}
                  testID="money-map-focus-clear"
                />
              </View>
              <AssociatedEntityLabel
                associated={
                  focus.node.kind === 'donor'
                    ? donorAssociated(focus.node)
                    : null
                }
                testID="money-map-focus-associated"
              />
              <View
                accessible
                accessibilityLabel={`${moneyAccessibilityLabel(focus.node.amount, true)}, ${focusFigureLine(focus.node)}`}
                testID="money-map-focus-figure"
              >
                <Text variant="tileFigure" tone="moneyInk" tabular wordSafe>
                  {formatMoneyCompact(focus.node.amount)}
                </Text>
                <Text variant="footnote" wordSafe>
                  {focusFigureLine(focus.node)}
                </Text>
              </View>
              <StepButtons
                previous={{
                  label: 'Previous',
                  accessibilityLabel: focus.previous
                    ? `Previous: ${focus.previous.label}`
                    : 'Previous flow',
                  disabled: !focus.previous,
                  onPress: () => focus.previous?.onPress(),
                  testID: 'money-map-previous',
                }}
                next={{
                  label: 'Next flow',
                  accessibilityLabel: focus.next
                    ? `Next flow: ${focus.next.label}`
                    : 'Next flow',
                  disabled: !focus.next,
                  onPress: () => focus.next?.onPress(),
                  testID: 'money-map-next',
                }}
                testID="money-map-steps"
              />
            </View>
          ) : (
            <View style={styles.restRow}>
              {figure(
                totals.donations,
                'disclosed to parties',
                'money-map-total-donations',
              )}
              {totals.publicMoney !== null
                ? figure(
                    totals.publicMoney,
                    'public money to donors on the map',
                    'money-map-total-public',
                    'ink',
                  )
                : null}
              <View style={styles.legendButton}>
                <Button
                  label="Legend"
                  variant="quiet"
                  size="compact"
                  hug
                  expanded={expanded}
                  onPress={toggle}
                  testID="money-map-legend-toggle"
                />
              </View>
            </View>
          )}
        </View>
        {expanded ? (
          focus ? (
            <View style={styles.block} testID="money-map-focus-flows">
              {entityRoute ? (
                <LinkRow
                  title="Open record"
                  detail={`${formatMoney(focus.node.amount)} with every source`}
                  symbol={symbols.money}
                  symbolInk="money"
                  href={focus.record}
                  testID="money-map-open-record"
                />
              ) : null}
              {focusFlowGroups(focus.node, focus.flows).map((group) => (
                <View
                  key={group.key}
                  style={styles.block}
                  testID={`money-map-flows-${group.key}`}
                >
                  <SectionHeader title={group.title} level={3} />
                  <View>
                    {group.rows.map(({ edge, other, index }) => (
                      <MoneyRow
                        key={`${edge.index}`}
                        name={other.label}
                        detail={[
                          associatedLine(
                            focus.node.kind === 'party'
                              ? donorAssociatedTo(other, focus.node.label)
                              : other.kind === 'donor'
                                ? donorAssociated(other)
                                : null,
                          ),
                          `${moneyYears(edge.firstYear, edge.lastYear)} · ${counted(
                            edge.count,
                            edge.type === 'donations'
                              ? 'donation'
                              : edge.type === 'grants'
                                ? 'grant'
                                : 'contract',
                          )}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        amount={edge.amount}
                        compact
                        href={focus.flowRecord(other)}
                        testID={`money-map-flow-${index}`}
                      />
                    ))}
                  </View>
                  {group.note ? (
                    <Text variant="footnote" wordSafe>
                      {group.note}
                    </Text>
                  ) : null}
                </View>
              ))}
              {sourceLine}
            </View>
          ) : (
            <View style={styles.block}>
              <Text variant="footnote" wordSafe testID="money-map-caption">
                {caption}
              </Text>
              {legend}
              {sourceLine}
            </View>
          )
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

const HANDLE = 20;
const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: radii.container,
    borderTopRightRadius: radii.container,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.dividerSubtle,
    overflow: 'hidden',
  },
  handleRow: {
    height: HANDLE,
    minHeight: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
    // A 44 pt target: the rows beneath are reachable past the strip.
    paddingVertical: (minimumTarget - HANDLE) / 2,
    marginVertical: -((minimumTarget - HANDLE) / 2),
    zIndex: 1,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    borderCurve: 'continuous',
    backgroundColor: colors.dividerDefault,
  },
  content: {
    paddingHorizontal: rhythm.block,
    // Air under the handle, so a figure never crowds it.
    paddingTop: rhythm.tight,
    paddingBottom: rhythm.block,
    gap: rhythm.block,
  },
  block: { gap: rhythm.tight },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  grow: { flex: 1, gap: 2 },
  entityLink: {
    flex: 1,
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  pressed: { opacity: 0.6 },
  restRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // The figures share one top line whatever their captions wrap to.
    alignItems: 'flex-start',
    gap: rhythm.block,
  },
  // The figures share the row and the Legend button hugs its end; only a
  // large type size wraps them.
  figure: { gap: 2, flexGrow: 1, flexShrink: 1, flexBasis: 120 },
  legendButton: { marginLeft: 'auto', alignSelf: 'center' },
});
