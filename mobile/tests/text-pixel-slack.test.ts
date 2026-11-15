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
    // More than Yoga's tolerance for a whole pixel (a ten-thousandth).
    expect(slack * scale).toBeGreaterThan(0.001);
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

test('at a half, third or quarter-pixel top the frame is one pixel over its measure; half a pixel of slack made it two', () => {
  // A centred neighbour or a half-point margin puts a top edge between
  // pixels. Half a pixel of slack made such a frame two pixels over, and
  // Today's section header (which feeds its title's height back into a
  // margin) flipped between the two on every frame.
  for (const scale of [3, 2]) {
    const slack = pixelSlack(scale);
    const height = Math.fround(85 / scale); // a 28 pt section title at 3x
    for (const top of [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]) {
      const frame = textFrameHeight(
        (300 + top) / scale,
        Math.fround(height + slack),
        scale,
      );
      expect(Math.round(frame * scale)).toBe(Math.round(height * scale) + 1);
    }
    // What half a pixel did below a centred neighbour.
    expect(
      Math.round(
        textFrameHeight(
          (300 + 3 / 4) / scale,
          Math.fround(height + 0.5 / scale),
          scale,
        ) * scale,
      ),
    ).toBe(Math.round(height * scale) + 2);
  }
});

test("the reviewer's case: a title centred in a row whose height follows the title's own measured height has a fixed point", () => {
  // Today's compact section header, as Yoga lays it out at 3x: the row is
  // `alignItems: 'center'`, and the action's negative margin makes the row
  // as tall as the title height the header last measured. So the title sits
  // half the difference between that and its own unrounded height below the
  // row's top. Iterate the feedback as onLayout does.
  const scale = 3;
  const measured = Math.fround(85 / scale); // "Just declared", 28 pt
  const settle = (slack: number, damp: boolean) => {
    let titleHeight = 28;
    const seen: number[] = [];
    for (let pass = 0; pass < 12; pass++) {
      const own = Math.fround(measured + slack);
      // The row starts at half a pixel (an odd count of slacked Texts above).
      const top = (300.5 + ((titleHeight - own) * scale) / 2) / scale;
      const frame = textFrameHeight(top, own, scale);
      const next =
        damp && pass > 0 && Math.abs(frame - titleHeight) < 1
          ? titleHeight
          : frame;
      seen.push(Math.round(next * scale));
      titleHeight = next;
    }
    return seen;
  };
  // Half a pixel, fed back raw: 86 and 87 pixels, without end.
  const flipping = settle(0.5 / scale, false);
  expect(new Set(flipping.slice(-6))).toEqual(new Set([86, 87]));
  // No size of slack cures it: centring puts the top (1 - slack) / 2 of a
  // pixel down, and with the row's half pixel that is within the slack of
  // the next pixel, where the frame is two pixels over its measure.
  expect(new Set(settle(pixelSlack(scale), false).slice(-6))).toEqual(
    new Set([86, 87]),
  );
  // The header ignoring a change under a point is what gives a fixed point
  // (tests/section-header-feedback.test.tsx), at either slack.
  expect(new Set(settle(pixelSlack(scale), true).slice(-6)).size).toBe(1);
  expect(new Set(settle(0.5 / scale, true).slice(-6)).size).toBe(1);
});
