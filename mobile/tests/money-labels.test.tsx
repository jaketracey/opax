import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text } from '../src/design/primitives';
import {
  MoneyMapLabels,
  moneyLabelGroups,
} from '../src/features/money/MoneyMapLabels';
import type { MoneyGraph } from '../src/features/money/data';

const mockLabelUnmounted = jest.fn();
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
