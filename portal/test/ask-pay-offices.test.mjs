import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';

// What departmental secretaries and statutory office holders are paid, answered from
// pay-offices.json without a model. The fixture is stored: its departments, offices,
// amounts and named holders are invented; the parliamentary side is the real pay.json.
// A salt makes a second bundle a separate module, with its own memoised data.
const bundle=async(entry,salt='')=>{const b=await build({entryPoints:[new URL(entry,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text+`\n//${salt}`).toString('base64'))};
const {paidAnswer,payEvidence,mentionsOfficePay}=await bundle('../src/ask-pay.ts');
const {tool:payTool}=await bundle('../src/tools/pay.ts');
const pay=JSON.parse(await readFile(new URL('../public/pay.json',import.meta.url),'utf8'));
const real=JSON.parse(await readFile(new URL('../public/pay-offices.json',import.meta.url),'utf8'));

const src=(id,frl,date,title)=>({id,frl_id:frl,compilation_id:frl.replace('L','C'),compilation_no:2,compilation_date:date,registered:'2026-11-01',title,url:`https://www.legislation.gov.au/${frl}/latest/text`,publisher:'Federal Register of Legislation'});
const row=(o)=>({body:null,head:true,min:o.amount??null,max:o.amount??null,measure:'total remuneration',classification:null,aliases:[],...o});
const FIXTURE={
 meta:{generated:'2026-11-13T00:00:00+00:00',as_of:'2026-10-22',checked:'2026-11-13',jurisdiction:'federal',measure:'Total remuneration.',notes:[],not_covered:['Which office sits in which band.'],
  sources:[src('secretaries','F2026L90001','2026-08-30','Remuneration Tribunal (Departmental Secretaries) Fixture Determination 2026'),src('full_time','F2026L90002','2026-10-22','Remuneration Tribunal (Full-time Public Office) Fixture Determination 2026'),src('peo','F2026L90003','2026-08-30','Remuneration Tribunal (Principal Executive Offices) Fixture Determination 2026')]},
 offices:[
  row({id:'secretary-pmc',office:'Secretary of the Department of the Prime Minister and Cabinet',body:'Department of the Prime Minister and Cabinet',kind:'secretary',amount:1_000_000,classification:'Level 1',source:'secretaries',clause:'s 11, Tables 2A and 2B',keys:['prime minister and cabinet','pm and c']}),
  row({id:'secretary-treasury',office:'Secretary to the Treasury',body:'Department of the Treasury',kind:'secretary',amount:990_000,classification:'Level 2',source:'secretaries',clause:'s 11, Tables 2A and 2B',keys:['treasury']}),
  row({id:'office-chair-lighthouse',office:'Chair, Australian Lighthouse Authority',body:'Australian Lighthouse Authority',kind:'full_time_office',amount:960_000,source:'full_time',clause:'s 10, Table 2A',aliases:['ala']}),
  row({id:'secretary-finance',office:'Secretary of the Department of Finance',body:'Department of Finance',kind:'secretary',amount:null,min:900_000,max:950_000,classification:'Level 3',source:'secretaries',clause:'s 11, Tables 2A and 2B; pay point set under s 11(4)',keys:['finance'],special:'Level 3 has 2 pay points.'}),
  row({id:'secretary-weather',office:'Secretary of the Department of Lighthouses and Weather',body:'Department of Lighthouses and Weather',kind:'secretary',amount:null,min:900_000,max:950_000,classification:'Level 3',source:'secretaries',clause:'s 11, Tables 2A and 2B; pay point set under s 11(4)',keys:['lighthouses and weather','lighthouses']}),
  row({id:'office-deputy-lighthouse',office:'Deputy Chair, Australian Lighthouse Authority',body:'Australian Lighthouse Authority',kind:'full_time_office',head:false,amount:700_000,source:'full_time',clause:'s 10, Table 2A',aliases:['ala']}),
  row({id:'office-commonwealth-ombudsman',office:'Commonwealth Ombudsman',kind:'full_time_office',amount:500_000,source:'full_time',clause:'s 10, Table 2A',aliases:['ombudsman'],
   holder:{name:'Finch Placeholder',text:'Named in Table 3B.',source:'full_time',clause:'s 15, Table 3B item 1',url:'https://www.legislation.gov.au/F2026L90002/latest/text',checked:'2026-11-13'}}),
  row({id:'peo-band-a',office:'Principal Executive Office, band A',kind:'peo_band',head:false,amount:null,min:null,max:200_000,classification:'PEO band A',source:'peo',clause:'s 12, Table 2A'}),
  row({id:'peo-band-e',office:'Principal Executive Office, band E',kind:'peo_band',head:false,amount:null,min:600_000,max:null,classification:'PEO band E',source:'peo',clause:'s 12, Table 2A'}),
 ]};
const files={'/pay.json':pay,'/pay-offices.json':FIXTURE};
const assets={fetch:async req=>{const body=files[new URL(req.url).pathname];return body?Response.json(body):new Response('',{status:404})}};
const ask=(question,filters={})=>paidAnswer({question,...filters},assets);
const lead=r=>r.answer.split('\n\n')[0];
const aud=n=>'$'+n.toLocaleString('en-AU');

test('the highest paid agency head is ranked, ranges shown as ranges, every source cited and linked to the FRL',async()=>{
 const r=await ask('Who is the highest paid agency head?');
 assert.equal(r.answer_status,'calculated');assert.equal(r.pay_answer,true);
 assert.equal(lead(r),'**The Secretary of the Department of the Prime Minister and Cabinet is the highest paid agency head: $1,000,000 a year in total remuneration.** Next are the Secretary to the Treasury ($990,000) and the Chair of the Australian Lighthouse Authority ($960,000).');
 const rows=r.answer.split('\n').filter(line=>/^\| \d+ \|/.test(line));
 assert.deepEqual(rows.map(line=>line.split(' | ')[1]),['Secretary of the Department of the Prime Minister and Cabinet','Secretary to the Treasury','Chair, Australian Lighthouse Authority','Secretary of the Department of Finance','Secretary of the Department of Lighthouses and Weather','Commonwealth Ombudsman']);
 assert.ok(rows[3].endsWith('| Level 3 | $900,000 to $950,000 |'));
 // A deputy is not a head, and a band is not an office.
 assert.doesNotMatch(r.answer,/Deputy Chair|\| Principal Executive Office/);
 assert.match(r.answer,/top band \(band E\) starts at \$600,000 with no upper limit/);
 assert.match(r.answer,/\n\nCoverage: .*annual report/);
 const chars=Array.from(r.answer);
 assert.deepEqual(Object.keys(r.citations).sort(),r.sources.map(s=>s.resource).sort());
 for(const ranges of Object.values(r.citations))for(const [from,to] of ranges){assert.ok(from>=0&&to<=chars.length&&to===from+1);assert.match(chars[from],/\S/)}
 assert.deepEqual(r.sources.map(s=>s.href).sort(),['https://www.legislation.gov.au/F2026L90001/latest/text','https://www.legislation.gov.au/F2026L90002/latest/text']);
 assert.ok(r.sources.every(s=>s.kind==='pay'&&s.cited&&/F2026L9000\d, compilation No\. 2/.test(s.snippet)));
 assert.deepEqual(r.coverage,{since:'2026-10-22',until:'2026-10-22',as_of:'2026-10-22',matched:true});
 const servant=await ask('Who is the highest paid public servant in Australia?');
 assert.match(lead(servant),/^\*\*The Secretary of the Department of the Prime Minister and Cabinet is the highest paid public servant: \$1,000,000 a year/);
});

test('top N secretaries ranks secretaries only',async()=>{
 const r=await ask('Top 3 highest paid departmental secretaries');
 assert.match(lead(r),/is the highest paid departmental secretary: \$1,000,000/);
 const rows=r.answer.split('\n').filter(line=>/^\| \d+ \|/.test(line));
 assert.equal(rows.length,3);assert.ok(rows.every(line=>line.includes('| Secretary ')));
 assert.match(r.answer,/The 2 secretaries at Level 3 \(\$900,000 to \$950,000\) are each assigned to a pay point/);
 assert.doesNotMatch(r.answer,/band E/);
});

test('a named office: a secretary in a range, a statutory office and its named holder',async()=>{
 const finance=await ask('What is the Secretary of the Department of Finance paid?');
 assert.ok(lead(finance).startsWith('**The Secretary of the Department of Finance is paid between $900,000 and $950,000 a year in total remuneration** (Level 3), as at 22 October 2026.'));
 assert.match(lead(finance),/assigns the office to one of the Level 3 pay points/);
 for(const q of ['How much does the Finance secretary earn?','What does the secretary of finance make?'])assert.match(lead(await ask(q)),/^\*\*The Secretary of the Department of Finance is paid/,q);
 const ombudsman=await ask('How much does the Commonwealth Ombudsman earn?');
 assert.equal(lead(ombudsman),'**The Commonwealth Ombudsman is paid $500,000 a year in total remuneration**, as at 22 October 2026. The determination names Finch Placeholder as the holder (s 15, Table 3B item 1).');
 // A body named alone means its head; a role named in it means that role.
 assert.match(lead(await ask('How much is the head of the ALA paid?')),/^\*\*The Chair of the Australian Lighthouse Authority is paid \$960,000/);
 assert.match(lead(await ask('What is the deputy chair of the Australian Lighthouse Authority paid?')),/^\*\*The Deputy Chair of the Australian Lighthouse Authority is paid \$700,000/);
});

test('the PEO bands are shown as ranges',async()=>{
 const r=await ask('What are the PEO pay bands?');
 assert.equal(lead(r),'**Principal Executive Offices are paid within 2 bands of total remuneration a year, from band A (up to $200,000) to band E (from $600,000, with no upper limit).** The employing body sets each holder’s pay within the band, and the Minister assigns each office to a band.');
 assert.match(r.answer,/\| Principal Executive Office, band A \| PEO band A \| up to \$200,000 \|/);
});

test('an office compared with a parliamentary post or a named parliamentarian',async()=>{
 const pm=pay.current.find(row=>row.post==='Prime Minister');
 const r=await ask("Compare the Prime Minister's pay with the Treasury Secretary's");
 assert.equal(lead(r).split('**')[1],`The Secretary to the Treasury’s total remuneration is $990,000 a year; the Prime Minister’s salary is ${aud(pm.salary)} a year.`);
 assert.match(lead(r),/The two measure different things: total remuneration includes the employer superannuation contribution/);
 assert.ok(r.answer.includes(`| Prime Minister | ${pm.name} | salary | ${aud(pm.salary)} |`));
 assert.ok(r.answer.includes('| Secretary to the Treasury |  | total remuneration | $990,000 |'));
 assert.ok(r.sources.some(s=>s.href===pay.meta.sources.find(x=>x.id==='ministerial-report').url));
 const named=await ask(`Compare ${pm.name}'s salary with the Commonwealth Ombudsman`);
 assert.match(lead(named),new RegExp(`^\\*\\*The Commonwealth Ombudsman’s total remuneration is \\$500,000 a year; ${pm.name}’s salary is`));
 const two=await ask('Is the Treasury secretary paid more than the Commonwealth Ombudsman?');
 assert.match(lead(two),/^\*\*The Secretary to the Treasury is paid more: \$990,000 a year in total remuneration, against \$500,000 a year for the Commonwealth Ombudsman\.\*\*/);
});

test('parliamentary pay questions are untouched, and office questions never become an MP answer',async()=>{
 assert.match(lead(await ask('Who is the highest paid politician?')),/is the highest paid federal parliamentarian/);
 assert.match(lead(await ask('What does the Treasurer earn?')),/^\*\*The Treasurer is paid/);
 assert.match(lead(await ask('How much does the Prime Minister earn?')),/^\*\*The Prime Minister is paid/);
 // Dated, or about what was said: the record, not a current rate and not a politician's salary.
 for(const q of ['Who was the highest paid agency head in 2019?','How much was the Commonwealth Ombudsman paid in 2019?','What did Labor say about public servants pay?','How much do nurses get paid?','What did the secretary of finance say about pay?'])assert.equal(await ask(q),null,q);
 assert.equal(await ask('Who is the highest paid agency head?',{speaker:'Someone'}),null);
 assert.equal(await ask('Who is the highest paid agency head?',{state:'nsw'}),null);
 assert.equal(mentionsOfficePay('How much does a parliamentary secretary earn?'),false);
 assert.equal(mentionsOfficePay('What is the Secretary of the Department of Finance paid?'),true);
});

test('looser questions hand the model the office records first',async()=>{
 const ev=await payEvidence({question:'secretary of finance salary and other heads pay'},assets);
 assert.equal(ev[0].title,'Secretary of the Department of Finance: pay set by the Remuneration Tribunal');
 assert.match(ev[0].snippet,/\$900,000 to \$950,000 a year in total remuneration \(Level 3\)/);
 assert.match(ev[0].snippet,/F2026L90001, compilation of 30 August 2026/);
 assert.ok(ev.some(r=>r.slug==='pay-office-ranking'));
 assert.ok(!ev.some(r=>r.slug==='pay-ranking'),'no parliamentary ranking for a question about secretaries');
 assert.ok(ev.every(r=>r.kind==='pay'&&r.snippet.length<=1800));
 assert.deepEqual(await payEvidence({question:'How much do nurses get paid?'},assets),[]);
});

test('the parliamentary_pay tool returns the Tribunal rate for a public office',async()=>{
 const env={asset:async path=>structuredClone(files[path]??null),origin:'https://opax.com.au'};
 const finance=await payTool.handler(env,{office:'Secretary of the Department of Finance'});
 assert.equal(finance.rows[0].office,'Secretary of the Department of Finance');assert.equal(finance.rows[0].frl_id,'F2026L90001');
 assert.equal(finance.citations[0].url,'https://www.legislation.gov.au/F2026L90001/latest/text');
 assert.match(finance.citations[0].text,/\$900,000 to \$950,000/);
 // A ranking argument does not turn a public office into a dated MP lookup.
 const heads=await payTool.handler(env,{office:'agency heads',limit:3,order:'desc'});
 assert.deepEqual(heads.rows.map(r=>r.office),['Secretary of the Department of the Prime Minister and Cabinet','Secretary to the Treasury','Chair, Australian Lighthouse Authority']);
 const ombudsman=await payTool.handler(env,{office:'Commonwealth Ombudsman'});
 assert.equal(ombudsman.rows[0].holder.name,'Finch Placeholder');
});

test('the built file answers the questions that started this',async()=>{
 const realAssets={fetch:async req=>{const p=new URL(req.url).pathname;return Response.json(p==='/pay.json'?pay:real)}};
 // A fresh bundle: the loaded data is memoised per module.
 const {paidAnswer:fresh}=await bundle('../src/ask-pay.ts','real');
 const top=real.offices.filter(r=>r.head&&r.kind!=='peo_band').sort((a,b)=>(b.amount??b.max)-(a.amount??a.max))[0];
 const r=await fresh({question:'Who is the highest paid agency head?'},realAssets);
 assert.ok(lead(r).startsWith(`**The ${top.office} is the highest paid agency head: ${aud(top.amount)} a year in total remuneration.**`));
 for(const q of ['What is the Secretary of the Department of Finance paid?','How much does the Commonwealth Ombudsman earn?',"Compare the Prime Minister's pay with the Treasury Secretary's",'Top 10 highest paid departmental secretaries'])
  assert.equal((await fresh({question:q},realAssets))?.answer_status,'calculated',q);
 assert.ok(real.meta.sources.every(s=>/^F\d{4}L\d{5}$/.test(s.frl_id)&&/^F\d{4}C\d{5}$/.test(s.compilation_id)&&s.url.startsWith('https://www.legislation.gov.au/')));
 assert.ok(real.offices.every(r=>r.source&&r.clause&&(r.amount!=null||r.min!=null||r.max!=null)));
});

test('a possessive after an office is still the office',async()=>{
 const ombudsman=await ask("What is the Commonwealth Ombudsman's salary?");
 assert.match(lead(ombudsman),/^\*\*The Commonwealth Ombudsman is paid \$500,000 a year/);
 assert.match(lead(await ask('What is the Commonwealth Ombudsman’s salary?')),/^\*\*The Commonwealth Ombudsman is paid/,'curly apostrophe');
 assert.match(lead(await ask("What is Treasury's secretary paid?")),/^\*\*The Secretary to the Treasury is paid \$990,000 a year/);
 const pm=pay.current.find(row=>row.post==='Prime Minister');
 const both=await ask("Compare the Secretary of the Department of Finance's pay with the Prime Minister's");
 assert.ok(lead(both).startsWith(`**The Secretary of the Department of Finance’s total remuneration is between $900,000 and $950,000 a year; the Prime Minister’s salary is ${aud(pm.salary)} a year.**`));
});

test('an MP salary inside an office range is said to fall within it, and a fixed rate below a range still overlaps nothing',async()=>{
 const pm=pay.current.find(row=>row.post==='Prime Minister');
 const kites=row({id:'secretary-kites',office:'Secretary of the Department of Kites',body:'Department of Kites',kind:'secretary',amount:null,min:pm.salary-10_000,max:pm.salary+10_000,classification:'Level 4',source:'secretaries',clause:'s 11, Tables 2A and 2B',keys:['kites']});
 // A fixed rate stored without min/max: the overlap test must read its amount, not 0.
 const inspector={...row({id:'office-chief-kite-inspector',office:'Chief Kite Inspector',kind:'full_time_office',amount:960_000,source:'full_time',clause:'s 10, Table 2A'}),min:null,max:null};
 const local={'/pay.json':pay,'/pay-offices.json':{...FIXTURE,offices:[...FIXTURE.offices,kites,inspector]}};
 const {paidAnswer:fresh}=await bundle('../src/ask-pay.ts','range');
 const localAssets={fetch:async req=>Response.json(local[new URL(req.url).pathname])};
 const r=await fresh({question:"Compare the Prime Minister's pay with the Kites secretary's"},localAssets);
 assert.match(lead(r),/On these figures the Prime Minister’s salary falls within the range for the Secretary of the Department of Kites\./);
 assert.doesNotMatch(lead(r),/more a year/);
 // A fixed amount above a range's top does not overlap it.
 const two=await fresh({question:'Is the Commonwealth Ombudsman paid more than the Kites secretary?'},localAssets);
 assert.match(lead(two),/^\*\*The Secretary of the Department of Kites is paid more:/);
 const overlap=await fresh({question:'Is the Finance secretary paid more than the Chief Kite Inspector?'},localAssets);
 assert.match(lead(overlap),/^\*\*The Chief Kite Inspector is paid more: \$960,000 a year in total remuneration, against between \$900,000 and \$950,000 a year/,'a fixed amount above the range is not an overlap');
});
