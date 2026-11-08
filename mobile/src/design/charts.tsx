import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Canvas, Rect } from '@shopify/react-native-skia';
import { dark, darkHighContrast, light, lightHighContrast } from './palette';
import { useAccessibilitySize, useIncreaseContrast } from './accessibility';
import { Button } from './controls';
import { formatCount, formatDate, type DateInput } from './format';
import { SourceLine } from './source';
import { Text } from './text';
import { accents, colors, radii, rhythm, type Accent } from './tokens';

export interface ChartProvenance {
  dateRange: { start: DateInput; end: DateInput };
  source: string;
}
const provenance = ({ dateRange, source }: ChartProvenance) =>
  `${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}. ${source}`;

/** A single neutral split. The words, rather than the drawing, are spoken. */
export function VoteSplit({
  ayes,
  noes,
  countsStyle,
  onBand = false,
  dateRange,
  source,
}: ChartProvenance & {
  ayes: number;
  noes: number;
  countsStyle: 'votes' | 'ayesNoes';
  onBand?: boolean;
}) {
  const total = Math.max(0, ayes) + Math.max(0, noes);
  const words =
    countsStyle === 'votes'
      ? `${formatCount(ayes)} votes to ${formatCount(noes)}`
      : `${formatCount(ayes)} ${ayes === 1 ? 'aye' : 'ayes'}, ${formatCount(noes)} ${noes === 1 ? 'no' : 'noes'}`;
  return (
    <View
      accessible
      accessibilityLabel={`${words}. ${provenance({ dateRange, source })}`}
      style={styles.chart}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.split}
      >
        <View
          style={{
            width: `${total ? (Math.max(0, ayes) / total) * 100 : 0}%`,
            backgroundColor: onBand ? colors.onBand : colors.ink,
          }}
        />
        <View
          style={{
            flex: 1,
            backgroundColor: onBand ? colors.onBandSoft : colors.inkFaint,
          }}
        />
      </View>
      <Text variant="secondary" tone={onBand ? 'onBand' : 'ink'}>
        {words}
      </Text>
    </View>
  );
}

/** Measured single-line labels decide the layout, including after rotation. */
export function StageTimeline({
  stages,
  latestIndex,
  onBand = false,
  dateRange,
  source,
}: ChartProvenance & {
  stages: readonly { label: string; date: string }[];
  latestIndex: number;
  onBand?: boolean;
}) {
  const large = useAccessibilitySize();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  const keys = stages.map(
    (stage, index) => `${fontScale}:${index}:${stage.label}:${stage.date}`,
  );
  const widths = keys.map((key) => measurements[key]);
  const measured = widths.every((value) => value !== undefined);
  const positions = stages.map((_, index) =>
    stages.length < 2
      ? 0
      : (index / (stages.length - 1)) * Math.max(0, width - 8),
  );
  const bounds = widths.map((value, index) => {
    const size = value ?? 0;
    const left =
      index === 0
        ? 0
        : index === stages.length - 1
          ? width - size
          : positions[index]! + 4 - size / 2;
    return { left, right: left + size };
  });
  const fits =
    measured &&
    width > 0 &&
    bounds.every(
      (bound, index) =>
        bound.left >= 0 &&
        bound.right <= width &&
        (index === 0 || bound.left >= bounds[index - 1]!.right + 8),
    );
  const vertical = large || stages.length > 4 || !fits;
  const ink = onBand ? 'onBand' : 'ink';
  return (
    <View
      style={styles.chart}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* Unconstrained, invisible probes measure the actual native glyph widths.
        No font-scale heuristic decides whether stage names fit. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.probes}
      >
        {stages.map((stage, index) => (
          <View key={keys[index]} style={styles.probe}>
            {[stage.label, stage.date].map((line, lineIndex) => (
              <Text
                key={lineIndex}
                variant="footnote"
                numberOfLines={1}
                onTextLayout={(event) => {
                  const size = event.nativeEvent.lines[0]?.width ?? 0;
                  const key = `${keys[index]}:${lineIndex}`;
                  setMeasurements((old) =>
                    old[key] === size &&
                    old[keys[index]!] ===
                      Math.max(
                        size,
                        old[`${keys[index]}:${1 - lineIndex}`] ?? 0,
                      )
                      ? old
                      : {
                          ...old,
                          [key]: size,
                          [keys[index]!]: Math.max(
                            size,
                            old[`${keys[index]}:${1 - lineIndex}`] ?? 0,
                          ),
                        },
                  );
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <View
        testID="stage-timeline"
        style={vertical ? styles.verticalTimeline : styles.horizontalTimeline}
      >
        {!vertical ? (
          <View
            style={[
              styles.track,
              { backgroundColor: onBand ? colors.onBandSoft : colors.inkFaint },
            ]}
          />
        ) : null}
        {stages.map((stage, index) => (
          <View
            key={keys[index]}
            accessible
            accessibilityLabel={`${stage.label}, ${stage.date}${index === latestIndex ? ', latest stage' : ''}`}
            style={
              vertical
                ? styles.verticalStage
                : [styles.horizontalStage, { left: positions[index] }]
            }
          >
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index <= latestIndex
                      ? colors[ink]
                      : onBand
                        ? colors.onBandSoft
                        : colors.inkFaint,
                },
              ]}
            />
            <View
              style={
                vertical
                  ? styles.stageWords
                  : [
                      styles.stageWords,
                      {
                        width: widths[index] ?? 0,
                        marginLeft:
                          index === 0
                            ? 0
                            : index === stages.length - 1
                              ? 8 - (widths[index] ?? 0)
                              : 4 - (widths[index] ?? 0) / 2,
                        alignItems:
                          index === 0
                            ? 'flex-start'
                            : index === stages.length - 1
                              ? 'flex-end'
                              : 'center',
                      },
                    ]
              }
            >
              <Text variant="footnote" tone={ink}>
                {stage.label}
              </Text>
              <Text variant="footnote" tone={onBand ? 'onBandSoft' : 'inkSoft'}>
                {stage.date}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text variant="footnote" tone={onBand ? 'onBandSoft' : 'inkSoft'}>
        {provenance({ dateRange, source })}
      </Text>
    </View>
  );
}

/** Skia is decorative. Each value is readable, and a table is always available. */
export function BarSeries({
  data,
  ink,
  format,
  tableTitle,
  variant = 'default',
  onShowTable,
  selectedIndex,
  onSelect,
  dateRange,
  source,
}: ChartProvenance & {
  data: readonly { label: string; value: number }[];
  ink: Accent | 'ink';
  format: (value: number) => string;
  tableTitle: string;
  variant?: 'default' | 'spark';
  onShowTable?: () => void;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const spark = variant === 'spark';
  const height = spark ? 24 : 160;
  const maximum = Math.max(
    0,
    ...data.map((item) => (Number.isFinite(item.value) ? item.value : 0)),
  );
  const step = data.length ? width / data.length : 0;
  // Skia takes resolved colours, not DynamicColorIOS objects.
  const darkMode = useColorScheme() === 'dark';
  const contrast = useIncreaseContrast();
  const palette = darkMode
    ? contrast
      ? darkHighContrast
      : dark
    : contrast
      ? lightHighContrast
      : light;
  const colour = palette[ink === 'ink' ? 'ink' : accents[ink].ink];
  const table = onShowTable ?? (() => setShowTable((old) => !old));
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  return (
    <View
      style={styles.chart}
      accessible={spark || undefined}
      accessibilityLabel={
        spark
          ? `${tableTitle}. ${data.map((item) => `${item.label}, ${format(item.value)}`).join('. ')}. ${provenance({ dateRange, source })}`
          : tableTitle
      }
      accessibilityActions={
        onShowTable
          ? [{ name: 'showTable', label: 'Show as table' }]
          : undefined
      }
      onAccessibilityAction={
        onShowTable
          ? (event) => {
              if (event.nativeEvent.actionName === 'showTable') onShowTable();
            }
          : undefined
      }
    >
      <View
        onLayout={onLayout}
        testID="bar-series-plot"
        style={{ height }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Canvas style={{ width, height }}>
          {!spark
            ? [0, 0.5, 1].map((position) => (
                <Rect
                  key={position}
                  x={0}
                  y={Math.min(height - 1, height * position)}
                  width={width}
                  height={1}
                  color={palette.dividerSubtle}
                />
              ))
            : null}
          {data.map((item, index) => {
            const barHeight = maximum
              ? (Math.max(0, Number.isFinite(item.value) ? item.value : 0) /
                  maximum) *
                height
              : 0;
            return (
              <Rect
                key={`${item.label}:${index}`}
                x={index * step + 2}
                y={height - barHeight}
                width={Math.max(0, step - 4)}
                height={barHeight}
                color={index === selectedIndex ? palette.navy : colour}
              />
            );
          })}
        </Canvas>
      </View>
      {!spark ? (
        <View style={styles.barLabels}>
          {data.map((item, index) => {
            const words = (
              <>
                <Text variant="footnote" tabular>
                  {format(item.value)}
                </Text>
                <Text variant="footnote" tone="inkSoft">
                  {item.label}
                </Text>
              </>
            );
            const label = `${item.label}, ${format(item.value)}`;
            return onSelect ? (
              <Pressable
                key={`${item.label}:${index}`}
                accessibilityRole="button"
                accessibilityActions={
                  onShowTable
                    ? [{ name: 'showTable', label: 'Show as table' }]
                    : undefined
                }
                onAccessibilityAction={
                  onShowTable
                    ? (event) => {
                        if (event.nativeEvent.actionName === 'showTable')
                          onShowTable();
                      }
                    : undefined
                }
                accessibilityLabel={label}
                accessibilityState={{ selected: selectedIndex === index }}
                style={styles.barLabel}
                onPress={() => onSelect(index)}
              >
                {words}
              </Pressable>
            ) : (
              <View
                key={`${item.label}:${index}`}
                accessible
                accessibilityActions={
                  onShowTable
                    ? [{ name: 'showTable', label: 'Show as table' }]
                    : undefined
                }
                onAccessibilityAction={
                  onShowTable
                    ? (event) => {
                        if (event.nativeEvent.actionName === 'showTable')
                          onShowTable();
                      }
                    : undefined
                }
                accessibilityLabel={label}
                style={styles.barLabel}
              >
                {words}
              </View>
            );
          })}
        </View>
      ) : null}
      {!spark ? (
        <>
          <Button
            label={
              onShowTable ? 'Table' : showTable ? 'Hide table' : 'Show as table'
            }
            accessibilityLabel="Show as table"
            variant="plain"
            onPress={table}
          />
          {showTable ? (
            <View accessibilityLabel={tableTitle}>
              {data.map((item, index) => (
                <View key={`${item.label}:${index}`} style={styles.tableRow}>
                  <Text variant="body" style={styles.tableCell}>
                    {item.label}
                  </Text>
                  <Text variant="body" tabular>
                    {format(item.value)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <SourceLine
            asOf={dateRange.end}
            citation={source}
            coverage={`${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}`}
          />
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  chart: { gap: rhythm.heading, alignSelf: 'stretch' },
  split: {
    height: 8,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  probes: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  probe: { alignSelf: 'flex-start', width: 10000 },
  horizontalTimeline: { minHeight: 72, marginBottom: rhythm.heading },
  verticalTimeline: { gap: rhythm.block },
  track: { position: 'absolute', top: 3, left: 4, right: 4, height: 2 },
  horizontalStage: { position: 'absolute', top: 0 },
  verticalStage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.heading,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderCurve: 'continuous',
    marginTop: 0,
  },
  stageWords: { gap: 4, marginTop: 8, flexShrink: 1 },
  barLabels: { flexDirection: 'row', gap: 4 },
  barLabel: { flex: 1, minHeight: 44, alignItems: 'center', gap: 4 },
  tableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: rhythm.row,
  },
  tableCell: { flex: 1 },
});
