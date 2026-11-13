// GET /api/app/v1/widget/today (widgets spec 2.3, lane B). The edition and
// vote words are pinned against the app's own functions: every expected
// string below was produced by mobile/src on ios/apple-design (203657d87):
// editionFor/editionTitles (api/selectors.ts), plateLine and editionPerson
// (features/edition/model.ts; Plate.tsx draws the person line for a member),
// and recentReadingVotes (features/today/votes.ts). Nothing is imported
// across portal/ and mobile/: the fixtures and strings are copies.
// edition-bill.json is the app's scripts/fixtures/edition-latest.json less its
// photo credit; edition-politician.json is the app's edition-politician.json
// with invented names; the divisions and sitting files are invented.
import test, {describe} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';

const compile=async file=>{
  const result=await build({entryPoints:[new URL('../src/'+file,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const W=await compile('app-widget.ts');
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/widget-today/'+name,import.meta.url),'utf8'));
const billEdition=()=>fixture('edition-bill.json').edition;
const personEdition=()=>fixture('edition-politician.json').edition;
// 09:05 on Friday 13 November 2026 in Sydney and Melbourne (AEDT).
const at=Date.UTC(2026,10,12,22,5);
const TODAY='2026-11-13';

describe('the edition, in the words of the app plate',()=>{
  test('the pinned bill edition: card title and line as the Today card draws them',()=>{
    assert.deepEqual(W.widgetEdition(billEdition()),{date:'2026-10-04',kind:'bill',kind_short:'Bill',
      card_title:'Wage Justice for Early Childhood Education and Care Workers…',line:'Education portfolio',path:'/bill/au-federal-r7529'});
  });
  test("a bill's short title from its own record replaces the title",()=>{
    assert.equal(W.widgetEdition(billEdition(),'Early childhood pay').card_title,'Early childhood pay');
    assert.equal(W.editionBillKey('bill','/bill/au-federal-r7529'),'au-federal-r7529');
    assert.equal(W.editionBillKey('bill','/bill/au-federal-r7529/?x=1'),'au-federal-r7529');
    assert.equal(W.editionBillKey('topic','/bill/au-federal-r7529'),null,'only a bill edition takes a short title');
  });
  test("a member's plate line is their party and seat, as the plate draws it, not plateLine",()=>{
    const view=W.widgetEdition(personEdition());
    assert.deepEqual(view,{date:'2026-10-06',kind:'politician',kind_short:'Parliamentarian',card_title:'Jordan Avery',
      line:'Liberal · Wattle, NSW',path:'/subject/person/Jordan%20Avery'});
    // The app's plateLine for the same record (Plate.tsx shows the person line instead).
    const cover=personEdition().slides[0];
    assert.equal(W.plateLine(cover.line,['Jordan Avery: 768 speeches in the Opax record.']),'Liberal · House of Representatives · records 2008 to 2026');
    assert.deepEqual(W.editionPerson({kicker:cover.kicker,line:cover.line}),{party:'Liberal',place:'Wattle, NSW'});
  });
  test('card title uses the published clause or word boundary (app edition.test.ts)',()=>{
    for(const [title,expected] of [
      ['A'.repeat(80),'A'.repeat(80)],
      ['A'.repeat(81),`${'A'.repeat(80)}…`],
      [`First clause (${'detail '.repeat(15)})`,'First clause…'],
      [`${'word '.repeat(20)}ending`,`${'word '.repeat(16).trimEnd()}…`],
    ])assert.equal(W.cardTitle(title,null),expected);
  });
  test('each kind has the short label the plate prints (app edition.test.ts)',()=>{
    const urls={bill:'https://opax.com.au/bill/au-federal-r7529',politician:'https://opax.com.au/subject/person/Jordan%20Avery',
      grant:'https://opax.com.au/money/grants?jur=federal&open=GA1',program:'https://opax.com.au/money/grants?jur=federal&program=abc',
      largest:'https://opax.com.au/money/grants?jur=federal&largest=2026-08',topic:'https://opax.com.au/money/grants?jur=federal&program=abc'};
    for(const [kind,label] of [['bill','Bill'],['politician','Parliamentarian'],['grant','Grant'],['program','Grant program'],['largest','Largest grants'],['topic','Topic']])
      assert.equal(W.widgetEdition({...billEdition(),kind,url:urls[kind]}).kind_short,label);
  });
  test('the plate line keeps only sentences the paragraph below does not say (app edition-page.test.tsx)',()=>{
    const line='This bill would keep funding grants. Passed 18 Sep 2026.';
    assert.equal(W.plateLine(line,['This bill would keep funding grants.','Passed 18 Sep 2026.']),null);
    assert.equal(W.plateLine(line,['This bill would keep  funding grants.']),'Passed 18 Sep 2026');
    assert.equal(W.plateLine(line),line.slice(0,-1));
    assert.equal(W.plateLine('Liberal · Wattle, NSW',['Something else.']),'Liberal · Wattle, NSW');
    assert.equal(W.plateLine(null,['x']),null);
    const bill={kind:'bill',facts:{kicker:'Bill · Education portfolio',events:[{date:'18 Sep 2026',text:'Royal Assent'}]}};
    assert.equal(W.plateLine('Passed 18 Sep 2026.',[],bill),'Education portfolio');
    assert.equal(W.plateLine('Passed 18 Sep 2026.',[],{...bill,facts:{...bill.facts,kicker:null}}),null);
    assert.equal(W.plateLine('Passed 18 Sep 2026.',[],{...bill,facts:{...bill.facts,events:[]}}),'Passed 18 Sep 2026');
  });
  test('unreadable optional slide fields drop out as the app drops them',()=>{
    const soon=billEdition();soon.slides[2].events='soon';
    assert.equal(W.widgetEdition(soon).line,'Passed 18 Sep 2026');
    const both=billEdition();both.slides[2].events='soon';both.slides[0].line=42;
    assert.equal(W.widgetEdition(both).line,null);
    const bare=billEdition();delete bare.slides;
    assert.equal(W.widgetEdition(bare).line,null);
    const topic={...billEdition(),kind:'topic',url:'https://opax.com.au/money/grants?jur=federal&program=abc'};
    assert.deepEqual([W.widgetEdition(topic).line,W.widgetEdition(topic).path],['Passed 18 Sep 2026','/money/grants?jur=federal&program=abc']);
  });
  test('an edition the app refuses is not drawn',()=>{
    const cases=[
      e=>{e.url='https://opax.com.au/reports/housing'},
      e=>{e.slides[4].rows=['a',3]},
      e=>{e.slides[1].note=3},
      e=>{e.title='  '},
      e=>{e.url='https://opax.com.au:8443/bill/au-federal-r7529'},
      e=>{e.slides=e.slides.slice(1)},
    ];
    for(const change of cases){const e=billEdition();change(e);assert.equal(W.widgetEdition(e),null,String(change))}
  });
});

describe('the vote, as the first row of How parliament voted',()=>{
  test('the pinned file: the newest reading vote, procedure and amendments out, one per bill per day',()=>{
    assert.deepEqual(W.widgetVote(fixture('recent-divisions.json')),{date:'2026-11-12',chamber:'Senate',stage:'Third reading',
      title:'Example Tax Bill 2026',outcome:'Agreed to',ayes:37,noes:30,path:'/bill/au-federal-r9001?division=senate-2026-11-12-10'});
    // The app's three rows for the same file.
    const rows=W.recentReadingVotes(W.readDivisions(fixture('recent-divisions.json')).divisions,3);
    assert.deepEqual(rows.map(r=>[r.division_key,W.outcomeWord(r.outcome,r),W.stageWords(r.stage),W.chamberWord(r.chamber),r.short_title?.trim()||r.title]),[
      ['senate-2026-11-12-10','Agreed to','Third reading','Senate','Example Tax Bill 2026'],
      ['house-2026-11-11-1','Agreed to','Third reading','House of Representatives','Example Housing Bill 2026'],
      ['house-2026-11-10-2','Not agreed to','Second reading','House of Representatives','Example Schools Bill 2026'],
    ]);
  });
  test('a bill appears once per day with its latest reading division (app divisions-fixture.test.ts)',()=>{
    const row={bill_key:'au-federal-r1',title:'Example Bill 2026',stage:'Second reading',date:'2026-11-09',ayes:80,noes:60};
    const file=W.readDivisions({generated_at:'2026-11-09',divisions:[
      {...row,division_key:'house-99'},{...row,stage:'Third reading',division_key:'house-100'},
      {...row,bill_key:'au-federal-r2',title:'Another Bill 2026',division_key:'house-101'},{...row,date:'2026-11-08',division_key:'house-98'}]});
    assert.deepEqual(W.recentReadingVotes(file.divisions,4).map(v=>v.division_key),['house-101','house-100','house-98']);
  });
  test('outcomes are "Agreed to" or "Not agreed to" (app bills.test.tsx)',()=>{
    assert.equal(W.outcomeWord('affirmative'),'Agreed to');
    assert.equal(W.outcomeWord('negative'),'Not agreed to');
    assert.equal(W.outcomeWord('',{ayes:30,noes:10}),'Agreed to');
    assert.equal(W.outcomeWord('',{ayes:10,noes:10}),'Not agreed to');
  });
  test('no reading vote, or a file the app would refuse, is null',()=>{
    const file=fixture('recent-divisions.json');
    assert.equal(W.widgetVote({...file,divisions:file.divisions.filter(r=>!/reading$/i.test(r.stage)||r.question_type)}),null);
    assert.equal(W.widgetVote({...file,divisions:[]}),null);
    assert.equal(W.widgetVote({...file,generated_at:'soon'}),null);
    assert.equal(W.widgetVote({...file,divisions:[...file.divisions,{...file.divisions[1],ayes:'many'}]}),null,'two unreadable rows of nine is past the allowance');
    assert.equal(W.widgetVote({...file,divisions:[{...file.divisions[1],ayes:-1}]}),null,'no readable row');
    for(const bad of [null,[],'x',{divisions:file.divisions}])assert.equal(W.widgetVote(bad),null);
  });
});

// sitting-days.json is the file im/sitting-days publishes (f8135b08b,
// scripts/build_sitting_days.py), trimmed to the days from 1 October 2026.
// Coverage ends 31 December 2026 and 2027 is listed as not published.
describe('the sitting calendar (the im/sitting-days file)',()=>{
  const real=()=>fixture('sitting-days.json');
  const SENATE=d=>({date:d,house:false,senate:true}),BOTH=d=>({date:d,house:true,senate:true});
  const Y2026={year:2026,source:'Parliament of Australia',as_at:'2026-09-14'};
  const NOT_2027={year:2027,status:'not_published'};
  // Sydney wall-clock time to an instant (AEDT, UTC+11, from 4 October to 5 April).
  const sydney=(y,m,d,h=9,min=5)=>Date.UTC(y,m-1,d,h-11,min);
  test('13 November: the rest of the 2026 calendar, which ends inside the window',()=>{
    assert.deepEqual(W.widgetSitting(real(),TODAY),{until:'2026-12-31',until_reason:'coverage_end',calendars:[Y2026],next_year:NOT_2027,
      days:[SENATE('2026-11-16'),SENATE('2026-11-17'),SENATE('2026-11-18'),SENATE('2026-11-19'),BOTH('2026-11-23'),BOTH('2026-11-24'),BOTH('2026-11-25'),BOTH('2026-11-26')]});
  });
  test('Sydney midnight: 23:59 on Sunday 15 November looks ahead to Monday; 00:00 makes Monday today',async()=>{
    const w=world();
    const before=(await W.composeWidgetToday(w.env,sydney(2026,11,15,23,59))).sitting;
    const after=(await W.composeWidgetToday(w.env,sydney(2026,11,16,0,0))).sitting;
    assert.equal(sydney(2026,11,16,0,0),Date.UTC(2026,10,15,13,0));
    assert.deepEqual(before.days[0],SENATE('2026-11-16'));assert.equal(before.days.length,8);
    assert.deepEqual(after.days[0],SENATE('2026-11-16'));assert.equal(after.days.length,8,'16 November is today and still listed');
    const nextDay=(await W.composeWidgetToday(w.env,sydney(2026,11,17,0,0))).sitting;
    assert.deepEqual(nextDay.days[0],SENATE('2026-11-17'));assert.equal(nextDay.days.length,7);
  });
  test('Sydney days across the daylight saving change (4 October 2026)',()=>{
    assert.equal(W.sydneyDay(Date.UTC(2026,9,3,13,59)),'2026-10-03');assert.equal(W.sydneyDay(Date.UTC(2026,9,3,14,0)),'2026-10-04');
    assert.equal(W.sydneyDay(Date.UTC(2026,9,4,12,59)),'2026-10-04');assert.equal(W.sydneyDay(Date.UTC(2026,9,4,13,0)),'2026-10-05');
  });
  test('26 November, the last 2026 sitting day: one day left',()=>{
    assert.deepEqual(W.widgetSitting(real(),'2026-11-26'),{until:'2026-12-31',until_reason:'coverage_end',calendars:[Y2026],next_year:NOT_2027,days:[BOTH('2026-11-26')]});
  });
  test('27 November: no sitting day before the calendar ends, and 2027 is not published',()=>{
    assert.deepEqual(W.widgetSitting(real(),'2026-11-27'),{until:'2026-12-31',until_reason:'coverage_end',calendars:[Y2026],next_year:NOT_2027,days:[]});
    assert.deepEqual(W.widgetSitting(real(),'2026-12-31'),{until:'2026-12-31',until_reason:'coverage_end',calendars:[Y2026],next_year:NOT_2027,days:[]});
  });
  test('1 January 2027 while 2027 is not published: the calendar has run out, said as data, not null',async()=>{
    const expired={until:'2026-12-31',until_reason:'expired',calendars:[],next_year:NOT_2027,days:[]};
    assert.deepEqual(W.widgetSitting(real(),'2027-01-01'),expired);
    const w=world();
    assert.equal((await W.composeWidgetToday(w.env,sydney(2026,12,31,23,59))).sitting.until_reason,'coverage_end');
    const response=await W.appWidgetToday(new Request('https://opax.test/api/app/v1/widget/today'),w.env,sydney(2027,1,1,0,0));
    assert.equal(response.status,200);assert.deepEqual((await response.json()).sitting,expired);
    assert.deepEqual(W.widgetSitting(real(),'2027-06-30'),expired);
  });
  test('once the next year is published: a window across two years, each year with its own source',()=>{
    // 2027 entries are invented, in the shape the builder writes when a second year is published.
    const file=real();
    file.coverage.last='2027-12-31';file.expires='2027-12-31';
    file.years[1]={year:2027,status:'published',source:{...file.years[0].source,title:'Parliamentary Sittings 2027',published:'2026-12-10'}};
    file.days.push(BOTH('2027-02-02'),BOTH('2027-02-03'));
    assert.deepEqual(W.widgetSitting(file,'2026-12-05'),{until:'2027-02-02',until_reason:'window',
      calendars:[Y2026,{year:2027,source:'Parliament of Australia',as_at:'2026-12-10'}],next_year:null,days:[BOTH('2027-02-02')]});
    assert.deepEqual(W.widgetSitting(file,'2026-10-01').calendars,[Y2026],'a window inside one year (1 Oct to 29 Nov) names one calendar');
  });
  test("as_at is the year's own publication date, never the file's build date",()=>{
    const file=real();file.years[0].source.published=null;
    const sitting=W.widgetSitting(file,TODAY);
    assert.deepEqual(sitting.calendars,[{year:2026,source:'Parliament of Australia',as_at:null}]);
    assert.doesNotMatch(JSON.stringify(sitting),/2026-11-13/,'the top-level published (build) date never appears');
    const noYears=real();delete noYears.years;
    assert.deepEqual(W.widgetSitting(noYears,TODAY).calendars,[{year:2026,source:null,as_at:null}]);
    assert.equal(W.widgetSitting(noYears,TODAY).next_year,null);
  });
  test('a missing chamber flag is not sitting; unknown fields are ignored',()=>{
    const file=real();file.days=[{date:'2026-11-23',senate:true,note:'x'},{date:'2026-11-24'},{date:'2026-11-25',house:true,senate:null}];file.extra={a:1};
    assert.deepEqual(W.widgetSitting(file,TODAY).days,[SENATE('2026-11-23'),{date:'2026-11-25',house:true,senate:false}]);
  });
  test('a missing or unreadable file, or one that starts after today, is null',()=>{
    const bad=[
      f=>null,f=>[],f=>'calendar',f=>{delete f.days},f=>{f.days='soon'},f=>{delete f.coverage},f=>{f.coverage.last='soon'},
      f=>{f.coverage={first:'2026-12-31',last:'2026-01-01'}},f=>{f.expires='next year'},f=>{f.schema_version=2},f=>{f.timezone='UTC'},
      f=>{f.years='2026'},f=>{delete f.years[1].status},f=>{f.years[1].year='2027'},f=>{f.years.push({year:2026,status:'published'})},
      f=>{f.years[0].source='APH'},f=>{f.years[0].source.published='September'},f=>{f.years[0].source.publisher=3},
      f=>{f.days.push(BOTH('2026-02-30'))},f=>{f.days.push({date:'2026-12-08',house:'yes',senate:false})},f=>{f.days.push(SENATE('2026-11-23'))},
      f=>{f.days.push({house:true,senate:true})},f=>{f.days.push('2026-12-08')},f=>{f.days.push(BOTH('2026-12-08T00:00:00Z'))},
      f=>{f.coverage={first:'2027-01-01',last:'2027-12-31'};f.expires='2027-12-31'},
    ];
    for(const change of bad){const f=real();const out=change(f);assert.equal(W.widgetSitting(out===undefined?f:out,TODAY),null,String(change))}
  });
  const published=new URL('../public/parliament/sitting-days.json',import.meta.url);
  test('the published calendar in this tree reads, in the shape this reader expects',{skip:!existsSync(published)&&'public/parliament/sitting-days.json is not in this tree yet (im/sitting-days)'},()=>{
    const file=JSON.parse(readFileSync(published,'utf8'));
    const sitting=W.widgetSitting(file,file.coverage.first);
    assert.ok(sitting,'the published file reads');
    assert.ok(sitting.calendars.every(c=>c.source),'every year in the window names its source');
    assert.equal(W.widgetSitting(file,W.addDays(file.expires,1)).until_reason,'expired');
  });
});

describe('the body stays under 4 KB',()=>{
  const long=n=>'Example '+'Very Long Title Words '.repeat(n);
  test('a realistic worst case fits with every sitting day kept',()=>{
    const days=Array.from({length:60},(_,i)=>({date:W.addDays(TODAY,i),house:true,senate:true})).filter(d=>![0,6].includes(new Date(d.date).getUTCDay()));
    const body={version:1,generated:'2026-11-12T20:00:00Z',
      edition:{date:TODAY,kind:'grant',kind_short:'Grant program',card_title:'A'.repeat(80)+'…',line:long(10).trim(),path:'/money/grants/federal/recipient/abn%3A00000000000?award=GA000000'},
      vote:{date:TODAY,chamber:'House of Representatives',stage:'Second reading',title:long(14).trim(),outcome:'Not agreed to',ayes:150,noes:150,path:'/bill/au-federal-r9999?division=house-2026-11-13-99'},
      sitting:{until:W.addDays(TODAY,59),until_reason:'window',calendars:[{year:2026,source:'Parliament of Australia',as_at:'2026-09-14'},{year:2027,source:'Parliament of Australia',as_at:'2026-12-10'}],next_year:{year:2028,status:'not_published'},days}};
    assert.ok(new TextEncoder().encode(JSON.stringify(body)).length<=W.WIDGET_MAX_BYTES);
    assert.equal(W.fitBody(body),body);
  });
  test('past 4 KB the far end of the sitting list goes first and until follows it',()=>{
    const days=Array.from({length:60},(_,i)=>({date:W.addDays(TODAY,i),house:true,senate:true}));
    const body={version:1,generated:null,edition:{date:TODAY,kind:'bill',kind_short:'Bill',card_title:'A'.repeat(81),line:long(20),path:'/bill/x'},
      vote:{date:TODAY,chamber:'Senate',stage:'Third reading',title:long(20),outcome:'Agreed to',ayes:1,noes:0,path:'/bill/x?division=1'},
      sitting:{until:W.addDays(TODAY,59),until_reason:'coverage_end',calendars:[{year:2026,source:'s',as_at:null},{year:2027,source:'s',as_at:null}],next_year:null,days}};
    const fitted=W.fitBody(body);
    assert.ok(new TextEncoder().encode(JSON.stringify(fitted)).length<=W.WIDGET_MAX_BYTES);
    assert.ok(fitted.sitting.days.length<60&&fitted.sitting.days.length>0);
    assert.deepEqual(fitted.sitting.days,days.slice(0,fitted.sitting.days.length));
    assert.equal(fitted.sitting.until,W.addDays(fitted.sitting.days.at(-1).date,0),'the list is complete through until');
    assert.equal(fitted.sitting.until_reason,'window','the calendar runs on past the shortened list');
    assert.deepEqual(fitted.sitting.calendars.map(c=>c.year),[...new Set([2026,Number(fitted.sitting.until.slice(0,4))])]);
  });
});

// The route, against the real journal schema and a static-asset binding.
function world({edition=billEdition(),posted=true,assets={}}={}){
  const db=new DatabaseSync(':memory:');
  for(const file of ['0005_social_publication.sql','0007_social_stories.sql','0008_social_bluesky.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  if(edition){
    db.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(edition.date,edition.subject,JSON.stringify(edition),'2026-10-03T22:00:07.000Z');
    db.prepare('INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,?,?,?,?)').run(edition.date,'x',posted?'posted':'failed',posted?'fixture-post':null,'2026-10-03T22:01:00Z');
  }
  const files={'/divisions/recent.json':fixture('recent-divisions.json'),'/parliament/sitting-days.json':fixture('sitting-days.json'),...assets};
  const sql=[],reads=[];
  const env={
    COMMUNITY_DB:{prepare(text){assert.match(text,/^SELECT /);assert.doesNotMatch(text,/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);sql.push(text);let args=[];
      return {bind(...values){args=values;return this},async first(){return db.prepare(text).get(...args)??null}}}},
    ASSETS:{async fetch(req){
      const url=new URL(req.url);reads.push(url.pathname);assert.equal(url.origin,'https://app-assets.invalid');assert.equal(url.search,'');
      assert.equal([...req.headers].length,0,'asset reads carry no client header');
      const value=files[url.pathname];
      if(value instanceof Response)return value;
      if(value===undefined)return new Response('Not found',{status:404});
      return new Response(typeof value==='string'?value:JSON.stringify(value),{headers:{'content-type':'application/json'}});
    }},
  };
  const call=(headers={},method='GET',path='/api/app/v1/widget/today')=>W.appWidgetToday(new Request('https://opax.test'+path,{method,headers}),env,at);
  return {db,env,sql,reads,call};
}
const size=text=>new TextEncoder().encode(text).length;

describe('GET /api/app/v1/widget/today',()=>{
  test('200: the composed file, its cache header and ETag, under 4 KB, no cookie',async()=>{
    const w=world();
    const response=await w.call();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'),'public, max-age=900');
    assert.match(response.headers.get('etag'),/^W\/"[a-f0-9]{64}"$/);
    assert.equal(response.headers.get('set-cookie'),null);
    const text=await response.text();
    assert.ok(size(text)<4096,`${size(text)} bytes`);
    assert.deepEqual(JSON.parse(text),{version:1,generated:'2026-11-12T20:00:00Z',
      edition:{date:'2026-10-04',kind:'bill',kind_short:'Bill',card_title:'Wage Justice for Early Childhood Education and Care Workers…',line:'Education portfolio',path:'/bill/au-federal-r7529'},
      vote:{date:'2026-11-12',chamber:'Senate',stage:'Third reading',title:'Example Tax Bill 2026',outcome:'Agreed to',ayes:37,noes:30,path:'/bill/au-federal-r9001?division=senate-2026-11-12-10'},
      sitting:{until:'2026-12-31',until_reason:'coverage_end',calendars:[{year:2026,source:'Parliament of Australia',as_at:'2026-09-14'}],next_year:{year:2027,status:'not_published'},
        days:[{date:'2026-11-16',house:false,senate:true},{date:'2026-11-17',house:false,senate:true},{date:'2026-11-18',house:false,senate:true},{date:'2026-11-19',house:false,senate:true},
          {date:'2026-11-23',house:true,senate:true},{date:'2026-11-24',house:true,senate:true},{date:'2026-11-25',house:true,senate:true},{date:'2026-11-26',house:true,senate:true}]}});
    assert.deepEqual(w.reads.sort(),['/bills/au-federal-r7529.json','/divisions/recent.json','/parliament/sitting-days.json'],'fixed paths only');
  });
  test('304 on a matching If-None-Match, in any of its forms; 200 again when it does not match',async()=>{
    const w=world();
    const etag=(await w.call()).headers.get('etag');
    for(const tag of [etag,etag.slice(2),`"other", ${etag}`,'*']){
      const cached=await w.call({'if-none-match':tag});
      assert.equal(cached.status,304,tag);assert.equal(await cached.text(),'');
      assert.equal(cached.headers.get('etag'),etag);assert.equal(cached.headers.get('cache-control'),'public, max-age=900');
    }
    assert.equal((await w.call({'if-none-match':'W/"stale"'})).status,200);
  });
  test('the same records give the same ETag; a day that drops a sitting day gives another',async()=>{
    const w=world();
    const first=(await w.call()).headers.get('etag');
    assert.equal((await w.call()).headers.get('etag'),first);
    const on=days=>W.appWidgetToday(new Request('https://opax.test/api/app/v1/widget/today'),w.env,at+days*86_400_000);
    assert.equal((await on(1)).headers.get('etag'),first,'14 Nov: the same file as 13 Nov, so the same ETag');
    assert.notEqual((await on(4)).headers.get('etag'),first,'17 Nov: 16 Nov has gone from the list');
  });
  test("the bill's own short title reaches the card title",async()=>{
    const w=world({assets:{'/bills/au-federal-r7529.json':{key:'au-federal-r7529',title:billEdition().title,short_title:'Early childhood pay'}}});
    assert.equal((await (await w.call()).json()).edition.card_title,'Early childhood pay');
  });
  test('the member edition',async()=>{
    const w=world({edition:personEdition()});
    assert.deepEqual((await (await w.call()).json()).edition,{date:'2026-10-06',kind:'politician',kind_short:'Parliamentarian',card_title:'Jordan Avery',line:'Liberal · Wattle, NSW',path:'/subject/person/Jordan%20Avery'});
    assert.ok(!w.reads.some(p=>p.startsWith('/bills/')));
  });
  test('the edition latest serves: the same query, the newest posted on or before today',async()=>{
    const w=world();
    await w.call();
    const source=readFileSync(new URL('../src/app-edition.ts',import.meta.url),'utf8');
    const latest=/value === 'latest'\s*\?\s*env\.COMMUNITY_DB\.prepare\(`([^`]+)`\)/.exec(source)?.[1];
    assert.ok(latest);assert.deepEqual(w.sql,[latest]);
    const later={...billEdition(),date:'2026-11-14',subject:'bill:au-federal-r7530',url:'https://opax.com.au/bill/au-federal-r7530'};
    w.db.prepare('INSERT INTO social_editions VALUES(?,?,?,?)').run(later.date,later.subject,JSON.stringify(later),'2026-11-13T22:00:00Z');
    w.db.prepare("INSERT INTO social_deliveries(edition_date,channel,status,post_id,updated_at) VALUES(?,'x','posted','p',?)").run(later.date,'2026-11-13T22:01:00Z');
    assert.equal((await (await w.call()).json()).edition.date,'2026-10-04','a future edition is not out yet');
  });
  test('no edition posted: edition null and still 200; a stored record the app refuses is null too',async()=>{
    for(const w of [world({edition:null}),world({posted:false}),world({edition:{...billEdition(),url:'https://opax.com.au/reports/housing'}})]){
      const response=await w.call();
      assert.equal(response.status,200);
      const body=await response.json();
      assert.equal(body.edition,null);assert.ok(body.vote);assert.ok(body.sitting);
      assert.equal(body.generated,'2026-11-12T20:00:00Z');
    }
    const broken=world();broken.db.exec("UPDATE social_editions SET post_json='{not json'");
    assert.equal((await (await broken.call()).json()).edition,null);
  });
  test('no reading vote, or no divisions file: vote null and still 200',async()=>{
    const file=fixture('recent-divisions.json');
    for(const assets of [{'/divisions/recent.json':undefined},{'/divisions/recent.json':{...file,divisions:file.divisions.slice(0,1)}},
      {'/divisions/recent.json':'{not json'},{'/divisions/recent.json':new Response('<html></html>',{headers:{'content-type':'text/html'}})}]){
      const response=await world({assets}).call();
      assert.equal(response.status,200);
      const body=await response.json();
      assert.equal(body.vote,null);assert.ok(body.edition);assert.ok(body.sitting);
    }
  });
  test('no sitting calendar, or a malformed one: sitting null and still 200',async()=>{
    const file=fixture('sitting-days.json');
    for(const value of [undefined,{...file,coverage:{first:'2026-12-31',last:'2026-01-01'}},{...file,years:'2026'},{...file,days:'soon'},'{not json']){
      const response=await world({assets:{'/parliament/sitting-days.json':value}}).call();
      assert.equal(response.status,200);
      const body=await response.json();
      assert.equal(body.sitting,null);assert.ok(body.edition);assert.ok(body.vote);
    }
    const none=await world({edition:null,assets:{'/parliament/sitting-days.json':undefined,'/divisions/recent.json':undefined}}).call();
    assert.equal(none.status,200);
    assert.deepEqual(await none.json(),{version:1,generated:null,edition:null,vote:null,sitting:null});
  });
  test('a failing journal or asset binding is 503, not an empty file the widget would save',async()=>{
    const w=world();w.env.COMMUNITY_DB={prepare(){return {bind(){return this},async first(){throw Error('D1 down')}}}};
    for(const response of [await w.call(),await world({assets:{'/divisions/recent.json':new Response('',{status:503})}}).call()]){
      assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('retry-after'),'60');
      assert.deepEqual(await response.json(),{error:'widget_unavailable'});
    }
    const thrown=world();thrown.env.ASSETS={async fetch(){throw Error('binding')}};
    assert.equal((await thrown.call()).status,503);
  });
  test('reads no query string, cookie or client header beyond If-None-Match',async()=>{
    const w=world();
    const plain=await w.call();
    const noisy=await w.call({cookie:'session=abc',authorization:'Bearer x','user-agent':'OPAX-iOS-Widget/1.2.0 (70)','accept-language':'en-AU','x-forwarded-for':'192.0.2.1'});
    assert.equal(noisy.headers.get('etag'),plain.headers.get('etag'));assert.equal(await noisy.text(),await plain.text());
    const read=[];
    const request=new Request('https://opax.test/api/app/v1/widget/today',{headers:{cookie:'session=abc','user-agent':'x','if-none-match':'"x"'}});
    const watched=new Proxy(request,{get(target,key){
      if(key==='headers')return new Proxy(target.headers,{get(h,k){
        if(['get','has'].includes(k))return name=>{read.push(String(name).toLowerCase());return h[k](name)};
        if(['entries','keys','values','forEach',Symbol.iterator].includes(k))return ()=>assert.fail('the handler listed the client headers');
        const v=Reflect.get(h,k);return typeof v==='function'?v.bind(h):v}});
      const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v}});
    assert.equal((await W.appWidgetToday(watched,w.env,at)).status,200);
    assert.deepEqual([...new Set(read)],['if-none-match']);
    const query=await w.call({},'GET','/api/app/v1/widget/today?seat=wattle');
    assert.equal(query.status,400);assert.deepEqual(await query.json(),{error:'invalid_query'});assert.equal(query.headers.get('cache-control'),'no-store');
  });
  test('HEAD has no body; other methods are refused',async()=>{
    const w=world();
    const head=await w.call({},'HEAD');
    assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('cache-control'),'public, max-age=900');
    for(const method of ['POST','PUT','DELETE']){
      const refused=await w.call({},method);
      assert.equal(refused.status,405);assert.equal(refused.headers.get('allow'),'GET, HEAD');
    }
  });
});

test('the module stays pure: only the journal, app-http and app-edition, and no outbound fetch',async()=>{
  const built=await build({entryPoints:[new URL('../src/app-widget.ts',import.meta.url).pathname],bundle:true,write:false,metafile:true,platform:'browser',format:'esm',external:['node:crypto']});
  assert.deepEqual(Object.keys(built.metafile.inputs).map(p=>p.split('/').at(-1)).sort(),['app-edition.ts','app-http.ts','app-widget.ts']);
  const source=readFileSync(new URL('../src/app-widget.ts',import.meta.url),'utf8');
  assert.deepEqual(source.match(/\bfetch\s*\(/g),['fetch('],'one fetch call');
  assert.match(source,/env\.ASSETS\.fetch\(new Request\('https:\/\/app-assets\.invalid' \+ path\)\)/);
  assert.doesNotMatch(source,/\bcookies?\b.*\bget\(|\.searchParams\b|user-agent/i);
  const index=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
  const route=index.indexOf("if (url.pathname === '/api/app/v1/widget/today') return communityResponse(await appWidgetToday(request, env))");
  assert.ok(route>0);assert.ok(route<index.indexOf("if (url.pathname.startsWith('/api/app/')) return communityResponse(appJson(request, {error:'not_found'}, 404))"));
});

test('through the real Worker: dispatched before the generic app 404, security headers on, no cookie, network block kept',async()=>{
  const compiled=await build({entryPoints:[new URL('../src/index.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*'],plugins:[{name:'forbid-image-rendering',setup(b){
    b.onResolve({filter:/^\.\/og-render$/},()=>({path:'forbidden-renderer',namespace:'widget-proof'}));
    b.onLoad({filter:/.*/,namespace:'widget-proof'},()=>({contents:'export function renderOgPng(){throw Error("Forbidden OG call")}; export const renderOgJpeg=renderOgPng; export const renderStoryJpeg=renderOgPng;',loader:'js'}));
  }}]});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const w=world();
  const fail=()=>{throw Error('Forbidden provider/model/social/email/proxy call')};
  const env={...w.env,COMMUNITY_ORIGIN:'https://opax.test',COMMUNITY_ENABLED:'false',VOICE_ENABLED:'false',STAGING_API:{fetch:fail},GENERATION_CACHE:{get:fail,put:fail},COMMUNITY_EMAIL:{send:fail}};
  const original=globalThis.fetch;globalThis.fetch=fail;
  try{
    const call=(init={},cf)=>{const req=new Request('https://opax.test/api/app/v1/widget/today',init);if(cf)Object.defineProperty(req,'cf',{value:cf});return worker.fetch(req,env,{waitUntil:fail})};
    const response=await call({headers:{cookie:'session=abc'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'public, max-age=900');
    assert.equal(response.headers.get('set-cookie'),null);
    assert.ok(response.headers.get('content-security-policy'));assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    const body=await response.json();
    assert.equal(body.version,1);assert.equal(body.edition.card_title,'Wage Justice for Early Childhood Education and Care Workers…');assert.ok(body.vote);assert.ok(body.sitting);
    assert.equal((await call({headers:{'if-none-match':response.headers.get('etag')}})).status,304);
    const blocked=await call({},{asn:45102});
    assert.equal(blocked.status,403);assert.deepEqual(await blocked.json(),{error:'forbidden',reason:'network'});
  }finally{globalThis.fetch=original}
});
