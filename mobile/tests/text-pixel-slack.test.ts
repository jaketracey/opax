import { Platform } from 'react-native';
import { pixelSlack } from '../src/design/text';

// Why an iOS Text's frame could come out a pixel shorter than its lines, and
// why half a pixel of bottom padding stops it (T-mh, 15 Nov 2026).
//
// React Native ceils a text's measured height to whole pixels. Yoga then
// rounds each node to the pixel grid from its absolute position, and for a
// text node whose height is whole pixels it floors both edges
// (yoga/algorithm/PixelGrid.cpp). Layout values are 32-bit floats, and a
// third of a point is not exact: summed down the page, the bottom edge can
// land a hair under its pixel while the top lands on its own. The floor then
// takes a whole pixel off the frame, and TextKit drops the last line.
// This is Yoga's rounding, ported.

const inexact = (a: number, b: number) => Math.abs(a - b) < 0.0001;
function roundToPixelGrid(
  value: number,
  scale: number,
  forceCeil: boolean,
  forceFloor: boolean,
) {
  let scaled = value * scale;
  let fraction = scaled % 1;
  if (fraction < 0) fraction++;
  if (inexact(fraction, 0)) scaled -= fraction;
  else if (inexact(fraction, 1)) scaled = scaled - fraction + 1;
  else if (forceCeil) scaled = scaled - fraction + 1;
  else if (forceFloor) scaled -= fraction;
  else scaled = scaled - fraction + (fraction >= 0.5 ? 1 : 0);
  return Math.fround(scaled / scale);
}
/** A text node's rounded height, as roundLayoutResultsToPixelGrid sets it. */
function textFrameHeight(absoluteTop: number, height: number, scale: number) {
  const fractional = !inexact(Math.round(height * scale), height * scale);
  return (
    roundToPixelGrid(absoluteTop + height, scale, fractional, !fractional) -
    roundToPixelGrid(absoluteTop, scale, false, true)
  );
}
// A small deterministic generator: the same pages every run.
function sequence(seed: number) {
  let state = seed;
  return (below: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % below;
  };
}
/** Text nodes down a tall page: [absolute top, measured height]. */
function pages(scale: number, count: number) {
  const next = sequence(20261115);
  return Array.from({ length: count }, () => {
    let top = 0;
    // Each ancestor's own rounded position, stored as a 32-bit float.
    for (let depth = 2 + next(8); depth > 0; depth--)
      top += Math.fround(next(1500) / scale);
    top += Math.fround(next(3000) / scale);
    // RN's measure: a whole number of pixels.
    const height = Math.fround((20 + next(880)) / scale);
    return [top, height] as const;
  });
}

const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
beforeAll(() =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' }),
);
afterAll(() => Object.defineProperty(Platform, 'OS', descriptor));

test('at 3x, a whole-pixel text height can lose a pixel to rounding; at 2x it cannot', () => {
  const short = (scale: number) =>
    pages(scale, 50000).filter(
      ([top, height]) => textFrameHeight(top, height, scale) < height - 0.001,
    );
  const lost = short(3);
  expect(lost.length).toBeGreaterThan(0);
  // Always exactly one pixel: 141.333 pt framed as 141.
  for (const [top, height] of lost)
    expect(height - textFrameHeight(top, height, 3)).toBeCloseTo(1 / 3, 3);
  // Halves are exact in a 32-bit float.
  expect(short(2)).toHaveLength(0);
});

test.each([3, 2, 1])(
  'with the slack, no frame at %sx is shorter than its lines, and none is more than a pixel taller',
  (scale) => {
    const slack = pixelSlack(scale);
    expect(slack).toBeCloseTo(0.5 / scale, 9);
    for (const [top, height] of pages(scale, 50000)) {
      const frame = textFrameHeight(top, Math.fround(height + slack), scale);
      // The lines draw in the frame less its padding.
      const drawing = frame - slack;
      expect(drawing).toBeGreaterThanOrEqual(height - 0.001);
      expect(frame - height).toBeLessThanOrEqual(2 / scale + 0.001);
    }
  },
);

test('Android measures its own glyph bounds and takes no slack', () => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  expect(pixelSlack(3)).toBe(0);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
});
