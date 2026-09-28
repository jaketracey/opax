import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const pick=(re,what)=>{const m=re.exec(app);assert.ok(m,`app.js still defines ${what}`);return m[0];};
const source=[
  pick(/const isCommitteeChamber = [^\n]*\n/,'isCommitteeChamber'),
  pick(/function committeeHouse\(chamber\) \{[\s\S]*?\n\}\n/,'committeeHouse'),
  pick(/function committeeOf\(r\) \{[\s\S]*?\n\}\n/,'committeeOf'),
  pick(/const CHAMBER_NAMES = \{[\s\S]*?\n\};\n/,'CHAMBER_NAMES'),
  pick(/const DIR_CHAMBERS = \{[\s\S]*?\n\};\n/,'DIR_CHAMBERS'),
].join('\n')+'\n({isCommitteeChamber,committeeHouse,committeeOf,CHAMBER_NAMES,DIR_CHAMBERS})';
const {isCommitteeChamber,committeeHouse,committeeOf,CHAMBER_NAMES,DIR_CHAMBERS}=runInNewContext(source,{});

test('all three committee chambers are committee chambers and name their House',()=>{
 for(const [code,house] of [['senate_committee','Senate'],['house_committee','House'],['joint_committee','Joint']]){
  assert.equal(isCommitteeChamber(code),true,code);
  assert.equal(committeeHouse(code),house,code);
 }
 for(const code of ['senate','representatives','nsw_la','',null,undefined])assert.equal(isCommitteeChamber(code),false,String(code));
});

test('the document byline and the directory filter have a name for each committee chamber',()=>{
 assert.equal(CHAMBER_NAMES.senate_committee,'Senate committees');
 assert.equal(CHAMBER_NAMES.house_committee,'House committees');
 assert.equal(CHAMBER_NAMES.joint_committee,'Joint committees');
 assert.equal(CHAMBER_NAMES.representatives,'House of Representatives');      // the existing names are untouched
 assert.equal(DIR_CHAMBERS.house_committee,'House committees');
 assert.equal(DIR_CHAMBERS.joint_committee,'Joint committees');
 assert.equal(DIR_CHAMBERS.senate_committee,'Senate committees');
});

test('the byline and the bracketed-context line no longer special-case the Senate',()=>{
 assert.doesNotMatch(app,/labels\?\.chamber === "senate_committee"/);
 assert.match(app,/isCommitteeChamber\(doc\.labels\?\.chamber\) && context\[1\] === debate/);
 assert.match(app,/const chamber = CHAMBER_NAMES\[String\(doc\.labels\?\.chamber \|\| ""\)\.toLowerCase\(\)\];/);
});

test('the committee is what precedes the first " - " of the topic, for Senate, House and Joint titles alike',()=>{
 assert.equal(committeeOf({title:'Lopez — Environment and Communications Legislation Committee - Environment and Communications Legislation Committee 27/05/2026 Budget Estimates 2026-27 — 2026-05-27'}),'Environment and Communications Legislation Committee');
 assert.equal(committeeOf({title:'Kennedy — Standing Committee on Economics - Review of the Reserve Bank of Australia Annual Report 2025 — 2026-09-18'}),'Standing Committee on Economics');
 assert.equal(committeeOf({title:'Chaney — Joint Select Committee on Artificial Intelligence — 2026-09-18'}),'Joint Select Committee on Artificial Intelligence');
 assert.equal(committeeOf({title:'Standing Committee on Economics - Inquiry'}),'Standing Committee on Economics');
 assert.equal(committeeOf({}),'');
});

test('the Worker names committee chambers in share cards instead of printing the database code',()=>{
 assert.match(worker,/const COMMITTEE_CHAMBER_NAMES: Record<string, string> = \{\s*senate_committee: 'Senate committees', house_committee: 'House committees', joint_committee: 'Joint committees',\s*\}/);
 assert.match(worker,/const chamber = CHAMBER_NAMES\[r\.labels\.chamber\] \?\? COMMITTEE_CHAMBER_NAMES\[r\.labels\.chamber\] \?\? r\.labels\.chamber/);
 // the House-a-person-sits-in map is unchanged, so person pages read as before
 assert.match(worker,/const CHAMBER_NAMES: Record<string, string> = \{\s*representatives: 'House of Representatives', senate: 'Senate',\s*assembly: 'Legislative Assembly', council: 'Legislative Council',\s*\}/);
});
