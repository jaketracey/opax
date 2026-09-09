import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeProjects,byState,selectProjects} from '../public/grants-research.js';
import {profileJurisdictions} from '../public/profile-jurisdictions.js';
const data=JSON.parse(readFileSync(new URL('../public/research/mlci.json',import.meta.url)));
test('primary extraction reconciles and keeps withdrawn invitations separate',()=>{
  assert.equal(data.projects.length,227);assert.equal(activeProjects(data).length,226);
  assert.equal(activeProjects(data).reduce((s,p)=>s+p.value,0),559241712);
  assert.equal(byState(activeProjects(data)).reduce((s,p)=>s+p.value,0),559241712);
  assert.equal(data.projects.filter(p=>p.status==='Withdrawn')[0].value,1656000);
});
test('award cohort is separate and missing delivery states are not guessed',()=>{
  assert.equal(selectProjects(data,{stage:'awards'}).length,89);
  assert.equal(selectProjects(data,{stage:'awards'}).reduce((s,p)=>s+p.value,0),242781386);
  assert.equal(selectProjects(data,{stage:'awards',state:'NSW'}).length,7);
  assert.equal(selectProjects(data,{query:'coolgardie'}).length,0);
  assert.equal(selectProjects(data,{query:'Marrickville Golf',state:'NSW'}).length,1);
});
test('AEC baseline contains 150 unique seats with valid margins and source pages',()=>{
  assert.equal(new Set(data.seats.map(s=>s.name)).size,150);
  assert.ok(data.seats.every(s=>s.margin>=0&&s.margin<=50&&s.page>=5&&s.page<=14));
  assert.equal(data.seats.find(s=>s.name==='Bullwinkel').margin,3.35);
  assert.equal(data.seats.find(s=>s.name==='Bradfield').margin,3.4);
  assert.equal(data.seats.find(s=>s.name==='Dunkley').margin,6.77);
});
test('published CPI comparison reconciles but is explicitly attributed',()=>{
  assert.equal(data.cpi_comparison.reduce((s,p)=>s+p.actual,0),559241712);
  assert.equal(data.cpi_comparison.reduce((s,p)=>s+p.expected,0),559241712);
  assert.match(data.comparison_provenance.note,/not independently reproduced/);
});
test('a federal senator represents a territory without becoming a territory legislator',()=>{
  const p=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url))).people.find(p=>p.name==='David Pocock');
  const result=profileJurisdictions(p);
  assert.deepEqual(result.jurisdictions,[{id:'federal',label:'Federal'}]);
  assert.deepEqual(result.chambers,['Senate']);
  assert.equal(result.representations[0].electorate,'Australian Capital Territory');
});
test('unknown or cross-jurisdiction representation is not displayed',()=>{
  assert.deepEqual(profileJurisdictions(null).representations,[]);
  assert.deepEqual(profileJurisdictions({states:['vic'],chambers:['vic_la'],representation:[{jurisdiction:'federal',chamber:'representatives',electorate:'Indi'}]}).representations,[]);
});
