// The stacked phone line (under 700 px) keeps the columns that carry a record's
// meaning or its source; the grid at 700 px and up and the CSV keep the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {applyQuery,dataTableHTML} from '../public/datatable.js';
import {voteTableConfig} from '../public/vote-tables.js';
import {grantsTableConfig} from '../public/grants-table.js';
import {aggregateConfig} from '../public/budget-table.js';
import {stateBillsTableConfig} from '../public/register-tables.js';
import {moneyConnectionsConfig} from '../public/money-connections.js';

const keys = config => [...config.phone.meta, ...(config.phone.figure || [])].flatMap(e => typeof e === 'string' ? [e] : [e.key, e.to, e.then?.key].filter(Boolean));

test('the phone line keeps the columns that carry the record or its source', () => {
  const graph = {nodes:[{name:'Giver',href:'/g'},{name:'Taker',href:'/t'}],edges:[{source:0,target:1,type:'receipts',total:10,count:2,firstYear:2020,lastYear:2021}],meta:{}};
  for (const [name, config, wanted] of [
    ['votes', voteTableConfig('fixture-member'), ['party_position']],
    ['grants', grantsTableConfig(), ['agency', 'electorate']],
    ['budget aggregates', aggregateConfig, ['citation', 'licence']],
    ['state bills', stateBillsTableConfig([]), ['parliament', 'sponsor_name', 'status', 'status_as_of', 'last_action', 'publisher', 'licence']],
    ['money connections', moneyConnectionsConfig(graph), ['records']],
  ]) for (const key of wanted) assert.ok(keys(config).includes(key), `${name}: ${key} is on the phone line`);
});

const seen = el => { const copy = el.cloneNode(true); for (const sr of copy.querySelectorAll('.dt-sr')) sr.remove(); return copy.textContent; };
// Two rows that differ in every column, so none is folded into a constant chip; the first row's line is read.
const line = (config, rows) => new JSDOM(dataTableHTML({...config, rows}, applyQuery(rows, {...config, rows}, {}))).window.document.querySelector('.dt-phone-meta');

test('a status is read with its source date, and its absence is said', () => {
  const config = stateBillsTableConfig([]);
  const row = {id:'a', title:'Fixture Bill 2026', jurisdiction:'Victoria', status:'Passed', status_as_of:'2026-03-03', introduced_date:'2026-02-01'};
  const other = {id:'b', title:'Second Fixture Bill 2026', jurisdiction:'Tasmania', status:'Introduced', status_as_of:'2026-01-01', introduced_date:'2026-01-01'};
  const meta = line(config, [row, other]);
  assert.match(seen(meta), /Passed as at 3 Mar 2026/);
  assert.match(meta.textContent, /Status, Source status date: Passed as at 3 Mar 2026/);
  const undated = {...row, status_as_of:''};
  assert.match(seen(line(config, [undated, other])), /Passed as at source status date not recorded/);
});

test('a vote line names the party position only where the record has one', () => {
  const config = {...voteTableConfig('fixture-member'), source:undefined};
  const voted = {id:'a', title:'Fixture Bill 2026; Third Reading', date:'2026-10-29', vote:'Aye', party_position:'Against party'};
  const other = {id:'b', title:'Fixture Bill 2026; Second Reading', date:'2026-10-28', vote:'No', party_position:'With party'};
  assert.match(line(config, [voted, other]).textContent, /Party position: Against party/);
  assert.doesNotMatch(line(config, [{...voted, party_position:'Not recorded'}, other]).textContent, /Party position|Not recorded/);
});
