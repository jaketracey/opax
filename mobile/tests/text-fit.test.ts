import { LINE_HEIGHT_NUDGE } from '../src/design/text';
import { textStyles } from '../src/design/tokens';

// React Native ceils a text's measured height to the pixel grid and TextKit
// draws into exactly that height. The room left for the last line is the
// distance from the text's height up to the next pixel: zero means floating-
// point noise decides whether the last line is drawn (review round 2, the
// AX5 lead title).
function slack(
  lines: number,
  lineHeight: number,
  multiplier: number,
  scale: number,
) {
  const height = lines * lineHeight * multiplier;
  return Math.ceil(height * scale - 1e-9) / scale - height;
}

describe('text heights never land exactly on the pixel grid', () => {
  test('the device case: six 24pt subheading lines at AX5 on a 3x screen', () => {
    // Measured on the 17 Pro (iOS 26.5) at AX5: 62.22pt lines, 373.33pt frame.
    const multiplier = 62.2222222 / 24;
    expect(slack(6, 24, 70 / 27, 3)).toBeLessThan(1e-9);
    expect(Math.round(6 * 24 * multiplier * 3)).toBe(1120);
    expect(slack(6, 24 + LINE_HEIGHT_NUDGE, 70 / 27, 3)).toBeGreaterThan(0.01);
  });
  test('every role, 2x and 3x, every ratio of whole point sizes, up to 200 lines', () => {
    // UIFontMetrics multipliers are ratios of the whole-point Dynamic Type
    // sizes (the device case is 70/27). With a 1/997 nudge, a total can only
    // land on the grid when 997 divides the line count, so never below 997.
    const multipliers = new Set<number>();
    for (let q = 1; q <= 60; q++)
      for (let p = 1; p <= 4 * q; p++)
        if (p / q >= 0.8 && p / q <= 3.7) multipliers.add(p / q);
    let worst = Infinity;
    for (const role of Object.values(textStyles))
      for (const scale of [2, 3])
        for (const multiplier of multipliers)
          for (let lines = 1; lines <= 200; lines++)
            worst = Math.min(
              worst,
              slack(
                lines,
                role.lineHeight + LINE_HEIGHT_NUDGE,
                multiplier,
                scale,
              ),
            );
    // Far above floating-point noise (about 1e-13 at these sizes).
    expect(worst).toBeGreaterThan(1e-6);
  });
  test('the nudge is invisible: under a hundredth of a point per line at AX5', () => {
    expect(LINE_HEIGHT_NUDGE * 3.6).toBeLessThan(0.01);
  });
});
