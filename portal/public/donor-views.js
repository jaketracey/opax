import {MONEY_GRAPHS} from './donor-entity.js?v=3fd3e51b56';
import {donorLookup} from './donor-disclosure.js?v=800932e746';
export {donorDisclosure,donorLabelHTML,donorDisplayText,donorLookup} from './donor-disclosure.js?v=800932e746';
let memo;
const graphs=new Map();
export function loadMoneyGraph(path){
  if(!graphs.has(path))graphs.set(path,fetch(path,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Money data unavailable');return r.json()}));
  return graphs.get(path);
}
export function loadDonorViewIndex(){
  return memo ??= fetch('/graph/donor-index.json',{cache:'no-cache'})
    .then(r=>{if(!r.ok)throw Error('Donor index unavailable');return r.json()})
    .then(data=>{if(!Array.isArray(data.donors))throw Error('Donor index malformed');return donorLookup(data.donors)})
    .catch(()=>Promise.all(MONEY_GRAPHS.map(loadMoneyGraph)).then(graphs=>donorLookup(graphs.flatMap(g=>g.nodes.filter(n=>n.kind==='donor')))))
    .catch(()=>new Map());
}
export function donorRows(rows,_index,limit=Infinity){return [...(rows || [])].sort((a,b)=>b[1]-a[1]).slice(0,limit)}
