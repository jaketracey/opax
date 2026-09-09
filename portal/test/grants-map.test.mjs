import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordsWithLocations,filterRecords,locationCoverage,historicalRecords,publicationYears,publishedThrough} from '../public/grants-research.js';
const data=JSON.parse(readFileSync(new URL('../public/research/mlci.json',import.meta.url)));
const sites=JSON.parse(readFileSync(new URL('../public/research/grant-locations.json',import.meta.url)));
test('map keeps all funding records and only pins verified project venues',()=>{
 const all=recordsWithLocations(data,sites);
 assert.equal(all.length,89);assert.equal(all.reduce((n,p)=>n+p.value,0),242781386);
 const c=locationCoverage(all);assert.equal(c.mapped,7);assert.equal(c.sites,9);assert.equal(c.value,12715000);
 assert.ok(all.filter(p=>!p.sites.length).every(p=>p.sites.length===0));
});
test('multi-site award remains one monetary record and search finds both venues',()=>{
 const all=recordsWithLocations(data,sites),p=all.find(p=>p.id==='GA575257');
 assert.equal(p.sites.length,2);assert.equal(p.value,750000);
 assert.equal(locationCoverage([p]).value,750000);
 assert.equal(filterRecords(all,{query:'George Street'}).filter(p=>p.id==='GA575257').length,1);
});
test('stage changes never combine invitations and awards',()=>{
 const invited=recordsWithLocations(data,sites,'invitations');
 assert.equal(invited.length,226);assert.ok(invited.every(p=>p.record_type==='invitation'));
 assert.equal(invited.reduce((n,p)=>n+p.value,0),559241712);
});
test('unknown award state stays unknown without project evidence',()=>{
 const p=data.awards.find(p=>!p.delivery_state&&!sites.records.some(s=>s.id===p.ga_id));
 const all=recordsWithLocations(data,sites);
 assert.equal(all.find(r=>r.id===p.ga_id).state,'');
 assert.ok(!filterRecords(all,{state:'NSW'}).some(r=>r.id===p.ga_id));
});
test('search includes original description and confirmed locality',()=>{
 const all=recordsWithLocations(data,sites);
 assert.equal(filterRecords(all,{query:'  PAMBULA playground ',state:'NSW'}).length,1);
 assert.equal(filterRecords(all,{query:'Pambula',state:'WA'}).length,0);
 assert.ok(filterRecords(all,{query:'Mandurah'}).length>0);
});

test('pending, mismatched and invalid site evidence cannot create a map pin',()=>{
 const changed=structuredClone(sites), record=changed.records.find(p=>p.id==='GA575257');
 record.sites[0].verification.status='pending';record.sites[1].latitude=999;
 assert.equal(recordsWithLocations(data,changed).find(p=>p.id===record.id).sites.length,0);
 record.record_type='invitation';
 assert.equal(recordsWithLocations(data,changed).find(p=>p.id===record.id).sites.length,0);
});
test('verified grant recipients can be found by council name',()=>{
 const all=recordsWithLocations(data,sites);
 assert.ok(filterRecords(all,{query:'Somerset'}).some(p=>p.title.includes('Lowood')));
 assert.ok(filterRecords(all,{query:'Bega Valley'}).some(p=>p.id==='GA575257'));
});

test('timeline uses publication year, keeps later-value amendments, and does not mix programs',()=>{
 const history={records:[{id:'GA-OLD',record_type:'award',verification:{status:'verified'},publish_date:'2018-10-02',value:12345,approval_date:'2021-05-01',title:'Park',sites:[]},{id:'GA-NEW',record_type:'award',verification:{status:'verified'},publish_date:'2024-01-02',value:54321,title:'Hall',sites:[]}]};
 const records=historicalRecords(history);
 assert.deepEqual(publicationYears(records),{min:2018,max:2024});
 assert.deepEqual(publishedThrough(records,2020).map(p=>p.id),['GA-OLD']);
 assert.equal(publishedThrough(records,2020)[0].value,12345);
 assert.equal(publishedThrough(records,2024).length,2);
 assert.equal(publishedThrough(records,2017).length,0);
 assert.equal(publishedThrough([...records,{date:null}],2024).length,2);
 assert.equal(historicalRecords({records:[...history.records,...history.records]}).length,2);
 assert.equal(recordsWithLocations(data,sites).length,89);
});

test('historical release covers each published year without expanding the program cohort',()=>{
 const history=JSON.parse(readFileSync(new URL('../public/research/grants-history.json',import.meta.url)));
 const rows=historicalRecords(history);
 assert.equal(rows.length,11);assert.equal(locationCoverage(rows).sites,11);
 assert.equal(locationCoverage(rows).value,84307200);
 assert.deepEqual([...new Set(rows.map(p=>p.date.slice(0,4)))].sort(),['2018','2019','2020','2021','2022','2023','2024']);
 assert.ok(rows.every(p=>p.source_url.startsWith('https://www.grants.gov.au/')));
 assert.equal(publishedThrough(rows,2018).length,2);
 assert.equal(publishedThrough(rows,2019).length,4);
 assert.equal(publishedThrough(rows,2024).length,11);
 assert.ok(rows.every(p=>!data.awards.some(a=>a.ga_id===p.id)));
});
