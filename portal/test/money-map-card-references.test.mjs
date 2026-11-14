// The money map's entity card keeps the plain name and its sums; the return
// references behind them sit in the Sources dropdown, never in the card body.
// The WebGL engine is swapped for a no-op stub so the real card code runs in jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const engineStub = `
export const webglAvailable = () => globalThis.__testMoneyMapWebgl !== false
export const easeInOut = (t) => t
const answers = { viewOwned: false, focusOwned: false, reducedMotion: true, viewAngles: { theta: 0, phi: 1 } }
export class KnowledgeMapEngine {
  async setDataCooperatively(_data, isCurrent = () => true) { return isCurrent() }
  constructor() {
    return new Proxy(this, { get: (target, key) => key in target ? target[key] : key in answers ? answers[key] : () => null })
  }
}`;
const bundled = await build({
  entryPoints: [new URL('../graph/index.ts', import.meta.url).pathname], bundle: true, platform: 'neutral', format: 'esm', write: false,
  mainFields: ['module', 'main'], logLevel: 'silent',
  plugins: [{ name: 'engine-stub', setup(b) {
    b.onResolve({ filter: /map3d-engine(\.ts)?$/ }, () => ({ path: 'engine-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: engineStub, loader: 'js' }));
  } }],
});
const map = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

// Invented fixture names; a donor with more references than the dropdown lists in full.
const returns = Array.from({ length: 13 }, (_, i) => ({ return_type: 'AEC annual return', year: `${2010 + i}-${String(11 + i).slice(-2)}`, return_id: `RETURN-FIXTURE-${i}`, url: 'https://example.test/returns' }));
const figures = { total: 500, count: 5, firstYear: 2010, lastYear: 2022, byYear: { 2010: [500, 5] } };
const graph = {
  meta: { sourceShort: 'AEC annual returns', coverage: 'Invented fixture', minYear: 2010, maxYear: 2022 },
  nodes: [
    { id: 'donor:fixture-holdings', label: 'Fixture Holdings Pty Ltd', source_name: 'Fixture Holdings Pty Ltd', kind: 'donor', industry: 'mining', group: 'mining', ...figures,
      match: { confidence: 0.9, method: 'rule', href: null }, returnReferences: returns },
    { id: 'party:Labor', label: 'Labor', kind: 'party', industry: 'parties', group: 'parties', ...figures },
  ],
  edges: [{ source: 'donor:fixture-holdings', target: 'party:Labor', ...figures }],
};
const REFERENCE = /RETURN-FIXTURE|AEC annual return|return reference/;

async function mount(data=graph,options={}, {url='https://opax.test/money',webgl=true}={}) {
  const dom = new JSDOM('<div id="map" style="width:390px;height:600px"></div>', { url, pretendToBeVisual: true });
  const { window } = dom;
  const globals = { window, document: window.document, HTMLElement: window.HTMLElement, HTMLButtonElement: window.HTMLButtonElement,
    HTMLAnchorElement: window.HTMLAnchorElement, CustomEvent: window.CustomEvent, Event: window.Event, getComputedStyle: window.getComputedStyle,
    location: window.location, history: window.history, localStorage: window.localStorage, navigator: window.navigator,
    __testMoneyMapWebgl: webgl,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout };
  window.matchMedia = globals.matchMedia;
  // node --test runs each file in its own process, and the map keeps timers
  // queued after destroy(), so the jsdom globals stay for the file's lifetime.
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const handle = await map.mountMoneyMap(window.document.querySelector('#map'), structuredClone(data), { chrome: 'full',...options });
  return { window, handle };
}

const publishedGraph=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
const receiptRanks={
  donation_only:[['Liberal',1093352],['Labor',1067066],['Nationals',258500],['LNP',50000]],
  all_types:[['Labor',4706193],['Liberal',3538879],['Nationals',343740],['LNP',86300]],
};

for(const webgl of [true,false])test(`${webgl?'map':'2D fallback'} receipt selection survives reload and shared links without adding history entries`,async()=>{
  async function open(url){
    let view;
    const mounted=await mount(publishedGraph,{onViewChange:next=>{view=next}},{url,webgl});
    const select=()=>mounted.window.document.querySelector('select[aria-label="Receipt measure"]');
    function assertMeasure(measure){
      assert.equal(select()?.value,measure);
      const nodes=new Map(view.nodes.map(n=>[n.id,n]));
      const totals=new Map();
      for(const edge of view.edges){
        assert.equal(nodes.get(edge.source)?.industry,'gambling');
        assert.equal(nodes.get(edge.target)?.kind,'party');
        const party=nodes.get(edge.target).label;
        totals.set(party,(totals.get(party)||0)+edge.total);
      }
      assert.deepEqual([...totals].sort((a,b)=>b[1]-a[1]),receiptRanks[measure]);
      assert.equal([...totals.values()].reduce((a,b)=>a+b,0),measure==='donation_only'?2468918:8675112);
    }
    function choose(measure){
      const history=mounted.window.history;
      const length=history.length;
      const state={kept:'map host state'};
      history.replaceState(state,'');
      const replace=history.replaceState.bind(history);
      let replacements=0;
      history.replaceState=(...args)=>{replacements++;return replace(...args)};
      history.pushState=()=>assert.fail('receipt selection must not add a history entry');
      select().value=measure;
      select().dispatchEvent(new mounted.window.Event('change',{bubbles:true}));
      assert.equal(replacements,1);
      assert.equal(history.length,length);
      assert.deepEqual(history.state,state);
      const url=new URL(mounted.window.location.href);
      assert.equal(url.searchParams.get('receipt'),measure==='donation_only'?'donations':null);
      assert.equal(url.searchParams.get('industry'),'gambling');
      assert.equal(url.searchParams.get('type'),'receipts');
      assert.equal(url.searchParams.get('keep'),'shared');
      assert.equal(url.hash,'#connections');
      assertMeasure(measure);
      return url.href;
    }
    return {...mounted,assertMeasure,choose};
  }
  const initial=await open('https://opax.test/money?industry=gambling&type=receipts&keep=shared#connections');
  let donationLink,allTypesLink;
  try{
    initial.assertMeasure('all_types');
    donationLink=initial.choose('donation_only');
    allTypesLink=initial.choose('all_types');
  }finally{initial.handle.destroy()}
  // A fresh document models a reload; /map is the other shareable map route.
  for(const link of [donationLink,allTypesLink])for(const pathname of ['/money','/map']){
    const shared=new URL(link);shared.pathname=pathname;
    const restored=await open(shared.href);
    try{
      const measure=shared.searchParams.has('receipt')?'donation_only':'all_types';
      restored.assertMeasure(measure);
      restored.choose(measure==='donation_only'?'all_types':'donation_only');
    }finally{restored.handle.destroy()}
  }
});

test('map controls and cards switch the typed measure and retain it through a year filter',async()=>{
  const typed=structuredClone(graph);
  typed.meta.receipt_types={available:true};
  const cells={by_type:{donation_received:100,other_receipt:400},by_type_year:{'2020-21':{donation_received:[25,1],other_receipt:[150,2]},'2021-22':{donation_received:[75,2],other_receipt:[250,3]}}};
  for(const x of [...typed.nodes,...typed.edges])Object.assign(x,cells,{total:999999,firstYear:2020,lastYear:2021});
  const views=[];
  const {window,handle}=await mount(typed,{onViewChange:view=>views.push(view)});
  try{
    const select=window.document.querySelector('select[aria-label="Receipt measure"]');
    assert.ok(select);
    assert.equal(views.at(-1).edges[0].total,500);
    handle.select(typed.nodes[0].id);
    assert.match(window.document.querySelector('.mm-card').textContent,/All receipt types/);
    select.value='donation_only';select.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(views.at(-1).edges[0].total,100);
    assert.match(window.document.querySelector('.mm-card').textContent,/Donation-only/);
    assert.equal(new URL(window.location.href).searchParams.get('receipt'),'donations');
    handle.setFilters({},new URLSearchParams('receipt=donations&from=2020&to=2020'));
    assert.equal(views.at(-1).edges[0].total,25);
    assert.equal(views.at(-1).nodes[0].total,25);
  }finally{handle.destroy()}
});

test('the entity card shows no return references for a donor or a party; Sources carries them', async () => {
  const { window, handle } = await mount();
  try {
    const card = () => window.document.querySelector('.mm-card');
    handle.select('donor:fixture-holdings');
    const donorCard = card();
    assert.ok(donorCard.textContent.includes('Fixture Holdings Pty Ltd'), 'the donor card renders');
    assert.ok(donorCard.querySelector('.mm-card-title a') === null, 'the name stays plain text');
    assert.equal(donorCard.querySelector('.donor-return-reference'), null);
    const slot = donorCard.querySelector('.mm-evidence');
    assert.ok(slot?.hidden, 'the Sources dropdown starts closed');
    const body = donorCard.cloneNode(true);
    body.querySelector('.mm-evidence').remove();
    assert.doesNotMatch(body.innerHTML, REFERENCE, 'no return reference outside the Sources dropdown');
    assert.match(body.textContent, /Where it went/);
    assert.match(body.textContent, /Search/); assert.match(body.textContent, /Explain/); assert.match(body.textContent, /Sources/);

    const refs = [...slot.querySelectorAll('.mm-return-refs li')].map((li) => li.textContent);
    assert.equal(refs.length, 10);
    assert.equal(refs[0], 'AEC annual return · 2010-11 · RETURN-FIXTURE-0');
    assert.match(slot.querySelector('.mm-return-refs').textContent, /3 more return references in the data export/);
    const sources = [...donorCard.querySelectorAll('button.mm-action')].find((b) => b.textContent.includes('Sources'));
    assert.equal(sources.getAttribute('aria-controls'), slot.id);

    handle.select('party:Labor');
    const partyCard = card();
    assert.match(partyCard.textContent, /Top receipt sources shown on the map/);
    assert.match(partyCard.textContent, /Fixture Holdings Pty Ltd/);
    assert.doesNotMatch(partyCard.innerHTML, REFERENCE, 'party rows carry the plain donor name');
  } finally { handle.destroy(); }
});

// ---- Donors only their own donor returns declare (hotfix after #347) ----------
// Ten released donors have empty typed cells: no party return lists a receipt from
// them, so their typed total is 0. The card on their page (the donor page's map,
// mounted as app.js mountSubjectMap mounts it) said "$0 · Disclosed across 0
// receipt records". It now says no party return lists one, and what the donor's
// own returns declare, and the map draws no $0 flow for them.
const ZERO=/\$0(?![\d.,])|\b0 receipt records\b/;
async function subjectCard(id){
  let view;
  const mounted=await mount(publishedGraph,{focus:id,subject:id,chrome:'mini',reveal:true,openCard:true,scrub:true,onViewChange:next=>{view=next}});
  const card=mounted.window.document.querySelector('.mm-card');
  return {...mounted,view,card,text:card?.hidden===false?card.textContent:''};
}
const DECLARED_CARDS=[
  ['donor:goldman sachs australia','Goldman Sachs Australia Pty Ltd',"Its own donor returns declare $847,340 to federal parties across 65 records: Liberal $513,590 (2002-03 to 2010-11); Labor $330,450 (2002-03 to 2010-11); Nationals $3,300 (2006-07)."],
  ['donor:virgin australia airlines','Virgin Australia Airlines Pty Ltd',"Its own donor returns declare $81,000 to federal parties across 6 records: Labor $42,000"],
  ['donor:ventyx','Ventyx Pty Ltd',"Its own donor return declares $22,000 to Liberal across 1 record (2011-12)."],
];
for(const [id,label,declared] of DECLARED_CARDS)test(`subject map card: ${label} shows the declared line, never $0 or 0 receipt records`,async()=>{
  const {handle,view,card,text}=await subjectCard(id);
  try{
    assert.ok(text.includes(label),'the subject card is open');
    assert.doesNotMatch(text,ZERO);
    assert.ok(text.includes('No party return lists a receipt from this donor.'),'the no-receipt line');
    assert.ok(text.includes(declared),text);
    assert.match(text,/not receipts a party reported/);
    assert.equal(card.querySelector('.mm-card-total'),null,'no headline figure');
    assert.doesNotMatch(text,/Where it went|All receipt types/,'no list of $0 rows and no measure label for a figure it does not have');
    assert.deepEqual(view.edges.filter(e=>e.source===id),[],'no $0 flow on the map');
    assert.ok(![...card.querySelectorAll("button,a")].some(b=>b.textContent.trim()==="Explain"),"no Explain action: nothing a party listed to explain");
  }finally{handle.destroy()}
});

// Public Funding only (A35): NSW Efa is on the Greens' return as public funding. The card says that, never
// the declared-only line (#351) and never a donor declaration.
test('subject map card: a Public Funding payer says so, never the declared-only line, $0 or a declaration',async()=>{
  const {handle,view,card,text}=await subjectCard('donor:nsw efa');
  try{
    assert.ok(text.includes('NSW Efa'),'the subject card is open');
    assert.ok(text.includes("Listed on the party's return as public funding, which is election funding, not a donation."),text);
    assert.doesNotMatch(text,/No party return lists|declare|not receipts a party reported/);
    assert.doesNotMatch(text,ZERO);
    assert.equal(card.querySelector('.mm-card-total'),null,'no headline figure');
    assert.deepEqual(view.edges.filter(e=>e.source==='donor:nsw efa'),[],'no flow on the map');
  }finally{handle.destroy()}
});

test('subject map card: a donor the parties list keeps its total, receipts and rows; a flow only it declares is a note, not a $0 row',async()=>{
  const pratt=await subjectCard('donor:pratt');
  try{
    assert.match(pratt.text,/All receipt types/);
    assert.match(pratt.card.querySelector('.mm-card-total').textContent,/^\$\d/);
    assert.notEqual(pratt.card.querySelector('.mm-card-total').textContent,'$0');
    assert.match(pratt.text,/Disclosed across \d[\d,]* receipt records/);
    assert.match(pratt.text,/Where it went/);
    assert.doesNotMatch(pratt.text,/No party return lists/);
    assert.ok([...pratt.card.querySelectorAll('button,a')].some(b=>b.textContent.trim()==='Explain'),'Explain stays for a donor the parties list');
  }finally{pratt.handle.destroy()}
  const allianz=await subjectCard('donor:allianz australia');
  try{
    assert.doesNotMatch(allianz.text,ZERO);
    const rows=[...allianz.card.querySelectorAll('.mm-rows li')].map(li=>li.textContent);
    assert.equal(rows.length,3,rows.join(' | '));
    assert.ok(rows.every(r=>!r.includes('LNP')),'the LNP flow no party return lists is not a $0 row');
    // 13 Nov 2026: Allianz's own 2018-19 declaration of $500 to the Liberal Democratic Party joins the note, under the name it was made to (#344):
    // the Libertarian Party was registered on 12 January 2024, after that year ended. The party's return lists no such receipt.
    assert.ok(allianz.text.includes('Not counted above: its own donor returns declare $68,298 to federal parties across 19 records: LNP $67,798 (2011-12 to 2022-23); the Liberal Democratic Party (now the Libertarian Party) $500 (2018-19), which no party return lists.'), allianz.text);
  }finally{allianz.handle.destroy()}
});

// A guard on what the cards above lean on (moneyFlowType drops a flow at $0), not a new behaviour.
test('the full map draws no donor-to-party flow at $0: every flow no party return lists is left out, as receiptGraph leaves it out',async()=>{
  let view;
  const {handle}=await mount(publishedGraph,{onViewChange:next=>{view=next}});
  try{
    const flows=view.edges.filter(e=>!e.grant&&!e.flow&&String(e.source).startsWith('donor:'));
    assert.ok(flows.length>500);
    assert.deepEqual(flows.filter(e=>!(e.total>0)).map(e=>`${e.source} -> ${e.target}`),[]);
    // The 139 donor-declared-only flows, and the one Public Funding-only flow (NSW Efa to the Greens), which is never a donor's (A35).
    // 13 Nov 2026: 130 to 139 donor-declared-only flows, the nine to the Libertarian Party that only the donor's own return declares (Ancora, Australian Energy Producers, Chevron, Australian Hotels Association, IAG, IT Alliance, Deloitte, Allianz, Sanofi), export rule 10.
    const dropped=publishedGraph.edges.filter(e=>!e.grant&&!e.flow&&e.by_type&&!Object.keys(e.by_type).filter(k=>k!=='public_funding').length);
    assert.equal(dropped.length,140);
    assert.equal(view.edges.length,publishedGraph.edges.length-dropped.length);
  }finally{handle.destroy()}
});
