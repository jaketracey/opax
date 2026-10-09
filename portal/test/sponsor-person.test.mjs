// A bill's sponsor link opens the roster person the bill names, never a surname
// print. public/sponsor-person.js serves the bill page (app.js) and the Worker's
// crawlable bill answers (src/seo-content.ts).
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {build} from 'esbuild';
const bundle=async(entry)=>{const b=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))};
import {sponsorPerson,sponsorKey,sponsorNamesAgree} from '../public/sponsor-person.js';
const {sponsorFor,renderBillAnswer}=await bundle('../src/seo-content.ts');
const {slugIndex}=await bundle('../src/person-slug.ts');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const roster=JSON.parse(await readFile(new URL('../public/parliamentarians.json',import.meta.url),'utf8')).people;
// The app's pinned roster (8f1305e3): Mehreen Faruqi's full-name row had no pid and only the surname
// print "Faruqi" (committee transcripts) held 10912; the curly O'Connor twin had no pid.
const pinned=roster.map((p)=>p.name==='Mehreen Faruqi'||p.name==='Brendan O’Connor'?(({pid,...rest})=>rest)(p):p);
const at=(name,pid,people=roster)=>sponsorPerson(name,pid,people)?.name??null;

test('the register print is read as a name',()=>{
 for(const [print,key] of [['FARUQI, Sen Mehreen','mehreen faruqi'],['KATTER, Bob, Jnr, MP','bob katter'],['Bob Jnr Katter','bob katter'],
  ['the Hon. Tony Abbott MP','tony abbott'],['Brendan O’Connor','brendan oconnor'],['Sarah Hanson-Young','sarah hanson young'],
  ['  ANDREW   WILKIE ','andrew wilkie'],['Zoë Daniel','zoe daniel'],['A.J. Stoker','aj stoker']])
  assert.equal(sponsorKey(print),key,print);
 assert.equal(sponsorNamesAgree('Chris Back','Christopher Back'),true);
 assert.equal(sponsorNamesAgree('Rex Patrick','Patrick Conaghan'),false);
 assert.equal(sponsorNamesAgree('Wilkie','Andrew Wilkie'),false);
});

test('one case per cause: the person, or plain text',()=>{
 for(const [cause,print,pid,expected,people] of [
  ['stub holds the pid (pin)','Mehreen Faruqi','10912','Mehreen Faruqi',pinned],
  ['current shape','Mehreen Faruqi','10912','Mehreen Faruqi'],
  ['register print','FARUQI, Sen Mehreen','10912','Mehreen Faruqi'],
  ['surname print','Faruqi',null,null],
  ['surname print with its pid','Faruqi','10912',null],
  ['hyphenated print','Hanson-Young','10711',null],
  ['portfolio print','KATTER, Bob, Jnr, MP',null,'Bob Katter'],
  ['Jnr in the given names','Bob Jnr Katter','10352','Bob Katter'],
  ['hyphenated','Sarah Hanson-Young','10711','Sarah Hanson-Young'],
  ['hyphen as a space','Sarah Hanson Young','10711','Sarah Hanson-Young'],
  ['short first name','Chris Back','10722','Christopher Back'],
  ['short first name, no pid','Chris Back',null,null],
  ['middle name','Andrew Damien Wilkie','10727','Andrew Wilkie'],
  ['middle name, no pid','Andrew Damien Wilkie',null,null],
  ['curly twin with the pid (pin)','Brendan O’Connor','10496',"Brendan O'Connor",pinned],
  ['twins, no pid (pin)','Brendan O’Connor',null,null,pinned],
  ['upper case','ANDREW WILKIE','10727','Andrew Wilkie'],
  ["another member's pid",'Andrew Wilkie','10001',null],
  ['former senator with no profile','David Leyonhjelm','10832',null],
  ['an office','Minister for Finance',null,null],
 ])assert.equal(at(print,pid,people),expected,`${cause}: ${print}`);
});

test('two people with one name stay plain text; a pid-less namesake does not',()=>{
 const sam=(pid)=>({name:'Sam Example',pid,speeches:1});
 assert.equal(at('Sam Example',null,[sam('1'),sam('2')]),null);
 assert.equal(at('Sam Example','1',[sam('1'),sam('2')]),null);
 assert.equal(at('Sam Example','1',[sam('1'),sam(undefined)]),'Sam Example');
 assert.equal(at('Sam Example',null,[sam('1'),sam(undefined)]),null);
 // A surname print vouches only for its own recorded full name.
 assert.equal(at('Ali Faruqi','10912',[...pinned,{name:'Ali Faruqi'}]),null);
});

test('the bill page loads the shared resolver and marks every sponsor link',()=>{
 assert.match(app,/import\("\/sponsor-person\.js\?v=[A-Za-z0-9._-]+"\)/);
 assert.equal((app.match(/<a data-sponsor="/g)||[]).length,2,'the sole sponsor and each portfolio member');
 assert.match(app,/linkBillSponsors\(body, bill\);/);
});

test('no sponsor on any bill opens a surname print',async()=>{
 const dir=new URL('../public/bills/',import.meta.url);
 let linked=0;
 for(const file of (await readdir(dir)).filter((f)=>f.endsWith('.json')&&f!=='index.json')){
  const b=JSON.parse(await readFile(new URL(file,dir),'utf8'));
  if(!b.sponsor)continue;
  for(const people of [roster,pinned]){
   const worker=sponsorPerson(b.sponsor,b.sponsor_person_id,people);
   if(!worker)continue;
   assert.ok(worker.name.includes(' '),`${b.key} opens the surname print ${worker.name}`);
   if(people===roster)linked++;
  }
 }
 assert.ok(linked>=630,`${linked} sponsors linked`);
});

test("the SEO bill page names Faruqi's full-name row, not the committee print",async()=>{
 const b=JSON.parse(await readFile(new URL('../public/bills/au-federal-s1479.json',import.meta.url),'utf8'));
 assert.equal(b.sponsor_person_id,'10912');
 assert.equal(roster.find((p)=>p.pid==='10912').name,'Faruqi','the first row holding 10912 is the print');
 assert.equal(sponsorFor(b,roster)?.name,'Mehreen Faruqi');
 assert.equal(sponsorFor(b,pinned)?.name,'Mehreen Faruqi');
 assert.equal(sponsorFor({...b,sponsor:null},roster),null);
 for(const people of [roster,pinned]) {
  const html=renderBillAnswer(b,people,slugIndex(people).slugOf).html;
  assert.match(html,/<dt>Sponsor<\/dt><dd><a href="\/subject\/person\/mehreen-faruqi">Mehreen Faruqi<\/a><\/dd>/);
  assert.doesNotMatch(html,/<dt>Sponsor<\/dt><dd><a href="\/subject\/person\/faruqi">/);
 }
});
