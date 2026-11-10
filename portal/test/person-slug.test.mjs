import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('../src/person-slug.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {personSlug,slugIndex,personIndex,fullNameMatches}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const source=/\nfunction personSlug\(name\) \{[\s\S]*?\n\}\n/.exec(app)?.[0];
const clientSlug=new Function(`${source}; return personSlug`)();
const roster=JSON.parse(await readFile(new URL('../public/parliamentarians.json',import.meta.url),'utf8')).people;

test('a name becomes a lowercase hyphenated address',()=>{
 for(const [name,slug] of [['Tony Abbott','tony-abbott'],["Matt O'Sullivan",'matt-osullivan'],['Matt O’Sullivan','matt-osullivan'],
  ['Jacinta Nampijinpa Price','jacinta-nampijinpa-price'],['Steph Hodgins-May','steph-hodgins-may'],['A.J. Stoker','aj-stoker'],
  ['  Penny   Wong ','penny-wong'],['Zoë Müller','zoe-muller'],['Albanese','albanese'],['',''],['…','']])assert.equal(personSlug(name),slug,name);
});

test('app.js writes the same slug the Worker reads, for every name in the roster',()=>{
 assert.ok(source,'app.js still carries personSlug()');
 for(const p of roster)assert.equal(clientSlug(p.name),personSlug(p.name),p.name);
});

test('one slug, one person: the fuller entry keeps it and the twin gets a distinct slug',()=>{
 const people=[{name:'Aj Stoker',speeches:27},{name:'A.J. Stoker',speeches:3},{name:'Tony Abbott',speeches:5878},{name:'…',speeches:1}];
 const {bySlug,slugOf}=slugIndex(people);
 assert.equal(bySlug.get('aj-stoker').name,'Aj Stoker');assert.equal(slugOf.get('Aj Stoker'),'aj-stoker');
 assert.match(slugOf.get('A.J. Stoker'),/^aj-stoker-[a-f0-9]+$/);assert.equal(slugOf.has('…'),false);
 const live=slugIndex(roster);
 assert.equal(live.bySlug.get('tony-abbott')?.name,'Tony Abbott');
 // Nearly everyone has a slug of their own; the few twins are spellings of one person.
 assert.ok(live.slugOf.size>=roster.length-25,`${roster.length-live.slugOf.size} people without a slug`);
 for(const [slug,p] of live.bySlug)assert.match(slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/,p.name);
});

test('a surname row is addressable by its own full name, only where the name is free (search-hubs-006, registers-003)',()=>{
 const people=[
  {name:'Crisafulli',full:'David Crisafulli',states:['qld'],speeches:295},
  {name:'Nicholls',full:'Tim Nicholls',states:['qld','federal'],speeches:440},
  // The full name is another row's printed name: that row keeps it.
  {name:'Thorpe',full:'Lidia Thorpe',states:['federal'],speeches:10},{name:'Lidia Thorpe',states:['federal'],speeches:900},
  // Two rows claim one full name: neither gets it.
  {name:'Smith',full:'Alex Smith',states:['nsw'],speeches:5},{name:'A. Smith',full:'Alex Smith',states:['vic'],speeches:4},
 ];
 const idx=personIndex(people);
 assert.equal(idx.addresses.get('david crisafulli')?.name,'Crisafulli');
 assert.equal(idx.addresses.get('tim nicholls')?.name,'Nicholls');
 assert.equal(idx.addresses.get('lidia thorpe')?.name,'Lidia Thorpe');
 assert.equal(idx.addresses.get('alex smith'),undefined);
 // The speech identity is unchanged: a speaker filter never reads a full-name alias.
 assert.equal(idx.byFold.get('david crisafulli'),undefined);
 // A register that knows its parliament uses the alias only inside it.
 assert.equal(fullNameMatches(idx,'David Crisafulli','qld'),true);
 assert.equal(fullNameMatches(idx,'David Crisafulli','nsw'),false);
 assert.equal(fullNameMatches(idx,'Tim Nicholls','QLD'),true);
 assert.equal(fullNameMatches(idx,'Lidia Thorpe','qld'),true,'a printed name is not an alias, so no check applies');
});

test('the published roster: every QLD minister the diary names in full and the roster holds under the surname is addressable',()=>{
 const idx=personIndex(roster);
 for(const name of ['David Crisafulli','Jarrod Bleijie','Ann Leahy','Tim Nicholls','Fiona Simpson'])
  assert.ok(idx.addresses.has(name.toLowerCase())||idx.byFold.has(name.toLowerCase()),name);
 // No full-name alias overrides a name or print the roster already resolves.
 for(const [key,p] of idx.byFold)assert.equal(idx.addresses.get(key),p,key);
});
