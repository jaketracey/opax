import * as passageText from '../src/passage-text.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import { isWitness, belongsToScope } from '../public/speech-attribution.js';

const source=ts.createSourceFile('index.ts',readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const slugDeclarations=source.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>/^(?:SLUG_RE|BILL_TEXT_SLUG_RE|PRESS_SLUG_RE|RESEARCH_SLUG_RE|DIVISION_SLUG_RE|isPublicSlug)$/.test(d.name.getText(source)))).map(n=>n.getText(source)).join('\n');
const isPublicSlug=runInNewContext(ts.transpile(slugDeclarations)+'; isPublicSlug');
const handler=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apiResource').getText(source);
async function readSource(texts,slug='research-cpi-mlci-2026',overrides={}) {
  const record={title:'Source record',data:{texts},usermetadata:{classifications:[{labelset:'kind',label:'research_report'}]},...overrides};
  const api=runInNewContext(ts.transpile(handler)+'; apiResource',{
    ...passageText, Response, isPublicSlug, isWitness, belongsToScope, DIVISION_SLUG_RE:/^division-/,
    speakerAttribution: async (_env, speaker) => speaker === 'Stewart' ? {state:'qld',chamber:'qld_la'} : null,
    cacheRequest:()=>new Request('https://opax.test/cache'), cacheBypass:()=>true,
    kbFetch:async()=>Response.json(record), json:data=>Response.json(data),
    cacheStore:()=>{}, withCacheStatus:response=>response, RESOURCE_CACHE_TTL:3600,
  });
  const request=new Request('https://opax.test/api/resource/'+slug);
  return (await api(request,new URL(request.url),slug,{CACHE_EPOCH:'test'},{})).json();
}
const field=body=>({value:{body}});

test('new corpus source pages show t-body text and keep machine summaries separate',async()=>{
  const result=await readSource({'t-body':field('Invitations are not awarded grants.'),'da-summary-t-body':field('Machine summary')});
  assert.equal(result.text,'Invitations are not awarded grants.');
  assert.equal(result.summary,'Machine summary');
  assert.equal(result.labels.kind,'research_report');
});

test('source pages share display cleanup without decoding literal entities twice',async()=>{
  const result=await readSource({body:field('whenMalcolm Turnbullwas prime minister.\n\n So Meat &#38; Livestock &amp;#38;')},'speech-1198151');
  assert.equal(result.text,'when Malcolm Turnbull was prime minister.\n\nSo Meat & Livestock &#38;');
});

test('source documents clear witness and other-house MP fields while preserving own parliamentary rows',async()=>{
 const record = (chamber,speaker_type,metadata={}) => ({
  origin:{collaborators:['Stewart']},
  usermetadata:{classifications:Object.entries({kind:'speech',state:chamber==='qld_la'?'qld':'federal',chamber,speaker_type,party:'Labor'}).map(([labelset,label])=>({labelset,label}))},
  extra:{metadata:{person_id:'11011',electorate:'Townsville',...metadata}},
 });
 for(const input of [record('qld_la','witness'),record('senate_committee','witness'),record('qld_la','member',{witness_name:'Stewart'}),record('representatives','member')]) {
  const result=await readSource({body:field('Original testimony.')},'speech-123',input);
  assert.equal(result.speaker_attribution,'unattributed');
  assert.equal(result.labels.party,undefined);
  assert.equal(result.metadata.person_id,null);
  assert.equal(result.metadata.electorate,null);
 }
 const own=await readSource({body:field('Own parliamentary speech.')},'speech-124',record('qld_la','member'));
 assert.equal(own.speaker_attribution,null);
 assert.equal(own.labels.party,'Labor');
 assert.equal(own.metadata.person_id,'11011');
});
test('existing speech body chunks retain numeric order',async()=>{
  const result=await readSource({'body-10':field(' Ten.'),'body-2':field(' Two.'),body:field('Original.'),'body-1':field(' One.')},'speech-1205768');
  assert.equal(result.text,'Original. One. Two. Ten.');
});
test('a migrated record shows its standard body once',async()=>{
  const result=await readSource({body:field('Current source.'),'t-body':field('Old source.')});
  assert.equal(result.text,'Current source.');
});
test('generated summaries are never substituted for missing source text',async()=>{
  const result=await readSource({'da-summary-t-body':field('Generated summary')});
  assert.equal(result.text,'');
});


test('verified venue note sources are readable while unrelated slugs stay closed',async()=>{
 for(const slug of ['grantconnect-award-ga580272','grantconnect-award-ga580272-v1','grant-site-evidence-mlci-invitation-067','grant-site-evidence-mlci-invitation-070','grant-site-evidence-ga566033']) {
  assert.equal(isPublicSlug(slug),true);
  const result=await readSource({'t-body':field('Derived venue evidence, not an award or payment.')},slug);
  assert.equal(result.text,'Derived venue evidence, not an award or payment.');
 }
 for(const slug of ['grant-site-evidence-admin','grant-site-evidence-mlci-invitation-067/secret','grant-site-evidence-mlci-invitation-67','../members','grant-site-evidence-gaNaN'])assert.equal(isPublicSlug(slug),false);
});


test('full bill text resources are readable without including generated summaries',async()=>{
 const slug='bill-text-au-federal-r7451-aspassed';
 assert.equal(isPublicSlug(slug),true);
 const result=await readSource({body:field('Section 1.\n\n'),'body-1':field('Schedule 1.\nFinal provision.'),'da-summary-t-body':field('Summary only.')},slug);
 assert.equal(result.text,'Section 1.\n\nSchedule 1.\nFinal provision.');
 for(const bad of ['bill-text-../secret','bill-text-au-federal-r7451/aspassed','bill-text-au-federal-'])assert.equal(isPublicSlug(bad),false);
});
