// The division page (pass 4G): who voted which way comes from the published
// export where it lists members, and otherwise from the division's own record
// in the index, by the same /api/resource read the page always made. Record
// data is never dropped to simplify the page; a failed read leaves the counts
// and the party split with a one-line note. Every fetch here is a stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

/** A top-level function's source, by brace matching from its declaration. */
function fn(name) {
  const start = app.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `app.js declares ${name}`);
  let parens = 0, body = start + app.slice(start).indexOf('(');
  for (; body < app.length; body++) {
    if (app[body] === '(') parens++;
    else if (app[body] === ')' && --parens === 0) break;
  }
  let depth = 0;
  for (let i = app.indexOf('{', body); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}

/** The three division helpers, with `api` (the page's fetch wrapper) stubbed. */
function page(answers) {
  const calls = [];
  const context = {
    calls,
    api: async (path) => {
      calls.push(path);
      const answer = answers[path];
      if (answer instanceof Error || answer === undefined) throw answer || new Error('Request failed (502)');
      return answer;
    },
    esc: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    billNoteHTML: (text) => `<p>${String(text)}</p>`,
  };
  runInNewContext(`${fn('divisionNamesFromResource')}\n${fn('loadDivisionNames')}\n${fn('divisionMembersHTML')}
    Object.assign(globalThis, { divisionNamesFromResource, loadDivisionNames, divisionMembersHTML });`, context);
  return context;
}
const slug = 'division-federal-representatives-1080';
/** A plain copy: the helpers run in their own realm, so compare by value. */
const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('an export with a member list is the source: no index read, names linked to their entries', async () => {
  const ctx = page({});
  const d = { ayes: 2, noes: 1, members: [
    { name: 'Penny Allman-Payne', person_slug: 'penny-allman-payne', vote: 'aye' },
    { name: 'David Pocock', person_slug: 'david-pocock', vote: 'aye' },
    { name: 'Sue Lines', person_slug: 'sue-lines', vote: 'no' },
    { name: 'Fatima Payman', person_slug: 'fatima-payman', vote: 'absent' },
  ] };
  const names = await ctx.loadDivisionNames(slug, d);
  assert.deepEqual(plain(ctx.calls), []);
  assert.equal(names.from, 'export');
  const html = ctx.divisionMembersHTML(names, { ayes: 2, noes: 1 });
  assert.match(html, /<a href="\/subject\/person\/penny-allman-payne">Penny Allman-Payne<\/a>/);
  assert.match(text(html), /Ayes 2 Penny Allman-Payne David Pocock Noes 1 Sue Lines/);
  assert.doesNotMatch(html, /Fatima Payman/, 'absent members are not on either side');
});

test('an export without members falls back to the same /api/resource read the page made before', async () => {
  // Since pass 4G's first cut the page called nothing here; production read the
  // division's record. The request is byte-for-byte the old one.
  assert.match(fn('loadDivisionNames'), /api\(`\/api\/resource\/\$\{encodeURIComponent\(slug\)\}`\)/);
  const ctx = page({
    [`/api/resource/${slug}`]: { slug, text: 'On 14 May 2013 …', metadata: {
      ayes_count: 2, noes_count: 2, ayes: ['Bronwyn Bishop', 'Tony Abbott'], noes: ['Gary Gray', 'Mark Dreyfus'], paired: ['Bob Katter'] } },
  });
  const names = await ctx.loadDivisionNames(slug, { ayes: 2, noes: 2, members: [] });
  assert.deepEqual(plain(ctx.calls), [`/api/resource/${slug}`]);
  assert.equal(names.from, 'record');
  const html = ctx.divisionMembersHTML(names, { ayes: 2, noes: 2 });
  assert.match(text(html), /Ayes 2 Bronwyn Bishop Tony Abbott Noes 2 Gary Gray Mark Dreyfus Paired, not counted 1 Bob Katter/);
  assert.doesNotMatch(html, /<a /, 'index names carry no person id, so they are not linked');
});

test('a division stored in parts reads every part; a part that fails says so and keeps the rest', async () => {
  const parts = [slug, `${slug}-p2`, `${slug}-p3`];
  const ctx = page({
    [`/api/resource/${slug}`]: { metadata: { ayes: ['A One', 'A Two'], noes: [], paired: [], part: 1, parts: 3, part_slugs: parts } },
    [`/api/resource/${slug}-p2`]: { metadata: { ayes: [], noes: ['N One', 'N Two'], paired: [], part: 2, parts: 3, part_slugs: parts } },
    [`/api/resource/${slug}-p3`]: new Error('Request failed (502)'),
  });
  const names = await ctx.loadDivisionNames(slug, { members: [] });
  assert.deepEqual(plain(ctx.calls), parts.map((s) => `/api/resource/${s}`));
  assert.deepEqual(plain(names.aye.map((m) => m.name)), ['A One', 'A Two']);
  assert.deepEqual(plain(names.no.map((m) => m.name)), ['N One', 'N Two']);
  assert.match(ctx.divisionMembersHTML(names, { ayes: 2, noes: 3 }), /Part of this list could not load just now\./);
});

test('a record that carries its names only in its body still gives the lists; one with none keeps its words', async () => {
  const body = 'On 23 December 2025 the NSW Legislative Council divided on President of the Legislative Council. '
    + 'Question: That this House dissent from the ruling of the President. Ayes 2: Mark Banasiak, Mark Latham. '
    + 'Noes 3: Scott Barrett, Sue Higginson, Rod Roberts. Paired (recorded, not counted): John Ruddick. '
    + 'The question was resolved in the negative (2–3).';
  const ctx = page({ [`/api/resource/${slug}`]: { text: body, metadata: { ayes_count: 2, noes_count: 3 } } });
  const names = await ctx.loadDivisionNames(slug, {});
  assert.deepEqual(plain([names.aye, names.no, names.paired].map((l) => l.map((m) => m.name))),
    [['Mark Banasiak', 'Mark Latham'], ['Scott Barrett', 'Sue Higginson', 'Rod Roberts'], ['John Ruddick']]);
  const bare = page({ [`/api/resource/${slug}`]: { text: 'The question was resolved in the negative.', metadata: {} } });
  const kept = await bare.loadDivisionNames(slug, {});
  assert.match(bare.divisionMembersHTML(kept), /<div class="division-markdown"><p>The question was resolved in the negative\.<\/p><\/div>/);
});

test('when the record cannot be read the block is one plain line, and the counts and split stay', async () => {
  const ctx = page({ [`/api/resource/${slug}`]: new Error('resource fetch failed (502)') });
  const names = await ctx.loadDivisionNames(slug, { ayes: 65, noes: 70, members: [] });
  assert.deepEqual(plain(names), { failed: true });
  const html = ctx.divisionMembersHTML(names, { ayes: 65, noes: 70 });
  assert.equal(text(html), 'Who voted which way The member list could not load just now; the counts and the party split are from the published export.');
  assert.doesNotMatch(html, /resource fetch failed/);
  // The page draws the counts and the party split before it asks for names.
  const render = fn('renderDivisionDoc');
  assert.ok(render.indexOf('billSplitParts(entry)') < render.indexOf('loadDivisionNames(slug, d)'));
  assert.match(render, /ayes, \$\{noes\.toLocaleString\(\)\} noes/);
});
