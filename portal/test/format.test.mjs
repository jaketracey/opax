import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { MONTHS, shortDate, shortMoney } from '../public/format.js';

const MONEY = [
  [0, '$0'], [950, '$950'], [999.4, '$999'], [999.5, '$1K'], [4537, '$5K'], [24400, '$24K'], [507000, '$507K'],
  [999499, '$999K'], [999800, '$1.0M'], [2.3e6, '$2.3M'], [24.4e6, '$24.4M'], [211.6e6, '$211.6M'],
  [999.94e6, '$999.9M'], [999.96e6, '$1.00B'], [2.345e9, '$2.35B'], [198.68e9, '$198.68B'],
  [-2.5e6, '-$2.5M'], ['1250000', '$1.3M'], [null, '$0'], [undefined, '$0'], [Number.NaN, '$0'],
];
const DATES = [
  ['2026-09-04', '4 Sep 2026'], ['2024-06-30', '30 Jun 2024'], ['2025-07-01', '1 Jul 2025'],
  ['2026-09-04T22:15:00Z', '4 Sep 2026'], ['1998-12-25', '25 Dec 1998'],
  ['2026-13-01', '2026-13-01'], ['2026-09', '2026-09'], ['Not recorded', 'Not recorded'], ['', ''], [null, ''], [undefined, ''],
];

test('short money is one style: two decimals of a billion, one of a million, whole thousands and dollars', () => {
  for (const [value, expected] of MONEY) assert.equal(shortMoney(value), expected, String(value));
});

test('short dates use three-letter months, never the en-AU "Sept", "June" or "July"', () => {
  assert.deepEqual(MONTHS, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  for (const [value, expected] of DATES) assert.equal(shortDate(value), expected, String(value));
  assert.equal(shortDate(new Date(2026, 8, 4, 23, 30)), '4 Sep 2026', 'a Date reads in local time');
  assert.equal(shortDate(new Date('not a date')), '');
});

test("app.js's copies (a classic script cannot import) match format.js", () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const part = (re) => { const m = app.match(re); assert.ok(m, String(re)); return m[0]; };
  const code = [
    part(/^const MONTHS = \[[^\]]*\];$/m),
    part(/^function fmtDate\(value\) \{[\s\S]*?^\}$/m),
    part(/^function fmtMoney\(value\) \{[\s\S]*?^\}$/m),
  ].join('\n') + '\n;({ MONTHS, fmtDate, fmtMoney })';
  const copy = runInNewContext(code, { Date, Number, String, Math });
  assert.deepEqual([...copy.MONTHS], MONTHS);
  for (const [value] of MONEY) assert.equal(copy.fmtMoney(value), shortMoney(value), String(value));
  for (const [value] of DATES) assert.equal(copy.fmtDate(value), shortDate(value), String(value));
  assert.equal(copy.fmtDate(new Date(2026, 8, 4)), shortDate(new Date(2026, 8, 4)));
});

test('no page module formats short money or short months through Intl', () => {
  // Built bundles are checked through their sources (graph/, grants-map/, analytics/, voice/).
  const built = new Set(['analytics.js', 'events.js', 'ga.js', 'gtm.js', 'money-map.js', 'explain.js', 'grants-map.js', 'voice.js']);
  // journey-story.ts formats figures for a model's prompt, not for a page.
  const prompts = new Set(['journey-story.ts']);
  const files = [
    ...readdirSync(new URL('../public/', import.meta.url)).filter((f) => f.endsWith('.js') && !built.has(f)).map((f) => `../public/${f}`),
    ...readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.ts') && !prompts.has(f)).map((f) => `../src/${f}`),
    ...readdirSync(new URL('../graph/', import.meta.url)).filter((f) => f.endsWith('.ts')).map((f) => `../graph/${f}`),
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /notation\s*:\s*['"]compact['"]/, `${file} uses Intl compact money`);
    assert.doesNotMatch(source, /month\s*:\s*['"]short['"]/, `${file} uses Intl short months`);
  }
});
