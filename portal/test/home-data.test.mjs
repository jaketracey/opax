import test from 'node:test';
import assert from 'node:assert/strict';
import {newest,safeSource,partyLabelHTML,statusLabelHTML,sourceLineHTML,billRowHTML,declarationRowHTML,industryGroups,mapSpan,mapSourceHTML,coverageLineHTML} from '../public/home-data.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('recent lists use recording dates, retain ties, and exclude undated entries',()=>{
 const rows=[{id:1,date:'2026-09-01'},{id:2,date:'2026-09-19'},{id:3,date:'2026-09-19'},{id:4},{id:5,date:'2026-08-01'}];
 assert.deepEqual(newest(rows,'date',3).map(r=>r.id),[2,3,1]);
 assert.equal(rows[0].id,1);
});
test('source links cannot execute script or open unsupported URL schemes',()=>{
 assert.equal(safeSource('javascript:alert(1)'),null);
 assert.equal(safeSource('data:text/html,test'),null);
 assert.equal(safeSource('https://www.aph.gov.au/register'),'https://www.aph.gov.au/register');
});
test('the deployment excludes workbench assets and the review-only prototype',()=>{
 const ignore=readFileSync(new URL('../public/.assetsignore',import.meta.url),'utf8');
 assert.match(ignore,/^\/ui-workbench\.\*$/m);
 assert.match(ignore,/^\/home-prototype\.html$/m);
});
// The homepage's copy of the 2C labels and source line writes what app.js writes.
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const fnSource=name=>{
 const start=app.indexOf(`\nfunction ${name}(`); assert.ok(start>=0,name);
 let parens=0,body=start+app.slice(start).indexOf('(');
 for(;body<app.length;body++){ if(app[body]==='(') parens++; else if(app[body]===')'&&--parens===0) break; }
 let depth=0; for(let i=app.indexOf('{',body);i<app.length;i++){ if(app[i]==='{') depth++; else if(app[i]==='}'&&--depth===0) return app.slice(start,i+1); }
};
const constSource=name=>app.slice(app.indexOf(`const ${name} =`),app.indexOf('\n};',app.indexOf(`const ${name} =`))+3);
const appLabels=runInNewContext(`const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 ${constSource('PARTY_MAP')} ${fnSource('esc')} ${fnSource('hasEntityId')} ${fnSource('entityHrefAttr')} ${fnSource('safeUrl')} ${fnSource('fmtDate')}
 ${app.slice(app.indexOf('// labels:begin'),app.indexOf('// labels:end'))}
 ({partyChipHTML,statusLabelHTML,sourceLineHTML});`,{URL});
test('the homepage labels and source line match the shared helpers in app.js',()=>{
 for(const party of ['Labor','Liberal','Nationals','LNP','Greens','One Nation','Independent','JLN',"Australia's Voice",'Not recorded','',null]) assert.equal(partyLabelHTML(party),appLabels.partyChipHTML(party),String(party));
 for(const [word,tone] of [['Before parliament','active'],['Passed','done'],['Lapsed',undefined],['','done']]) assert.equal(statusLabelHTML(word,tone),appLabels.statusLabelHTML(word,tone));
 const opts=[{},{updated:'2026-10-03',source:'AEC annual returns',state:'totals are a floor',originals:[{label:'AEC Transparency Register',href:'https://transparency.aec.gov.au/'},{label:'Funding records',href:'/money/receipts'},{label:'x',href:'//evil.example'},{href:'javascript:alert(1)'}],asAt:'Financial years 1998–99 to 2025–26.',notes:['<b>a</b>',''],licence:'CC BY 4.0'},{updated:'2026-10-04T16:27:54+00:00',source:'Parliament <of> Australia'}];
 for(const o of opts) assert.equal(sourceLineHTML(o),appLabels.sourceLineHTML(o));
});
test('bill rows lead with a status label and the introduction date',()=>{
 const html=billRowHTML({key:'au-federal-r1',title:'Long',short_title:'A <Bill> 2026',status:'before_parliament',introduced:'2026-09-17',portfolio:'Health',jurisdiction:'federal'});
 assert.match(html,/<span class="ui-status" data-tone="active">Before parliament<\/span> <span>Introduced <time datetime="2026-09-17">17 Sep 2026<\/time><\/span>/);
 assert.match(html,/href="\/bill\/au-federal-r1">A &lt;Bill&gt; 2026<\/a>/);
 assert.match(html,/<p class="hp-row-detail">Health<\/p>/);
 assert.match(billRowHTML({key:'d',title:'Draft',status:'exposure_draft',introduced:'2026-08-01'}),/data-tone="draft">Exposure draft<\/span> <span>Released/);
 assert.match(billRowHTML({key:'q',title:'Q',status:'second_reading',introduced:'2026-08-01',jurisdiction:'qld'}),/data-tone="ended">Second reading<\/span> <span>Introduced .* · Queensland/);
});
test('declaration rows: official portraits only, the party from the roster, the register one tap away',()=>{
 const item={name:'Chris Bowen',description:'Two "tickets"',bucket:'gifts',kind:'addition',date:'2026-10-07',url:'https://www.aph.gov.au/register'};
 const parties=new Map([['chris bowen','Labor']]);
 const html=declarationRowHTML(item,{photos:{'chris bowen':'10060'},parties});
 assert.match(html,/<img class="hp-portrait" src="\/photos\/10060.webp" alt=""/);
 assert.match(html,/party-alp/);
 assert.match(html,/“Two &quot;tickets&quot;”/);
 assert.match(html,/Gift · <span>recorded <time datetime="2026-10-07">7 Oct 2026<\/time><\/span> · <a href="https:\/\/www.aph.gov.au\/register" rel="noopener" target="_blank" aria-label="Register entry for Chris Bowen">Register/);
 // A Commons portrait needs its credit beside it, so the row shows the blank circle.
 assert.match(declarationRowHTML(item,{photos:{'chris bowen':'wd-Q1'},parties}),/<span class="hp-portrait" aria-hidden="true"><\/span>/);
 const removed=declarationRowHTML({...item,kind:'deletion',url:'javascript:alert(1)'});
 assert.match(removed,/<span class="ui-status" data-tone="ended">Removed<\/span> Gift/);
 assert.doesNotMatch(removed,/javascript:|Register/);
 assert.doesNotMatch(removed,/ui-party/);
});
test('the map chips come from the export: industries by donors in the map, largest first',()=>{
 const money=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
 const groups=industryGroups(money);
 const donors=money.nodes.filter(n=>n.kind==='donor');
 assert.equal(groups.reduce((sum,g)=>sum+g.count,0),donors.length);
 assert.equal(new Set(groups.map(g=>g.key)).size,groups.length);
 assert.ok(!groups.some(g=>g.key==='parties'),'party nodes are not an industry');
 for(let i=1;i<groups.length;i++) assert.ok(groups[i-1].count>=groups[i].count);
 assert.match(groups[0].label,/^[A-Z]/);
 assert.equal(mapSpan({coverage:'financial years 1998-99 to 2025-26'}),'1998–99 to 2025–26');
 assert.match(mapSpan(money.meta),/^\d{4}–\d{2} to \d{4}–\d{2}$/);
 assert.equal(mapSpan({}),'');
 const line=mapSourceHTML(money.meta);
 assert.match(line,new RegExp(`Updated ${money.meta.generated.slice(8,10).replace(/^0/,'')} [A-Z][a-z]{2} ${money.meta.generated.slice(0,4)}`));
 assert.match(line,/AEC annual returns/);
 assert.match(line,/href="https:\/\/transparency.aec.gov.au\/"/);
});
test('the footer coverage line is dated, and only the link survives a failed read',()=>{
 const corpus=JSON.parse(readFileSync(new URL('../public/corpus.json',import.meta.url),'utf8'));
 const line=coverageLineHTML(corpus);
 assert.match(line,new RegExp(`^${corpus.collected_speeches.toLocaleString('en-AU')} speeches and [\\d,]+ donations classified, as at \\d{1,2} [A-Z][a-z]{2} \\d{4} · <a href="/stats">Sources and coverage</a>$`));
 assert.equal(coverageLineHTML(null),'<a href="/stats">Sources and coverage</a>');
 assert.equal(coverageLineHTML({version:'2026-10-09',collected_speeches:1,sources:[]}),'<a href="/stats">Sources and coverage</a>');
});
// The page itself: five blocks, one primary action, no in-site arrows, every block with figures sourced.
const home=readFileSync(new URL('../public/home.html',import.meta.url),'utf8');
const main=home.slice(home.indexOf('<main'),home.indexOf('</main>'));
test('the homepage is five blocks with one primary action and no in-site arrows',()=>{
 assert.equal((main.match(/class="hp-research"|class="hp-section[ "]/g)||[]).length,5);
 assert.equal((main.match(/data-variant="primary"/g)||[]).length,2,'Ask, and Search in its hidden panel');
 assert.match(main,/<div id="hp-search-panel" hidden>[^]*data-variant="primary"[^]*<\/form>\s*<\/div>/);
 assert.doesNotMatch(main,/→/);
 for(const arrow of main.matchAll(/<a [^>]*>[^<]*(?:<span[^>]*>)?↗/g)) assert.match(arrow[0],/href="https?:\/\//,'↗ only on links that leave OPAX');
 assert.doesNotMatch(main,/hp-spotlight|hp-ency|hp-indexed|hp-coverage|hp-topic-list/);
 assert.equal((main.match(/data-accent=/g)||[]).length,1,'one accent per view');
 for(const id of ['hp-map-source','hp-bills-source','hp-declared-source']) assert.match(main,new RegExp(`id="${id}"><details class="ui-pop ui-source"[^]*?Updated \\d{1,2} [A-Z][a-z]{2} \\d{4}`));
 assert.match(home,/<link rel="stylesheet" href="\/ui-source\.css\?v=[\w]+"/);
 assert.match(home,/<script src="\/ui-source\.js\?v=[\w]+" defer><\/script>/);
});
