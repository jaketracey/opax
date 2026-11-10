import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const bundle = await build({stdin:{contents:"export * from './src/tools/index'; export {constrainStep, guardToolPeriod} from './src/ask-constraints';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,platform:'browser',format:'esm',write:false});
const api = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const published = JSON.parse(await readFile(new URL('../public/expenses.json',import.meta.url),'utf8'));
const fixture = {
  meta:{from:'2024Q01',to:'2025Q04',quarters:8,reporting_periods:['2024Q01','2024Q02','2024Q03','2024Q04','2025Q01','2025Q02','2025Q03','2025Q04']},
  names:{'jane example':'P1','jane a example':'P1','john sample':'P2','john other sample':'P3'},
  people:{P1:{name:'Jane Example',total:999999,by_year:[[2024,401],[2025,681]],by_financial_year:[['2024-25',581]]},P2:{name:'John Sample'},P3:{name:'John Other Sample'}},
};
const env = data => ({origin:'https://opax.test',asset:async path => {assert.equal(path,'/expenses.json');return structuredClone(data);}});
const call = (args,data=fixture) => api.callTool(env(data),'member_expenses',args);

test('member_expenses returns a real calendar-year figure with its period, rather than the career total',async()=>{
  const result=await call({person:'Tony Abbott',year:2018},published);
  assert.equal(result.rows[0].amount_aud,682300);
  assert.notEqual(result.rows[0].amount_aud,published.people['10001'].total);
  assert.equal(result.rows[0].complete,true);
  assert.match(result.citations[0].text,/\$682,300.*calendar year 2018/);
  assert.match(result.citations[0].url,/^https:\/\/opax.test\/subject\/person\/tony-abbott#person-expenses$/);
  assert.equal(result.coverage.since,'2018-01-01');
  assert.equal(result.coverage.until,'2018-12-31');
  assert.equal(result.coverage.matched,true);
});

test('financial years use their own exported sum, including July and January reporting quarters',async()=>{
  for(const args of [{year:'2024-25'},{year:'2024-2025'},{year:'2024–25'},{since:'2024-07-01',until:'2025-06-30'}]){
    const result=await call({person:'Jane Example',...args});
    assert.equal(result.rows[0].amount_aud,581);
    assert.equal(result.coverage.matched,true);
    assert.deepEqual(result.rows[0].reporting_quarters,['2024Q03','2024Q04','2025Q01','2025Q02']);
    assert.match(result.citations[0].text,/financial year 2024-25/);
  }
  const actual=await call({person:'Tony Abbott',year:'2024-25'},published);
  assert.equal(actual.rows[0].amount_aud,352826);
  assert.equal(actual.coverage.matched,true);
});

test('a published zero or negative adjustment total is retained as a reported amount',async()=>{
  for(const amount of [0,-25]){
    const data=structuredClone(fixture);
    data.people.P1.by_year=[[2024,amount]];
    const result=await call({person:'Jane Example',year:2024},data);
    assert.equal(result.rows[0].amount_aud,amount);
    assert.equal(result.citations[0].value,amount);
    assert.equal(result.coverage.matched,true);
  }
});

test('calendar and financial years are the same shared registry tool in Ask',async()=>{
  const spec=api.askToolSpecs.find(t=>t.name==='member_expenses');
  assert.equal(api.tools.filter(t=>t.name==='member_expenses').length,1);
  assert.deepEqual(spec.input,api.getTool('member_expenses').inputSchema);
  const args={person:'Jane Example',year:2024};
  const result=await spec.run({asset:env(fixture).asset,origin:'https://opax.test'},args);
  assert.deepEqual(result.data,await call(args));
  const constraints={dated:true,people:['Jane Example'],period:{kind:'range',since:'2024-07-01',until:'2025-06-30'}};
  const step=api.constrainStep({tool:'member_expenses',args:{person:'Jane Example'}},constraints,spec.input.properties);
  const dated=await spec.run({asset:env(fixture).asset,origin:'https://opax.test'},step.args);
  const checked=api.guardToolPeriod(dated,step,constraints);
  assert.equal(checked.coverage.matched,true);
  assert.equal(checked.data.rows[0].amount_aud,581);
});

test('invalid or conflicting year selectors are rejected before any asset read',async()=>{
  let reads=0;
  for(const args of [{},{year:'2024-26'},{year:'2024-2026'},{year:2024,since:'2025-01-01',until:'2025-12-31'},{since:'2024-02-01',until:'2025-01-31'},{since:'2024-01-01'},{year:'not a year'},{year:2024,person:'<script>'}]){
    await assert.rejects(()=>api.callTool({asset:async()=>{reads++;return fixture;}},'member_expenses',{person:'Jane Example',...args}),api.ToolInputError);
  }
  assert.equal(reads,0);
});

test('partial edge years and missing internal quarters cannot become complete annual totals',async()=>{
  const edge=await call({person:'Tony Abbott',year:2017},published);
  assert.equal(edge.rows[0].complete,false);
  assert.equal(edge.coverage.since,'2017-04-01');
  assert.equal(edge.coverage.matched,false);
  assert.match(edge.citations[0].text,/partial reported subtotal/);
  const data=structuredClone(fixture);
  data.meta.reporting_periods=data.meta.reporting_periods.filter(p=>p!=='2024Q02');
  data.meta.quarters--;
  const gap=await call({person:'Jane Example',year:2024},data);
  assert.equal(gap.coverage.matched,false);
  assert.match(gap.notes.join(' '),/missing reporting quarters 2024Q02/);
  delete data.meta.reporting_periods;
  const unknown=await call({person:'Jane Example',year:2024},data);
  assert.equal(unknown.rows.length,0);
  assert.equal(unknown.coverage.matched,false);
});

test('missing years, missing financial-year exports and career-only data never yield a substituted amount',async()=>{
  const missing=await call({person:'Jane Example',year:2030});
  assert.equal(missing.rows.length,0);
  assert.match(missing.citations[0].text,/does not mean expenditure was zero/);
  for(const year of [2024,'2024-25']){
    const data=structuredClone(fixture);
    delete data.people.P1.by_financial_year;
    if(typeof year==='number')delete data.people.P1.by_year;
    const result=await call({person:'Jane Example',year},data);
    assert.equal(result.rows.length,0);
    assert.equal(result.coverage.matched,false);
    assert.ok(result.citations.every(c=>c.value===undefined));
    assert.match(result.citations[0].text,/ext_expenses/);
    assert.doesNotMatch(JSON.stringify(result),/999999/);
  }
});

test('member resolution accepts unique aliases, and declines ambiguous, substring and unknown matches',async()=>{
  assert.equal((await call({person:'Jane A Example',year:'2024'})).rows[0].name,'Jane Example');
  for(const person of ['John Sample','Nobody Here','Jan Example']){
    const data=structuredClone(fixture);
    if(person==='John Sample')delete data.names['john sample'];
    if(person==='John Sample')data.names['john middle sample']='P2';
    const result=await call({person,year:2024},data);
    assert.equal(result.rows.length,0);
    assert.match(result.citations[0].text,person==='John Sample'?/matches several/:/no IPEA expense record/);
  }
  assert.match((await call({person:'Jane Example',year:2024},null)).error,/unavailable/);
});
