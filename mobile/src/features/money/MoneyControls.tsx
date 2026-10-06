import { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Button,
  Group,
  Heading,
  SegmentedControl,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { formatFinancialYear } from '../../design/format';
import { colors, minimumTarget, spacing } from '../../design/tokens';
import { moneyCatalogs, type MoneyGraph, type MoneyJurisdiction } from './data';
import { yearExtent, type MoneyFilters } from './view';

/** A native adjustable rail; buttons make every discrete year reachable by touch too. */
export function MoneyYearSlider({
  label,
  value,
  min,
  max,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (year: number) => void;
  testID: string;
}) {
  const [width, setWidth] = useState(1);
  const [preview, setPreview] = useState<number | null>(null);
  const clamp = (year: number) =>
    Math.min(max, Math.max(min, Math.round(year)));
  const gesture = useMemo(() => {
    const year = (x: number) =>
      Math.min(
        max,
        Math.max(
          min,
          Math.round(
            min + (Math.max(0, Math.min(width, x - 12)) / width) * (max - min),
          ),
        ),
      );
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-3, 3])
      .failOffsetY([-16, 16])
      .onBegin((event) => setPreview(year(event.x)))
      .onUpdate((event) => setPreview(year(event.x)))
      .onEnd((event) => onChange(year(event.x)))
      .onFinalize(() => setPreview(null));
    return Gesture.Race(
      pan,
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((event) => onChange(year(event.x))),
    );
  }, [width, min, max, onChange]);
  const shown = preview ?? value;
  const fraction = (shown - min) / Math.max(1, max - min);
  return (
    <Group gap={spacing.s3}>
      <Text variant="control" wordSafe>
        {label}: {formatFinancialYear(shown)}
      </Text>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{
            min,
            max,
            now: value,
            text: formatFinancialYear(value),
          }}
          accessibilityActions={[
            { name: 'increment', label: 'Later financial year' },
            { name: 'decrement', label: 'Earlier financial year' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment')
              onChange(clamp(value + 1));
            if (event.nativeEvent.actionName === 'decrement')
              onChange(clamp(value - 1));
          }}
          testID={testID}
          style={styles.railTarget}
          onLayout={(event) =>
            setWidth(Math.max(1, event.nativeEvent.layout.width - 24))
          }
        >
          <View pointerEvents="none" style={styles.rail}>
            <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
            <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
          </View>
        </View>
      </GestureDetector>
      <Group style={styles.wrap}>
        <Button
          label={`Earlier ${label.toLowerCase()}`}
          disabled={value <= min}
          onPress={() => onChange(clamp(value - 1))}
          testID={`${testID}-earlier`}
        />
        <Button
          label={`Later ${label.toLowerCase()}`}
          disabled={value >= max}
          onPress={() => onChange(clamp(value + 1))}
          testID={`${testID}-later`}
        />
      </Group>
    </Group>
  );
}
export function MoneyToggle({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View style={[styles.toggle, stacked ? styles.stacked : null]}>
      <Text wordSafe variant="control" style={styles.grow}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}
export function MoneyControls({
  graph,
  filters,
  onChange,
  jurisdiction,
  onJurisdiction,
}: {
  graph: MoneyGraph;
  filters: MoneyFilters;
  onChange: (filters: MoneyFilters) => void;
  jurisdiction: MoneyJurisdiction;
  onJurisdiction: (jurisdiction: MoneyJurisdiction) => void;
}) {
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const industries = [
    ...new Set(
      graph.nodes.filter((n) => n.kind === 'donor').map((n) => n.group),
    ),
  ].sort();
  const extent = yearExtent(graph);
  return (
    <Group testID="money-controls">
      <Heading level={2}>View the records</Heading>
      <SegmentedControl
        segments={(Object.keys(moneyCatalogs) as MoneyJurisdiction[]).map(
          (value) => ({
            value,
            label: moneyCatalogs[value].label,
            testID: `money-jurisdiction-${value}`,
          }),
        )}
        value={jurisdiction}
        onChange={onJurisdiction}
      />
      <Text wordSafe variant="fine">
        State and federal returns are not summed.
      </Text>
      <MoneyYearSlider
        label="From year"
        value={filters.from}
        min={extent.from}
        max={extent.to}
        onChange={(from) =>
          onChange({
            ...filters,
            from: Math.min(from, filters.to),
            to: Math.max(from, filters.to),
          })
        }
        testID="money-from-year"
      />
      <MoneyYearSlider
        label="To year"
        value={filters.to}
        min={extent.from}
        max={extent.to}
        onChange={(to) =>
          onChange({
            ...filters,
            from: Math.min(filters.from, to),
            to: Math.max(filters.from, to),
          })
        }
        testID="money-to-year"
      />
      <Button
        label="All years"
        onPress={() => onChange({ ...filters, ...extent })}
        testID="money-all-years"
      />
      <Button
        label={`Industry: ${filters.industry ?? 'All industries'}`}
        expanded={industriesOpen}
        onPress={() => setIndustriesOpen((v) => !v)}
        testID="money-industry"
      />
      {industriesOpen ? (
        <Group>
          <Button
            label="All industries"
            onPress={() => {
              onChange({ ...filters, industry: null });
              setIndustriesOpen(false);
            }}
            testID="money-industry-all"
          />
          {industries.map((industry) => (
            <Button
              key={industry}
              label={industry}
              testID={`money-industry-${industry.replace(/[^a-z0-9]+/g, '-')}`}
              onPress={() => {
                onChange({ ...filters, industry });
                setIndustriesOpen(false);
              }}
            />
          ))}
        </Group>
      ) : null}
      <Heading level={3}>Layers</Heading>
      {(['donations', 'grants', 'contracts'] as const)
        .filter((kind) => kind === 'donations' || graph.meta[`${kind}_source`])
        .map((kind) => (
          <MoneyToggle
            key={kind}
            label={
              kind === 'donations'
                ? 'Political donations'
                : kind === 'grants'
                  ? 'Public grants'
                  : 'Public contracts'
            }
            value={filters[kind]}
            onChange={(value) => onChange({ ...filters, [kind]: value })}
            testID={`money-layer-${kind}`}
          />
        ))}
      <MoneyToggle
        label="Adjust for inflation"
        value={filters.inflation}
        onChange={(inflation) => onChange({ ...filters, inflation })}
        testID="money-inflation"
      />
      {filters.inflation ? (
        <Text wordSafe variant="fine">
          Adjusted to 2025–26 dollars with the ABS Consumer Price Index (all
          groups, Australia, financial-year average). Nominal figures are on the
          returns.
        </Text>
      ) : null}
    </Group>
  );
}
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3 },
  grow: { flex: 1 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    minHeight: minimumTarget,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  railTarget: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  rail: { height: 4, backgroundColor: colors.lineStrong },
  fill: { height: 4, backgroundColor: colors.navy },
  thumb: {
    position: 'absolute',
    top: -10,
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
  },
});
