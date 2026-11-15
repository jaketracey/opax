// Any IPEA figure for a year that is not fully published says what it covers, from the quarters held, never from
// today's date: one helper (public/expense-coverage.js) for Ask's expenses tool and the person page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {yearCoverage, yearQuarters} from '../public/expense-coverage.js';

const bundle = await build({stdin:{contents:"export * from './src/tools/index';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,platform:'browser',format:'esm',write:false});
const api = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const ALL = ['2025Q01','2025Q02','2025Q03','2025Q04','2026Q01','2026Q02'];

test('a two-quarter year, a full year and a year with no quarters each read as what the data holds', () => {
  assert.deepEqual(yearCoverage(ALL, 2026), {quarters:['2026Q01','2026Q02'], complete:false, text:'January to June 2026 (two quarters published)'});
  assert.deepEqual(yearCoverage(ALL, 2025), {quarters:['2025Q01','2025Q02','2025Q03','2025Q04'], complete:true, text:''});
  assert.deepEqual(yearCoverage(ALL, 2027), {quarters:[], complete:false, text:'no quarters published'});
});

test('coverage follows the quarters, whatever they are: one, three, a late start, a gap, a financial year', () => {
  assert.equal(yearCoverage(['2026Q01'], 2026).text, 'January to March 2026 (one quarter published)');
  assert.equal(yearCoverage([...ALL,'2026Q03'], 2026).text, 'January to September 2026 (three quarters published)');
  assert.equal(yearCoverage(['2017Q02','2017Q03','2017Q04'], 2017).text, 'April to December 2017 (three quarters published)');
  assert.equal(yearCoverage(['2024Q01','2024Q03','2024Q04'], 2024).text, 'January to March 2024 and July to December 2024 (three quarters published)');
  assert.equal(yearCoverage(ALL, '2025-26', {financial:true}).text, '');
  assert.equal(yearCoverage(ALL, '2024-25', {financial:true}).text, 'January to June 2025 (two quarters published)');
  assert.equal(yearCoverage([...ALL,'2026Q03','2026Q04','2027Q01'], '2026-27', {financial:true}).text, 'July 2026 to March 2027 (three quarters published)');
  assert.deepEqual(yearQuarters('2025-26', true), ['2025Q03','2025Q04','2026Q01','2026Q02']);
  // a Set or nothing at all is accepted; the date today is never consulted
  assert.equal(yearCoverage(new Set(ALL), 2026).text, 'January to June 2026 (two quarters published)');
  assert.equal(yearCoverage(null, 2026).text, 'no quarters published');
});

const fixture = {
  meta:{from:'2025Q01',to:'2026Q02',quarters:6,reporting_periods:ALL,attribution:'Source: IPEA, CC BY 3.0 AU.'},
  names:{'jane example':'P1'},
  people:{P1:{name:'Jane Example',by_year:[[2025,431039],[2026,318774]],by_financial_year:[['2024-25',18626],['2025-26',731187]]}},
};
const env = (media = {}) => ({origin:'https://opax.test',asset:async()=>structuredClone(fixture),media:async key=>media[key]?structuredClone(media[key]):null});
const ask = (args, media) => api.callTool(env(media),'member_expenses',{person:'Jane Example',...args},true);
const mcp = args => api.callTool(env(),'member_expenses',{person:'Jane Example',...args});

test('Ask: a two-quarter year total names its months and quarters; a full year says nothing extra', async () => {
  const partial = await ask({year:2026});
  assert.equal(partial.citations[0].text, 'Jane Example: $318,774 in IPEA-reported parliamentary expenses for January to June 2026 (two quarters published), a partial reported subtotal of calendar year 2026.');
  assert.equal(partial.rows[0].covers, 'January to June 2026 (two quarters published)');
  assert.equal(partial.rows[0].complete, false);
  const full = await ask({year:2025});
  assert.equal(full.citations[0].text, 'Jane Example: $431,039 in IPEA-reported parliamentary expenses for calendar year 2025.');
  assert.equal('covers' in full.rows[0], false);
  const fy = await ask({year:'2025-26'});
  assert.equal(fy.citations[0].text, 'Jane Example: $731,187 in IPEA-reported parliamentary expenses for financial year 2025-26.');
  const halfFy = await ask({year:'2024-25'});
  assert.match(halfFy.citations[0].text, /for January to June 2025 \(two quarters published\), a partial reported subtotal of financial year 2024-25\.$/);
});

test('Ask: a year with no quarters published gives no figure and says so', async () => {
  const none = await ask({year:2027});
  assert.equal(none.rows.length, 0);
  assert.equal(none.citations[0].text, 'OPAX has no reported IPEA expense total for Jane Example for calendar year 2027. This does not mean expenditure was zero. IPEA has published no quarters of calendar year 2027 yet.');
  assert.equal(none.citations[0].value, undefined);
});

test('Ask itemised: the held total and the listed lines both state a partial year, and a full year does not', async () => {
  const pending = await ask({year:2026,detail:'itemised'});
  assert.equal(pending.citations[0].text, "Jane Example's IPEA-reported expenses for January to June 2026 (two quarters published) total $318,774, a partial subtotal of calendar year 2026; the itemised lines for that year are not loaded yet.");
  const wholeYear = await ask({year:2025,detail:'itemised'});
  assert.equal(wholeYear.citations[0].text, "Jane Example's IPEA-reported expenses for calendar year 2025 total $431,039; the itemised lines for that year are not loaded yet.");
  const COLUMNS=['quarter','category_high','category_major','description','amount','traveller'];
  const file = quarters => ({meta:{quarters:quarters.map(id=>({id,label:id,source_url:'https://data.gov.au/x'}))},columns:COLUMNS,lines:quarters.map(q=>[q,'Scheduled Commercial Transport','Fares','Canberra to Sydney',100,'Member'])});
  const two = await ask({year:2026,detail:'itemised'},{'expenses/v1/P1/2026.json':file(['2026Q01','2026Q02'])});
  assert.equal(two.citations[0].text, "Jane Example's IPEA-reported travel lines, January to June 2026 (two quarters published): 2 lines totalling $200.00, a partial subtotal of calendar year 2026.");
  assert.equal(two.rows[0].covers, 'January to June 2026 (two quarters published)');
  const four = await ask({year:2025,detail:'itemised'},{'expenses/v1/P1/2025.json':file(['2025Q01','2025Q02','2025Q03','2025Q04'])});
  assert.equal(four.citations[0].text, "Jane Example's IPEA-reported travel lines, calendar year 2025: 4 lines totalling $400.00.");
  assert.equal('covers' in four.rows[0], false);
});

test('Ask itemised: coverage is what IPEA has published for the year, not the quarters the member has lines in', async () => {
  const COLUMNS=['quarter','category_high','category_major','description','amount','traveller'];
  const file = quarters => ({meta:{quarters:quarters.map(id=>({id,label:id,source_url:'https://data.gov.au/x'}))},columns:COLUMNS,lines:quarters.map(q=>[q,'Scheduled Commercial Transport','Fares','Canberra to Sydney',100,'Member'])});
  // lines in January to March only, in a year whose four quarters are all published: a whole year, never "one quarter published"
  const oneQuarter = await ask({year:2025,detail:'itemised'},{'expenses/v1/P1/2025.json':file(['2025Q01'])});
  assert.equal(oneQuarter.citations[0].text, "Jane Example's IPEA-reported travel lines, calendar year 2025: 1 lines totalling $100.00.");
  assert.doesNotMatch(JSON.stringify(oneQuarter), /quarters? published|partial subtotal|not yet published/);
  assert.equal('covers' in oneQuarter.rows[0], false);
  assert.equal(oneQuarter.coverage.matched, true);
  assert.deepEqual([oneQuarter.coverage.since, oneQuarter.coverage.until], ['2025-01-01', '2025-12-31']);
  assert.deepEqual(oneQuarter.rows[0].reporting_quarters, ['2025Q01']);
  // lines in one quarter of a year with two published: the published two, not the member's one
  const early = await ask({year:2026,detail:'itemised'},{'expenses/v1/P1/2026.json':file(['2026Q01'])});
  assert.equal(early.citations[0].text, "Jane Example's IPEA-reported travel lines, January to June 2026 (two quarters published): 1 lines totalling $100.00, a partial subtotal of calendar year 2026.");
  assert.equal(early.rows[0].covers, 'January to June 2026 (two quarters published)');
  assert.match(early.notes.join(' '), /Reporting quarters not yet published for calendar year 2026: 2026Q03, 2026Q04\./);
});

test('Ask: a year outside the data says which side it is on: not yet published, or before the data starts', async () => {
  const later = 'OPAX has no reported IPEA expense total for Jane Example for calendar year 2027. This does not mean expenditure was zero. IPEA has published no quarters of calendar year 2027 yet.';
  assert.equal((await ask({year:2027})).citations[0].text, later);
  for (const year of [2010, 2016, 2024]) {
    const past = await ask({year});
    assert.equal(past.rows.length, 0);
    assert.equal(past.citations[0].text, `OPAX has no reported IPEA expense total for Jane Example for calendar year ${year}. This does not mean expenditure was zero. OPAX's IPEA data starts on 1 January 2025.`);
    assert.doesNotMatch(past.citations[0].text, /published no quarters/);
    const lines = await ask({year, detail:'itemised'});
    assert.equal(lines.citations[0].text, `OPAX has no reported IPEA expense lines for Jane Example for calendar year ${year}. This does not mean expenditure was zero. OPAX's IPEA data starts on 1 January 2025.`);
  }
  assert.match((await ask({year:2027,detail:'itemised'})).citations[0].text, /IPEA has published no quarters of calendar year 2027 yet\.$/);
  // a financial year straddling the start of the data holds some quarters, so neither line applies
  assert.doesNotMatch((await ask({year:'2024-25'})).citations[0].text, /starts on|published no quarters/);
  // MCP says neither for now
  for (const year of [2010, 2027]) assert.match((await mcp({year})).citations[0].text, /This does not mean expenditure was zero\.$/);
});

test('MCP output is unchanged for now: the earlier wording, and no covers field', async () => {
  const partial = await mcp({year:2026});
  assert.equal(partial.citations[0].text, 'Jane Example: $318,774 in IPEA-reported parliamentary expenses for calendar year 2026 (partial reported subtotal, 1 January 2026 to 30 June 2026).');
  assert.equal('covers' in partial.rows[0], false);
  const none = await mcp({year:2027});
  assert.equal(none.citations[0].text, 'OPAX has no reported IPEA expense total for Jane Example for calendar year 2027. This does not mean expenditure was zero.');
});

test('the person page states partial years under the yearly chart, with the same helper', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function renderPersonExpenses'), section = app.slice(start, app.indexOf('// --- pay for the posts held', start));
  assert.match(section, /import\("\/expense-coverage\.js\?v=1"\)/);
  assert.match(section, /coverage\.yearCoverage\(expensesData\.meta\.reporting_periods, year\)/);
  assert.match(section, /`The \$\{year\} figure covers \$\{c\.text\}\.`/);
  assert.match(section, /heading: "Claimed per year", note: partialYears/);
  // the sentence the page builds for today's data: 2026 only (2025 is complete)
  const said = [[2025,1],[2026,1]].map(([year]) => [year, yearCoverage(ALL, year)]).filter(([, c]) => !c.complete && c.quarters.length).map(([year, c]) => `The ${year} figure covers ${c.text}.`).join(' ');
  assert.equal(said, 'The 2026 figure covers January to June 2026 (two quarters published).');
});
