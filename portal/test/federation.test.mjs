import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {CHAMBER_LABELS, chamberLabel} from '../public/labels.js';
import {questionChamber, ASK_CHAMBERS} from '../src/ask-chamber.ts';
import {belongsToScope, scopeFilter, datedAffiliationParty} from '../public/speech-attribution.js';
import {countedMember} from '../src/ask-member-label.ts';

const source = readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const parsed = ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const names = new Set(['filterExpression','validateFilters','KINDS','STATES','MODES','NAME_RE','TOPIC_SLUGS','FILTER_KEYS']);
const selected = parsed.statements.filter(n=>ts.isFunctionDeclaration(n)?names.has(n.name?.text):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(parsed)))).map(n=>n.getText(parsed)).join('\n');
const ctx={MAX_YEAR:2100,MIN_YEAR:1900,MAX_PARTY_CHARS:64,MAX_SPEAKER_CHARS:120,canonicalSpeaker:s=>s};
runInNewContext(ts.transpile(selected),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));

test('Federation has an explicit narrow filter and House includes both logical chambers',()=>{
  assert.equal(ctx.validateFilters(k=>k==='chamber'?'federation':undefined),null);
  const fed=plain(ctx.filterExpression({chamber:'federation'}));
  const house=plain(ctx.filterExpression({chamber:'representatives'}));
  assert.match(JSON.stringify(fed),/"label":"federation"/);
  assert.doesNotMatch(JSON.stringify(fed),/"label":"representatives"/);
  assert.match(JSON.stringify(house),/"or":\[\{"prop":"label","labelset":"chamber","label":"representatives"\},\{"prop":"label","labelset":"chamber","label":"federation"\}\]/);
  assert.equal(ctx.validateFilters(k=>k==='chamber'?'unknown':undefined),'unknown chamber');
});

test('Main Committee and Federation questions share the same chamber key',()=>{
  assert.equal(questionChamber('Speeches in the Main Committee in 2009'),'federation');
  assert.equal(questionChamber('Federation Chamber education debate'),'federation');
  assert.ok(ASK_CHAMBERS.includes('federation'));
  assert.equal(chamberLabel('federation'),'Federation Chamber');
});

test('chamber selection survives URL, pagination, reset and cancelled drafts',()=>{
  assert.match(html,/<select id="f-chamber"[\s\S]*?<option value="federation">Federation Chamber \(formerly Main Committee\)<\/option>/);
  assert.match(app,/chamber: \$\("f-chamber"\)\.value/);
  assert.match(app,/const ids = \[[^\]]*"f-chamber"/);
  assert.match(app,/for \(const name of \["speaker", "party", "state", "chamber", "topic"\]\)/);
  assert.match(app,/chamber: \(\) => \{ delete searchCitationScope.chamber; \$\("f-chamber"\).value = "";/);
});

test('CSV, BibTeX and RIS retain the recorded logical chamber and citations',()=>{
  const names=['sourcesCSV','csvCell','bibtexFor','risFor'];
  const fragments=names.map(name=>app.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0]).filter(Boolean);
  // Execute the source export functions with a recorded Federation passage.
  const ctx={chamberLabel,corpusVersion:()=> 'fixture',localISODate:()=> '2026-11-14',
    exportHeader:()=>'',searchResultUrl:r=>'/doc/'+r.slug,splitName:()=>({family:'Example',given:'Alex'})};
  runInNewContext(fragments.join('\n'),ctx);
  const row={slug:'speech-41',kind:'speech',title:'Evidence',speaker:'Alex Example',date:'2009-02-03',chamber:'federation'};
  const csv=ctx.sourcesCSV([row],[]);
  assert.match(csv,/excerpt_label,chamber,chamber_name\n/);
  assert.match(csv,/\/doc\/speech-41,,,federation,Federation Chamber/);
  assert.match(ctx.risFor(row),/PB  - Federation Chamber/);
  assert.match(ctx.bibtexFor(row),/institution = \{Federation Chamber\}/);
  assert.match(app,/institution = \{\$\{chamberLabel\(s.chamber \|\| s.labels\?\.chamber\)\}\}/);
});

test('directory chamber counts and live speech counts can name Federation separately',()=>{
  assert.equal(CHAMBER_LABELS.federation,'Federation Chamber');
  assert.match(app,/federation: "Federation Chamber"/);
  assert.match(app,/fill\(\$\("stats-chambers"\), Object.entries\(uiLabels.CHAMBER_LABELS\), live.speeches_by_chamber\)/);
  assert.match(html,/id="stats-chambers"/);
});

test('Federation passages use dated House service and never Senate service',()=>{
  const row={kind:'speech',state:'federal',chamber:'federation',date:'2009-02-03',speaker:'Alex Example'};
  const scope={state:'federal',chamber:'representatives',service:[{start:'2000-01-01',end:'2010-01-01'}]};
  assert.equal(belongsToScope(row,scope),true);
  assert.equal(belongsToScope({...row,date:'2011-01-01'},scope),false);
  assert.equal(belongsToScope(row,{...scope,chamber:'senate'}),false);
  assert.match(JSON.stringify(scopeFilter(scope)),/"label":"federation"/);
  const person={affiliations:[{jurisdiction:'federal',chamber:'representatives',party:'Labor',start:'2000-01-01',end:'2010-01-01'},
    {jurisdiction:'federal',chamber:'senate',party:'Liberal',start:'2000-01-01',end:'2010-01-01'}]};
  assert.equal(datedAffiliationParty(row,person),'Labor');
  assert.equal(countedMember('Alex Example',{people:[{name:'Alex Example',chambers:['representatives']}]},'federation').name,'Alex Example');
  assert.equal(countedMember('Alex Example',{people:[{name:'Alex Example',chambers:['senate']}]},'federation'),undefined);
});
