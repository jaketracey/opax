// Test-only asset overlays. Runtime identities remain in memory, including
// generated crawl/growth outputs; unrelated filesystem access stays real.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
const roots=new Map();let serial=0;
const original={},asyncOriginal={};
const path=p=>p instanceof URL?fileURLToPath(p):resolve(String(p));
const scope=p=>{const full=path(p);for(const[root,state]of roots)if(full===root||full.startsWith(root+'/'))return {full,root,state,key:full.slice(root.length+1)};};
const missing=()=>Object.assign(Error('Virtual asset unavailable'),{code:'ENOENT'});
const hidden=(s,key)=>[...s.hidden].some(p=>key===p||key.startsWith(p+'/'));
function bytes(p){const v=scope(p);if(!v)return original.readFileSync(p);const {state:s,key}=v;if(s.files.has(key))return s.files.get(key);if(hidden(s,key))throw missing();return original.readFileSync(join(s.base,key));}
function read(p,options){const b=bytes(p),encoding=typeof options==='string'?options:options?.encoding;return encoding?b.toString(encoding):Buffer.from(b);}
function entries(p,options){const v=scope(p);if(!v)return original.readdirSync(p,options);const {state:s,key}=v;const names=new Map();if(!hidden(s,key)){try{for(const d of original.readdirSync(join(s.base,key),{withFileTypes:true}))names.set(d.name,d.isDirectory());}catch(e){if(e.code!=='ENOENT')throw e;}}for(const full of [...s.files.keys(),...s.dirs]){const rest=key?full.startsWith(key+'/')?full.slice(key.length+1):'':full;if(rest){const at=rest.indexOf('/');names.set(at<0?rest:rest.slice(0,at),at>=0||s.dirs.has(full));}}const result=[...names].sort(([a],[b])=>a.localeCompare(b));return options?.withFileTypes?result.map(([name,dir])=>({name,isDirectory:()=>dir,isFile:()=>!dir,isSymbolicLink:()=>false})):result.map(([name])=>name);}
function write(p,data){const v=scope(p);if(!v)return original.writeFileSync(p,data);v.state.files.set(v.key,Buffer.from(data));}
function mkdir(p,options){const v=scope(p);if(!v)return original.mkdirSync(p,options);v.state.dirs.add(v.key);}
function remove(p,options){const v=scope(p);if(!v)return original.rmSync(p,options);if(!v.key){roots.delete(v.root);return}for(const key of [...v.state.files.keys()])if(key===v.key||key.startsWith(v.key+'/'))v.state.files.delete(key);for(const key of [...v.state.dirs])if(key===v.key||key.startsWith(v.key+'/'))v.state.dirs.delete(key);v.state.hidden.add(v.key);}
function install(){if(original.readFileSync)return;for(const name of ['readFileSync','writeFileSync','readdirSync','mkdirSync','rmSync','existsSync'])original[name]=fs[name];for(const name of ['readFile','writeFile','readdir','mkdir','rm'])asyncOriginal[name]=fsp[name];Object.assign(fs,{readFileSync:read,writeFileSync:write,readdirSync:entries,mkdirSync:mkdir,rmSync:remove,existsSync:p=>{try{const v=scope(p);if(!v)return original.existsSync(p);return v.state.files.has(v.key)||v.state.dirs.has(v.key)||!hidden(v.state,v.key)&&original.existsSync(join(v.state.base,v.key));}catch{return false}}});Object.assign(fsp,{readFile:async(p,o)=>scope(p)?read(p,o):asyncOriginal.readFile(p,o),writeFile:async(p,d,o)=>scope(p)?write(p,d):asyncOriginal.writeFile(p,d,o),readdir:async(p,o)=>scope(p)?entries(p,o):asyncOriginal.readdir(p,o),mkdir:async(p,o)=>scope(p)?mkdir(p,o):asyncOriginal.mkdir(p,o),rm:async(p,o)=>scope(p)?remove(p,o):asyncOriginal.rm(p,o)});syncBuiltinESMExports();}
export function memoryExport(base,overrides){install();const root='/virtual/opax-donor-privacy/'+ ++serial;roots.set(root,{base,files:new Map(Object.entries(overrides).map(([p,v])=>[p.replace(/^\//,''),Buffer.from(JSON.stringify(v))])),dirs:new Set(['']),hidden:new Set(['crawl','person-paths.js'])});return root;}
export function closeMemoryExports(){roots.clear();Object.assign(fs,original);Object.assign(fsp,asyncOriginal);syncBuiltinESMExports();}
