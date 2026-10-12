#!/usr/bin/env node
// Source donor identities are derived from pinned exports in memory; count-only diagnostics.
import {readFileSync,readdirSync,writeFileSync,renameSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privacySourceGraphs,privacySourceDonorRecords} from './withhold_donor_assets.mjs';
import {donorPrivacyIndex,donorNameWithheld,isOrganisationDonor,withheldPhrases,namesWithheldPhrase,foldDonorName} from '../portal/public/donor-entity.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=privacySourceGraphs();const donors=privacySourceDonorRecords();
const index=donorPrivacyIndex([...source,{nodes:donors}]);
const hidden=[...source.flatMap(g=>g.nodes),...donors].filter(r=>r.kind==='donor'&&!isOrganisationDonor(r)&&donorNameWithheld(index,r.label));
const fold=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const labels=[...new Set(hidden.flatMap(r=>[r.label,...r.aliases||[]]).map(fold))].filter(s=>s.length>1&&!/^donor \d+ name withheld$/.test(s));
const registry=JSON.parse(readFileSync(join(root,'portal/src/donor-withheld.json'),'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const exempt=hidden.flatMap(r=>[r.label,...r.aliases||[]]).filter(s=>registry.names[hash(foldDonorName(s))]?.exempt);
const phrases=withheldPhrases([...source,{nodes:donors}],exempt,index);
const phraseMap=new Map(phrases.withheld);
const needle=new RegExp('(?:^| )('+labels.map(RegExp.escape).join('|')+')(?= |$)','g');
const contains=s=>{
 const candidates=[...fold(s).matchAll(needle)].map(m=>m[1]);
 return candidates.length>0&&namesWithheldPhrase({withheld:[...new Set(candidates)].filter(p=>phraseMap.has(p)).map(p=>[p,phraseMap.get(p)])},s);
};
const hasDonor=value=>typeof value==='string'?contains(value):value&&typeof value==='object'?Object.entries(value).some(([k,v])=>contains(k)||hasDonor(v)):false;
const hold=process.argv.includes('--hold-local-text');
const roots=process.argv.slice(2).filter(p=>p!=='--hold-local-text').map(p=>join(root,p));
let files=0,donorHits=0,personFields=0,signatoryFields=0;
function walk(value,key=''){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){value.forEach(v=>walk(v,key));return;}
 for(const[k,v]of Object.entries(value)){
  if(/^(?:person_id|person_links|people|signatory|signatory_name|signatory_id|signer|signer_name)$/i.test(k))personFields++;
  if(k==='body'&&typeof v==='string'&&/signature as published|Director-General/.test(v)&&value.page_start)signatoryFields++;
  walk(v,k);
 }
}
function scan(path){
 const single=!statSync(path).isDirectory();
 const entries=single?[{name:basename(path),isDirectory:()=>false}]:readdirSync(path,{withFileTypes:true});
 for(const ent of entries){const p=single?path:join(path,ent.name);if(ent.isDirectory())scan(p);else if(/\.(?:json|jsonl)$/.test(ent.name)){
  let text=readFileSync(p,'utf8');files++;
  if(hold&&!ent.name.endsWith('.jsonl')&&hasDonor(JSON.parse(text))&&p.startsWith(join(root,'scripts/state/qao/pdf-text/'))){
   const doc=JSON.parse(text);
   if(!doc.rights_review||!Array.isArray(doc.pages))throw Error('Rights review must precede local donor-text hold');
   const digest=s=>createHash('sha256').update(s).digest('hex');
   doc.privacy_withheld=true;
   doc.pages=doc.pages.map(page=>({...page,text:'',blocks:[],source_page_text_sha256:digest(page.text),privacy_withheld:true}));
   for(const key of ['notices','exceptions'])doc.rights_review[key]=doc.rights_review[key].map(n=>contains(n.text||'')?{page:n.page,text_sha256:digest(n.text),privacy_withheld:true}:n);
   doc.text_sha256=execFileSync('python3',['-c',"import hashlib,json,sys;print(hashlib.sha256(json.dumps(json.load(sys.stdin),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest())"],{input:JSON.stringify(doc.pages),encoding:'utf8'}).trim();
   text=JSON.stringify(doc)+'\n';writeFileSync(p+'.tmp',text);renameSync(p+'.tmp',p);
  }
  if(ent.name.endsWith('.jsonl') ? text.split('\n').filter(Boolean).some(line=>hasDonor(JSON.parse(line))) : hasDonor(JSON.parse(text)))donorHits++;
  if(ent.name.endsWith('.jsonl'))for(const line of text.split('\n').filter(Boolean))walk(JSON.parse(line));else walk(JSON.parse(text));
 }}
}
for(const path of roots)scan(path);
console.log(JSON.stringify({files,donor_identity_files:donorHits,person_fields:personFields,signatory_fields:signatoryFields}));
if(donorHits||personFields||signatoryFields)process.exitCode=1;
