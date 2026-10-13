// Local D1 and Worker regression sweep. Diagnostics contain counts only.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {privacySourceGraphs} from '../../scripts/withhold_donor_assets.mjs';
import {tableRows,tableIdentityIndex,tableRegistryFingerprint} from '../../scripts/load_tables.mjs';
import {isOrganisationRecipient} from '../src/table-recipient.mjs';
import {isOrganisationDonor,MONEY_GRAPHS} from '../public/donor-entity.js';
import {tablePrivacyCheck} from '../src/table-privacy.ts';
import {tableApi,TABLE_REGISTRY_FINGERPRINT} from '../src/table-api.ts';
import {identityStripped,identityVariants} from '../src/table-identities.mjs';
import {TABLE_DATASETS} from '../src/table-datasets.mjs';
import {rawProbeKinds,rawProbeParams} from './datatable-raw-probes.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {loadWorker,offline,rendered,outbound} from './worker-harness.mjs';
import {moneyConnectionsConfig} from '../public/money-connections.js';
import {applyQuery,toCSV,dataTableHTML,guardTableURL} from '../public/datatable.js';
import {moneyTotals,moneyFlowType} from '../public/money-records.js';
const output=resolve('private/dt-money'),pub=resolve('public');
const read=async path=>JSON.parse(await readFile(resolve(pub,path),'utf8'));
const result={};
const source=sourceTableDonorIdentities(),recipients=[];
for(const jur of ['federal','qld'])for(const file of (await readdir(resolve(pub,'grants',jur))).filter(f=>f.startsWith('shard-')&&f.endsWith('.json')))for(const row of Object.values(await read(`grants/${jur}/${file}`)))if(!isOrganisationRecipient(row))recipients.push(...[row.n,row.abn,row.abr?.abn,row.identity?.legal_name,row.abr?.name,...row.aliases||[],...row.lookup_names||[]].filter(v=>(typeof v==='string'||typeof v==='number')&&String(v).trim()).map(String));
const recipientInputs=[...new Set(recipients)],sets={donorLabels:source.labels,donorIdentifiers:source.identifiers,recipientInputs};
result.sets=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.length]));
const registry=await read('table-private-identities.json');
const assets={fetch:async()=>Response.json(registry)},safe=await tablePrivacyCheck(assets);
result.guardMisses=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.filter(safe).length]));
const variantValues=[...new Set([...source.labels,...recipientInputs].flatMap(v=>[identityStripped(v),v.normalize('NFD'),v.split('').map((c,i)=>i%2?c.toUpperCase():c.toLowerCase()).join(''),v.replace(/\s+/g,'.'),encodeURIComponent(encodeURIComponent(v))]))];
result.variants={inputs:variantValues.length,misses:variantValues.filter(safe).length};
const loaded=await tableRows(pub,{moneyOnly:true});
result.fingerprintMatches=tableRegistryFingerprint(loaded.policy)===TABLE_REGISTRY_FINGERPRINT;
const local=await tableDatabase({datasets:loaded.rows,policy:loaded.policy});
console.log(JSON.stringify({stage:'local-D1-built',sets:result.sets,counts:local.manifest.counts,fingerprintMatches:result.fingerprintMatches}));
const restore=offline(),worker=await loadWorker(resolve('src/index.ts'),pub);worker.env.TABLE_DB=local.db;
let reads=0;const db={prepare(sql){if(/FROM\s+table_(?!meta\b|private_identity\b)/i.test(sql))reads++;return local.db.prepare(sql)},batch:local.db.batch.bind(local.db)};
const errors=[];
async function probeAPI(value,params){
  for(const [dataset,c]of Object.entries(TABLE_DATASETS).filter(([,c])=>c.privacy))for(const csv of [false,true]){
    const p=new URLSearchParams(params||{q:value});if(csv)p.set('format','csv');reads=0;
    const response=await tableApi(new Request('https://local.invalid/api/table/'+dataset+'?'+p),{TABLE_DB:db});
    const body=await response.text();
    if(response.status!==200||reads||response.headers.get('content-location')||response.headers.get('link')||(csv?response.headers.get('x-table-exported')!=='0':JSON.parse(body).total!==0))errors.push({dataset,csv,status:response.status,reads});
    result.apiCases++;
  }
}
try{
  result.apiCases=0;
  for(const values of Object.values(sets))for(const value of values)await probeAPI(value);
  console.log(JSON.stringify({stage:'exact-API-sets',cases:result.apiCases,errors:errors.length}));
  // All separator-stripped forms go through real D1; the larger variant set also
  // exercises the same shared hashed guard directly above.
  const compacts=[...new Set([...source.labels,...recipientInputs].map(identityStripped))];
  for(const value of compacts)await probeAPI(value);
  console.log(JSON.stringify({stage:'compact-API-variants',inputs:compacts.length,cases:result.apiCases,errors:errors.length}));
  result.numericCases=0;
  for(const value of source.identifiers)for(const state of [
    new URLSearchParams({'f.amount':JSON.stringify({min:Number(value),max:Number(value)})}),
    new URLSearchParams({'f.amount':'{"min":'+Number(value).toExponential()+'}'}),
    new URLSearchParams({page:String(Number(value))}),new URLSearchParams({pageSize:String(Number(value))}),
    new URLSearchParams({future:JSON.stringify({nested:[Number(value)]})})]){await probeAPI(value,state);result.numericCases+=10;}
  result.apiErrors=errors.length;result.apiErrorCategories=errors.slice(0,8);
  const original=privacySourceGraphs()[0],nodes=new Map(original.nodes.map(n=>[n.id,n]));
  const rejected=original.edges.filter(e=>[nodes.get(e.source),nodes.get(e.target)].some(n=>n.kind==='donor'&&!isOrganisationDonor(n)));
  result.dropAudit={sourceConnections:original.edges.length,dropped:rejected.length,passingOrganisationDropped:0,byFlow:Object.fromEntries(['receipts','contracts','grants'].map(k=>[k,rejected.filter(e=>moneyFlowType(e,nodes)===k).length]))};
  result.graphs=[];
  for(const path of MONEY_GRAPHS){
    const graph=await read(path.slice(1)),config=moneyConnectionsConfig(graph,safe),page=applyQuery(config.rows,config,{pageSize:2000});
    const amounts=Object.fromEntries(['receipts','contracts','grants'].map(k=>[k,page.rows.reduce((n,r)=>n+(Number(config.columns.some(c=>c.key===k)?r[k]:k==='receipts'?r.value:0)||0),0)]));
    const totals=moneyTotals(graph);
    const csv=toCSV(page.rows,config),html=dataTableHTML(config,page);
    const leakLines=csv.split('\r\n').filter(line=>loaded.policy.check(line)).length;
    result.graphs.push({path,inputRows:config.rows.length,validatedRows:page.total,aggregateRows:page.rows.filter(r=>r.aggregate).length,reconciled:Object.keys(totals).filter(k=>k in amounts).every(k=>totals[k]===amounts[k]),csvLeakLines:leakLines,htmlLeak:loaded.policy.check(html),totals:Object.fromEntries(Object.keys(amounts).map(k=>[k,{source:totals[k],shown:amounts[k]}]))});
  }
  result.ssr={cases:0,nonzeroRejected:0,leaks:0};
  for(const value of [...source.labels,...source.identifiers,...recipientInputs]){
    const response=await worker.fetch('/money?'+new URLSearchParams({'c.q':value}));const html=rendered(await response.text());
    result.ssr.cases++;if(!html.includes('Showing 0–0 of 0'))result.ssr.nonzeroRejected++;if(loaded.policy.check(html))result.ssr.leaks++;
  }
  result.cleaner={cases:0,privateRetained:0,unblocked:0,kinds:{}};
  const representatives=[source.labels[0],source.identifiers[0],recipientInputs[0]];
  for(const value of representatives)for(const kind of [...rawProbeKinds,...(/^\d+$/.test(value)?['numeric']:[])]){
    const params=rawProbeParams(value,kind,'c'),clean=guardTableURL({id:'money',caption:'',columns:[],pageType:'money',privacy:'donors',privacyCheck:safe,urlKey:'c'},new URL('https://local.invalid/money?'+params));
    const retained=[...clean.url.searchParams].some(([k,v])=>!safe(k)||!safe(v));
    result.cleaner.cases++;if(retained)result.cleaner.privateRetained++;if(!clean.rejected)result.cleaner.unblocked++;
    result.cleaner.kinds[kind]??={cases:0,privateRetained:0,unblocked:0};const item=result.cleaner.kinds[kind];item.cases++;item.privateRetained+=Number(retained);item.unblocked+=Number(!clean.rejected);
  }
  result.outboundRequests=outbound.length;
  if(!result.fingerprintMatches || Object.values(result.guardMisses).some(Boolean) || result.variants.misses || result.apiErrors || result.ssr.nonzeroRejected || result.ssr.leaks || result.cleaner.privateRetained || result.cleaner.unblocked || result.graphs.some(g=>!g.reconciled || g.csvLeakLines || g.htmlLeak) || result.outboundRequests)process.exitCode=1;
  await writeFile(resolve(output,'probes.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{restore();await local.close();}
