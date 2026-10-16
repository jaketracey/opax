import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {Worker} from 'node:worker_threads';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {partySpeechLabel} from '../public/party-page.js';
import {partySpeechesFile} from '../../scripts/build_party_speeches.mjs';

// Jake, 16 Oct: a party page offered "Their speeches" for a party with no speech in the
// record, and the search said `No matches for "*"`. The button shows only for a party the
// index labels speeches with, and links that label. Names here are invented, or published
// party labels.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fnSource = name => { const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); assert.ok(fn, name); return app.slice(fn.getStart(ast), fn.end); };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// app.js samePartyLabel over labels.js's PARTY_MAP, as the pages call it.
const {PARTY_MAP} = await import('../public/labels.js');
const same = (a, b) => (PARTY_MAP[String(a).toLowerCase()]?.[1] || String(a)) === (PARTY_MAP[String(b).toLowerCase()]?.[1] || String(b));

test('partySpeechLabel: the index decides, under its own label', () => {
  const indexed = {parties: {'One Nation': 40, JLN: 30, 'Jacqui Lambie Network': 12, 'Fixture Voice': 3}};
  assert.equal(partySpeechLabel('Fixture Reason Party', {indexed, same}), null, 'money and divisions only: no speeches');
  assert.deepEqual(partySpeechLabel("Pauline Hanson's One Nation Party", {indexed, same}), {label: 'One Nation', count: 40}, 'the division spelling links the indexed label');
  assert.deepEqual(partySpeechLabel('Jacqui Lambie Network', {indexed, same}), {label: 'JLN', count: 30}, 'of two indexed spellings, the larger');
  assert.deepEqual(partySpeechLabel('Fixture Voice', {indexed, same}), {label: 'Fixture Voice', count: 3}, 'a label no roster row carries');
  // The roster stands in only when the index file cannot be read; it never overrules the index.
  const roster = {people: [{name: 'Sam Example', party: 'Fixture Reason Party', speeches: 9}, {name: 'Alex Fixture', party: 'One Nation', speeches: 0}]};
  assert.equal(partySpeechLabel('Fixture Reason Party', {indexed, roster, same}), null);
  assert.deepEqual(partySpeechLabel('Fixture Reason Party', {indexed: null, roster, same}), {label: 'Fixture Reason Party', count: 9});
  assert.equal(partySpeechLabel('One Nation', {indexed: null, roster, same}), null, 'a member with no speeches counts for nothing');
});

test('build_party_speeches keeps the index labels with speeches, largest first', () => {
  const file = partySpeechesFile({parties: [{label: 'Fixture B', count: 2}, {label: 'Fixture A', count: 5}, {label: 'Fixture C', count: 0}]}, '2026-10-16');
  assert.deepEqual(file, {version: 1, generated: '2026-10-16', source: 'The search index party labels on speeches (/api/parties)', labelled: 7, parties: {'Fixture A': 5, 'Fixture B': 2}});
  assert.throws(() => partySpeechesFile({parties: []}), /no party labels/);
});

function renderEntry(path, files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'],
      workerData: {kind: 'party', path, selector: '#party-members li.dir-row, #party-state-money li', html: true, settleMs: 1500, files},
    });
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', () => result?.error ? reject(Error(result.error)) : resolve(result));
  });
}
// jsdom has no canvas: a money-map party's map cannot mount, which is not under test.
const pageErrors = result => result.errors.filter(e => !/HTMLCanvasElement's getContext\(\) method/.test(e));
const speechLinks = doc => [...doc.querySelectorAll('a[href]')].filter(a => /[?&]kind=speech/.test(a.getAttribute('href')) && /[?&]party=/.test(a.getAttribute('href')));
const partyOf = a => new URL(a.getAttribute('href'), 'https://opax.test').searchParams.get('party');

test('client: a party with no speech in the record draws no "Their speeches" (roster-party and money-map pages)', {timeout: 60000}, async () => {
  // A state-money party outside the federal map (the head's button) and a federal map party (the Members block's link).
  for (const [path, title] of [['/subject/party/reason-party', 'Reason Party'], ['/subject/party/labor', null]]) {
    const result = await renderEntry(path, {'/graph/party-speeches.json': {version: 1, parties: {'Fixture Voice': 3}}});
    assert.deepEqual(pageErrors(result), [], path);
    assert.ok(result.rows > 0, `${path} rendered its sections`);
    const doc = new JSDOM(result.html).window.document;
    if (title) assert.equal(doc.querySelector('#subject-title').textContent, title);
    assert.ok(![...doc.querySelectorAll('a')].some(a => a.textContent.trim() === 'Their speeches'), `${path}: no button`);
    assert.deepEqual(speechLinks(doc), [], `${path}: no empty search link`);
  }
});

test('client: a party with speeches links them under the indexed label (the alias case)', {timeout: 60000}, async () => {
  const files = {'/graph/party-speeches.json': {version: 1, parties: {'One Nation': 7, Labor: 11}}};
  // The division records' spelling: the page keeps its title, the search gets the index's label.
  const alias = new JSDOM((await renderEntry("/subject/party/pauline-hansons-one-nation-party", files)).html).window.document;
  const button = [...alias.querySelectorAll('a')].find(a => a.textContent.trim() === 'Their speeches');
  assert.ok(button, 'the head button');
  assert.equal(partyOf(button), 'One Nation');
  assert.ok(speechLinks(alias).every(a => partyOf(a) === 'One Nation'));
  // A money-map party: the link sits on the Members block.
  const labor = new JSDOM((await renderEntry('/subject/party/labor', files)).html).window.document;
  const link = [...labor.querySelectorAll('#party-members a')].find(a => a.textContent.trim() === 'Their speeches');
  assert.ok(link, 'the Members link');
  assert.equal(partyOf(link), 'Labor');
});

test('server: a party page promises what its members said only where the record holds speeches', {timeout: 60000}, async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
    const page = async path => {
      const response = await worker.fetch(path);
      assert.equal(response.status, 200, path);
      const doc = new JSDOM(await response.text()).window.document;
      return {doc, description: doc.querySelector('meta[name="description"]').getAttribute('content'), prerender: doc.querySelector('#prerender')};
    };
    const reason = await page('/subject/party/reason-party');
    assert.doesNotMatch(reason.description, /said|speeches/i);
    assert.doesNotMatch(reason.prerender.textContent, /What its members said|speeches/i);
    assert.deepEqual(speechLinks(reason.doc), []);
    assert.ok(![...reason.doc.querySelectorAll('a')].some(a => a.textContent.trim() === 'Their speeches'));
    const labor = await page('/subject/party/labor');
    assert.match(labor.description, /speeches in the record/);
    assert.match(labor.prerender.textContent, /What its members said, and who paid\./);
  } finally { restore(); }
});

test('the wildcard search with no matches says the filter found nothing, never quotes "*"', () => {
  const nodes = {};
  const el = id => (nodes[id] ??= new JSDOM('<div></div>').window.document.querySelector('div'));
  const context = {
    $: el, esc, askHash: q => `/ask?q=${encodeURIComponent(q)}`, subjectHash: (k, v) => `/subject/${k}/${v}`, TOPICS: {},
    activeFilterSummary: f => [f.party && `party ${f.party}`, f.kind && `kind ${f.kind}`].filter(Boolean).join(', '),
    filterChipSpecs: f => f.party ? [{id: 'party', k: 'Party'}] : [], clearSearchFilter() {},
  };
  runInNewContext(fnSource('renderSearchRecovery') + '\nthis.recover=renderSearchRecovery;', context);
  context.recover('*', {party: 'Fixture Reason Party', kind: 'speech'});
  const box = nodes['search-empty'];
  assert.equal(box.querySelector('.empty-title').textContent, 'No speeches in the record for this filter');
  assert.doesNotMatch(box.textContent, /\*|No matches for/);
  assert.match(box.textContent, /Searched with party Fixture Reason Party/);
  assert.ok(!box.querySelector('a[href^="/ask?q="]'), 'no Ask for "*"');
  context.recover('*', {party: 'Fixture Reason Party'});
  assert.equal(box.querySelector('.empty-title').textContent, 'Nothing in the record for this filter');
  context.recover('housing', {});
  assert.equal(box.querySelector('.empty-title').textContent, 'No matches for “housing”', 'a typed query is still quoted');
});
