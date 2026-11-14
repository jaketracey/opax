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
