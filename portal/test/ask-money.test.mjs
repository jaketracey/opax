import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('../src/ask-money.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {rankedMoneyAnswer,isMoneyRanking}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const graph=JSON.parse(await readFile(new URL('../public/graph/money.json',import.meta.url),'utf8'));
const assets={fetch:async req=>new Response(await readFile(new URL('../public'+new URL(req.url).pathname,import.meta.url)))};
const ask=(question,filters={})=>rankedMoneyAnswer({question,...filters},assets);
const history=(...questions)=>questions.map(text=>({author:'user',text}));

test('ordinary industry recipient rankings do not require the word money',async()=>{
 const answer=await ask('Who gets the most from mining?');
 assert.equal(answer.answer_status,'calculated');
 assert.match(answer.answer,/^\*\*United Australia Party\*\*/);
 assert.match(answer.answer,/\$155,465,435/);
 assert.ok(answer.sources.some(s=>{const p=new URL(s.href,'https://opax.test').searchParams;return p.get('industry')==='mining'&&p.get('party')==='party:United Australia Party'}));
 for(const [question,control] of [
  ['Who takes the most from gambling?','Who takes the most money from gambling?'],
  ['Which party receives the most from fossil fuels?','Which party receives the most funding from fossil fuels?'],
  ['Who gets the most from the media industry?','Who gets the most funding from the media industry?'],
  ['Who gets the most from mining in 2020?','Who gets the most funding from mining in 2020?'],
 ]) assert.deepEqual(await ask(question),await ask(control),question);
 const next=await ask('And in 2021?',{context:history('Who gets the most from mining in 2020?')});
 assert.deepEqual(next,await ask('Who receives the most funding from mining donors in federal records in 2021?'));
});

test('implicit funding wording preserves scope restrictions and unknown qualifiers',async()=>{
 for(const question of ['Who gets the most from housing?','Who benefits most from mining?',
  'Who gets the most from the media?','Who gets the most from media?',
  'Who gets the most grants from mining?','Who gets the most from mining and what do they say?',
  'Which politicians get the most from mining?','Who gets the most from mining excluding coal?',
  'Who gets the most from mining personally?']) assert.equal(await ask(question),null,question);
 for(const question of ['Who gets the most from mining and unicorns?','Who gets the most from data mining?']) {
  const answer=await ask(question);assert.equal(answer.answer_status,'needs_scope',question);
  assert.deepEqual(answer.sources,[]);assert.doesNotMatch(answer.answer,/\$[\d,]+/);
 }
 for(const filter of [{kind:'speech'},{speaker:'Pauline Hanson'},{topic:'mining'},{chamber:'senate'}])
  assert.equal(await ask('Who gets the most from mining?',filter),null);
});

test('the live fossil-fuel ranking failure is corrected using all selected edges',async()=>{
 const r=await ask('Who receives the most funding from fossil fuel donors?');
 assert.match(r.answer,/^\*\*Liberal\*\*/);assert.match(r.answer,/\$9,013,973/);assert.match(r.answer,/\$8,526,686/);
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/not every donor/);
 assert.ok(r.sources.some(s=>s.href.includes('industry=fossil_fuels')&&s.href.includes('party=party%3ALiberal')));
});

test('funding conversations replace party, industry, donor and financial year without generation',async()=>{
 const turns=['Who donated the most to Labor from gambling in FY2020-21?'];
 const follow=async(question,match,source)=>{
  const result=await ask(question,{context:history(...turns)});
  assert.equal(result?.answer_status,'calculated',question);assert.match(result.answer,match);
  assert.ok(result.sources.some(s=>source(new URL(s.href,'https://opax.test').searchParams)),question);
  turns.push(question);return result;
 };
 await follow('What about Liberal?',/Sportsbet.*\$175,500/s,p=>p.get('party')==='party:Liberal'&&p.get('industry')==='gambling'&&p.get('from')==='2020'&&p.get('to')==='2020');
 await follow('And fossil fuel donors?',/Woodside.*\$137,000/s,p=>p.get('industry')==='fossil_fuels'&&p.get('party')==='party:Liberal'&&p.get('from')==='2020');
 await follow('What about Tabcorp Holdings?',/Tabcorp.*\$87,300/s,p=>p.get('focus')==='donor:tabcorp'&&!p.has('industry')&&p.get('party')==='party:Liberal');
 await follow('And in 2021-22?',/Tabcorp.*\$87,500/s,p=>p.get('from')==='2021'&&p.get('to')==='2021'&&p.get('party')==='party:Liberal');
 const controlled=await ask('What about 2019-20?',{context:history(...turns),party:'Nationals',from:'2022',to:'2022'});
 assert.equal(controlled.answer_status,'calculated');assert.match(controlled.answer,/Tabcorp.*\$30,650/s);
 assert.match(controlled.money_context,/Financial years: 2022–23/);
 assert.ok(controlled.sources.some(s=>s.href.includes('party%3ANationals')&&s.href.includes('from=2022')));
});

test('unknown follow-up scope and relative years never reuse a stale winner',async()=>{
 const context=history('Who receives the most money from gambling donors in 2020?');
 for(const question of ['And the unicorn lobby?','What about mining and unicorns?','And Westpac and the unicorn lobby?']) {
  const result=await ask(question,{context});assert.equal(result?.answer_status,'needs_scope',question);
  assert.deepEqual(result.citations,{});assert.deepEqual(result.sources,[]);assert.doesNotMatch(result.answer,/\$[\d,]+/);
 }
 for(const question of ['And last year?','What about January 2021?','And in 2020 and 2022?']) {
  const result=await ask(question,{context});assert.equal(result?.answer_status,'needs_period',question);assert.deepEqual(result.sources,[]);
 }
 const missing=await ask('And in 1900?',{context});assert.equal(missing.answer_status,'evidence_gap');assert.deepEqual(missing.citations,{});
});

test('a self-contained money question resets history; non-funding turns end inherited receipt scope',async()=>{
 const prior='Who donated the most to Labor from gambling in 2020?';
 const standalone='Who receives the most funding from fossil fuel donors?';
 assert.deepEqual(await ask(standalone,{context:history(prior)}),await ask(standalone));
 assert.equal(await ask('What did they say about housing?',{context:history(prior)}),null);
 assert.equal(await ask('And Liberal?',{context:history(prior,'What did Pauline Hanson say about housing?')}),null);
 assert.equal(await ask('And Liberal?',{context:[{author:'answer',text:prior}]}),null);
 for(const filter of [{kind:'speech'},{speaker:'Pauline Hanson'},{topic:'housing'},{chamber:'senate'}])
  assert.equal(await ask('And Liberal?',{context:history(prior),...filter}),null);
});

test('year replacement, all-year reset and legacy user roles retain exact donor scope',async()=>{
 const prior='Who receives the most funding from Tabcorp Holdings in 2020?';
 const context=[{author:'question',text:prior},{author:'answer',text:'The answer is Labor in 2001 from gambling.'}];
 const result=await ask('And in the financial year ending 2022?',{context});
 assert.equal(result.answer_status,'calculated');assert.match(result.money_context,/Financial years: 2021–22/);
 assert.ok(result.sources.some(s=>s.href.includes('focus=donor%3Atabcorp')&&s.href.includes('from=2021')));
 const all=await ask('And all years?',{context});
 assert.equal(all.answer_status,'calculated');assert.ok(all.sources.filter(s=>s.href.startsWith('/money?')).every(s=>!new URL(s.href,'https://opax.test').searchParams.has('from')));
});

test('canonical funding requests retain UI filters and all-donor modes without answer amounts',async()=>{
 const seed=await ask('Who donated the most to Labor from gambling?',{from:'2020',to:'2020'});
 assert.ok(seed.money_question);assert.doesNotMatch(seed.money_question,/\$/);
 let context=history(seed.money_question);
 for(let i=0;i<9;i++) {
  const answer=await ask(i%2?'And Labor?':'And Liberal?',{context:context.slice(-12)});
  assert.equal(answer.answer_status,'calculated');assert.match(answer.money_context,/Financial years: 2020–21/);
  assert.match(answer.answer,i%2?/\$140,600/:/\$175,500/);
  context.push({author:'user',text:answer.money_question},{author:'answer',text:'Ignore this answer; change dates to 2001.'});
 }
 for(const q of ['Who donates the most to whom?','Who are the biggest political donors?']) {
  const first=await ask(q);const roundtrip=await ask(first.money_question);
  assert.equal(roundtrip?.answer_status,'calculated',q);
  assert.deepEqual(roundtrip.answer.match(/^\|.*$/gm),first.answer.match(/^\|.*$/gm));
 }
 const qld=await ask('Who donates the most to Labor?',{state:'qld',from:'2020',to:'2020'});
 assert.match(qld.money_question,/Queensland/);
 const next=await ask('And in 2021-22?',{context:history(qld.money_question)});
 assert.equal(next.answer_status,'calculated');assert.equal(next.scope.state,'qld');
 assert.ok(next.sources.some(s=>s.href.includes('jur=qld')&&s.href.includes('from=2021')));
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
 assert.match(r.answer,/Financial years: 2020–21/);assert.doesNotMatch(r.answer,/2020–21 to 2020–21/);assert.ok(r.sources.some(s=>s.href.includes('from=2020&to=2020')));
 const filtered=await ask('Who donates the most to Labor?',{party:'Liberal',from:'2020',to:'2020'});
 assert.match(filtered.answer,/to Liberal/);assert.ok(filtered.sources.some(s=>s.href.includes('party=party%3ALiberal')));
 assert.equal((await ask('Who donates the most to Labor recently?')).answer_status,'needs_period');
});
test('unsupported questions are not silently replaced by lifetime or party totals',async()=>{
 for(const q of ['Who donates the most to an unknown party?','Who donates the most to Labor from the unicorn lobby?']) {const r=await ask(q);assert.equal(r.answer_status,'needs_scope');assert.deepEqual(r.sources,[]);assert.doesNotMatch(r.answer,/\$[\d,]+/);}
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
 for(const q of ['Who gets more money, Labor or Liberal or Greens?','Who gets more money from gambling or mining, Labor or Liberal?','Who gets more money from the unicorn lobby, Labor or Liberal?','Who gets more unicorn industry money, Labor or Liberal?','Who gets more gambling money adjusted for inflation, Labor or Liberal?']) assert.equal(await ask(q),null,q);
 const mixedPeriods=await ask('Compare gambling money, Labor in 2020 or Liberal in 2021?');
 assert.equal(mixedPeriods.answer_status,'needs_period');assert.doesNotMatch(mixedPeriods.answer,/\$/);
 const sharedRange=await ask('Who gets more gambling money, Labor or Liberal between 2020 and 2021?');
 assert.equal(sharedRange.answer_status,'calculated');assert.match(sharedRange.answer,/Labor received \$649,477 more/);assert.match(sharedRange.answer,/\$1,468,701/);assert.match(sharedRange.answer,/\$819,224/);
 const missing=await ask('Who gets more gambling money, Labor or Liberal in 1900?');
 assert.equal(missing.answer_status,'evidence_gap');assert.doesNotMatch(missing.answer,/\$0|received more/);
});

test('year comparisons calculate separate cells and cite each exact year',async()=>{
 for(const q of ['Did Labor receive more gambling money in 2020 or 2021?','How did gambling receipts to Labor change from 2020 to 2021?','Compare gambling receipts to Labor in 2021 and 2020']) {
  const r=await ask(q);
  assert.equal(r.answer_status,'calculated',q);assert.match(r.answer,/Labor received \$553,355 more from gambling donors in 2021–22 than in 2020–21/);
  assert.match(r.answer,/\| 2020–21 \| \$457,673 \| 47 \|/);assert.match(r.answer,/\| 2021–22 \| \$1,011,028 \| 67 \|/);
  for(const y of ['2020','2021']) {
   const s=r.sources.find(s=>s.href.includes(`from=${y}&to=${y}`));assert.ok(s,q);
   const u=new URL(s.href,'https://opax.test');assert.equal(u.searchParams.get('party'),'party:Labor');assert.equal(u.searchParams.get('industry'),'gambling');
  }
  for(const [key,spans] of Object.entries(r.citations)) {
   assert.ok(r.sources.some(s=>s.resource===key&&s.cited));
   for(const [start,end] of spans){assert.ok(start>=0&&end>start&&end<=Array.from(r.answer).length);assert.notEqual(Array.from(r.answer)[end-1],'|');}
  }
 }
 const inferredBounds=await ask('How did gambling receipts to Labor change from 2020 to 2021?',{from:'2020',to:'2021'});
 assert.equal(inferredBounds.answer_status,'calculated');
});

test('year comparisons exclude intermediate years and handle decreases',async()=>{
 const ends=await ask('Compare gambling receipts to Labor in 2019 versus 2022');
 assert.match(ends.answer,/\$366,565 more/);assert.match(ends.answer,/\$283,635/);assert.match(ends.answer,/\$650,200/);
 assert.doesNotMatch(ends.answer,/\$457,673|\$1,011,028/);
 const decrease=await ask('How did gambling receipts to Labor change from 2021 to 2022?');
 assert.match(decrease.answer,/\$360,828 less from gambling donors in 2022–23 than in 2021–22/);
 const unknown=await ask('Compare gambling and aerospace money to Labor in 2020 versus 2021');
 assert.equal(unknown.answer_status,'needs_scope');assert.doesNotMatch(unknown.answer,/\$/);
});

test('year comparisons clarify conflicting filters, ambiguous years and multiple cohorts',async()=>{
 for(const q of ['Did Labor or Liberal receive more gambling money in 2020 than in 2021?','Compare gambling money for Labor and Liberal, 2020 vs 2021?','Compare gambling receipts in 2020 versus 2021']) {
  const r=await ask(q);assert.equal(r.answer_status,'needs_scope',q);assert.doesNotMatch(r.answer,/\$/);
 }
 for(const q of ['How did gambling receipts to Labor change since 2020?','How did gambling receipts to Labor change from 2020 to 2020?','Compare gambling receipts to Labor, 2019–2020 versus 2021–2022']) {
  const r=await ask(q);assert.equal(r.answer_status,'needs_period',q);assert.doesNotMatch(r.answer,/\$/);
 }
 const filters=await ask('How did gambling receipts to Labor change from 2020 to 2021?',{from:'2022',to:'2024'});
 assert.equal(filters.answer_status,'needs_period');assert.match(filters.answer,/filters differ/);
 const missing=await ask('Compare gambling receipts to Labor in 1900 versus 2021');
 assert.equal(missing.answer_status,'evidence_gap');assert.doesNotMatch(missing.answer,/\$0|received.*more/);
});

test('equal dated totals and recorded zeros are distinct from missing year data',async()=>{
 const graph={meta:{},nodes:[{id:'donor',kind:'donor',label:'Example Casino',industry:'gambling'},{id:'labor',kind:'party',label:'Labor'}],edges:[{source:'donor',target:'labor',total:999999,count:3,byYear:{2020:[0,1],2021:[0,1],2022:[999999,1]}}]};
 const r=await rankedMoneyAnswer({question:'Compare gambling receipts to Labor in 2020 versus 2021'},{fetch:async()=>Response.json(graph)});
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/same disclosed total/);assert.doesNotMatch(r.answer,/999,999|missing year/);
 assert.equal(r.sources.length,3);
});

test('mixed known and unknown scopes request clarification instead of publishing a partial winner',async()=>{
 for(const [q,unmatched] of [
  ['Who gets more money from gambling and aerospace, Labor or Liberal?','aerospace'],
  ['Who gets the most money from Mineralogy and Acme Space Widgets?','acme space widgets'],
  ['Who gets the most money from gambling and cryptocurrency?','cryptocurrency'],
  ['Who gets more money, Labor or Unicorn Party?','unicorn'],
  ['Who gets the most money from online gambling?','online'],
  ['Who gets the most money from Mineralogy and gambling?','gambling'],
  ['Who gets the most money from gambling, aerospace and finance?','aerospace'],
 ]) {
  const r=await ask(q);
  assert.equal(r.answer_status,'needs_scope',q);assert.ok(r.answer.includes(`**${unmatched}**`),q);
  assert.doesNotMatch(r.answer,/\$|received the most|received.*more/);assert.deepEqual(r.sources,[]);assert.deepEqual(r.citations,{});
 }
});

test('the whole-query check retains known aliases, reversed comparisons and explicit filters',async()=>{
 for(const q of [
  'Who gets more funding from gambling, Liberal versus Labor?',
  'Compare the disclosed gambling receipts for Labor and Liberal in 2020',
  'Who donates the most to ALP?',
  'Who donates the most to the National Party?',
  'Who gets the most money from Mineralogy Pty Ltd?',
 ]) assert.equal((await ask(q)).answer_status,'calculated',q);
 assert.equal((await ask('Who gives the most money to Labor?',{party:'Liberal'})).answer_status,'calculated');
});

test('financial-year labels select one year, not two, with exact source links',async()=>{
 for(const label of ['2020/2021','2020/21','2020–21','2020-21','2020‑21','FY2020-2021','financial year 2020–2021']) {
  const r=await ask(`Who gets the most money from gambling in ${label}?`);
  assert.equal(r.answer_status,'calculated',label);assert.match(r.answer,/\$457,673/);assert.doesNotMatch(r.answer,/\$1,468,701/);
  assert.match(r.money_context,/Financial years: 2020–21/);assert.match(r.money_context,/7 donors with matching receipts/);
  assert.ok(r.sources.some(s=>s.href.includes('from=2020&to=2020')),label);
 }
 const r=await ask('Who gets more gambling money, Labor or Liberal in 2020/2021?');
 assert.match(r.answer,/\$97,478 more/);assert.doesNotMatch(r.answer,/\$649,477/);
});

test('comparisons between financial-year labels keep each year separate',async()=>{
 const r=await ask('Did Labor receive more gambling money in 2020–21 or 2021–22?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\$553,355 more/);
 assert.match(r.money_context,/2020–21 and 2021–22/);
 for(const y of ['2020','2021'])assert.ok(r.sources.some(s=>s.href.includes(`from=${y}&to=${y}`)));
 const range=await ask('Who gets the most money from gambling from 2020–21 to 2022–23?');
 assert.equal(range.answer_status,'calculated');assert.ok(range.sources.some(s=>s.href.includes('from=2020&to=2022')));
});

test('ambiguous or invalid year labels cannot silently change the period',async()=>{
 for(const label of ['2020-2021','2020/22','2020/2022','2020–20','2020-01-01']) {
  const r=await ask(`Who gets the most money from gambling in ${label}?`);
  assert.equal(r.answer_status,'needs_period',label);assert.deepEqual(r.citations,{});assert.doesNotMatch(r.answer,/\$/);
 }
 const r=await ask('Who gets the most money from gambling in 2020 to 2021?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\$1,468,701/);
});

test('a missing year has no fabricated ranking or calculation citation',async()=>{
 const r=await ask('Who gets the most money from gambling in 1900/1901?');
 assert.equal(r.answer_status,'evidence_gap');assert.deepEqual(r.sources,[]);assert.deepEqual(r.citations,{});
 assert.match(r.answer,/does not establish that no funding occurred/);assert.doesNotMatch(r.answer,/\$0|received the most/);
});

test('year ending labels and requested versus actual coverage remain explicit',async()=>{
 const r=await ask('Who gets the most money from gambling in financial year ending 2021?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\$457,673/);assert.doesNotMatch(r.answer,/\$1,011,028/);
 const sparse=await ask('Who gets the most money from gambling in 1900 to 2020?');
 assert.match(sparse.money_context,/Financial years: 1900–01 to 2020–21/);
 assert.match(sparse.money_context,/Matching recorded years: 1998–99 to 2020–21/);
 for(const q of ['Who gets the most money from gambling in financial years 2019–20 and 2021–2022?', 'Who gets the most money from gambling in 2019–20, 2021–22?', 'Who gets the most money from gambling in 2019–20 & 2021–22?', 'Who gets the most money from gambling in calendar year 2020?', 'Who gets the most money from gambling from January to June 2020?', 'Who gets the most money from gambling on 2020-1-1?']) {
  const answer=await ask(q);assert.equal(answer.answer_status,'needs_period',q);assert.doesNotMatch(answer.answer,/\$/);
 }
});


test('an explicit year answers a period clarification without losing the funding selection',async()=>{
 const seed=await ask('Who donated most to Liberal from Tabcorp Holdings in FY2020-21?');
 for(const question of ['And last year?','What about January 2021?','And in 2020 and 2022?']) {
  const clarification=await ask(question,{context:history(seed.money_question)});
  assert.equal(clarification.answer_status,'needs_period');assert.equal(clarification.money_question,seed.money_question);
  for(const prior of [question,clarification.money_question]) {
   const correction=await ask('And in 2021-22?',{context:history(seed.money_question,prior)});
   assert.equal(correction.answer_status,'calculated');assert.match(correction.answer,/Tabcorp.*\$87,500/s);
  }
 }
 const unknown=await ask('And unicorns last year?',{context:history(seed.money_question)});
 assert.equal(unknown.money_question,undefined);
 assert.equal(await ask('And in 2021-22?',{context:history(seed.money_question,'And unicorns last year?')}),null);
});


const choiceQuestions=answer=>[...answer.matchAll(/\]\(\/ask\?q=([^)]*)\)/g)].map(m=>decodeURIComponent(m[1]));
test('short donor names offer explicit choices without pooling organisations',async()=>{
 for(const [name,expected] of [['Tabcorp',['Tabcorp Holdings Limited']],['Pratt',['Pratt Holdings Pty Ltd']],['Macquarie',['Macquarie Group Limited','Macquarie Technology Group Ltd']],['Crown',['Crown Castle Australia','Crown Resorts Limited']]]){
  const result=await ask(`Who receives the most funding from ${name}?`);
  assert.equal(result.answer_status,'needs_scope');assert.deepEqual(result.sources,[]);assert.deepEqual(result.citations,{});assert.doesNotMatch(result.answer,/\$[\d,]+/);
  const choices=choiceQuestions(result.answer);assert.equal(choices.length,expected.length);
  for(const label of expected)assert.ok(choices.some(q=>q.includes(label)),label);
  for(const question of choices){const resolved=await ask(question);assert.equal(resolved.answer_status,'calculated');assert.ok(resolved.sources.every(x=>!x.href.startsWith('/money?')||new URL(x.href,'https://opax.test').searchParams.has('focus')));}
 }
 const castle=await ask('Who receives the most funding from Crown Castle Australia?');
 assert.match(castle.answer,/Labor.*\$27,000/s);assert.doesNotMatch(castle.answer,/Crown Resorts/);
 assert.ok(castle.sources.filter(s=>s.href.startsWith('/money?')).every(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')==='donor:crown castle australia'));
});
test('donor choices retain UI controls, follow-up dates and explicit jurisdiction',async()=>{
 const seed=await ask('Who donates most to Labor from gambling in 2020?');
 const follow=await ask('And Tabcorp in 2021-22?',{context:history(seed.money_question)});
 const q=choiceQuestions(follow.answer)[0];assert.ok(q);const result=await ask(q);
 assert.equal(result.answer_status,'calculated');assert.match(result.money_context,/2021–22/);assert.match(result.answer,/Tabcorp/);
 const controlled=await ask('Who receives the most funding from Tabcorp?',{party:'Liberal',from:'2020',to:'2020'});
 const control=await ask(choiceQuestions(controlled.answer)[0]);assert.match(control.answer,/\$87,300/);assert.match(control.money_context,/2020–21/);
 const qld=await ask('Who receives the most funding from Tabcorp?',{state:'qld',from:'2020',to:'2020'});
 const choice=choiceQuestions(qld.answer)[0];assert.match(choice,/Queensland/);const state=await ask(choice);assert.equal(state.scope.state,'qld');
});
test('parenthesised donor names remain complete clickable choice URLs',async()=>{
 const result=await ask('Who receives the most funding from Visa AP?');
 assert.equal(result.answer_status,'needs_scope');assert.match(result.answer,/%28Australia%29/);
 const choices=choiceQuestions(result.answer);assert.deepEqual(choices,['Who receives the most funding from Visa AP (Australia) Pty Ltd in federal records?']);
 const resolved=await ask(choices[0]);assert.equal(resolved.answer_status,'calculated');assert.match(resolved.answer,/Labor.*\$1,969,126/s);
 assert.ok(resolved.sources.filter(s=>s.href.startsWith('/money?')).every(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')==='donor:visa ap australia'));
});
test('short-name suggestions never remove unsupported qualifiers or combined groups',async()=>{
 for(const name of ['Tabcorp Holdings Europe','Pratt Holdings Mining','Macquarie Group Foundation','Tabcorp and unicorns']){
  const result=await ask(`Who receives the most funding from ${name}?`);assert.equal(result.answer_status,'needs_scope',name);assert.deepEqual(choiceQuestions(result.answer),[],name);assert.deepEqual(result.sources,[]);assert.doesNotMatch(result.answer,/\$[\d,]+/);
 }
});


test('disclosure sources explain the calculation without file paths or markdown and retain filtered records',async()=>{
 for(const question of ['Who receives the most money from gambling donors?','Did Labor or Liberal receive more gambling money in 2020?','How did gambling receipts to Labor change from 2020 to 2021?']) {
  const r=await ask(question);assert.equal(r.answer_status,'calculated');
  assert.ok(r.sources.length>1);
  for(const source of r.sources){
   assert.doesNotMatch(source.snippet,/money(?:\.[a-z]+)?\.json|donor-to-party edges|year key|Do not present|\*\*/);
   assert.doesNotMatch(source.href,/\/graph\//);
   assert.equal(source.source,'AEC political disclosure records');
   assert.equal(source.dateLabel,'Calculated by Opax');
  }
  assert.ok(r.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('industry')==='gambling'));
  assert.match(r.answer,/Download the calculation data/);
 }
});

test('two-party funding comparisons retain both sides through financial-year follow-ups',async()=>{
 const seed='Who gets more gambling money, Labor or Liberal?';
 const first=await ask('And in 2020–21?',{context:history(seed)});
 assert.deepEqual(first,await ask(seed.replace('?',' in 2020–21?')));
 assert.match(first.answer,/Labor received \$97,478 more/);
 assert.match(first.answer,/\| Labor \| \$457,673 \| 47 \|/);
 assert.match(first.answer,/\| Liberal \| \$360,195 \| 33 \|/);
 const next=await ask('And in 2021–22?',{context:history(seed,'And in 2020–21?')});
 assert.deepEqual(next,await ask(seed.replace('?',' in 2021–22?')));
 assert.match(next.answer,/Labor received \$551,999 more/);
 assert.match(next.answer,/\| Labor \| \$1,011,028 \| 67 \|/);
 assert.match(next.answer,/\| Liberal \| \$459,029 \| 31 \|/);
 for(const r of [first,next]) {
  assert.equal(r.answer_status,'calculated');assert.equal(r.scope.party,undefined);
  assert.equal(r.sources.length,3);
  assert.deepEqual(r.sources.slice(1).map(s=>new URL(s.href,'https://opax.test').searchParams.get('party')).sort(),['party:Labor','party:Liberal']);
  for(const s of r.sources.slice(1)) {
   const p=new URL(s.href,'https://opax.test').searchParams;
   assert.equal(p.get('industry'),'gambling');assert.equal(p.get('jur'),'federal');
   assert.equal(p.get('from'),r.scope.from);assert.equal(p.get('to'),r.scope.to);
  }
  for(const [key,spans] of Object.entries(r.citations)) {
   assert.ok(r.sources.some(s=>s.resource===key&&s.cited));
   for(const [start,end] of spans)assert.ok(start>=0&&end>start&&end<=Array.from(r.answer).length);
  }
 }
});

test('comparison canonical questions retain UI periods and survive truncated conversation history',async()=>{
 const seed='Who gets more gambling money, Labor or Liberal?';
 const r=await ask(seed,{from:'2020',to:'2020'});
 assert.match(r.money_question,/Labor or Liberal/);assert.match(r.money_question,/in 2020/);assert.doesNotMatch(r.money_question,/\$/);
 assert.deepEqual(await ask(r.money_question),r);
 let last=r;
 for(let n=0;n<14;n++) {
  const year=n%2?2020:2021;
  last=await ask(`And in ${year}?`,{context:history(last.money_question)});
  assert.equal(last.answer_status,'calculated');assert.equal(last.scope.from,String(year));
  assert.match(last.money_question,/Labor or Liberal/);
 }
 const controlled=await ask('And in 2021–22?',{context:history(last.money_question),from:'2022',to:'2022'});
 assert.deepEqual(controlled,await ask(seed,{from:'2022',to:'2022'}));
 assert.deepEqual(await ask(controlled.money_question),controlled);
});

test('comparison date clarification preserves the pair for an explicit correction',async()=>{
 const seed=(await ask('Who gets more gambling money, Labor or Liberal in 2020?')).money_question;
 for(const question of ['And last year?','What about January 2021?','And in calendar year 2021?','And in 2020 and 2022?','And in 2021–23?']) {
  const r=await ask(question,{context:history(seed)});
  assert.equal(r.answer_status,'needs_period',question);assert.equal(r.money_question,seed);
  assert.deepEqual(r.sources,[]);assert.doesNotMatch(r.answer,/\$/);
  for(const prior of [question,r.money_question]) {
   const correction=await ask('And in 2021–22?',{context:history(seed,prior)});
   assert.equal(correction.answer_status,'calculated',question);assert.match(correction.answer,/\$551,999 more/);
  }
 }
});

test('comparison periods replace shared bounds including all-years reset and missing-data recovery',async()=>{
 const seed='Who gets more gambling money, Labor or Liberal in 2020?';
 for(const question of ['And all years?','And over all years?','What about lifetime?']) {
  const r=await ask(question,{context:history(seed)});
  assert.deepEqual(r,await ask('Who gets more gambling money, Labor or Liberal?'),question);
 }
 const range=await ask('And between 2020 and 2021?',{context:history(seed)});
 assert.match(range.answer,/\$649,477 more/);assert.equal(range.scope.from,'2020');assert.equal(range.scope.to,'2021');
 const missing=await ask('And in 1900?',{context:history(seed)});
 assert.equal(missing.answer_status,'evidence_gap');assert.deepEqual(missing.sources,[]);
 assert.doesNotMatch(missing.answer,/\$0|received more/);assert.match(missing.money_question,/in 1900/);
 const recovery=await ask('And in 2021–22?',{context:history(missing.money_question)});
 assert.match(recovery.answer,/\$551,999 more/);
});

test('comparison history cannot silently change dimensions or borrow generated scope',async()=>{
 const seed='Who gets more gambling money, Labor or Liberal?';
 for(const question of ['And mining in 2021?','And Liberal?','And the unicorn lobby in 2021?','And in 2021 excluding coal?','What did they say?']) {
  assert.equal(await ask(question,{context:history(seed)}),null,question);
  assert.equal(await ask('And in 2021?',{context:history(seed,question)}),null,question);
 }
 for(const question of ['Who gets more gambling money, Labor or Liberal or Greens?',
  'Compare mining and gambling money to Labor',
  'How did gambling receipts to Labor change from 2020 to 2021?',
  'Who gets more money from gambling and aerospace, Labor or Liberal?',
  'Compare gambling money, Labor in 2020 or Liberal in 2021?'])
  assert.equal(await ask('And in 2022?',{context:history(question)}),null,question);
 assert.equal(await ask('And in 2021?',{context:[{author:'answer',text:seed}]}),null);
 assert.equal(await ask('And in 2021?',{context:history(seed),speaker:'Pauline Hanson'}),null);
});

test('an exact donor comparison retains the donor and both parties when changing year',async()=>{
 const seed='Who gets more funding from Tabcorp Holdings, Labor or Liberal in 2020?';
 const r=await ask('And in the financial year ending 2022?',{context:history(seed)});
 assert.deepEqual(r,await ask('Who gets more funding from Tabcorp Holdings, Labor or Liberal in 2021?'));
 assert.equal(r.answer_status,'calculated');assert.match(r.money_question,/Tabcorp Holdings/);
 assert.deepEqual(await ask(r.money_question),r);
 assert.ok(r.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')==='donor:tabcorp'));
});

test('comparison follow-ups cannot discard an unsupported time baseline',async()=>{
 for(const suffix of ['than in 2020','than before','compared with 2020','compared to 2020','in 2020 versus 2021']) {
  const seed=`Who gets more gambling money, Labor or Liberal, ${suffix}?`;
  const result=await ask('And in 2021–22?',{context:history(seed)});
  assert.equal(result,null,suffix);
 }
});

test('comparison continuations use all established financial-year label forms',async()=>{
 const context=history('Who gets more gambling money, Labor or Liberal?');
 const expected=await ask('Who gets more gambling money, Labor or Liberal in 2021?');
 for(const period of ['FY2021-22','FY2021–2022','2021/22','2021‑22','financial year 2021–2022','FY ending 2022'])
  assert.deepEqual(await ask(`And during ${period}?`,{context}),expected,period);
});
