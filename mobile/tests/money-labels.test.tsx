import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text } from '../src/design/primitives';
import {
  MoneyMapLabels,
  moneyLabelGroups,
  moneyLabelParties,
} from '../src/features/money/MoneyMapLabels';
import type { MoneyGraph } from '../src/features/money/data';
import {
  CLUSTER_COLOURS,
  SURFACE,
  clusterColour,
  nodeColour,
} from '../src/features/money/ported/palette';
import { chartIndustry, light } from '../src/design/tokens';

const mockLabelUnmounted = jest.fn();
jest.mock('../src/design/tokens', () => ({
  ...jest.requireActual('../src/design/tokens'),
  colors: { ink: 'ink-role' },
}));
jest.mock('../src/design/primitives', () => ({
  Text: jest.fn(({ children, ...props }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const Native =
      jest.requireActual<typeof import('react-native')>('react-native');
    React.useEffect(() => () => mockLabelUnmounted(), []);
    return React.createElement(Native.Text, props, children);
  }),
}));

test('orbit and occlusion retain native text without painting it again', () => {
  const paint = Text as jest.MockedFunction<typeof Text>;
  paint.mockClear();
  mockLabelUnmounted.mockClear();
  const groups = ['unions', 'other'];
  const point = {
    id: 'unions',
    label: 'unions',
    x: 100,
    y: 40,
    kind: 'group' as const,
    ink: '#000000',
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <MoneyMapLabels groups={groups} labels={[point]} width={350} />,
    );
  });
  const paints = paint.mock.calls.length;
  for (let frame = 0; frame < 20; frame++) {
    act(() =>
      renderer.update(
        <MoneyMapLabels
          groups={groups}
          labels={
            frame % 3 ? [{ ...point, x: 100 + frame * 3, y: 40 + frame }] : []
          }
          width={350}
        />,
      ),
    );
  }
  expect(paint.mock.calls.length).toBe(paints);
  expect(mockLabelUnmounted).not.toHaveBeenCalled();
  // The fixed pool belongs to this screen and is released with it.
  act(() => renderer.unmount());
  expect(mockLabelUnmounted).toHaveBeenCalledTimes(paints);
});

test('the label inventory includes grantors and excludes the central party group', () => {
  const graph: MoneyGraph = {
    meta: {
      generated: '2026-10-06',
      coverage: 'Synthetic',
      source: 'Synthetic',
    },
    edges: [],
    nodes: [
      ['donor-a', 'donor', 'unions'],
      ['donor-b', 'donor', 'unions'],
      ['agency', 'grantor', 'government'],
      ['party', 'party', 'parties'],
    ].map(([id, kind, group]) => ({
      id: id!,
      label: id!,
      kind: kind!,
      group: group!,
      industry: group!,
      total: 0,
      count: 0,
      firstYear: null,
      lastYear: null,
    })),
  };
  expect(moneyLabelGroups(graph)).toEqual(['unions', 'public money']);
});

const synthetic = (nodes: [string, string, string, number?][]): MoneyGraph => ({
  meta: { generated: '2026-10-06', coverage: 'Synthetic', source: 'Synthetic' },
  edges: [],
  nodes: nodes.map(([id, kind, group, total = 0]) => ({
    id,
    label: id,
    kind,
    group,
    industry: group,
    total,
    count: 0,
    firstYear: null,
    lastYear: null,
  })),
});

test('parties are named beside their nodes in the ink role, apart from the focus', () => {
  const graph = synthetic([
    ['donor-a', 'donor', 'unions'],
    ['party:Labor', 'party', 'parties', 9],
    ['party:Greens', 'party', 'parties', 3],
  ]);
  const parties = moneyLabelParties(graph);
  expect(parties).toEqual([
    { id: 'party:Labor', label: 'party:Labor' },
    { id: 'party:Greens', label: 'party:Greens' },
  ]);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <MoneyMapLabels
        groups={['unions']}
        parties={parties}
        labels={[
          { id: 'party:Labor', label: 'Labor', x: 50, y: 20, kind: 'party' },
          { id: 'donor-a', label: 'donor-a', x: 80, y: 60, kind: 'focus' },
        ]}
        width={350}
      />,
    );
  });
  const texts = renderer.root
    .findAllByType(Text)
    .map((t) => ({ text: t.props.children, colour: t.props.style.color }));
  // Party slots keep their names; the focus slot shows the selection.
  expect(texts).toContainEqual({ text: 'party:Labor', colour: 'ink-role' });
  expect(texts).toContainEqual({ text: 'donor-a', colour: 'ink-role' });
  expect(texts).toContainEqual({
    text: 'unions',
    colour: clusterColour('unions').ink,
  });
  act(() => renderer.unmount());
});

test('the industry hues come from the tokens; parties are one neutral grey', () => {
  expect([...CLUSTER_COLOURS]).toEqual(chartIndustry.map(([k, v]) => [k, v]));
  expect(SURFACE).toBe(light.paper);
  const grey = clusterColour('parties').colour;
  expect(
    nodeColour({ kind: 'party', group: 'parties', colour: '#D93025' }),
  ).toBe(grey);
  expect(nodeColour({ kind: 'donor', group: 'finance' })).toBe(
    clusterColour('finance').colour,
  );
  // A public-money hub keeps its own colour from the export.
  expect(
    nodeColour({ kind: 'grantor', group: 'government', colour: '#2A7F76' }),
  ).toBe('#2A7F76');
});
