#!/usr/bin/env node
// A source-name search index with explicit identity evidence and return references.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MONEY_GRAPHS} from '../portal/public/donor-entity.js';
const PUBLIC=join(dirname(fileURLToPath(import.meta.url)),'..','portal','public');
export const DONOR_INDEX='/graph/donor-index.json';
export function donorIndexFile(publicRoot=PUBLIC) {
  const donors=MONEY_GRAPHS.flatMap(path=>{
    const graph=JSON.parse(readFileSync(join(publicRoot,path),'utf8'));
    return graph.nodes.filter(n=>n.kind==='donor').map(n=>({jurisdiction:graph.meta?.jurisdiction || (path.endsWith('money.json')?'federal':path.split('.')[1]),...Object.fromEntries(['id','label','source_name','aliases','lookup_names','match'].filter(k=>n[k]!=null).map(k=>[k,n[k]])),returnReferences:(n.returnReferences || []).slice(0,1)}));
  });
  const sourcePath=join(publicRoot,'graph/donor-disclosures.json');
  let extra={donors:[],references:[]};
  try{extra=JSON.parse(readFileSync(sourcePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const key=n=>n.jurisdiction+':'+(n.match?.entity_id || n.label?.toLowerCase());
  const known=new Set(donors.map(key));
  for(const n of [...extra.donors || [],...extra.references || []])if(!known.has(key(n))){known.add(key(n));donors.push({...n,returnReferences:(n.returnReferences || []).slice(0,1)});}
  return {version:2,donors};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const text=JSON.stringify(donorIndexFile())+'\n',path=join(PUBLIC,DONOR_INDEX);
  const before=(()=>{try{return readFileSync(path,'utf8')}catch{return ''}})();
  if(process.argv.includes('--check')){
    if(before!==text){console.error('build_donor_index: stale; run build:donors.');process.exitCode=1;}
    else console.log('build_donor_index: current.');
  }else if(before!==text){writeFileSync(path,text);console.log('build_donor_index: written.');}
  else console.log('build_donor_index: current.');
}
