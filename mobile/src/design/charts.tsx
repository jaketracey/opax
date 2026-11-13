import { Pressable } from './pressable';
import { Rect } from '@shopify/react-native-skia';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type AccessibilityActionEvent,
} from 'react-native';
import { useAccessibilitySize, useIncreaseContrast } from './accessibility';
import { SizedCanvas } from './canvas';
import { Button } from './controls';
import {
  activeVerticalFold,
  placeClear,
  sidesOf,
  type Rect as LabelRect,
  type ReservedRegions,
} from './fold';
import { ReservedRegionArea, useReservedRegions } from './fold-area';
import { formatCount, formatDate, type DateInput } from './format';
import { dark, darkHighContrast, light, lightHighContrast } from './palette';
import { SourceLine } from './source';
import { Text } from './text';
import {
  accents,
  colors,
  interfaceFonts as fonts,
  radii,
  rhythm,
  textStyles,
  size,
  type Accent,
} from './tokens';

export interface ChartProvenance {
  dateRange: { start: DateInput; end: DateInput };
  citation: string;
}
const provenance = ({ dateRange, citation }: ChartProvenance) => {
  const start = formatDate(dateRange.start),
    end = formatDate(dateRange.end);
  return [start === end ? start : `${start} to ${end}`, citation]
    .filter(Boolean)
    .join('. ');
};

type Measurement = { width: number; height: number };

/** Only call a financial year or calendar year partial when its dated source is within it. */
export function latestBarCaption(
  label: string,
  value: string,
  asOf: DateInput,
): string {
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  const year = date.getUTCFullYear();
  const financial = /^(\d{4})[–-](\d{2}|\d{4})$/.exec(label);
  const start = financial ? Number(financial[1]) : null;
  const end = financial
    ? financial[2]!.length === 2
      ? start! + (String(start! + 1).slice(-2) === financial[2] ? 1 : 0)
      : Number(financial[2])
    : null;
  const partial =
    start !== null && end === start + 1
      ? (year === start && date.getUTCMonth() >= 6) ||
        (year === end &&
          date.getUTCMonth() < 6 &&
          !(date.getUTCMonth() === 5 && date.getUTCDate() === 30))
      : /^\d{4}$/.test(label) &&
        Number(label) === year &&
        !(date.getUTCMonth() === 11 && date.getUTCDate() === 31);
  return `${label}${partial ? ' so far' : ''}: ${value}`;
}

/** Move only a chart annotation, keeping it with the datum on its fold side. */
export function clearChartLabel(
  rect: LabelRect,
  anchor: number,
  regions: ReservedRegions,
  width: number,
): LabelRect {
  const fold = activeVerticalFold(regions.divisions);
  if (!fold || !width) return rect;
  const bounds = { x: 0, y: rect.y, width, height: rect.height };
  const sides = sidesOf(fold, bounds);
  if (!('leading' in sides)) return rect;
  const side =
    anchor < fold.x
      ? sides.leading
      : anchor > fold.x + fold.width
        ? sides.trailing
        : sides.trailing.width >= sides.leading.width
          ? sides.trailing
          : sides.leading;
  return placeClear(
    { ...rect, width: Math.min(rect.width, side.width) },
    { divisions: [fold], occlusions: [] },
    side,
  );
}
type TextMeasurementEvent = { nativeEvent: { lines: readonly Measurement[] } };
function useTextMeasurements() {
  const [sizes, setSizes] = useState<Record<string, Measurement>>({});
  const measure = (key: string) => (event: TextMeasurementEvent) => {
    const width = Math.max(
      0,
      ...event.nativeEvent.lines.map((line) => line.width),
    );
    const height = event.nativeEvent.lines.reduce(
      (sum, line) => sum + line.height,
      0,
    );
    setSizes((old) =>
      old[key]?.width === width && old[key]?.height === height
        ? old
        : { ...old, [key]: { width, height } },
    );
  };
  return { sizes, measure };
}

/** A neutral split, with counts beside the bar or below it at AX sizes. */
export function VoteSplit({
  ayes,
  noes,
  countsStyle,
  onBand = false,
  dateRange,
  citation,
}: ChartProvenance & {
  ayes: number;
  noes: number;
  countsStyle: 'votes' | 'ayesNoes';
  onBand?: boolean;
}) {
  const large = useAccessibilitySize();
  const total = Math.max(0, ayes) + Math.max(0, noes);
  const words =
    countsStyle === 'votes'
      ? `${formatCount(ayes)} votes to ${formatCount(noes)}`
      : [
          ayes ? `${formatCount(ayes)} ${ayes === 1 ? 'aye' : 'ayes'}` : null,
          noes ? `${formatCount(noes)} ${noes === 1 ? 'no' : 'noes'}` : null,
        ]
          .filter(Boolean)
          .join(', ') || 'No votes';
  return (
    <View
      accessible
      accessibilityLabel={`${words}. ${provenance({ dateRange, citation })}`}
      style={[styles.voteSplit, large ? styles.voteSplitStacked : null]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.split, large ? styles.splitStacked : styles.splitInline]}
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
      <Text variant="secondary" tabular tone={onBand ? 'onBand' : 'ink'}>
        {words}
      </Text>
    </View>
  );
}

/** Both native label widths and heights determine the horizontal layout. */
export function StageTimeline(
  props: Parameters<typeof StageTimelineContent>[0],
) {
  return (
    <ReservedRegionArea>
      <StageTimelineContent {...props} />
    </ReservedRegionArea>
  );
}

function StageTimelineContent({
  stages,
  latestIndex,
  onBand = false,
  dateRange,
  citation,
}: ChartProvenance & {
  stages: readonly { label: string; date: string }[];
  latestIndex: number;
  onBand?: boolean;
}) {
  const large = useAccessibilitySize();
  const regions = useReservedRegions();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [firstLines, setFirstLines] = useState<Record<string, number>>({});
  const [stageFrames, setStageFrames] = useState<
    Record<string, { y: number; height: number }>
  >({});
  const { sizes, measure } = useTextMeasurements();
  const keys = stages.map(
    (stage, index) => `${fontScale}:${index}:${stage.label}:${stage.date}`,
  );
  const measured = keys.every(
    (key) => sizes[`${key}:label`] && sizes[`${key}:date`],
  );
  const widths = keys.map((key) =>
    Math.max(
      sizes[`${key}:label`]?.width ?? 0,
      sizes[`${key}:date`]?.width ?? 0,
    ),
  );
  const labelHeight = Math.max(
    0,
    ...keys.map(
      (key) =>
        (sizes[`${key}:label`]?.height ?? 0) +
        4 +
        (sizes[`${key}:date`]?.height ?? 0),
    ),
  );
  const positions = stages.map((_, index) =>
    stages.length < 2
      ? 0
      : (index / (stages.length - 1)) * Math.max(0, width - 10),
  );
  const bounds = widths.map((size, index) => {
    const left =
      index === 0
        ? 0
        : index === stages.length - 1
          ? width - size
          : positions[index]! + 5 - size / 2;
    return { left, right: left + size };
  });
  const annotations = bounds.map((bound, index) => {
    if (!activeVerticalFold(regions.divisions))
      return {
        left: positions[index]!,
        width: widths[index]!,
        marginLeft: bound.left - positions[index]!,
      };
    const rect = clearChartLabel(
      {
        x: bound.left,
        y: 0,
        width: Math.max(10, widths[index]!),
        height: 10 + 8 + labelHeight,
      },
      positions[index]! + 5,
      regions,
      width,
    );
    const left = Math.max(
      rect.x,
      Math.min(positions[index]!, rect.x + rect.width - 10),
    );
    return { left, width: rect.width, marginLeft: rect.x - left };
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
  const dotCentres = keys.map(
    (key) =>
      (stageFrames[key]?.y ?? 0) +
      Math.max(
        size.partyDot / 2,
        (firstLines[key] ?? textStyles.footnote.lineHeight * fontScale) / 2,
      ),
  );
  const firstCentre = dotCentres[0] ?? 0;
  const lastFrame = stageFrames[keys.at(-1) ?? ''];
  const lastOffset = (dotCentres.at(-1) ?? 0) - (lastFrame?.y ?? 0);
  const ink = onBand ? 'onBand' : 'ink';
  return (
    <View
      style={styles.chart}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      testID="stage-timeline-content"
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.probes}
      >
        {stages.map((stage, index) => (
          <View key={keys[index]} style={styles.probe}>
            <Text
              variant="footnote"
              style={styles.stageLabel}
              onTextLayout={measure(`${keys[index]}:label`)}
            >
              {stage.label}
            </Text>
            <Text
              variant="footnote"
              onTextLayout={measure(`${keys[index]}:date`)}
            >
              {stage.date}
            </Text>
          </View>
        ))}
      </View>
      <View
        testID="stage-timeline"
        style={
          vertical
            ? styles.verticalTimeline
            : [styles.horizontalTimeline, { height: 10 + 8 + labelHeight }]
        }
      >
        {vertical && stages.length > 1 ? (
          <View
            testID="stage-timeline-rail"
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (size.partyDot - 2) / 2,
              width: 2,
              top: firstCentre,
              bottom: lastFrame ? lastFrame.height - lastOffset : 0,
              backgroundColor: onBand ? colors.onBandSoft : colors.inkFaint,
            }}
          >
            <View
              testID="stage-timeline-rail-complete"
              style={{
                width: 2,
                height: Math.max(
                  0,
                  (dotCentres[Math.min(latestIndex, stages.length - 1)] ??
                    firstCentre) - firstCentre,
                ),
                backgroundColor: colors[ink],
              }}
            />
          </View>
        ) : null}
        {!vertical ? (
          <View
            style={[
              styles.track,
              { backgroundColor: onBand ? colors.onBandSoft : colors.inkSoft },
            ]}
          />
        ) : null}
        {stages.map((stage, index) => (
          <View
            key={index}
            accessible
            accessibilityLabel={`${stage.label}, ${stage.date}${index === latestIndex ? ', latest stage' : ''}`}
            onLayout={
              vertical
                ? (event) => {
                    const { y, height } = event.nativeEvent.layout;
                    const key = keys[index]!;
                    setStageFrames((seen) =>
                      seen[key]?.y === y && seen[key]?.height === height
                        ? seen
                        : { ...seen, [key]: { y, height } },
                    );
                  }
                : undefined
            }
            style={
              vertical
                ? styles.verticalStage
                : [styles.horizontalStage, { left: annotations[index]!.left }]
            }
          >
            <View
              style={[
                styles.dot,
                {
                  ...(vertical
                    ? {
                        marginTop: Math.max(
                          0,
                          ((firstLines[keys[index]!] ??
                            textStyles.footnote.lineHeight * fontScale) -
                            size.partyDot) /
                            2,
                        ),
                      }
                    : {}),
                  backgroundColor:
                    index <= latestIndex
                      ? colors[ink]
                      : onBand
                        ? colors.onBandSoft
                        : colors.inkSoft,
                },
              ]}
            />
            <View
              style={
                vertical
                  ? styles.verticalStageWords
                  : [
                      styles.stageWords,
                      {
                        width: annotations[index]!.width,
                        marginLeft: annotations[index]!.marginLeft,
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
              <Text
                variant="footnote"
                tone={ink}
                style={styles.stageLabel}
                onTextLayout={(event) => {
                  const line = event.nativeEvent.lines[0];
                  const key = keys[index]!;
                  if (line)
                    setFirstLines((seen) =>
                      seen[key] === line.height
                        ? seen
                        : { ...seen, [key]: line.height },
                    );
                }}
              >
                {stage.label}
              </Text>
              <Text variant="footnote" tone={onBand ? 'onBandSoft' : 'inkSoft'}>
                {stage.date}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text
        testID="stage-timeline-caption"
        variant="footnote"
        tone={onBand ? 'onBandSoft' : 'inkSoft'}
      >
        {provenance({ dateRange, citation })}
      </Text>
    </View>
  );
}

type PositionedLabel = {
  index: number;
  left: number;
  width: number;
  height: number;
};
function positionLabel(
  index: number,
  size: Measurement,
  step: number,
  width: number,
): PositionedLabel {
  const labelWidth = size.width + 1; // Allow for native fractional glyph rounding.
  return {
    index,
    left: Math.max(
      0,
      Math.min((index + 0.5) * step - labelWidth / 2, width - labelWidth),
    ),
    width: labelWidth,
    height: size.height,
  };
}
function axisLabels(
  measurements: (Measurement | undefined)[],
  width: number,
  every = 1,
): PositionedLabel[] {
  if (!width || measurements.some((size) => !size)) return [];
  const step = width / measurements.length;
  const firstStride = Number.isFinite(every)
    ? Math.max(1, Math.ceil(every))
    : 1;
  for (
    let stride = Math.min(firstStride, measurements.length);
    stride <= measurements.length;
    stride++
  ) {
    const labels = measurements.flatMap((size, index) =>
      index % stride === 0 ? [positionLabel(index, size!, step, width)] : [],
    );
    if (
      labels.every(
        (label, index) =>
          label.width <= width &&
          (index === 0 ||
            label.left >=
              labels[index - 1]!.left + labels[index - 1]!.width + 8),
      )
    )
      return labels;
  }
  return []; // Oversized axis words remain available through each bar and the table.
}

/** Skia is decorative. Accessible columns retain every value as x labels thin. */
export function BarSeries(props: Parameters<typeof BarSeriesContent>[0]) {
  return (
    <ReservedRegionArea>
      <BarSeriesContent {...props} />
    </ReservedRegionArea>
  );
}

function BarSeriesContent({
  data,
  ink,
  format,
  tableTitle,
  variant = 'default',
  onShowTable,
  selectedIndex,
  onSelect,
  dateRange,
  citation,
  labels,
  height = 160,
  sourceLine,
  tableTestID,
  emphasisFrom,
  scaleGutter = false,
  partialFrom,
}: ChartProvenance & {
  data: readonly { label: string; value: number }[];
  ink: Accent | 'ink';
  format: (value: number) => string;
  tableTitle: string;
  variant?: 'default' | 'spark';
  sourceLine?: React.ReactNode | false;
  tableTestID?: string;
  emphasisFrom?: number;
  /**
   * Scale values in their own column left of the bars, clear of every bar at
   * any text size, rather than over the plot's trailing edge.
   */
  scaleGutter?: boolean;
  /**
   * Bars from this index hold a year whose returns are not all in yet: drawn
   * lighter, read "so far", with the caption placed under the last bar.
   */
  partialFrom?: number;
  onShowTable?: () => void;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  /** Minimum x-label stride; native measurements may require a larger step. */
  labels?: { every?: number };
  /** Retained for callers; scale labels and the caption replace floating values. */
  values?: 'latest' | 'all' | 'none';
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const regions = useReservedRegions();
  const [showTable, setShowTable] = useState(false);
  const { fontScale } = useWindowDimensions();
  const { sizes, measure } = useTextMeasurements();
  const spark = variant === 'spark';
  const plotHeight = spark ? 24 : height;
  const maximum = Math.max(
    0,
    ...data.map((item) => (Number.isFinite(item.value) ? item.value : 0)),
  );
  const scaleValues = [1, 0.5].map((fraction) => format(maximum * fraction));
  const scaleKey = (text: string) => `${fontScale}:scale:${text}`;
  const gutter =
    scaleGutter && !spark
      ? Math.ceil(
          Math.max(
            0,
            ...scaleValues.map((text) => sizes[scaleKey(text)]?.width ?? 0),
          ),
        ) +
        1 +
        rhythm.tight * 2
      : 0;
  const plotWidth = Math.max(0, width - gutter);
  const step = data.length ? plotWidth / data.length : 0;
  const partial = (index: number) =>
    partialFrom !== undefined && index >= partialFrom;
  const yearLabel = (index: number) =>
    partial(index) ? `${data[index]!.label} so far` : data[index]!.label;
  const keys = data.map(
    (item, index) =>
      `${fontScale}:${index}:${item.label}:${format(item.value)}`,
  );
  const clearLabel = (label: PositionedLabel): PositionedLabel => {
    const clear = clearChartLabel(
      {
        x: label.left + gutter,
        y: 0,
        width: label.width,
        height: label.height,
      },
      gutter + (label.index + 0.5) * step,
      regions,
      width,
    );
    return { ...label, left: clear.x, width: clear.width };
  };
  const xLabels = axisLabels(
    keys.map((key) => sizes[`${key}:x`]),
    plotWidth,
    labels?.every,
  ).map(clearLabel);
  const xHeight = Math.max(0, ...xLabels.map((label) => label.height));
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
  const tableLabel = showTable ? 'Show as chart' : 'Show as table';
  const latest = data.at(-1);
  const tableActions = onShowTable
    ? [{ name: 'showTable', label: 'Show as table' }]
    : undefined;
  const tableAction = onShowTable
    ? (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'showTable') onShowTable();
      }
    : undefined;
  return (
    <View
      style={styles.chart}
      testID="bar-series-content"
      accessible={spark || undefined}
      accessibilityLabel={
        spark
          ? `${tableTitle}. ${data.map((item, index) => `${yearLabel(index)}, ${format(item.value)}`).join('. ')}. ${provenance({ dateRange, citation })}`
          : tableTitle
      }
      accessibilityActions={tableActions}
      onAccessibilityAction={tableAction}
    >
      {!spark ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.probes}
        >
          {data.map((item, index) => (
            <View key={keys[index]} style={styles.probe}>
              <Text
                variant="footnote"
                onTextLayout={measure(`${keys[index]}:x`)}
              >
                {item.label}
              </Text>
            </View>
          ))}
          {scaleGutter
            ? scaleValues.map((text) => (
                <View key={`scale:${text}`} style={styles.probe}>
                  <Text
                    variant="footnote"
                    tabular
                    onTextLayout={measure(scaleKey(text))}
                  >
                    {text}
                  </Text>
                </View>
              ))
            : null}
        </View>
      ) : null}
      {!showTable ? (
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          testID="bar-series-plot"
          style={{ height: plotHeight }}
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <SizedCanvas width={width} height={plotHeight}>
              {!spark
                ? [0, 0.5, 1].map((position) => (
                    <Rect
                      key={position}
                      x={gutter}
                      y={Math.min(plotHeight - 1, plotHeight * position)}
                      width={plotWidth}
                      height={1}
                      color={palette.dividerSubtle}
                    />
                  ))
                : null}
              {data.map((item, index) => {
                const barHeight = maximum
                  ? (Math.max(0, Number.isFinite(item.value) ? item.value : 0) /
                      maximum) *
                    plotHeight
                  : 0;
                return (
                  <Rect
                    key={`${item.label}:${index}`}
                    opacity={partial(index) ? 0.4 : 1}
                    x={gutter + index * step + 2}
                    y={plotHeight - barHeight}
                    width={Math.max(0, step - 4)}
                    height={barHeight}
                    color={
                      onSelect && index === selectedIndex
                        ? palette.navy
                        : emphasisFrom !== undefined && index < emphasisFrom
                          ? palette.inkSoft
                          : colour
                    }
                  />
                );
              })}
            </SizedCanvas>
          </View>
          {!spark
            ? [1, 0.5].map((fraction, index) => {
                const height =
                  sizes[scaleKey(scaleValues[index]!)]?.height ?? 0;
                return (
                  <Text
                    key={fraction}
                    testID={`bar-series-scale-${fraction}`}
                    variant="footnote"
                    tone="inkSoft"
                    tabular
                    style={
                      scaleGutter
                        ? {
                            position: 'absolute',
                            left: 0,
                            width: Math.max(0, gutter - rhythm.tight),
                            // Centred on its gridline, inside the plot's height.
                            top: Math.max(
                              0,
                              Math.min(
                                plotHeight - height,
                                plotHeight * (1 - fraction) - height / 2,
                              ),
                            ),
                            textAlign: 'right',
                          }
                        : {
                            position: 'absolute',
                            right: 0,
                            top: plotHeight * (1 - fraction),
                            textAlign: 'right',
                            backgroundColor: palette.paper,
                          }
                    }
                  >
                    {scaleValues[index]}
                  </Text>
                );
              })
            : null}
          {!spark
            ? data.map((item, index) => {
                const a11y = {
                  accessibilityLabel: `${yearLabel(index)}, ${format(item.value)}`,
                  accessibilityActions: tableActions,
                  onAccessibilityAction: tableAction,
                };
                const style = [
                  styles.barTarget,
                  { left: gutter + index * step, width: step },
                ];
                return onSelect ? (
                  <Pressable
                    key={index}
                    {...a11y}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedIndex === index }}
                    style={style}
                    onPress={() => onSelect(index)}
                  />
                ) : (
                  <View key={index} {...a11y} accessible style={style} />
                );
              })
            : null}
        </View>
      ) : null}
      {!spark && !showTable && xLabels.length ? (
        <View
          testID="bar-series-axis"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ height: xHeight }}
        >
          {xLabels.map((label) => (
            <Text
              key={label.index}
              variant="footnote"
              tone="inkSoft"
              style={[
                styles.positionedLabel,
                { left: label.left, width: label.width },
              ]}
            >
              {data[label.index]!.label}
            </Text>
          ))}
        </View>
      ) : null}
      {!spark ? (
        <>
          {latest && !showTable ? (
            <Text
              variant="footnote"
              tone="inkSoft"
              tabular
              testID="bar-series-caption"
              // A partial year's caption sits under its own (last) bar.
              style={partial(data.length - 1) ? styles.endCaption : undefined}
            >
              {partial(data.length - 1)
                ? `${yearLabel(data.length - 1)}: ${format(latest.value)}`
                : latestBarCaption(
                    latest.label,
                    format(latest.value),
                    dateRange.end,
                  )}
            </Text>
          ) : null}
          <Button
            testID={tableTestID}
            label={tableLabel}
            accessibilityLabel={tableLabel}
            variant="plain"
            onPress={table}
          />
          {showTable ? (
            <View>
              <Text variant="subsectionTitle" accessibilityRole="header">
                {tableTitle}
              </Text>
              {data.map((item, index) => (
                <View key={`${item.label}:${index}`} style={styles.tableRow}>
                  <Text variant="body" style={styles.tableCell}>
                    {yearLabel(index)}
                  </Text>
                  <Text variant="body" tabular>
                    {format(item.value)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {sourceLine === false
            ? null
            : (sourceLine ?? (
                <SourceLine
                  asOf={dateRange.end}
                  citation={citation}
                  coverage={
                    formatDate(dateRange.start) === formatDate(dateRange.end)
                      ? undefined
                      : `${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}`
                  }
                />
              ))}
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  chart: { gap: rhythm.heading, alignSelf: 'stretch' },
  voteSplit: {
    gap: rhythm.heading,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  voteSplitStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  split: {
    height: 8,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  splitInline: { flex: 1 },
  splitStacked: { alignSelf: 'stretch' },
  probes: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  probe: { alignSelf: 'flex-start', width: 10000 },
  horizontalTimeline: { marginBottom: rhythm.heading },
  verticalTimeline: { gap: rhythm.block },
  track: { position: 'absolute', top: 4, left: 5, right: 5, height: 2 },
  horizontalStage: { position: 'absolute', top: 0 },
  verticalStage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.heading,
  },
  dot: { width: 10, height: 10, borderRadius: 5, borderCurve: 'continuous' },
  stageWords: { gap: 4, marginTop: 8, flexShrink: 1 },
  verticalStageWords: { gap: 4, flexShrink: 1 },
  stageLabel: { fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  positionedLabel: { position: 'absolute', textAlign: 'center' },
  endCaption: { textAlign: 'right', alignSelf: 'flex-end' },
  barTarget: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    minHeight: 44,
    backgroundColor: 'transparent',
  },
  tableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: rhythm.row,
  },
  tableCell: { flex: 1 },
});
