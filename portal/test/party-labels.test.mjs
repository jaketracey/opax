import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import {readFile} from 'node:fs/promises';
import {PARTY_ALIASES, PARTY_MAP, PARTY_NAMES, partyLabelHTML, partyShortName} from '../public/labels.js';
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
  const visible=html=>html.replace(/<span class="visually-hidden">.*?<\/span>/g,'').replace(/<[^>]+>/g,'').replace(/&#39;/g,"'");
  for(const name of registered){
    assert.equal(name,name.trim());
    assert.ok(Object.hasOwn(PARTY_ALIASES,name),name);
    const [colour,code]=PARTY_MAP[name.toLowerCase()];
    assert.ok(PARTY_NAMES[code],name);
    const html=partyLabelHTML(name);
    assert.equal(visible(html),partyShortName(name),name);
    assert.ok(html.includes(`party-${colour}`),name);
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
    ["I'm Voting to Avoid the Fine",'Avoid the Fine','oth','FINE'],
  ]){
    assert.deepEqual(PARTY_MAP[registered.toLowerCase()],[colour,code]);
    assert.equal(visible(partyLabelHTML(registered)),short);
  }
  assert.equal(partyLabelHTML(''),'');
  assert.equal(partyShortName('Australian Labor Party'),'Labor');
  assert.equal(partyShortName('Liberal / The Nationals'),'Liberal / Nationals');
  assert.equal(partyShortName('Labour DLP'),'DLP');
});
