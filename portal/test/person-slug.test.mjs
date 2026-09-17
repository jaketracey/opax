import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('../src/person-slug.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {personSlug,slugIndex}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
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

test('one slug, one person: the fuller entry keeps it and the twin keeps its name',()=>{
 const people=[{name:'Aj Stoker',speeches:27},{name:'A.J. Stoker',speeches:3},{name:'Tony Abbott',speeches:5878},{name:'…',speeches:1}];
 const {bySlug,slugOf}=slugIndex(people);
 assert.equal(bySlug.get('aj-stoker').name,'Aj Stoker');assert.equal(slugOf.get('Aj Stoker'),'aj-stoker');
 assert.equal(slugOf.has('A.J. Stoker'),false);assert.equal(slugOf.has('…'),false);
 const live=slugIndex(roster);
 assert.equal(live.bySlug.get('tony-abbott')?.name,'Tony Abbott');
 // Nearly everyone has a slug of their own; the few twins are spellings of one person.
 assert.ok(live.slugOf.size>=roster.length-25,`${roster.length-live.slugOf.size} people without a slug`);
 for(const [slug,p] of live.bySlug)assert.match(slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/,p.name);
});
