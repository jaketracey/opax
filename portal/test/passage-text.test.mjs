import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import * as passageText from '../src/passage-text.ts';
import {compareSearchResults} from '../src/search-sort.ts';
import {isWitness} from '../public/speech-attribution.js';

const fixture = JSON.parse(readFileSync(new URL('../../tests/fixtures/passage-text.json', import.meta.url), 'utf8'));
const {normalizePassage, passageWindow} = passageText;
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const select = names => source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(source)).join('\n');
const transpile = text => ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const compile = (names, context) => runInNewContext(transpile(select(names)) + ';({' + names.join(',') + '})', {...passageText, ...context});
const evidence = {};
runInNewContext(transpile(readFileSync(new URL('../src/ask-evidence.ts', import.meta.url), 'utf8')), {exports: evidence, require: () => passageText});
const rid = '855d6df1c8c1429df4e4123c7557373b';
const pid = rid + '/t/body/0-3425';
const record = text => ({slug:'speech-1198151', title:'Housing debate', fields:{body:{paragraphs:{[pid]:{text,score:.9,score_type:'VECTOR'}}}}});
const people = {byFold:new Map()};

for (const [i, row] of fixture.cases.entries()) test(`passage fixture ${i + 1}: tags, roster joins and one entity pass`, () => {
  assert.equal(normalizePassage(row.input), row.expected);
});

test('Python and TS agree on shared fixtures and rule counts, including names embedded in longer words', () => {
  const code = 'import json,sys; from scripts.passage_text import repair_passage_joins,normalize_passage; print(json.dumps([{ "text":normalize_passage(s), "joins":dict(zip(("text","counts"),repair_passage_joins(s)))} for s in json.load(sys.stdin)],ensure_ascii=False))';
  const input = fixture.cases.map(row=>row.input);
  const python = spawnSync('python3',['-c',code],{cwd:new URL('../../',import.meta.url),input:JSON.stringify(input),encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);
  const expected = input.map(value=>({text:normalizePassage(value),joins:passageText.repairPassageJoins(value)}));
  assert.deepEqual(JSON.parse(python.stdout),expected);
});

test('standalone Python roster matches the compact Worker projection', () => {
  const python = spawnSync('python3',['-c','import json; from scripts.passage_text import _ROSTER; print(json.dumps(_ROSTER))'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);
  assert.deepEqual(JSON.parse(python.stdout),JSON.parse(readFileSync(new URL('../src/passage-names.json',import.meta.url),'utf8')));
});

test('all roster name-token suffix collisions stay whole', () => {
  const roster=JSON.parse(readFileSync(new URL('../src/passage-names.json',import.meta.url),'utf8'));
  const tokens=new Set([...roster.name_tokens,...roster.surnames.map(n=>n.toLowerCase())]);
  let protectedPairs=0;
  for(const name of roster.full_names) for(const word of 'was is has had and the until who said to of in on for that will would as at by from with when which'.split(' ')) {
    if(tokens.has((name.split(' ').at(-1)+word).toLowerCase())) {
      const value=name+word+' said';protectedPairs++;
      assert.equal(normalizePassage(value),value);
    }
  }
  assert.ok(protectedPairs>0);
});

test('100 KB incomplete markup remains under 50 ms', () => {
  for(const input of ['<a'+' '.repeat(102400),'<!--'.repeat(25600)]) {
    normalizePassage(input);
    const times=Array.from({length:3},()=>{const start=performance.now();normalizePassage(input);return performance.now()-start});
    assert.ok(Math.min(...times)<50,JSON.stringify(times));
  }
});

test('shared windows use UTF-16 caps and JS whitespace in both languages', () => {
  for(const row of fixture.windows) assert.equal(passageWindow(row.text,row.limit,row.start,row.end),row.expected);
  const code='import json,sys; from scripts.passage_text import passage_window; print(json.dumps([passage_window(r["text"],r["limit"],r["start"],r.get("end")) for r in json.load(sys.stdin)]))';
  const python=spawnSync('python3',['-c',code],{cwd:new URL('../../',import.meta.url),input:JSON.stringify(fixture.windows),encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);
  assert.deepEqual(JSON.parse(python.stdout),fixture.windows.map(row=>row.expected));
});

test('600 includes ellipses, exact fits stay whole, and very long tokens never become fragments', () => {
  const text = 'A '.repeat(291) + 'Once We know personally how the proposal works.';
  assert.ok(text.slice(0,600).endsWith('We know perso'));
  assert.ok(passageWindow(text).endsWith('We know …'));
  assert.ok(passageWindow(text).length <= 600);
  assert.equal(passageWindow('Whole words.',12),'Whole words.');
  assert.equal(passageWindow('x'.repeat(700)),'…');
  assert.equal(passageWindow('Before Transport Legislation Committee after.',30,8),'… Transport Legislation …');
  assert.equal(passageWindow('First\nSecond\tThird',14),'First\nSecond …');
});

test('Worker /api/search repairs stored name joins and bounds both snippet ends', async () => {
  const raw = fixture.speeches.find(s => s.speech_id === 1198151).text_clean;
  let calls = 0;
  const worker = compile(['apiSearch','searchWindow','label','calibrate'], {
    URL, URLSearchParams, Request, Response, isWitness, compareSearchResults,
    loadPeople:async()=>people, speakerAttribution:async()=>null, filterExpression:()=>null,
    stripListingBoilerplate:evidence.stripListingBoilerplate,
    SLUG_RE:/^(speech|legal|news)-(\d+)$/, DIVISION_SLUG_RE:/^division-/,
    SEARCH_PER_DEFAULT:20, SEARCH_PER_MAX:200, SEARCH_WINDOW_TOPK:200, SEARCH_TOPK_MAX:200,
    SEARCH_WINDOW_CACHE_TTL:3600, SEARCH_CACHE_TTL:600,
    sha256Hex:async s=>s, cacheRequest:()=>new Request('https://local.test/cache'), cacheBypass:()=>true,
    rateLimited:async()=>null, cacheStore:()=>{}, withCacheStatus:r=>r, json:data=>Response.json(data),
    kbFetch:async(_env,path)=>{assert.equal(path,'/find'); calls++; return Response.json({resources:{[rid]:record(raw)}})},
  });
  const url = new URL('https://local.test/api/search?q=Malcolm');
  const response = await worker.apiSearch(new Request(url),url,{CACHE_EPOCH:'fixture'},{});
  const result = await response.json();
  assert.equal(response.status,200);
  assert.equal(calls,1);
  const snippet = result.results[0].snippet;
  assert.match(snippet,/when Malcolm Turnbull was/);
  assert.match(snippet,/When Joe Hockey was/);
  assert.ok(snippet.startsWith('… '));
  assert.ok(snippet.endsWith(' …'));
  assert.ok(snippet.length <= 600);
  const body = snippet.slice(2,-2);
  const text = normalizePassage(raw);
  const at = text.indexOf(body);
  assert.ok(at >= 0);
  assert.match(text[at-1],/\s/);
  assert.match(text[at+body.length],/\s/);
});

test('Worker /ask sources normalize once and keep the 600 maximum on word boundaries', async () => {
  const text = 'A '.repeat(291) + 'Once We know personally how the proposal works. &#38; &amp;#38;';
  let calls = 0;
  const worker = compile(['apiAsk','askPayload','label','calibrate'], {
    ...evidence, URL, Response, AbortSignal, isWitness,
    rankedMoneyAnswer:async()=>null, rateLimited:async()=>null, paidAnswer:async()=>null, integrityQuestion:()=>false,
    needsAskPeople:()=>false, loadPeople:async()=>people,
    resolveAskScope:input=>({input,scope:undefined}), askCacheInput:()=>null, cacheBypass:()=>true,
    retrieveAskRecords:async()=>({records:[],coverage:'',total:0}),
    buildAskBody:()=>({}), scopeSpeakerBody:async()=>{},
    ASK_SYNC_TIMEOUT_MS:1000, ASK_RETRY_BUDGET_MS:0,
    isRefusal:()=>false, isPositionBody:()=>false, looseAnswer:p=>p, withAskedAs:p=>p,
    recordSources:()=>[], cacheableAnswer:()=>false, withCacheStatus:r=>r, json:data=>Response.json(data),
    hasUnsupportedQuotes:()=>false,
    kbFetch:async(_env,path)=>{assert.equal(path,'/ask'); calls++; return Response.json({answer:'A fact.',citations:{[pid]:[[0,6]]},retrieval_results:{resources:{[rid]:record(text)}}})},
  });
  const request = new Request('https://local.test/api/ask',{method:'POST',body:JSON.stringify({question:'What was said?'})});
  const response = await worker.apiAsk(request,{CACHE_EPOCH:'fixture'},{});
  const payload = await response.json();
  assert.equal(response.status,200);
  assert.equal(calls,1);
  assert.equal(payload.sources[0].cited,true);
  assert.ok(payload.sources[0].snippet.endsWith('We know …'));
  assert.ok(payload.sources[0].snippet.length <= 600);
  const short = worker.askPayload({retrieval_results:{resources:{[rid]:record('Meat &#38; Livestock\n\n So Cattle Australia is on that? &amp;#38;')}}});
  assert.equal(short.sources[0].snippet,'Meat & Livestock\n\nSo Cattle Australia is on that? &#38;');
});

test('Worker evidence windows share the cap and do not re-decode normalized snippets', () => {
  const raw = 'Before '.repeat(60) + 'Transport Legislation Committee discussed housing affordability. ' + 'After '.repeat(60);
  const excerpt = evidence.evidenceExcerpt(raw,'housing affordability',160).text;
  assert.match(excerpt,/housing affordability/);
  assert.ok(excerpt.length<=160);
  assert.ok(raw.includes(excerpt.replace(/^… /,'').replace(/ …$/,'')));
  assert.equal(evidence.evidenceExcerpt(normalizePassage('&amp;#38; housing'),'housing',440,true).text,'&#38; housing');
});
