// Private identity checks: no donor label or alias is shipped in this registry.
import {createHash} from 'node:crypto';
import registry from './donor-withheld.json' with {type:'json'};
import {foldDonorName} from '../public/donor-entity.js';
import {withholdStoredDonors} from './donor-sanitise.mjs';
export const sanitiseStoredDonors=value=>withholdStoredDonors(value,registry);
const hash=s=>createHash('sha256').update(s).digest('hex');
const normalise=s=>String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const historicalWithheldName=name=>Object.hasOwn(registry.names,hash(foldDonorName(name)));
const byFirst=new Map();
for(const p of registry.phrases){if(!p.first)continue;if(!byFirst.has(p.first))byFirst.set(p.first,[]);byFirst.get(p.first).push(p)}
const orgs=new Set(registry.organisations);
export function historicalWithheldText(...texts){
 for(const text of texts){const words=normalise(text).split(' ');
  for(let from=0;from<words.length;from++)for(const p of byFirst.get(hash(words[from])) || []){
   const end=from+p.words;if(end>words.length || hash(words.slice(from,end).join(' '))!==p.hash)continue;
   let covered=false;
   for(let start=Math.max(0,from-24);start<=from&&!covered;start++)for(let to=end;to<=Math.min(words.length,start+24);to++)if(orgs.has(hash(words.slice(start,to).join(' ')))){covered=true;break}
   if(covered)continue;
   if(p.words>1 || /\b(?:donors?|donat\w*|receipts?|funding|money|contributions?)\b/i.test(String(text)))return true;
  }
 }
 return false;
}
