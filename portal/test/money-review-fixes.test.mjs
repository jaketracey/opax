import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {resolveFlow,flowScope,pageHTML,comparableFlows} from '../public/money-explain.js';
import {donationGraph} from '../public/money-receipts.js';
import {hasPartyReceipts} from '../public/donor-disclosure.js';
import {partyMoneyData,partyMoneyTableConfig,partyTableScope,registerTableHTML} from '../public/register-tables.js';
import {partyMoneyResponse} from '../src/party-money-table.ts';
import {build} from 'esbuild';
import {tableApi} from '../src/table-api.ts';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {csvFields} from '../public/datatable-csv.js';
import {readServerCSV} from '../public/server-csv.js';
import {tableRows} from '../../scripts/load_tables.mjs';
import {partyMoneyBucketFiles} from '../../scripts/build_growth_modules.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {workerFetch} from './helpers/worker-fetch.mjs';
import {partyUrl} from '../public/canonical-urls.js';

const compiled=await build({stdin:{contents:"export {tool} from './src/tools/money-totals';export {renderPersonAnswer} from './src/seo-content';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'});
const {tool,renderPersonAnswer}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const full=read('../public/graph/money-receipts.json'),drawing=read('../public/graph/money.json');
const summary=read('../public/graph/money-industry-totals.json');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const fn=name=>{const start=app.indexOf(`function ${name}(`);assert.ok(start>=0,name);return app.slice(start,app.indexOf('\n}',start)+2);};
const cells=amount=>({by_type:{donation_received:amount},by_type_year:{'2024-25':{donation_received:[amount,1]}}});

test('one canonical industry wins over a second drawing group in Explain, comparisons and the Ask panel',()=>{
  const graph={meta:{uncapped:true},nodes:[
    {id:'donor:farm',kind:'donor',label:'Example Farm',industry:'agriculture',group:'retail',...cells(100)},
    {id:'donor:shop',kind:'donor',label:'Example Shop',industry:'retail',group:'other',...cells(50)},
    {id:'party:Labor',kind:'party',label:'Labor'},
  ],edges:[{source:'donor:farm',target:'party:Labor',...cells(100)},{source:'donor:shop',target:'party:Labor',...cells(50)}]};
  const farm=resolveFlow({jur:'federal',industry:'agriculture'},graph,null);
  const retail=resolveFlow({jur:'federal',industry:'retail'},graph,null);
  assert.equal(farm.total,100);assert.equal(retail.total,50);
  assert.equal(farm.total+retail.total,150);
  assert.deepEqual(comparableFlows(farm,null).rows.map(r=>r.total),[50]);
  const dom=new JSDOM('<section id="ask-money"></section>'),box=dom.window.document.querySelector('section');
  const panel=runInNewContext(fn('renderMoneyPanel')+';renderMoneyPanel',{
    moneyDonationReceipts:donationGraph(graph),moneyDonationScope:'Donations only',hasPartyReceipts,
    $:()=>box,esc:String,industryLabel:String,fmtMoney:v=>`$${v}`,tile:(v,l)=>`<b>${v}</b>${l}`,
    donorRows:r=>r,donorViewIndex:new Map(),barList:()=>'',subjectHash:()=>'',AEC_NOTE:'',
  });
  panel('retail');assert.equal(box.querySelector('b').textContent,'$50');
  dom.window.close();
});

test('real retail and other industry totals match the canonical summary, including Wesfarmers once',()=>{
  const wesfarmers=full.nodes.find(n=>n.label==='Wesfarmers Limited');
  assert.equal(wesfarmers.industry,'agriculture');assert.equal('group' in wesfarmers,false);
  for(const industry of ['retail','other','agriculture']){
    const expected=Object.values(summary.industries[industry]).reduce((a,b)=>a+b,0);
    assert.equal(resolveFlow({jur:'federal',industry},full,null).total,expected,industry);
  }
  assert.equal(resolveFlow({jur:'federal',industry:'retail'},full,null).total,7525586); // Distinct organisation qualifiers retain their own canonical industry
});

test('Explain’s primary scope says donations for industry/party facts and all types for a named donor',()=>{
  for(const state of [{jur:'federal',industry:'fossil_fuels',to:'party:Liberal'},{jur:'federal',to:'party:Labor'}]){
    const flow=resolveFlow(state,full,null),dom=new JSDOM(pageHTML(flow,{index:new Map()}));
    assert.match(flowScope(flow),/^Donations only/);
    assert.match(dom.window.document.querySelector('.mx-shows > .mx-scope').textContent,/^Donations only/);
    dom.window.close();
  }
  const linc=full.nodes.find(n=>n.label==='Linc Energy');
  const flow=resolveFlow({jur:'federal',from:linc.id},full,null);
  assert.equal(flow.total,357799);assert.match(flowScope(flow),/^All receipt types/);
});

test('party and year tool citations and notes carry the selected measure with every amount',async()=>{
  const env={asset:async path=>path==='/graph/money-receipts.json'?full:null};
  for(const party of ['Liberal','Labor'])for(const measure of ['donations','all_types'])for(const group_by of ['party','year']){
    const result=await tool.handler(env,{party,measure,group_by,financial_year:'2024-25'});
    assert.ok(result.rows.length);
    const unit=measure==='donations'?'donations':'receipts';
    for(const citation of result.citations){
      assert.match(citation.text,new RegExp(`federal disclosed ${unit}`));
      assert.match(citation.text,new RegExp(`across [\\d,]+ ${unit.slice(0,-1)}s? in financial years`));
    }
    assert.ok(result.notes.some(note=>note.startsWith(measure==='donations'?'Figures count donations only:':'Figures count every receipt type:')));
    if(measure==='donations')assert.ok(!result.notes.some(note=>/include more than gifts|All receipt types/.test(note)));
  }
});

const numericRows=rows=>rows.map(r=>[r.label,Math.round(r.total*100),r.count]).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]||a[2]-b[2]);
const configFrom=html=>{
  const dom=new JSDOM(html),script=dom.window.document.querySelector('[data-register-config]');
  assert.ok(script);const config=JSON.parse(script.textContent).config;dom.window.close();return config;
};

test('Liberal and Labor agree across browser, SSR, register API and the actual CSV endpoint; Connections stays capped',async()=>{
  const loaded=await tableRows(undefined,{moneyOnly:true});
  const buckets=new Map(partyMoneyBucketFiles('/graph/money-receipts.json',full));
  const local=await tableDatabase({memorySQL:true,datasets:{'party-money':loaded.rows['party-money']},metadata:loaded.metadata});
  try{
    for(const [party,count,total] of [['Liberal',7853,403316945],['Labor',9832,579163899]]){
      const data=partyMoneyData(full,'party:'+party),browser=partyMoneyTableConfig(data.rows,undefined,undefined,undefined,{party,jurisdiction:'federal'});
      assert.equal(data.rows.length,count);assert.equal(data.rows.reduce((s,r)=>s+r.total,0),total);
      const expected=numericRows(configFrom(registerTableHTML(browser)).rows);
      for(const useBuckets of [true,false]){
        const person={name:'Fixture Member',party,party_now:party,pid:'fixture',current:true,states:[],chambers:['senate']};
        const result=await renderPersonAnswer(person,async path=>{
          if(useBuckets && buckets.has(path))return buckets.get(path);
          if(path==='/graph/money-receipts.json'){
            assert.equal(useBuckets,false,'cached party rows avoid the full graph read');return full;
          }
          throw Error('Missing optional local fixture');
        },new Map());
        assert.deepEqual(numericRows(configFrom(result.html).rows),expected,'person party table '+party);
      }
      const response=await workerFetch(partyUrl(party),{}, {},{assets:{'/graph/money.json':{meta:{},nodes:[],edges:[]}}});
      assert.equal(response.status,200);
      const html=await response.text();assert.ok(html.includes(partyTableScope(data.scope,full.meta)));
      assert.deepEqual(numericRows(configFrom(html).rows),expected,'SSR '+party);
      const api=await partyMoneyResponse(new Request('https://opax.test/api/register/party-money?partyId='+encodeURIComponent('party:'+party)),{fetch:async request=>{
        assert.equal(new URL(request.url).pathname,'/graph/money-receipts.json');return Response.json(full);
      }});
      assert.equal(api.status,200);const json=await api.json();assert.equal(json.scope,data.scope);assert.deepEqual(numericRows(json.rows),expected,'register API '+party);
      const url=new URL(browser.export.endpoint,'https://opax.test');url.searchParams.set('format','csv');
      const exported=await readServerCSV(url.href,path=>tableApi(new Request(path),{TABLE_DB:local.db}));
      assert.equal(exported.truncated,false);assert.ok(exported.csv.includes(data.scope),'CSV measure '+party);
      const fields=[...csvFields(exported.csv)],width=TABLE_DATASETS['party-money'].columns.length,header=fields.splice(0,width),rows=[];
      while(fields.length>=width){const values=fields.splice(0,width);if(values[0].startsWith('#'))continue;rows.push(Object.fromEntries(header.map((key,i)=>[key,values[i]])));}
      assert.deepEqual(numericRows(rows.map(r=>({label:r.from,total:Number(r['Received (AUD)']),count:Number(r.Receipts)}))),expected,'CSV '+party);
      const connections=loaded.rows['money-connections'].filter(({row})=>row.jurisdiction==='federal'&&row.to===party&&row.type==='receipts');
      assert.equal(connections.length,partyMoneyData(drawing,'party:'+party).rows.length);
      assert.ok(connections.length<count,'drawing cap remains independent');
    }
  }finally{await local.close();}
});
