/* eslint-disable @typescript-eslint/no-require-imports -- Skia test doubles render only inert host views. */
import { act, type ReactElement } from 'react';
import * as RN from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Rect } from '@shopify/react-native-skia';
import { BarSeries, StageTimeline, VoteSplit } from '../src/design/charts';
import { Button } from '../src/design/controls';
import { Text } from '../src/design/text';
import { SourceLine } from '../src/design/source';
import { light } from '../src/design/palette';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: require('react-native').View,
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
const proof = {
  dateRange: { start: '2026-10-01', end: '2026-11-07' },
  source: 'ParlInfo',
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
      expect(r.root.findByType(Button).props.label).toBe('Hide table');
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
    const root = r.root.findByType(BarSeries).findByType(RN.View);
    expect(root.props.accessibilityActions).toEqual(
      enabled ? [{ name: 'showTable', label: 'Show as table' }] : undefined,
    );
    const accessibleBar = r.root
      .findAllByType(RN.View)
      .find((node) => node.props.accessibilityLabel === 'October, 5')!;
    expect(accessibleBar.props.accessibilityActions).toEqual(
      enabled ? [{ name: 'showTable', label: 'Show as table' }] : undefined,
    );
    expect(r.root.findByType(Button).props.label).toBe(
      enabled ? 'Table' : 'Show as table',
    );
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
function timeline(width: number, labelWidth: number, scale = 1) {
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
  const container = r.root.findByType(StageTimeline).findByType(RN.View);
  act(() => container.props.onLayout({ nativeEvent: { layout: { width } } }));
  act(() =>
    r.root
      .findAllByType(Text)
      .filter((text) => text.props.onTextLayout)
      .forEach((text) =>
        text.props.onTextLayout({
          nativeEvent: { lines: [{ width: labelWidth }] },
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
    expect(layout.minHeight).toBe(overflow ? undefined : 72);
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
      expect(RN.StyleSheet.flatten(last.props.style).left).toBe(312);
    }
  },
);
test('AX labels are vertical even when the measured strings would fit', () => {
  const r = timeline(320, 30, 2.143);
  expect(
    RN.StyleSheet.flatten(
      r.root.findByProps({ testID: 'stage-timeline' }).props.style,
    ).minHeight,
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
    />,
  );
  expect(r.root.findAllByType(Rect).at(-1)!.props.color).toBe(light.navy);
});
