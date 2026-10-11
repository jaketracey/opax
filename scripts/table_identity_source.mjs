// Raw source identities are read into memory only, before publication removes
// donor labels. Consumers may persist SHA-256 hashes, never these values.
import {execFileSync} from 'node:child_process';
import {privacySourceGraphs,privacySourceDonorRecords,privacyBaselineFiles,PRIVACY_BASELINE,readPublicationContext} from './withhold_donor_assets.mjs';
import {donorPrivacyIndex,donorNameWithheld,foldDonorName} from '../portal/public/donor-entity.js';
let cached;
export function sourceTableDonorIdentities() {
  if (cached) return cached;
  const graphs=privacySourceGraphs(), index=donorPrivacyIndex(graphs);
  const entities=[...graphs.flatMap(g=>g.nodes),...privacySourceDonorRecords()].filter(n=>n.kind==='donor'&&donorNameWithheld(index,n.label));
  const context=readPublicationContext();
  const labels=[...new Map(entities.flatMap(n=>[n.label,...n.aliases||[]]).filter(value=>{const entry=context.registry.names[context.hash(foldDonorName(value))];return entry&&!entry.exempt&&entry.sourceKnown!==false;}).map(value=>[foldDonorName(value),value])).values()];
  const identifiers=new Set();
  const paths=execFileSync('git',['ls-tree','--full-tree','-r','--name-only',PRIVACY_BASELINE,'--','portal/public/grants','portal/public/graph/grants.federal.json','portal/public/graph/grants.qld.json'],{cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:2*1024*1024}).trim().split('\n').filter(p=>p.endsWith('.json'));
  const visit=x=>{
    if(!x||typeof x!=='object')return;
    if(x.d?.e&&typeof x.d.n==='string'&&donorNameWithheld(index,x.d.n)) {
      const d=x.d;
      const values=[d.on,d.abn,d.acn,d.arbn,d.tfn,d.identifier].filter(v=>typeof v==='string'||typeof v==='number');
      for(const value of values){const digits=String(value).replace(/\D/g,'');if(digits.length===11)identifiers.add(digits);}
      entities.push({label:d.n,aliases:values});
    }
    for(const value of Object.values(x))if(value&&typeof value==='object')visit(value);
  };
  for(const[,bytes]of privacyBaselineFiles(paths))visit(JSON.parse(bytes.toString()));
  const privateEntities=entities.map(entity=>({...entity,aliases:(entity.aliases||[]).filter(value=>/^\d{11}$/.test(String(value).replace(/\D/g,''))||context.registry.names[context.hash(foldDonorName(value))])}));
  return cached={entities:privateEntities,labels,identifiers:[...identifiers]};
}
