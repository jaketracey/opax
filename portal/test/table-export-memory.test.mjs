// Private probes stay in RAM; diagnostics contain booleans and exit status only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceTableDonorIdentities} from '../../scripts/table_identity_source.mjs';
import {tableIdentityIndex} from '../../scripts/load_tables.mjs';
import {tablePrivacyCheckFrom} from '../src/table-privacy.ts';
import {assertTablePrivacy} from './datatable-privacy.mjs';

test('download integrity cache revalidates changed CSV bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'opax-csv-integrity-')),csvPath=join(dir,'download.csv');
  let scans=0;
  const index={safe:value=>{if(String(value).startsWith('Title,'))scans++;return !String(value).includes('Fixture blocked cell')}};
  const surfaces={clientInput:[],serverResponses:[],url:'',renderedText:'',accessibleText:'',analytics:[],csvPath};
  try{
    await writeFile(csvPath,'Title,Sector\r\nFixture organisation Pty Ltd,Health\r\n');
    await assertTablePrivacy(surfaces,index);await assertTablePrivacy(surfaces,index);
    assert.equal(scans,1,'unchanged downloaded bytes were fully checked once');
    await writeFile(csvPath,'Title,Sector\r\nFixture blocked cell,Health\r\n');
    await assert.rejects(assertTablePrivacy(surfaces,index),/withheld text in downloaded CSV/);
    assert.equal(scans,2,'changed downloaded bytes are checked again');
  }finally{await rm(dir,{recursive:true,force:true})}
});

test('server fingerprints preserve the complete registry and unknown hashes use the shared fallback',async t=>{
  const registry=JSON.parse(await readFile(new URL('../public/table-private-identities.json',import.meta.url),'utf8'));
  const safe=await tablePrivacyCheckFrom(async()=>registry),policy=await tableIdentityIndex();
  let missed=0;
  for(const value of policy.phrases)if(safe(value))missed++;
  assert.equal(missed,0,'complete registry misses');
  const ordinary='Fixture registry extension Pty Ltd';
  assert.equal(safe(ordinary),true);
  const phrase=ordinary.toLowerCase(),extra={hash:createHash('sha256').update(phrase).digest('hex'),words:phrase.split(' ').length};
  const extended=await tablePrivacyCheckFrom(async()=>({...registry,identities:[...registry.identities,extra]}));
  assert.equal(extended(ordinary),false,'a hash without a server fingerprint still blocks');
  t.diagnostic(JSON.stringify({registryProbes:policy.phrases.size,misses:missed,fallback:true}));
});

test('shared privacy guard validates large CSV and its trailing private value in bounded memory',async()=>{
  const moduleURL=new URL('../src/table-privacy.ts',import.meta.url).href;
  const registryURL=new URL('../public/table-private-identities.json',import.meta.url).href;
  const code=`
    import {readFile} from 'node:fs/promises';
    import {tablePrivacyCheckFrom} from ${JSON.stringify(moduleURL)};
    const registry=JSON.parse(await readFile(new URL(${JSON.stringify(registryURL)}),'utf8'));
    const safe=await tablePrivacyCheckFrom(async()=>registry),blocked=value=>!safe(value);
    let input='';for await(const part of process.stdin)input+=part;
    const {probe}=JSON.parse(input);
    const csv='Title,Sector,Registered\\r\\n'+Array.from({length:3000},(_,i)=>'Fixture organisation '+i+' Pty Ltd,Health,2025-01-01').join('\\r\\n');
    console.log(JSON.stringify({publicCSV:!blocked(csv),privateTail:blocked(csv+'\\r\\n'+probe)}));
  `;
  const child=spawn(process.execPath,['--max-old-space-size=128','--input-type=module','-e',code],{stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',part=>output+=part);child.stderr.resume();
  const finished=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});
  child.stdin.end(JSON.stringify({probe:sourceTableDonorIdentities().labels[0]}));
  assert.equal(await finished,0,'bounded CSV validation process exits successfully');
  assert.deepEqual(JSON.parse(output),{publicCSV:true,privateTail:true});
});
