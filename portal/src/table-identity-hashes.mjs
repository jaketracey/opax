import {createHash} from 'node:crypto';
import {identityCandidates,STRIPPED_PREFIX,identityTokenStreams} from './table-identities.mjs';

// Polynomial screening hashes never decide privacy: every hit is confirmed by
// the existing SHA-256 hash. A collision can only cost an extra digest.
const BASE=33;
export function identityRollingHash(value) {
  let hash=0;for(let i=0;i<value.length;i++)hash=(Math.imul(hash,BASE)+value.charCodeAt(i))>>>0;
  return hash;
}
export function identityHashEntry(value) {
  const compact=value.startsWith(STRIPPED_PREFIX),form=compact?value.slice(STRIPPED_PREFIX.length):value;
  return {hash:createHash('sha256').update(value).digest('hex'),words:value.split(' ').length,compact,length:form.length,rolling:identityRollingHash(form)};
}
export function compileHashedIdentityCheck(entries, strippedLengths = [], {mode='query'} = {}) {
  if(!Array.isArray(strippedLengths)||strippedLengths.some(n=>!Number.isSafeInteger(n)||n<4))throw Error('Privacy index unavailable');
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!e||!/^[a-f0-9]{64}$/.test(e.hash)||!Number.isSafeInteger(e.words)||e.words<1))throw Error('Privacy index unavailable');
  // Compatibility for historical hash-only indices, used by regression audits.
  if(entries.every(e=>e.rolling===undefined)) {
    const hashes=new Set(entries.map(e=>e.hash)),lengths=[...new Set(entries.map(e=>e.words))];
    return value=>{for(const candidate of identityCandidates(value,lengths,strippedLengths,{mode}))if(hashes.has(createHash('sha256').update(candidate).digest('hex')))return true;return false;};
  }
  if(entries.some(e=>typeof e.compact!=='boolean'||!Number.isSafeInteger(e.length)||e.length<1||!Number.isSafeInteger(e.rolling)||e.rolling<0||e.rolling>0xffffffff))throw Error('Privacy index unavailable');
  const domains=[new Map(),new Map()];
  for(const e of entries){const domain=domains[Number(e.compact)];let group=domain.get(e.length);if(!group){let power=1;for(let i=0;i<e.length;i++)power=Math.imul(power,BASE);domain.set(e.length,group={length:e.length,power,hashes:new Map()});}let hashes=group.hashes.get(e.rolling);if(!hashes)group.hashes.set(e.rolling,hashes=new Set());hashes.add(e.hash);}
  const windows=domains.map(domain=>{const groups=[...domain.values()],capacity=Math.max(0,...groups.map(g=>g.length))+1;return {groups,capacity,chars:new Uint16Array(capacity),starts:new Uint8Array(capacity),prefixes:new Uint32Array(capacity)};});
  const scan=(tokens,compact)=>{
    const {groups,capacity,chars,starts,prefixes}=windows[Number(compact)];let at=0,rolling=0;prefixes[0]=0;
    const push=(code,start,end)=>{
      chars[at%capacity]=code;starts[at%capacity]=Number(start);
      rolling=(Math.imul(rolling,BASE)+code)>>>0;prefixes[(at+1)%capacity]=rolling;
      // Row and word checks only inspect token ends. Each character updates one
      // rolling prefix; ring storage is bounded by the longest indexed form.
      if(end || compact&&mode==='query')for(const group of groups){
        const from=at-group.length+1;if(from<0)continue;
        if((!compact||mode==='row'||group.length<6)&&(!starts[from%capacity]||!end))continue;
        const fingerprint=(rolling-Math.imul(prefixes[from%capacity],group.power))>>>0;
        const hashes=group.hashes.get(fingerprint);if(!hashes)continue;
        let form='';for(let i=from;i<=at;i++)form+=String.fromCharCode(chars[i%capacity]);
        if(hashes.has(createHash('sha256').update((compact?STRIPPED_PREFIX:'')+form).digest('hex')))return true;
      }
      at++;return false;
    };
    let first=true;
    for(const token of tokens){if(!compact&&!first&&push(32,false,false))return true;first=false;
      for(let i=0;i<token.length;i++)if(push(token.charCodeAt(i),i===0,i===token.length-1))return true;
    }
    return false;
  };
  return value=>{for(const [tokens,compact]of identityTokenStreams(value))if(scan(tokens,compact))return true;return false;};
}

// RFC 4180 field boundaries reset matching; identities cannot be invented by
// concatenating adjacent cells. Keep only the current field, never candidate sets.
export function csvIdentityCheck(csv, blocked) {
  let field='',quoted=false,closed=false;
  const emit=()=>{if(blocked(field))return true;field='';closed=false;return false;};
  for(let i=0;i<csv.length;i++){
    const c=csv[i];
    if(quoted){if(c==='"'){if(csv[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c===','||c==='\r'||c==='\n'){if(emit())return true;if(c==='\r'&&csv[i+1]==='\n')i++;continue;}
    if(c==='"'){if(field||closed)return true;quoted=true;continue;}
    if(closed)return true;field+=c;
  }
  return quoted||blocked(field);
}
