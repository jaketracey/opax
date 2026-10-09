import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstLineVerdict, type Ocr } from '../scripts/first-line-policy';

// Vision's recognised lines from real journey 15 captures
// (scripts/ocr-lines.swift), so the rule is pinned to drawn pixels.
const capture = (name: string): Ocr =>
  JSON.parse(
    readFileSync(
      join(__dirname, 'fixtures/first-line', `${name}.json`),
      'utf8',
    ),
  ) as Ocr;
const line = (text: string, top: number, height: number) => ({
  text,
  left: 50,
  top,
  width: 400,
  height,
});

describe('journey 15 first-line check', () => {
  // Today's first line is its date since design pass 3A (D4 moved the
  // independence line to the foot of the page).
  test.each([
    // Today's dated masthead at AX5, drawn in capitals before D6.
    '17pro-ax5-masthead-lookalikes',
  ])('passes the drawn capture %s', (name) => {
    const verdict = firstLineVerdict(capture(name));
    expect(verdict).toMatchObject({ pass: true });
    expect(verdict.prefix!.top).toBeGreaterThan(
      verdict.title!.top + verdict.title!.height,
    );
  });
  test('rejects build 2 at 030b11ca, whose first lines sat behind the title', () => {
    expect(firstLineVerdict(capture('16e-ax5-broken-030b11ca'))).toMatchObject({
      pass: false,
      reason: expect.stringContaining('No drawn line starts with the date'),
    });
  });
  test('passes the date wholly below the title, wrapped or not', () => {
    for (const lines of [
      [line('Friday 9 October', 520, 60)],
      [line('Wednesday', 520, 110), line('7 October', 640, 110)],
    ])
      expect(
        firstLineVerdict({
          width: 1170,
          height: 2532,
          lines: [line('Today', 300, 180), ...lines],
        }),
      ).toMatchObject({ pass: true });
  });
  test('rejects a first line that starts inside the title', () => {
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [line('Today', 300, 180), line('Friday 9 October', 440, 100)],
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('inside') });
  });
  test('still rejects the observed OCR glyph equivalent inside the title', () => {
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [line('Today', 300, 180), line('FRID\u0410Y 9', 440, 100)],
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('inside') });
  });
  test('rejects a first line under the tab bar or off screen', () => {
    const title = line('Today', 300, 180);
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [
          title,
          line('Friday 9 October', 2350, 100),
          line('Today', 2380, 40),
        ],
      }).pass,
    ).toBe(false);
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [title, line('Friday 9 October', 2500, 100)],
      }).pass,
    ).toBe(false);
  });
  test('needs the large title, not the tab label', () => {
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [line('Friday 9 October', 600, 100), line('Today', 2380, 40)],
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('title') });
  });
});
