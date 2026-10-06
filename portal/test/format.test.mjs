import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { MONTHS, shortDate, shortMoney } from '../public/format.js';

const MONEY = [
  [0, '$0'], [950, '$950'], [950.5, '$950.50'], [999.4, '$999.40'], [999.996, '$1.0k'],
  // The cases the review found: thousands keep their decimal (State Street's
  // 2021-22 tax payable, Richmond Fellowship's 2024 donations).
  [6260, '$6.3k'], [4490, '$4.5k'], [4537, '$4.5k'], [24400, '$24.4k'], [410100, '$410.1k'], [507000, '$507.0k'],
  [999940, '$999.9k'], [999960, '$1.0m'], [2.3e6, '$2.3m'], [24.4e6, '$24.4m'], [211.6e6, '$211.6m'],
  [999.94e6, '$999.9m'], [999.96e6, '$1.00bn'], [2.345e9, '$2.35bn'], [198.68e9, '$198.68bn'],
  // Halves round up, as Intl did: toFixed alone reads 6.05 as 6.0499...
  [6.05e6, '$6.1m'], [1.005e9, '$1.01bn'], [6250, '$6.3k'],
  [-2.5e6, '-$2.5m'], ['1250000', '$1.3m'], [null, '$0'], [undefined, '$0'], [Number.NaN, '$0'],
];
const DATES = [
  ['2026-09-04', '4 Sep 2026'], ['2024-06-30', '30 Jun 2024'], ['2025-07-01', '1 Jul 2025'],
  ['2026-09-04T22:15:00Z', '4 Sep 2026'], ['1998-12-25', '25 Dec 1998'],
  ['2026-13-01', '2026-13-01'], ['2026-09', '2026-09'], ['Not recorded', 'Not recorded'], ['', ''], [null, ''], [undefined, ''],
];

test('short money is one style: lowercase k, m and bn; two decimals of a billion, one of a million or a thousand, exact below that', () => {
  for (const [value, expected] of MONEY) assert.equal(shortMoney(value), expected, String(value));
});

// The short forms the site used before format.js (8f1305e3), each with the sizes
// it was shown at. No figure may come out coarser than it did.
const compactIntl = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 });
const BEFORE = {
  // app.js fmtMoney and its copies in grants.js, wordsdollars.js, home-spotlight.js and the Worker
  fmtMoney: [(n) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`, Infinity],
  // tax-charity, suppliers, agencies, grants research, money journeys, map research
  intlCompact: [(n) => compactIntl.format(n), Infinity],
  // the contracts view
  discovery: [(n) => { const u = n >= 1e9 ? [1e9, 'bn'] : n >= 1e6 ? [1e6, 'm'] : n >= 1e3 ? [1e3, 'k'] : [1, '']; return `$${(n / u[0]).toLocaleString('en-AU', { maximumFractionDigits: u[0] === 1 ? 0 : 1 })}${u[1]}`; }, Infinity],
  // the money map
  moneyMap: [(n) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}b` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`, Infinity],
  // the time machine, which only ever shows one industry's donations in a year
  timeMachine: [(n) => n >= 1e6 ? '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n), 1e9],
};
const UNIT = { '': 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, bn: 1e9, B: 1e9, T: 1e12 };
/** The step between neighbouring figures a short form can show: "$6.3K" is 100, "$6K" 1,000. */
function step(text) {
  const m = /^-?\$([\d,]+)(?:\.(\d+))?(bn|[kKmMbBT])?$/.exec(text);
  assert.ok(m, text);
  return { step: UNIT[m[3] || ''] * 10 ** -(m[2]?.length || 0), malformed: Boolean(m[3]) && Number(m[1].replace(/,/g, '')) >= 1000 };
}

test('no short figure is coarser than the form its page showed before', () => {
  const values = [6260, 4490, 4537, 410100, 999.5, 999960, 1.5e9];
  for (let e = 0; e <= 12; e += 0.01) values.push(Math.round(10 ** e * 100) / 100, Math.round(10 ** e * 1.2345));
  let compared = 0;
  for (const [name, [before, upTo]] of Object.entries(BEFORE)) {
    for (const value of values.filter((v) => v < upTo)) {
      const old = step(before(value));
      // "$1000K": the old rounding spilled past its unit; its successor is "$1.0M".
      if (old.malformed) continue;
      const now = step(shortMoney(value));
      assert.ok(now.step <= old.step + 1e-9, `${name}: ${value} was ${before(value)}, now ${shortMoney(value)}`);
      compared++;
    }
  }
  assert.ok(compared > 10000, String(compared));
});

test('a table of filed figures shows each one to the dollar, not abbreviated', async () => {
  const T = await import('../public/tax-charity.js');
  const meta = { sources: { ato: { title: 'ATO Corporate Tax Transparency', licence: 'CC BY 3.0 AU' } } };
  const html = T.taxCharityHTML({ t: [{ y: '2022-23', inc: 812345678, tax: 50120, pay: 6260 }, { y: '2021-22', inc: 790000000, tax: 48000, pay: 6260 }] }, meta, { abn: '55555555555' });
  assert.match(html, /<th scope="row">2021-22<\/th><td>\$790,000,000<\/td><td>\$48,000<\/td><td>\$6,260<\/td>/);
  assert.doesNotMatch(html.slice(html.indexOf('<table')), /\$6\.3K/);
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
