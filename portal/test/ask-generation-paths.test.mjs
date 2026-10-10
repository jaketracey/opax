// Exercise the real Worker. Every model and KB retrieval request terminates
// in this fetch stub; no provider or production endpoint is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import { offline, loadWorker } from './worker-harness.mjs';
const backstopBundle = await build({entryPoints:[new URL('../src/ask-evidence.ts', import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {EVALUATIVE_BACKSTOP} = await import('data:text/javascript;base64,'+Buffer.from(backstopBundle.outputFiles[0].text).toString('base64'));

test.after(offline());
const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
const disk = worker.env.ASSETS.fetch;
worker.env.ASSETS.fetch = req => new URL(req.url).pathname === '/parliamentarians.json'
  ? Promise.resolve(Response.json({people:[{name:'Example MP',speeches:1,party:'Example party',states:['federal'],chambers:['house'],first:2025,last:2025}]})) : disk(req);
Object.assign(worker.env, {ASK_MODEL:'stub-answer',FOLLOWUPS_MODEL:'stub-rewrite',POSITION_RECOVERY_MODEL:'stub-position',MONEY_OVERVIEW_MODEL:'stub-overview'});

const rid = 'a'.repeat(32), id = `${rid}/t/body/0-80`;
const quote = 'I proposed building more housing near public transport.';
const resource = {slug:'speech-1',title:'Housing speech',origin:{collaborators:['Example MP'],url:'https://example.test/record'},
  usermetadata:{classifications:[{labelset:'kind',label:'speech'},{labelset:'chamber',label:'house'},{labelset:'state',label:'federal'},{labelset:'party',label:'Example party'}]},
  extra:{metadata:{date:'2025-02-11'}},fields:{'t/body':{paragraphs:{[id]:{text:quote,score:0.9,score_type:'RERANKER'}}}},data:{texts:{body:{value:{body:quote}}}}};
const answer = {answer:'Example MP proposed building more housing near public transport.',citations:{[id]:[[0,64]]},retrieval_results:{resources:{[rid]:resource}}};
const position = JSON.stringify({points:[{text:answer.answer,citations:[{id:'s1',quote}]}]});
let requests = [], replies = [], rewriteIntent = 'factual', cacheHit = false;
const reset = (answers = []) => {
  requests = []; replies = [...answers]; rewriteIntent = 'factual'; cacheHit = false;
  globalThis.caches = {default:{match:async key => cacheHit && key.url.includes('/ask/') ? Response.json({answer:'Cached facts.',sources:[],citations:{}}) : undefined,put:async()=>{}}};
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'offline.rag.progress.cloud', 'only the stub KB can be requested');
    if (url.pathname.endsWith('/find')) return Response.json({resources:{[rid]:resource},best_matches:[id]});
    if (url.pathname.includes('/slug/')) return Response.json(resource);
    assert.ok(url.pathname.endsWith('/ask'), `unhandled outbound request: ${url.pathname}`);
    const body = JSON.parse(init.body); requests.push(body);
    let payload;
    if (body.generative_model === 'stub-rewrite') payload = {answer:(body.prompt.system.startsWith('You classify') ? '' : body.query+'\n') + `INTENT: ${rewriteIntent}`};
    else payload = replies.shift() || answer;
    if (init.headers.accept === 'application/x-ndjson') {
      return new Response([
        {item:{type:'answer',text:payload.answer}},
        {item:{type:'retrieval',results:payload.retrieval_results}},
        {item:{type:'citations',citations:payload.citations}},
      ].map(row => JSON.stringify(row)).join('\n')+'\n');
    }
    return Response.json(payload);
  };
};
const ask = (input, stream = false) => worker.fetch(`/api/ask${stream ? '?stream=1' : ''}`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const generationRequests = () => requests.filter(body => body.generative_model !== 'stub-rewrite');
function assertBackstops() {
  assert.ok(generationRequests().length, 'this path must actually reach a generator');
  for (const body of generationRequests()) {
    assert.ok([body.query,body.prompt?.system,body.prompt?.user].some(text => text?.includes(EVALUATIVE_BACKSTOP)), `missing backstop on ${body.generative_model}`);
  }
}

test('actual model call counts retain the first-question, follow-up, calculation and cache costs', async () => {
  const rows = [
    ['First factual', {question:'What has parliament said about housing?'}, [], 1],
    ['Follow-up', {question:'What else about housing?',context:[{author:'user',text:'What has parliament said about housing?'},{author:'answer',text:'They discussed supply.'}]}, [], 2],
    ['Calculated pay', {question:'What are MPs paid?'}, [], 0],
    ['Money with uncached overview', {question:'Who receives the most funding from gambling donors?'}, [{answer:'The disclosed receipts record funding across parties. They cannot establish what any payment was expected to achieve.'}], 1],
    ['Cache hit', {question:'What has parliament said about housing?'}, [], 0],
  ];
  for (const [path,input,replies,expected] of rows) {
    reset(replies); cacheHit = path === 'Cache hit';
    const response = await ask(input); const payload = await response.json();
    assert.equal(response.status,200,`${path}: ${JSON.stringify(payload)}`);
    assert.equal(requests.length,expected,path);
    if (path === 'Calculated pay') assert.equal(payload.pay_answer,true);
    if (path.startsWith('Money')) assert.ok(payload.money_overview);
    if (generationRequests().length) assertBackstops();
  }
});

for (const stream of [false,true]) test(`every actual ordinary and follow-up generation carries the backstop (${stream ? 'stream' : 'JSON'})`, async () => {
  for (const context of [undefined,[{author:'user',text:'What has parliament said about housing?'}]]) {
    reset();
    const response = await ask({question:'What has parliament said about housing?',context},stream);
    const text = await response.text();
    assert.equal(response.status,200); assert.ok(text.includes('proposed'),text);
    assert.equal(generationRequests().length,1); assertBackstops();
  }
});

test('actual documented-position recovery and its repair both carry the backstop', async () => {
  reset([{answer:JSON.stringify({points:[{text:answer.answer,citations:[{id:'s1',quote:'An invented passage.'}]}]})},{answer:position}]);
  const response = await ask({question:'What did Example MP say about housing?',speaker:'Example MP',kind:'speech'});
  const payload = await response.json();
  assert.equal(response.status,200); assert.ok(payload.answer.includes('housing'),JSON.stringify(payload));
  assert.equal(generationRequests().length,2); assertBackstops();
  assert.ok(requests[1].prompt.user.includes('previous attempt failed verification'));
});

test('actual reasoned-position fallback carries the backstop after strict recovery', async () => {
  reset([{answer:'{"points":[]}'},answer]);
  const response = await ask({question:'What did Example MP say about housing and why?',speaker:'Example MP',kind:'speech'});
  const payload = await response.json();
  assert.equal(response.status,200); assert.ok(payload.answer.includes('housing'),JSON.stringify(payload));
  assert.equal(generationRequests().length,2); assertBackstops();
  assert.equal(requests[1].generative_model,'stub-answer');
});

test('actual citation and quotation recovery preserve the backstop', async () => {
  for (const draft of [{...answer,citations:{}},{...answer,answer:'Example MP said “This invented sentence has no basis in the housing speech”.',citations:{[id]:[[0,70]]}}]) {
    reset([draft,answer]);
    const response = await ask({question:'What has parliament said about housing?'});
    assert.equal(response.status,200); await response.text();
    assert.equal(generationRequests().length,2,draft.answer); assertBackstops();
  }
});

test('possible first-question judgement is classified; the explicit record retry retains its whole scope', async () => {
  const input = {question:'Which party is more honest about housing?',party:'Labor',topic:'housing',from:'2020',to:'2025',kind:'all'};
  reset(); rewriteIntent = 'evaluative';
  const neutral = await (await ask(input)).json();
  assert.equal(neutral.answer_status,'neutral'); assert.equal(requests.length,1); assert.equal(generationRequests().length,0);
  assert.equal(neutral.record_retry.label,'Ask for the record instead'); assert.equal(neutral.comparison_chips.length,5);
  assert.ok(requests[0].prompt.system.startsWith('You classify'));
  reset();
  const response = await ask({...input,record_only:true});
  assert.equal(response.status,200); await response.text();
  assert.equal(requests.length,1); assertBackstops();
  assert.ok(requests[0].prompt.user.includes(input.question));
  assert.ok(requests[0].prompt.system.includes('The reader chose to ask for the record'));
  assert.ok(JSON.stringify(requests[0].filter_expression).includes('Labor'));
  assert.ok(JSON.stringify(requests[0].filter_expression).includes('2020'));
});

test('a flagged follow-up record retry still rewrites once, then generates factual records', async () => {
  reset(); rewriteIntent='evaluative';
  const input = {question:'Which is better?',context:[{author:'user',text:'Compare Labor and the Coalition on housing in 2025.'}],party:'Labor',from:'2025',to:'2025',record_only:true};
  const response = await ask(input); assert.equal(response.status,200); await response.text();
  assert.equal(requests.length,2); assertBackstops();
  assert.equal(requests[1].chat_history[0].text,input.context[0].text);
});

test('cache hits skip possible-intent classification, and only an explicit boolean can request factual recovery', async () => {
  reset(); cacheHit=true;
  const cached=await ask({question:'Which party is more honest?'});
  assert.equal((await cached.json()).answer,'Cached facts.'); assert.equal(requests.length,0);
  reset();
  const neutral=await (await ask({question:'Who is the best politician?',record_only:'true'})).json();
  assert.equal(neutral.answer_status,'neutral'); assert.equal(requests.length,0);
  const factual=await ask({question:'Who is the best politician?',record_only:true});
  assert.equal(factual.status,200); await factual.text();
  assert.equal(requests.length,1); assertBackstops();
});
