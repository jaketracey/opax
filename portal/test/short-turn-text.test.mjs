// Short turns (under SHORT_TURN_WORDS) show their own text: /api/resource sends
// summary null and /api/brief leaves them out. An unknown length keeps the brief.
import {speechPresentation, joinMixedSpeakers} from '../src/mixed-speakers.ts';
import {pressHeadlineAndText, pressTitle} from '../src/press-title.ts';
import * as passageText from '../src/passage-text.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {isWitness, belongsToScope} from '../public/speech-attribution.js';

const source=ts.createSourceFile('index.ts',readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const pick=(...names)=>ts.transpile(source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)||
  ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(source)))).map(n=>n.getText(source)).join('\n'),{target:ts.ScriptTarget.ES2022});
const words=n=>Array.from({length:n},(_,i)=>`word${i}`).join(' ');
const field=body=>({value:{body}});
const rid=c=>c.repeat(32);

async function readTurn({body='',metadata={}}={}) {
  const record={id:rid('a'),title:'Example MP, 1 September 2026',origin:{collaborators:['Example MP']},
    usermetadata:{classifications:[{labelset:'kind',label:'speech'}]},extra:{metadata},
    data:{texts:{body:field(body),'da-summary-t-body':field('Machine brief.')}}};
  const api=runInNewContext(pick('SHORT_TURN_WORDS','shortTurn','apiResource')+'; apiResource',{
    ...passageText, Response, speechPresentation, joinMixedSpeakers, pressHeadlineAndText, pressTitle, isWitness, belongsToScope,
    isPublicSlug:()=>true, DIVISION_SLUG_RE:/^division-/, speakerAttribution:async()=>null,
    cacheRequest:()=>new Request('https://opax.test/cache'), cacheBypass:()=>true,
    kbFetch:async()=>Response.json(record), json:data=>Response.json(data),
    cacheStore:()=>{}, withCacheStatus:response=>response, RESOURCE_CACHE_TTL:3600,
  });
  const request=new Request('https://opax.test/api/resource/speech-1');
  return (await api(request,new URL(request.url),'speech-1',{CACHE_EPOCH:'test'},{})).json();
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

function briefApi(records) {
  const calls=[];
  const api=runInNewContext(pick('SHORT_TURN_WORDS','shortTurn','BRIEF_MAX','RID_RE','apiBrief')+'; apiBrief',{
    Response, Request, URL, json:data=>Response.json(data), withCacheStatus:response=>response,
    caches:{default:{match:async()=>undefined,put:async()=>{}}},
    kbFetch:async(_env,path)=>{
      calls.push(path);
      const [,id,rest]=/^\/resource\/([0-9a-f]{32})(.*)$/.exec(path);
      const record=records[id]??{};
      if(rest==='/text/da-summary-t-body') return record.brief ? Response.json(field(record.brief)) : Response.json({detail:'not found'},{status:404});
      if(record.extra==='throws') throw new Error('KB down');
      if(record.extra==='fails') return Response.json({detail:'busy'},{status:503});
      return Response.json({id,extra:{metadata:record.metadata??{}}});
    },
  });
  return {calls,read:async ids=>(await (await api(new URL(`https://opax.test/api/brief?rids=${ids.join(',')}`),{})).json()).briefs};
}

test('/api/brief omits short turns and keeps long ones',async()=>{
  const {calls,read}=briefApi({
    [rid('a')]:{brief:'Short brief.',metadata:{word_count:79}},
    [rid('b')]:{brief:'Long brief.',metadata:{word_count:80}},
    [rid('c')]:{metadata:{word_count:500}},
  });
  assert.deepEqual(await read([rid('a'),rid('b'),rid('c')]),{[rid('b')]:'Long brief.'});
  for(const id of [rid('a'),rid('b'),rid('c')]) assert.ok(calls.includes(`/resource/${id}?show=extra`),id);
});

test('/api/brief keeps the brief when the word count cannot be read',async()=>{
  const {read}=briefApi({
    [rid('a')]:{brief:'Brief one.',extra:'fails'},
    [rid('b')]:{brief:'Brief two.',extra:'throws'},
    [rid('c')]:{brief:'Brief three.',metadata:{}},
  });
  assert.deepEqual(await read([rid('a'),rid('b'),rid('c')]),{[rid('a')]:'Brief one.',[rid('b')]:'Brief two.',[rid('c')]:'Brief three.'});
});
