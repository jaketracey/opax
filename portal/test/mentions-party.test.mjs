import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { datedAffiliationParty, splitPerson } from '../public/speech-attribution.js';

const roster = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8'));
const sullivan = roster.people.find(p => p.name === 'Sullivan');
const latham = roster.people.find(p => p.name === 'Mark Latham');
const row = overrides => ({ kind: 'speech', speaker: 'Sullivan', state: 'qld', chamber: 'qld_la',
  date: '2024-02-13', speaker_type: 'member', person_id: 'qld_sullivan', ...overrides });

test('Sullivan’s current Independent party never fills a party-less 2024 speech', () => {
  assert.equal(sullivan.party, 'Independent');
  assert.equal(datedAffiliationParty(row({}), sullivan), null);
  assert.equal(datedAffiliationParty(row({date:'2026-03-03'}), sullivan), null);
  assert.equal(datedAffiliationParty(row({}), {...sullivan, party_now:'Independent'}), null);
});

test('dated affiliation follows party-switch boundaries and the speech’s own house', () => {
  assert.equal(datedAffiliationParty(row({speaker:'Mark Latham',state:'federal',chamber:'representatives',date:'2004-02-13'}),latham),'Labor');
  assert.equal(datedAffiliationParty(row({speaker:'Mark Latham',state:'nsw',chamber:'nsw_lc',date:'2023-08-21'}),latham),'One Nation');
  assert.equal(datedAffiliationParty(row({speaker:'Mark Latham',state:'nsw',chamber:'nsw_lc',date:'2023-08-22'}),latham),'Independent');
  assert.equal(datedAffiliationParty(row({speaker:'Mark Latham',state:'federal',chamber:'representatives',date:'2024-02-13'}),latham),null);
  const dated = {...sullivan, affiliations:[
    {jurisdiction:'qld',chamber:'qld_la',party:'Labor',start:'2024-01-01',end:'2025-05-11'},
    {jurisdiction:'qld',chamber:'qld_la',party:'Independent',start:'2025-05-12',end:'2026-04-09'},
  ]};
  assert.equal(datedAffiliationParty(row({date:'2024-02-13T09:00:00Z'}),dated),'Labor');
  assert.equal(datedAffiliationParty(row({date:'2025-05-11'}),dated),'Labor');
  assert.equal(datedAffiliationParty(row({date:'2025-05-12'}),dated),'Independent');
  assert.equal(datedAffiliationParty(row({date:'2026-04-10'}),dated),null);
});

test('unknown dates, conflicting affiliations and unattributed evidence get no inferred party', () => {
  const dated = {...sullivan, affiliations:[
    {jurisdiction:'qld',chamber:'qld_la',party:'Labor',start:'2024-01-01',end:'2024-09-30'},
  ]};
  for (const overrides of [
    {date:null}, {date:'2024'}, {date:'2024-02-30'}, {date:'invalid'},
    {state:null}, {chamber:null}, {kind:'bill_text'}, {speaker_type:'witness'},
    {witness_name:'Sullivan'}, {speaker_attribution:'unattributed'},
    {speaker_type:'chair'}, {speaker_type:'unknown'}, {date:'2024-10-15'},
    {state:'federal',chamber:'senate_committee'},
  ]) assert.equal(datedAffiliationParty(row(overrides),dated),null,JSON.stringify(overrides));
  assert.equal(datedAffiliationParty(row({}),{...dated,affiliations:[...dated.affiliations,
    {...dated.affiliations[0],party:'Independent'}]}),null);
  assert.equal(datedAffiliationParty(row({}),{...dated,affiliations:[...dated.affiliations,
    {...dated.affiliations[0],party:null}]}),null);
});

const app = ts.createSourceFile('app.js', readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const selected = ['subjectMentions','renderPartyMentions','fillDatedMentionParties'];
const code = app.statements.filter(n=>ts.isFunctionDeclaration(n)&&selected.includes(n.name?.text)).map(n=>n.getText(app)).join('\n');

for (const renderer of ['subjectMentions','renderPartyMentions']) test(`${renderer} preserves labelled parties and uses dated evidence for missing labels`, async () => {
  const results = [
    row({slug:'speech-1',party:null}),
    row({slug:'speech-2',party:'Labor'}),
    row({slug:'speech-3',speaker:'Mark Latham',state:'federal',chamber:'representatives',date:'2004-02-13',party:null}),
    row({slug:'speech-4',speaker:'Mark Latham',state:'nsw',chamber:'nsw_lc',date:'2024-02-13',party:null}),
    row({slug:'speech-5',speaker:'Jimmy Sullivan',party:null}),
  ];
  const metadata = [];
  const slot = {isConnected:true,innerHTML:''};
  const container = {appendChild(){},insertAdjacentHTML(){}};
  const api = runInNewContext(code+';({subjectMentions,renderPartyMentions})', {
    currentSubjectKey:'mentions',URLSearchParams,datedAffiliationParty,splitPerson,
    api:async()=>({results:structuredClone(results)}),loadParliamentarians:async()=>roster,
    document:{createElement:()=>slot},esc:s=>String(s??''),displayTitle:r=>r.slug,
    metaHTML:r=>{metadata.push({slug:r.slug,party:r.party});return String(r.party??'');},
    searchHash:()=>'/search',fetchBriefMap:async()=>({}),
  });
  if(renderer==='subjectMentions') await api.subjectMentions('Sullivan',container,'Mentions');
  else await api.renderPartyMentions('Labor',container,'mentions');
  assert.deepEqual(metadata.map(r=>r.party),[null,'Labor','Labor','Independent',null]);
});
