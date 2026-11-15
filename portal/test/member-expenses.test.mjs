import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const bundle = await build({stdin:{contents:"export * from './src/tools/index'; export {constrainStep, guardToolPeriod} from './src/ask-constraints'; export {expenseGroup} from './src/tools/member-expenses';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,platform:'browser',format:'esm',write:false});
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
  // Ask's schema adds the itemised arguments; the public (MCP) schema does not list them yet.
  assert.deepEqual(spec.input,api.getTool('member_expenses').askInputSchema);
  assert.deepEqual(Object.keys(api.getTool('member_expenses').inputSchema.properties),['person','year','since','until']);
  assert.deepEqual(Object.keys(spec.input.properties),['person','year','since','until','detail','category','offset']);
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

// ---- itemised lines (Ask only) ----------------------------------------------------------------------------------
const COLUMNS=['quarter','from_date','to_date','category','category_high','category_major','category_minor','description','from_location','to_location','nights','nightly_rate','amount','trip','leg','reason','notes','traveller'];
const Q=(id,label)=>({id,label,source_url:'https://data.gov.au/data/dataset/ipea-'+id.toLowerCase()});
const line=(quarter,high,major,description,amount,extra={})=>COLUMNS.map(c=>({quarter,category_high:high,category_major:major,description,amount,traveller:'Member',...extra})[c]??null);
const files={
  'expenses/v1/P1/2025.json':{meta:{name:'Jane Example',quarters:[Q('2025Q03','Jul-Sep 2025'),Q('2025Q04','Oct-Dec 2025')]},columns:COLUMNS,lines:[
    line('2025Q03','Scheduled Commercial Transport','Fares','Canberra to Perth 4 Aug 25',612.4,{from_location:'Canberra',to_location:'Perth'}),
    line('2025Q04','Office Administration','Printing and Communications','Printing 3 Oct 25',900),
  ]},
  'expenses/v1/P1/2026.json':{meta:{name:'Jane Example',quarters:[Q('2026Q01','Jan-Mar 2026'),Q('2026Q02','Apr-Jun 2026')]},columns:COLUMNS,lines:[
    line('2026Q01','Scheduled Commercial Transport','Fares','Canberra to Sydney 13 Feb 26',246.81,{from_location:'Canberra',to_location:'Sydney'}),
    line('2026Q01','Travel Allowance','Travel Allowance','Parliamentary Duties',644,{from_date:'2026-02-01',to_date:'2026-02-03',to_location:'Canberra',nights:2,nightly_rate:322}),
    line('2026Q01','Other Car Costs','COMCAR','Car transport',88.5),
    line('2026Q02','Family or Nominee Travel','Scheduled Commercial Transport','Sydney to Canberra 2 May 26',310,{traveller:'Family member'}),
    line('2026Q02','Employee Travel','Domestic Travel','Aggregated Total',1500.25,{traveller:'Staff'}),
    line('2026Q02','International Travel','Ministerial Visits','Official visit',4000,{from_date:'2026-05-10',to_date:'2026-05-14',reason:'Official Travel - India'}),
    line('2026Q02','Scheduled Commercial Transport','Fares','Canberra to Sydney 13 Feb 26',-246.81,{notes:'Refunded.'}),
    line('2026Q02','Office Administration','Office Consumables and Services','Stationery',55),
  ]},
};
const itemFixture={...fixture,meta:{...fixture.meta,to:'2026Q02',quarters:10,reporting_periods:[...fixture.meta.reporting_periods,'2026Q01','2026Q02'],attribution:'Source: IPEA, CC BY 3.0 AU.'},
  people:{...fixture.people,P1:{...fixture.people.P1,by_year:[[2024,401],[2025,681],[2026,6598]]}}};
const itemEnv=(store=files,reads=[])=>({origin:'https://opax.test',asset:async()=>structuredClone(itemFixture),media:async key=>{reads.push(key);return store[key]?structuredClone(store[key]):null;}});
const ask=(args,store,reads)=>api.callTool(itemEnv(store,reads),'member_expenses',{person:'Jane Example',...args},true);

test('itemised travel leads with what is held, then subtotals, then each published line cited to its IPEA quarter',async()=>{
  const reads=[];
  const result=await ask({year:2026,detail:'itemised'},files,reads);
  assert.deepEqual(reads,['expenses/v1/P1/2026.json']);
  const row=result.rows[0];
  assert.equal(row.lines,7);                       // every travel line; the office line is left out
  assert.equal(row.amount_aud,6542.75);
  assert.deepEqual(row.reporting_quarters,['2026Q01','2026Q02']);
  assert.deepEqual(row.groups.map(g=>[g.group,g.lines,g.amount_aud]),[['fares',2,0],['allowance',1,644],['car',1,88.5],['overseas',1,4000],['family',1,310],['staff',1,1500.25]]);
  assert.equal(result.citations[0].text,"Jane Example's IPEA-reported travel lines, 1 January 2026 to 30 June 2026: 7 lines totalling $6,542.75 (reporting quarters held: 2026Q01, 2026Q02).");
  assert.match(result.citations[0].url,/#person-expenses$/);
  assert.equal(result.citations[2].text,'Jane Example, travel allowance, 1 January 2026 to 30 June 2026: 1 lines, $644.00, 2 nights.');
  const lines=result.citations.slice(1+row.groups.length);
  assert.equal(lines.length,7);
  assert.equal(lines[0].text,'Jan-Mar 2026, Fares: Canberra to Sydney 13 Feb 26: $246.81');
  assert.equal(lines[1].text,'Jan-Mar 2026, Travel Allowance: Parliamentary Duties; Canberra; 1 February 2026 to 3 February 2026; 2 nights at $322.00: $644.00');
  assert.equal(lines[0].url,'https://data.gov.au/data/dataset/ipea-2026q01');
  assert.equal(lines[3].url,'https://data.gov.au/data/dataset/ipea-2026q02');
  assert.match(lines[3].text,/family member: \$310\.00$/);
  assert.match(lines[4].text,/Aggregated Total; staff: \$1,500\.25$/);
  assert.match(lines[5].text,/Official Travel - India: \$4,000\.00$/);
  assert.match(lines[6].text,/Refunded\.: -\$246\.81$/);
  assert.equal(row.next_offset,null);
  assert.equal(result.coverage.matched,false);     // two of the year's four quarters are held
  assert.match(result.notes.join(' '),/Reporting quarters not held for calendar year 2026: 2026Q03, 2026Q04/);
  assert.match(result.notes.join(' '),/CC BY 3\.0 AU/);
});

test('itemised categories narrow the lines, and a financial year reads both calendar files',async()=>{
  const fares=await ask({year:2026,detail:'itemised',category:'fares'});
  assert.equal(fares.rows[0].lines,2);
  assert.equal(fares.citations.length,3);          // one group, so no separate subtotals
  const all=await ask({year:2026,detail:'itemised',category:'all'});
  assert.equal(all.rows[0].lines,8);
  assert.equal(all.rows[0].groups.at(-1).group,'office');
  const reads=[];
  const fy=await ask({year:'2025-26',detail:'itemised'},files,reads);
  assert.deepEqual(reads.sort(),['expenses/v1/P1/2025.json','expenses/v1/P1/2026.json']);
  assert.equal(fy.rows[0].lines,8);
  assert.equal(fy.coverage.matched,true);
  assert.match(fy.citations[0].text,/1 July 2025 to 30 June 2026: 8 lines totalling \$7,155\.15\.$/);
  assert.equal(fy.citations.at(-8).text,'Jul-Sep 2025, Fares: Canberra to Perth 4 Aug 25: $612.40');
});

test('a long itemised list is paged within the Ask result size, with the offset for the next lines',async()=>{
  const many={'expenses/v1/P1/2026.json':{...files['expenses/v1/P1/2026.json'],lines:Array.from({length:260},(_,i)=>line('2026Q01','Other Car Costs','COMCAR','Car transport '+i,10+i))}};
  const first=await ask({year:2026,detail:'itemised',category:'car'},many);
  assert.equal(first.rows[0].lines,260);
  assert.equal(first.rows[0].lines_listed,100);
  assert.equal(first.rows[0].next_offset,100);
  assert.match(first.notes.join(' '),/Lines 1 to 100 of 260 are listed\. Call again with offset 100/);
  assert.ok(new TextEncoder().encode(JSON.stringify(first.citations.map(c=>c.text))).length<12_000);
  const last=await ask({year:2026,detail:'itemised',category:'car',offset:200},many);
  assert.equal(last.rows[0].lines_listed,60);
  assert.equal(last.rows[0].next_offset,null);
  assert.equal(last.rows[0].amount_aud,first.rows[0].amount_aud);   // totals cover every line, not the page
});

test('itemised answers say what is held when the lines or the category are absent, and never invent a figure',async()=>{
  const none=await ask({year:2026,detail:'itemised'},{});
  assert.equal(none.rows.length,0);
  assert.match(none.citations[0].text,/^OPAX holds Jane Example's IPEA expense totals by year; the itemised lines for calendar year 2026 are not loaded yet\.$/);
  const empty=await ask({year:2025,detail:'itemised',category:'overseas'});
  assert.equal(empty.rows.length,0);
  assert.match(empty.citations[0].text,/hold 2 lines in other categories and none under overseas travel/);
  assert.ok([...none.citations,...empty.citations].every(c=>c.value===undefined));
});

test('itemised arguments belong to Ask: the public schema rejects them, and no traveller is named',async()=>{
  for(const args of [{detail:'itemised'},{category:'fares'},{offset:10}]){
    await assert.rejects(()=>api.callTool(itemEnv(),'member_expenses',{person:'Jane Example',year:2026,...args}),api.ToolInputError);
  }
  await assert.rejects(()=>ask({year:2026,category:'fares'}),api.ToolInputError);   // category needs detail itemised
  await assert.rejects(()=>ask({year:2026,detail:'itemised',category:'biggest'}),api.ToolInputError);
  const totals=await ask({year:2026});
  assert.equal(totals.rows[0].amount_aud,6598);
  const leaky=structuredClone(files);
  leaky['expenses/v1/P1/2026.json'].columns=[...COLUMNS,'traveller_name'];
  leaky['expenses/v1/P1/2026.json'].lines=leaky['expenses/v1/P1/2026.json'].lines.map(l=>[...l,'Zebedee Quillfeather']);
  assert.doesNotMatch(JSON.stringify(await ask({year:2026,detail:'itemised',category:'all'},leaky)),/Zebedee|Quillfeather|traveller_name/);
});

test('expense groups follow IPEA\'s category tree across its renamings',()=>{
  const g=api.expenseGroup;
  assert.deepEqual([g('Domestic Scheduled Fares','Fares'),g('Scheduled Commercial Transport','Fares'),g('Travelling Allowance','Parliamentary Travelling Allowance'),g('Car Costs','COMCAR'),g('Other Car Costs','Parking'),
    g('Unscheduled Commercial Transport','Electorate Duties'),g('Charter','Electorate'),g('Overseas Travel','Ministerial Visits'),g('International Travel','Official Visits'),g('Family Travel Costs','COMCAR'),
    g('Family or Nominee Travel','Scheduled Commercial Transport'),g('Employee Costs','Domestic Travel'),g('Employee Travel','International Travel'),g('Office Facilities',null),g('Telecommunications','Telecommunications - Usage'),g(null,null)],
    ['fares','fares','allowance','car','car','unscheduled','unscheduled','overseas','overseas','family','family','staff','staff','office','office','other']);
});
