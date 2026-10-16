// The five Money tabs: one head each (the trail, an h1, the note on what the
// figures mean), and Government contracts at its own address, /money/contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { workerFetch } from './helpers/worker-fetch.mjs';
import { CONTRACTS_COVERAGE } from '../public/contracts-table.js';
import { GRANTS_COVERAGE } from '../public/grants-table.js';

await import('../public/navigation.js');
const nav = globalThis.OpaxNavigation;
const read = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const shell = new JSDOM(read('index.html')).window.document;
const MONEY_PANELS = { money: 'Money map', 'money-records': 'Political receipts', discover: 'Government contracts', connections: 'Programs & places' };

test('every Money panel opens on the tabs, then one head: an h1 and its note', () => {
  for (const [panel, title] of Object.entries(MONEY_PANELS)) {
    const section = shell.getElementById(`panel-${panel}`);
    const head = section.querySelector('.ui-page-head.money-head');
    assert.ok(head, `${panel}: the shared head`);
    assert.equal(section.querySelectorAll('h1').length, 1, `${panel}: one h1`);
    const h1 = head.querySelector(':scope > h1');
    assert.equal(h1.textContent.trim(), title, panel);
    assert.ok(!h1.classList.contains('visually-hidden'), `${panel}: the title is seen`);
    assert.ok(h1.nextElementSibling?.matches('p.ui-lede'), `${panel}: the note sits under the title`);
    // The tabs, then the head: nothing (no empty band) between them.
    const tabs = section.querySelector('[data-money-navigation]');
    const next = tabs.nextElementSibling;
    assert.ok(next === head || next.contains(head) && next.firstElementChild === head, `${panel}: the head follows the tabs`);
  }
});

test('the contracts head carries CONTRACTS_COVERAGE and the table slot draws no band of its own', () => {
  const section = shell.getElementById('panel-discover');
  assert.equal(section.querySelector('.money-head .ui-lede').textContent, CONTRACTS_COVERAGE);
  const slot = shell.getElementById('contracts-hub-table');
  assert.equal(slot.previousElementSibling, section.querySelector('.money-head'));
  assert.ok(!slot.classList.contains('ui-section'), 'no section rule and step above the search');
  assert.equal(slot.textContent.trim(), '', 'filled by the table when it mounts');
});

test('the contracts note says what the data holds', () => {
  const meta = JSON.parse(read('suppliers.json')).meta;
  assert.match(meta.source, /^AusTender/);
  assert.ok(meta.caveats.some(c => /latest recorded notice value/.test(c) && /not verified expenditure/.test(c)));
  const [year, month] = meta.publication_window_start.split('-').map(Number);
  const named = new Date(Date.UTC(year, month - 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  assert.ok(CONTRACTS_COVERAGE.includes(`from ${named}`), `the note names the window's start (${named})`);
  assert.match(CONTRACTS_COVERAGE, /AusTender/);
  assert.match(CONTRACTS_COVERAGE, /latest amended value/);
  assert.match(CONTRACTS_COVERAGE, /commitments, not payments/);
});

test('grants and receipts notes are drawn in the shared head, grants word for word', () => {
  const app = read('app.js');
  assert.ok(app.includes(`'${GRANTS_COVERAGE}'`), 'app.js writes GRANTS_COVERAGE into the head');
  const grants = read('grants-table.js');
  assert.doesNotMatch(grants, /<h1>/, 'the table draws no second title');
  // The grants table keeps the head visible: only records with their own title hide it.
  const open = app.slice(app.indexOf('async function openMoneyRecords'), app.indexOf('async function openMoneyExplain'));
  assert.doesNotMatch(open, /money-records-head'\)\.hidden = true/);
});

test('/money/contracts is served whole: one h1, its note, the table, a clean canonical', async () => {
  const response = await workerFetch('/money/contracts');
  assert.equal(response.status, 200);
  const doc = new JSDOM(await response.text()).window.document;
  const answer = doc.getElementById('prerender');
  assert.equal(doc.querySelectorAll('#prerender h1').length, 1);
  assert.equal(answer.querySelector('h1').textContent, 'Government contracts');
  assert.equal(answer.querySelector('h1 + p').textContent, CONTRACTS_COVERAGE);
  assert.ok(answer.querySelector('[data-contracts-table] table, [data-contracts-table] [data-datatable]'), 'the contracts table');
  assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://opax.com.au/money/contracts');
  assert.equal(doc.title, 'Government contracts · OPAX');
  assert.deepEqual([...doc.querySelectorAll('.prerender-crumbs li')].map(li => li.textContent.trim()), ['Home', 'Government contracts']);
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  assert.doesNotMatch(robots, /noindex/);
});

test('/money/contracts with table state keeps it, canonical to the clean page and noindex', async () => {
  const response = await workerFetch('/money/contracts?t.q=defence&t.sort=amount.asc');
  assert.equal(response.status, 200);
  const doc = new JSDOM(await response.text()).window.document;
  assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://opax.com.au/money/contracts');
  assert.match(doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '', /noindex/);
});

test('/discover forwards to /money/contracts with a 301, its query intact', async () => {
  for (const [from, to] of [
    ['/discover', '/money/contracts'],
    ['/discover/', '/money/contracts'],
    ['/discover?item=procurement_concentration%3Abf948d98a8a51a93', '/money/contracts?item=procurement_concentration%3Abf948d98a8a51a93'],
    ['/discover?category=recipient_concentration&q=lab&sort=share', '/money/contracts?category=recipient_concentration&q=lab&sort=share'],
    ['/discover?item=procurement_concentration%3Aabc&t.q=defence&t.f.agency=%5B%22Department%20of%20Defence%22%5D&t.sort=amount.asc&t.page=2',
      '/money/contracts?item=procurement_concentration%3Aabc&t.q=defence&t.f.agency=%5B%22Department%20of%20Defence%22%5D&t.sort=amount.asc&t.page=2'],
    ['/discover?contract=CN123', '/money/contracts?contract=CN123'],
  ]) {
    const response = await workerFetch(from, {}, { redirect: 'manual' });
    assert.equal(response.status, 301, from);
    assert.equal(response.headers.get('location'), 'https://opax.com.au' + to, from);
  }
});

test('the Money tabs, the menu and the footer link /money/contracts; nothing links /discover', () => {
  assert.deepEqual(nav.money.map(([href]) => href), ['/money', '/money/receipts', '/money/contracts', '/money/grants', '/connections']);
  const tabs = new JSDOM(nav.moneyNav('/money/contracts')).window.document;
  assert.equal(tabs.querySelector('[aria-current="page"]').getAttribute('href'), '/money/contracts');
  assert.equal(tabs.querySelectorAll('[aria-current]').length, 1);
  // Contracts are Commonwealth-only: a state's tabs do not carry ?jur= to them.
  assert.equal(new JSDOM(nav.moneyNav('/money/receipts', 'qld')).window.document.querySelector('a[href^="/money/contracts"]').getAttribute('href'), '/money/contracts');
  const menu = nav.groups.find(g => g.id === 'money').columns.flatMap(c => c.links);
  assert.ok(menu.some(l => l.href === '/money/contracts' && l.label === 'Government contracts'));
  assert.equal(nav.active('/money/contracts'), 'money');
  assert.equal(nav.trail('/money/contracts').at(-1).label, 'Government contracts');
  const footer = nav.footerHTML(() => true, { slot: false });
  assert.match(footer, /href="\/money\/contracts"/);
  for (const file of ['index.html', 'home.html', 'community.html', 'navigation.js', 'app.js', 'money-map.js', 'events.js', 'spa-shell.js'])
    assert.doesNotMatch(read(file), /href="\/discover[?"]|['"`]\/discover['"`?]|\/discover`/, file);
});

test('the sitemap lists /money/contracts, not /discover', () => {
  const crawl = readFileSync(new URL('../../scripts/build_crawl_catalog.mjs', import.meta.url), 'utf8');
  assert.match(crawl, /'\/money\/contracts'/);
  assert.doesNotMatch(crawl, /'\/discover'/);
});
