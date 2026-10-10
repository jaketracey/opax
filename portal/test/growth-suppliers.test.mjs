import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {publishedSupplierIndex,publishedAgencySuppliers,agencySuppliers,supplierRecordsHTML,supplierDonations} from '../public/supplier-growth.js';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {growthSummaryPath,normalisedName} from '../public/growth-modules.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const json=path=>JSON.parse(read(path));
const directory=json('suppliers.json');
const published=publishedSupplierIndex(directory.suppliers);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('agency supplier eligibility comes from published supplier pages, with canonical names and no donor fields',()=>{
 const entries=[{id:'published',name:'Alex Example',profile_path:'/suppliers/01.json'},
  {id:'no-profile',name:'Without a profile'},{id:'blank-name',name:' ',profile_path:'/suppliers/01.json'}];
 const authority=publishedSupplierIndex(entries);
 const agency={name:'Agency',id:'agency',suppliers:[
  ...Array.from({length:6},(_,i)=>({id:'unpublished-'+i,name:'Unpublished person '+i,total:1000-i})),
  {id:'no-profile',name:'Without a profile',total:500},
  {id:'published',name:'Unpublished alias',total:100,donor_links:[{url:'/subject/donor/Private'}],flows:[{party:'Private Party',total:1}]},
 ]};
 assert.equal(isOrganisationDonor({label:entries[0].name}),false);
 assert.deepEqual(publishedAgencySuppliers(agency,authority),[{id:'published',name:'Alex Example',total:100}]);
 assert.deepEqual(agencySuppliers(agency,'current',authority),[{id:'published',name:'Alex Example',total:100}]);
 const html=supplierRecordsHTML(agency,'current','2026-10-10',authority);
 assert.match(html,/href="\/subject\/supplier\/published">Alex Example<\/a>/);
 assert.doesNotMatch(html,/Unpublished|Without a profile|Private|subject\/donor|party\//);
 assert.equal(supplierRecordsHTML(agency,'current','2026-10-10'),'');
 assert.equal(supplierRecordsHTML(agency,'published','2026-10-10',authority),'');
});

test('every agency module supplier has a published page in the supplier sitemap, using its canonical name',async()=>{
 const sitemap=new Set(readdirSync(new URL('../public/crawl/sitemaps/',import.meta.url))
  .filter(f=>/^suppliers-\d+\.xml$/.test(f)).flatMap(f=>[...read('crawl/sitemaps/'+f).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]).pathname)));
 assert.equal(sitemap.size,published.size);
 let rendered=0,rows=0;
 for(const entry of json('agencies.json').agencies){
  const source=json(entry.profile_path.replace(/^\//,''));
  const summary=json((await growthSummaryPath('agencies',normalisedName(source.name))).replace(/^\//,''));
  const expected=publishedAgencySuppliers(source,published).sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,6);
  assert.deepEqual(summary.agency.suppliers,expected,'publication filter must precede the summary ranking');
  for(const row of summary.agency.suppliers){
   const canonical=published.get(row.id);
   assert.ok(canonical);assert.equal(row.name,canonical.name);
   assert.ok(sitemap.has('/subject/supplier/'+encodeURIComponent(row.id)));
   rows++;
  }
  const html=supplierRecordsHTML(summary.agency,'current',summary.contracts_updated,published);
  for(const match of html.matchAll(/<a href="(\/subject\/supplier\/[^" ]+)">([^<]+)<\/a>/g)){
   assert.ok(sitemap.has(match[1]),'module target must be a published sitemap URL');
   const record=published.get(decodeURIComponent(match[1].split('/').at(-1)));
   assert.equal(match[2],escape(record.name));rendered++;
  }
 }
 assert.ok(rows>800);assert.ok(rendered>700);
});

test('published suppliers rejected by the donor classifier never get donor names, links or flows',async()=>{
 const rejected=new Map();
 for(const file of readdirSync(new URL('../public/growth/agencies/',import.meta.url)))
  for(const row of json('growth/agencies/'+file).agency.suppliers)
   if(!isOrganisationDonor({label:row.name}))rejected.set(row.id,row);
 assert.ok(rejected.size>0);
 const donors=[...rejected.values()].map(row=>({kind:'donor',id:'donor:'+row.id,label:row.name,abn:'12345678901'}));
 const prior=globalThis.fetch;
 globalThis.fetch=async url=>{assert.equal(url,'/growth/organisation-donors.json');return {ok:true,json:async()=>({donors})}};
 try {
  for(const row of rejected.values())assert.deepEqual(await supplierDonations({...row,abn:'12345678901',donor_links:[{id:'donor:'+row.id,url:'/subject/donor/'+encodeURIComponent(row.name),method:'abn'}]},{signal:new AbortController().signal}),{html:'',links:[]});
 } finally {globalThis.fetch=prior}
});
