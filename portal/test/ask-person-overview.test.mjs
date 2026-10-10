import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {personFollowups,renderPersonContext} from '../public/ask-person.js';
import {cleanEvent} from '../analytics/privacy.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const bundle=await build({entryPoints:[new URL('../src/ask-person-overview.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {overviewSubject,isPersonOverviewIntent,buildPersonOverview,OVERVIEW_CAPS,OVERVIEW_INSTRUCTIONS}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const people=[{name:'Example Member'},{name:'Other Member'}];
const subject={name:'Example Member',party:'Greens',representation:[{electorate:'New South Wales'}]};
const profile='/subject/person/example-member';

test('broad person intents resolve an exact roster subject, including views and themes',()=>{
 for(const question of ['What has Example Member said in parliament?', 'What did Example Member say?', 'What does Example Member talk about?', "Example Member’s views", 'What are Example Member’s views?', 'Summarise Example Member’s speeches', 'An overview of Example Member', 'What topics does Example Member discuss?']) {
  assert.equal(overviewSubject(question,people),'Example Member',question);
  assert.equal(isPersonOverviewIntent({question,speaker:'Example Member',kind:'speech'}),true,question);
 }
 for(const question of ['What has Example Member said about housing?', 'What would Example Member say?', 'What else?', 'What does Other Member say about Example Member?', 'Compare Example Member and Other Member', 'Unknown Member’s views']) assert.equal(overviewSubject(question,people),undefined,question);
 for(const controls of [{topic:'housing'},{from:'2025'},{to:'2026'},{kind:'receipt'}])assert.equal(isPersonOverviewIntent({question:'What has Example Member said in parliament?',speaker:'Example Member',...controls}),false);
});

function evidence(total=600) {
 const rows=Array.from({length:total},(_,i)=>({slug:'speech-'+(i+1),resource:'r'+i,title:'Recorded parliamentary speech '+(i+1),speaker:subject.name,date:i===total-1?'2026-10-09':i<30?'2026-05-01':'2019-03-01',topics:[i<360?'housing':i<540?'climate-environment':'defence-security'],state:'federal',chamber:'senate'}));
 const calls={catalogue:[],find:[],original:[]};
 const deps={
  catalogue:async page=>{calls.catalogue.push(page);return {total,counts:{housing:360,'climate-environment':180,'defence-security':60},speeches:rows.slice(page*200,(page+1)*200)}},
  find:async theme=>{calls.find.push(theme);return rows.filter(s=>s.topics.includes(theme)).slice(0,2)},
  original:async (s,theme)=>{calls.original.push(s.slug);return `I argued for action on ${theme || 'housing'} and outlined the parliamentary proposal in detail. I called for scrutiny of the legislation and its recorded effects.\n\nSenator Other: This later reply must not be attributed to the indexed speaker.`},
  bills:async()=>[{key:'au-federal-example',title:'Example Bill 2026',introduced:'2026-04-01',sponsor:subject.name},{key:'au-federal-related',title:'Related Bill 2026',introduced:'2026-02-01',speech_dates:['2026-09-01']},{key:'au-federal-unrelated',title:'Unrelated Bill',introduced:'2026-10-01',sponsor:'Other Member'}],
  peer:async()=> 'Other Member',safe:(...values)=>!values.some(v=>String(v).includes('a withheld donor')),belongs:s=>s.speaker===subject.name,
 };
 return {rows,calls,deps};
}

test('the pack uses whole-record facets, metadata dates, export bill links and theme retrieval',async()=>{
 const {calls,deps}=evidence();const pack=await buildPersonOverview(subject,'2026-10-10',profile,deps);
 assert.deepEqual(calls.catalogue,[0,1,2]);assert.deepEqual(calls.find,['housing','climate-environment','defence-security']);
 assert.equal(pack.context.speeches,600);assert.equal(pack.context.recent_from,'2025-10-10');assert.equal(pack.context.topics[0].count,360);assert.equal(pack.context.topics[0].recent_count,30);
 assert.equal(pack.context.complete,true);assert.equal(pack.context.peer.name,'Other Member');
 const counts=JSON.parse(pack.records.records[0].snippet);assert.match(counts.coverage,/overlap/);assert.equal(counts.speeches,600);
 assert.ok(pack.records.records.some(r=>r.slug==='speech-600'&&r.date==='2026-10-09'));
 assert.equal(pack.records.records.filter(r=>r.kind==='bill').length,2);assert.ok(pack.records.records.some(r=>r.title==='Related Bill 2026'));assert.ok(!pack.records.records.some(r=>r.title==='Unrelated Bill'));
 assert.ok(!pack.records.records.filter(r=>r.source?.includes('verified')).some(r=>r.snippet.includes('later reply')));
 assert.ok(pack.records.records.reduce((sum,r)=>sum+r.snippet.length,0)<=OVERVIEW_CAPS.chars);
 assert.ok(calls.original.length<=12);assert.match(OVERVIEW_INSTRUCTIONS,/3–5 themes/);assert.match(OVERVIEW_INSTRUCTIONS,/EVERY factual sentence/);
});

test('incomplete metadata keeps whole-record counts and never invents recent totals or a latest speech',async()=>{
 const {deps,calls}=evidence(5000);const pack=await buildPersonOverview(subject,'2026-10-10',profile,deps);
 assert.equal(calls.catalogue.length,20);assert.equal(pack.context.complete,false);assert.equal(pack.context.topics[0].recent_count,null);
 assert.ok(!pack.records.records.some(r=>r.source==='Hansard · recent speech'));
 await assert.rejects(buildPersonOverview(subject,'2026-10-10',profile,deps,true),/incomplete/);
});

test('withheld text, another speaker and duplicate sources cannot enter the pack',async()=>{
 const {deps}=evidence();deps.find=async()=>[{slug:'speech-900',title:'a withheld donor',speaker:subject.name,date:'2026-01-01',topics:['housing']},{slug:'speech-901',title:'Other speech',speaker:'Other Member',date:'2026-01-01',topics:['housing']}];
 deps.bills=async()=>[{key:'au-federal-withheld',title:'a withheld donor',sponsor:subject.name,introduced:'2026-01-01'}];
 const pack=await buildPersonOverview(subject,'2026-10-10',profile,deps);
 assert.ok(!JSON.stringify(pack).includes('a withheld donor'));assert.ok(!pack.records.records.some(r=>r.slug==='speech-901'));
 assert.equal(new Set(pack.records.records.map(r=>r.slug)).size,pack.records.records.length);
});

const context={name:subject.name,party:'Greens',electorate:'New South Wales',speeches:600,topics:[{slug:'housing',name:'Housing',count:360},{slug:'climate-environment',name:'Climate & energy',count:180}],as_of:'2026-10-10',profile,votes:profile+'#subject-votes',interests:'/declared?person=Example+Member',peer:{name:'Other Member',theme:'Housing'}};
const answer='Housing was discussed in 360 speeches. Climate & energy featured in 180. Example Bill 2026 was introduced on 1 April 2026.';
const sources=[{kind:'speech',title:'Recorded speech',cited:true},{kind:'bill',title:'Example Bill 2026',cited:true}];

test('chips are full questions drawn from the cited answer with distinct speech, vote, recent and comparison actions',()=>{
 const chips=personFollowups(answer,sources,context,()=>true);
 assert.equal(chips.length,4);assert.deepEqual(chips.map(c=>c.kind),['speech','vote','recent','compare']);
 assert.ok(chips.every(c=>c.question.includes(subject.name)&&c.label!==c.question));assert.ok(!chips.some(c=>c.question.includes('Defence')));
 assert.deepEqual(personFollowups(answer,[],context,()=>true),[]);assert.deepEqual(personFollowups(answer,sources,context,()=>false),[]);
 const withoutPeer=personFollowups(answer,sources,{...context,peer:undefined},()=>true);assert.equal(withoutPeer.length,4);
});

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={setProperty(){}};this.listeners={};this.dataset={};}
 appendChild(node){this.children.push(node);return node} append(...nodes){this.children.push(...nodes)} replaceChildren(){this.children=[]} setAttribute(k,v){this[k]=v} addEventListener(k,fn){this.listeners[k]=fn}
}
const textOf=node=>[node.textContent,...node.children.map(textOf)].filter(Boolean).join(' ');

test('the context panel shows public identity, count, topics and record links using text nodes',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try {
  const slot=new Element('aside');renderPersonContext(slot,context,{portrait:'/photos/11010.webp',partyDot:new Element('i'),safe:()=>true});
  assert.equal(slot.hidden,false);assert.match(textOf(slot),/Example Member.*Greens.*New South Wales.*600 speeches.*Top topics.*Housing.*360/);
  const nav=slot.children.find(n=>n.tag==='nav');assert.deepEqual(nav.children.map(n=>n.href),[profile,profile+'#subject-votes','/declared?person=Example+Member']);
  assert.equal(slot.children[0].children[0].src,'/photos/11010.webp');
  renderPersonContext(slot,context,{safe:()=>false});assert.equal(slot.hidden,true);assert.equal(slot.children.length,0);
 } finally {globalThis.document=previous}
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');assert.match(css,/@media \(min-width: 1000px\)/);assert.match(css,/\.ask-person-context \{ display: none; \}/);
});

test('follow-up buttons have no heading, submit the full question and emit only position and kind',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const code=app.slice(app.indexOf('function renderFollowups('),app.indexOf('async function sendChat(',app.indexOf('function renderFollowups(')));
 const events=[],selected=[];const ctx={document:{createElement:tag=>new Element(tag)},trackOutcome:(event,props)=>events.push({event,props})};
 runInNewContext(code+';this.render=renderFollowups',ctx);
 const slot=new Element('div'),chips=personFollowups(answer,sources,context,()=>true);ctx.render(chips,slot,item=>selected.push(item.question));
 assert.ok(!slot.children.some(n=>n.tag==='h3'));slot.children[0].children[1].listeners.click();
 assert.equal(selected[0],chips[1].question);assert.deepEqual(JSON.parse(JSON.stringify(events)),[{event:'opax_ask_followup_click',props:{position:2,kind:'vote'}}]);
 assert.deepEqual(cleanEvent('opax_ask_followup_click',{position:2,kind:'vote',question:chips[1].question,name:subject.name}),{position:2,kind:'vote'});
 assert.deepEqual(cleanEvent('opax_ask_followup_click',{position:99,kind:'private_text'}),{});
 assert.deepEqual(cleanEvent('opax_ask_completed',{has_answer:true,is_overview_intent:true,answer}),{has_answer:true,is_overview_intent:true});
 assert.deepEqual(cleanEvent('opax_ask_completed',{is_overview_intent:answer}),{});
 assert.match(app,/opax_ask_started.*page_type:/);
});
