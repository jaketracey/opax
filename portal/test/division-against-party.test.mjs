// "Voted differently from most of their party" on division pages: one rule (public/division-against-party.js) for
// Ask's division tool, the Worker page, the browser page and the /api/resource division response,
// pinned on real published divisions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import * as against from '../public/division-against-party.js';
import { personUrl } from '../public/canonical-urls.js';
import { renderDivisionAnswer } from '../src/seo-content.ts';

const division = key => JSON.parse(readFileSync(new URL(`../public/divisions/division-${key}.json`, import.meta.url)));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function fn(name) {
  const start = app.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `app.js declares ${name}`);
  let depth = 0;
  for (let i = app.indexOf('{', app.indexOf(')', start)); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const browser = runInNewContext(`${fn('divisionAgainstHTML')}; divisionAgainstHTML`, { divisionAgainst: against, esc, personUrl });
/** The section's text on the Worker page: from its heading to the member lists. */
function serverSection(d) {
  const html = renderDivisionAnswer(d, [], new Map()).html;
  const at = html.indexOf('<h3>Voted differently from most of their party</h3>');
  if (at < 0) return '';
  return text(html.slice(at, html.indexOf('<h3>', at + 4)));
}

test('Senate 9535: one Liberal senator voted no while the other 8 voted aye', () => {
  const d = division('federal-senate-9535');
  assert.equal(d.name, 'Criminal Code Amendment (Hate Crimes) Bill 2024 - Third Reading - Pass the bill');
  const view = against.votedAgainstParty(d);
  assert.equal(view.member_list_complete, true);
  assert.equal(view.note, null);
  assert.deepEqual(view.members.map(m => [m.name, m.party, m.vote, m.text]), [['Alex Antic', 'Liberal', 'no', 'Voted no; the other 8 Liberal senators voted aye']]);
  // The three Independents and the single-member parties that voted no are never counted.
  assert.ok(d.members.some(m => m.party === 'Independent' && m.vote === 'no'));
  assert.ok(d.members.some(m => m.party === 'United Australia Party' && m.vote === 'no'));
  const section = serverSection(d);
  assert.equal(section, 'Voted differently from most of their party Each member\'s vote is compared with how most of their party voted. The record does not show whether a party allowed a free vote. Alex Antic (Liberal). Voted no; the other 8 Liberal senators voted aye.');
  assert.match(renderDivisionAnswer(d, [], new Map()).html, new RegExp(`<a href="${personUrl('Alex Antic')}"[^>]*>Alex Antic</a> \\(Liberal\\)`));
  assert.equal(text(browser(d)), section, 'the browser page shows the same words');
  assert.match(browser(d), new RegExp(`<a href="${personUrl('Alex Antic')}">Alex Antic</a>`));
});

test('House 7714: a split in four parties on a partial member list lists every member against their party majority, qualified', () => {
  const d = division('federal-representatives-7714');
  assert.equal(d.name, 'Restoring Territory Rights Bill 2022 - Third Reading - Pass the bill');
  assert.equal(d._meta.member_coverage, 'partial');
  const view = against.votedAgainstParty(d);
  assert.equal(view.member_list_complete, false);
  assert.equal(view.note, 'The member list for this division is partial, so other members may be missing here.');
  const byParty = {};
  for (const m of view.members) byParty[m.party] = [...byParty[m.party] ?? [], m.vote];
  // Labor 69 aye/5 no; Liberal 13 aye/17 no; Nationals 5 aye/8 no; LNP 1 aye/6 no. Each party's
  // minority is listed; Independents and the one-member parties are not.
  assert.deepEqual(byParty, { Labor: Array(5).fill('no'), Liberal: Array(13).fill('aye'), Nationals: Array(5).fill('aye'), LNP: ['aye'] });
  const line = name => view.members.find(m => m.name === name);
  assert.equal(line('Bridget Archer').text, 'Voted aye; 17 of the other 29 Liberal members voted no');
  assert.equal(line('Angie Bell').text, 'Voted aye; the other 6 LNP members voted no');
  // A dated party that replaces the division record's later label says so.
  assert.equal(line('Andrew Gee').party_note, 'The division record lists Independent; Nationals is the party dated records give for this date.');
  const section = serverSection(d);
  assert.match(section, /Andrew Gee \(Nationals\)\. Voted aye; 8 of the other 12 Nationals members voted no\. The division record lists Independent/);
  assert.match(section, /other members may be missing here\.$/);
  assert.equal(text(browser(d)), section);
});

test('a party-line division shows no section and no "nobody" line', () => {
  const d = division('federal-senate-9534');
  assert.equal(against.votedAgainstParty(d), null);
  const html = renderDivisionAnswer(d, [], new Map()).html;
  assert.doesNotMatch(html, /most of their party|free vote|crossing the floor|crossed the floor/i);
  assert.equal(browser(d), '');
});

test('Independents, presiding-officer labels, ties and parties under five votes never count', () => {
  const m = (name, party, vote) => ({ name, party, vote });
  const members = [
    ...Array.from({ length: 4 }, (_, i) => m(`Small ${i}`, 'Small', 'aye')), m('Small no', 'Small', 'no'),
    ...Array.from({ length: 6 }, (_, i) => m(`Ind ${i}`, 'Independent', 'aye')), m('Ind no', 'Independent', 'no'),
    ...Array.from({ length: 3 }, (_, i) => m(`Tie aye ${i}`, 'Tie', 'aye')), ...Array.from({ length: 3 }, (_, i) => m(`Tie no ${i}`, 'Tie', 'no')),
    ...Array.from({ length: 3 }, (_, i) => m(`Four ${i}`, 'Four', 'aye')), m('Four no', 'Four', 'no'),
    m('Small paired', 'Small', 'paired'), m('Nobody', null, 'no'),
  ];
  assert.deepEqual(against.againstPartyMembers(members).map(x => x.name), ['Small no']);
  assert.equal(against.isDivisionParty('Independent'), false);
  assert.equal(against.isDivisionParty('SPK'), false);
});

test('Ask\'s division tool reads the same rule: its crossed_floor names match the page', async () => {
  const built = await build({
    stdin: { contents: "export { callTool } from './src/tools/index';", resolveDir: new URL('../', import.meta.url).pathname },
    bundle: true, write: false, platform: 'browser', format: 'esm', external: ['node:*'],
    plugins: [{ name: 'no-tables', setup(b) { b.onResolve({ filter: /^\.\.\/table-api$/ }, () => ({ path: 't', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', contents: 'export async function tableApi() { throw Error("no table reads here") }' })); } }],
  });
  const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  for (const key of ['federal-senate-9535', 'federal-representatives-7714', 'federal-senate-9534']) {
    const d = division(key);
    const summary = { key: d.key, slug: d.slug, date: d.date, house: d.house, member_coverage: d._meta.member_coverage, party_tallies: [] };
    const assets = { '/divisions/index.json': { divisions: [summary] }, [`/divisions/${d.slug}.json`]: d };
    const env = { asset: async path => structuredClone(assets[path] ?? null), TABLE_DB: {}, origin: 'https://opax.com.au' };
    const result = await api.callTool(env, 'division', { division_id: d.key });
    const row = result.rows[0];
    assert.deepEqual(row.crossed_floor.map(m => [m.name, m.party, m.vote, m.party_vote]),
      (against.votedAgainstParty(d)?.members ?? []).map(m => [m.name, m.party, m.vote, m.party_vote]), key);
  }
});

test('the /api/resource division response carries the section as voted_against_party, outside text and metadata', async () => {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const handler = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'apiResource').getText(source);
  const apiResource = runInNewContext(ts.transpile(handler) + '; apiResource', {
    Response, Request, isPublicSlug: () => true, DIVISION_SLUG_RE: /^division-/, SITE_ORIGIN: 'https://opax.com.au',
    json: data => Response.json(data), votedAgainstParty: against.votedAgainstParty,
  });
  const read = async key => {
    const d = division(key), slug = 'division-' + key;
    const env = { ASSETS: { fetch: async () => Response.json(d) } };
    const request = new Request('https://opax.test/api/resource/' + slug);
    return (await apiResource(request, new URL(request.url), slug, env, {})).json();
  };
  const senate = await read('federal-senate-9535');
  assert.deepEqual(senate.voted_against_party, JSON.parse(JSON.stringify(against.votedAgainstParty(division('federal-senate-9535')))));
  assert.equal(senate.voted_against_party.members[0].text, 'Voted no; the other 8 Liberal senators voted aye');
  assert.doesNotMatch(senate.text, /against|party/i);
  assert.equal(senate.metadata.voted_against_party, undefined);
  assert.equal((await read('federal-senate-9534')).voted_against_party, null);
});
