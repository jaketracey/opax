import test from 'node:test';
import assert from 'node:assert/strict';
import {tablePrivacyIndex} from './datatable-privacy.mjs';
const index = await tablePrivacyIndex();
import {readFileSync} from 'node:fs';
import {divisionColumns, voteColumns, divisionRows, votingRows, divisionTableConfig, voteTableConfig, voteTableHTML, voteTablePage} from '../public/vote-tables.js';
import {toCSV} from '../public/datatable.js';
import {guardTableURL} from '../public/vote-tables.js';
import {build} from 'esbuild';
const bundled=await build({entryPoints:[new URL('../src/hubs.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {renderSittingWeek}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));

test('division and voting configs use scoped server sources and the frozen columns', () => {
  const divisions = divisionTableConfig({bill:'au-federal-fixture'});
  const votes = voteTableConfig('fixture-member');
  assert.deepEqual(divisions.source, {endpoint:'/api/table/divisions', params:{'f.bill':'["au-federal-fixture"]'}});
  assert.deepEqual(votes.source, {endpoint:'/api/table/votes', params:{'f.person':'["fixture-member"]'}});
  assert.deepEqual(divisionColumns.map(c=>[c.key,c.type]), [['title','text'],['date','date'],['chamber','category'],['outcome','category'],['ayes','count'],['noes','count']]);
  assert.deepEqual(voteColumns.map(c=>c.key), ['title','date','vote','party_position']);
  for (const config of [divisions,votes]) {
    assert.equal(config.privacy,'donors');
    assert.equal(typeof config.privacyCheck,'function');
    assert.equal(typeof config.rowPrivacyCheck,'function');
    assert.equal(config.rows,undefined);
    assert.deepEqual(config.defaultSort,{key:'date',dir:'desc'});
    assert.equal(config.columns[0].primary,true);
    assert.equal(config.primaryLink({href:'javascript:alert(1)'}),null);
  }
});

test('both rollouts register the shared index for rows, secondary facets, CSV and query echoes', () => {
  const configs = [divisionTableConfig({},'Divisions','bill',index.safe),voteTableConfig('fixture','Voting record',index.safe)];
  for (const config of configs) {
    const facet = config.urlKey === 'dv' ? 'outcome' : 'party_position';
    const publicRow = {title:'Recorded division',date:'2026-08-19',[facet]:'Recorded',href:'/doc/division-fixture'};
    for (const value of index.values) {
      const rows = [publicRow,{...publicRow,title:value},{...publicRow,[facet]:value},{...publicRow,href:'/doc/'+encodeURIComponent(value)}];
      // Raw identifying fields, including URLs, use the same shared index.
      const page = voteTablePage(rows,config);
      assert.equal(page.total,1,'Withheld rows must not enter the query engine');
      assert.ok(index.safe(JSON.stringify(page)),'Rows and facets must be public');
      assert.ok(index.safe(toCSV(rows,config)),'CSV must exclude withheld rows');
      const rejected = voteTablePage(rows,config,{q:value});
      assert.equal(rejected.total,0,'Rejected searches must return no rows');
      const rejectedFacet = voteTablePage(rows,config,{filters:{[facet]:[value]}});
      assert.equal(rejectedFacet.total,0,'Rejected facets must return no rows');
      assert.ok(index.safe(voteTableHTML(config,rejected)),'SSR must not reflect rejected query text');
      const supplied = {...page,facets:{[facet]:[{value,count:1}]}};
      assert.ok(index.safe(voteTableHTML(config,supplied)),'Secondary server facets must be checked independently');
      const contaminated = {...page,total:2,rows:[{...publicRow,[facet]:value},publicRow]};
      assert.ok(index.safe(voteTableHTML(config,contaminated)),'Status decoration must use the core-filtered row, not the original row position');
    }
  }
});

test('division bars use the core column range across server pages', () => {
  const config = divisionTableConfig({},'Divisions','bill',index.safe);
  const rows = divisionRows(Array.from({length:64},(_,i)=>({key:`fixture-${i}`,stage:'Second reading',date:'2026-08-19',ayes:i+1,noes:128-i})));
  for (const number of [1,2,3]) {
    const page = voteTablePage(rows,config,{page:number});
    assert.deepEqual(page.facets.ayes,{min:1,max:64});
    assert.deepEqual(page.facets.noes,{min:65,max:128});
    const html = voteTableHTML(config,page);
    assert.match(html,/class="dt-scale">0–64/);
    assert.match(html,/class="dt-scale">0–128/);
    assert.ok(html.includes(`--dt-bar:${Math.round(page.rows[0].ayes/64*100)}%`));
  }
});

test('rollout paging retains the shared URL guard rejection through SSR', () => {
  for(const config of [divisionTableConfig({},'Divisions','bill',index.safe),voteTableConfig('fixture','Voting record',index.safe)]) {
    const rows=[{title:'Recorded division',date:'2026-08-19',vote:'Aye',chamber:'Senate',outcome:'Agreed',party_position:'Not recorded'}];
    const url=new URL('https://local.test/record');url.searchParams.append(config.urlKey+'.q','recorded');url.searchParams.append(config.urlKey+'.q',index.recipients[0]);
    const guarded=guardTableURL(config,url);
    assert.equal(guarded.rejected,true);
    const page=voteTablePage(rows,config,guarded.query);
    assert.equal(page.total,0,'the adapter must preserve the core rejection marker');
    assert.ok(index.safe(url.href));
    assert.ok(index.safe(voteTableHTML(config,page)));
    assert.match(voteTableHTML(config,page),/data-export disabled/);
  }
});

test('the shared recipient policy rejects every derived name, alias and registration identifier', () => {
  assert.ok(index.recipients.length>=151,'recipient aliases covered');
  assert.ok(index.abns.length>=21,'recipient registration identifiers covered');
  for (const value of [...index.recipients,...index.abns]) {
    assert.equal(index.safe(value),false,'recipient identity is private');
    assert.equal(index.safe(encodeURIComponent(value)),false,'encoded identity is private');
    if (/^\d{11}$/.test(value)) assert.equal(index.safe('ABN '+value.split('').join(' ')),false,'spaced identifiers are private');
  }
});

test('sitting structured data uses the same filtered and paged division rows as SSR', () => {
  const publicDivision={key:'fixture-public',slug:'fixture-public',title:'Recorded division',date:'2026-09-14',house:'senate',ayes:1,noes:0};
  const week={start:'2026-09-14',end:'2026-09-17',houses:['senate'],bills:[],divisions:[],lastmod:'2026-09-17'};
  const data={updated:'2026-09-17',snapshotDate:'2026-09-17',latestFederalDivision:'2026-09-17',sources:[{label:'Register',url:'https://www.aph.gov.au/'}],weeks:[week],pages:[]};
  for (const value of index.values) {
    const result=renderSittingWeek(data,{...week,divisions:[publicDivision,{...publicDivision,key:'fixture-private',slug:'fixture-private',title:value}]},[],new Map(),'2026-10-01',{}, {},index.safe);
    assert.ok(index.safe(result.html),'SSR contains no withheld identity');
    assert.ok(index.safe(JSON.stringify(result.jsonLd)),'structured data contains no withheld identity');
    const list=result.jsonLd['@graph'][1];
    assert.equal(list.numberOfItems,1,'structured data and visible rows agree');
    assert.equal(list.itemListElement[0].url,'https://opax.com.au/doc/division-fixture-public');
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
  const config = divisionTableConfig({bill:'au-federal-fixture'}, 'Divisions', 'bill', index.safe);
  const rows = divisionRows(Array.from({length:40},(_,i)=>({key:`fixture-${i}`, stage:'Third reading', date:'2026-08-19', house:'senate', ayes:1200+i, noes:0, outcome:'affirmative'})));
  const page = voteTablePage(rows,config);
  const html = voteTableHTML(config,page);
  assert.match(html,/<caption[^>]*>Divisions<\/caption>/);
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
