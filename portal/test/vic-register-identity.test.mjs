// A register view links to a party page only after polls close (6 pm, 28 November 2026, Melbourne), and only
// for a registered name with a sourced identity (src/vic-election-parties.ts REGISTER_IDENTITIES).
// DO NOT MERGE this change before polls close.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {canonicalPartyPages, PARTY_MONEY_PATHS} from '../public/party-page.js';
import {VIC_ELECTION_POLLS_CLOSE} from '../public/vic-election.js';

const publicJson = async path => JSON.parse(await readFile(new URL(`../public/${path.replace(/^\//, '')}`, import.meta.url), 'utf8'));
const built = await build({entryPoints: [new URL('../src/vic-election-parties.ts', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false});
const {VIC_REGISTER, REGISTER_IDENTITIES, sourcedIdentity, registerViewHTML, registeredParty} = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const data = await publicJson('hubs/vic-election-2026.json');
const BEFORE = new Date('2026-11-28T17:59:59+11:00'), AT = new Date('2026-11-28T18:00:00+11:00'), LATER = new Date('2026-12-05T09:00:00+11:00');
const fixture = {'Victorian Socialists': {page: '/subject/party/fixture-page', page_name: 'Fixture Page', source: {label: 'Fixture source', url: 'https://example.org/source'}}};

test('the gate is the close of polls: 6 pm on 28 November 2026, Melbourne time', () => {
  assert.equal(VIC_ELECTION_POLLS_CLOSE, '2026-11-28T18:00:00+11:00');
});

test('before polls close no register view links to a party page, whatever the table holds', () => {
  for (const p of VIC_REGISTER.parties) {
    assert.equal(sourcedIdentity(p, BEFORE, fixture), null, p.name);
    assert.equal(registerViewHTML(data, p, BEFORE, fixture), registerViewHTML(data, p, BEFORE, {}), p.name);
    assert.doesNotMatch(registerViewHTML(data, p, BEFORE, fixture), /\/subject\/party/, p.name);
  }
});

test('after polls close only a sourced name links, with its source; every other view is unchanged', () => {
  for (const now of [AT, LATER]) for (const p of VIC_REGISTER.parties) {
    const html = registerViewHTML(data, p, now, fixture), doc = JSDOM.fragment(html);
    if (p.name !== 'Victorian Socialists') { assert.equal(html, registerViewHTML(data, p, BEFORE, {}), p.name); continue; }
    const links = [...doc.querySelectorAll('#record a')].map(a => a.getAttribute('href'));
    assert.deepEqual(links, ['/subject/party/fixture-page', 'https://example.org/source']);
  }
  // An entry without a page, a page name or an https source is no entry.
  const p = registeredParty('Victorian Socialists');
  for (const bad of [{page: '/subject/party/x', page_name: 'X', source: {label: 'No address', url: ''}}, {page: 'https://elsewhere.example/x', page_name: 'X', source: {label: 'S', url: 'https://example.org'}},
    {page: '/subject/party/x', page_name: '', source: {label: 'S', url: 'https://example.org'}}])
    assert.equal(sourcedIdentity(p, LATER, {'Victorian Socialists': bad}), null);
});

test('the reviewed table: registered names only, a real party page and a source for each; never Family First Victoria or Australian Democrats', async () => {
  const pages = canonicalPartyPages({money: await Promise.all(PARTY_MONEY_PATHS.map(path => publicJson(path).catch(() => null))),
    roster: await publicJson('parliamentarians.json'), divisions: await publicJson('graph/party-members.json')});
  const names = new Set(VIC_REGISTER.parties.map(p => p.name));
  for (const [name, entry] of Object.entries(REGISTER_IDENTITIES)) {
    assert.ok(names.has(name), `${name} is not a registered name as the register spells it`);
    assert.ok(pages.some(page => page.href === entry.page), `${name}: ${entry.page} is not a party page`);
    assert.match(entry.source.url, /^https:\/\//, name);
    assert.ok(entry.source.label && entry.page_name, name);
    assert.ok(sourcedIdentity(registeredParty(name), LATER), name);
  }
  // The pages of these names hold an earlier federal record (2003-04 receipts, former senators). The VEC
  // registered Family First Victoria on 6 October 2022 and Australian Democrats on 15 October 2026.
  for (const name of ['Family First Victoria', 'Australian Democrats']) assert.equal(Object.hasOwn(REGISTER_IDENTITIES, name), false, `${name} must not be linked to a party page`);
});
