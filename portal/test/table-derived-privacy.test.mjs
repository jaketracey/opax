// Source probes exist only in memory. Failures and diagnostics contain counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableIdentityIndex,tableIdentityHashes,tableRegistryFingerprint} from '../../scripts/load_tables.mjs';
import {identityStripped,STRIPPED_MIN_LENGTH,STRIPPED_CONTAINS_MIN_LENGTH} from '../src/table-identities.mjs';
import {compileHashedIdentityCheck} from '../src/table-identity-hashes.mjs';
import {tablePrivacy,tablePrivacyCheck} from '../src/table-privacy.ts';
import {tableApi,TABLE_REGISTRY_FINGERPRINT} from '../src/table-api.ts';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {applyQuery,dataTableHTML,mountDataTable,toCSV} from '../public/datatable.js';
import {workbenchRows} from '../public/datatable-workbench-data.js';
import {tableHarness} from './datatable-harness.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
const root=new URL('../public/',import.meta.url),source=sourceTableDonorIdentities(),policy=await tableIdentityIndex();
const read=async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
const registry=await read('table-private-identities.json');
const old=JSON.parse(execFileSync('git',['show','35ba00f5f7f442be61b4902face4c2d43ac6c618:portal/public/table-private-identities.json'],{cwd:new URL('../../',import.meta.url),maxBuffer:2000000}));
const oldCheck=compileHashedIdentityCheck(old.identities),blocked=compileHashedIdentityCheck(registry.identities,registry.strippedLengths,registry.prefilter);
const assets={fetch:async()=>Response.json(registry)},safe=await tablePrivacyCheck(assets);
const recipientSet=new Set();
for(const jur of ['federal','qld'])for(const file of (await readdir(new URL(`grants/${jur}/`,root))).filter(f=>f.startsWith('shard-')&&f.endsWith('.json')))for(const row of Object.values(await read(`grants/${jur}/${file}`)))if(!isOrganisationRecipient(row))for(const value of [row.n,row.abn,row.abr?.abn,row.identity?.legal_name,row.abr?.name,...row.aliases||[],...row.lookup_names||[]])if((typeof value==='string'||typeof value==='number')&&String(value).trim())recipientSet.add(String(value));
const recipients=[...recipientSet],variants=values=>values.map(identityStripped).filter(v=>!oldCheck(v));
const donorVariants=variants(source.labels),recipientVariants=variants(recipients),stripped=[...donorVariants,...recipientVariants];
const config={id:'derived-privacy',caption:'Receipts',privacy:'donors',urlKey:'t',privacyCheck:safe,columns:[{key:'name',label:'Organisation',type:'text',primary:true},{key:'category',label:'Category',type:'category',facet:'chips'},{key:'amount',label:'Amount',type:'money',facet:'range',bar:true}]};
const empty={rows:[],total:0,page:1,pageSize:50,facets:{}};
const publicRow={name:'Fixture organisation Pty Ltd',category:'Public sector',amount:1};
const noPrivate=(value,message)=>assert.equal(policy.check(value),false,message);

test('derived row metadata cannot supply private chips, facets, counts, bars or CSV in either mode',async t=>{
  let checked=0;
  for(const value of [...source.labels,...recipients])for(const server of [false,true]){
    const row={...publicRow,category:value,amount:999999},rows=[row],c={...config,rows,...server?{source:{endpoint:'/__fixtures/data'}}:{}};
    const page=applyQuery(rows,c,{});
    assert.equal(page.total,0);assert.equal(page.rows.length,0);assert.deepEqual(page.facets.category,[]);
    for(const candidate of [empty,{rows,total:1,page:1,pageSize:50,facets:{category:[{value,count:1}],amount:{min:999999,max:999999}}}]){
      const html=dataTableHTML(c,candidate);noPrivate(html,'SSR and accessible attributes');assert.ok(!html.includes('data-show-constant='),'empty constant chips');
    }
    const mixed=applyQuery([publicRow,row],c,{});assert.equal(mixed.total,1);assert.equal(mixed.facets.category.length,1);assert.equal(mixed.facets.category[0].count,1);assert.equal(mixed.facets.amount.max,1);noPrivate(toCSV([publicRow,row],c),'CSV row metadata');
    const h=tableHarness(),mounted=mountDataTable(h.root,{...c,privacyCheck:async input=>safe(input)});
    h.win.fetch=async()=>Response.json({rows,total:1,page:1,pageSize:50,facets:{category:[{value,count:1}],amount:{min:999999,max:999999}}});
    noPrivate(h.html(),'synchronous chips and attributes');await new Promise(setImmediate);noPrivate(h.html(),'validated chips and attributes');assert.ok(h.html().includes('Showing 0–0 of 0'),'rejected row count');mounted.destroy();checked++;
  }
  const c={...config,rows:[publicRow]},url=new URL('https://local.invalid/?'+new URLSearchParams({'t.q':source.labels[0]}));
  const html=dataTableHTML(c,applyQuery(c.rows,c,{}),url);noPrivate(html,'rejected SSR');assert.ok(!html.includes('data-show-constant='));
  t.diagnostic(JSON.stringify({rowInjectionProbes:checked,donorInputs:source.labels.length,recipientInputs:recipients.length,chipFacetAttributeHits:0}));
});

test('additive compact hashes retain all production word hashes and reject every derived separator variant',async t=>{
  assert.equal(donorVariants.length,607);assert.equal(recipientVariants.length,144);
  assert.equal(STRIPPED_MIN_LENGTH,4);assert.equal(STRIPPED_CONTAINS_MIN_LENGTH,6);
  const published=new Map(registry.identities.map(e=>[e.hash,e.words]));
  assert.equal(old.identities.filter(e=>published.get(e.hash)!==e.words).length,0,'production hash retention');
  assert.equal(tableRegistryFingerprint(policy),TABLE_REGISTRY_FINGERPRINT);
  assert.equal(createHash('sha256').update([...published.keys()].sort().join('\n')).digest('hex'),TABLE_REGISTRY_FINGERPRINT);
  assert.equal(stripped.filter(v=>!policy.check(v)||!blocked(v)||safe(v)).length,0,'variant misses');
  const short=donorVariants.find(v=>v.length<6),long=donorVariants.find(v=>v.length>=6);
  for(const value of [short,long]){
    const hash=createHash('sha256').update('stripped:v1:'+value).digest('hex');
    const match=compileHashedIdentityCheck([{hash,words:1}],[value.length]);
    assert.equal(match(value.toUpperCase()),true,'compact case folding');
    assert.equal(match([...value].join('-')),true,'compact punctuation');
    assert.equal(match([...value].join(' ')),true,'compact whitespace');
    assert.equal(match('zz'+value+'zz'),value.length>=6,'short-form boundary policy');
  }
  const local=await tableDatabase({datasets:{},policy});
  try{
    for(const value of stripped){
      const validation=await tablePrivacy(new Request('https://local.invalid/api/table/privacy',{method:'POST',body:JSON.stringify({text:value})}),assets);assert.equal((await validation.json()).safe,false,'endpoint variant rejection');
      for(const unknown of [false,true]){
        const params=new URLSearchParams(unknown?{future:value}:{q:value});let reads=0;
        const db={prepare(sql){if(/FROM\s+table_(?!meta\b|private_identity\b)/i.test(sql))reads++;return local.db.prepare(sql);}};
        const response=await tableApi(new Request('https://local.invalid/api/table/money-connections?'+params),{TABLE_DB:db});assert.equal(response.status,200);const body=await response.json();assert.equal(body.total,0);assert.equal(reads,0);noPrivate(JSON.stringify(body),'API echo');
      }
      for(const server of [false,true]){
        const params=new URLSearchParams({'t.q':value,future:value,campaign:'fixture'}),h=tableHarness('http://localhost/table?'+params);
        const c={...config,rows:[publicRow],privacyCheck:async input=>safe(input),...server?{source:{endpoint:'/__fixtures/data'}}:{}};
        let reads=0;h.win.fetch=async()=>{reads++;return Response.json(empty);};
        const mounted=mountDataTable(h.root,c);noPrivate(h.win.location.href,'synchronous URL');noPrivate(h.html(),'synchronous HTML');await new Promise(setImmediate);noPrivate(h.win.location.href,'hydrated URL');noPrivate(h.html(),'hydrated HTML');assert.ok(h.html().includes('data-export disabled'));assert.equal(reads,0);assert.equal(new URL(h.win.location.href).searchParams.get('campaign'),'fixture');mounted.destroy();
      }
    }
  }finally{await local.close();}
  const unavailable=await tablePrivacyCheck({fetch:async()=>Response.json(old)});assert.equal(unavailable('ordinary search'),false,'old registry fails closed');
  t.diagnostic(JSON.stringify({donorVariants:607,recipientVariants:144,rejected:751,retainedHashes:old.identities.length,hashes:registry.identities.length,fingerprint:TABLE_REGISTRY_FINGERPRINT}));
});

test('compact matching measures additional hits in ordinary query terms from tests and fixtures',async t=>{
  const terms=new Set(workbenchRows.flatMap(row=>[row.name,row.industry,row.region,row.jurisdiction]));
  for(const file of (await readdir(new URL('./',import.meta.url))).filter(f=>f.endsWith('.test.mjs'))){
    const code=await readFile(new URL(file,import.meta.url),'utf8'),ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const visit=node=>{
      if(ts.isPropertyAssignment(node)&&['q','search','searchTerm'].includes(node.name.getText(ast).replace(/['"]/g,''))&&ts.isStringLiteral(node.initializer))terms.add(node.initializer.text);
      if(ts.isStringLiteral(node)&&node.text.includes('q='))try{for(const[key,value]of new URLSearchParams(node.text.replace(/^.*\?/,'')))if(key==='q'||key.endsWith('.q'))terms.add(value);}catch{}
      ts.forEachChild(node,visit);
    };visit(ast);
  }
  const ordinary=[...terms].filter(v=>v.length>=3&&v.length<=100&&/[a-z]/i.test(v)&&!oldCheck(v));
  const hits=ordinary.filter(v=>blocked(v)||policy.check(v)).length;assert.ok(ordinary.length>=30,'ordinary sample size');assert.ok(hits<=1,'ordinary false-positive count');
  t.diagnostic(JSON.stringify({ordinaryQueries:ordinary.length,falsePositives:hits,falsePositiveRate:hits/ordinary.length,minStrippedLength:4,shortFormTokenBoundariesThrough:5,containsFromLength:6}));
});
