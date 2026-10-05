import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

// /expense-categories.json is authored editorial copy (no export writes it). Two IPEA licences
// apply to it: the definitions draw on ipea.gov.au (CC BY 4.0) and the category names and figures
// come from the quarterly datasets on data.gov.au (CC BY 3.0 AU).
const defs = JSON.parse(await readFile(new URL('../public/expense-categories.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const IPEA = 'Independent Parliamentary Expenses Authority © Commonwealth of Australia';
const BY4 = 'https://creativecommons.org/licenses/by/4.0/';
const BY3AU = 'https://creativecommons.org/licenses/by/3.0/au/';

test('the note names both IPEA licences, each with its attribution and licence link', () => {
  const {meta} = defs;
  const byLicence = Object.fromEntries(meta.licences.map(l => [l.licence, l]));
  assert.deepEqual(Object.keys(byLicence).sort(), ['CC BY 3.0 AU', 'CC BY 4.0']);
  assert.equal(byLicence['CC BY 4.0'].licence_url, BY4);
  assert.match(byLicence['CC BY 4.0'].url, /^https:\/\/www\.ipea\.gov\.au\//);
  assert.equal(byLicence['CC BY 3.0 AU'].licence_url, BY3AU);
  assert.match(byLicence['CC BY 3.0 AU'].url, /^https:\/\/data\.gov\.au\//);
  for (const l of meta.licences) {
    assert.equal(l.attribution, IPEA);
    for (const part of [l.work, `${l.attribution}, licensed ${l.licence} (${l.licence_url})`])
      assert.ok(meta.licence_note.includes(part), part);
  }
  // the top-level pair describes meta.source, the explanatory notes on ipea.gov.au
  const own = meta.licences.find(l => l.url === meta.source_url);
  assert.deepEqual([meta.licence, meta.licence_url], [own.licence, own.licence_url]);
});

test('/expenses renders the note with working links to both works and both licences', async () => {
  const pick = re => app.match(re)?.[0] ?? assert.fail(`app.js lost ${re}`);
  const source = [
    pick(/function esc\(s\) \{[\s\S]*?\n\}/), pick(/function safeUrl\(u\) \{[\s\S]*?\n\}/),
    pick(/let expenseGlossaryDone = false;[\s\S]*?\nfunction licenceNoteHTML\(meta\) \{[\s\S]*?\n\}/),
  ].join('\n');
  const body = {innerHTML: ''};
  const context = {$: id => (id === 'expenses-defs' ? body : null), loadExpenseDefs: async () => defs};
  runInNewContext(source + '\nthis.render = renderExpenseGlossary;', context);
  await context.render();
  const section = body.innerHTML.split('<h3>Sources and licences</h3>')[1];
  assert.ok(section, 'the sources section renders');
  const links = [...section.matchAll(/<a href="([^"]+)" rel="([^"]+)" target="_blank">([^<]+)<\/a>/g)]
    .map(([, href, rel, label]) => [href, rel, label]);
  const notes = defs.meta.licences.find(l => l.licence === 'CC BY 4.0');
  const data = defs.meta.licences.find(l => l.licence === 'CC BY 3.0 AU');
  assert.deepEqual(links, [
    [notes.url, 'noopener', `${notes.work.replace("'", '&#39;')} ↗︎`],
    [BY4, 'license noopener', 'CC BY 4.0 ↗︎'],
    [data.url, 'noopener', `${data.work.replace("'", '&#39;')} ↗︎`],
    [BY3AU, 'license noopener', 'CC BY 3.0 AU ↗︎'],
  ]);
  assert.ok(section.includes('Independent Parliamentary Expenses Authority © Commonwealth of Australia, licensed <a'));
  assert.doesNotMatch(section, /\(https?:/, 'no bare licence URL is left in the text');
});
