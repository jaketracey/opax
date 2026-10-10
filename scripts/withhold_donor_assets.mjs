// The publication boundary. Raw desktop exports are read only; hashes retain
// the withheld identity checks after public graphs have lost their labels.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync,cpSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MONEY_GRAPHS,donorPrivacyIndex,donorNameWithheld,foldDonorName,withholdIndividualDonors,isOrganisationDonor,withheldPhrases} from '../portal/public/donor-entity.js';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url)));

// A pinned pre-withholding export supports regression checks and removal of
// older donor references. Labels are read at runtime, never copied into code.
export const PRIVACY_BASELINE='33594d4ec048c77359af1336032dbaa4161b8665';
let baseline;
const optionalSourceGraphs=()=>{try{return privacySourceGraphs()}catch{return []}};
export function privacySourceGraphs(){return baseline ??= MONEY_GRAPHS.map(p=>JSON.parse(execFileSync('git',['show',`${PRIVACY_BASELINE}:portal/public${p}`],{cwd:repo,maxBuffer:20*1024*1024}).toString()));}

// Other exports also carry donor identities: compact grant donor blocks,
// access dictionary keys and report tuples. They must not escape merely because
// the bounded money graphs did not include them.
export function assetDonorRecords(value) {
 const records=new Map();
 const add=(label,aliases=[])=>{if(typeof label==='string' && label && !/^Donor \d+ \(name withheld\)$/.test(label)){const key=foldDonorName(label);records.set(key,{id:'donor:'+key,label,kind:'donor',aliases:[...new Set([...(records.get(key)?.aliases || []),...aliases])]})}};
 const visit=x=>{if(!x || typeof x!=='object')return;
  if(x.d?.e && typeof x.d.n==='string' && typeof x.d.aec==='number')add(x.d.n,x.d.m!=='abn' && typeof x.d.on==='string'?[x.d.on]:[]);
  if(x.kind==='donor')add(x.label);
  for(const[k,v]of Object.entries(x)){
   if(k==='donors' && v && typeof v==='object' && !Array.isArray(v))for(const label of Object.keys(v))add(label);
   if(k==='top_donors' && Array.isArray(v))for(const row of v)add(row[0]);
   if(v && typeof v==='object')visit(v);
  }
 };visit(value);return [...records.values()];
}
let sourceRecords;
export function privacySourceDonorRecords(){
 if(sourceRecords)return sourceRecords;
 const paths=execFileSync('git',['ls-tree','-r','--name-only',PRIVACY_BASELINE,'--','portal/public/grants','portal/public/graph/grants.federal.json','portal/public/graph/grants.qld.json','portal/public/access.json','portal/public/reports'],{cwd:repo,maxBuffer:2*1024*1024}).toString().trim().split('\n').filter(p=>p.endsWith('.json'));
 return sourceRecords=paths.flatMap(p=>assetDonorRecords(JSON.parse(execFileSync('git',['show',`${PRIVACY_BASELINE}:${p}`],{cwd:repo,maxBuffer:20*1024*1024}).toString())));
}
const optionalSourceRecords=()=>{try{return privacySourceDonorRecords()}catch{return []}};
const hash=s=>createHash('sha256').update(s).digest('hex');
const phrase=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const registryPath=join(repo,'portal/src/donor-withheld.json');
export function publicationContext(graphs, officeHolders=[], prior={names:{},ids:{},phrases:[],organisations:[]}, records=[]) {
 const index=donorPrivacyIndex(graphs),numbers=new Map(),names={...prior.names},ids={...prior.ids},replacements=new Map();
 let next=Math.max(0,...Object.values(ids).map(v=>Number(v.id.split('-').at(-1))));
 const exempt=new Set(officeHolders.flatMap(name=>{const inverted=/^([^,]+),\s*([^,]+)$/.exec(name);return [foldDonorName(name),...(inverted?[foldDonorName(inverted[2]+' '+inverted[1])]:[])];}));
 const extra={nodes:[...optionalSourceRecords(),...records]};
 for(const g of [extra,...optionalSourceGraphs(),...graphs])for(const n of g.nodes || []) if(n.kind==='donor' && donorNameWithheld(index,n.label) && !/^donor:withheld-\d+$/.test(n.id)) {
  const key=hash(n.id);if(!ids[key] && g===extra && names[hash(foldDonorName(n.label))])ids[key]=names[hash(foldDonorName(n.label))];if(!ids[key])ids[key]={id:`donor:withheld-${++next}`,label:`Donor ${next} (name withheld)`};
  numbers.set(n.id,Number(ids[key].id.split('-').at(-1)));
  for(const label of [n.label,...n.aliases || []]) if(label){
   if(index.organisations.has(foldDonorName(label)) || isOrganisationDonor({label:label.toLowerCase()})){delete names[hash(foldDonorName(label))];continue;}
   names[hash(foldDonorName(label))]={...ids[key],exempt:exempt.has(foldDonorName(label))};if(!exempt.has(foldDonorName(label)) && /\S\s+\S/.test(label))replacements.set(label,ids[key].label)
  };
 }
 const phrases=new Map(prior.phrases.map(p=>[p.hash,p]));
 // A compact grant's matched organisation is metadata, not graph evidence for
 // its donor label. Query checks must use the same four-graph publication index.
 const metadataOrganisations=extra.nodes.flatMap(n=>n.aliases || []).filter(label=>isOrganisationDonor({label:label.toLowerCase()}));
 for(const label of metadataOrganisations)phrases.delete(hash(phrase(label)));
 const phraseExtra={nodes:extra.nodes.map(n=>({...n,aliases:(n.aliases || []).filter(label=>!isOrganisationDonor({label:label.toLowerCase()}))}))};
 for(const [p,longer]of withheldPhrases([phraseExtra,...optionalSourceGraphs(),...graphs],officeHolders,index).withheld)phrases.set(hash(p),{hash:hash(p),words:p.split(' ').length,first:hash(p.split(' ')[0]),longer:longer.map(hash)});
 const organisations=[...new Set([...prior.organisations,...metadataOrganisations.map(s=>hash(phrase(s))),...[extra,...optionalSourceGraphs(),...graphs].flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&!donorNameWithheld(index,n.label)).flatMap(n=>[n.label,...n.aliases||[]]).map(s=>hash(phrase(s))))])];
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=replacements.size?new RegExp(`(?<![a-z0-9])(?:${[...replacements.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|')})(?![a-z0-9])`,'gi'):null;
 const neutral=new Map([...replacements].map(([k,v])=>[foldDonorName(k),v]));
 return {index,numbers,replacements,pattern,neutral,registry:{names,ids,phrases:[...phrases.values()],organisations},hash};
}
export function sanitiseDonorAsset(value,context) {
 const {registry}=context;
 const donorLabel=label=>{
  if(/^Donor \d+ \(name withheld\)$/.test(label))return label;
  const key=hash(foldDonorName(label));
  const knownAlias=registry.names[key] && !context.index.organisations.has(foldDonorName(label)) && !isOrganisationDonor({label:label.toLowerCase()});
  if(!knownAlias && !donorNameWithheld(context.index,label))return label;if(!registry.names[key]){const n=1+Math.max(0,...Object.values(registry.ids).map(v=>Number(v.id.split('-').at(-1))));const entry={id:`donor:withheld-${n}`,label:`Donor ${n} (name withheld)`,exempt:false};registry.names[key]=entry;registry.ids[hash('donor:'+foldDonorName(label))]=entry;}return registry.names[key].label;
 };

 const string=(s,donor=false)=>{
  const id=registry.ids[hash(s)];if(id)return id.id;
  const name=registry.names[hash(foldDonorName(s))];if(name && (/[a-z]/i.test(s)) && (donor || !name.exempt) && !context.index.organisations.has(foldDonorName(s)) && (!isOrganisationDonor({label:s}) || donor && !isOrganisationDonor({label:s.toLowerCase()})))return name.label;
  // Profile URLs and query IDs must lose their embedded spelling too.
  let clean=s;
  if(context.pattern)clean=clean.replace(context.pattern,(match,at,text)=>{const tail=text.slice(at+match.length).split(/[;,.:\n]/)[0].trim().split(/\s+/).slice(0,4).join(' ');return isOrganisationDonor({label:match+' '+tail})?match:context.neutral.get(foldDonorName(match)) || match});
  if (/^(?:person|name):/.test(clean) && /Donor \d+ \(name withheld\)/i.test(clean)) clean=clean.toLowerCase();
  return clean.replace(/(\/subject\/donor\/)([^\s"<>?#]+)/g,(_,prefix,segment)=>{let label;try{label=decodeURIComponent(segment)}catch{return prefix+segment}const hidden=registry.names[hash(foldDonorName(label))];return hidden && !context.index.organisations.has(foldDonorName(label))?prefix+encodeURIComponent(hidden.label):prefix+segment});
 };
 const visit=(x,donor=false,identityKeys=false)=>{
  if(typeof x==='string')return string(x,donor);
  if(Array.isArray(x))return x.map(v=>visit(v,donor));
  if(!x || typeof x!=='object')return x;
  if(Array.isArray(x.nodes)&&Array.isArray(x.edges))return withholdIndividualDonors(x,context.index,context.numbers);
  const hidden=x.kind==='donor' && donorNameWithheld(context.index,x.label);
  if(x.kind==='donor' && !hidden)return x;
  const out={};for(const[k,v]of Object.entries(x)) {
   if(hidden&&k==='id'){donorLabel(x.label);out[k]=registry.names[hash(foldDonorName(x.label))].id;continue;}
   if(hidden&&k==='label'){out[k]=donorLabel(v);continue;}
   if(hidden&&k==='profileUrl')continue;
   if(hidden&&k==='aliases'){out[k]=[];continue;}
   if(k==='d' && v?.e && typeof v.n==='string' && typeof v.aec==='number'){out[k]={...visit(v,true),n:donorLabel(v.n)};continue;}
   if(k==='top_donors' && Array.isArray(v)){out[k]=v.map(row=>[donorLabel(row[0]),...row.slice(1)]);continue;}
   if(k==='donors' && v && typeof v==='object' && !Array.isArray(v)){out[k]=Object.fromEntries(Object.entries(v).map(([label,entry])=>[donorLabel(label),visit(entry)]));continue;}
   // Field names are schema, not identity. Only name-keyed dictionaries may
   // replace keys; native node/edge/access fields stay byte-for-byte named.
   const key=identityKeys || /^(?:donor|person|name):/.test(k)?string(k,donor):k;
   out[key]=visit(v,hidden || ['name','label','n'].includes(k) && /[a-z]/i.test(String(v)) && !registry.names[hash(foldDonorName(String(v)))]?.exempt || k==='donors' || k==='top_donors' || k==='donor' || k==='donor_label' || k==='aliases', ['names','by_name'].includes(k));
  }return out;
 };
 return visit(value);
}
export function readPublicationContext(root=join(repo,'portal/public'),graphs=MONEY_GRAPHS.map(p=>JSON.parse(readFileSync(join(root,p),'utf8'))),extraRecords=[]) {
 const roster=JSON.parse(readFileSync(join(root,'parliamentarians.json'),'utf8'));
 const access=JSON.parse(readFileSync(join(root,'access.json'),'utf8'));
 const votes=JSON.parse(readFileSync(join(root,'votes.json'),'utf8'));
 const expenses=JSON.parse(readFileSync(join(root,'expenses.json'),'utf8'));
 const personIds=new Set(roster.people.map(p=>String(p.pid)));
 const expenseNames=Object.entries(expenses.names||{}).filter(([,pid])=>personIds.has(String(pid))).map(([name])=>name);
 const prior=existsSync(registryPath)?JSON.parse(readFileSync(registryPath,'utf8')):undefined;
 const recordFiles=[];const collect=dir=>{if(!existsSync(dir))return;for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())collect(p);else if(p.endsWith('.json'))recordFiles.push(p)}};collect(join(root,'grants'));collect(join(root,'reports'));for(const j of ['federal','qld'])if(existsSync(join(root,'graph/grants.'+j+'.json')))recordFiles.push(join(root,'graph/grants.'+j+'.json'));
 const records=[...assetDonorRecords(access),...extraRecords,...recordFiles.flatMap(p=>assetDonorRecords(JSON.parse(readFileSync(p,'utf8'))))];
 return publicationContext(graphs,[...expenseNames,...roster.people.flatMap(p=>[p.name,p.full||'']),...Object.values(access.ministers||{}).map(m=>m.name),...Object.values(votes).map(v=>v?.name).filter(Boolean)],prior,records);
}
export function publishDonorAssets(root=join(repo,'portal/public'),rawRoot=root) {
 const graphs=MONEY_GRAPHS.map(p=>JSON.parse(readFileSync(join(rawRoot,p),'utf8'))),context=readPublicationContext(root,graphs);
 const counts=[];
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
 for(const path of walk(root).filter(p=>p.endsWith('.json')&&!p.endsWith('/votes.json'))) {
  const file=relative(root,path),g=MONEY_GRAPHS.indexOf('/'+file),before=g<0?JSON.parse(readFileSync(path,'utf8')):graphs[g];
  const after=sanitiseDonorAsset(g<0?before:withholdIndividualDonors(before,context.index,context.numbers),context);
  const old=JSON.stringify(before),text=JSON.stringify(after);if(old!==text || g>=0 && rawRoot!==root)writeFileSync(path,text+'\n');
  const found=new Set();let nodes=0;const visit=x=>{if(typeof x==='string'&&/^Donor \d+ \(name withheld\)$/.test(x))found.add(x);if(!x||typeof x!=='object')return;if(x.kind==='donor'&&/^donor:withheld-/.test(x.id))nodes++;for(const[k,v]of Object.entries(x)){visit(k);visit(v)}};visit(after);
  if(found.size||nodes)counts.push({file,withheld:nodes||found.size,nodes});
 }
 // An electorate release is content addressed. A privacy rewrite must select
 // a fresh URL and refresh its byte hashes so native cache validation stays true.
 const manifestPath=join(root,'electorates/manifest.json');
 if(existsSync(manifestPath)) {
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const current=join(root,'electorates/releases',manifest.release_id);
  const entries=Object.keys(manifest.files).map(file=>[file,hash(readFileSync(join(current,file)))]);
  if(entries.some(([file,digest])=>manifest.files[file]!==digest)) {
   const release=hash(JSON.stringify(entries)).slice(0,16);
   const next=join(root,'electorates/releases',release);mkdirSync(next,{recursive:true});cpSync(current,next,{recursive:true});
   const from='/electorates/releases/'+manifest.release_id+'/',to='/electorates/releases/'+release+'/';
   for(const file of Object.keys(manifest.files)) {
    const path=join(next,file);writeFileSync(path,readFileSync(path,'utf8').replaceAll(from,to));
    manifest.files[file]=hash(readFileSync(path));
   }
   manifest.release_id=release;
   for(const key of ['index_url','people_url','reference_url','crosswalk_url'])manifest[key]=manifest[key].replace(from,to);
   writeFileSync(manifestPath,JSON.stringify(manifest)+'\n');
  }
 }
 writeFileSync(registryPath,JSON.stringify(context.registry)+'\n');
 return counts;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 if(process.argv.includes('--stdin')) {const data=JSON.parse(readFileSync(0,'utf8'));const graphs=data.nodes&&data.edges?[...MONEY_GRAPHS.map(p=>JSON.parse(readFileSync(join(repo,'portal/public',p),'utf8'))),data]:null;const ctx=readPublicationContext(undefined,graphs || undefined,assetDonorRecords(data));const out=graphs?withholdIndividualDonors(data,ctx.index,ctx.numbers):data;process.stdout.write(JSON.stringify(sanitiseDonorAsset(out,ctx))+'\n');}
 else {const counts=publishDonorAssets(process.argv[2],process.argv[3]);console.log(JSON.stringify(counts));}
}
