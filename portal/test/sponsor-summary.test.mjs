import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {buildGrowth} from '../../scripts/build_growth_modules.mjs';
import {sponsorPerson, sponsorKey, sponsorNamesAgree} from '../public/sponsor-person.js';
import * as growthModules from '../public/growth-modules.js';
import {MONEY_GRAPHS} from '../public/donor-entity.js';

const publicRoot = new URL('../public/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path.replace(/^\//, ''), publicRoot), 'utf8'));
const people = (await read('parliamentarians.json')).people;
const index = await read('bills/index.json');
const app = await readFile(new URL('app.js', publicRoot), 'utf8');
const pocock = await read('bills/au-federal-s1471.json');
const campbells = people.filter(p => ['Graeme Campbell', 'George Campbell'].includes(p.name));
const namesake = {...pocock, key: 'namesake-fixture', sponsor: 'CAMPBELL, Graeme, MP', sponsor_person_id: '10098'};

async function bundle(entry) {
  const result = await build({entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm'});
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {sponsorFor, renderBillAnswer} = await bundle('../src/seo-content.ts');
const {slugIndex} = await bundle('../src/person-slug.ts');

// Execute the browser's real summary loader and link upgrade with local JSON
// fixtures. A missing or unconfirmed identity must leave the header plain.
async function renderSponsor(bill, load = read) {
  const dom = new JSDOM('<div id="bill-body"><p><span data-sponsor></span></p><form class="growth-ask-form"></form></div>');
  try {
    const root = dom.window.document.getElementById('bill-body');
    root.querySelector('[data-sponsor]').textContent = bill.sponsor;
    root.querySelector('form').dataset.recordKey = bill.key;
    const fetched = [];
    const slugs = slugIndex(people).slugOf;
    const context = {
      document: dom.window.document, growthModules,
      subjectHash: (kind, name) => `/subject/${kind}/${slugs.get(name)}`,
      appendGrowthQuestions() {},
      fetch: async path => { fetched.push(path); return {ok: true, json: () => load(path)}; },
    };
    runInNewContext(app.slice(app.indexOf('const sponsorSummaries ='), app.indexOf('function loadPersonSlugs()')), context);
    await context.linkBillSponsors(root, bill);
    const anchor = root.querySelector('a');
    return {href: anchor?.getAttribute('href') ?? null, name: anchor?.textContent ?? null, fetched};
  } finally { dom.window.close(); }
}

test('the detail pid resolves the reported bill in the browser and crawlable page', async () => {
  assert.equal(pocock.sponsor_person_id, '11009');
  assert.equal(sponsorFor(pocock, people)?.name, 'David Pocock');
  const path = await growthModules.sponsorSummaryPath(pocock);
  assert.equal(path, '/growth/sponsors/31d37e1a0efa64d35ad7736a.json');
  assert.deepEqual((await read(path)).person, {name: 'David Pocock', pid: '11009'});
  assert.deepEqual(await renderSponsor(pocock), {href: '/subject/person/david-pocock', name: 'David Pocock', fetched: [path]});
  assert.match(renderBillAnswer(pocock, people, slugIndex(people).slugOf).html,
    /<dt>Sponsor<\/dt><dd><a href="\/subject\/person\/david-pocock">David Pocock<\/a><\/dd>/);
});

test('a namesake pid and a surname stub cannot vouch for another MP', async () => {
  assert.equal(campbells.find(p => p.name === 'George Campbell').pid, '10098');
  assert.equal(sponsorPerson(namesake.sponsor, namesake.sponsor_person_id, campbells), null);
  assert.equal(sponsorPerson(namesake.sponsor, namesake.sponsor_person_id,
    [...campbells, {name: 'Campbell', full: 'George Campbell', pid: '10098'}]), null);
  assert.equal(sponsorPerson(pocock.sponsor, '11008', people), null, 'the other senator of the same surname');
  assert.doesNotMatch(renderBillAnswer(namesake, campbells, slugIndex(campbells).slugOf).html,
    /<dt>Sponsor<\/dt><dd><a /);
  assert.equal((await renderSponsor(pocock, async () => { throw Error('Missing summary fixture'); })).href, null);
});

test('growth summaries use detail identity even when the index drops or contradicts the pid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opax-sponsor-summary-'));
  try {
    await mkdir(join(root, 'grants/federal'), {recursive: true});
    const records = [pocock, namesake];
    const fixtures = {
      'bills/index.json': {bills: records.map(({sponsor_person_id, ...bill}) => bill)},
      'parliamentarians.json': {people: [...campbells, ...people.filter(p => ['David Pocock', 'Barbara Pocock'].includes(p.name))]},
      'agencies.json': {agencies: []}, 'suppliers.json': {suppliers: []},
      'access.json': {ministers: {}}, 'votes.json': {}, 'interests/index.json': {people: {}},
      'graph/grants.federal.json': {meta: {}},
      ...Object.fromEntries(MONEY_GRAPHS.map(path => [path.slice(1), {nodes: [], edges: []}])),
      ...Object.fromEntries(records.map(bill => ['bills/' + bill.key + '.json', bill])),
    };
    const sourceRead = async path => {
      assert.ok(Object.hasOwn(fixtures, path), `Unexpected fixture read: ${path}`);
      return fixtures[path];
    };
    // An old index has no pid. Name-only resolution would link the pid-less
    // Campbell row, despite the detail record pointing at the other MP.
    for (const indexPid of [undefined, '11008']) {
      fixtures['bills/index.json'].bills[0].sponsor_person_id = indexPid;
      await buildGrowth(root, {read: sourceRead});
      const generated = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
      assert.deepEqual((await generated(await growthModules.sponsorSummaryPath(pocock))).person,
        {name: 'David Pocock', pid: '11009'});
      assert.equal((await generated(await growthModules.sponsorSummaryPath(namesake))).person, null);
      assert.equal((await renderSponsor(pocock, generated)).href, '/subject/person/david-pocock');
      assert.equal((await renderSponsor(namesake, generated)).href, null);
    }
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('all bill sponsor links retain the fixture census before and after the fix', async () => {
  const fixture = JSON.parse(await readFile(new URL('fixtures/sponsor-link-counts.json', import.meta.url), 'utf8'));
  const beforePaths = new Set(fixture.beforeSummaryPaths);
  const counts = () => ({linked: 0, unlinked: 0, reasons: {'missing-summary': 0, 'missing-full-name-profile': 0, 'missing-pid-for-name-variant': 0}});
  const before = counts(), after = counts();
  const billFiles = (await readdir(new URL('bills/', publicRoot))).filter(f => f.endsWith('.json') && f !== 'index.json');
  const rows = new Map(index.bills.map(bill => [bill.key, bill]));
  let recorded = 0;
  for (const file of billFiles) {
    const bill = await read('bills/' + file);
    assert.equal(rows.get(bill.key).sponsor_person_id, bill.sponsor_person_id, `${bill.key}: index pid`);
    if (!bill.sponsor) continue;
    recorded++;
    const person = sponsorPerson(bill.sponsor, bill.sponsor_person_id, people);
    const path = await growthModules.sponsorSummaryPath(bill);
    const summary = await read(path);
    if (!person) {
      // Distinguish a missing profile from a short first name that cannot be
      // confirmed without a pid. Any other cause requires its own census row.
      const named = people.filter(p => p.name.includes(' ') && [p.name, p.full].filter(Boolean).some(n => sponsorKey(n) === sponsorKey(bill.sponsor)));
      assert.equal(named.length, 0, `${bill.key}: unresolved identity needs a separate reason`);
      const variants = people.filter(p => p.name.includes(' ') && [p.name, p.full].filter(Boolean).some(n => sponsorNamesAgree(bill.sponsor, n)));
      const reason = variants.length ? 'missing-pid-for-name-variant' : 'missing-full-name-profile';
      if (variants.length) assert.ok(!bill.sponsor_person_id, `${bill.key}: name variant must have no pid`);
      assert.equal(summary.person, null, `${bill.key}: unresolved identity stays plain text`);
      for (const count of [before, after]) { count.unlinked++; count.reasons[reason]++; }
      continue;
    }
    assert.equal(summary.person?.name, person.name, `${bill.key}: summary name`);
    assert.equal(summary.person?.pid, person.pid, `${bill.key}: summary pid`);
    after.linked++;
    if (beforePaths.has(path)) before.linked++;
    else {
      assert.ok(bill.sponsor_person_id, `${bill.key}: newly linked sponsor requires a pid`);
      assert.equal(person.pid, bill.sponsor_person_id, `${bill.key}: newly linked pid agrees`);
      assert.ok([person.name, person.full].filter(Boolean).some(n => sponsorNamesAgree(bill.sponsor, n)), `${bill.key}: newly linked name agrees`);
      before.unlinked++; before.reasons['missing-summary']++;
    }
  }
  assert.equal(billFiles.length, fixture.totalBills);
  assert.equal(index.bills.length, fixture.totalBills);
  assert.equal(recorded, fixture.recordedSponsors);
  assert.equal(billFiles.length - recorded, fixture.withoutRecordedSponsor);
  assert.deepEqual(before, fixture.before);
  assert.deepEqual(after, fixture.after);
});
