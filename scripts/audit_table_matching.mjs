// Counts-only audit. Source values and matched identities never leave memory.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {tableRows,tableIdentityIndex} from './load_tables.mjs';
import {compileIdentityMatch,identityWords,STRIPPED_PREFIX} from '../portal/src/table-identities.mjs';
const repo=new URL('../',import.meta.url),baseline='3374b4d7',previous='1c62b50c';
const source=(revision,path)=>execFileSync('git',['show',`${revision}:${path}`],{cwd:repo,maxBuffer:2e6}).toString();
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
async function historical(revision){
 const identities=moduleURL(source(revision,'portal/src/table-identities.mjs'));
 const code=source(revision,'scripts/load_tables.mjs').replaceAll('import.meta.url',JSON.stringify(new URL('scripts/load_tables-baseline.mjs',repo).href)).replace(/from ['"]([^'"]+)['"]/g,(_,path)=>`from '${path.endsWith('/table-identities.mjs')?identities:new URL(path,new URL('scripts/load_tables.mjs',repo)).href}'`);
 return (await import(moduleURL(code))).tableIdentityIndex();
}
const old=await historical(baseline),beforePolicy=await historical(previous),policy=await tableIdentityIndex();
const beforeModule=await import(moduleURL(source(previous,'portal/src/table-identities.mjs')));
const beforeMatch=beforeModule.compileIdentityMatch(beforePolicy.phrases,{mode:'row'}),afterMatch=compileIdentityMatch(policy.rowPhrases,{mode:'row',fieldPhrases:policy.fieldPhrases});
const names=['money-connections','party-money','suppliers','contracts','grants'];
const sample=()=>({total:0,trueHits:0,falsePositives:0,byDataset:{},byStratum:{}});
const breakdown=()=>({total:0,datasets:Object.fromEntries(names.map(n=>[n,0])),rules:{'word-boundary':0,'field-exact':0,'compact-exact':0,'compact-token-aligned':0,'compact-contains':0},lengths:{},byDataset:{}});
const report={baseline,previous,baselineHashes:old.phrases.size,rows:0,before:breakdown(),after:breakdown(),sampleClassification:'Full label/alias word sequence, eligible full-name compact token run, or full identifier; single-token aliases require field equality',sampleBefore:sample(),sampleAfter:sample(),baselineRowsRestored:0};
const records=[],afterRecords=[];
const priority=match=>['word-boundary','field-exact','compact-exact','compact-token-aligned','compact-contains'].indexOf(match.rule);
const classify=(fields,match)=>fields.map(match).filter(Boolean).sort((a,b)=>priority(a)-priority(b)||a.length-b.length)[0];
const count=(target,name,match)=>{target.total++;target.datasets[name]=(target.datasets[name]||0)+1;target.rules[match.rule]=(target.rules[match.rule]||0)+1;const key=match.rule+':'+match.length;target.lengths[key]=(target.lengths[key]||0)+1;target.byDataset[name]||={};target.byDataset[name][key]=(target.byDataset[name][key]||0)+1;};
// Independent reference: enumerate complete token runs, not trie matches or
// rolling hashes. Eligible forms retain their original full-source provenance.
const wordForms=new Set([...policy.rowPhrases].filter(v=>!v.startsWith(STRIPPED_PREFIX))),wordLengths=[...new Set([...wordForms].map(v=>v.split(' ').length))];
const compactForms=new Set([...policy.rowPhrases].filter(v=>v.startsWith(STRIPPED_PREFIX)).map(v=>v.slice(STRIPPED_PREFIX.length))),maxCompact=Math.max(...[...compactForms].map(v=>v.length));
const fullWitness=value=>{
 const words=identityWords(value);if(policy.fieldPhrases.has(words.join(' ')))return true;
 for(const size of wordLengths)for(let i=0;i+size<=words.length;i++)if(wordForms.has(words.slice(i,i+size).join(' ')))return true;
 for(let i=0;i<words.length;i++){let digits='';for(let j=i;j<words.length&&/^\d+$/.test(words[j])&&digits.length<11;j++){digits+=words[j];if(digits.length===11&&wordForms.has(digits))return true;}}
 let raw=String(value??'');for(let i=0;i<2;i++)try{const next=decodeURIComponent(raw);if(next===raw)break;raw=next;}catch{break;}
 const tokens=raw.normalize('NFKC').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ').match(/[\p{L}\p{N}]+/gu)||[];
 for(let i=0;i<tokens.length;i++){let form='';for(let j=i;j<tokens.length;j++){form+=tokens[j];if(form.length>maxCompact)break;if(compactForms.has(form))return true;}}
 return false;
};
await tableRows(undefined,{moneyOnly:true,observe({name,row,hidden}){
  report.rows++;if(hidden)return;const fields=Object.values(row).flat(),baselineHit=old.check(fields.join(' ')),after=classify(fields,afterMatch);
  if(baselineHit){if(!after)report.baselineRowsRestored++;return;}
  const before=classify(fields,beforeMatch);if(!before&&!after)return;
  if(before){count(report.before,name,before);records.push({name,fields,match:before});}
  if(after){count(report.after,name,after);afterRecords.push({name,fields,match:after});}
}});
const stratum=r=>r.name+':'+(r.match.length<8?'short':'long')+':'+r.match.rule;
function stratified(values,total){
 const groups=new Map();for(const r of values){const key=stratum(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const buckets=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)),quotas=new Map();let allocated=0;
 while(allocated<Math.min(total,values.length))for(const[key,bucket]of buckets){const n=quotas.get(key)||0;if(n>=bucket.length)continue;quotas.set(key,n+1);allocated++;if(allocated===Math.min(total,values.length))break;}
 return buckets.flatMap(([key,bucket])=>Array.from({length:quotas.get(key)||0},(_,i)=>bucket[Math.floor(i*bucket.length/quotas.get(key))]));
}
for(const[key,values]of [['sampleBefore',records],['sampleAfter',afterRecords]])for(const record of stratified(values,100)){
 const hit=record.fields.some(fullWitness),kind=hit?'trueHits':'falsePositives',s=report[key];s.total++;s[kind]++;
 for(const[map,k]of [[s.byDataset,record.name],[s.byStratum,stratum(record)]]){map[k]||={total:0,trueHits:0,falsePositives:0};map[k].total++;map[k][kind]++;}
}
report.after.fullIdentityWitnesses=afterRecords.filter(r=>r.fields.some(fullWitness)).length;
report.after.unexplained=report.after.total-report.after.fullIdentityWitnesses;
if(report.before.total!==49382||report.after.unexplained||report.sampleAfter.falsePositives||report.after.rules['compact-contains'])throw Error('Row precision audit failed');
await writeFile(new URL('../portal/private/dt-api/matching-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
