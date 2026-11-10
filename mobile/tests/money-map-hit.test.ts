import { HitGrid } from '../src/features/money/map/hit';

const grid = (discs: [number, number, number][], cell?: number) =>
  new HitGrid(
    discs.map((d) => d[0]),
    discs.map((d) => d[1]),
    discs.map((d) => d[2]),
    discs.keys(),
    cell,
  );

test('a point inside a disc picks it', () => {
  const g = grid([
    [0, 0, 10],
    [200, 0, 10],
  ]);
  expect(g.pick(3, -4, 0)).toBe(0);
  expect(g.pick(205, 2, 0)).toBe(1);
});

test('a point just outside the rim picks the disc when within slack, and not beyond it', () => {
  const g = grid([[0, 0, 10]]);
  expect(g.pick(14, 0, 5)).toBe(0);
  expect(g.pick(15, 0, 5)).toBe(0);
  expect(g.pick(15.01, 0, 5)).toBeNull();
  expect(g.pick(14, 0, 0)).toBeNull();
});

test('nothing near returns null, and an empty grid returns null', () => {
  const g = grid([[0, 0, 10]]);
  expect(g.pick(500, 500, 8)).toBeNull();
  expect(new HitGrid([], [], [], []).pick(0, 0, 100)).toBeNull();
});

test('of two discs in reach, the nearer rim wins, so a large disc beats a small one whose centre is closer', () => {
  // Point at x = 30: the small disc's centre is 10 away (rim 8 away), the
  // large disc's centre is 40 away but its rim is 5 away.
  const g = grid([
    [40, 0, 2],
    [-10, 0, 35],
  ]);
  expect(g.pick(30, 0, 12)).toBe(1);
  // Inside the small disc its own rim is nearer (negative distance).
  expect(g.pick(40, 0, 12)).toBe(0);
});

test('only discs the grid was given are pickable', () => {
  const x = [0, 100],
    y = [0, 0],
    r = [10, 10];
  const g = new HitGrid(x, y, r, [1]);
  expect(g.pick(0, 0, 4)).toBeNull();
  expect(g.pick(100, 0, 4)).toBe(1);
});

test('discs are found across cell boundaries, including negative cells', () => {
  const cell = 48;
  // A disc centred just over a cell line from the tap, both directions.
  const g = grid(
    [
      [cell + 1, cell + 1, 4],
      [-cell - 1, -1, 4],
      [-0.5, cell * 3 - 0.5, 4],
    ],
    cell,
  );
  expect(g.pick(cell - 1, cell - 1, 2)).toBe(0);
  expect(g.pick(-cell + 1, 1, 2)).toBe(1);
  expect(g.pick(0.5, cell * 3 + 0.5, 2)).toBe(2);
});

test('a large disc whose centre is several cells away is still picked at its rim', () => {
  // 70 is the largest party disc; its rim reaches well past one cell.
  const g = grid([[0, 0, 70]], 16);
  expect(g.pick(72, 0, 4)).toBe(0);
  expect(g.pick(0, -73, 4)).toBe(0);
});

test('a large slack (zoomed far out) reaches a disc many cells away', () => {
  const g = grid([[0, 0, 2]], 48);
  expect(g.pick(300, 0, 300)).toBe(0);
  expect(g.pick(300, 0, 200)).toBeNull();
});
