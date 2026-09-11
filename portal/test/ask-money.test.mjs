import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('../src/ask-money.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {rankedMoneyAnswer,isMoneyRanking}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const graph=JSON.parse(await readFile(new URL('../public/graph/money.json',import.meta.url),'utf8'));
const assets={fetch:async req=>new Response(await readFile(new URL('../public'+new URL(req.url).pathname,import.meta.url)))};
const ask=(question,filters={})=>rankedMoneyAnswer({question,...filters},assets);

test('the live fossil-fuel ranking failure is corrected using all selected edges',async()=>{
 const r=await ask('Who receives the most funding from fossil fuel donors?');
 assert.match(r.answer,/^\*\*Liberal\*\*/);assert.match(r.answer,/\$9,013,973/);assert.match(r.answer,/\$8,526,686/);
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/not every donor/);
 assert.ok(r.sources.some(s=>s.href.includes('industry=fossil_fuels')&&s.href.includes('party=party%3ALiberal')));
});
test('industry and party questions rank different directions with source links',async()=>{
 const gambling=await ask('Who takes the most money from the gambling lobby?');
 assert.match(gambling.answer,/^\*\*Labor\*\*/);assert.match(gambling.answer,/\$10,763,834/);assert.match(gambling.answer,/not personal payments/);
 for(const party of ['Labor','One Nation']) {
  const answer=await ask(`Who donates the most to ${party}?`);
  const matching=graph.edges.filter(e=>e.target==='party:'+party&&e.source.startsWith('donor:')&&!e.flow&&!e.grant).sort((a,b)=>b.total-a.total);
  const winner=graph.nodes.find(n=>n.id===matching[0].source).label;
  assert.ok(answer.answer.startsWith(`**${winner}**`));assert.match(answer.answer,/\| Donor \|/);
  assert.ok(answer.sources.some(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')===matching[0].source));
 }
});
test('each table citation sits inside a cell and has a linked evidence record',async()=>{
 const r=await ask('Who donates the most to Labor?');const chars=Array.from(r.answer);
 for(const [id,ranges] of Object.entries(r.citations)) {assert.ok(r.sources.some(s=>s.resource===id&&s.cited));for(const [start,end] of ranges){assert.ok(end>start);assert.notEqual(chars[end-1],'|');}}
});
test('explicit date and party controls win; from an industry is not since a year',async()=>{
 const r=await ask('Who takes the most money from gambling in 2020?');
 assert.match(r.answer,/2020–21 to 2020–21/);assert.ok(r.sources.some(s=>s.href.includes('from=2020&to=2020')));
 const filtered=await ask('Who donates the most to Labor?',{party:'Liberal',from:'2020',to:'2020'});
 assert.match(filtered.answer,/to Liberal/);assert.ok(filtered.sources.some(s=>s.href.includes('party=party%3ALiberal')));
 assert.equal((await ask('Who donates the most to Labor recently?')).answer_status,'needs_period');
});
test('unsupported questions are not silently replaced by lifetime or party totals',async()=>{
 for(const q of ['Who donates the most to an unknown party?','Who donates the most to Labor from the unicorn lobby?']) assert.equal(await ask(q),null);
 for(const q of ['How much money did Labor receive?', 'What is the total gambling funding?', 'Who donates the most blood?','Which MPs personally received gambling money?','Who takes gambling money and what do they say about pokies?','Who receives the most grants?','Who donates the most to Labor excluding unions?']) assert.equal(isMoneyRanking({question:q}),false,q);
 assert.equal(await ask('Who donates the most to Labor?',{state:'nsw'}),null);
 assert.equal(isMoneyRanking({question:'Who donates the most to Labor?',speaker:'Pauline Hanson'}),false);
});

test('biggest industry donors and biggest recipient parties are distinct rankings',async()=>{
 const donors=await ask('Who are the biggest gambling donors?');
 assert.match(donors.answer,/\| Donor \|/);assert.match(donors.answer,/among gambling donors/);
 const parties=await ask('Which party receives the largest funding from gambling donors?');
 assert.match(parties.answer,/\| Recipient party \|/);assert.match(parties.answer,/^\*\*Labor\*\*/);
 const flow=await ask('Who donates the most to who?');assert.match(flow.answer,/\| Donor → party \|/);
});

test('party comparisons calculate a dollar difference and cite each scoped side',async()=>{
 const r=await ask('Who gets more gambling money, Labor or Liberal?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/Labor received \$1,739,427 more from gambling donors than Liberal/);
 assert.match(r.answer,/\$10,763,834/);assert.match(r.answer,/\$9,024,407/);
 for(const party of ['Labor','Liberal']) assert.ok(r.sources.some(s=>s.href.includes('party=party%3A'+party)&&s.href.includes('industry=gambling')));
 const dated=await ask('Who gets more gambling money, Labor or Liberal in 2020?');
 assert.match(dated.answer,/\$97,478 more/);assert.match(dated.answer,/\$457,673/);assert.match(dated.answer,/\$360,195/);
 for(const s of dated.sources.slice(1))assert.ok(s.href.includes('from=2020&to=2020'));
 for(const [id,ranges] of Object.entries(r.citations)) {assert.ok(r.sources.some(s=>s.resource===id));for(const [start,end] of ranges)assert.ok(start>=0&&end>start&&end<=Array.from(r.answer).length)}
});

test('industry comparisons do not treat banks as every finance organisation',async()=>{
 const unsupported=await ask('Who gives more money to Labor, unions or banks?');
 assert.equal(unsupported.answer_status,'needs_scope');assert.match(unsupported.answer,/grouped with other finance/);
 const r=await ask('Who gives more money to Labor, unions or finance?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\| Donor industry \|/);
 assert.match(r.answer,/Unions provided \$122,966,378 more to Labor than Finance/);
 assert.match(r.answer,/\$247,398,401/);assert.match(r.answer,/\$124,432,023/);
 assert.ok(r.sources.some(s=>s.href.includes('industry=unions')&&s.href.includes('party=party%3ALabor')));
 assert.ok(r.sources.some(s=>s.href.includes('industry=finance')&&s.href.includes('party=party%3ALabor')));
 assert.equal((await ask('Who receives the most money from banks?')).answer_status,'needs_scope');
 assert.equal((await ask('Who receives the most funding from energy?')).answer_status,'needs_scope');
});

test('familiar corporate names find the donor without a model ranking',async()=>{
 const r=await ask('Who gets the most money from Mineralogy?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/^\*\*United Australia Party\*\*/);assert.match(r.answer,/\$128,428,269/);
 assert.ok(r.sources.some(s=>s.href.includes('focus=donor%3Amineralogy')));
});

test('unsupported comparisons and missing data never become a false winner',async()=>{
 for(const q of ['Who gets more money, Labor or Unicorn Party?','Who gets more money, Labor or Liberal or Greens?','Who gets more money from gambling or mining, Labor or Liberal?','Did Labor or Liberal receive more gambling money in 2020 than in 2021?','Who gets more money from the unicorn lobby, Labor or Liberal?','Who gets more unicorn industry money, Labor or Liberal?','Compare gambling money, Labor in 2020 or Liberal in 2021?','Compare gambling money for Labor and Liberal, 2020 vs 2021?','Who gets more gambling money adjusted for inflation, Labor or Liberal?']) assert.equal(await ask(q),null,q);
 const missing=await ask('Who gets more gambling money, Labor or Liberal in 1900?');
 assert.equal(missing.answer_status,'evidence_gap');assert.doesNotMatch(missing.answer,/\$0|received more/);
});
