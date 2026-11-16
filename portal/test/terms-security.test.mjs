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

test('the takedown section says who to contact, what OPAX does and what it cannot, and promises nothing the code does not do', () => {
  const html = panel('terms'), at = html.indexOf('id="terms-takedown"');
  assert.ok(at > 0);
  const section = text(html.slice(at, html.indexOf('<h2', at + 10)));
  for (const fact of ['support@opax.com.au', 'A person reads these requests and acts on them the same day.',
    "adding it to OPAX's withheld list", '"Withheld at the publisher\'s request"', '"Withheld: subject to a legal order"', 'a link to the publisher',
    'OPAX shows no text, excerpt or summary of it', 'Removes it from the knowledge base that Ask and search read.',
    'starting a new cache period and publishing the site again', 'IndexNow',
    "Remove a copy of an answer or a conversation that is already saved on a reader's own device.",
    'Change the copies held by other sites or by search engines.',
    'Today OPAX acts when it is told about a change, or when a maintainer sees one.',
    "There is no automatic check of a publisher's site for amended or withdrawn documents yet."])
    assert.ok(section.includes(fact), fact);
  // No timeframe shorter than the same day, no promise to detect changes, and no claim about commercial use.
  assert.doesNotMatch(section, /\b(?:hours?|minutes?|immediately|instantly|at once|straight away|within)\b/i);
  assert.doesNotMatch(section, /\b(?:monitors?|detects?|automatically (?:checks|removes|withholds))\b/i);
  // The labels the page quotes are the labels the code shows, and the contact is the one /support gives.
  const policy = read('../../parli/ingest/source_policy.mjs');
  for (const label of ["Withheld at the publisher's request", 'Withheld: subject to a legal order']) assert.ok(policy.includes(label), label);
  for (const name of ['terms', 'privacy', 'support']) assert.doesNotMatch(text(panel(name)), /non-?\s?commercial/i, name);
  assert.match(read('../../docs/TAKEDOWN.md'), /support@opax\.com\.au\*\*\. A person reads the request and acts on it the same day\./);
});

test('the published text keeps no drafting marks, em dashes or questions', () => {
  for (const name of ['terms', 'security']) {
    const body = text(panel(name));
    assert.doesNotMatch(body, /[[\]—]|Jake|TODO|placeholder|\?/, name);
    assert.match(body, name === 'terms' ? /Last updated 16 November 2026\./ : /Last updated 14 November 2026\./, name);
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
