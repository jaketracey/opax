// The publication boundary. Raw desktop exports are read only; hashes retain
// the withheld identity checks after public graphs have lost their labels.
import {createHash} from 'node:crypto';
import {normaliseLookupKey} from '../portal/src/lookup-casefold.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MONEY_GRAPHS,donorPrivacyIndex,donorNameWithheld,foldDonorName,withholdIndividualDonors,isOrganisationDonor,withheldPhrases} from '../portal/public/donor-entity.js';
import {withholdDonorText,recordReferenceField,nameLookupField,rebuildResponseLookups,anonymousLookupEntity,containsWithheldLookupPhrase} from '../portal/src/donor-sanitise.mjs';
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
// Batch immutable Git blobs in memory: no raw fixture files and no per-file
// process flood during publication or the independent regression checks.
export function* privacyBaselineFiles(paths) {
 for(let at=0;at<paths.length;at+=128){const batch=paths.slice(at,at+128);
  const bytes=execFileSync('git',['cat-file','--batch'],{cwd:repo,input:batch.map(p=>`${PRIVACY_BASELINE}:${p}`).join('\n')+'\n',maxBuffer:256*1024*1024});
  let offset=0;
  for(const path of batch){const end=bytes.indexOf(10,offset),header=bytes.subarray(offset,end).toString();const match=/^[a-f0-9]+ blob (\d+)$/.exec(header);
   if(!match)throw Error('Pinned privacy export unavailable');const size=Number(match[1]);offset=end+1;yield [path,bytes.subarray(offset,offset+size)];offset+=size+1;
  }
 }
}
let sourceRecords;
export function privacySourceDonorRecords(){
 if(sourceRecords)return sourceRecords;
 const paths=execFileSync('git',['ls-tree','--full-tree','-r','--name-only',PRIVACY_BASELINE,'--','portal/public/grants','portal/public/graph/grants.federal.json','portal/public/graph/grants.qld.json','portal/public/access.json','portal/public/reports'],{cwd:repo,maxBuffer:2*1024*1024}).toString().trim().split('\n').filter(p=>p.endsWith('.json'));
 return sourceRecords=[...privacyBaselineFiles(paths)].flatMap(([,bytes])=>assetDonorRecords(JSON.parse(bytes.toString())));
}
const optionalSourceRecords=()=>{try{return privacySourceDonorRecords()}catch{return []}};
const hash=s=>createHash('sha256').update(s).digest('hex');
const phrase=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const registryPath=join(repo,'portal/src/donor-withheld.json');
export function publicationContext(graphs, officeHolders=[], prior={names:{},ids:{},phrases:[],organisations:[]}, records=[]) {
 const index=donorPrivacyIndex(graphs),numbers=new Map(),names={},ids={...prior.ids},replacements=new Map();
 let next=Math.max(0,...Object.values(ids).map(v=>Number(v.id.split('-').at(-1))));
 const exempt=new Set(officeHolders.flatMap(name=>{const inverted=/^([^,]+),\s*([^,]+)$/.exec(name);return [foldDonorName(name),...(inverted?[foldDonorName(inverted[2]+' '+inverted[1])]:[])];}));
 const extra={nodes:[...optionalSourceRecords(),...records]};
 for(const g of [extra,...optionalSourceGraphs(),...graphs])for(const n of g.nodes || []) if(n.kind==='donor' && donorNameWithheld(index,n.label) && !/^donor:withheld-\d+$/.test(n.id)) {
  const key=hash(n.id);if(!ids[key] && g===extra && prior.names[hash(foldDonorName(n.label))])ids[key]=prior.names[hash(foldDonorName(n.label))];if(!ids[key])ids[key]={id:`donor:withheld-${++next}`,label:`Donor ${next} (name withheld)`};
  numbers.set(n.id,Number(ids[key].id.split('-').at(-1)));
  for(const label of [n.label,...n.aliases || []]) if(label){
   if(index.organisations.has(foldDonorName(label)) || isOrganisationDonor({label:label.toLowerCase()})){delete names[hash(foldDonorName(label))];continue;}
   names[hash(foldDonorName(label))]={...ids[key],sourceKnown:true,exempt:exempt.has(foldDonorName(label))};if(!exempt.has(foldDonorName(label)) && /\S\s+\S/.test(label))replacements.set(label,ids[key].label)
  };
 }
 const phrases=new Map();
 const phraseLabels=new Map();
 for(const g of [extra,...optionalSourceGraphs(),...graphs])for(const n of g.nodes || [])if(n.kind==='donor'&&donorNameWithheld(index,n.label))for(const label of [n.label,...n.aliases || []]){
  const entry=names[hash(foldDonorName(label))];if(!entry||entry.exempt)continue;
  phraseLabels.set(phrase(label),entry.label);const inverted=/^([^,]+),\s*([^,]+)$/.exec(label);if(inverted)phraseLabels.set(phrase(inverted[2]+' '+inverted[1]),entry.label);
 }
 // A compact grant's matched organisation is metadata, not graph evidence for
 // its donor label. Query checks must use the same four-graph publication index.
 const metadataOrganisations=extra.nodes.flatMap(n=>n.aliases || []).filter(label=>isOrganisationDonor({label:label.toLowerCase()}));
 for(const label of metadataOrganisations)phrases.delete(hash(phrase(label)));
 const phraseExtra={nodes:extra.nodes.map(n=>({...n,aliases:(n.aliases || []).filter(label=>!isOrganisationDonor({label:label.toLowerCase()}))}))};
 for(const [p,longer]of withheldPhrases([phraseExtra,...optionalSourceGraphs(),...graphs],officeHolders,index).withheld)phrases.set(hash(p),{hash:hash(p),words:p.split(' ').length,first:hash(p.split(' ')[0]),longer:longer.map(hash),...(phraseLabels.has(p)?{replacement:phraseLabels.get(p)}:{})});
 const lookupPhrases=new Map();
 for(const g of [extra,...optionalSourceGraphs(),...graphs])for(const n of g.nodes||[])if(n.kind==='donor'&&donorNameWithheld(index,n.label))for(const label of [n.label,...n.aliases||[]]){
  const entry=names[hash(foldDonorName(label))];if(!entry||entry.exempt||entry.sourceKnown===false)continue;
  const normal=normaliseLookupKey(label);if(normal.length>=4)lookupPhrases.set(hash(normal),{hash:hash(normal),length:normal.length});
 }
 const organisationValues=[...metadataOrganisations,...[extra,...optionalSourceGraphs(),...graphs].flatMap(g=>g.nodes.filter(n=>n.kind==='donor'&&!donorNameWithheld(index,n.label)).flatMap(n=>[n.label,n.id,...n.aliases||[],n.profileUrl,`/subject/donor/${encodeURIComponent(n.label)}`].filter(Boolean)))];
 const organisations=[...new Set(organisationValues.map(s=>hash(phrase(s))))];
 const organisationPhrases=[...new Set(organisationValues.map(phrase))].filter(Boolean).map(p=>({hash:hash(p),words:p.split(' ').length,first:hash(p.split(' ')[0])}));
 return {index,numbers,registry:{names,ids,phrases:[...phrases.values()],organisations,organisationPhrases,lookupPhrases:[...lookupPhrases.values()]},hash};
}
export function sanitiseDonorAsset(value,context) {
 const {registry}=context;
 const donorLabel=label=>{
  if(/^Donor \d+ \(name withheld\)$/.test(label))return label;
  const key=hash(foldDonorName(label));
  const knownAlias=registry.names[key]?.sourceKnown!==false && registry.names[key] && !context.index.organisations.has(foldDonorName(label)) && !isOrganisationDonor({label:label.toLowerCase()});
  if(!knownAlias && !donorNameWithheld(context.index,label))return label;if(!registry.names[key]){const n=1+Math.max(0,...Object.values(registry.ids).map(v=>Number(v.id.split('-').at(-1))));const entry={id:`donor:withheld-${n}`,label:`Donor ${n} (name withheld)`,sourceKnown:false,exempt:false};registry.names[key]=entry;registry.ids[hash('donor:'+foldDonorName(label))]=entry;}return registry.names[key].label;
 };

 const string=(s,donor=false)=>{
  let clean=withholdDonorText(s,registry,donor);
  if (/^(?:person|name):/.test(clean) && /Donor \d+ \(name withheld\)/i.test(clean)) clean=clean.toLowerCase();
  return clean.replace(/(\/subject\/donor\/)([^\s"<>?#]+)/g,(_,prefix,segment)=>{let label;try{label=decodeURIComponent(segment)}catch{return prefix+segment}const hidden=registry.names[hash(foldDonorName(label))];return hidden && !context.index.organisations.has(foldDonorName(label))?prefix+encodeURIComponent(hidden.label):prefix+segment});
 };
 const visit=(x,donor=false,identityKeys=false,reference=false)=>{
  if(typeof x==='string')return reference&&!donor&&!/^donor:/.test(x)&&!x.includes('/subject/donor/')?x:string(x,donor);
  if(Array.isArray(x)){if(typeof x[0]==='string'&&/(?:^|:)(?:grant(?:-|:)|grant-program|grant-recipient)/.test(x[0]))return grants(x);return x.map(v=>visit(v,donor,identityKeys,reference));}
  if(!x || typeof x!=='object')return x;
  if(Array.isArray(x.nodes)&&Array.isArray(x.edges))return withholdIndividualDonors(x,context.index,context.numbers);
  if(x.kind==='grant'&&typeof x.href==='string'&&typeof x.resource==='string'&&!x.subject)return grants(x);
  const hidden=x.kind==='donor' && donorNameWithheld(context.index,x.label);
  if(x.kind==='donor' && !hidden)return x;
  const out={};for(const[k,v]of Object.entries(x)) {
   if(hidden&&k==='id'){donorLabel(x.label);out[k]=/^donor:withheld-/.test(v)?v:registry.names[hash(foldDonorName(x.label))].id;continue;}
   if(hidden&&k==='label'){out[k]=donorLabel(v);continue;}
   if(hidden&&k==='profileUrl')continue;
   if(hidden&&k==='aliases'){out[k]=[];continue;}
   if(['recipient','rn','rid','recipientId','recipient_id','recipient_label'].includes(k)){out[k]=v;continue;}
   if(/^\/money\/grants\//.test(k)||/(?:^|:)(?:grant(?:-|:)|grant-program|grant-recipient)/.test(k)){out[k]=grants(v);continue;}
   if(k==='grants'){out[k]=grants(v);continue;}
   if(k==='d' && v?.e && typeof v.n==='string' && typeof v.aec==='number'){out[k]=compactDonor(v);continue;}
   if(k==='top_donors' && Array.isArray(v)){out[k]=v.map(row=>[donorLabel(row[0]),...row.slice(1)]);continue;}
   if(k==='donors' && v && typeof v==='object' && !Array.isArray(v)){out[k]=Object.fromEntries(Object.entries(v).map(([label,entry])=>[donorLabel(label),visit(entry)]));continue;}
   if(nameLookupField(k)&&v&&typeof v==='object'&&!Array.isArray(v)){out[k]=Object.fromEntries(Object.entries(v).map(([label,row])=>[label,typeof row==='string'?row:visit(row)]));continue;}
   // Field names are schema, not identity. Only name-keyed dictionaries may
   // replace keys; native node/edge/access fields stay byte-for-byte named.
   const key=identityKeys || /^donor:/.test(k)?string(k,donor):k;
   out[key]=visit(v,donor || hidden || ['name','label','n'].includes(k) && /[a-z]/i.test(String(v)) && !registry.names[hash(foldDonorName(String(v)))]?.exempt || k==='donors' || k==='top_donors' || k==='donor' || k==='donor_label' || k==='donor_links' || k==='aliases',false,recordReferenceField(k));
  }
  return out;
 };
 const compactDonor=v=>{
  const label=donorLabel(v.n),hidden=/^Donor \d+ \(name withheld\)$/.test(label);
  if(!hidden)return v;
  const entry=registry.names[hash(foldDonorName(v.n))] || Object.values(registry.ids).find(e=>e.label===label);
  const out={...v,n:label,e:entry?.id || `donor:withheld-${/^Donor (\d+)/.exec(label)[1]}`};
  for(const key of ['on','abn','acn','arbn','tfn','profileUrl','url','aliases','alias','identifier'])if(Object.hasOwn(out,key))out[key]=Array.isArray(out[key])?[]:out[key]===null?null:typeof out[key]==='string'?'':null;
  return out;
 };
 // Grant recipient identity follows the grants' own privacy policy. Only compact
 // donor metadata belongs to this boundary; references and shard keys stay intact.
 const grants=x=>{if(!x||typeof x!=='object')return x;if(Array.isArray(x))return x.map(grants);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='d'&&v?.e&&typeof v.n==='string'&&typeof v.aec==='number'?compactDonor(v):grants(v)]))};
 if(value?.index?.recipients || value?.recipients&&value?.programs&&value?.agencies)return grants(value);
 return rebuildResponseLookups(visit(value),registry,context.entities);
}
export function sanitiseGrantDonors(value,context){
 return sanitiseDonorAsset({index:{recipients:[]},data:value},context).data;
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
 const context=publicationContext(graphs,[...expenseNames,...roster.people.flatMap(p=>[p.name,p.full||'']),...Object.values(access.ministers||{}).map(m=>m.name),...Object.values(votes).map(v=>v?.name).filter(Boolean)],prior,records);
 // The tax name index joins public donor identities to records in other files.
 // Resolve those joins from the same sanitised graph/access catalog.
 context.entities=new Map(graphs.flatMap(g=>g.nodes||[]).filter(n=>n.kind==='donor'&&!donorNameWithheld(context.index,n.label)).map(n=>[n.id,n]));const taxPath=join(root,'entities/tax-charity/names.json');
 if(existsSync(taxPath)){const names=JSON.parse(readFileSync(taxPath,'utf8')).by_name||{},normal=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const donors=graphs.flatMap(g=>g.nodes||[]).filter(n=>n.kind==='donor'&&!donorNameWithheld(context.index,n.label));
  donors.push(...Object.keys(access.donors||{}).filter(label=>!donorNameWithheld(context.index,label)).map(label=>({label,aliases:[]})));
  for(const donor of donors){const labels=[donor.label,...donor.aliases||[]].map(normal),id=labels.map(label=>names[label]).find(Boolean);if(id){const prior=context.entities.get(String(id));context.entities.set(String(id),{id:String(id),kind:'donor',label:labels[0],aliases:[...new Set([...labels.slice(1),...(prior?[prior.label,...prior.aliases]:[])])]});}}
 }
 return context;
}
export function rebuildTaxNameLookup(root,graphs,registry) {
 const path=join(root,'entities/tax-charity/names.json');if(!existsSync(path))return;
 const data=JSON.parse(readFileSync(path,'utf8')),byName={};
 const key=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const publicDonors=graphs.flatMap(g=>g.nodes||[]).filter(n=>n.kind==='donor'&&!anonymousLookupEntity(n));
 const accessPath=join(root,'access.json');if(existsSync(accessPath))for(const label of Object.keys(JSON.parse(readFileSync(accessPath,'utf8')).donors||{}))if(!/^Donor \d+ \(name withheld\)$/.test(label))publicDonors.push({label,aliases:[]});
 for(const donor of publicDonors){const labels=[donor.label,...donor.aliases||[]],id=labels.map(label=>data.by_name?.[key(label)]).find(Boolean);if(!id)continue;for(const label of labels)if(!containsWithheldLookupPhrase(key(label),registry))byName[key(label)]=id;}
 const sorted=Object.fromEntries(Object.entries(byName).sort(([a],[b])=>a<b?-1:a>b?1:0));const text=JSON.stringify({...data,by_name:sorted})+'\n';if(JSON.stringify(data.by_name)!==JSON.stringify(sorted))writeFileSync(path,text);
}
export function rebuildEvidenceLookups(root,registry,sourceLookups) {
 const dir=join(root,'evidence'),lookup=join(dir,'lookup');if(!existsSync(lookup))return;
 const files=readdirSync(lookup).filter(p=>p.endsWith('.json')),shards=new Map(files.map(p=>[p,{}])),entities=new Map();
 const key=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 // Alias metadata belongs to a complete, sanitised entity catalog in memory.
 // Do not add fields to the native wire records. Anonymous entities never
 // receive source aliases, including aliases whose spelling is unregistered.
 for(const file of readdirSync(dir).filter(p=>/^[a-f0-9]{2}\.json$/.test(p))){
  const data=JSON.parse(readFileSync(join(dir,file),'utf8'));
  for(const entity of Object.values(data.entries||{}))entities.set(entity.id,{...entity,aliases:new Set(anonymousLookupEntity(entity)?[]:entity.aliases||[])});
 }
 const sources=sourceLookups||files.map(file=>JSON.parse(readFileSync(join(lookup,file),'utf8')));
 for(const source of sources)for(const[alias,ids]of Object.entries(source))for(const id of Array.isArray(ids)?ids:[]){
  const entity=entities.get(id);if(!entity||anonymousLookupEntity(entity))continue;
  if(withholdDonorText(alias,registry)!==alias||containsWithheldLookupPhrase(alias,registry))continue;
  entity.aliases.add(alias);
 }
 const add=(label,id)=>{if(!label||containsWithheldLookupPhrase(label,registry))return;const shard=hash(label).slice(0,2)+'.json';if(!shards.has(shard))shards.set(shard,{});const rows=shards.get(shard);rows[label]=[...new Set([...(rows[label]||[]),id])].sort();};
 // Emission reads only public labels and aliases from the sanitised entities.
 for(const entity of entities.values()){
  if(anonymousLookupEntity(entity))continue;
  for(const label of [entity.label||entity.name,...entity.aliases])add(key(label),entity.id);
  if(entity.abn)add('abn:'+entity.abn,entity.id);
 }
 for(const[file,rows]of shards){const path=join(lookup,file),text=JSON.stringify(rows)+'\n';if(!existsSync(path)||JSON.stringify(JSON.parse(readFileSync(path,'utf8')))!==JSON.stringify(rows))writeFileSync(path,text);}
}

export function publishDonorAssets(root=join(repo,'portal/public'),rawRoot=root) {
 const graphs=MONEY_GRAPHS.map(p=>JSON.parse(readFileSync(join(rawRoot,p),'utf8'))),context=readPublicationContext(root,graphs);
 const counts=[];
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
 for(const path of walk(root).filter(p=>p.endsWith('.json')&&!p.endsWith('/votes.json')&&!p.startsWith(join(root,'electorates')+'/'))) {
  const file=relative(root,path),g=MONEY_GRAPHS.indexOf('/'+file),before=g<0?JSON.parse(readFileSync(path,'utf8')):graphs[g];
  const grantFile=file.startsWith('grants/') || /^graph\/grants\./.test(file) || file==='social/grants-largest.json';
  const after=grantFile?sanitiseGrantDonors(before,context):sanitiseDonorAsset(g<0?before:withholdIndividualDonors(before,context.index,context.numbers),context);
  const old=JSON.stringify(before),text=JSON.stringify(after);if(old!==text || g>=0 && rawRoot!==root)writeFileSync(path,text+'\n');
  const found=new Set();let nodes=0;const visit=x=>{if(typeof x==='string'&&/^Donor \d+ \(name withheld\)$/.test(x))found.add(x);if(!x||typeof x!=='object')return;if(x.kind==='donor'&&/^donor:withheld-/.test(x.id))nodes++;for(const[k,v]of Object.entries(x)){visit(k);visit(v)}};visit(after);
  if(found.size||nodes)counts.push({file,withheld:nodes||found.size,nodes});
 }
 rebuildEvidenceLookups(root,context.registry);
 rebuildTaxNameLookup(root,MONEY_GRAPHS.map(p=>JSON.parse(readFileSync(join(root,p),'utf8'))),context.registry);
 // Candidate/representative records are outside donor withholding. Keep each
 // electorate release's bytes, IDs, paths and manifest hashes untouched.
 writeFileSync(registryPath,JSON.stringify(context.registry)+'\n');
 return counts;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 if(process.argv.includes('--stdin')) {const data=JSON.parse(readFileSync(0,'utf8'));const graphs=data.nodes&&data.edges?[...MONEY_GRAPHS.map(p=>JSON.parse(readFileSync(join(repo,'portal/public',p),'utf8'))),data]:null;const ctx=readPublicationContext(undefined,graphs || undefined,assetDonorRecords(data));const out=graphs?withholdIndividualDonors(data,ctx.index,ctx.numbers):data;const f=process.argv[process.argv.indexOf('--file')+1] || '';const safe=f.startsWith('portal/public/electorates/')?data:/^portal\/public\/(?:grants\/|graph\/grants\.|social\/grants-largest\.json)/.test(f)?sanitiseGrantDonors(out,ctx):sanitiseDonorAsset(out,ctx);process.stdout.write(JSON.stringify(safe)+'\n');}
 else {const counts=publishDonorAssets(process.argv[2],process.argv[3]);console.log(JSON.stringify(counts));}
}
