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
  test.each([
    '16e-ax5-cold-1',
    '16e-ax5-cold-2',
    '16e-ax5-cold-3',
    '17pro-standard-cold',
    '16e-ax5-money-map-r3',
  ])('passes the drawn capture %s', (name) => {
    const verdict = firstLineVerdict(capture(name));
    expect(verdict).toMatchObject({ pass: true });
    expect(verdict.prefix!.top).toBeGreaterThan(
      verdict.title!.top + verdict.title!.height,
    );
  });
  test('rejects build 2 at 030b11ca, whose first line sat behind the title', () => {
    expect(firstLineVerdict(capture('16e-ax5-broken-030b11ca'))).toMatchObject({
      pass: false,
      reason: expect.stringContaining('No drawn line starts "OPAX is"'),
    });
  });
  test('rejects a first line that starts inside the title', () => {
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [line('Today', 300, 180), line('OPAX is', 440, 100)],
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('inside') });
  });
  test('still rejects the observed OCR glyph equivalent inside the title', () => {
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [line('Today', 300, 180), line('OP\u0410X is', 440, 100)],
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('inside') });
  });
  test('rejects a first line under the tab bar or off screen', () => {
    const title = line('Today', 300, 180);
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [title, line('OPAX is', 2350, 100), line('Today', 2380, 40)],
      }).pass,
    ).toBe(false);
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [title, line('OPAX is', 2500, 100)],
      }).pass,
    ).toBe(false);
  });
  test('needs the large title, not the tab label', () => {
    expect(
      firstLineVerdict({
        width: 1170,
        height: 2532,
        lines: [line('OPAX is', 600, 100), line('Today', 2380, 40)],
      }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('title') });
  });
});
