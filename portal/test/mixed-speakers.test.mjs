import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import * as attribution from '../public/speech-attribution.js';
import {speechPresentation, joinMixedSpeakers} from '../src/mixed-speakers.ts';

const app = ts.createSourceFile('app.js', readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const functions = ['groupAvatarHTML','participantLinksHTML','speechIdentityHTML','metaHTML','topicArcItemHTML','sourceItem','keySpeechItem','quoteCardHTML','renderResults','billSpeechesHTML','bylinePortrait'];
const declarations = app.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.includes(n.name?.text)).map(n=>n.getText(app)).join('\n');
const plain = x=>JSON.parse(JSON.stringify(x));
function renderers(row) {
  const document = new JSDOM('<ul id="search-results"></ul>').window.document;
  const ctx = {...attribution, attributionHelpers: attribution, document,
    esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    entityHrefAttr:href=>`href="${href}"`,subjectHash:(_kind,name)=>'/subject/person/'+name.toLowerCase().replaceAll(' ','-'),
    photoUrlFor:()=>'/photos/fixture.webp',hasEntityId:()=>true,loadPhotoMap:async()=>{},decorateMetaPortraits:()=>{},
    STATE_NAMES:{federal:'Federal'},PARLIAMENT_NAMES:{federal:'Federal Parliament'},isCommitteeChamber:()=>false,
    GENERIC_DEBATE_RE:/^Questions without Notice$/,titleSubject:r=>r.nameOnly ? '' : r.debate || 'Debate heading',displayTitle:r=>r.debate || 'Debate heading',
    cleanPassage:s=>s||'',fmtDate:s=>s,partyChipHTML:s=>s,machineLabelHTML:()=>'',excerptNoticeHTML:()=>'',
    titleKey:s=>s,searchResultHref:r=>'/doc/'+r.slug,URL,location:{origin:'https://local.test'},metaLabel:()=>'',
    recordTypeLink:()=> 'Speech',highlightHTML:s=>s,searchReadMode:'passages',requestAnimationFrame:()=>{},refreshSearchPassageFolds:()=>{},
    lastSearch:{briefs:{},query:'',filters:{}},$:id=>document.getElementById(id),BILL_SPEECH_BRIEF_NOTE:'Fixture',billStage:s=>s,sourceLineHTML:()=>'',
  };
  const api = runInNewContext(declarations+';({'+functions.join(',')+'})',ctx);
  api.renderResults([row]);
  return [api.metaHTML(row,{portrait:true,linkSpeaker:true}),api.topicArcItemHTML(row,null,true),
    api.sourceItem(row,1,true).outerHTML,api.keySpeechItem(row).outerHTML,api.quoteCardHTML(row,0,1),document.body.innerHTML,
    api.billSpeechesHTML({speeches:[row],modulePrivacy:()=>false})];
}

function relatedCards(row) {
  const document = new JSDOM().window.document;
  const el = (tag, cls, content) => {
    const node=document.createElement(tag); if(cls)node.className=cls;
    if(typeof content==='string')node.textContent=content;
    else if(content)for(const [key,value] of Object.entries(content))node.setAttribute(key,value);
    return node;
  };
  const context={...attribution,document,el,fmtDate:s=>s,parliamentName:()=> 'Federal Parliament',
    personUrl:()=>'/subject/person/example-mp',partyUrl:()=>'/subject/party/labor',cardTitle:r=>r.debate,
    clipText:s=>s,passage:s=>s||'',subjectOf:()=>'',STATE_NAMES:{federal:'Federal'},partyChip:()=>el('span'),
    citedSources:()=>[row],fetch:async()=>Response.json({'example mp':'fixture'}),Response};
  const select=(file,name)=>{
    const source=ts.createSourceFile(file,readFileSync(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);let found;
    const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(source);ts.forEachChild(node,visit)};visit(source);
    assert.ok(found,name);return runInNewContext(ts.transpile(found)+';'+name,context);
  };
  const tm=select('../public/timemachine.js','makeCard')('Fixture topic',row);
  const tvn=select('../public/thenvsnow.js','sourceRow')(row,'Fixture title');
  const graph=select('../graph/explain.ts','sourceList')({sources:[row]},
    {displayTitle:r=>r.debate,subjectHash:()=>'/subject/person/example-mp',partyChipHTML:()=> 'Labor'});
  return [tm.outerHTML,tvn.outerHTML,graph.outerHTML];
}

for (const [speaker_type,speaker,expected] of [
  ['multi_speaker',null,'Several speakers'],['member','Example MP','Example MP'],
  ['chair',null,'Chair'],['witness','Fictional Witness','Fictional Witness'],
  [null,null,'Speaker not named'],['unattributed',null,'Speaker not named'],['unknown',null,'Unknown speaker'],
]) test(`all speech cards render ${speaker_type ?? 'null'} honestly`,()=>{
  const row={kind:'speech',speaker_type,speaker,resource:'a'.repeat(32),slug:'speech-1',title:'Original title',date:'2026-09-17',state:'federal',snippet:'Original passage',debate:'Questions without Notice',
    participants:speaker_type==='multi_speaker'?[{name:'Example MP',person_id:'123'}]:[]};
  const html=renderers(row);
  // Bill links keep the date for ordinary unattributed evidence; all other cards label it.
  for (const card of html.slice(0,-1)) assert.ok(card.includes(expected),card);
  if (speaker_type==='multi_speaker') for (const card of html) {
    assert.match(card,/Several speakers/);assert.match(card,/speech-group-avatar/);
    assert.doesNotMatch(card,/Speaker not named|topic-arc-face-none|quote-portrait/);
    assert.match(card,/subject\/person\/example-mp/);assert.match(card,/fixture.webp/);
  }
  if(speaker_type==='witness') for(const card of html.slice(0,6))assert.match(card,/witness/);
  for (const card of relatedCards(row)) {
    assert.ok(card.includes(expected),card);
    if(speaker_type==='multi_speaker') {assert.match(card,/speech-group-avatar/);assert.doesNotMatch(card,/Speaker not named|Speaker not recorded/);assert.match(card,/subject\/person\/example-mp/)}
    if(speaker_type==='witness')assert.match(card,/witness/);
  }
});

test('mixed rows cannot acquire personal scope or affiliation from stale fields or participants',()=>{
  const row={kind:'speech',speaker_type:'multi_speaker',speaker:'Example MP',person_id:'123',party:'Labor',state:'federal',chamber:'representatives',date:'2026-09-17'};
  assert.equal(attribution.isUnattributed(row),true);
  assert.equal(attribution.belongsToScope(row,{state:'federal',chamber:'representatives'}),false);
  assert.equal(attribution.isWitness({...row,chamber:'house_committee',person_id:null}),false);
  assert.equal(attribution.isWitness({speaker_type:'member',chamber:'house_committee',person_id:null}),true);
  assert.equal(attribution.isWitness({speaker_type:'chair',chamber:'house_committee',person_id:null}),false);
  const presentation=speechPresentation('multi_speaker',{legacy_speaker_raw:'Example MP',date:row.date,speaker_participants:[{name:'Example MP',person_id:'123',speaker_type:'member'}]},'Example MP — Questions without Notice — 2026-09-17');
  assert.equal(presentation.debate,'Questions without Notice');
  assert.equal(presentation.speaker,null);assert.equal(presentation.person_id,null);assert.equal(presentation.party,null);
  assert.equal(attribution.speakerLabel(row),'Several speakers');
});

test('only resolved parliamentarians survive, in source order, with chair roles preserved',()=>{
  assert.deepEqual(attribution.resolvedParticipants([
    {name:'Example MP',person_id:123,speaker_type:'member'},
    {name:'Fictional Witness',person_id:'123',speaker_type:'witness'},
    {name:'No identity',person_id:null},{name:'Unknown',person_id:'state_1'},
    {name:'Example MP',person_id:'123',speaker_type:'member'},
    {name:'Example Chair',person_id:'124',speaker_type:'chair',chair_roles:['Speaker']},
  ]),[{name:'Example MP',person_id:'123'},{name:'Example Chair',person_id:'124',role:'Speaker'}]);
});

test('optional RID asset is joined once per shard without creating personal credit',async()=>{
  const calls=[];const rid='ab'+'1'.repeat(30),other='ab'+'2'.repeat(30);
  const rows=[{resource:rid,speaker_type:'multi_speaker',speaker:'Stale MP',person_id:'123',party:'Labor'},
    {resource:other,speaker_type:'multi_speaker'},{resource:rid,speaker_type:'member',speaker:'Member'}];
  const assets={fetch:async req=>{calls.push(req.url);if(req.url.endsWith('/index.json'))return Response.json({schema:1,shards:['a']});return Response.json({schema:1,resources:{[rid]:{debate:'Verified debate',participants:[{name:'Example MP',person_id:'123'},{name:'Example Chair',person_id:'124',role:'Speaker'}]}}});}};
  await joinMixedSpeakers(rows,assets);
  assert.equal(calls.length,2);assert.match(calls[1],/mixed-speakers\/a.json$/);
  assert.deepEqual(rows[0].participants,[{name:'Example MP',person_id:'123'},{name:'Example Chair',person_id:'124',role:'Speaker'}]);
  assert.equal(rows[0].speaker,null);assert.equal(rows[0].person_id,null);assert.equal(rows[0].party,null);
  assert.equal(rows[2].speaker,'Member');assert.equal(rows[2].participants,undefined);
});

test('absent, malformed and SPA-fallback assets leave embedded participants usable',async()=>{
  for(const fetch of [async()=>new Response(null,{status:404}),async()=>new Response('<html>shell</html>',{headers:{'content-type':'text/html'}}),async()=>Response.json({schema:2}),async()=>{throw Error('absent')}]) {
    const row={resource:'ab'+'1'.repeat(30),speaker_type:'multi_speaker',participants:[{name:'Example MP',person_id:'123'}],debate:'Embedded heading'};
    await joinMixedSpeakers([row],{fetch});assert.equal(row.debate,'Embedded heading');assert.equal(row.participants.length,1);assert.equal(row.person_id,null);
  }
  const rows=[{speaker_type:'multi_speaker'}];assert.equal(await joinMixedSpeakers(rows),rows);
});


test('byline-only witness sources retain their witness label',()=>{
 const html=renderers({kind:'speech',speaker_type:'witness',speaker:'Fictional Witness',slug:'speech-1',title:'Fictional Witness — 2026-09-17',date:'2026-09-17',nameOnly:true});
 assert.match(html[2],/source-name-only/);assert.match(html[2],/topic-arc-witness/);
 assert.equal(attribution.speakerLabel({speaker_type:'future_type'}),'Unknown speaker');
});

test('dated debate headings survive legacy byline aliases without inventing a speaker',()=>{
 const p=speechPresentation('multi_speaker',{legacy_speaker_raw:'Example alias',date:'2026-09-17'},'Example MP — Questions without Notice — 2026-09-17');
 assert.equal(p.debate,'Questions without Notice');assert.equal(p.speaker,null);assert.equal(p.person_id,null);
 const bare=speechPresentation('multi_speaker',{legacy_speaker_raw:'Example MP',date:'2026-09-17'},'Example MP — 2026-09-17');
 assert.equal(bare.debate,'Parliamentary debate');
});
