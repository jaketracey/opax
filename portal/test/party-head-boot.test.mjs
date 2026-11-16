import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {HEAD_ICONS, partyYearsText, partyTagLineHTML, partySitting, partyReturnRows, latestReturnLine, partyRailBlocks} from '../public/party-page.js';
import {referenceOnlyPeople} from '../public/roster-party.js';
import {shortMoney} from '../public/format.js';

// Party pages scored CLS 0.17 to 0.33 at 390 wide: the head's money line and its sitting count
// arrived a second after the record, and the "On this page" rail above the record grew a row at a
// time. The Worker now draws the head whole, the app keeps it, and the rail is drawn at its length.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const lift = names => ast.statements.filter(n => (ts.isFunctionDeclaration(n) && names.includes(n.name?.text))
  || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.includes(d.name.getText(ast)))))
  .map(n => n.getText(ast)).join('\n');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const {PARTY_MAP} = await import('../public/labels.js');
const same = (a, b) => (PARTY_MAP[String(a).toLowerCase()]?.[1] || String(a)) === (PARTY_MAP[String(b).toLowerCase()]?.[1] || String(b));
const pub = path => JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8'));

test('the head the Worker draws uses the app\'s own icons, years and meta-line markup', () => {
  const api = runInNewContext(`${lift(['ICONS', 'tagLineHTML', 'returnsSpan', 'yearSpan'])};({ICONS, tagLineHTML, returnsSpan, yearSpan})`,
    {fy: s => String(s).replace(/^(\d{4})-(\d{2})$/, '$1–$2')});
  assert.equal(HEAD_ICONS.map, api.ICONS.map);
  assert.equal(HEAD_ICONS.search, api.ICONS.search);
  for (const [first, last] of [[1998, 2024], [2019, 2019], [2019, null], [null, 2020], [null, null]])
    assert.equal(partyYearsText({first, last, returns: true}).replace(/–/g, '-'), api.returnsSpan(first, last).replace(/–/g, '-'), `${first}..${last}`);
  assert.equal(partyYearsText({first: 2019, last: 2026}), `Members in the record ${api.yearSpan(2019, 2026)}`);
  assert.equal(partyYearsText({first: 2019, last: 0, independent: true}), `Parliamentarians in the record ${api.yearSpan(2019, 0)}`);
  assert.equal(partyYearsText({first: 9999, last: 0}), '', 'no years: no part');
  // The line the app ends with: lead, then renderPartyMembers' sitting part before the years.
  const lead = '<span class="ui-party">Fixture Party</span>', h = {esc};
  const line = partyTagLineHTML({lead, sitting: {count: 3, party: 'Fixture Party'}, active: 'Members in the record 2019–2026'}, h);
  assert.equal(line, api.tagLineHTML([lead, '<a class="party-sitting" href="/subject/person?party=Fixture+Party">3 marked current in the directory</a>', '<span class="entry-active">Members in the record 2019–2026</span>']));
  assert.equal(partyTagLineHTML({lead, sitting: {count: 3, party: 'X'}, active: ''}, h), lead, 'the count is said only beside the years');
  assert.equal(partyTagLineHTML({lead, sitting: {count: 0, party: 'X'}, active: 'Returns in 2019–20'}, h), api.tagLineHTML([lead, '<span class="entry-active">Returns in 2019–20</span>']));
});

test('server: a party page opens on its whole head, with the rail\'s blocks and the map node for the app', {timeout: 60000}, async () => {
  const {loadWorker, offline} = await import('./worker-harness.mjs');
  const restore = offline();
  try {
    const worker = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
    const page = async path => {
      const response = await worker.fetch(path);
      assert.equal(response.status, 200, path);
      return new JSDOM(await response.text()).window.document.querySelector('#prerender');
    };
    // The roster as the app counts it: the speech roster and the seat holders the electorates release adds.
    const roster = pub('/parliamentarians.json').people;
    const manifest = pub('/electorates/manifest.json');
    for (const {person, seats} of referenceOnlyPeople(roster, pub(manifest.people_url).people))
      roster.push({name: person.name, pid: person.legacy_person_id || person.person_id, party: seats[0].party, party_now: seats[0].party, current: true});
    const extras = pub('/graph/aec-extras.json');

    const labor = await page('/subject/party/labor');
    assert.ok(labor.classList.contains('subject-party'));
    const head = labor.querySelector(':scope > .subject-head');
    assert.ok(head, 'the crawler block opens on the head');
    assert.equal(head.querySelector('h1').textContent, 'Labor');
    assert.equal(labor.querySelectorAll('h1').length, 1, 'one title');
    const tag = head.querySelector('.subject-tag');
    assert.ok(tag.querySelector('.ui-party'), 'the party chip leads');
    const sitting = partySitting('Labor', roster, same);
    assert.ok(sitting.count > 0);
    assert.equal(tag.querySelector('.party-sitting').textContent, `${sitting.count} marked current in the directory`);
    assert.equal(tag.querySelector('.party-sitting').getAttribute('href'), '/subject/person?party=Labor');
    assert.match(tag.querySelector('.entry-active').textContent, /^Returns \d{4}–\d{2} to \d{4}–\d{2}$/);
    const line = latestReturnLine(partyReturnRows('Labor', extras.parties, same).rows, shortMoney);
    assert.equal(head.querySelector('.party-return-line a').textContent, line.text);
    assert.equal(head.querySelector('.party-return-line a').getAttribute('href'), '#party-receipts');
    const explain = head.querySelector('.entry-actions > a[data-explain-link]');
    assert.equal(explain.getAttribute('href'), '/money/explain?to=party%3ALabor');
    assert.equal(explain.textContent.trim(), 'Explain where the money comes from');
    assert.ok(head.querySelector('.entry-actions .page-menu-button'), 'the ⋯ holds its place');
    assert.equal(labor.dataset.node, 'party:Labor');
    assert.deepEqual(labor.dataset.rail.split(' '), partyRailBlocks({money: true, members: true, sponsored: true, returns: partyReturnRows('Labor', extras.parties, same)}));
    assert.ok(labor.dataset.rail.split(' ').includes('party-receipts'));
    assert.match(labor.querySelector(':scope > .subject-head + p').textContent, /^Labor: /, 'the summary follows the head');

    // A party with no money-map node: its members' years, its speeches, no map node.
    const jln = await page('/subject/party/jacqui-lambie-network');
    const jlnHead = jln.querySelector(':scope > .subject-head');
    assert.match(jlnHead.querySelector('.entry-active').textContent, /^Members in the record \d{4}–\d{4}$/);
    assert.equal(jlnHead.querySelector('.entry-actions > a').textContent.trim(), 'Their speeches');
    assert.equal(jln.dataset.node, undefined);
    assert.ok(!jln.dataset.rail.split(' ').includes('entry-flows'));

    // A renamed party: its name history is in the head, once.
    const renamed = await page('/subject/party/libertarian-party');
    assert.equal(renamed.querySelectorAll('.party-history').length, 1);
    assert.ok(renamed.querySelector(':scope > .subject-head > .party-history'));
  } finally { restore(); }
});

const appDom = (html, extra = {}) => {
  const dom = new JSDOM(html);
  const context = {
    document: dom.window.document, esc, $: id => dom.window.document.getElementById(id),
    settleOn() {}, PERSON_RAIL: [], ...extra,
  };
  return {dom, context};
};

test('the app keeps the Worker\'s sitting count through the meta line\'s redraw, and updates it in place', async () => {
  const lead = '<span class="ui-party">Fixture Party</span>';
  const worker = partyTagLineHTML({lead, sitting: {count: 2, party: 'Fixture Party'}, active: 'Returns 2019–20 to 2024–25'}, {esc});
  const {dom, context} = appDom(`<div id="b"><div class="subject-head"><p class="subject-tag">${worker}</p></div></div>`, {
    loadParliamentarians: async () => ({people: [{name: 'Cora Example', pid: 'f1', party: 'Fixture Party', current: true}, {name: 'Lena Example', pid: 'f2', party: 'Fixture Party', current: true}, {name: 'Rory Example', pid: 'f3', party: 'Fixture Party', current: true}]}),
    loadPartyPage: async () => ({}), samePartyLabel: (a, b) => a === b, currentSubjectKey: 'k', fmtDate: s => s,
    directoryHash: (kind, {party}) => `/subject/${kind}?party=${encodeURIComponent(party)}`,
  });
  runInNewContext(`${lift(['tagLineHTML', 'keptSitting', 'restoreSitting', 'renderPartyMembers'])};this.api={tagLineHTML, keptSitting, restoreSitting, renderPartyMembers};`, context);
  const tag = dom.window.document.querySelector('.subject-tag');
  // The money render redraws the line: the kept part goes back beside the years.
  const kept = context.api.keptSitting(tag);
  tag.innerHTML = context.api.tagLineHTML([lead, '<span class="entry-active">Returns 2019–20 to 2024–25</span>']);
  context.api.restoreSitting(tag, kept);
  assert.equal(tag.innerHTML, worker, 'the line is the Worker\'s, unchanged');
  await context.api.renderPartyMembers('Fixture Party', dom.window.document.getElementById('b'), 'k');
  assert.equal(tag.querySelectorAll('.party-sitting').length, 1, 'never a second count');
  assert.equal(tag.querySelector('.party-sitting').textContent, '3 marked current in the directory');
  assert.equal(tag.querySelector('.party-sitting').closest('.subject-tag-next').nextElementSibling.querySelector('.entry-active').textContent, 'Returns 2019–20 to 2024–25');
});

test('the rail lists the blocks the Worker named before they arrive, and only what is there once they settle', () => {
  const {dom, context} = appDom(`<section id="subject-infobox"></section><div id="subject-sections"><section id="entry-flows"><h2>Where it came from</h2></section><section id="party-members"></section></div>`);
  runInNewContext(`${lift(['PARTY_RAIL', 'entryRailHTML', 'railExpected', 'expectRail', 'releaseRail', 'refreshEntryRail'])};this.api={entryRailHTML, expectRail, releaseRail, refreshEntryRail, PARTY_RAIL};`, context);
  const doc = dom.window.document, sections = doc.getElementById('subject-sections');
  doc.getElementById('subject-infobox').innerHTML = context.api.entryRailHTML();
  const listed = () => [...doc.querySelectorAll('.entry-rail-list a')].map(a => a.dataset.entryJump);
  context.api.refreshEntryRail(sections, context.api.PARTY_RAIL);
  assert.deepEqual(listed(), ['entry-flows'], 'without the Worker\'s list: what is drawn');
  context.api.expectRail(sections, ['entry-flows', 'party-members', 'party-receipts', 'entry-mentions']);
  assert.deepEqual(listed(), ['entry-flows', 'party-members', 'party-receipts', 'entry-mentions'], 'at its length at once, in the rail\'s order');
  assert.equal(doc.querySelector('.entry-rail-nav').hidden, false);
  doc.getElementById('party-members').textContent = 'Members';
  context.api.refreshEntryRail(sections, context.api.PARTY_RAIL);
  assert.deepEqual(listed(), ['entry-flows', 'party-members', 'party-receipts', 'entry-mentions'], 'a block arriving moves nothing');
  // Another page's sections are never listed from this page's expectations.
  context.api.releaseRail(doc.createElement('div'), context.api.PARTY_RAIL);
  assert.equal(listed().length, 4);
  context.api.releaseRail(sections, context.api.PARTY_RAIL);
  assert.deepEqual(listed(), ['entry-flows', 'party-members'], 'settled: only the blocks that came');
});
