import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {donorDisclosure,donorLabelHTML,donorDisplayText,donorLookup} from '../public/donor-disclosure.js';
import {buildFlows,aggregateDonors,buildCSV} from '../public/ledger.js';
import {tableRows} from '../../scripts/load_tables.mjs';
import {parseExplainParams,resolveFlow,pageHTML} from '../public/money-explain.js';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {partyMoneyData,partyMoneyTableConfig,registerTableHTML} from '../public/register-tables.js';
import {toCSV} from '../public/datatable.js';
import {moneyConnectionsConfig} from '../public/money-connections.js';
const ref={return_type:'AEC annual return',year:'2024-25',return_id:'RETURN-FIXTURE-7',url:'https://example.test/return/7'};
const donor=confident=>({id:'donor:fixture-alex',label:'EXAMPLE, ALEX',source_name:'EXAMPLE, ALEX',kind:'donor',industry:'individual',group:'individuals',total:120,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[120,1]},aliases:[],match:{confidence:confident?1:0.9,method:confident?'exact':'rule',href:'/subject/donor/EXAMPLE%2C%20ALEX'},returnReferences:[ref]});
const graph=record=>({meta:{sourceShort:'AEC annual returns',source_url:ref.url,generated:'2026-10-13',coverage:'Invented fixture',minYear:2024,maxYear:2024},nodes:[record,{id:'party:Labor',label:'Labor',kind:'party',industry:'parties',group:'parties',total:120,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[120,1]}}],edges:[{source:record.id,target:'party:Labor',total:120,count:1,firstYear:2024,lastYear:2024,byYear:{2024:[120,1]}}]});
async function bundle(file){const r=await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false,external:['node:*']});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))}
const {receiptAnswer}=await bundle('../src/voice-money.ts');
const {rankedMoneyAnswer}=await bundle('../src/ask-money.ts');
const {partyDonations}=await bundle('../src/agentic-tools.ts');
const {factSheet}=await bundle('../src/agentic-ask.ts');
const {runVoiceTool}=await bundle('../src/voice-tools.ts');
const {authoriseVicPost,xLength}=await bundle('../src/daily-post.ts');
const {storySlideTree}=await bundle('../src/og.ts');
const {renderPersonAnswer}=await bundle('../src/seo-content.ts');
const {parseTableQuery}=await bundle('../src/table-api.ts');
const map=await bundle('../graph/index.ts'),fallback=await bundle('../graph/connection-fallback.ts');
const INLINE_REFERENCE=/AEC annual return ·|more return references|RETURN-FIXTURE-7|GA-FIXTURE-7/;
function noInlineReference(html){const doc=new JSDOM(html).window.document;doc.querySelectorAll('script,template').forEach(n=>n.remove());assert.doesNotMatch(doc.body.textContent,INLINE_REFERENCE);assert.equal(doc.querySelectorAll('.donor-return-reference').length,0)}
function nameIn(html,record,linked){const doc=new JSDOM(html).window.document;assert.ok(doc.body.textContent.includes(record.source_name));noInlineReference(html);const links=[...doc.querySelectorAll('a[href]')].filter(a=>a.textContent.includes(record.source_name));assert.equal(links.length>0,linked);if(linked)assert.equal(links[0].getAttribute('href'),record.match.href)}
for(const confident of [false,true]){
 const record=donor(confident),data=graph(record),label=confident?'confident':'uncertain';
 test(label+': display is the disclosure spelling alone, with a confidence-based identity link',()=>{assert.equal(donorDisplayText(record),record.source_name);assert.equal(donorDisclosure(record).name,record.source_name);assert.equal(donorDisclosure(record).href,confident?record.match.href:null);nameIn(donorLabelHTML(record),record,confident)});
 test(label+': map fallback and card profile action follow the same linking rule',()=>{
  const previous=globalThis.document,dom=new JSDOM('<div id="map"></div>',{url:'https://opax.test/money'});globalThis.document=dom.window.document;
  try{const handle=fallback.mountConnectionFallback(dom.window.document.querySelector('#map'),data);nameIn(dom.window.document.body.innerHTML,record,confident);handle.destroy()}finally{globalThis.document=previous;dom.window.close()}
  assert.equal(JSON.stringify(map.planCardActions(record,{subject:null,grantsOn:false,routeBase:'/money',askUrl:()=>'/ask'})).includes(record.match.href),confident);
 });
 test(label+': money-connections, party-money and receipt rows retain names, references and totals',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opax-disclosure-table-'));
  try{for(const dir of ['suppliers','grants/federal','grants/qld'])await mkdir(join(root,dir),{recursive:true});await writeFile(join(root,'suppliers.json'),'{"suppliers":[]}');
   const {rows}=await tableRows(root,{moneyOnly:true,graphs:[data,{nodes:[],edges:[]},{nodes:[],edges:[]},{nodes:[],edges:[]}]});
   for(const dataset of ['money-connections','party-money']){const row=rows[dataset][0].row;assert.equal(row.from,record.source_name);assert.equal(row.amount,120);assert.equal(row.from_href,confident?record.match.href:null);assert.match(row.return_reference,/RETURN-FIXTURE-7/)}
   const flows=buildFlows(data);for(const row of [flows[0],aggregateDonors(flows)[0]]){assert.equal(row.donor,record.source_name);assert.equal(row.donorHref,confident?record.match.href:null);assert.match(row.return_reference,/RETURN-FIXTURE-7/)}
  }finally{await rm(root,{recursive:true,force:true})}
 });
 test(label+': /money/explain renders the donor without the return reference',()=>{
  const parsed=parseExplainParams(new URLSearchParams({from:record.id,to:'party:Labor'}),data,new Map());assert.equal(parsed.ok,true);
  const html=pageHTML(resolveFlow(parsed.state,data,new Map()),{index:new Map(),partyName:v=>v});noInlineReference(html);assert.ok(html.includes(record.source_name));assert.equal(html.includes('href="'+record.match.href+'"'),confident);
 });
 test(label+': SSR person receipt block names the donor without guessing an entity or showing the return',async()=>{
  const person={name:'Fixture Member',full:'Fixture Member',pid:'fixture-person',party:'Labor',party_now:'Labor',states:['federal'],chambers:['representatives'],representation:[],speeches:0};
  const read=async path=>{if(path==='/graph/money.json')return data;if(path.startsWith('/graph/money.'))return {nodes:[],edges:[],meta:{}};if(path==='/votes.json')return {};if(path==='/interests/index.json')return {people:{},_by_name:{}};if(path==='/bills/index.json')return {bills:[]};if(path==='/seo-links.json')return {sponsored:{}};throw Error('Missing optional fixture')};
  nameIn((await renderPersonAnswer(person,read,new Map())).html,record,confident);
 });
 test(label+': Ask money answers, receipt JSON and MCP money tools preserve the source facts',async()=>{
  const question='Who are the largest donors to Labor in the 2024-25 financial year?';
  const assets={fetch:async request=>Response.json(new URL(request.url).pathname==='/graph/money.json'?data:{nodes:[],edges:[],meta:{}})};
  const result=receiptAnswer(data,question,'federal','https://opax.test');assert.equal(result.by_donor[0].name,record.source_name);assert.equal(result.by_donor[0].href,confident?record.match.href:null);assert.match(result.by_donor[0].return_reference,/RETURN-FIXTURE-7/);
  const ask=await rankedMoneyAnswer({question},assets);assert.doesNotMatch(ask.answer,INLINE_REFERENCE);assert.equal(ask.answer.includes(']('+record.match.href+')'),confident);
  const tool=await partyDonations({asset:async()=>data,origin:'https://opax.test'},{party:'Labor',from_year:2024,to_year:2024});const row=tool.data.rows[0];assert.equal(row.donor,record.source_name);assert.equal(row.href,confident?record.match.href:null);assert.match(row.return_reference,/RETURN-FIXTURE-7/);assert.equal(tool.cite.some(c=>c.url.includes('/subject/donor/')),confident);assert.match(factSheet([tool]).facts[0].text,/RETURN-FIXTURE-7/);
  let reads=0;const voice=await runVoiceTool('search_records',{query:question,kind:'receipt'},{ASSETS:assets,COMMUNITY_ORIGIN:'https://opax.test'},async()=>{reads++;throw Error('No speech retrieval')});assert.equal(reads,0);assert.match(JSON.stringify(voice),/RETURN-FIXTURE-7/);
 });
 test(label+': daily post and story metadata include disclosure provenance',()=>{
  const post=authoriseVicPost({date:'2026-10-13',kind:'topic',subject:'fixture-donor',title:record.source_name,text:record.source_name,url:'https://opax.test'+record.match.href,donor:record,slides:[{type:'cover',title:record.source_name,kicker:'Disclosure',alt:record.source_name,line:'Source details',photo:null},{type:'picture',title:record.source_name,kicker:'Disclosure',alt:record.source_name,photo:'fixture',lines:['Context one','Context two','Context three']},{type:'source',title:'Check the return',kicker:'Disclosure',alt:record.source_name,rows:['Context one','Context two','Context three','Context four'],url:ref.url}]});assert.match(post.text,/RETURN-FIXTURE-7/);assert.match(post.caption,/RETURN-FIXTURE-7/);assert.match(post.slides[0].alt,/RETURN-FIXTURE-7/);assert.match(post.slides[0].line,/RETURN-FIXTURE-7/);assert.ok(xLength(post.text)<=280);for(const slide of post.slides)assert.ok(JSON.stringify(storySlideTree(slide)).includes(ref.return_id),'return reference survives the actual template line cap');assert.equal(post.url.includes('/subject/donor/'),confident);
 });
}
test('shared ambiguous spelling never chooses an entity by order',()=>{const a=donor(true),b={...a,id:'donor:different',match:{confidence:1,method:'exact',href:'/subject/donor/Different'}};assert.equal(donorDisclosure(donorLookup([a,b]).get(a.label.toLowerCase())).href,null)});
test('table API keeps length and type caps and accepts disclosed names',()=>{const c=TABLE_DATASETS.contracts;assert.equal(parseTableQuery(new URLSearchParams({q:'EXAMPLE, ALEX'}),c.columns,c.defaultSort).q,'example, alex');for(const p of [new URLSearchParams({q:'x'.repeat(1001)}),new URLSearchParams('q=a&q=b'),new URLSearchParams({'f.agency':'[1]'})])assert.throws(()=>parseTableQuery(p,c.columns,c.defaultSort))});
test('built output has zero OPAX donor placeholders, preserving source-published redactions',async()=>{async function scan(dir){for(const f of await readdir(dir,{withFileTypes:true})){const path=join(dir,f.name);if(f.isDirectory())await scan(path);else if(/\.(json|html|js)$/.test(f.name))assert.doesNotMatch(await readFile(path,'utf8'),/Donor \d+ \(name withheld\)|donor:withheld-\d+|Donor%20\d+%20%28name%20withheld%29/i,path)}}await scan(new URL('../public/',import.meta.url).pathname)});

test('donor pages and OG cards publish the disclosure spelling without inline return references for both match outcomes',async()=>{
 const {loadWorker,offline}=await import('./worker-harness.mjs');
 const uncertain={...donor(false),id:'donor:fixture-blair',label:'FIXTURE, BLAIR',source_name:'FIXTURE, BLAIR',lookup_names:['Blair Fixture']};
 const confident={...donor(true),lookup_names:['Alex Example']};
 const outside={...donor(false),id:'donor:outside-casey',label:'OUTSIDE, CASEY',source_name:'OUTSIDE, CASEY',lookup_names:['Casey Outside'],jurisdiction:'federal'};
 const data={...graph(confident),nodes:[confident,uncertain,graph(confident).nodes[1]]};
 const restore=offline();
 try{
  const worker=await loadWorker(new URL('../src/index.ts',import.meta.url).pathname,new URL('../public/',import.meta.url).pathname);
  const asset=worker.env.ASSETS.fetch;
  worker.env.ASSETS.fetch=async req=>{const p=new URL(req.url).pathname;if(p==='/graph/donor-index.json')return Response.json({donors:[outside]});return /^\/graph\/money(?:\.(qld|vic|tas))?\.json$/.test(p)?Response.json(p==='/graph/money.json'?data:{nodes:[],edges:[],meta:{}}):asset(req)};
  for(const [record,linked] of [[uncertain,false],[confident,true],[outside,false]]){
   const path='/subject/donor/'+encodeURIComponent(record.lookup_names[0]);
   const response=await worker.fetch(path);assert.equal(response.status,200);const html=await response.text();nameIn(html,record,linked);
   const ld=new JSDOM(html).window.document.querySelector('script[type="application/ld+json"]');assert.ok(ld.textContent.includes('Dataset'));
   const card=await (await worker.fetch('/og'+path+'.png')).json();assert.equal(card.title,record.source_name);assert.ok(card.lines.length>0 && card.lines.every(line=>typeof line==='string' && line.trim()),'no blank card line');assert.doesNotMatch(card.lines.join(' '),INLINE_REFERENCE);
  }
 }finally{restore()}
});

test('search records and the actual catalog renderer use plain text for uncertain names and keep confident links',async()=>{
 const {donorSearchRecord}=await import('../../scripts/build_search_catalog.mjs');
 const {default:ts}=await import('typescript');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='renderResults');assert.ok(fn);
 const dom=new JSDOM('<ul id="search-results"></ul>');
 const context={document:dom.window.document,$:id=>dom.window.document.getElementById(id),esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;'),recordTypeLink:kind=>kind,lastSearch:{query:'',filters:{},briefs:{}},isMultiSpeaker:()=>false,cleanPassage:v=>v,highlightHTML:v=>v,excerptNoticeHTML:()=>'',searchResultHref:r=>r.href,decorateMetaPortraits:()=>{},requestAnimationFrame:()=>{},refreshSearchPassageFolds:()=>{}};
 runInNewContext(source.slice(fn.getStart(ast),fn.end)+'\nthis.render=renderResults;',context);
 for(const linked of [false,true]){const record=donor(linked),r=donorSearchRecord('federal',record);context.render([r]);nameIn(dom.window.document.body.innerHTML,record,linked);assert.equal(dom.window.document.querySelectorAll('button').length,1,'catalog snippet controls remain available');}
 dom.window.close();
});

test('legacy D1 columns work without privacy metadata, with conservative disclosure enrichment in JSON and CSV',async()=>{
 const {tableDatabase}=await import('./table-d1-harness.mjs');const {tableApi}=await bundle('../src/table-api.ts');
 const uncertain={...donor(false),id:'donor:fixture-blair',source_name:'FIXTURE, BLAIR',label:'FIXTURE, BLAIR'};
 const confident=donor(true),entries=[uncertain,confident].map((n,i)=>({row:{id:'fixture-'+i,from:n.label,to:'Labor',jurisdiction:'federal',amount:120,count:1,firstYear:2024,lastYear:2024,type:'receipts',industry:'individual'}}));
 const local=await tableDatabase({datasets:{'party-money':entries}});
 try{
  await local.db.prepare("INSERT INTO table_meta(key,value) VALUES ('privacy_fingerprint','obsolete-mismatch')").run();
  const columns=(await local.db.prepare('PRAGMA table_info(table_party_money)').all()).results.map(r=>r.name);assert.ok(!columns.includes('return_reference'));
  const fetch=env=>tableApi(new Request('https://opax.test/api/table/party-money'),env);
  const plain=await fetch({TABLE_DB:local.db});assert.equal(plain.status,200);assert.ok((await plain.json()).rows.every(r=>r.from_href===null && /AEC.*2024/.test(r.return_reference)));
  const env={TABLE_DB:local.db,ASSETS:{fetch:async()=>Response.json({donors:[uncertain,confident].map(n=>({...n,jurisdiction:'federal'}))})}};
  const page=await (await fetch(env)).json();for(const [record,linked] of [[uncertain,false],[confident,true]]){const row=page.rows.find(r=>r.from===record.source_name);assert.ok(row);assert.equal(row.from_href,linked?record.match.href:null);assert.match(row.return_reference,/RETURN-FIXTURE-7/)}
  const csv=await (await tableApi(new Request('https://opax.test/api/table/party-money?format=csv'),env)).text();assert.ok(csv.includes(ref.return_id));assert.ok(csv.includes(confident.match.href));assert.ok(csv.includes(uncertain.source_name));
 }finally{await local.close()}
});

test('the donor index and search include names outside map selection without turning source-only hints into donations',async()=>{
 const {donorIndexFile}=await import('../../scripts/build_donor_index.mjs');const {donorSearchRecord}=await import('../../scripts/build_search_catalog.mjs');
 const root=await mkdtemp(join(tmpdir(),'opax-extra-donor-'));
 const real={...donor(false),jurisdiction:'federal',label:'OUTSIDE, BLAIR',source_name:'OUTSIDE, BLAIR',id:'donor:outside',kind:'donor',total:120,count:1};
 const reference={id:'donor:reference',kind:'reference',label:'SOURCE, GRAHAM',source_name:'SOURCE, GRAHAM',jurisdiction:'federal',match:{confidence:0,method:'unresolved',href:null},source_note:'Source reference; no electoral donation established.',returnReferences:[{return_type:'GrantConnect source record',year:'2024-25',transaction_id:'GA-FIXTURE-7',url:'https://example.test/grant/7'}]};
 try{
  await mkdir(join(root,'graph'));for(const file of ['money.json','money.qld.json','money.vic.json','money.tas.json'])await writeFile(join(root,'graph',file),JSON.stringify({nodes:[],edges:[]}));
  await writeFile(join(root,'graph/donor-disclosures.json'),JSON.stringify({version:1,donors:[real],references:[reference]}));
  const data=donorIndexFile(root);assert.equal(data.donors.length,2);const index=donorLookup(data.donors);assert.equal(index.get('outside, blair').source_name,real.source_name);
  const row=donorSearchRecord('federal',index.get('source, graham'));assert.equal(row.href,null);assert.doesNotMatch(row.snippet,INLINE_REFERENCE);assert.equal(row.extra.url,reference.returnReferences[0].url);assert.doesNotMatch(row.snippet,/\$0|0 records/);assert.match(row.snippet,/no electoral donation established/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('the actual donor directory finds extra source names and gives unconfirmed references no link or amount',async()=>{
 const {default:ts}=await import('typescript');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='buildDonorsDirectory');assert.ok(fn);
 const record={id:'donor:outside-reference',kind:'reference',label:'SOURCE, GRAHAM',source_name:'SOURCE, GRAHAM',jurisdiction:'federal',match:{confidence:0,method:'unresolved',href:null},returnReferences:[{return_type:'GrantConnect source record',year:'2024-25',transaction_id:'GA-FIXTURE-7',url:'https://example.test/grant/7'}]};
 const index=donorLookup([record]);
 const context={donorViewReady:Promise.resolve(),donorViewIndex:index,loadMoneyFile:async()=>({nodes:[],edges:[],meta:{commission:'Fixture commission'}}),loadAccess:async()=>({donors:{}}),loadFits:async()=>({}),normName:v=>String(v).toLowerCase(),byNumDesc:()=>()=>0,byName:()=>0,moneyFor:()=>0,STATE_NOT_SUMMED:'Separate jurisdictions',AEC_NOTE:'',esc:v=>String(v),donorNameHTML:name=>donorLabelHTML(index.get(name.toLowerCase()))};
 runInNewContext(source.slice(fn.getStart(ast),fn.end)+'\nthis.build=buildDonorsDirectory;',context);
 const directory=await context.build();assert.equal(directory.items.length,1);assert.ok(directory.text(directory.items[0]).includes(record.label));
 const html=directory.row(directory.items[0]);const doc=new JSDOM(html).window.document;assert.ok(doc.body.textContent.includes(record.label));assert.ok(!doc.body.textContent.includes('GA-FIXTURE-7'));assert.equal(doc.querySelectorAll('a').length,0);assert.doesNotMatch(doc.body.textContent,/\$0|0 donations/);
});

test('daily and story copy never turn a source-only reference into an established donation',()=>{
 const source={id:'donor:source-only',kind:'reference',label:'SOURCE, GRAHAM',source_name:'SOURCE, GRAHAM',match:{confidence:0,method:'unresolved',href:null},returnReferences:[{return_type:'GrantConnect source record; electoral identity unconfirmed',year:'2024-25',transaction_id:'GA-FIXTURE-7',url:'https://example.test/grant/7'}]};
 const post=authoriseVicPost({date:'2026-10-13',kind:'grant',subject:'fixture',title:source.label,text:'A recorded grant award.',url:'https://opax.test/subject/donor/SOURCE',donor:source,slides:[{type:'cover',kicker:'Source',title:source.label,line:'A grant award.',photo:null,alt:source.label}]});
 assert.match(post.text,/Source reference: SOURCE, GRAHAM/);assert.doesNotMatch(post.text,/Disclosed donor/);assert.match(post.caption,/GA-FIXTURE-7/);assert.equal(post.url,source.returnReferences[0].url);assert.ok(JSON.stringify(storySlideTree(post.slides[0])).includes('GA-FIXTURE-7'));assert.ok(xLength(post.text)<=280);
});

test('confirmed records for the same entity retain their link across jurisdictions while references stay scoped',()=>{
 const first={...donor(true),jurisdiction:'federal',match:{...donor(true).match,entity_id:'confirmed-fixture'},aliases:['Fixture shared alias']};
 const second={...first,id:'donor:state-fixture',jurisdiction:'qld',source_name:'Alex Example',label:'Alex Example',returnReferences:[{return_type:'ECQ donation return',year:'2024-25',transaction_id:'ECQ-FIXTURE-7',url:'https://example.test/ecq/7'}]};
 const index=donorLookup([first,second]);assert.equal(donorDisclosure(index.get('fixture shared alias')).href,first.match.href);assert.match(donorDisclosure(index.get('qld:fixture shared alias')).reference,/ECQ-FIXTURE-7/);
});

test('return references are export data, never inline: party table, ledger CSV and map connections',()=>{
 const record=donor(true),data=graph({...record,returnReferences:[ref,{...ref,year:'2023-24',return_id:'RETURN-FIXTURE-8'},{...ref,year:'2022-23',return_id:'RETURN-FIXTURE-9'},{...ref,year:'2021-22',return_id:'RETURN-FIXTURE-10'}]});
 assert.match(donorDisclosure(data.nodes[0]).reference,/1 more return references in the data export/,'the reference stays as data');
 const {rows}=partyMoneyData(data,'party:Labor'),config=partyMoneyTableConfig(rows);
 assert.match(rows[0].return_reference,/RETURN-FIXTURE-7/);assert.ok(!config.columnsVisible.includes('return_reference'));
 noInlineReference(registerTableHTML(config,undefined,new URL('https://opax.test/subject/party/labor')));
 assert.match(toCSV(rows,config),/Return reference[\s\S]*RETURN-FIXTURE-7/);
 const connections=moneyConnectionsConfig(data);
 assert.match(connections.rows[0].return_reference,/RETURN-FIXTURE-7/);assert.ok(!connections.columnsVisible.includes('return_reference'));assert.match(toCSV(connections.rows,connections),/RETURN-FIXTURE-7/);
 const flows=buildFlows(data);
 for(const [view,list] of [['flows',flows],['donors',aggregateDonors(flows)]])assert.match(buildCSV(view,list,[]),/,Return reference\r\n[\s\S]*RETURN-FIXTURE-7/);
});
