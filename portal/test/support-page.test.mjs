import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// /support?record=<path> (the app's "Report this answer") names the record and
// pre-fills the GitHub issue. Only a same-site path may reach the page.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const pick = (name) => app.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
const { supportRecord, supportIssueUrl } = runInNewContext(
  `const SITE_ORIGIN = "https://opax.com.au"; const SUPPORT_ISSUES = "https://github.com/jaketracey/opax/issues/new";
   ${pick('supportRecord')} ${pick('supportIssueUrl')} ({ supportRecord, supportIssueUrl })`,
  { URLSearchParams, String },
);

test('a report names only a same-site path', () => {
  assert.equal(supportRecord('/doc/hansard-2026-09-01-123'), '/doc/hansard-2026-09-01-123');
  assert.equal(supportRecord('/subject/person/tony-abbott?tab=pay#person-pay'), '/subject/person/tony-abbott?tab=pay#person-pay');
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example/doc', 'javascript:alert(1)', '/doc/a b', '/doc/<b>', '', null, undefined, `/${'x'.repeat(301)}`]) {
    assert.equal(supportRecord(bad), '', String(bad));
  }
});

test('the GitHub issue is pre-filled with the record, or left general without one', () => {
  const withRecord = new URL(supportIssueUrl('/doc/abc'));
  assert.equal(withRecord.origin + withRecord.pathname, 'https://github.com/jaketracey/opax/issues/new');
  assert.equal(withRecord.searchParams.get('title'), 'Correction: /doc/abc');
  assert.match(withRecord.searchParams.get('body'), /^Record: https:\/\/opax\.com\.au\/doc\/abc\n\nWhat is wrong:/);
  const general = new URL(supportIssueUrl(''));
  assert.equal(general.searchParams.get('title'), 'Correction');
  assert.match(general.searchParams.get('body'), /^Record or page:/);
});

test('/support is a shell route with metadata and a sitemap entry', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(html, /<section id="panel-support" class="panel" hidden/);
  assert.match(app, /const PANELS = \[[^\]]*"support"/);
  assert.match(worker, /support: \{\n\s+title: 'Support · OPAX'/);
  assert.match(worker, /'privacy', 'support'\]\) add\(`\/\$\{page\}`\)/);
  for (const page of ['index.html', 'home.html', 'community.html']) {
    assert.match(readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8'), /href="\/support"/, page);
  }
});
