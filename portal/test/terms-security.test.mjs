import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /terms and /security are policy panels like /privacy and /support: shell
// panels routed in app.js, served whole by the Worker (SERVER_PANELS), in the
// sitemap, and linked beside Privacy wherever Privacy is in a footer.
// The Worker-rendered pages and /.well-known/security.txt are checked in
// seo-render.test.mjs.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../public/index.html');
const app = read('../public/app.js');
const worker = read('../src/index.ts');
const panel = (name) => html.match(new RegExp(`<section id="panel-${name}"[^>]*>([\\s\\S]*?)</section>`))[1];
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('/terms and /security are shell routes with titles, descriptions and sitemap entries', () => {
  for (const [name, title] of [['terms', 'Terms of use · OPAX'], ['security', 'Security · OPAX']]) {
    assert.match(html, new RegExp(`<section id="panel-${name}" class="panel policy-page" hidden aria-labelledby="${name}-title">`), name);
    assert.match(app, new RegExp(`const PANELS = \\[[^\\]]*"${name}"`), name);
    assert.ok(app.includes(`  ${name}: "${title}",`), `${name}: app title`);
    assert.match(worker, new RegExp(`  ${name}: \\{\\n\\s+title: '${title}'`), `${name}: Worker metadata`);
  }
  assert.match(app, /view === "terms" \|\| view === "security"/);
  assert.match(read('../../scripts/build_crawl_catalog.mjs'), /'\/privacy','\/support','\/terms','\/security'/);
});

test('the published text keeps no drafting marks, em dashes or questions', () => {
  for (const name of ['terms', 'security']) {
    const body = text(panel(name));
    assert.doesNotMatch(body, /[[\]—]|Jake|TODO|placeholder|\?/, name);
    assert.match(body, /Last updated 14 November 2026\./, name);
  }
  const terms = text(panel('terms'));
  for (const fact of ['Noice Pty Ltd (ABN 91 634 536 360) publishes it', 'the OPAX app for iPhone, iPad and Android',
    "OPAX's research tools for AI assistants (its MCP service)", 'governed by the law of Victoria, Australia',
    'You keep the rights in what you write. You give OPAX permission to store and show it as the community features need.'])
    assert.ok(terms.includes(fact), fact);
  const security = text(panel('security'));
  assert.ok(security.includes('acknowledge a report within 5 working days'));
  assert.ok(security.includes('We will not take action against anyone who looks for problems in good faith'));
  assert.match(panel('security'), /href="https:\/\/github\.com\/jaketracey\/opax\/security\/advisories\/new"/);
  assert.match(panel('security'), /href="mailto:support@opax\.com\.au\?subject=Security"/);
});

test('every footer with a Privacy link carries Terms and Security beside it', () => {
  for (const file of ['index.html', 'home.html', 'community.html', 'press.html']) {
    const page = read(`../public/${file}`);
    const index = page.slice(page.indexOf('<!-- nav:index:start -->'), page.indexOf('<!-- nav:index:end -->'));
    assert.match(index, /href="\/privacy">Privacy<\/a><\/li><li><a class="footer-link" href="\/terms">Terms of use<\/a><\/li><li><a class="footer-link" href="\/security">Security<\/a>/, `${file}: site index`);
    assert.match(page, /<a href="\/privacy">Privacy<\/a> ·\s*<a href="\/terms">Terms<\/a> ·\s*<a href="\/security">Security<\/a> ·/, `${file}: footer line`);
  }
});

test('the MCP reference links the terms, privacy and security; support points to security', () => {
  const docs = html.slice(html.indexOf('<div id="mcp-docs">'), html.indexOf('<h2>Known limitations</h2>'));
  for (const href of ['/terms', '/privacy', '/security']) assert.match(docs, new RegExp(`href="${href}"`), href);
  assert.match(panel('support'), /<strong>A security problem:<\/strong>[\s\S]*?href="\/security"/);
});
