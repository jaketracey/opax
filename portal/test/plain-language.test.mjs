import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

/* Visitor copy describes the record, not how OPAX builds it (Jake, 19 Oct).
   This walks the string literals of the main page renderers and fails when a
   pipeline word comes back in text a visitor can see or hear. Comments,
   identifiers and console output are not string text a visitor meets, so the
   walk skips them. ALLOW lists the few methodology lines where the word is
   about the source, not about us. */

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const PIPELINE = /\b(?:not yet (?:been )?(?:imported|ingested|indexed|loaded|fetched)|(?:been|being|was|were|are|is) (?:imported|ingested|backfilled)|imported for|ingest(?:ed|ion|ing)?|backfill(?:ed|ing|s)?|data pipeline|our pipeline|the pipeline|still being fetched|being fetched|fixture data|seed data|normali[sz]ed (?:title|name|text)|while indexing|currently indexing|indexing runs|coming soon|record type|indexed speech(?:es)?|speeches indexed|passages indexed|documents indexed|not yet indexed|indexed contests?|labelling pass|the labeller|pending exact export|in this release|(?:PDF )?body held|held PDF bod(?:y|ies)|held with the PDF|uncleared copyright)\b/i;

// file -> substrings of literals that may keep their word (methodology or source text)
const ALLOW = {};

const SKIP_CALLS = new Set(['log', 'warn', 'error', 'info', 'debug', 'trace', 'assert']);

function literals(path) {
  const text = read(path);
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console'
      && SKIP_CALLS.has(node.expression.name.text)) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const value = node.text;
      if (/\s/.test(value)) out.push({ value, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

// Static HTML: text outside scripts, styles and comments, plus attribute values.
function htmlText(path) {
  const lines = read(path).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
  return lines.map((value, i) => ({ value, line: i + 1 }));
}

const bundled = (path) => read(path).split('\n', 1)[0].length > 2000;
const publicJS = readdirSync(new URL('public/', root)).filter((f) => f.endsWith('.js') && f !== 'spa-shell.js').map((f) => `public/${f}`).filter((p) => !bundled(p));
const publicHTML = readdirSync(new URL('public/', root)).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`);
const workerPages = ['src/index.ts', 'src/seo-content.ts', 'src/hubs.ts', 'src/og.ts', 'src/crawl-hygiene.ts', 'src/page-entry.ts',
  'src/audit.ts', 'src/gov-advertising.ts', 'src/instruments.ts', 'src/state-bills.ts'];

function offenders(files, extract) {
  const found = [];
  for (const file of files) {
    for (const { value, line } of extract(file)) {
      const hit = value.match(PIPELINE);
      if (!hit) continue;
      if ((ALLOW[file] || []).some((ok) => value.includes(ok))) continue;
      found.push(`${file}:${line}: "${hit[0]}" in ${JSON.stringify(value.trim().slice(0, 140))}`);
    }
  }
  return found;
}

test('page scripts keep pipeline wording out of visitor copy', () => {
  assert.ok(publicJS.includes('public/app.js') && publicJS.includes('public/electorates.js'));
  assert.deepEqual(offenders(publicJS, literals), []);
});

test('static pages keep pipeline wording out of visitor copy', () => {
  assert.ok(publicHTML.includes('public/index.html'));
  assert.deepEqual(offenders(publicHTML, htmlText), []);
});

test('Worker-rendered pages keep pipeline wording out of visitor copy', () => {
  assert.deepEqual(offenders(workerPages, literals), []);
});

test('the guard catches the words it is meant to catch', () => {
  for (const line of ['Census indicators have not yet been imported for this electorate.', 'Answers may be incomplete while indexing runs.', 'No indexed speeches under this name', 'Record type']) assert.match(line, PIPELINE, line);
  for (const line of ['No census data for this electorate yet.', 'Loading grants', 'The contract records could not be loaded.', 'Amounts under the disclosure threshold are not reported.']) assert.doesNotMatch(line, PIPELINE, line);
});

/* app.js keeps these renderers private, so the test lifts each function out of
   the source and runs it in a DOM with the page's helpers stubbed. */
function appFunction(name, scope) {
  const text = read('public/app.js');
  const source = ts.createSourceFile('app.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const node = source.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(node, name);
  const names = Object.keys(scope);
  return new Function(...names, `${node.getText(source)}\nreturn ${name};`)(...names.map((k) => scope[k]));
}

test('person and topic pages drop their topic sections when nothing is labelled', async () => {
  const { JSDOM } = await import('jsdom');
  const { window } = new JSDOM('<main id="sections"></main>');
  const document = window.document;
  const sections = document.getElementById('sections');
  const renderPersonTopics = appFunction('renderPersonTopics', {
    document, currentSubjectKey: 'person:x', skelHTML: () => '', TOPICS: {},
    api: async () => ({ profiles: { all: { topics: [] } } }), aggregateApi: async () => ({ topics: [], labelled: 0 }),
  });
  await renderPersonTopics('Example Member', sections);
  assert.equal(sections.querySelector('#person-topics'), null);
  assert.doesNotMatch(sections.innerHTML, /What they talk about/);

  const mount = document.createElement('section');
  sections.appendChild(mount);
  const renderTopicArc = appFunction('renderTopicArc', {
    document, currentSubjectKey: 'topic:x', searchQueryParams: () => new URLSearchParams(), SEARCH_EXPORT_MAX: 1,
    api: async () => ({ results: [] }), loadPhotoMap: async () => null,
  });
  assert.equal(await renderTopicArc('health', 'health', 'topic:x', mount), false);
  assert.equal(mount.isConnected, false);
  assert.doesNotMatch(sections.innerHTML, /The arc of this debate/);
});
