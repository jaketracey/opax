import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';

const built = await build({stdin:{contents:"export * from './src/person-name-matching'; export * from './src/person-slug'; export * from './src/roster-person';",resolveDir:new URL('../',import.meta.url).pathname,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {resolvePersonName,personIndex,rosterPerson} = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const people=[{name:'Bill Example',pid:'19999',speeches:50,aliases:['William Richard Example','William Example']},{name:'Bob Sample',pid:'19998',speeches:10,aliases:['Robert Charles Sample']}];

test('explicit legal and preferred names resolve to the same canonical person',()=>{
 for(const [name,canonical] of [['William Richard Example','Bill Example'],['William Example','Bill Example'],['Robert Charles Sample','Bob Sample']]) {
  const r=resolvePersonName(name,people);
  assert.equal(r.status,'matched'); assert.equal(r.candidates[0].person.name,canonical);
  assert.equal(rosterPerson({people},name),canonical);
 }
});

test('shared aliases remain ambiguous regardless of speech counts',()=>{
 const rows=people.map(p=>({...p,aliases:['Shared Person']}));
 assert.equal(resolvePersonName('Shared Person',rows).status,'ambiguous');
 assert.equal(rosterPerson({people:rows},'Shared Person'),null);
 assert.equal(personIndex(rows).addresses.has('shared person'),false);
});

test('aliases provide addresses without becoming speech filters and exact names retain their owner',()=>{
 const index=personIndex(people);
 assert.equal(index.addresses.get('william richard example').name,'Bill Example');
 assert.equal(index.byFold.has('william richard example'),false);
 const rows=[...people,{name:'William Example',pid:'19997',speeches:1}];
 assert.equal(personIndex(rows).addresses.get('william example').pid,'19997');
});

test('the published aliases are addressable and the service profile has no borrowed speeches',()=>{
 const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
 const index=personIndex(roster.people);
 for(const [name,canonical] of [['William Richard Shorten','Bill Shorten'],['Robert Charles Grant Sercombe','Bob Sercombe'],['Alan Gordon Griffiths','Alan Griffiths']]) {
  assert.equal(rosterPerson(roster,name),canonical);
  assert.equal(index.addresses.get(name.toLowerCase()).name,canonical);
 }
 const alan=roster.people.find(p=>p.name==='Alan Griffiths');
 assert.equal(alan.pid,'10268'); assert.equal(alan.speeches,0); assert.equal(alan.roster_only,true);
});


test('two spellings with one verified id share a source-alias address',()=>{
 const rows=[people[0],{...people[0],name:'William Example',speeches:1}];
 assert.equal(personIndex(rows).addresses.get('william richard example').name,'Bill Example');
 assert.equal(rosterPerson({people:rows},'William Richard Example'),'Bill Example');
});


test('an exact printed full name wins over an alias on another row',()=>{
 const rows=[{name:'Alex Example',pid:'19996',speeches:147},{name:'Alex Sample',pid:'19995',speeches:900,aliases:['Alex Example']}];
 const match=resolvePersonName('Alex Example',rows);
 assert.equal(match.status,'matched');
 assert.equal(match.candidates[0].person.name,'Alex Example');
 assert.equal(rosterPerson({people:rows},'Alex Example'),'Alex Example');
 assert.equal(resolvePersonName('Alex Example',[...rows,{name:'Alex Example',pid:'19994'}]).status,'ambiguous');
});

test('Sophie Panopoulos keeps her exact speech filter despite the Mirabella alias',()=>{
 const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
 const match=resolvePersonName('Sophie Panopoulos',roster.people);
 assert.equal(match.status,'matched');
 assert.equal(match.candidates[0].person.name,'Sophie Panopoulos');
 assert.equal(match.candidates[0].person.speeches,147);
 assert.equal(rosterPerson(roster,'Sophie Panopoulos'),'Sophie Panopoulos');
});

test('an ambiguous surname cannot choose the most prolific person',()=>{
 const rows=[{name:'Alex Example',speeches:9999},{name:'Jo Example',speeches:1}];
 assert.equal(rosterPerson({people:rows},'Example'),null);
 const roster=JSON.parse(readFileSync(new URL('../public/parliamentarians.json',import.meta.url),'utf8'));
 assert.equal(rosterPerson(roster,'Bishop'),null);
});
