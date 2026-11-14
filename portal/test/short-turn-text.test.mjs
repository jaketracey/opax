// Short speech turns (under SHORT_TURN_WORDS) show their own text: /api/resource
// sends summary null, search rows carry word_count, and the web clients leave
// short turns out of /api/brief. Other kinds and unknown lengths keep the brief.
import {speechPresentation, joinMixedSpeakers} from '../src/mixed-speakers.ts';
import {pressHeadlineAndText, pressTitle} from '../src/press-title.ts';
import * as passageText from '../src/passage-text.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {isWitness, belongsToScope, scopeFilter, personScope, scopedCollaborators} from '../public/speech-attribution.js';
import {personNameKey} from '../public/canonical-urls.js';
import {personIndex} from '../src/person-slug.ts';
import {searchFind} from '../src/search-find.ts';

const source=ts.createSourceFile('index.ts',readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const pick=(...names)=>ts.transpile(source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)||
  ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(source)))).map(n=>n.getText(source)).join('\n'),{target:ts.ScriptTarget.ES2022});
const words=n=>Array.from({length:n},(_,i)=>`word${i}`).join(' ');
const field=body=>({value:{body}});
const rid=c=>c.repeat(32);

async function readTurn({body='',metadata={},kind='speech',slug='speech-1'}={}) {
  const record={id:rid('a'),title:'Example MP, 1 September 2026',origin:{collaborators:['Example MP']},
    usermetadata:{classifications:[{labelset:'kind',label:kind}]},extra:{metadata},
    data:{texts:{body:field(body),'da-summary-t-body':field('Machine brief.')}}};
  const api=runInNewContext(pick('SHORT_TURN_WORDS','shortTurn','apiResource')+'; apiResource',{
    ...passageText, Response, speechPresentation, joinMixedSpeakers, pressHeadlineAndText, pressTitle, isWitness, belongsToScope,
    isPublicSlug:()=>true, DIVISION_SLUG_RE:/^division-/, speakerAttribution:async()=>null,
    cacheRequest:()=>new Request('https://opax.test/cache'), cacheBypass:()=>true,
    kbFetch:async()=>Response.json(record), json:data=>Response.json(data),
    cacheStore:()=>{}, withCacheStatus:response=>response, RESOURCE_CACHE_TTL:3600,
  });
  const request=new Request(`https://opax.test/api/resource/${slug}`);
  return (await api(request,new URL(request.url),slug,{CACHE_EPOCH:'test'},{})).json();
}

test('a 79-word turn sends no brief and an 80-word turn keeps it, by metadata word_count',async()=>{
  assert.equal((await readTurn({body:words(79),metadata:{word_count:79}})).summary,null);
  assert.equal((await readTurn({body:words(80),metadata:{word_count:80}})).summary,'Machine brief.');
  // The stored count wins over the text in hand.
  assert.equal((await readTurn({body:words(10),metadata:{word_count:120}})).summary,'Machine brief.');
});

test('without a numeric word_count the turn text is counted',async()=>{
  const short=await readTurn({body:words(79)});
  assert.equal(short.summary,null);
  assert.equal(short.text,words(79));
  assert.equal((await readTurn({body:words(80)})).summary,'Machine brief.');
  assert.equal((await readTurn({body:words(20),metadata:{word_count:'500'}})).summary,null);
});

test('an unknown length keeps the brief',async()=>{
  assert.equal((await readTurn()).summary,'Machine brief.');
});

test('short press releases, research notes and grants keep their brief',async()=>{
  for(const [kind,slug] of [['press_release','press-12'],['research_report','research-cpi-2026'],['grant','grant-7']]) {
    assert.equal((await readTurn({kind,slug,body:words(20),metadata:{word_count:20}})).summary,'Machine brief.',kind);
    assert.equal((await readTurn({kind,slug,body:words(20)})).summary,'Machine brief.',kind);
  }
});

function briefApi(records) {
  const calls=[], puts=[];
  const api=runInNewContext(pick('BRIEF_MAX','RID_RE','BRIEF_CACHE_VERSION','apiBrief')+'; apiBrief',{
    Response, Request, URL, json:data=>Response.json(data), withCacheStatus:response=>response,
    caches:{default:{match:async()=>undefined,put:async(key)=>{puts.push(key.url)}}},
    kbFetch:async(_env,path)=>{
      calls.push(path);
      const [,id]=/^\/resource\/([0-9a-f]{32})\/text\/da-summary-t-body$/.exec(path);
      const brief=records[id];
      return brief ? Response.json(field(brief)) : Response.json({detail:'not found'},{status:404});
    },
  });
  return {calls,puts,read:async ids=>(await (await api(new URL(`https://opax.test/api/brief?rids=${ids.join(',')}`),{})).json()).briefs};
}

test('/api/brief makes one KB call per rid and caches under a versioned key',async()=>{
  const {calls,puts,read}=briefApi({[rid('a')]:'Brief one.',[rid('b')]:'Brief two.'});
  assert.deepEqual(await read([rid('b'),rid('a'),rid('c')]),{[rid('a')]:'Brief one.',[rid('b')]:'Brief two.'});
  assert.deepEqual(calls.sort(),[rid('a'),rid('b'),rid('c')].map(id=>`/resource/${id}/text/da-summary-t-body`));
  assert.equal(puts.length,1);
  assert.match(puts[0],/[?&]v=short-turn-v1(&|$)/,'answers cached before the short-turn rule must not be replayed');
});

test('search rows carry the stored word_count, null when unknown',async()=>{
  const row=(n,metadata)=>[rid(n),{slug:`speech-${n.charCodeAt(0)}`,title:'Example MP',origin:{collaborators:['Example MP']},
    usermetadata:{classifications:[{labelset:'kind',label:'speech'}]},extra:{metadata},fields:{}}];
  const resources=Object.fromEntries([row('a',{word_count:42}),row('b',{word_count:'42'}),row('c',{})]);
  const api=runInNewContext(pick('searchWindow','filterExpression','canonicalSpeaker','TOPIC_SLUGS','speakerAttribution','foldName')+';searchWindow',{
    ...passageText, URL, Response, isWitness, belongsToScope, scopeFilter, personScope, scopedCollaborators, personNameKey, personIndex, searchFind,
    speechPresentation, joinMixedSpeakers, pressTitle, SLUG_RE:/^speech-(\d+)$/, DIVISION_SLUG_RE:/^division-/,
    stripListingBoilerplate:s=>s, calibrate:s=>s, speakerPrints:async()=>null,
    label:(r,key)=>r.usermetadata.classifications.find(c=>c.labelset===key)?.label,
    loadPeople:async()=>({byFold:new Map()}),
    kbFetch:async()=>Response.json({resources}),
  });
  const result=await api({},{q:'turn',mode:'keyword',kind:'speech',topK:20,url:new URL('https://opax.test/api/search?q=turn')});
  const counts=Object.fromEntries(result.results.map(r=>[r.resource,r.word_count]));
  assert.deepEqual(counts,{[rid('a')]:42,[rid('b')]:null,[rid('c')]:null});
});

// The web clients decide which rids go to /api/brief.
function clientBriefWanted(file) {
  const js=readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8');
  const client=ts.createSourceFile(file,js,ts.ScriptTarget.Latest,true);
  const code=client.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='briefWanted'||
    ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(client)==='SHORT_TURN_WORDS')).map(n=>n.getText(client)).join('\n');
  return runInNewContext(code+';briefWanted');
}

for(const file of ['app.js','timemachine.js']) {
  test(`${file} leaves only short speech turns out of /api/brief`,()=>{
    const wanted=clientBriefWanted(file);
    assert.equal(wanted({kind:'speech',word_count:79}),false);
    assert.equal(wanted({kind:'speech',word_count:80}),true);
    assert.equal(wanted({kind:'speech',word_count:null}),true,'unknown length keeps the brief');
    assert.equal(wanted({kind:'speech'}),true,'rows from other endpoints keep the brief');
    assert.equal(wanted({kind:'press_release',word_count:20}),true);
    assert.equal(wanted({kind:'research_report',word_count:20}),true);
  });
}

test('app.js fetchBriefMap and timemachine.js applyBriefs filter through briefWanted',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/async function fetchBriefMap\(resources\) \{[\s\S]{0,200}\.filter\(briefWanted\)/);
  const tm=readFileSync(new URL('../public/timemachine.js',import.meta.url),'utf8');
  assert.match(tm,/applyBriefs\([^\n]*\.filter\(briefWanted\)/);
  // The clients mirror the server's threshold.
  const server=/const SHORT_TURN_WORDS = (\d+)/.exec(source.getFullText())[1];
  for(const js of [app,tm]) assert.equal(/const SHORT_TURN_WORDS = (\d+)/.exec(js)[1],server);
});
