import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import {personHeadPrerender} from '../src/seo-content.ts';
import {personSlug} from '../src/person-slug.ts';
import {profileJurisdictions} from '../public/profile-jurisdictions.js';
import {personHeadFixtures} from './fixtures/person-head.mjs';
import {loadWorker, offline} from './worker-harness.mjs';

// Exercise the browser's shipped role expression as well as the server's header.
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const app = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true);
let seatWord;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(app) === 'seatWord') seatWord = node.initializer.getText(app);
  ts.forEachChild(node, visit);
}
visit(app);
assert.ok(seatWord, 'browser header role expression exists');

test('the person header source line names the Parliamentary roster and shows no date', () => {
  const lines = [];
  (function find(node) {
    if (ts.isCallExpression(node) && node.expression.getText(app) === 'sourceLineHTML' && ts.isObjectLiteralExpression(node.arguments[0])) {
      const props = Object.fromEntries(node.arguments[0].properties.filter(p => p.name).map(p => [p.name.getText(app), p]));
      if (props.source?.initializer?.getText(app) === '"Parliamentary roster"') lines.push(props);
    }
    ts.forEachChild(node, find);
  })(app);
  assert.equal(lines.length, 1, 'one roster source line in the person header');
  // No date on the line, and no "Checked <date>" note in its sheet; the source links stay.
  assert.deepEqual(['updated', 'dateLabel', 'asAt', 'notes'].filter(key => key in lines[0]), []);
  assert.ok('originals' in lines[0]);
  assert.doesNotMatch(source, /rosterChecked|`Checked \$\{/);
});
const browserRole = person => {
  const representation = profileJurisdictions(person);
  return runInNewContext(seatWord, {roster: person,
    house: representation.chambers.length === 1 ? representation.chambers[0] : '',
    electorateLinks: representation.representations.map(r => r.electorate).join(', ')});
};
const header = person => new JSDOM(personHeadPrerender('<section id="prerender" class="wrap"><h1>Person</h1></section>', person, {}))
  .window.document.querySelector('.subject-tag').textContent;

for (const {person, role} of personHeadFixtures) {
  test(`${person.chambers[0]} has the correct role in both person headers`, () => {
    assert.ok(header(person).includes(role));
    assert.equal(browserRole(person) + person.representation[0].electorate, role);
  });
}

test('all five state Legislative Councils use MLC, while unverified and multiple chambers keep the seat alone', () => {
  for (const [jurisdiction, state] of [['nsw', 'New South Wales'], ['vic', 'Victoria'], ['sa', 'South Australia'], ['wa', 'Western Australia'], ['tas', 'Tasmania']]) {
    const chamber = `${jurisdiction}_lc`;
    const person = {...personHeadFixtures[0].person, states: [jurisdiction], chambers: [chamber],
      representation: [{electorate: state, jurisdiction, chamber}]};
    assert.ok(header(person).includes(`MLC for ${state}`));
    assert.equal(browserRole(person), 'MLC for ');
    assert.doesNotMatch(header(person), /Senator/);
  }
  for (const person of [
    {...personHeadFixtures[0].person, current: false},
    {...personHeadFixtures[0].person, current: undefined},
    {...personHeadFixtures[0].person, chambers: ['sa_lc', 'sa_ha']},
    {...personHeadFixtures[1].person, chambers: ['senate_committee']},
  ]) {
    assert.doesNotMatch(header(person), /MLC for|Senator for|Member for/);
    assert.equal(browserRole(person), '');
  }
});

const restore = offline();
after(restore);
const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
const assets = worker.env.ASSETS.fetch;
worker.env.ASSETS.fetch = request => new URL(request.url).pathname === '/parliamentarians.json'
  ? Response.json({people: personHeadFixtures.map(({person}) => structuredClone(person))}) : assets(request);

for (const {person, role} of personHeadFixtures) {
  test(`${person.chambers[0]} keeps its role through the Worker head, summary and metadata`, async () => {
    const response = await worker.fetch(`/subject/person/${personSlug(person.name)}`);
    assert.equal(response.status, 200);
    const doc = new JSDOM(await response.text()).window.document;
    assert.ok(doc.querySelector('.subject-head .subject-tag').textContent.includes(role));
    const summary = doc.querySelector('.subject-head + p').textContent;
    assert.ok(summary.includes(person.representation[0].electorate));
    const description = doc.querySelector('meta[name="description"]').content;
    assert.equal(description, summary);
    assert.equal(doc.querySelector('meta[property="og:description"]').content, description);
    assert.ok(doc.title.includes(role), doc.title);
    const schema = JSON.parse(doc.querySelector('#ld-page').textContent);
    const identity = schema['@graph'].find(node => node['@type'] === 'Person');
    assert.equal(identity.jobTitle, 'Parliamentarian');
    if (person.chambers[0] !== 'senate') {
      for (const text of [summary, description, JSON.stringify(schema)]) assert.doesNotMatch(text, /Senator for/);
    }
  });
}

const {profileHouses} = await import('../public/profile-jurisdictions.js');
const shape = found => found.rows.map(r => [r.label, r.status]);

test('each house is one fact with its parliament; a sitting member\'s other houses are former, or left out when nothing says which is current', () => {
  const moved = {current: true, states: ['nsw', 'federal'], chambers: ['nsw_lc', 'senate', 'senate_committee']};
  // A verified current seat names the house; the other is former and comes last.
  assert.deepEqual(shape(profileHouses(moved, [{chamber: 'senate', jurisdiction: 'federal', current: true}])),
    [['Senate, Federal', 'current'], ['Legislative Council, New South Wales', 'former']]);
  // No verified seat and no dated service: neither house is known to be current, so neither is shown as a house.
  const unknown = profileHouses(moved);
  assert.ok(unknown.rows.every(r => r.status === 'unknown'));
  assert.deepEqual(unknown.parliamentsOnly, ['New South Wales', 'Federal']);
  // No verified seat, but dated service still open in one house: that house is current, the ended one former.
  const dated = {current: true, states: ['nsw', 'federal'], chambers: ['nsw_lc', 'representatives'], affiliations: [
    {jurisdiction: 'federal', chamber: 'representatives', electorate: 'Wattle', start: '1994-01-29', end: '2005-01-21'},
    {jurisdiction: 'nsw', chamber: 'nsw_lc', electorate: 'New South Wales', start: '2019-03-23', end: '2023-03-02'},
    {jurisdiction: 'nsw', chamber: 'nsw_lc', electorate: 'New South Wales', start: '2023-03-25'}]};
  assert.deepEqual(shape(profileHouses(dated)), [['Legislative Council, New South Wales', 'current'], ['House of Representatives, Federal', 'former']]);
  // Someone the roster does not mark as sitting has no current or former house, whatever a seat list says.
  assert.deepEqual(shape(profileHouses({...moved, current: false}, [{chamber: 'senate', jurisdiction: 'federal'}])),
    [['Legislative Council, New South Wales', ''], ['Senate, Federal', '']]);
  // A sitting member's only house needs no mark; a parliament with no house in the record stays a part by itself.
  assert.deepEqual(shape(profileHouses({current: true, states: ['federal'], chambers: ['representatives']})), [['House of Representatives, Federal', '']]);
  assert.deepEqual(profileHouses({states: ['federal'], chambers: ['joint_committee']}), {rows: [], parliamentsOnly: ['Federal']});
});

test('House to Senate within one parliament, and a territory senator', () => {
  const crossed = {current: true, states: ['federal'], chambers: ['representatives', 'senate', 'house_committee']};
  const found = profileHouses(crossed, [{chamber: 'senate', jurisdiction: 'federal', current: true}]);
  assert.deepEqual(shape(found), [['Senate, Federal', 'current'], ['House of Representatives, Federal', 'former']]);
  assert.deepEqual(found.parliamentsOnly, []);
  // A territory senator sits in the federal Senate: the territory is the seat, never a parliament of its own here.
  const territory = {name: 'Marlo Quoll', current: true, states: ['federal'], chambers: ['senate'],
    representation: [{electorate: 'Australian Capital Territory', jurisdiction: 'federal', chamber: 'senate', state: 'ACT'}]};
  const seated = profileHouses(territory, [{chamber: 'senate', jurisdiction: 'federal', current: true, name: 'Australian Capital Territory'}]);
  assert.deepEqual(shape(seated), [['Senate, Federal', 'current']]);
  assert.deepEqual(seated.parliamentsOnly, []);
  const text = header(territory);
  assert.ok(text.includes('Senator for Australian Capital Territory') && text.includes('Senate, Federal'));
  assert.doesNotMatch(text, /ACT|formerly|·/);
});

test('the server head marks a former house, names only the current house\'s seat, and never lists a house it cannot place', () => {
  const dated = {name: 'Wren Marsh', current: true, states: ['nsw', 'federal'], chambers: ['nsw_lc', 'representatives'],
    representation: [{electorate: 'New South Wales', jurisdiction: 'nsw', chamber: 'nsw_lc'}, {electorate: 'Wattle', jurisdiction: 'federal', chamber: 'representatives'}],
    affiliations: [{jurisdiction: 'federal', chamber: 'representatives', electorate: 'Wattle', start: '1994-01-29', end: '2005-01-21'},
      {jurisdiction: 'nsw', chamber: 'nsw_lc', electorate: 'New South Wales', start: '2023-03-25'}]};
  const text = header(dated);
  assert.ok(text.includes('MLC for New South Wales') && text.includes('formerly House of Representatives, Federal'));
  assert.doesNotMatch(text, /Wattle|Member for|·/);
  const unplaced = header({...dated, affiliations: undefined});
  assert.doesNotMatch(unplaced, /Legislative Council|House of Representatives|formerly|MLC for|Member for/);
  // The state is said once: the seat already names it.
  const senator = header({name: 'Wren Marsh', current: true, states: ['nsw', 'federal'], chambers: ['nsw_lc', 'senate'],
    representation: [{electorate: 'New South Wales', jurisdiction: 'federal', chamber: 'senate'}]});
  assert.equal(senator.match(/New South Wales/g).length, 1);
});

test('the browser header takes current seats only from a member the roster marks as sitting', () => {
  let seatsNow;
  (function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(app) === 'seatsNow') seatsNow = node.initializer.getText(app);
    ts.forEachChild(node, find);
  })(app);
  assert.ok(seatsNow, 'browser header current-seat expression exists');
  const electorateReference = {person: {electorates: [{chamber: 'senate', current: true}, {chamber: 'representatives', current: false}]}};
  const run = roster => runInNewContext(seatsNow, {roster, electorateReference});
  assert.deepEqual(run({current: true}).map(e => e.chamber), ['senate']);
  for (const roster of [{current: false}, {}, null]) assert.equal(run(roster).length, 0);
  assert.equal(runInNewContext(seatsNow, {roster: {current: true}, electorateReference: null}).length, 0);
  // The stamp script owns the module's address in app.js, so a changed module is a new address.
  assert.match(source, /import\('\/profile-jurisdictions\.js\?v=[a-f0-9]{10}'\)/);
});
