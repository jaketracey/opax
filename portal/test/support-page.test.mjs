import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// /support?record=<path> names the record a report is about and pre-fills the
// public GitHub issue. Only a public record's own path may reach either.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const pick = (name) => app.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
const root = app.match(/^const SUPPORT_RECORD_ROOT = .*$/m)[0];
const { supportRecord, supportIssueUrl } = runInNewContext(
  `const SITE_ORIGIN = "https://opax.com.au"; const SUPPORT_ISSUES = "https://github.com/jaketracey/opax/issues/new";
   ${root} ${pick('supportRecord')} ${pick('supportIssueUrl')} ({ supportRecord, supportIssueUrl })`,
  { URLSearchParams, String },
);

test('a report names only a public record path: no query, fragment, email, key or token', () => {
  for (const [given, kept] of [
    ['/doc/speech-123456', '/doc/speech-123456'],
    ['/subject/person/Tony Abbott', '/subject/person/Tony Abbott'],
    ['/subject/person/Kim O’Keeffe', '/subject/person/Kim O’Keeffe'],
    ['/subject/supplier/s-0f3a9c21b7e4', '/subject/supplier/s-0f3a9c21b7e4'],
    ['/money/grants/qld/recipient/abn:18374210672', '/money/grants/qld/recipient/abn:18374210672'],
    // The query and fragment never survive, whatever they hold.
    ['/money/grants?jur=federal&program=GO3141', '/money/grants'],
    ['/doc/abc#private-note', '/doc/abc'],
    ['/doc/abc?email=person%40example.invalid&token=synthetic-token', '/doc/abc'],
  ]) assert.equal(supportRecord(given), kept, given);
  for (const bad of [
    // Not a record route: search words, account and API paths.
    '/search?q=private-question', '/ask?q=my medical history', '/community?token=synthetic-token&email=person%40example.invalid',
    '/community?view=signin', '/api/community/status', '/mcp',
    // An email address, a key or a token inside the path.
    '/subject/person/jane.citizen@example.invalid', '/doc/person%40example.invalid',
    '/doc/opax_q8Zr3kLmN0pXyT5vWb2cD7eFgH1jK4sA9uQ6iO3wE', '/doc/q8Zr3kLmN0pXyT5vWb2cD7eF',
    '/doc/0123456789abcdef0123456789abcdef', '/doc/a=b', '/doc/x_y',
    // Off-site and malformed.
    '//evil.example', '/\\evil.example', 'https://evil.example/doc', 'javascript:alert(1)', '/doc/<b>', '',
    null, undefined, `/doc/${'x '.repeat(160)}`,
  ]) assert.equal(supportRecord(bad), '', String(bad));
});

test('the GitHub issue is pre-filled with the record, or left general without one', () => {
  const withRecord = new URL(supportIssueUrl('/doc/abc'));
  assert.equal(withRecord.origin + withRecord.pathname, 'https://github.com/jaketracey/opax/issues/new');
  assert.equal(withRecord.searchParams.get('title'), 'Correction: /doc/abc');
  assert.match(withRecord.searchParams.get('body'), /^Record: https:\/\/opax\.com\.au\/doc\/abc\n\nWhat is wrong:/);
  for (const raw of ['/doc/abc?email=person%40example.invalid&token=synthetic-token#note', '/community?token=synthetic-token']) {
    const url = supportIssueUrl(supportRecord(raw));
    assert.doesNotMatch(decodeURIComponent(url), /example\.invalid|synthetic-token|note/, raw);
  }
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
