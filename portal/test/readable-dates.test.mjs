// search-hubs-002: Ask citation templates wrote ISO-only ranges ("2017-07-01 to 2018-06-30",
// "null to null"), which a client that strips ISO dates turns into "( to )". The text now names
// readable dates and only the ends the record holds; structured fields keep ISO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const bundle = await build({stdin:{contents:"export {readableDate, readableRange} from './src/tools/record-common';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,platform:'browser',format:'esm',write:false});
const {readableDate, readableRange} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('readable dates: day, month, year, and nothing for a missing or malformed value', () => {
  assert.equal(readableDate('2024-07-01'), '1 July 2024');
  assert.equal(readableDate('2024-06-30T00:00:00Z'), '30 June 2024');
  assert.equal(readableDate('2024-07'), 'July 2024');
  assert.equal(readableDate(2014), '2014');
  for (const bad of [null, undefined, '', 'null', '2024-02-30', '2024-13-01', 'soon']) assert.equal(readableDate(bad), '', String(bad));
});

test('readable ranges name only the ends the record holds', () => {
  assert.equal(readableRange('2017-07-01', '2018-06-30'), '1 July 2017 to 30 June 2018');
  assert.equal(readableRange('1999-12-07', null), 'from 7 December 1999');
  assert.equal(readableRange(null, '2011-06-30'), 'to 30 June 2011');
  assert.equal(readableRange(null, null), '');
  assert.equal(readableRange(2014, 2014), '2014');
  assert.equal(readableRange(2014, 2020), '2014 to 2020');
});

test('no citation template in the five tools writes a raw value-to-value range', async () => {
  for (const file of ['grants.ts', 'pay.ts', 'member-expenses.ts', 'contracts.ts', 'access-registers.ts']) {
    const source = await readFile(new URL(`../src/tools/${file}`, import.meta.url), 'utf8');
    // A raw date field on either side of ' to ' or '–' ("${r.start_date} to ${r.end_date}", "${p.from} to ${p.to}",
    // "${x.first_year}–${x.last_year}", "-07-01 to"): the shapes that read "( to )" once ISO dates are stripped.
    // Financial-year labels ("2017-18 to 2018-19") are readable and stay.
    assert.doesNotMatch(source, /\$\{[^}]*(?:_date|\.since|\.until|\.from|_year)\}(?: to |–)\$\{|-07-01 to /, file);
    assert.match(source, /readableRange\(/, file);
  }
});
