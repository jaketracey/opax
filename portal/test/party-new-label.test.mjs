// A party that is in the data only as two sitting members' party now (Community Strong Australia,
// registered with the AEC on 2 October 2026) renders everywhere a party is shown: the label and dot,
// its own page, the party directory, and the people directory its page links to.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {PARTY_MAP, PARTY_NAMES, partyLabelHTML, partyNames, partyShortName} from '../public/labels.js';
import {partyMembers, readPartyPages} from '../public/party-page.js';
import {loadWorker, offline} from './worker-harness.mjs';

// The people directory's party rule, as the browser ships it.
const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ruleStart = appSource.indexOf('function directoryParties(items)');
assert.ok(ruleStart > 0, 'the directory party rule exists');
const directoryParties = runInNewContext(`(${appSource.slice(ruleStart, appSource.indexOf('\n}\n', ruleStart) + 3).replace('function directoryParties', 'function')})`);

const PARTY = 'Community Strong Australia';
const SLUG = '/subject/party/community-strong-australia';
const read = path => JSON.parse(readFileSync(new URL('../public' + path, import.meta.url), 'utf8'));
const roster = read('/parliamentarians.json');
const members = roster.people.filter(p => p.party_now === PARTY).map(p => p.name).sort();

function render(kind, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helpers/directory-shell.mjs', import.meta.url), {
      execArgv: ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'], workerData: {kind, html: true, ...options},
    });
    const timer = setTimeout(() => { worker.terminate(); reject(Error(`${kind}: directory shell exceeded 15 seconds`)); }, 15000);
    let result;
    worker.once('message', message => { result = message; });
    worker.once('error', reject);
    worker.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0 || !result) reject(Error(`${kind}: directory shell exited with ${code}`));
      else if (result.error) reject(Error(result.error));
      else resolve(result);
    });
  });
}

test('the roster holds the party as two sitting members\' party now, and keeps what their speeches carry', () => {
  assert.deepEqual(members, ['Allegra Spender', 'Zali Steggall']);
  for (const p of roster.people.filter(p => p.party_now === PARTY)) {
    assert.equal(p.current, true);
    assert.equal(p.party, 'Independent');
  }
});

test('the label has a dot and the full name, under one code for the name and the registered abbreviation', () => {
  assert.deepEqual(PARTY_MAP[PARTY.toLowerCase()], ['oth', 'CSA']);
  assert.deepEqual(PARTY_MAP['community strong'], ['oth', 'CSA']);
  assert.deepEqual(PARTY_NAMES.CSA, [PARTY, PARTY]);
  assert.equal(partyShortName(PARTY), PARTY);
  assert.equal(partyNames(PARTY)[1], PARTY);
  const html = partyLabelHTML(PARTY, {full: true});
  assert.match(html, /class="[^"]*party-oth/);
  assert.equal(new JSDOM(html).window.document.body.textContent.trim(), PARTY);
});

test('the party has a canonical page with its two sitting members, and is in the party directory', {timeout: 40000}, async () => {
  const pages = await readPartyPages(async path => read(path));
  const page = pages.find(p => p.href === SLUG);
  assert.ok(page, 'no canonical page');
  assert.equal(page.label, PARTY);
  const listed = partyMembers(PARTY, {roster, divisions: read('/graph/party-members.json')});
  assert.deepEqual(listed.current.map(m => m.name).sort(), members);
  const directory = await render('party', {path: '/subject/party?sort=name'});
  assert.deepEqual(directory.errors, []);
  const row = new JSDOM(directory.html).window.document.querySelector(`a[href="${SLUG}"]`);
  assert.equal(row?.textContent.trim(), PARTY);
});

test('the party page renders in the browser shell with its name, a dot and no errors', {timeout: 20000}, async () => {
  const result = await render('party', {path: SLUG, selector: '.party, .ui-row, li'});
  assert.deepEqual(result.errors, []);
  assert.equal(result.failed, false);
  const doc = new JSDOM(result.html).window.document;
  assert.match(doc.body.textContent, /Community Strong Australia/);
  assert.ok(doc.querySelector('.party.party-oth'), 'no party dot');
  for (const name of members) assert.match(doc.body.textContent, new RegExp(name));
});

test('the people directory filters by a party that is only a party now, so the party page link is not empty', {timeout: 20000}, async () => {
  const result = await render('person', {path: `/subject/person?party=${encodeURIComponent(PARTY)}`});
  assert.deepEqual(result.errors, []);
  const names = [...new JSDOM(result.html).window.document.querySelectorAll('#dir-list > li .dir-name')].map(a => a.textContent.trim()).sort();
  assert.deepEqual(names, members);
  // the option exists, and the parties counted from speech rows keep their counts
  const options = [...new JSDOM(result.html).window.document.querySelectorAll('select[data-filter="party"] option')].map(o => o.textContent);
  assert.ok(options.includes(`${PARTY} (2)`), options.slice(0, 12).join(' | '));
  assert.ok(options.includes(`Independent (${directoryParties(roster.people).counts.get('Independent')})`));
});

test('each party option counts exactly the people its filter lists, and a party now adds nobody to a party speeches already carry', () => {
  const {counts, member} = directoryParties(roster.people);
  for (const [party, count] of counts) {
    const listed = roster.people.filter(p => member(p, party));
    assert.equal(listed.length, count, party);
    // the list is the people recorded under the party; party now counts only for a party no speech row carries
    const spoken = roster.people.some(p => p.party === party);
    for (const p of listed) assert.ok(p.party === party || (p.parties || []).includes(party) || (!spoken && p.party_now === party), `${p.name} under ${party}`);
  }
  // Cory Bernardi sits for One Nation in a state house now; his speeches are Liberal, Conservatives and Independent.
  const bernardi = roster.people.find(p => p.name === 'Cory Bernardi');
  assert.equal(bernardi.party_now, 'One Nation');
  assert.equal(member(bernardi, 'One Nation'), false);
  assert.equal(member(bernardi, 'Liberal'), true);
  assert.deepEqual(roster.people.filter(p => member(p, PARTY)).map(p => p.name).sort(), members);
  assert.deepEqual(roster.people.filter(p => member(p, "Australia's Voice")).map(p => p.name), ['Fatima Payman']);
  // Matthew Canavan keeps the Nationals as a recorded party, so their list has him; the LNP's does too.
  const canavan = roster.people.find(p => p.name === 'Matthew Canavan');
  assert.ok(member(canavan, 'Nationals') && member(canavan, 'LNP'));
});

test('the seat each of them holds says the same party as their own record, so a seat page and a person page agree', () => {
  const manifest = read('/electorates/manifest.json');
  const service = read(manifest.people_url).people;
  const index = read(manifest.index_url).electorates;
  for (const [name, party] of [['Zali Steggall', PARTY], ['Allegra Spender', PARTY], ['Matthew Canavan', 'LNP'], ['Chris Gatenby', 'Liberal']]) {
    const person = roster.people.find(p => (p.full || p.name) === name);
    assert.equal(person.party_now, party, name);
    const seats = service.find(p => p.name === name).electorates.filter(e => e.current);
    assert.deepEqual(seats.map(e => e.party), [party], `${name}: the electorate release`);
    const row = index.find(e => e.url === seats[0].url);
    assert.equal(row.representatives.find(m => m.person.name === name).party, party, `${name}: the seat index`);
  }
});

const restore = offline();
after(restore);
test('the Worker serves the party page and names the party on each member\'s page', async () => {
  const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
  const page = await worker.fetch(SLUG);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>[^<]*Community Strong Australia/);
  for (const slug of ['zali-steggall', 'allegra-spender']) {
    const person = await worker.fetch(`/subject/person/${slug}`);
    assert.equal(person.status, 200);
    assert.match(new JSDOM(await person.text()).window.document.querySelector('.subject-head .subject-tag').textContent, /Community Strong Australia/);
  }
});
