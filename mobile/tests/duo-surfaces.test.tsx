import { act, type ReactNode } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Grid,
  RegionProvider,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { emptyReservedRegions, type ReservedRegions } from '../src/design/fold';
import { Text } from '../src/design/text';
import { ElectorateCard } from '../src/features/your-mp/ElectorateCard';
import { decodeElectorate, electorateFor } from '../src/api/catalogs';
import { index, pinned } from './pinned';
import { DailyPair } from '../src/features/today/DailyPair';
import { MoreToExplore } from '../src/features/today/MoreToExplore';
import { Masthead } from '../src/features/today/Masthead';

let mockWidth = 626;
let mockHeight = 800;
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, isPad: false } },
    useWindowDimensions: {
      value: () => ({
        width: mockWidth,
        height: mockHeight,
        scale: 2,
        fontScale: 1,
      }),
    },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Pass = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Link: Object.assign(Pass, {
      Trigger: Pass,
      Preview: () => null,
      Menu: Pass,
      MenuAction: Pass,
    }),
    Stack: { Screen: () => null },
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  };
});
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn(() => new Promise(() => {})) },
}));
const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
const compact: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: true,
};
const fold: ReservedRegions = {
  divisions: [{ x: 261, y: 0, width: 40, height: 800, active: true }],
  occlusions: [],
};
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(children: ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(children);
  });
  mounted.push(tree);
  return tree;
}
function surface(
  children: ReactNode,
  regions = emptyReservedRegions,
  width = 562,
) {
  return (
    <RegionProvider value={{ width, height: mockHeight }}>
      <ReservedRegionsProvider value={regions}>
        {children}
      </ReservedRegionsProvider>
    </RegionProvider>
  );
}
function native(tree: TestRenderer.ReactTestRenderer, id: string) {
  return tree.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
}
function cells(tree: TestRenderer.ReactTestRenderer, id: string) {
  return native(tree, id).children.filter(
    (child): child is ReactTestInstance => typeof child !== 'string',
  );
}
beforeEach(() => {
  mockWidth = 626;
  mockHeight = 800;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
    setWindowTraitsOverride(regular);
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});

describe('Today on Duo', () => {
  test.each(['today-pair-grid', 'today-explore-tiles'])(
    '%s has two equal columns at 626pt and clears the active fold',
    (id) => {
      const content =
        id === 'today-pair-grid' ? (
          <DailyPair today="2026-11-11" attempt={0} />
        ) : (
          <MoreToExplore />
        );
      const tree = render(surface(content));
      const initial = cells(tree, id).map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      );
      expect(new Set(initial).size).toBe(1);
      expect(initial[0]).toBeGreaterThan(250);
      expect(initial[0]).toBeLessThan(281);
      act(() => tree.update(surface(content, fold)));
      expect(StyleSheet.flatten(native(tree, id).props.style).columnGap).toBe(
        40,
      );
      for (const cell of cells(tree, id))
        expect(StyleSheet.flatten(cell.props.style).width).toBe(261);
      act(() =>
        tree.update(
          surface(content, {
            ...fold,
            divisions: [{ ...fold.divisions[0]!, active: false }],
          }),
        ),
      );
      expect(
        cells(tree, id).map(
          (cell) => StyleSheet.flatten(cell.props.style).width,
        ),
      ).toEqual(initial);
    },
  );
  test('320pt masthead and cards retain wrapping phone type and a scrollable stack', () => {
    mockWidth = 380;
    mockHeight = 560;
    act(() => setWindowTraitsOverride(compact));
    const tree = render(
      surface(
        <>
          <Masthead now={new Date('2026-11-11T00:00:00Z')} />
          <DailyPair today="2026-11-11" attempt={0} />
        </>,
        emptyReservedRegions,
        320,
      ),
    );
    expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    const date = tree.root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'today-screen-message')!;
    expect(date.props.numberOfLines).toBeUndefined();
    expect(date.props.variant).toBe('secondary');
  });
  test.each([320, 375, 390, 402, 414, 430, 440, 956])(
    'the phone rule at %spt retains the daily pair stack',
    (width) => {
      mockWidth = width;
      act(() =>
        setWindowTraitsOverride({
          horizontal: width === 956 ? 'regular' : 'compact',
          vertical: width === 956 ? 'compact' : 'regular',
          foldable: false,
        }),
      );
      const tree = render(
        surface(
          <DailyPair today="2026-11-11" attempt={0} />,
          emptyReservedRegions,
          width,
        ),
      );
      expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    },
  );
});

const seat = index.electorates.find((entry) => entry.name === 'Grayndler')!;
const electorate = electorateFor(decodeElectorate(pinned(seat.detail_url)));
describe('Your MP on Duo', () => {
  test('stat rows have two equal columns at 626pt, retaining the even split around a fold', () => {
    const card = <ElectorateCard seat={seat} view={electorate} />;
    const tree = render(surface(card));
    const initial = cells(tree, 'your-mp-stats-grid').map(
      (cell) => StyleSheet.flatten(cell.props.style).width,
    );
    expect(initial).toEqual([273, 273, 273]);
    // The grid is inside the card's own padding, measured independently.
    const grid = native(tree, 'your-mp-stats-grid');
    let bounds = grid.parent!;
    while (
      !bounds.props.onLayout ||
      bounds.props.testID === 'your-mp-stats-grid'
    )
      bounds = bounds.parent!;
    act(() =>
      bounds.props.onLayout({
        nativeEvent: { layout: { width: 530, height: 180 } },
      }),
    );
    act(() =>
      grid.props.onLayout({
        nativeEvent: { layout: { width: 530, height: 180 } },
      }),
    );
    expect(
      cells(tree, 'your-mp-stats-grid').map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      ),
    ).toEqual([257, 257, 257]);
    act(() =>
      tree.update(
        surface(card, {
          ...fold,
          divisions: [{ ...fold.divisions[0]!, x: 245 }],
        }),
      ),
    );
    expect(
      StyleSheet.flatten(native(tree, 'your-mp-stats-grid').props.style)
        .columnGap,
    ).toBe(40);
    expect(
      cells(tree, 'your-mp-stats-grid').map(
        (cell) => StyleSheet.flatten(cell.props.style).width,
      ),
    ).toEqual([245, 245, 245]);
  });
  test('at 320pt long figures and labels wrap in full without ellipses', () => {
    mockWidth = 380;
    mockHeight = 560;
    act(() => setWindowTraitsOverride(compact));
    const tree = render(
      surface(
        <ElectorateCard seat={seat} view={electorate} />,
        emptyReservedRegions,
        320,
      ),
    );
    expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    const figures = tree.root
      .findAllByType(Text)
      .filter((node) => node.props.variant === 'strong' && node.props.tabular);
    expect(figures).toHaveLength(3);
    for (const figure of figures) {
      const value = figure.props.children;
      const row = figure.parent!;
      act(() => {
        row.props.onLayout({
          nativeEvent: { layout: { width: 256, height: 44 } },
        });
        figure.props.onTextLayout({
          nativeEvent: { lines: [{ width: 220 }, { width: 80 }] },
        });
      });
      expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('column');
      expect(figure.props.children).toBe(value);
      expect(figure.props.numberOfLines).toBeUndefined();
      const label = row
        .findAllByType(Text)
        .find((node) => node.props.variant === 'body')!;
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.wordSafe).toBe(true);
    }
  });
  test.each([320, 375, 390, 402, 414, 430, 440, 956])(
    'phone rule at %spt retains the existing full-width stat rows',
    (width) => {
      mockWidth = width;
      act(() =>
        setWindowTraitsOverride({
          horizontal: width === 956 ? 'regular' : 'compact',
          vertical: width === 956 ? 'compact' : 'regular',
          foldable: false,
        }),
      );
      const tree = render(
        surface(
          <ElectorateCard seat={seat} view={electorate} />,
          emptyReservedRegions,
          width,
        ),
      );
      expect(tree.root.findAllByType(Grid)).toHaveLength(0);
    },
  );
});
