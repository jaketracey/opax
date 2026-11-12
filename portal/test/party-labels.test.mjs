import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import {readFile} from 'node:fs/promises';
import {PARTY_ALIASES, PARTY_MAP, PARTY_NAMES, partyLabelHTML, partyShortName} from '../public/labels.js';
// Text between tags, for comparing rendered labels (a test helper, not a sanitiser).
const tagText=html=>html.split(/<[^>]*>/).join('');
const built = await build({ stdin: { contents: "export * from './src/party-labels';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm' });
const { searchPartyLabels } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
test('party names map to the KB speech labels; Coalition is its member parties; unknown names are refused', () => {
  assert.deepEqual(searchPartyLabels('Australian Labor Party'), ['Labor']);
  assert.deepEqual(searchPartyLabels('ALP'), ['Labor']);
  assert.deepEqual(searchPartyLabels('The Nationals'), ['Nationals']);
  assert.deepEqual(searchPartyLabels('Australian Greens'), ['Greens']);
  assert.deepEqual(searchPartyLabels('the Coalition').sort(), ['Country Liberal Party', 'LNP', 'Liberal', 'Nationals']);
  assert.deepEqual(searchPartyLabels('Jacqui Lambie Network'), ['Jacqui Lambie Network', 'JLN']);
  assert.equal(searchPartyLabels('Invented Party'), null);
});

test('every registered VEC name resolves through the shared party map, with readable labels and the site palette', async () => {
  const source=JSON.parse(await readFile(new URL('../../scripts/hubs/vic-candidates-2026.json',import.meta.url),'utf8'));
  const registered=[...new Set(['districts','regions'].flatMap(kind=>Object.values(source[kind]).flat().map(c=>c.party)))].filter(Boolean);
  assert.equal(registered.length,23);
  const visible=html=>tagText(html.split(/<span class="visually-hidden">.*?<\/span>/).join('')).replace(/&#39;/g,"'");
  for(const name of registered){
    assert.equal(name,name.trim());
    assert.ok(Object.hasOwn(PARTY_ALIASES,name),name);
    const [colour,code]=PARTY_MAP[name.toLowerCase()];
    assert.ok(PARTY_NAMES[code],name);
    const html=partyLabelHTML(name);
    assert.equal(visible(html),partyShortName(name),name);
    assert.ok(html.includes(`party-${colour}`),name);
    assert.doesNotMatch(partyLabelHTML(name,{full:true}),/[–—]/,name);
  }
  for(const [registered,short,colour,code] of [
    ['Australian Labor Party - Victorian Branch','Labor','alp','ALP'],
    ['Liberal Party of Australia - Victorian Division','Liberal','lib','LIB'],
    ['National Party of Australia - Victoria','Nationals','nat','NAT'],
    ['Australian Greens Victoria','Greens','grn','GRN'],
    ['One Nation Victoria','One Nation','onp','ONP'],
    ['Legalise Cannabis Victoria','Legalise Cannabis','oth','LCP'],
    ['Animal Justice Party','Animal Justice','oth','AJP'],
    ['Democratic Labour Party (DLP)','DLP','oth','DLP'],
    ['Family First Victoria','Family First','oth','FF'],
    ["I'm Voting to Avoid the Fine","I'm Voting to Avoid the Fine",'oth','FINE'],
  ]){
    assert.deepEqual(PARTY_MAP[registered.toLowerCase()],[colour,code]);
    assert.equal(visible(partyLabelHTML(registered)),short);
  }
  assert.equal(partyLabelHTML(''),'');
  assert.equal(partyShortName('Australian Labor Party'),'Labor');
  assert.equal(partyShortName('Liberal / The Nationals'),'Liberal / Nationals');
  assert.equal(partyShortName('Labour DLP'),'DLP');
});

test('non-Victorian election records keep state-neutral spoken and full party names', async () => {
  const json=async path=>JSON.parse(await readFile(new URL(path.replace(/^\//,''),new URL('../public/',import.meta.url)),'utf8'));
  const manifest=await json('electorates/manifest.json');
  const index=await json(manifest.index_url);
  const seat=index.electorates.find(s=>s.name==='Cowan'&&s.jurisdiction==='federal'&&s.state_code==='wa');
  assert.ok(seat,'Published Western Australian federal electorate');
  const data=await json(seat.detail_url);
  for(const [year,party,full] of [
    [2019,'Shooters, Fishers and Farmers','Shooters, Fishers and Farmers Party'],
    [2025,'Legalise Cannabis Party','Legalise Cannabis Party'],
  ]){
    const contest=data.elections.find(c=>c.election.poll_date.startsWith(String(year)));
    const candidate=contest?.candidates.find(c=>c.party===party);
    assert.ok(candidate,`${year} published party label`);
    const html=partyLabelHTML(candidate.party);
    assert.doesNotMatch(html,/Victoria/);
    assert.equal(tagText(partyLabelHTML(candidate.party,{full:true})),full);
    if(party!==full)assert.ok(html.includes(`<span class="visually-hidden">${full}</span>`));
  }
});

test('bare internal codes do not become party aliases; existing code keys still resolve', () => {
  for(const [code,name] of [
    ['ad','Australian Democrats'],['ca','Centre Alliance'],['fp','Free Palestine'],
    ['can','Climate Action Now'],['rep','The Republican'],['west','The West Party'],
    ['safe','Safety Victoria'],['fine',"I'm Voting to Avoid the Fine"],['ind','Independent'],
    ['alp','Labor'],['lib','Liberal'],['nat','Nationals'],['grn','Greens'],['onp','One Nation'],
  ]){
    assert.equal(PARTY_MAP[code],undefined,code);
    assert.equal(partyShortName(code),code);
    assert.notEqual(PARTY_MAP[code]?.[1]??code,PARTY_MAP[name.toLowerCase()]?.[1]??name);
  }
  for(const code of ['dlp','jln','lnp'])assert.equal(PARTY_MAP[code][1],code.toUpperCase());
});

test('registered full names and unabridged labels are retained without typographic dashes', () => {
  assert.equal(PARTY_NAMES.SAP[1],'Affordable Housing Now - Sustainable Australia Party');
  assert.equal(partyShortName('Affordable Housing Now – Sustainable Australia Party'),'Sustainable Australia');
  const html=partyLabelHTML("I'm Voting to Avoid the Fine");
  assert.equal(tagText(html).replace(/&#39;/g,"'"),"I'm Voting to Avoid the Fine");
  assert.doesNotMatch(html,/aria-hidden="true">Avoid the Fine/);
});
