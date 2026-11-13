/* eslint-disable @typescript-eslint/no-require-imports -- Skia test doubles render only inert host views. */
import { Rect } from '@shopify/react-native-skia';
import { act, type ReactElement } from 'react';
import * as RN from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  BarSeries,
  latestBarCaption,
  StageTimeline,
  VoteSplit,
} from '../src/design/charts';
import { Button } from '../src/design/controls';
import { light } from '../src/design/palette';
import { SourceLine } from '../src/design/source';
import { Text } from '../src/design/text';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: require('react-native').View,
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
const proof = {
  dateRange: { start: '2026-10-01', end: '2026-11-07' },
  citation: 'ParlInfo',
};
const data = [
  { label: 'October', value: 5 },
  { label: 'November', value: 10 },
];
let mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(element);
  });
  mounted.push(r);
  return r;
}
beforeEach(() => {
  act(() =>
    RN.Dimensions.set({
      window: {
        ...RN.Dimensions.get('window'),
        width: 375,
        height: 812,
        scale: 3,
        fontScale: 1,
      },
    }),
  );
});
afterEach(() => {
  act(() => mounted.forEach((r) => r.unmount()));
  mounted = [];
  jest.restoreAllMocks();
});

test('chart accessibility elements survive a Dynamic Type change', () => {
  const r = render(
    <>
      <StageTimeline
        {...proof}
        stages={[
          { label: 'Introduced', date: '1 Oct 2026' },
          { label: 'Passed', date: '7 Nov 2026' },
        ]}
        latestIndex={1}
      />
      <BarSeries
        {...proof}
        data={data}
        ink="ink"
        format={String}
        tableTitle="Monthly totals"
      />
    </>,
  );
  const elements = () =>
    r.root.findAll(
      (node) =>
        node.type === RN.View &&
        node.props.accessible === true &&
        /Introduced|Passed|October, 5|November, 10/.test(
          node.props.accessibilityLabel ?? '',
        ),
    );
  const before = elements();
  expect(before).toHaveLength(4);
  act(() =>
    RN.Dimensions.set({
      window: { ...RN.Dimensions.get('window'), fontScale: 3.571 },
    }),
  );
  elements().forEach((node, index) => expect(node).toBe(before[index]));
});

test.each(['default', 'spark'] as const)(
  'BarSeries %s has the requested geometry and table presentation',
  (variant) => {
    const r = render(
      <BarSeries
        {...proof}
        data={data}
        ink="ink"
        format={String}
        tableTitle="Monthly totals"
        variant={variant}
      />,
    );
    const plot = r.root.findByProps({ testID: 'bar-series-plot' });
    expect(RN.StyleSheet.flatten(plot.props.style).height).toBe(
      variant === 'spark' ? 24 : 160,
    );
    act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
    expect(
      r.root
        .findAllByType(Rect)
        .filter((rect) => rect.props.height > 1)
        .map((rect) => rect.props.height),
    ).toEqual(variant === 'spark' ? [12, 24] : [80, 160]);
    expect(r.root.findAllByType(Button)).toHaveLength(
      variant === 'spark' ? 0 : 1,
    );
    expect(r.root.findAllByType(SourceLine)).toHaveLength(
      variant === 'spark' ? 0 : 1,
    );
    if (variant === 'default') {
      act(() => r.root.findByType(Button).props.onPress());
      expect(r.root.findByType(Button).props.label).toBe('Show as chart');
      expect(
        r.root
          .findAllByType(Text)
          .some((node) => node.props.children === 'October'),
      ).toBe(true);
    } else {
      const summary = r.root.findAll((node) =>
        node.props.accessibilityLabel?.includes('ParlInfo'),
      );
      expect(summary.length).toBeGreaterThan(0);
    }
  },
);
test.each([false, true])(
  'onShowTable=%s controls the table action and visible button',
  (enabled) => {
    const show = jest.fn();
    const r = render(
      <BarSeries
        {...proof}
        data={data}
        ink="votes"
        format={String}
        tableTitle="Decades"
        onShowTable={enabled ? show : undefined}
      />,
    );
    const root = r.root.findByProps({ testID: 'bar-series-content' });
    expect(root.props.accessibilityActions).toEqual(
      enabled ? [{ name: 'showTable', label: 'Show as table' }] : undefined,
    );
    const accessibleBar = r.root
      .findAllByType(RN.View)
      .find((node) => node.props.accessibilityLabel === 'October, 5')!;
    expect(accessibleBar.props.accessibilityActions).toEqual(
      enabled ? [{ name: 'showTable', label: 'Show as table' }] : undefined,
    );
    expect(r.root.findByType(Button).props.label).toBe('Show as table');
    if (enabled) {
      act(() =>
        root.props.onAccessibilityAction({
          nativeEvent: { actionName: 'showTable' },
        }),
      );
      expect(show).toHaveBeenCalledTimes(1);
      act(() => r.root.findByType(Button).props.onPress());
      expect(show).toHaveBeenCalledTimes(2);
    }
  },
);
test.each([false, true])(
  'bars are interactive only with explicit onSelect=%s',
  (interactive) => {
    const select = jest.fn();
    const r = render(
      <BarSeries
        {...proof}
        data={data}
        ink="votes"
        format={String}
        tableTitle="Decades"
        selectedIndex={interactive ? 1 : undefined}
        onSelect={interactive ? select : undefined}
      />,
    );
    const bars = r.root.findAll(
      (node) =>
        typeof node.type !== 'string' &&
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === 'November, 10',
    );
    expect(bars.length > 0).toBe(interactive);
    if (interactive) {
      act(() => bars[0]!.props.onPress());
      expect(select).toHaveBeenCalledWith(1);
    }
  },
);
test('empty and all-zero series have finite zero-height bars', () => {
  for (const rows of [[], [{ label: 'None', value: 0 }]]) {
    const r = render(
      <BarSeries
        {...proof}
        data={rows}
        ink="ink"
        format={String}
        tableTitle="Totals"
        variant="spark"
      />,
    );
    const plot = r.root.findByProps({ testID: 'bar-series-plot' });
    act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
    expect(
      r.root
        .findAllByType(Rect)
        .every(
          (rect) =>
            rect.props.height === 0 && Number.isFinite(rect.props.width),
        ),
    ).toBe(true);
  }
});
test.each([false, true])(
  'VoteSplit onBand=%s says counts and provenance without interactive bars',
  (onBand) => {
    const r = render(
      <VoteSplit
        {...proof}
        ayes={76}
        noes={55}
        countsStyle="votes"
        onBand={onBand}
      />,
    );
    expect(
      r.root.findAll((node) =>
        node.props.accessibilityLabel?.startsWith('76 votes to 55.'),
      ).length,
    ).toBeGreaterThan(0);
    expect(r.root.findByType(Text).props.tone).toBe(onBand ? 'onBand' : 'ink');
    expect(r.root.findAllByType(RN.Pressable)).toHaveLength(0);
  },
);
test('VoteSplit draws no invented ayes for a zero-total division', () => {
  const r = render(
    <VoteSplit {...proof} ayes={0} noes={0} countsStyle="ayesNoes" />,
  );
  expect(
    r.root
      .findAllByType(RN.View)
      .some((node) => RN.StyleSheet.flatten(node.props.style)?.width === '0%'),
  ).toBe(true);
});
const stages = [
  { label: 'Introduced', date: '1 Oct' },
  { label: 'Senate', date: '2 Nov' },
  { label: 'Royal Assent', date: '7 Nov' },
];
function timeline(
  width: number,
  labelWidth: number,
  scale = 1,
  labelHeight = 18,
) {
  act(() =>
    RN.Dimensions.set({
      window: {
        ...RN.Dimensions.get('window'),
        width: 375,
        height: 812,
        scale: 3,
        fontScale: scale,
      },
    }),
  );
  const r = render(
    <StageTimeline {...proof} stages={stages} latestIndex={2} />,
  );
  const container = r.root.findByProps({ testID: 'stage-timeline-content' });
  act(() => container.props.onLayout({ nativeEvent: { layout: { width } } }));
  act(() =>
    r.root
      .findAllByType(Text)
      .filter((text) => text.props.onTextLayout)
      .forEach((text) =>
        text.props.onTextLayout({
          nativeEvent: { lines: [{ width: labelWidth, height: labelHeight }] },
        }),
      ),
  );
  return r;
}
test.each([false, true])(
  'measured label overflow=%s decides vertical layout',
  (overflow) => {
    const r = timeline(320, overflow ? 180 : 70);
    const layout = RN.StyleSheet.flatten(
      r.root.findByProps({ testID: 'stage-timeline' }).props.style,
    );
    expect(layout.height).toBe(overflow ? undefined : 58);
    if (!overflow) {
      const horizontal = r.root.findByProps({ testID: 'stage-timeline' });
      const stageViews = horizontal.findAll(
        (node) =>
          typeof node.type !== 'string' &&
          node.props.accessible &&
          node.props.accessibilityLabel?.includes('latest stage'),
      );
      expect(stageViews).toHaveLength(1);
      const first = horizontal
        .findAllByType(RN.View)
        .find((node) => node.props.accessibilityLabel === 'Introduced, 1 Oct')!;
      const last = horizontal
        .findAllByType(RN.View)
        .find(
          (node) =>
            node.props.accessibilityLabel ===
            'Royal Assent, 7 Nov, latest stage',
        )!;
      expect(RN.StyleSheet.flatten(first.props.style).left).toBe(0);
      expect(RN.StyleSheet.flatten(last.props.style).left).toBe(310);
    }
  },
);
test('AX labels are vertical even when the measured strings would fit', () => {
  const r = timeline(320, 30, 2.143);
  expect(
    RN.StyleSheet.flatten(
      r.root.findByProps({ testID: 'stage-timeline' }).props.style,
    ).height,
  ).toBeUndefined();
});
test('a selected series uses navy instead of a party colour', () => {
  const r = render(
    <BarSeries
      {...proof}
      data={data}
      ink="votes"
      format={String}
      tableTitle="Decades"
      selectedIndex={1}
      onSelect={() => {}}
    />,
  );
  // Nothing is drawn until the plot has a width: Skia never gets an empty box.
  expect(r.root.findAllByType(Rect)).toHaveLength(0);
  const plot = r.root.findByProps({ testID: 'bar-series-plot' });
  act(() => plot.props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
  expect(r.root.findAllByType(Rect).at(-1)!.props.color).toBe(light.navy);
});

test.each([1, 1.786])(
  'VoteSplit counts sit beside the bar, or beneath at font scale %s',
  (fontScale) => {
    act(() =>
      RN.Dimensions.set({
        window: { ...RN.Dimensions.get('window'), fontScale },
      }),
    );
    const r = render(
      <VoteSplit {...proof} ayes={40} noes={0} countsStyle="votes" />,
    );
    expect(
      RN.StyleSheet.flatten(r.root.findByType(RN.View).props.style)
        .flexDirection,
    ).toBe(fontScale === 1 ? 'row' : 'column');
    expect(r.root.findByType(Text).props).toMatchObject({
      variant: 'secondary',
      tabular: true,
      children: '40 votes to 0',
    });
  },
);
test.each([
  [0, 25, '25 noes'],
  [25, 0, '25 ayes'],
  [1, 1, '1 aye, 1 no'],
  [0, 0, 'No votes'],
])('VoteSplit ayesNoes %s/%s leaves zero sides out', (ayes, noes, words) => {
  const r = render(
    <VoteSplit
      {...proof}
      ayes={ayes as number}
      noes={noes as number}
      countsStyle="ayesNoes"
    />,
  );
  expect(r.root.findByType(Text).props.children).toBe(words);
});
test('StageTimeline height follows measured label heights below AX1', () => {
  const r = timeline(320, 70, 1.353, 18);
  const height = () =>
    RN.StyleSheet.flatten(
      r.root.findByProps({ testID: 'stage-timeline' }).props.style,
    ).height;
  expect(height()).toBe(58);
  act(() =>
    r.root
      .findAllByType(Text)
      .filter((text) => text.props.onTextLayout)
      .forEach((text) =>
        text.props.onTextLayout({
          nativeEvent: { lines: [{ width: 70, height: 40 }] },
        }),
      ),
  );
  expect(height()).toBe(102);
  expect(
    r.root.findAllByType(RN.View).some((node) => {
      const style = RN.StyleSheet.flatten(node.props.style);
      return style?.width === 10 && style?.height === 10;
    }),
  ).toBe(true);
  expect(
    r.root
      .findAllByType(Text)
      .filter((text) => text.props.children === 'Introduced')
      .every(
        (text) => RN.StyleSheet.flatten(text.props.style).fontWeight === '600',
      ),
  ).toBe(true);
});
const dense = Array.from({ length: 15 }, (_, index) => ({
  label: String(2000 + index),
  value: index + 1,
}));
function measureSeries(
  r: TestRenderer.ReactTestRenderer,
  labelWidth = 40,
  valueWidth = 20,
) {
  act(() =>
    r.root
      .findByProps({ testID: 'bar-series-plot' })
      .props.onLayout({ nativeEvent: { layout: { width: 335 } } }),
  );
  act(() =>
    r.root
      .findAllByType(Text)
      .filter((text) => text.props.onTextLayout)
      .forEach((text) =>
        text.props.onTextLayout({
          nativeEvent: {
            lines: [
              {
                width: text.props.tabular ? valueWidth : labelWidth,
                height: 18,
              },
            ],
          },
        }),
      ),
  );
}
test.each([undefined, { every: 3 }])(
  'BarSeries labels=%j thins measured x labels and retains every accessible bar',
  (labels) => {
    const r = render(
      <BarSeries
        {...proof}
        data={dense}
        ink="ink"
        format={String}
        tableTitle="Years"
        labels={labels}
      />,
    );
    measureSeries(r, 30);
    const texts = r.root
      .findByProps({ testID: 'bar-series-axis' })
      .findAllByType(Text);
    if (labels)
      expect(texts.map((text) => text.props.children)).toEqual([
        '2000',
        '2003',
        '2006',
        '2009',
        '2012',
      ]);
    else expect(texts.length).toBeLessThan(15);
    const bounds = texts.map((text) => RN.StyleSheet.flatten(text.props.style));
    expect(
      bounds.every(
        (box, index) =>
          box.width >= 30 &&
          box.left >= 0 &&
          box.left + box.width <= 335 &&
          (!index ||
            box.left >= bounds[index - 1]!.left + bounds[index - 1]!.width),
      ),
    ).toBe(true);
    expect(texts.every((text) => text.props.numberOfLines === undefined)).toBe(
      true,
    );
    const targets = r.root
      .findAllByType(RN.View)
      .filter((node) => node.props.accessibilityLabel?.match(/^20\d\d, /));
    expect(
      new Set(targets.map((node) => node.props.accessibilityLabel)).size,
    ).toBe(15);
    expect(
      targets.every(
        (node) =>
          RN.StyleSheet.flatten(node.props.style).minHeight === 44 &&
          !node.props.children,
      ),
    ).toBe(true);
  },
);
test('BarSeries thins again when measured AX labels grow', () => {
  const r = render(
    <BarSeries
      {...proof}
      data={dense}
      ink="ink"
      format={String}
      tableTitle="Years"
    />,
  );
  measureSeries(r, 30);
  const count = r.root
    .findByProps({ testID: 'bar-series-axis' })
    .findAllByType(Text).length;
  measureSeries(r, 120);
  expect(
    r.root.findByProps({ testID: 'bar-series-axis' }).findAllByType(Text)
      .length,
  ).toBeLessThan(count);
});
test.each([undefined, 'latest', 'all', 'none'] as const)(
  'BarSeries values=%s controls visible values without squeezing columns',
  (values) => {
    const r = render(
      <BarSeries
        {...proof}
        data={dense}
        ink="ink"
        format={String}
        tableTitle="Years"
        values={values}
      />,
    );
    measureSeries(r, 30, 60);
    const bands = r.root.findAllByProps({ testID: 'bar-series-values' });
    expect(bands).toHaveLength(0);
    const caption = r.root
      .findAllByType(Text)
      .find((text) => text.props.testID === 'bar-series-caption')!;
    expect(caption.props.children).toBe(`${dense.at(-1)!.label}: 15`);
    const maximum = r.root
      .findAllByType(Text)
      .find((text) => text.props.testID === 'bar-series-scale-1')!;
    const half = r.root
      .findAllByType(Text)
      .find((text) => text.props.testID === 'bar-series-scale-0.5')!;
    expect(maximum.props).toMatchObject({
      children: '15',
      variant: 'footnote',
      tabular: true,
      tone: 'inkSoft',
    });
    expect(half.props.children).toBe('7.5');
    expect(RN.StyleSheet.flatten(maximum.props.style).textAlign).toBe('right');
  },
);
test.each([undefined, 200])(
  'BarSeries height=%s controls only the plot height',
  (height) => {
    const r = render(
      <BarSeries
        {...proof}
        data={dense}
        ink="ink"
        format={String}
        tableTitle="Years"
        height={height}
      />,
    );
    expect(
      RN.StyleSheet.flatten(
        r.root.findByProps({ testID: 'bar-series-plot' }).props.style,
      ).height,
    ).toBe(height ?? 160);
  },
);
test('the inline table has a visible heading and a matching Show as chart spoken action', () => {
  const r = render(
    <BarSeries
      {...proof}
      data={data}
      ink="ink"
      format={String}
      tableTitle="Monthly totals"
    />,
  );
  act(() => r.root.findByType(Button).props.onPress());
  expect(r.root.findByType(Button).props).toMatchObject({
    label: 'Show as chart',
    accessibilityLabel: 'Show as chart',
  });
  const heading = r.root
    .findAllByType(Text)
    .find((text) => text.props.accessibilityRole === 'header');
  expect(heading?.props).toMatchObject({
    variant: 'subsectionTitle',
    children: 'Monthly totals',
  });
});

test('a partial financial year is dated by its source, and a completed year has no invented qualifier', () => {
  expect(latestBarCaption('2025–26', '$290k', '2026-03-12')).toBe(
    '2025–26 so far: $290k',
  );
  expect(latestBarCaption('2025–26', '$290k', '2026-06-30')).toBe(
    '2025–26: $290k',
  );
  expect(latestBarCaption('2025–26', '$290k', '2026-11-12')).toBe(
    '2025–26: $290k',
  );
});
test('BarSeries scaleGutter keeps every scale value in its own column, clear of every bar', () => {
  const r = render(
    <BarSeries
      {...proof}
      data={dense}
      ink="ink"
      format={String}
      tableTitle="Years"
      scaleGutter
    />,
  );
  // A wide value, as at the largest text sizes.
  measureSeries(r, 30, 90);
  const scales = ['bar-series-scale-1', 'bar-series-scale-0.5'].map((testID) =>
    RN.StyleSheet.flatten(r.root.findByProps({ testID }).props.style),
  );
  const bars = r.root
    .findAllByType('Rect' as never)
    .map((rect) => rect.props as { x: number; width: number; height: number })
    .filter((rect) => rect.height > 1);
  expect(bars).toHaveLength(dense.length);
  for (const scale of scales) {
    expect(scale.left).toBe(0);
    expect(scale.width).toBeGreaterThanOrEqual(90);
    for (const bar of bars)
      expect(bar.x).toBeGreaterThan(scale.left + scale.width);
  }
  expect(Math.max(...bars.map((bar) => bar.x + bar.width))).toBeLessThan(335);
});
test('BarSeries partialFrom draws the unfinished year lighter and says "so far" beside it', () => {
  const r = render(
    <BarSeries
      {...proof}
      data={dense}
      ink="ink"
      format={String}
      tableTitle="Years"
      partialFrom={dense.length - 1}
    />,
  );
  measureSeries(r);
  const bars = r.root
    .findAllByType('Rect' as never)
    .filter((rect) => rect.props.height > 1);
  expect(bars.at(-1)!.props.opacity).toBe(0.4);
  expect(bars.at(-2)!.props.opacity).toBe(1);
  const caption = r.root
    .findAllByType(Text)
    .find((text) => text.props.testID === 'bar-series-caption')!;
  expect(caption.props.children).toBe('2014 so far: 15');
  expect(RN.StyleSheet.flatten(caption.props.style)).toMatchObject({
    alignSelf: 'flex-end',
    textAlign: 'right',
  });
  expect(
    r.root.findAllByProps({ accessibilityLabel: '2014 so far, 15' }).length,
  ).toBeGreaterThan(0);
});
