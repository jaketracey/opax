import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {divisionColumns, voteColumns, divisionRows, votingRows, divisionTableConfig, voteTableConfig, voteTableHTML, voteTablePage} from '../public/vote-tables.js';

test('division and voting configs use scoped server sources and the frozen columns', () => {
  const divisions = divisionTableConfig({bill:'au-federal-fixture'});
  const votes = voteTableConfig('fixture-member');
  assert.deepEqual(divisions.source, {endpoint:'/api/table/divisions', params:{bill:'au-federal-fixture'}});
  assert.deepEqual(votes.source, {endpoint:'/api/table/votes', params:{person:'fixture-member'}});
  assert.deepEqual(divisionColumns.map(c=>[c.key,c.type]), [['title','text'],['date','date'],['chamber','category'],['outcome','category'],['ayes','count'],['noes','count']]);
  assert.deepEqual(voteColumns.map(c=>c.key), ['title','date','vote','party_position']);
  for (const config of [divisions,votes]) {
    assert.equal(config.rows,undefined);
    assert.deepEqual(config.defaultSort,{key:'date',dir:'desc'});
    assert.equal(config.columns[0].primary,true);
    assert.equal(config.primaryLink({href:'javascript:alert(1)'}),null);
  }
});

test('division titles use stage and date, missing counts stay unknown, and hubs retain separate divisions', () => {
  const divisions = [
    {key:'fixture-one', stage:'Second Reading', question:'Editorial text', date:'2026-08-19', house:'senate', outcome:'affirmative', ayes:0, noes:null},
    {key:'fixture-two', stage:'Second Reading', date:'2026-08-19', house:'senate', outcome:'affirmative', ayes:0, noes:null},
  ];
  const rows = divisionRows(divisions);
  assert.equal(rows[0].title,'Second reading, 19 Aug 2026');
  assert.equal(rows[0].outcome,'Agreed');
  assert.equal(rows[0].ayes,0); assert.equal(rows[0].noes,null);
  assert.equal(rows[0].href,'/doc/division-fixture-one');
  assert.equal(rows.length,2);
  assert.equal(divisionRows(divisions,true).length,1);
  assert.equal(divisionRows([{key:'fixture-three', ayes:'invalid'}])[0].ayes,null);
});

test('voting records show only explicitly sourced party positions and safe primary links', () => {
  const rows = votingRows([
    {title:'A recorded bill', vote:'aye', party:'Fixture party', division_slug:'division-fixture-one'},
    {name:'Another bill', vote:'no', party_position:'split', bill_key:'au-federal-fixture'},
    {name:'Missing fields', source_url:'javascript:alert(1)'},
  ]);
  assert.equal(rows[0].party_position,'Not recorded');
  assert.equal(rows[0].vote,'Aye');
  assert.equal(rows[1].party_position,'Split');
  assert.equal(rows[1].href,'/bill/au-federal-fixture');
  assert.match(rows[2].href,/^\/ask\?view=search&q=/);
  const bills = [{key:'au-federal-fixture',title:'A recorded bill',jurisdiction:'federal'},{key:'au-nsw-fixture',title:'A recorded bill',jurisdiction:'nsw'}];
  assert.equal(votingRows([{name:'A recorded bill',jur:'federal'}],bills)[0].href,'/bill/au-federal-fixture');
  assert.match(votingRows([{name:'A recorded bill'}],bills)[0].href,/^\/ask\?view=search&q=/);
});

test('SSR shows linked dated divisions and Status labels without embedding all server rows', () => {
  const config = divisionTableConfig({bill:'au-federal-fixture'});
  const rows = divisionRows(Array.from({length:40},(_,i)=>({key:`fixture-${i}`, stage:'Third reading', date:'2026-08-19', house:'senate', ayes:1200+i, noes:0, outcome:'affirmative'})));
  const page = voteTablePage(rows,config);
  const html = voteTableHTML(config,page);
  assert.match(html,/<caption>Divisions<\/caption>/);
  assert.match(html,/href="\/doc\/division-fixture-0"/);
  assert.match(html,/class="ui-status" data-tone="done">Agreed/);
  assert.match(html,/1,200/);
  assert.equal(page.total,40); assert.equal(page.rows.length,25);
  assert.doesNotMatch(html,/division-fixture-39/);
  const json = JSON.parse(html.match(/data-vote-config>(.*?)<\/script>/s)[1]);
  assert.equal(json.rows,undefined); assert.equal(json.source.endpoint,'/api/table/divisions');
});

test('table captions own their label and the hub boot survives the app-script removal', () => {
  const shell = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(shell,/<script type="module" src="\/vote-tables.js(?:\?v=[a-f0-9]+)?"><\/script>/);
  assert.match(shell,/href="\/vote-tables.css(?:\?v=[a-f0-9]+)?"/);
});
