import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMoneyJourneys } from '../public/money-journeys-data.js';

function fixture() {
  return {
    nodes: [
      {id:'hub',label:'Commonwealth contracts',kind:'grantor',flow:'contracts'},
      {id:'a',label:'Alpha Pty Ltd',kind:'donor',industry:'tech',total:999999999},
      {id:'b',label:'Beta Corporation',kind:'donor',industry:'tech'},
      {id:'person',label:'An Individual Pty Ltd',kind:'donor',industry:'individual'},
      {id:'party-donor',label:'Party Holdings Pty Ltd',kind:'donor',industry:'party_internal'},
      {id:'misclassified',label:'Jane Smith',kind:'donor',industry:'finance'},
      {id:'p',label:'Party A',kind:'party'}, {id:'q',label:'Party B',kind:'party'},
    ],
    edges: [
      {source:'hub',target:'a',total:1000,grant:true,flow:'contracts',byYear:{2023:[1000,1]}},
      {source:'a',target:'p',total:90,byYear:{2020:[20,1],2021:[10,1],2022:[10,1],2023:[50,1]},undated:[99999,1]},
      {source:'a',target:'q',total:30,byYear:{2020:[5,1],2021:[5,1],2022:[5,1],2023:[15,1]}},
      {source:'b',target:'p',total:15,byYear:{2020:[10,1],2023:[5,1]}},
      {source:'b',target:'q',total:5,byYear:{2021:[3,1],2023:[2,1]}},
      {source:'person',target:'p',total:999999}, {source:'person',target:'q',total:999999},
      {source:'party-donor',target:'p',total:999999}, {source:'party-donor',target:'q',total:999999},
      {source:'misclassified',target:'p',total:999999}, {source:'misclassified',target:'q',total:999999},
    ],
  };
}

function validateScenes(data, journeys) {
  const ids = new Set(data.nodes.map(n => n.id));
  const pairs = new Set(data.edges.map(e => JSON.stringify([typeof e.source==='string'?e.source:e.source.id,typeof e.target==='string'?e.target:e.target.id])));
  for (const journey of journeys) {
    assert.ok(journey.steps.length >= 3 && journey.steps.length <= 5);
    for (const step of journey.steps) {
      assert.ok(ids.has(step.scene.focusId));
      for (const id of step.scene.withIds) assert.ok(ids.has(id));
      for (const e of step.scene.edges) assert.ok(pairs.has(JSON.stringify([e.source,e.target])));
      if (step.metric) assert.ok(Number.isFinite(step.metric.value));
      if (step.scene.from !== undefined) assert.ok(step.scene.from <= step.scene.to);
    }
  }
}

test('four deterministic journeys use actual scene edges without mutating input', () => {
  const data=fixture(), before=structuredClone(data), journeys=buildMoneyJourneys(data);
  assert.deepEqual(journeys.map(j=>j.id),['public-money','multiple-parties','industry','over-time']);
  assert.deepEqual(buildMoneyJourneys(data),journeys);
  assert.deepEqual(data,before);
  validateScenes(data,journeys);
  const touched=journeys.flatMap(j=>j.steps.flatMap(s=>[s.scene.focusId,...s.scene.withIds]));
  for(const forbidden of ['person','party-donor','misclassified']) assert.ok(!touched.includes(forbidden));
});

test('public awards and receipts remain separate, using selected edges not node totals', () => {
  const journey=buildMoneyJourneys(fixture()).find(j=>j.id==='public-money');
  assert.equal(journey.steps[0].metric.value,1000);
  assert.equal(journey.steps[2].metric.value,120);
  assert.equal(journey.steps[3].metric,undefined);
  assert.equal(journey.steps[3].scene.edges.length,3);
});

test('time windows sum byYear cells rather than lifetime amounts, undated records or awards', () => {
  const journey=buildMoneyJourneys(fixture()).find(j=>j.id==='over-time');
  assert.deepEqual([journey.steps[0].scene.from,journey.steps[0].scene.to],[2020,2021]);
  assert.deepEqual([journey.steps[1].scene.from,journey.steps[1].scene.to],[2022,2023]);
  assert.equal(journey.steps[0].metric.value,40);
  assert.equal(journey.steps[1].metric.value,80);
  assert.equal(journey.steps[2].metric.value,40);
  assert.ok(journey.steps.every(s=>s.scene.edges.every(e=>e.source!=='hub')));
});

test('missing public layers omit that journey; grants and state datasets degrade honestly', () => {
  const data=fixture(); data.edges=data.edges.filter(e=>e.source!=='hub');
  assert.ok(!buildMoneyJourneys(data).some(j=>j.id==='public-money'));
  data.nodes[0].flow='grants';data.nodes[0].label='Queensland grants';
  data.edges.push({source:'hub',target:'a',total:500,grant:true});
  data.meta={jurisdiction:'qld'};
  const j=buildMoneyJourneys(data).find(j=>j.id==='public-money');
  assert.match(j.title,/grant/);
  assert.ok(j.steps.every(s=>(s.links||[]).every(l=>!l.href.startsWith('/suppliers'))));
});

test('partial input, invalid references and missing year cells do not invent stories', () => {
  assert.deepEqual(buildMoneyJourneys(),[]);
  assert.deepEqual(buildMoneyJourneys({nodes:{},edges:{}}),[]);
  const data=fixture();data.edges=data.edges.map(({byYear,...e})=>e);
  data.edges.push({source:'missing',target:'a',total:999999999,grant:true});
  assert.ok(!buildMoneyJourneys(data).some(j=>j.id==='over-time'));
  validateScenes(data,buildMoneyJourneys(data));
});

test('duplicate endpoint pairs are excluded rather than inflated', () => {
  const data=fixture();data.edges.push({...data.edges[1],total:10000});
  const j=buildMoneyJourneys(data).find(j=>j.id==='public-money');
  assert.equal(j.steps[2].metric.value,30);
  assert.ok(!j.steps[2].scene.edges.some(e=>e.target==='p'));
});

test('a single year or absent comparable company windows produces no trend claim', () => {
  const data=fixture();for(const e of data.edges)e.byYear={2025:[e.total,1]};
  assert.ok(!buildMoneyJourneys(data).some(j=>j.id==='over-time'));
});

test('rendered endpoint objects are accepted without changing relationship identity', () => {
  const data=fixture();const expected=buildMoneyJourneys(data);
  data.edges=data.edges.map(e=>({...e,source:{id:e.source},target:{id:e.target}}));
  assert.deepEqual(buildMoneyJourneys(data),expected);
});

test('every published federal and state journey references only real exported nodes and edges', () => {
  for(const file of ['money.json','money.qld.json','money.vic.json','money.tas.json']) {
    const path=new URL('../public/graph/'+file,import.meta.url);
    if(!fs.existsSync(path))continue;
    const data=JSON.parse(fs.readFileSync(path,'utf8'));
    const journeys=buildMoneyJourneys(data);
    validateScenes(data,journeys);
    assert.ok(journeys.length>=1,file);
    assert.deepEqual(buildMoneyJourneys({...data,nodes:[...data.nodes].reverse(),edges:[...data.edges].reverse()}),journeys,'Order-independent '+file);
  }
});
