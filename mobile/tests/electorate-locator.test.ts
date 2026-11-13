// Sweep 1 item 8: the state locator beside an electorate's outline, and the
// election row's result line. Public AEC and ABS data from the pinned release.
import * as c from '../src/api/catalogs';
import {
  insideState,
  locatorFor,
  projectToOutline,
} from '../src/features/electorate-map/locator';
import { winnerResult } from '../src/features/your-mp/election-summary';
import { index, pinned } from './pinned';

const detail = (name: string, jurisdiction = 'federal') => {
  const seat = index.electorates.find(
    (s) => s.name === name && s.jurisdiction === jurisdiction,
  )!;
  return {
    seat,
    view: c.electorateFor(c.decodeElectorate(pinned(seat.detail_url))),
  };
};

test('the projection puts known places in their states', () => {
  // Sydney, Melbourne, Alice Springs, Kalgoorlie, Hobart, Canberra.
  expect(insideState(projectToOutline([151.21, -33.87]), 'nsw')).toBe(true);
  expect(insideState(projectToOutline([144.96, -37.81]), 'vic')).toBe(true);
  expect(insideState(projectToOutline([133.88, -23.7]), 'nt')).toBe(true);
  expect(insideState(projectToOutline([121.47, -30.75]), 'wa')).toBe(true);
  expect(insideState(projectToOutline([147.33, -42.88]), 'tas')).toBe(true);
  expect(insideState(projectToOutline([149.13, -35.28]), 'act')).toBe(true);
  // And not in their neighbours.
  expect(insideState(projectToOutline([144.96, -37.81]), 'nsw')).toBe(false);
});

test.each([
  ['Grayndler', 'nsw'],
  ['Durack', 'wa'],
  ['Solomon', 'nt'],
  ['Clark', 'tas'],
  ['Canberra', 'act'],
])('%s: one dot inside %s, within the 72 pt box', (name, state) => {
  const { seat, view } = detail(name);
  expect(seat.state_code.toLowerCase()).toBe(state);
  const locator = locatorFor(view.boundaries, seat.state_code, 72)!;
  expect(locator).not.toBeNull();
  expect(Math.max(locator.width, locator.height)).toBeCloseTo(72, 5);
  const [x, y] = locator.dot;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThanOrEqual(locator.width);
  expect(y).toBeLessThanOrEqual(locator.height);
  // In the drawing's own units, the dot is on the state's land.
  expect(insideState(locator.at, state)).toBe(true);
});

test('every federal seat’s dot lies inside its state as drawn', () => {
  // Sample every federal seat in the pinned release: the dot always lands
  // on its own state.
  let checked = 0;
  const missed: string[] = [];
  for (const seat of index.electorates.filter(
    (s) => s.jurisdiction === 'federal' && s.chamber === 'representatives',
  )) {
    let raw: unknown;
    try {
      raw = pinned(seat.detail_url);
    } catch {
      continue; // Only the pinned release's sample of seats is on disk.
    }
    const view = c.electorateFor(c.decodeElectorate(raw));
    const locator = locatorFor(view.boundaries, seat.state_code, 72);
    if (!locator) continue;
    checked++;
    if (!insideState(locator.at, seat.state_code)) missed.push(seat.name);
  }
  expect(missed).toEqual([]);
  expect(checked).toBeGreaterThanOrEqual(5);
});

test('a seat that is nearly all of its state draws no locator', () => {
  const { seat, view } = detail('Lingiari');
  expect(locatorFor(view.boundaries, seat.state_code, 72)).toBeNull();
});

test('the result line is the winner’s share after preferences, only when the record carries it', () => {
  const { view } = detail('Grayndler');
  const records = view.elections
    .map((b) => b.data!)
    .filter(Boolean)
    .sort((a, b) => b.election.poll_date.localeCompare(a.election.poll_date));
  const newest = records[0]!;
  // 74,138 of 110,878 after preferences in 2025 (AEC).
  expect(winnerResult(newest)).toBe('66.9% after preferences');
  // No two-candidate counts: no line.
  const bare = {
    ...newest,
    candidates: newest.candidates.map((cand) => ({
      ...cand,
      votes: cand.votes.filter((v) => v.kind !== 'tcp'),
    })),
  };
  expect(winnerResult(bare)).toBeNull();
  // No single winner: no line.
  const none = {
    ...newest,
    candidates: newest.candidates.map((cand) => ({ ...cand, elected: false })),
  };
  expect(winnerResult(none)).toBeNull();
});
