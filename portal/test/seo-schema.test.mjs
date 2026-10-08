import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildSchemaGraph, personSchemaIdentity, legislationSchemaFields, serializeSchemaGraph } from '../src/seo-schema.ts';

const origin = 'https://opax.com.au';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const graphFor = (path, over = {}) => JSON.parse(serializeSchemaGraph(buildSchemaGraph({
  canonical: `${origin}${path}`, title: 'Sample page · OPAX', description: 'Public parliamentary records.', ...over,
})));
const find = (graph, type) => graph['@graph'].find(node => node['@type'] === type);

// Offline Schema.org-shape checks use the relevant V30.1 types/property ranges:
// https://schema.org/{BreadcrumbList,Person,Legislation,Dataset,SearchAction}
// The vocabulary deliberately excludes the nonexistent legislationStatus.
const properties = {
  WebPage: ['name', 'description', 'url'],
  CollectionPage: ['name', 'description', 'url', 'isPartOf'],
  WebSite: ['name', 'url', 'publisher', 'potentialAction'],
  SearchAction: ['target', 'query-input'],
  Organization: ['name', 'url', 'logo'],
  BreadcrumbList: ['itemListElement'],
  ListItem: ['position', 'name', 'item'],
  Person: ['name', 'url', 'jobTitle', 'memberOf', 'image', 'sameAs'],
  Legislation: ['name', 'url', 'description', 'legislationIdentifier', 'legislationJurisdiction', 'legislationDate', 'creativeWorkStatus', 'legislationLegalForce', 'creator', 'publisher'],
  Dataset: ['name', 'url', 'description', 'publisher', 'distribution'],
  DataDownload: ['contentUrl', 'encodingFormat'],
};
const absoluteUrl = (value) => assert.match(value, /^https?:\/\//);
function checkShape(value) {
  if (Array.isArray(value)) return value.forEach(checkShape);
  if (!value || typeof value !== 'object') return;
  if (value['@type']) {
    const allowed = properties[value['@type']];
    assert.ok(allowed, `Recognized schema.org type ${value['@type']}`);
    for (const key of Object.keys(value)) {
      assert.ok(key.startsWith('@') || allowed.includes(key), `${value['@type']} supports ${key}`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (['url', 'image', 'logo', 'contentUrl', 'item'].includes(key) && typeof child === 'string') absoluteUrl(child);
    if (key === 'sameAs') { assert.ok(Array.isArray(child)); child.forEach(absoluteUrl); }
    if (key === 'legislationIdentifier' || key === 'creativeWorkStatus') assert.equal(typeof child, 'string');
    if (key === 'legislationLegalForce') assert.match(child, /^https:\/\/schema\.org\/(?:InForce|NotInForce|PartiallyInForce)$/);
    checkShape(child);
  }
}
function checkGraph(graph) {
  assert.equal(graph['@context'], 'https://schema.org');
  assert.ok(Array.isArray(graph['@graph']));
  checkShape(graph);
  const crumbs = graph['@graph'].filter(node => node['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.length, 1);
  crumbs[0].itemListElement.forEach((item, i) => {
    assert.equal(item['@type'], 'ListItem');
    assert.equal(item.position, i + 1);
    assert.equal(typeof item.name, 'string');
    assert.ok(item.name.length);
  });
}

test('homepage JSON-LD has WebSite, a usable SearchAction, Organization and breadcrumbs', () => {
  const graph = graphFor('/');
  checkGraph(graph);
  const website = find(graph, 'WebSite');
  assert.equal(website.url, `${origin}/`);
  assert.equal(website.potentialAction['@type'], 'SearchAction');
  assert.equal(website.potentialAction.target, `${origin}/search?q={search_term_string}`);
  assert.equal(website.potentialAction['query-input'], 'required name=search_term_string');
  assert.equal(find(graph, 'Organization')['@id'], website.publisher['@id']);
  assert.equal(find(graph, 'BreadcrumbList').itemListElement.length, 1);
});

test('every route gets an ordered breadcrumb ending in its canonical, including page 2', () => {
  for (const path of ['/subject/person/anthony-albanese', '/bill/au-federal-r7531', '/division/house-2026-238',
    '/bills?page=2', '/subject/person', '/subject/topic/housing', '/money/grants/federal/recipient/abn:12345678901',
    '/reports/gambling', '/ask?q=climate', '/missing-page']) {
    const graph = graphFor(path);
    checkGraph(graph);
    assert.equal(find(graph, 'BreadcrumbList').itemListElement.at(-1).item, `${origin}${path}`);
  }
  const people = find(graphFor('/subject/person/anthony-albanese'), 'BreadcrumbList').itemListElement;
  assert.deepEqual(people.map(p => p.item), [`${origin}/`, `${origin}/subject/person`, `${origin}/subject/person/anthony-albanese`]);
  const bill = find(graphFor('/bill/au-federal-r7531'), 'BreadcrumbList').itemListElement;
  assert.equal(bill[1].item, `${origin}/bills`);
});

test('Person uses an approved portrait and verified APH profile, preserving the separate id namespaces', () => {
  const graph = graphFor('/subject/person/anthony-albanese', {
    jsonLd: { '@context': 'https://schema.org', '@type': 'Person', name: 'Anthony Albanese', url: `${origin}/subject/person/anthony-albanese`,
      sameAs: ['https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=Anthony%20Albanese'] },
    person: { portraitId: '10007', aphMpid: 'R36' },
  });
  checkGraph(graph);
  const person = find(graph, 'Person');
  assert.equal(person.image, `${origin}/photos/10007.webp`);
  assert.deepEqual(person.sameAs, ['https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=R36']);
  assert.ok(!JSON.stringify(person).includes('MPID=10007'));
});

test('known Wikidata identities come from Commons ids and explicit verified profile data', () => {
  const person = personSchemaIdentity({ portraitId: 'wd-Q106869875', aphProfileUrl: 'https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=263528&lang=en' });
  assert.equal(person.image, `${origin}/photos/wd-Q106869875.webp`);
  assert.deepEqual(person.sameAs, ['https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=263528', 'https://www.wikidata.org/wiki/Q106869875']);
  assert.deepEqual(personSchemaIdentity({ wikidata: 'https://www.wikidata.org/wiki/Q624758' }).sameAs, ['https://www.wikidata.org/wiki/Q624758']);
});

test('unknown or malformed identities and APH searches are omitted rather than fabricated', () => {
  assert.deepEqual(personSchemaIdentity({ portraitId: '../other-person', aphMpid: 'R36&other=1', wikidata: 'not-a-qid',
    aphProfileUrl: 'https://example.com/Senators_and_Members/Parliamentarian?MPID=R36' }), {});
  const graph = graphFor('/subject/person/unknown', { jsonLd: { '@type': 'Person', name: 'Unknown',
    sameAs: 'https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=Unknown' } });
  checkGraph(graph);
  assert.ok(!('sameAs' in find(graph, 'Person')));
});

test('Legislation identifies the bill and uses supported lifecycle/legal-force properties', () => {
  const graph = graphFor('/bill/au-federal-r7531', {
    jsonLd: { '@type': 'Legislation', name: 'Sample Bill 2026', legislationJurisdiction: 'Australia' },
    bill: { identifier: 'au-federal-r7531', status: 'before_parliament' },
  });
  checkGraph(graph);
  const bill = find(graph, 'Legislation');
  assert.equal(bill.legislationIdentifier, 'au-federal-r7531');
  assert.equal(bill.creativeWorkStatus, 'Before parliament');
  assert.equal(bill.legislationLegalForce, 'https://schema.org/NotInForce');
  assert.ok(!('legislationStatus' in bill));
  assert.ok(!('legislationLegalForce' in legislationSchemaFields({ status: 'passed' })));
  assert.ok(!('legislationLegalForce' in legislationSchemaFields({ status: 'assented' })));
  assert.equal(legislationSchemaFields({ status: 'assented', legalForce: 'PartiallyInForce' }).legislationLegalForce, 'https://schema.org/PartiallyInForce');
});

test('all exported bill status values fit schema.org property ranges', () => {
  const statuses = new Set(read('../public/bills/index.json').bills.map(b => b.status).filter(Boolean));
  for (const status of statuses) {
    const graph = graphFor('/bill/sample', { jsonLd: { '@type': 'Legislation', name: 'Sample' }, bill: { identifier: 'sample', status } });
    checkGraph(graph);
    assert.ok(find(graph, 'Legislation').creativeWorkStatus.length);
  }
});

test('data and exports pages have Dataset shapes with real downloadable distributions', () => {
  for (const path of ['/stats', '/data', '/data/parliament', '/exports']) {
    const graph = graphFor(path);
    checkGraph(graph);
    assert.equal(find(graph, 'Dataset').url, `${origin}${path}`);
  }
  const graph = graphFor('/methods', { dataset: { name: 'Parliamentary data', distributions: [{ url: '/bills/index.json', encodingFormat: 'application/json' }] } });
  checkGraph(graph);
  assert.equal(find(graph, 'Dataset').distribution[0].contentUrl, `${origin}/bills/index.json`);
  for (const download of find(graphFor('/stats'), 'Dataset').distribution) {
    assert.ok(existsSync(new URL(`../public${new URL(download.contentUrl).pathname}`, import.meta.url)));
  }
});

test('JSON-LD serialization safely round trips markup, ampersands and script closures', () => {
  const title = 'Example </script><script>alert(1)</script> & <title>';
  const graph = buildSchemaGraph({ canonical: `${origin}/search`, title });
  const text = serializeSchemaGraph(graph);
  assert.ok(!text.includes('<'));
  assert.ok(!text.includes('>'));
  assert.ok(!text.includes('&'));
  assert.equal(find(JSON.parse(text), 'WebPage').name, title);
});

test('existing route metadata is preserved and not mutated when graph navigation is appended', () => {
  const input = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Bills', description: 'Published bills.', url: `${origin}/bills` };
  const original = structuredClone(input);
  const graph = graphFor('/bills', { jsonLd: input });
  checkGraph(graph);
  assert.deepEqual(input, original);
  assert.equal(find(graph, 'CollectionPage').description, 'Published bills.');
});

test('profile export maps verified OpenAustralia ids to actual APH ids and keeps its immutable provenance', () => {
  const links = read('../public/profile-links.json');
  assert.match(links.meta.source_url, /openaustralia-parser\/[a-f0-9]{40}\/data\/people.csv$/);
  assert.match(links.meta.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(links.people['10007'].aphMpid, 'R36');
  assert.equal(links.people['11010'].aphMpid, '169119');
  assert.equal(links.people['11003'].aphMpid, '300706');
  assert.ok(links.by_name['catherine king'].aphMpid);
  for (const record of Object.values(links.people)) {
    assert.equal(record.aphProfileUrl, `https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=${record.aphMpid}`);
    assert.match(record.aphMpid, /^[a-z0-9]+$/i);
  }
  assert.ok(Object.values(links.by_name).some(record => /^Q[1-9]\d*$/.test(record.wikidata || '')));
});

test('profile exporter rejects a wrong-person pid and a surname-only identity', () => {
  const code = `import importlib.util,json\nfrom pathlib import Path\np=Path('../scripts/export_profile_links.py')\ns=importlib.util.spec_from_file_location('profile_links',p)\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nroster={'people':[{'name':'David Cox','pid':'10007'},{'name':'Albanese','pid':'10007'},{'name':'Anthony Albanese','pid':'10007'}]}\nresult=m.build_profile_links('person count,aph id,name,birthday,alt name\\n7,R36,Anthony Norman Albanese,,,\\n',roster,{}, {})\nprint(json.dumps(result))`;
  const result = JSON.parse(execFileSync('python3', ['-c', code], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }));
  assert.equal(result.meta.identity_mismatches_omitted, 2);
  assert.deepEqual(Object.keys(result.people), ['10007']);
  assert.ok(!result.by_name['david cox']);
  assert.ok(!result.by_name.albanese);
  assert.equal(result.by_name['anthony albanese'].aphMpid, 'R36');
});
