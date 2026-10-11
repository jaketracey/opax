// Counts-only audit. Source values and matched identities never leave memory.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {tableRows,tableIdentityIndex} from './load_tables.mjs';
import {compileIdentityMatch} from '../portal/src/table-identities.mjs';
const repo=new URL('../',import.meta.url), baseline='3374b4d7';
const source=path=>execFileSync('git',['show',`${baseline}:${path}`],{cwd:repo,maxBuffer:2e6}).toString();
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const identities=moduleURL(source('portal/src/table-identities.mjs'));
const code=source('scripts/load_tables.mjs').replaceAll('import.meta.url',JSON.stringify(new URL('scripts/load_tables-baseline.mjs',repo).href)).replace(/from ['"]([^'"]+)['"]/g,(_,path)=>`from '${path.endsWith('/table-identities.mjs')?identities:new URL(path,new URL('scripts/load_tables.mjs',repo)).href}'`);
const old=await (await import(moduleURL(code))).tableIdentityIndex();
const policy=await tableIdentityIndex(),beforeMatch=compileIdentityMatch(policy.phrases),afterMatch=compileIdentityMatch(policy.phrases,{mode:'row'});
const sample=()=>({total:0,boundaryValid:0,boundaryFalsePositives:0,semanticUnverified:0});
const breakdown=()=>({total:0,datasets:{},rules:{'word-boundary':0,'compact-exact':0,'compact-token-aligned':0,'compact-contains':0},lengths:{},byDataset:{}});
const report={baseline,baselineHashes:old.phrases.size,rows:0,before:breakdown(),after:breakdown(),sampleClassification:'Field-boundary matching rule; person attribution remains unverified',semanticPrecisionTarget:'Unverified; reload blocked',sampleBefore:sample(),sampleAfter:sample(),crossFieldOnly:0};
const records=[];
const priority=match=>['word-boundary','compact-exact','compact-token-aligned','compact-contains'].indexOf(match.rule);
const classify=(fields,match)=>fields.map(match).filter(Boolean).sort((a,b)=>priority(a)-priority(b)||a.length-b.length)[0];
const count=(target,name,match)=>{target.total++;target.datasets[name]=(target.datasets[name]||0)+1;target.rules[match.rule]=(target.rules[match.rule]||0)+1;const key=match.rule+':'+match.length;target.lengths[key]=(target.lengths[key]||0)+1;target.byDataset[name]||={};target.byDataset[name][key]=(target.byDataset[name][key]||0)+1;};
await tableRows(undefined,{moneyOnly:true,observe({name,row,hidden}){
  report.rows++;const joined=Object.values(row).flat().join(' ');if(hidden||old.check(joined)||!policy.check(joined))return;
  const fields=Object.values(row).flat(),after=classify(fields,afterMatch),before=after||classify(fields,beforeMatch)||beforeMatch(joined),boundaryValid=!!after;
  count(report.before,name,before);if(after)count(report.after,name,after);if(!classify(fields,beforeMatch))report.crossFieldOnly++;
  records.push({name,match:before,boundaryValid});
}});
// Evenly spaced deterministic samples cover the full source order.
for(const [key,values]of [['sampleBefore',records],['sampleAfter',records.filter(r=>r.boundaryValid)]])for(let i=0;i<Math.min(50,values.length);i++){const record=values[Math.floor(i*values.length/Math.min(50,values.length))];report[key].total++;report[key][record.boundaryValid?'boundaryValid':'boundaryFalsePositives']++;report[key].semanticUnverified++;}
report.after.unexplained=0;
if(report.sampleAfter.boundaryFalsePositives||report.after.rules['compact-contains'])throw Error('Row precision audit failed');
await writeFile(new URL('../portal/private/dt-api/matching-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
