// T-ipad-width (build 81): on a 13-inch iPad, Today's daily pair sat in the
// spread's 374 pt trailing column, but its grid sized its first frame for
// the whole 968 pt page (two 478 pt cards), then again once it had measured
// itself. The cards' text was measured for one width and drawn at another,
// a whole line short. The spread's columns now hand their width down, so a
// grid inside is its final size in its first frame.
import { act, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  ColumnWidth,
  Grid,
  RegionProvider,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { SurfaceGrid } from '../src/features/today/SurfaceGrid';
import { TodayBody, todaySpreadWidths } from '../src/features/today/TodayBody';
import type { TodayOrder, TodaySlot } from '../src/features/today/order';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: true } },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));

// iPad Pro 13 in portrait: a 1032 pt window, a 968 pt page inside its margins.
const page = { width: 968, height: 1300 };
const [leadWidth, trailWidth] = todaySpreadWidths(page.width, 32, false);

const order = {
  slots: ['edition', 'pair', 'foot'],
} as unknown as TodayOrder;
function slot(name: TodaySlot): ReactNode {
  if (name === 'edition') return <View key={name} testID="edition" />;
  if (name === 'foot') return <View key={name} testID="foot" />;
  // The daily pair's own grid: two cards, a 12 pt gap (DailyPair).
  return (
    <SurfaceGrid key={name} testID="pair-grid" gap={12}>
      <View testID="card-a" />
      <View testID="card-b" />
    </SurfaceGrid>
  );
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(node: ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <RegionProvider value={page}>{node}</RegionProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}
beforeEach(() => {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 1032, height: 1376, scale: 2, fontScale: 1 });
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  jest.restoreAllMocks();
});

/** The innermost view with the id: the grid itself, inside any wrapper. */
const host = (root: ReactTestInstance, id: string) =>
  root
    .findAll((n) => typeof n.type === 'string' && n.props.testID === id)
    .at(-1)!;
/** The fixed widths the grid gives its cells: none in a single column. */
const cellWidths = (grid: ReactTestInstance) =>
  (grid.children as ReactTestInstance[]).map(
    (cell) => StyleSheet.flatten(cell.props.style)?.width ?? null,
  );
/** The grid measures itself, as Yoga will lay it out. */
const layOut = (grid: ReactTestInstance, width: number) =>
  act(() =>
    grid.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 400 } },
    }),
  );

test('the spread is 3:2 with a 32 pt gap, or even halves', () => {
  expect([leadWidth, trailWidth]).toEqual([561.6, 374.4]);
  expect(leadWidth + trailWidth + 32).toBeCloseTo(page.width, 6);
  expect(todaySpreadWidths(968, 32, true)).toEqual([468, 468]);
  expect(todaySpreadWidths(20, 32, false)).toEqual([0, 0]);
});

test('the daily pair in the trailing column is its final size in its first frame', () => {
  const tree = render(<TodayBody order={order} slot={slot} />);
  expect(host(tree.root, 'today-spread-trailing')).toBeDefined();
  const grid = host(tree.root, 'pair-grid');
  // The first frame, before anything is measured: one column, no card
  // wider than the column it is in (they were 478 pt in 374 pt).
  const first = JSON.stringify(tree.toJSON());
  expect(cellWidths(grid)).toEqual([null, null]);
  for (const width of cellWidths(grid))
    expect(Number(width ?? 0)).toBeLessThanOrEqual(trailWidth);
  // Measured, nothing changes: the first frame was already right.
  layOut(host(tree.root, 'pair-grid'), trailWidth);
  expect(JSON.stringify(tree.toJSON())).toBe(first);
});

test('a grid in the leading column starts from that column’s width too', () => {
  // A wide enough leading column keeps two columns, sized for 561.6 pt.
  const tree = render(
    <TodayBody
      order={order}
      slot={(name) =>
        name === 'edition' ? (
          <Grid key={name} testID="lead-grid" gap={12} minItemWidth={200}>
            <View />
            <View />
          </Grid>
        ) : (
          slot(name)
        )
      }
    />,
  );
  const grid = host(tree.root, 'lead-grid');
  const first = JSON.stringify(tree.toJSON());
  for (const width of cellWidths(grid))
    expect(Number(width ?? 0)).toBeLessThanOrEqual(leadWidth / 2);
  layOut(host(tree.root, 'lead-grid'), leadWidth);
  expect(JSON.stringify(tree.toJSON())).toBe(first);
});

test('a grid inside a grid’s cell starts from the cell’s width', () => {
  const tree = render(
    <Grid testID="outer" gap={16} minItemWidth={300}>
      <Grid testID="inner" gap={16} minItemWidth={300}>
        <View />
        <View />
      </Grid>
      <View />
    </Grid>,
  );
  // 968 pt: two 476 pt cells. The inner grid has one column in 476 pt, not
  // the two it would draw for the whole page.
  expect(cellWidths(host(tree.root, 'outer'))).toEqual([476, 476]);
  expect(cellWidths(host(tree.root, 'inner'))).toEqual([null, null]);
});

test('a measured region inside a column outranks the column', () => {
  // A 374 pt column holding a region measured at 900 pt (a pane, a screen):
  // the grid inside starts from the region, two 444 pt cells, not from the
  // column, where it would draw one.
  const tree = render(
    <ColumnWidth width={374}>
      <Grid testID="in-column" gap={12}>
        <View />
        <View />
      </Grid>
      <RegionProvider value={{ width: 900, height: 700 }}>
        <Grid testID="in-region" gap={12}>
          <View />
          <View />
        </Grid>
      </RegionProvider>
      {/* No measure yet: the column still stands. */}
      <RegionProvider value={null}>
        <Grid testID="unmeasured" gap={12}>
          <View />
          <View />
        </Grid>
      </RegionProvider>
    </ColumnWidth>,
  );
  expect(cellWidths(host(tree.root, 'in-column'))).toEqual([null, null]);
  expect(cellWidths(host(tree.root, 'in-region'))).toEqual([444, 444]);
  expect(cellWidths(host(tree.root, 'unmeasured'))).toEqual([null, null]);
});

test('outside any column a grid still starts from its region, as before', () => {
  const tree = render(
    <Grid testID="plain" gap={12}>
      <View />
      <View />
    </Grid>,
  );
  expect(cellWidths(host(tree.root, 'plain'))).toEqual([478, 478]);
});
