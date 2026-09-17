import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';
const b=await build({entryPoints:[new URL('../src/ask-pay.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {paidAnswer,isPayQuestion}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const pay=JSON.parse(await readFile(new URL('../public/pay.json',import.meta.url),'utf8'));
const assets={fetch:async req=>new Response(await readFile(new URL('../public'+new URL(req.url).pathname,import.meta.url)))};
const ask=(question,filters={})=>paidAnswer({question,...filters},assets);
const aud=n=>'$'+n.toLocaleString('en-AU');
const base=pay.base.at(-1).amount, top=pay.current[0];

test('the question that used to come back "the record does not establish" is calculated',async()=>{
 const r=await ask('between labor and liberal who is the highest paid politician');
 assert.equal(r.answer_status,'calculated');assert.equal(r.pay_answer,true);
 // The Prime Minister is on base plus 160%, exactly, and leads whichever party governs.
 assert.equal(top.salary,Math.round(base*2.6));
 assert.ok(r.answer.startsWith(`**${top.name} (${top.party}) is the highest paid: ${aud(top.salary)} a year as Prime Minister.**`));
 const liberal=pay.current.find(row=>row.party==='Liberal'),labor=pay.current.find(row=>row.party==='Labor');
 for(const row of [liberal,labor])assert.ok(r.answer.includes(`| ${row.name} | ${row.party} |`),row.name);
 assert.match(r.answer,/\d+ Labor and \d+ Liberal federal parliamentarians compared/);
 assert.match(r.answer,/\n\nCoverage: These are salary entitlements set by the Remuneration Tribunal, \*\*not payslips\*\*/);
 assert.equal(r.money_context,r.answer.split('\n\n')[1].replace(/ \d+ Labor and .*$/,''));
 assert.ok(r.pay_next.every(step=>step.href.startsWith('/')&&step.label));
});

test('every citation marks a character inside the answer, and every source is cited',async()=>{
 for(const q of ['Who is the highest paid politician?','How much does the Prime Minister earn?',`How much does ${top.name} earn?`,'Who are the lowest paid politicians?']){
  const r=await ask(q);assert.ok(r,q);
  const chars=Array.from(r.answer);
  assert.deepEqual(Object.keys(r.citations).sort(),r.sources.map(s=>s.resource).sort(),q);
  for(const ranges of Object.values(r.citations))for(const [from,to] of ranges){assert.ok(from>=0&&to<=chars.length&&to===from+1,q);assert.match(chars[from],/\S/,q)}
  for(const s of r.sources){assert.match(s.resource,/^pay-\d+$/);assert.ok(s.href.startsWith('/subject/person/')||s.href.startsWith('https://'),s.href);assert.equal(s.cited,true)}
  // One instrument behind two sentences is still one source.
  assert.equal(new Set(r.sources.map(s=>s.href)).size,r.sources.length,q);
 }
});

test('a named person is answered from their own spells',async()=>{
 const r=await ask(`How much does ${top.name} earn?`);
 assert.ok(r.answer.startsWith(`**${top.name} is paid ${aud(top.salary)} a year** as Prime Minister`));
 assert.match(r.answer,/about \$\d+\.\d million in salary entitlements/);
 assert.match(r.answer,/\| From \| To \| Post \| Loading \| Salary a year \|/);
 const former=Object.values(pay.people).find(p=>!p.sitting&&p.peak.post==='Prime Minister');
 const past=await ask(`How much was ${former.name} paid?`);
 assert.match(past.answer,new RegExp(`^\\*\\*${former.name} was last paid \\$[\\d,]+ a year\\*\\* as a (?:member of parliament|senator), on leaving parliament`));
 assert.ok(past.answer.includes(`The highest rate was ${aud(former.peak.salary)} a year as Prime Minister`));
});

test('two named people are compared at their own rates',async()=>{
 const [a,b]=[pay.current[0],pay.current.find(row=>row.salary<pay.current[0].salary)];
 const r=await ask(`Who is paid more, ${b.name} or ${a.name}?`);
 assert.ok(r.answer.startsWith(`**${a.name} is paid more: ${aud(a.salary)} a year against ${b.name}’s ${aud(b.salary)}.**`));
});

test('a post is priced by its rule: ministers exactly, office holders rounded up to $10',async()=>{
 const pm=await ask('How much does the Prime Minister earn?');
 assert.ok(pm.answer.startsWith(`**The Prime Minister is paid ${aud(Math.round(base*2.6))} a year**`));
 const loto=await ask('What is the salary of the Leader of the Opposition?');
 assert.ok(loto.answer.includes(aud(base+Math.ceil(base*0.85/10)*10)));
 const anyone=await ask('How much do politicians get paid?');
 assert.ok(anyone.answer.startsWith(`**A federal parliamentarian’s base salary is ${aud(base)} a year**`));
});

test('scope words narrow the ranking',async()=>{
 const senate=await ask('Who is the highest paid senator?');
 const senator=pay.current.find(row=>row.chamber==='senate');
 assert.ok(senate.answer.startsWith(`**${senator.name} is the highest paid senator`));
 const lowest=await ask('Who are the lowest paid politicians?');
 assert.match(lowest.answer,new RegExp(`^\\*\\*${pay.current.filter(row=>row.pct===0).length} of ${pay.current.length} federal parliamentarians are on the base salary of \\$${aud(base).slice(1)} a year`));
 const ten=await ask('Who are the top 10 highest paid politicians?');
 assert.equal(ten.answer.split('\n').filter(line=>/^\| .* \| \$[\d,]+ \|$/.test(line)).length,10);
});

test('the notice caveat appears only where a shadow minister is priced',async()=>{
 assert.doesNotMatch((await ask('Who is the highest paid politician?')).answer,/notice to the Clerks/);
 const shadow=pay.current.find(row=>row.assumed);
 if(shadow)assert.match((await ask(`How much does ${shadow.name} earn?`)).answer,/if named in the Opposition Leader’s notice[\s\S]*notice to the Clerks/);
});

test('pay words about somebody else, or about what was said, go to the record',async()=>{
 for(const q of ['What did Labor say about wages?','What has parliament said about politicians pay rises?','Which party voted for the pay rise for aged care workers?',
  'Who are the highest paid CEOs donating to the Liberals?','Who gets the most money from gambling?','How much do nurses get paid?',
  'What is the minimum wage?','How much does the government pay for submarines?','Who is the highest paid public servant?'])assert.equal(await ask(q),null,q);
 assert.equal(await ask('Who is the highest paid politician?',{speaker:'Anthony Albanese'}),null);
 assert.equal(await ask('Who is the highest paid politician?',{kind:'speech'}),null);
 assert.equal(await ask('Who is the highest paid politician?',{state:'nsw'}),null);
 assert.equal(isPayQuestion({question:'Who is the highest paid politician?'}),true);
});
