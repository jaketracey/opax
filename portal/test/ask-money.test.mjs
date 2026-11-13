import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('../src/ask-money.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {rankedMoneyAnswer,isMoneyRanking}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
import {typedMoney,untypedMoney,moneyAssets} from './money-graph-data.mjs';
// Every test below reads the published typed export (donations lead, all receipt types beside them), except the
// block at the end, which feeds the same calculator the export with its receipt-type fields stripped.
const graph=typedMoney(),legacyGraph=untypedMoney();
const assets=moneyAssets('typed'),untypedAssets=moneyAssets('untyped');
const ask=(question,filters={})=>rankedMoneyAnswer({question,...filters},assets);
const askUntyped=(question,filters={})=>rankedMoneyAnswer({question,...filters},untypedAssets);
const history=(...questions)=>questions.map(text=>({author:'user',text}));
// Industry membership can change after a classifier correction. Calculate
// expectations from the published labels without changing any receipt amount.
// On the typed export the lead measure is each edge's Donation Received amount; the untyped block passes legacy totals.
const donations=e=>e.by_type?.donation_received??0,legacyTotal=e=>e.total;
const industryTotal=(industry,party,g=graph,amount=donations)=>{
 const ids=new Set(g.nodes.filter(n=>n.kind==='donor'&&n.industry===industry).map(n=>n.id));
 return g.edges.filter(e=>ids.has(e.source)&&e.target==='party:'+party&&!e.flow&&!e.grant).reduce((total,e)=>total+amount(e),0);
};
const aud=amount=>'$'+amount.toLocaleString('en-AU');

test('published industry labels separate Crown Castle from Crown Resorts',()=>{
 assert.equal(graph.nodes.find(n=>n.id==='donor:crown castle australia').industry,'telecom');
 assert.equal(graph.nodes.find(n=>n.id==='donor:crown resorts').industry,'gambling');
});

test('a donor name containing Federal does not block a Tasmanian comparison or its follow-ups',async()=>{
 const question='Who gets more funding from The Federal Group, Labor or Liberal in Tasmania in 2025–26?';
 const result=await ask(question);
 assert.equal(result?.answer_status,'calculated');
 assert.match(result.answer,/Labor received \$1,698 more from (?:The )?Federal Group than Liberal/);
 assert.match(result.answer,/\| Labor \| \$5,920 \| 1 \|/);assert.match(result.answer,/\| Liberal \| \$4,222 \| 1 \|/);
 assert.equal(result.scope.state,'tas');
 const links=result.sources.filter(s=>s.href.startsWith('/money?')).map(s=>new URL(s.href,'https://opax.test').searchParams);
 assert.deepEqual(links.map(p=>p.get('party')).sort(),['party:Labor','party:Liberal']);
 for(const p of links){assert.equal(p.get('jur'),'tas');assert.equal(p.get('focus'),'donor:federal group');assert.equal(p.get('from'),'2025');assert.equal(p.get('to'),'2025')}
 assert.deepEqual(await ask(result.money_question),result);
 const missing=await ask('And in 2024–25?',{context:history(result.money_question)});
 assert.equal(missing.answer_status,'calculated');assert.equal(missing.comparison_complete,false);assert.match(missing.answer,/Held-period figures/);
 const recovered=await ask('And in 2025–26?',{context:history(missing.money_question)});
 assert.deepEqual(recovered,result);
 const all=await ask('And all years?',{context:history(recovered.money_question)});
 assert.equal(all.answer_status,'calculated');assert.match(all.money_question,/(?:The )?Federal Group.*Tasmania/);
 assert.ok(all.sources.filter(s=>s.href.startsWith('/money?')).every(s=>!new URL(s.href,'https://opax.test').searchParams.has('from')));
});

test('donor region disambiguation also retains single rankings and separate jurisdiction words',async()=>{
 const query='Who receives the most disclosed receipts from The Federal Group in Tasmania in 2025–26?';
 const ranking=await ask(query);assert.equal(ranking.answer_status,'calculated');assert.match(ranking.answer,/^\*\*Labor\*\*/);
 assert.deepEqual(ranking,await ask(query,{state:'tas'}));
 for(const query of [
  'Who gets more funding from The Federal Group, Labor or Liberal in federal and Tasmania records in 2025?',
  'Who gets more funding from The Federal Group, Labor or Liberal in NSW and Tasmania in 2025?',
  'Who gets more gambling money, Labor or Liberal in federal and Tasmania records in 2025?',
  'Who gets more funding from Unknown Federal Company, Labor or Liberal in Tasmania in 2025?',
 ])assert.equal(await ask(query),null,query);
});

test('ordinary industry recipient rankings do not require the word money',async()=>{
 const answer=await ask('Who gets the most from mining?');
 assert.equal(answer.answer_status,'calculated');
 assert.match(answer.answer,/^\*\*United Australia Party\*\*/);
 assert.match(answer.answer,/\$61,625,526\*\* in donations received/);
 assert.ok(answer.sources.some(s=>{const p=new URL(s.href,'https://opax.test').searchParams;return p.get('industry')==='mining'&&p.get('party')==='party:United Australia Party'}));
 for(const [question,control] of [
  ['Who takes the most from gambling?','Who takes the most money from gambling?'],
  ['Which party receives the most from fossil fuels?','Which party receives the most funding from fossil fuels?'],
  ['Who gets the most from the media industry?','Who gets the most funding from the media industry?'],
  ['Who gets the most from mining in 2020?','Who gets the most funding from mining in 2020?'],
 ]) assert.deepEqual(await ask(question),await ask(control),question);
 const next=await ask('And in 2021?',{context:history('Who gets the most from mining in 2020?')});
 assert.deepEqual(next,await ask('Who receives the most disclosed receipts from mining donors in federal records in 2021?'));
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
 const r=await ask('Who receives the most disclosed receipts from fossil fuel donors?');
 // 13 Nov 2026: Liberal $957,000 to $807,000 and Labor $269,975 to $249,975: Linc Energy left the federal map at rank 251 when NIOA's two 2015-16 gifts of $20,000 to the Liberal Democratic Party (one on the party's return, one the donor's own) lifted NIOA into the top 250 (export rule 10); its fossil-fuel receipts left with it.
 assert.match(r.answer,/^\*\*Liberal\*\*/);assert.match(r.answer,/\| Liberal \| \$807,000 \| 75% \| \$2,773,580 \(mostly other receipts\) \|/);assert.match(r.answer,/\| Labor \| \$249,975 \| 23% \| \$3,708,132 \(mostly other receipts\) \|/);
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/These figures are party-level totals from recipient returns in OPAX’s published selection/);
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
 // The winner has no legal form in its name, so it is withheld (public/donor-entity.js), not dropped.
 // Typed: the Liberal gambling and fossil-fuel selections in 2020–21 hold only Other Receipt cells, so they lead with those.
 const liberal=await follow('What about Liberal?',/^The AEC records no donations from gambling-linked sources to Liberal in 2020–21\. In other receipts \(amounts other than donations or subscriptions\), the largest gambling-linked source to Liberal is \*\*Sportsbet: \$112,500\*\*, 2020–21\./,p=>p.get('party')==='party:Liberal'&&p.get('industry')==='gambling'&&p.get('from')==='2020'&&p.get('to')==='2020');
 assert.match(liberal.answer,/the selection totals \$142,500/);assert.ok(liberal.sources.some(x=>/sportsbet/i.test(x.title)));
 await follow('And fossil fuel donors?',/Woodside Energy: \$55,000\*\*.*Santos Limited follows on \$44,000/s,p=>p.get('industry')==='fossil_fuels'&&p.get('party')==='party:Liberal'&&p.get('from')==='2020');
 await follow('What about Tabcorp Holdings?',/^The AEC records no donations from Tabcorp Holdings Limited to Liberal in 2020–21\. In other receipts \(amounts other than donations or subscriptions\), the largest source to Liberal is \*\*Tabcorp Holdings Limited: \$30,000\*\*, 2020–21\./,p=>p.get('focus')==='donor:tabcorp'&&!p.has('industry')&&p.get('party')==='party:Liberal');
 await follow('And in 2021-22?',/^The AEC records no donations from Tabcorp Holdings Limited to Liberal in 2021–22\. In other receipts \(amounts other than donations or subscriptions\), the largest source to Liberal is \*\*Tabcorp Holdings Limited: \$30,000\*\*, 2021–22\./,p=>p.get('from')==='2021'&&p.get('to')==='2021'&&p.get('party')==='party:Liberal');
 // The question's year beats the UI dates and the party control beats the conversation. Tabcorp's typed donations to
 // the Nationals end in 2015–16 (the untyped 2019–20 step is pinned at the end of this file).
 const controlled=await ask('What about 2015-16?',{context:history(...turns),party:'Nationals',from:'2022',to:'2022'});
 assert.equal(controlled.answer_status,'calculated');assert.match(controlled.answer,/Tabcorp Holdings Limited: \$20,000\*\*, donations received/);
 assert.match(controlled.money_context,/Financial years: 2015–16/);
 assert.ok(controlled.sources.some(s=>s.href.includes('party%3ANationals')&&s.href.includes('from=2015')));
});

test('unknown follow-up scope and relative years never reuse a stale winner',async()=>{
 const context=history('Who receives the most money from gambling donors in 2020?');
 for(const question of ['And the unicorn lobby?','What about mining and unicorns?','And Westpac and the unicorn lobby?']) {
  const result=await ask(question,{context});assert.equal(result?.answer_status,'needs_scope',question);
  assert.deepEqual(result.citations,{});assert.deepEqual(result.sources,[]);assert.doesNotMatch(result.answer,/\$[\d,]+/);
 }
 // A follow-up period is read, stated and answered for the same selection.
 for(const [question,reading,from,to] of [['And last year?',/Reading “last year” as 2024–25/,'2024','2024'],['What about January 2021?',/reads the period as 2020–21/,'2020','2020'],['And in 2020 and 2022?',/continuous span 2020–21 to 2022–23/,'2020','2022']]) {
  const result=await ask(question,{context});assert.equal(result?.answer_status,'calculated',question);assert.match(result.money_reading,reading,question);
  assert.ok(result.sources.some(s=>s.href.includes(`from=${from}&to=${to}`)),question);
 }
 const missing=await ask('And in 1900?',{context});assert.equal(missing.answer_status,'calculated');assert.equal(missing.coverage.matched,false);assert.match(missing.answer,/Held-period figures/);
});

test('a self-contained money question resets history; non-funding turns end inherited receipt scope',async()=>{
 const prior='Who donated the most to Labor from gambling in 2020?';
 const standalone='Who receives the most disclosed receipts from fossil fuel donors?';
 assert.deepEqual(await ask(standalone,{context:history(prior)}),await ask(standalone));
 assert.equal(await ask('What did they say about housing?',{context:history(prior)}),null);
 assert.equal(await ask('And Liberal?',{context:history(prior,'What did Pauline Hanson say about housing?')}),null);
 assert.equal(await ask('And Liberal?',{context:[{author:'answer',text:prior}]}),null);
 for(const filter of [{kind:'speech'},{speaker:'Pauline Hanson'},{topic:'housing'},{chamber:'senate'}])
  assert.equal(await ask('And Liberal?',{context:history(prior),...filter}),null);
});

test('year replacement, all-year reset and legacy user roles retain exact donor scope',async()=>{
 const prior='Who receives the most disclosed receipts from Tabcorp Holdings in 2020?';
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
  assert.match(answer.answer,i%2?/The Star Entertainment Group Limited: \$1,000\*\*, donations received/:/In other receipts \(amounts other than donations or subscriptions\), the largest gambling-linked source to Liberal is \*\*Sportsbet: \$112,500\*\*/);
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
 assert.match(gambling.answer,/^\*\*Liberal\*\*/);assert.ok(gambling.answer.includes(`**${aud(industryTotal('gambling','Liberal'))}** in donations received`));assert.equal(aud(industryTotal('gambling','Liberal')),'$1,093,352');assert.match(gambling.answer,/party-level totals/);
 for(const party of ['Labor','One Nation']) {
  const answer=await ask(`Who donates the most to ${party}?`);
  const matching=graph.edges.filter(e=>e.target==='party:'+party&&e.source.startsWith('donor:')&&!e.flow&&!e.grant).sort((a,b)=>donations(b)-donations(a));
  const winner=graph.nodes.find(n=>n.id===matching[0].source).label;
  assert.ok(answer.answer.split('\n')[0].includes(`**${winner}:`));assert.match(answer.answer,/\| Source \|/);
  assert.ok(answer.sources.some(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')===matching[0].source));
 }
});
test('each table citation sits inside a cell and has a linked evidence record',async()=>{
 const r=await ask('Who donates the most to Labor?');const chars=Array.from(r.answer);
 for(const [id,ranges] of Object.entries(r.citations)) {assert.ok(r.sources.some(s=>s.resource===id&&s.cited));for(const [start,end] of ranges){assert.ok(end>start);assert.ok(start>=0&&end<=chars.length);assert.ok(chars.slice(start,end).join('').trim());}}
});
test('explicit date and party controls win; from an industry is not since a year',async()=>{
 const r=await ask('Who takes the most money from gambling in 2020?');
 assert.match(r.answer,/2020–21/);assert.doesNotMatch(r.answer,/2020–21 to 2020–21/);assert.ok(r.sources.some(s=>s.href.includes('from=2020&to=2020')));
 const filtered=await ask('Who donates the most to Labor?',{party:'Liberal',from:'2020',to:'2020'});
 assert.match(filtered.answer,/to Liberal/);assert.ok(filtered.sources.some(s=>s.href.includes('party=party%3ALiberal')));
 const recent=await ask('Who donates the most to Labor recently?');
 assert.equal(recent.answer_status,'calculated');assert.match(recent.money_reading,/Reading “recently” as the last three published disclosure years, 2022–23 to 2024–25/);
 assert.ok(recent.sources.some(s=>s.href.includes('from=2022&to=2024')));
 assert.ok(recent.money_followups.some(f=>f.label==='All years'&&!/\b20\d{2}\b/.test(f.question)));
});
test('unsupported questions are not silently replaced by lifetime or party totals',async()=>{
 for(const q of ['Who donates the most to an unknown party?','Who donates the most to Labor from the unicorn lobby?']) {const r=await ask(q);assert.equal(r.answer_status,'needs_scope');assert.deepEqual(r.sources,[]);assert.doesNotMatch(r.answer,/\$[\d,]+/);}
 for(const q of ['How much money did Labor receive?', 'What is the total gambling funding?', 'Who donates the most blood?','Which MPs personally received gambling money?','Who takes gambling money and what do they say about pokies?','Who receives the most grants?','Who donates the most to Labor excluding unions?']) assert.equal(isMoneyRanking({question:q}),false,q);
 assert.equal(await ask('Who donates the most to Labor?',{state:'nsw'}),null);
 assert.equal(isMoneyRanking({question:'Who donates the most to Labor?',speaker:'Pauline Hanson'}),false);
});

test('biggest industry donors and biggest recipient parties are distinct rankings',async()=>{
 const donors=await ask('Who are the biggest gambling donors?');
 assert.match(donors.answer,/\| Source \|/);assert.match(donors.answer,/gambling-linked/);
 const parties=await ask('Which party receives the largest funding from gambling donors?');
 assert.match(parties.answer,/\| Recipient \|/);assert.match(parties.answer,/^\*\*Liberal\*\*/);
 const flow=await ask('Who donates the most to who?');assert.match(flow.answer,/\| Source → party \|/);
});

test('party comparisons calculate a dollar difference and cite each scoped side',async()=>{
 const r=await ask('Who gets more gambling money, Labor or Liberal?');
 const labor=industryTotal('gambling','Labor'),liberal=industryTotal('gambling','Liberal');
 assert.equal(r.answer_status,'calculated');assert.ok(r.answer.includes(`Liberal received ${aud(liberal-labor)} more from gambling receipt sources than Labor`));assert.equal(aud(liberal-labor),'$26,286');
 assert.ok(r.answer.includes(aud(labor)));assert.ok(r.answer.includes(aud(liberal)));
 for(const party of ['Labor','Liberal']) assert.ok(r.sources.some(s=>s.href.includes('party=party%3A'+party)&&s.href.includes('industry=gambling')));
 const dated=await ask('Who gets more gambling money, Labor or Liberal in 2021?');
 assert.match(dated.answer,/Labor received \$22,199 more/);assert.match(dated.answer,/\| Labor \| \$82,199 \| 5 \|/);assert.match(dated.answer,/\| Liberal \| \$60,000 \| 1 \|/);
 for(const s of dated.sources.slice(1))assert.ok(s.href.includes('from=2021&to=2021'));
 // In 2020–21 only Labor holds gambling donations, so the comparison stays incomplete instead of naming a winner.
 const oneSided=await ask('Who gets more gambling money, Labor or Liberal in 2020?');
 assert.equal(oneSided.answer_status,'calculated');assert.equal(oneSided.comparison_complete,false);assert.match(oneSided.answer,/^Labor recorded \$1,000 in donations received/);assert.doesNotMatch(oneSided.answer,/received \$[\d,]+ more/);
 for(const [id,ranges] of Object.entries(r.citations)) {assert.ok(r.sources.some(s=>s.resource===id));for(const [start,end] of ranges)assert.ok(start>=0&&end>start&&end<=Array.from(r.answer).length)}
});

test('industry comparisons do not treat banks as every finance organisation',async()=>{
 const unsupported=await ask('Who gives more money to Labor, unions or banks?');
 assert.equal(unsupported.answer_status,'calculated');assert.match(unsupported.answer,/Finance/);
 assert.match(unsupported.money_reading,/Reading banks as the finance grouping in this map, which also holds insurers and investment firms/);
 const r=await ask('Who gives more money to Labor, unions or finance?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\| Source industry \|/);
 const unions=industryTotal('unions','Labor'),finance=industryTotal('finance','Labor');
 assert.ok(r.answer.includes(`Unions accounted for ${aud(unions-finance)} more to Labor than Finance`));assert.deepEqual([unions,finance].map(aud),['$67,541,836','$8,694,783']);
 assert.ok(r.answer.includes(aud(unions)));assert.ok(r.answer.includes(aud(finance)));
 assert.ok(r.sources.some(s=>s.href.includes('industry=unions')&&s.href.includes('party=party%3ALabor')));
 assert.ok(r.sources.some(s=>s.href.includes('industry=finance')&&s.href.includes('party=party%3ALabor')));
 assert.equal((await ask('Who receives the most money from banks?')).answer_status,'calculated');
 // "Energy" is read as the fossil fuels grouping, and the reading is stated.
 const energy=await ask('Who receives the most disclosed receipts from energy?');
 assert.equal(energy.answer_status,'calculated');assert.match(energy.money_reading,/Reading energy as the fossil fuels grouping, which holds the energy producers in this map/);
 assert.ok(energy.sources.some(s=>s.href.includes('industry=fossil_fuels')));
});

test('familiar corporate names find the donor without a model ranking',async()=>{
 const r=await ask('Who gets the most money from Mineralogy?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/^\*\*United Australia Party\*\*/);assert.match(r.answer,/\*\*\$55,677,806\*\* in donations received/);assert.match(r.answer,/The leader has \$56,590,437 across all receipt types/);
 assert.ok(r.sources.some(s=>s.href.includes('focus=donor%3Amineralogy')));
});

test('unsupported comparisons and missing data never become a false winner',async()=>{
 for(const q of ['Who gets more money, Labor or Liberal or Greens?','Who gets more money from gambling or mining, Labor or Liberal?','Who gets more money from the unicorn lobby, Labor or Liberal?','Who gets more unicorn industry money, Labor or Liberal?','Who gets more gambling money adjusted for inflation, Labor or Liberal?']) assert.equal(await ask(q),null,q);
 // Separate years are read as the continuous span they mark out, and said so.
 const mixedPeriods=await ask('Compare gambling money, Labor in 2020 or Liberal in 2021?');
 assert.equal(mixedPeriods.answer_status,'calculated');assert.match(mixedPeriods.money_reading,/continuous span 2020–21 to 2021–22/);
 const sharedRange=await ask('Who gets more gambling money, Labor or Liberal between 2020 and 2021?');
 assert.equal(sharedRange.answer_status,'calculated');assert.match(sharedRange.answer,/Labor received \$23,199 more/);assert.match(sharedRange.answer,/\| Labor \| \$83,199 \| 6 \|/);assert.match(sharedRange.answer,/\| Liberal \| \$60,000 \| 1 \|/);
 const missing=await ask('Who gets more gambling money, Labor or Liberal in 1900?');
 assert.equal(missing.answer_status,'calculated');assert.equal(missing.comparison_complete,false);assert.doesNotMatch(missing.answer,/\$0|received more/);
});

test('year comparisons calculate separate cells and cite each exact year',async()=>{
 for(const q of ['Did Labor receive more gambling money in 2020 or 2021?','How did gambling receipts to Labor change from 2020 to 2021?','Compare gambling receipts to Labor in 2021 and 2020']) {
  const r=await ask(q);
  assert.equal(r.answer_status,'calculated',q);assert.match(r.answer,/Labor received \$81,199 more from gambling receipt sources in 2021–22 than in 2020–21/);
  assert.match(r.answer,/\| 2020–21 \| \$1,000 \| 1 \|/);assert.match(r.answer,/\| 2021–22 \| \$82,199 \| 5 \|/);
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
 // Typed Labor gambling donations: 2018–19 $39,000; 2019–20 $10,000; 2020–21 $1,000; 2021–22 $82,199; none in 2022–23.
 const ends=await ask('Compare gambling receipts to Labor in 2018 versus 2021');
 assert.match(ends.answer,/\$43,199 more/);assert.match(ends.answer,/\| 2018–19 \| \$39,000 \| 3 \|/);assert.match(ends.answer,/\| 2021–22 \| \$82,199 \| 5 \|/);
 assert.doesNotMatch(ends.answer,/\$10,000\b|\$1,000\b|2019–20|2020–21/);
 const decrease=await ask('How did gambling receipts to Labor change from 2018 to 2019?');
 assert.match(decrease.answer,/\$29,000 less from gambling receipt sources in 2019–20 than in 2018–19/);
 const unknown=await ask('Compare gambling and aerospace money to Labor in 2020 versus 2021');
 assert.equal(unknown.answer_status,'needs_scope');assert.doesNotMatch(unknown.answer,/\$/);
});

test('year comparisons honour explicit dates and clarify ambiguous years and multiple cohorts',async()=>{
 for(const q of ['Did Labor or Liberal receive more gambling money in 2020 than in 2021?','Compare gambling money for Labor and Liberal, 2020 vs 2021?','Compare gambling receipts in 2020 versus 2021']) {
  const r=await ask(q);assert.equal(r.answer_status,'needs_scope',q);assert.doesNotMatch(r.answer,/\$/);
 }
 // An open or single-year change is read as two named years, and the reading is stated.
 for(const [q,reading,years] of [['How did gambling receipts to Labor change since 2020?',/Reading “since 2020” as the 2019–20 to 2024–25 disclosure years/,['2019','2024']],
  ['How did gambling receipts to Labor change from 2020 to 2020?',/Reading this as the change from 2019–20 to 2020–21/,['2019','2020']],
  ['Compare gambling receipts to Labor, 2019–2020 versus 2021–2022',/Reading 2019–2020 as the 2019–20 financial year\. Reading 2021–2022 as the 2021–22 financial year/,['2019','2021']]]) {
  const r=await ask(q);assert.equal(r.answer_status,'calculated',q);assert.match(r.money_reading,reading,q);
  for(const y of years)assert.ok(r.sources.some(s=>s.href.includes(`from=${y}&to=${y}`))||r.answer.includes(`from=${y}&to=${y}`),q+' '+y);
 }
 const filters=await ask('How did gambling receipts to Labor change from 2020 to 2021?',{from:'2022',to:'2024'});
 assert.equal(filters.answer_status,'calculated');assert.match(filters.money_context,/2020–21.*2021–22/);assert.doesNotMatch(filters.answer,/2024–25/);
 const missing=await ask('Compare gambling receipts to Labor in 1900 versus 2021');
 assert.equal(missing.answer_status,'calculated');assert.equal(missing.comparison_complete,false);assert.match(missing.answer,/\$82,199/);assert.doesNotMatch(missing.answer,/\$0|received.*more/);
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
  assert.equal(r.answer_status,'calculated',label);assert.match(r.answer,/\*\*\$1,000\*\* in donations received/);assert.doesNotMatch(r.answer,/\$83,199/);
  assert.match(r.money_context,/Financial years: 2020–21/);assert.match(r.money_context,/5 receipt sources with matching receipts/);
  assert.ok(r.sources.some(s=>s.href.includes('from=2020&to=2020')),label);
 }
 const r=await ask('Who gets more gambling money, Labor or Liberal in 2020/2021?');
 assert.equal(r.comparison_complete,false);assert.match(r.answer,/^Labor recorded \$1,000 in donations received \(AEC receipt type: Donation Received\), 2020–21\./);assert.doesNotMatch(r.answer,/\$23,199|\$83,199/);
});

test('comparisons between financial-year labels keep each year separate',async()=>{
 const r=await ask('Did Labor receive more gambling money in 2020–21 or 2021–22?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\$81,199 more/);
 assert.match(r.money_context,/2020–21 and 2021–22/);
 for(const y of ['2020','2021'])assert.ok(r.sources.some(s=>s.href.includes(`from=${y}&to=${y}`)));
 const range=await ask('Who gets the most money from gambling from 2020–21 to 2022–23?');
 assert.equal(range.answer_status,'calculated');assert.ok(range.sources.some(s=>s.href.includes('from=2020&to=2022')));
});

test('ambiguous or invalid year labels cannot silently change the period',async()=>{
 // An unusual label is read in its most natural sense, and the reading is stated.
 for(const [label,reading,from,to] of [['2020-2021',/Reading 2020-2021 as the 2020–21 financial year/,2020,2020],['2020/22',/Reading 2020\/22 as the 2020–21 to 2021–22 financial years/,2020,2021],
  ['2020/2022',/Reading 2020\/2022 as the 2020–21 to 2021–22 financial years/,2020,2021],['2020–20',/Reading 2020–20 as the 2020–21 financial year/,2020,2020],['2020-01-01',/reads the period as 2019–20/,2019,2019]]) {
  const r=await ask(`Who gets the most money from gambling in ${label}?`);
  assert.equal(r.answer_status,'calculated',label);assert.match(r.money_reading,reading,label);
  assert.ok(r.sources.some(s=>s.href.includes(`from=${from}&to=${to}`)),label);
 }
 const r=await ask('Who gets the most money from gambling in 2020 to 2021?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\*\*\$83,199\*\* in donations received/);
});

test('a missing year shows held-period figures with unmatched requested coverage',async()=>{
 const r=await ask('Who gets the most money from gambling in 1900/1901?');
 assert.equal(r.answer_status,'calculated');assert.equal(r.coverage.matched,false);assert.match(r.answer,/Held-period figures/);assert.match(r.answer,/\*\*Liberal\*\*.*\*\*\$1,093,352\*\*/);assert.doesNotMatch(r.answer,/\$0/);
});

test('year ending labels and requested versus actual coverage remain explicit',async()=>{
 const r=await ask('Who gets the most money from gambling in financial year ending 2021?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\*\*\$1,000\*\* in donations received/);assert.doesNotMatch(r.answer,/\$82,199/);
 const sparse=await ask('Who gets the most money from gambling in 1900 to 2020?');
 assert.match(sparse.money_context,/Financial years: 1900–01 to 2020–21/);
 assert.match(sparse.money_context,/Matching recorded years: 1998–99 to 2020–21/);
 for(const q of ['Who gets the most money from gambling in financial years 2019–20 and 2021–2022?', 'Who gets the most money from gambling in 2019–20, 2021–22?', 'Who gets the most money from gambling in 2019–20 & 2021–22?', 'Who gets the most money from gambling in calendar year 2020?', 'Who gets the most money from gambling from January to June 2020?', 'Who gets the most money from gambling on 2020-1-1?']) {
  // Each is read as the financial years it names or falls in, and the reading is stated.
  const answer=await ask(q);assert.equal(answer.answer_status,'calculated',q);assert.match(answer.money_reading,/^(?:Reading|These records are grouped by financial year)/,q);
 }
});


test('an explicit year answers a period clarification without losing the funding selection',async()=>{
 const seed=await ask('Who donated most to Liberal from Tabcorp Holdings in FY2020-21?');
 for(const question of ['And last year?','What about January 2021?','And in 2020 and 2022?']) {
  // The period is read and answered for the same selection; a later explicit year still applies.
  const read=await ask(question,{context:history(seed.money_question)});
  assert.notEqual(read.answer_status,'needs_period');assert.match(read.money_reading,/^(?:Reading|These records)/,question);assert.match(read.answer,/Tabcorp|Liberal/);
  for(const prior of [question,read.money_question]) {
   const correction=await ask('And in 2021-22?',{context:history(seed.money_question,prior)});
   assert.equal(correction.answer_status,'calculated');assert.match(correction.answer,/no donations from Tabcorp Holdings Limited to Liberal in 2021–22\. In other receipts \(amounts other than donations or subscriptions\), the largest source to Liberal is \*\*Tabcorp Holdings Limited: \$30,000\*\*, 2021–22/);
  }
 }
 const unknown=await ask('And unicorns last year?',{context:history(seed.money_question)});
 assert.equal(unknown.money_question,undefined);
 assert.equal(await ask('And in 2021-22?',{context:history(seed.money_question,'And unicorns last year?')}),null);
});


const choiceQuestions=answer=>[...answer.matchAll(/\]\(\/ask\?q=([^)]*)\)/g)].map(m=>decodeURIComponent(m[1]));
test('short donor names answer for one organisation and offer the others, never pooling them',async()=>{
 // The match with the most disclosed receipts is answered and named in the
 // reading; every other match is a one-tap question with its own figures.
 for(const [name,expected] of [['Tabcorp',['Tabcorp Holdings Limited']],['Pratt',['Pratt Holdings Pty Ltd']],['Macquarie',['Macquarie Group Limited','Macquarie Technology Group Ltd']]]){
  const result=await ask(`Who receives the most disclosed receipts from ${name}?`);
  if(name==='Tabcorp'){assert.equal(result.answer_status,'calculated');assert.match(result.answer,/Tabcorp Holdings Limited/);continue;}
  assert.equal(result.answer_status,'calculated',name);assert.ok(result.sources.length>0,name);
  const answered=expected.filter(label=>result.money_reading.includes(`this answer is for ${label}`)||result.money_reading.includes(`as ${label}.`));
  assert.equal(answered.length,1,result.money_reading);
  const offered=(result.money_followups??[]).map(f=>f.question);
  for(const label of expected.filter(l=>!answered.includes(l)))assert.ok(offered.some(q=>q.includes(label)),label);
  assert.ok(result.sources.every(x=>!x.href.startsWith('/money?')||new URL(x.href,'https://opax.test').searchParams.has('focus')),name);
  for(const question of offered.filter(q=>expected.some(l=>q.includes(l)))){const resolved=await ask(question);assert.equal(resolved.answer_status,'calculated');assert.ok(resolved.sources.every(x=>!x.href.startsWith('/money?')||new URL(x.href,'https://opax.test').searchParams.has('focus')));}
 }
 // A donor without organisation evidence is never offered as a choice, ranked or matched by name.
 const crown=await ask('Who receives the most disclosed receipts from Crown?');
 assert.equal(crown.answer_status,'calculated');assert.match(crown.answer,/Crown Resorts Limited/);assert.match(crown.answer,/Crown Castle/);
 const castle=await ask('Who receives the most disclosed receipts from Crown Castle Australia?');
 assert.equal(castle.answer_status,'calculated');assert.match(castle.answer,/Crown Castle Australia/);
});
test('donor choices retain UI controls, follow-up dates and explicit jurisdiction',async()=>{
 const seed=await ask('Who donates most to Labor from gambling in 2020?');
 const follow=await ask('And Tabcorp in 2021-22?',{context:history(seed.money_question)});
 const q=choiceQuestions(follow.answer)[0];const result=q ? await ask(q) : follow;
 assert.equal(result.answer_status,'calculated');assert.match(result.money_context,/2021–22/);assert.match(result.answer,/Tabcorp/);
 const controlled=await ask('Who receives the most disclosed receipts from Tabcorp?',{party:'Liberal',from:'2020',to:'2020'});
 const control=choiceQuestions(controlled.answer)[0] ? await ask(choiceQuestions(controlled.answer)[0]) : controlled;assert.match(control.answer,/In other receipts \(amounts other than donations or subscriptions\), the largest source to Liberal is \*\*Tabcorp Holdings Limited: \$30,000\*\*/);assert.match(control.money_context,/2020–21/);
 const qld=await ask('Who receives the most disclosed receipts from Tabcorp?',{state:'qld',from:'2020',to:'2020'});
 const choice=choiceQuestions(qld.answer)[0];if(choice)assert.match(choice,/Queensland/);const state=choice ? await ask(choice) : qld;assert.equal(state.scope.state,'qld');
});
test('parenthesised donor names remain complete clickable choice URLs',async()=>{
 // A shortened name with one match is answered for it, and the reading names it in full.
 const result=await ask('Who receives the most disclosed receipts from Visa AP?');
 assert.equal(result.answer_status,'calculated');assert.match(result.money_reading,/Reading “Visa AP” as Visa AP \(Australia\) Pty Ltd\./);
 assert.match(result.answer,/^\*\*Liberal\*\* is the only party receiving \*\*\$15,000\*\* in donations received \(AEC receipt type: Donation Received\), 2020–21 from Visa AP \(Australia\) Pty Ltd, across 1 record\./);
 const resolved=await ask('Who receives the most disclosed receipts from Visa AP (Australia) Pty Ltd in federal records?');assert.equal(resolved.answer_status,'calculated');assert.match(resolved.answer,/^\*\*Liberal\*\* is the only party receiving \*\*\$15,000\*\* in donations received \(AEC receipt type: Donation Received\), 2020–21 from Visa AP \(Australia\) Pty Ltd, across 1 record\./);
 assert.ok(resolved.sources.filter(s=>s.href.startsWith('/money?')).every(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')==='donor:visa ap australia'));
});
test('short-name suggestions never remove unsupported qualifiers or combined groups',async()=>{
 for(const name of ['Tabcorp Holdings Europe','Pratt Holdings Mining','Macquarie Group Foundation','Tabcorp and unicorns']){
  const result=await ask(`Who receives the most disclosed receipts from ${name}?`);assert.equal(result.answer_status,'needs_scope',name);assert.deepEqual(choiceQuestions(result.answer),[],name);assert.deepEqual(result.sources,[]);assert.doesNotMatch(result.answer,/\$[\d,]+/);
 }
});


test('disclosure sources explain the calculation without file paths or markdown and retain filtered records',async()=>{
 for(const question of ['Who receives the most money from gambling donors?','Did Labor or Liberal receive more gambling money in 2021?','How did gambling receipts to Labor change from 2020 to 2021?']) {
  const r=await ask(question);assert.equal(r.answer_status,'calculated');
  assert.ok(r.sources.length>1);
  for(const source of r.sources){
   assert.doesNotMatch(source.snippet,/money(?:\.[a-z]+)?\.json|donor-to-party edges|year key|Do not present|\*\*/);
   assert.doesNotMatch(source.href,/\/graph\//);
   assert.equal(source.source,'AEC political disclosure records');
   assert.equal(source.dateLabel,'Calculated by OPAX');
  }
  assert.ok(r.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('industry')==='gambling'));
  assert.match(r.answer,/Download the calculation data/);
 }
});

test('two-party funding comparisons retain both sides through financial-year follow-ups',async()=>{
 const seed='Who gets more gambling money, Labor or Liberal?';
 // Typed gambling donations exist for both parties in 2018–19 and 2021–22 (only Labor holds them in 2020–21).
 const first=await ask('And in 2018–19?',{context:history(seed)});
 assert.deepEqual(first,await ask(seed.replace('?',' in 2018–19?')));
 assert.match(first.answer,/Liberal received \$5,352 more/);
 assert.match(first.answer,/\| Liberal \| \$44,352 \| 11 \|/);
 assert.match(first.answer,/\| Labor \| \$39,000 \| 3 \|/);
 const next=await ask('And in 2021–22?',{context:history(seed,'And in 2018–19?')});
 assert.deepEqual(next,await ask(seed.replace('?',' in 2021–22?')));
 assert.match(next.answer,/Labor received \$22,199 more/);
 assert.match(next.answer,/\| Labor \| \$82,199 \| 5 \|/);
 assert.match(next.answer,/\| Liberal \| \$60,000 \| 1 \|/);
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
 const r=await ask(seed,{from:'2018',to:'2018'});
 assert.match(r.money_question,/Labor or Liberal/);assert.match(r.money_question,/in 2018/);assert.doesNotMatch(r.money_question,/\$/);
 assert.match(r.answer,/Liberal received \$5,352 more/);
 assert.deepEqual(await ask(r.money_question),r);
 let last=r;
 for(let n=0;n<14;n++) {
  const year=n%2?2018:2021;
  last=await ask(`And in ${year}?`,{context:history(last.money_question)});
  assert.equal(last.answer_status,'calculated');assert.equal(last.scope.from,String(year));
  assert.match(last.money_question,/Labor or Liberal/);
 }
 const controlled=await ask('And in 2021–22?',{context:history(last.money_question),from:'2022',to:'2022'});
 assert.deepEqual(controlled,await ask(seed,{from:'2021',to:'2021'}));
 assert.deepEqual(await ask(controlled.money_question),controlled);
});

test('comparison date clarification preserves the pair for an explicit correction',async()=>{
 const seed=(await ask('Who gets more gambling money, Labor or Liberal in 2018?')).money_question;
 for(const question of ['And last year?','What about January 2021?','And in calendar year 2021?','And in 2020 and 2022?','And in 2021–23?']) {
  // The pair keeps its parties; the new period is read, stated and calculated.
  const r=await ask(question,{context:history(seed)});
  assert.equal(r.answer_status,'calculated',question);assert.match(r.money_reading,/^(?:Reading|These records)/,question);
  assert.match(r.money_question,/Labor or Liberal/,question);
  for(const prior of [question,r.money_question]) {
   const correction=await ask('And in 2021–22?',{context:history(seed,prior)});
   assert.equal(correction.answer_status,'calculated',question);assert.match(correction.answer,/Labor received \$22,199 more/);
  }
 }
});

test('comparison periods replace shared bounds including all-years reset and missing-data recovery',async()=>{
 const seed='Who gets more gambling money, Labor or Liberal in 2018?';
 for(const question of ['And all years?','And over all years?','What about lifetime?']) {
  const r=await ask(question,{context:history(seed)});
  assert.deepEqual(r,await ask('Who gets more gambling money, Labor or Liberal?'),question);
 }
 const range=await ask('And between 2020 and 2021?',{context:history(seed)});
 assert.match(range.answer,/Labor received \$23,199 more/);assert.equal(range.scope.from,'2020');assert.equal(range.scope.to,'2021');
 const missing=await ask('And in 1900?',{context:history(seed)});
 assert.equal(missing.answer_status,'calculated');assert.equal(missing.comparison_complete,false);assert.match(missing.answer,/Held-period figures/);
 assert.doesNotMatch(missing.answer,/\$0|received more/);assert.match(missing.money_question,/in 1900/);
 const recovery=await ask('And in 2021–22?',{context:history(missing.money_question)});
 assert.match(recovery.answer,/Labor received \$22,199 more/);
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

test('Queensland Labor and LNP comparisons keep both recipient identities and exact year cells',async()=>{
 for(const name of ['LNP','Liberal National Party']) {
  const r=await ask(`Who gets more money, Labor or ${name} in Queensland in 2020–21?`);
  assert.equal(r.answer_status,'calculated');assert.match(r.answer,/Labor received \$185,243 more/);
  assert.match(r.answer,/\| Labor \| \$2,183,276 \| 585 \|/);assert.match(r.answer,/\| LNP \| \$1,998,033 \| 421 \|/);
  assert.equal(r.scope.state,'qld');assert.equal(r.scope.from,'2020');assert.equal(r.scope.to,'2020');
  assert.deepEqual(r.sources.slice(1).map(s=>new URL(s.href,'https://opax.test').searchParams.get('party')).sort(),['party:LNP','party:Labor']);
  for(const s of r.sources.slice(1)){const p=new URL(s.href,'https://opax.test').searchParams;assert.equal(p.get('jur'),'qld');assert.equal(p.get('from'),'2020');assert.equal(p.get('to'),'2020');}
  assert.deepEqual(await ask(r.money_question),r);
  const next=await ask('And in 2021–22?',{context:history(r.money_question)});
  assert.match(next.answer,/Labor received \$1,590,579 more/);assert.match(next.answer,/\| LNP \| \$1,264,068 \| 196 \|/);
  assert.deepEqual(next,await ask(`Who gets more money, Labor or ${name} in Queensland in 2021–22?`));
 }
});

test('LNP comparisons retain industry or exact donor and single-party rankings remain specific',async()=>{
 const r=await ask('Who gets more gambling money, ALP or LNP in Queensland in 2021?');
 assert.equal(r.answer_status,'calculated');assert.match(r.answer,/\$34,771 more/);
 assert.match(r.answer,/\| Labor \| \$47,563 \| 8 \|/);assert.match(r.answer,/\| LNP \| \$12,792 \| 3 \|/);
 assert.ok(r.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('industry')==='gambling'));
 const donor=await ask('Who gets more money from Tabcorp Holdings, Labor or Liberal National Party in Queensland in 2021?');
 assert.equal(donor.answer_status,'calculated');assert.match(donor.answer,/\$8,645 more/);
 assert.ok(donor.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('focus')==='donor:tabcorp'));
 const single=await ask('Who donates the most to Liberal National Party in Queensland in 2021?');
 assert.equal(single.answer_status,'calculated');assert.match(single.answer,/NIOA NOMINEES.*\$100,500/s);
 assert.ok(single.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('party')==='party:LNP'));
});

test('compound party names retain distinct federal identities and reject unsupported cohorts',async()=>{
 // The typed export holds no receipt-type cells for the Country Liberal Party's ten edges (empty by_type), so the
 // answer ranks their own declarations under the same declaration label voice uses.
 const clpEdges=graph.edges.filter(e=>e.target==='party:Country Liberal Party'&&!e.flow&&!e.grant);
 assert.equal(clpEdges.length,10);assert.ok(clpEdges.every(e=>e.by_type&&!Object.keys(e.by_type).length));
 const country=await ask('Who donates the most to Country Liberal Party?');
 assert.equal(country.answer_status,'calculated');assert.equal(country.measure,'donor_declared');
 assert.equal(country.measure_label,"declared by the donors; Country Liberal Party's returns show no matching receipt");
 assert.match(country.answer,/^\*\*Thiess Pty Ltd\*\* declared the most to Country Liberal Party: \*\*\$40,000\*\*\./);
 assert.match(country.answer,/Donors declared \$107,300/);assert.equal(aud(clpEdges.reduce((s,e)=>s+e.total,0)),'$107,300');
 assert.doesNotMatch(country.answer,/no type breakdown|donations received|other financial years|See these donations/);
 assert.match(country.answer,/\[See these on the money map\]\([^)]*party=party%3ACountry\+Liberal\+Party\)/);
 const pair=await ask('Who gets more money, Liberal or LNP?');assert.equal(pair.answer_status,'calculated');assert.match(pair.answer,/Liberal received \$96,444,577 more than LNP/); // 13 Nov 2026: was $96,469,578; Linc Energy left the federal map at rank 251 when NIOA's two 2015-16 gifts of $20,000 to the Liberal Democratic Party (one on the party's return, one the donor's own) lifted NIOA into the top 250 (export rule 10).
 assert.equal(new Set(pair.sources.slice(1).map(s=>new URL(s.href,'https://opax.test').searchParams.get('party'))).size,2);
 // The comparison gives the CLP's all-types total under its own label, and says it is not like for like.
 const clp=await ask('Who gets more money, Country Liberal Party or Liberal?');
 assert.equal(clp.answer_status,'calculated');assert.equal(clp.comparison_complete,false);assert.match(clp.answer,/^Liberal recorded \$100,362,875 in donations received/); // 13 Nov 2026: was $100,512,875; Linc Energy's $150,000 left with it when NIOA's 2015-16 gifts to the Liberal Democratic Party lifted NIOA into the top 250.
 assert.match(clp.answer,/ Country Liberal Party recorded \$107,300 in all receipt types \(no type breakdown in the AEC data OPAX holds\), 1998–99 to 2004–05\. The AEC data OPAX holds for Country Liberal Party doesn't split receipts by type, so its total can't be set beside the donation figures as like for like\./);
 assert.doesNotMatch(clp.answer,/One comparison side has matching records|Country Liberal Party recorded \$[\d,]+ in donations/);
 const clpLinks=[...clp.answer.matchAll(/\[(See [^\]]+ on the money map)\]\(([^)]+)\)/g)].map(m=>[m[1],new URL(m[2]).searchParams.get('party'),new URL(m[2]).searchParams.get('receipt')]);
 assert.deepEqual(clpLinks,[['See Liberal donations on the money map','party:Liberal','donations'],['See Country Liberal Party on the money map','party:Country Liberal Party',null]]);
 for(const q of ['Who gets more money, Labor or LNP or Greens in Queensland?','Who gets more money, Labor or LNP excluding coal in Queensland?'])assert.equal(await ask(q),null,q);
 for(const q of ['Who gets more money, LNP or Unicorn Party in Queensland?','Who donates most to Country Liberal Party in Victoria?','Who donates most to Liberal National Party in Victoria?']) {
  const r=await ask(q);assert.equal(r.answer_status,'needs_scope',q);assert.deepEqual(r.sources,[]);assert.doesNotMatch(r.answer,/\$[\d,]+/);
 }
});

test('an explicit ranking year beats stale UI dates and reports actual calculated coverage',async()=>{
 const r=await ask('Who gets the most from mining in 2005?',{from:'2024',to:'2024'})
 assert.doesNotMatch(r.answer,/786,999|2024–25/)
 assert.ok(r.answer_status!=='calculated'||r.coverage?.requested_since==='2005-01-01')
})
test('research follow-up resolution switches the recipient and keeps the financial year',async()=>{
 const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
 assert.equal(typeof api.fundingResearchFollowUp,'function')
 const context=history('Who gives the most money to One Nation?')
 const labor=await api.fundingResearchFollowUp({question:'what about Labor?',kind:'all',context},assets);assert.match(labor.question,/to Labor/);assert.doesNotMatch(labor.question,/to One Nation/)
 const greens=await api.fundingResearchFollowUp({question:'what about the Greens?',kind:'all',context:history('Who gave the most money to Labor in 2019-20?')},assets);assert.match(greens.question,/to Greens.*2019/);assert.doesNotMatch(greens.question,/to Labor/)
 const after=await api.fundingResearchFollowUp({question:'and in 2019-20?',kind:'all',context:history('Who gave the most money to One Nation in 1990?')},assets);assert.match(after.question,/to One Nation.*2019/)
})
test('a causal pronoun follow-up preserves the validated recipient without becoming a ranking',async()=>{
 const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
 const out=await api.fundingResearchFollowUp({question:'did that buy their votes?',kind:'all',context:history('Who gives the most money to One Nation?')},assets)
 assert.match(out.question,/One Nation/);assert.match(out.question,/buy.*votes/i);assert.doesNotMatch(out.question,/most|top donor/i)
})

// Untyped fallback. The same calculator over the export with every receipt-type field stripped (the pre-#310 file):
// it ranks disclosed receipts of all types, and every figure below is the legacy total that was pinned before #310.
test('untyped fallback: industry rankings and party winners use all disclosed receipts',async()=>{
 assert.equal(legacyGraph.meta.receipt_types,undefined);assert.ok(legacyGraph.edges.every(e=>!e.by_type&&!e.by_type_year));
 const mining=await askUntyped('Who gets the most from mining?');
 assert.equal(mining.measure,'receipts_all');assert.match(mining.answer,/^\*\*United Australia Party\*\*/);assert.match(mining.answer,/\$151,692,621/);
 const fossil=await askUntyped('Who receives the most disclosed receipts from fossil fuel donors?');
 // 13 Nov 2026: Labor $6,553,737 to $6,505,237 and Liberal $6,121,113 to $5,748,113: Linc Energy left the federal map at rank 251 when NIOA's two 2015-16 gifts of $20,000 to the Liberal Democratic Party (one on the party's return, one the donor's own) lifted NIOA into the top 250 (export rule 10).
 assert.match(fossil.answer,/^\*\*Labor\*\*/);assert.match(fossil.answer,/\$6,505,237/);assert.match(fossil.answer,/\$5,748,113/);assert.match(fossil.answer,/published AEC selection/);
 assert.match(fossil.answer,/disclosed receipts, all types/);
 const gambling=await askUntyped('Who takes the most money from the gambling lobby?');
 assert.match(gambling.answer,/^\*\*Labor\*\*/);assert.ok(gambling.answer.includes(aud(industryTotal('gambling','Labor',legacyGraph,legacyTotal))));assert.equal(aud(industryTotal('gambling','Labor',legacyGraph,legacyTotal)),'$9,324,627');
 for(const party of ['Labor','One Nation']) {
  const answer=await askUntyped(`Who donates the most to ${party}?`);
  const matching=legacyGraph.edges.filter(e=>e.target==='party:'+party&&e.source.startsWith('donor:')&&!e.flow&&!e.grant).sort((a,b)=>b.total-a.total);
  assert.ok(answer.answer.split('\n')[0].includes(`**${legacyGraph.nodes.find(n=>n.id===matching[0].source).label}:`));assert.match(answer.answer,/\| Source \| Disclosed receipts/);
 }
 const mineralogy=await askUntyped('Who gets the most money from Mineralogy?');assert.match(mineralogy.answer,/\$124,655,455/);
 const visa=await askUntyped('Who receives the most disclosed receipts from Visa AP (Australia) Pty Ltd in federal records?');assert.match(visa.answer,/Liberal.*\$1,509,206/s);
 const missing=await askUntyped('Who gets the most money from gambling in 1900/1901?');
 assert.equal(missing.coverage.matched,false);assert.match(missing.answer,/Held-period figures/);assert.match(missing.answer,/\$9,324,627/);
 const country=await askUntyped('Who donates the most to Country Liberal Party?');
 assert.equal(country.answer_status,'calculated');
 assert.ok(country.sources.slice(1).every(s=>new URL(s.href,'https://opax.test').searchParams.get('party')==='party:Country Liberal Party'));
 const clp=await askUntyped('Who gets more money, Country Liberal Party or Liberal?');assert.equal(clp.answer_status,'calculated');
 assert.equal(new Set(clp.sources.slice(1).map(s=>new URL(s.href,'https://opax.test').searchParams.get('party'))).size,2);
});

test('untyped fallback: party, industry and shared-range comparisons',async()=>{
 const r=await askUntyped('Who gets more gambling money, Labor or Liberal?');
 const labor=industryTotal('gambling','Labor',legacyGraph,legacyTotal),liberal=industryTotal('gambling','Liberal',legacyGraph,legacyTotal);
 assert.ok(r.answer.includes(`Labor received ${aud(labor-liberal)} more from gambling receipt sources than Liberal`));assert.ok(r.answer.includes(aud(labor)));assert.ok(r.answer.includes(aud(liberal)));
 const dated=await askUntyped('Who gets more gambling money, Labor or Liberal in 2020?');
 assert.match(dated.answer,/\$85,378 more/);assert.match(dated.answer,/\| Labor \| \$445,573 \| 45 \|/);assert.match(dated.answer,/\| Liberal \| \$360,195 \| 33 \|/);
 const next=await askUntyped('And in 2021–22?',{context:history('Who gets more gambling money, Labor or Liberal?','And in 2020–21?')});
 assert.match(next.answer,/Labor received \$526,854 more/);assert.match(next.answer,/\| Labor \| \$985,883 \| 62 \|/);assert.match(next.answer,/\| Liberal \| \$459,029 \| 31 \|/);
 const shared=await askUntyped('Who gets more gambling money, Labor or Liberal between 2020 and 2021?');
 assert.match(shared.answer,/Labor received \$612,232 more/);assert.match(shared.answer,/\$1,431,456/);assert.match(shared.answer,/\$819,224/);
 const industries=await askUntyped('Who gives more money to Labor, unions or finance?');
 const unions=industryTotal('unions','Labor',legacyGraph,legacyTotal),finance=industryTotal('finance','Labor',legacyGraph,legacyTotal);
 assert.ok(industries.answer.includes(`Unions accounted for ${aud(unions-finance)} more to Labor than Finance`));
});

test('untyped fallback: year comparisons and financial-year labels',async()=>{
 const years=await askUntyped('Did Labor receive more gambling money in 2020 or 2021?');
 assert.match(years.answer,/Labor received \$540,310 more from gambling receipt sources in 2021–22 than in 2020–21/);
 assert.match(years.answer,/\| 2020–21 \| \$445,573 \| 45 \|/);assert.match(years.answer,/\| 2021–22 \| \$985,883 \| 62 \|/);
 const ends=await askUntyped('Compare gambling receipts to Labor in 2019 versus 2022');
 assert.match(ends.answer,/\$355,565 more/);assert.match(ends.answer,/\$272,635/);assert.match(ends.answer,/\$628,200/);assert.doesNotMatch(ends.answer,/\$445,573|\$985,883/);
 const decrease=await askUntyped('How did gambling receipts to Labor change from 2021 to 2022?');
 assert.match(decrease.answer,/\$357,683 less from gambling receipt sources in 2022–23 than in 2021–22/);
 const missing=await askUntyped('Compare gambling receipts to Labor in 1900 versus 2021');
 assert.equal(missing.comparison_complete,false);assert.match(missing.answer,/\$985,883/);
 const label=await askUntyped('Who gets the most money from gambling in 2020/21?');
 assert.match(label.answer,/\$445,573/);assert.doesNotMatch(label.answer,/\$1,431,456/);assert.match(label.money_context,/7 receipt sources with matching receipts/);
 assert.match((await askUntyped('Who gets the most money from gambling in 2020 to 2021?')).answer,/\$1,431,456/);
});

test('untyped fallback: funding follow-ups replace party, industry, donor and year',async()=>{
 const turns=['Who donated the most to Labor from gambling in FY2020-21?'];
 const follow=async(question,match)=>{const result=await askUntyped(question,{context:history(...turns)});assert.equal(result?.answer_status,'calculated',question);assert.match(result.answer,match);turns.push(question);return result};
 await follow('What about Liberal?',/Sportsbet.*\$175,500/s);
 await follow('And fossil fuel donors?',/Woodside.*\$137,000/s);
 await follow('What about Tabcorp Holdings?',/Tabcorp.*\$87,300/s);
 await follow('And in 2021-22?',/Tabcorp.*\$87,500/s);
 const controlled=await askUntyped('What about 2019-20?',{context:history(...turns),party:'Nationals',from:'2022',to:'2022'});
 assert.match(controlled.answer,/Tabcorp.*\$26,400/s);assert.match(controlled.money_context,/Financial years: 2019–20/);
 const labor=await askUntyped('Who donated the most to Labor from gambling?',{from:'2020',to:'2020'});assert.match(labor.answer,/\$128,500/);
});

test('donation-led answers link the Donation-only map for the same selection, and the all-types map when they show it',async()=>{
 const links=answer=>[...answer.matchAll(/\[(See [^\]]+ on the money map)\]\(([^)]+)\)/g)].map(m=>({label:m[1],url:new URL(m[2])}))
 const same=(a,b)=>{for(const key of ['jur','type','industry','party','focus','from','to'])assert.equal(a.searchParams.get(key),b.searchParams.get(key),key)}
 // A ranking leads with donations and shows all receipt types beside them: both links, same selection.
 const ranking=await ask('Who gets the most from gambling in 2021?');
 assert.equal(ranking.measure,'donations');
 const [donations,all]=links(ranking.answer);
 assert.deepEqual(links(ranking.answer).map(l=>l.label),['See these donations on the money map','See all receipt types on the money map']);
 assert.equal(donations.url.searchParams.get('receipt'),'donations');assert.equal(all.url.searchParams.get('receipt'),null);same(donations.url,all.url);
 assert.equal(donations.url.searchParams.get('industry'),'gambling');assert.equal(donations.url.searchParams.get('from'),'2021');assert.equal(donations.url.searchParams.get('to'),'2021');
 const party=await ask('Who donates the most to Labor?');
 assert.deepEqual(links(party.answer).map(l=>[l.label,l.url.searchParams.get('party'),l.url.searchParams.get('receipt')]),[['See these donations on the money map','party:Labor','donations'],['See all receipt types on the money map','party:Labor',null]]);
 // Comparisons show only donations: one Donation-only link.
 const pair=await ask('Who gets more gambling money, Labor or Liberal?');
 assert.equal(pair.measure,'donations');
 assert.deepEqual(links(pair.answer).map(l=>[l.label,l.url.searchParams.get('industry'),l.url.searchParams.get('receipt')]),[['See these donations on the money map','gambling','donations']]);
 // Without a donation lead, the link stays on all receipt types.
 // A one-party answer shows only donations: one link.
 const one=await ask('Who gets the most from gambling in 2000?');
 assert.match(one.answer,/^\*\*Labor\*\* is the only party receiving \*\*\$29,500\*\* in donations received/);assert.doesNotMatch(one.answer,/across all receipt types|\| Recipient \|/);
 assert.deepEqual(links(one.answer).map(l=>[l.label,l.url.searchParams.get('industry'),l.url.searchParams.get('receipt')]),[['See these donations on the money map','gambling','donations']]);
 const untyped=await askUntyped('Who gets the most from gambling?');
 assert.deepEqual(links(untyped.answer).map(l=>[l.label,l.url.searchParams.get('receipt')]),[['See these on the money map',null]]);
});

test('a year comparison never sets a year without receipt types beside typed figures',async()=>{
 const synthetic={meta:{generated:'2026-11-11',receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:[
  {id:'donor:example casino',kind:'donor',label:'Example Casino',industry:'gambling'},{id:'donor:example betting',kind:'donor',label:'Example Betting',industry:'gambling'},
  {id:'party:Labor',kind:'party',label:'Labor'}],edges:[
  {source:'donor:example casino',target:'party:Labor',total:300,count:1,firstYear:2020,lastYear:2020,byYear:{2020:[300,1]},by_type:{donation_received:300},by_type_year:{'2020-21':{donation_received:[300,1]}}},
  {source:'donor:example betting',target:'party:Labor',total:500,count:2,firstYear:2021,lastYear:2021,byYear:{2021:[500,2]},by_type:{},by_type_year:{}}]};
 const base=moneyAssets('typed');
 const own={fetch:async request=>new URL(request.url).pathname==='/graph/money.json'?Response.json(synthetic):base.fetch(request)};
 const r=await rankedMoneyAnswer({question:'How did gambling receipts to Labor change from 2020 to 2021?'},own);
 assert.equal(r.answer_status,'calculated');assert.equal(r.comparison_complete,false);
 assert.match(r.answer,/^Labor in 2020–21 recorded \$300 in donations received/);
 assert.match(r.answer,/The AEC data OPAX holds for 2021–22 doesn't split receipts by type, so it can't be set beside the donation figures\./);
 assert.doesNotMatch(r.answer,/\$500|records no matching receipts in 2021–22/);
 assert.match(r.answer,/\[See these donations on the money map\]\([^)]*receipt=donations/);
});

test('a year left out for having no type breakdown keeps its reason beside the published-range note',async()=>{
 const synthetic={meta:{generated:'2026-11-11',receipt_types:{available:true,schema:1,donation_type:'donation_received'}},nodes:[
  {id:'donor:example casino',kind:'donor',label:'Example Casino',industry:'gambling'},{id:'donor:example betting',kind:'donor',label:'Example Betting',industry:'gambling'},
  {id:'party:Labor',kind:'party',label:'Labor'}],edges:[
  {source:'donor:example casino',target:'party:Labor',total:300,count:1,firstYear:2025,lastYear:2025,byYear:{2025:[300,1]},by_type:{donation_received:300},by_type_year:{'2025-26':{donation_received:[300,1]}}},
  {source:'donor:example betting',target:'party:Labor',total:500,count:2,firstYear:2021,lastYear:2021,byYear:{2021:[500,2]},by_type:{},by_type_year:{}}]};
 const base=moneyAssets('typed');
 const own={fetch:async request=>new URL(request.url).pathname==='/graph/money.json'?Response.json(synthetic):base.fetch(request)};
 const r=await rankedMoneyAnswer({question:'How did gambling receipts to Labor change from 2021 to 2030?'},own);
 assert.equal(r.answer_status,'calculated');assert.equal(r.comparison_complete,false);assert.doesNotMatch(r.answer,/\$500/);
 assert.match(r.answer,/The published records run from 2021–22 to 2025–26\. The AEC data OPAX holds for 2021–22 doesn't split receipts by type, so it can't be set beside the donation figures\./);
});

test('the context line starts its measure label with a capital',async()=>{
 const pair=await ask('Who gets more money, Liberal or LNP?');
 assert.match(pair.answer,/Federal \(AEC\)\. Donations received \(AEC receipt type: Donation Received\); nominal Australian dollars\./);
 const clp=await ask('How did receipts to Country Liberal Party change from 2003 to 2004?');
 assert.match(clp.answer,/Federal \(AEC\)\. All receipt types \(no type breakdown in the AEC data OPAX holds\); nominal/);
});
