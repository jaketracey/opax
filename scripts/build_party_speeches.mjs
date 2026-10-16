#!/usr/bin/env node
// Party speech labels as the search index files them: every party label a speech
// carries, with its count (the /api/parties facet, one read-only GET). A party page
// offers "Their speeches" only for a label here, and links the label here, because
// the search filters on the index's exact label: "Reason Party" has money and
// divisions but no speech, and the roster files "Gerard Rennick People First" and
// "Australia's Voice" under no one, though the index holds their speeches.
// `--from <file>` reads a saved /api/parties answer instead of the live one.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const PUBLIC=join(dirname(fileURLToPath(import.meta.url)),'..','portal','public');
export const PARTY_SPEECHES='/graph/party-speeches.json';
const ORIGIN='https://opax.com.au';

export function partySpeechesFile(answer,generated=new Date().toISOString().slice(0,10)) {
  const rows=(answer?.parties || []).filter(p=>p?.label && Number(p.count)>0);
  if(!rows.length)throw new Error('build_party_speeches: the answer names no party labels');
  const parties=Object.fromEntries(rows.map(p=>[String(p.label),Number(p.count)]).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])));
  return {version:1,generated,source:'The search index party labels on speeches (/api/parties)',
    labelled:Object.values(parties).reduce((a,n)=>a+n,0),parties};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const from=process.argv.indexOf('--from');
  const answer=from>0 ? JSON.parse(readFileSync(process.argv[from+1],'utf8'))
    : await fetch(`${ORIGIN}/api/parties`,{headers:{accept:'application/json'}}).then(r=>{if(!r.ok)throw new Error(`build_party_speeches: /api/parties ${r.status}`);return r.json();});
  const path=join(PUBLIC,PARTY_SPEECHES);
  writeFileSync(path,JSON.stringify(partySpeechesFile(answer))+'\n');
  console.log(`build_party_speeches: ${Object.keys(partySpeechesFile(answer).parties).length} labels written.`);
}
