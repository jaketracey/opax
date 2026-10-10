import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelPrerender, SERVER_PANELS } from '../src/seo-content.ts';

// /privacy states the app's App Store privacy label (release/1.0/app-privacy.json
// on the store branch) and /support says how to get help and delete an account.
// Both are served whole by the Worker from these panels (panelPrerender).

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const panel = (name) => html.match(new RegExp(`<section id="panel-${name}"[^>]*>([\\s\\S]*?)</section>`))[1];
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the privacy page lists exactly the eight App Store label types, in label order', () => {
  const list = panel('privacy').match(/<ul class="about-list" id="privacy-app-data">([\s\S]*?)<\/ul>/)[1];
  const named = [...list.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  assert.deepEqual(named, ['Email Address', 'User ID', 'Emails or Text Messages', 'Audio Data',
    'Other User Content', 'Product Interaction', 'Search History', 'Other Diagnostic Data']);
  const body = text(panel('privacy'));
  for (const fact of ['None of it is used to track you', 'counts every kind as connected to your identity',
    'no analytics, no advertising and no tracking', 'Cloudflare, ElevenLabs, Progress Agentic RAG and OpenRouter',
    'An account holds up to 50', 'Your location is never sent', 'Last updated 10 October 2026'])
    assert.ok(body.includes(fact), fact);
});

test('the policy pages name the live contact addresses and the publisher, not an interim route', () => {
  for (const name of ['privacy', 'support', 'about']) {
    const body = name === 'about' ? html.slice(html.indexOf('id="about-contact"'), html.indexOf('<!-- ============================ METHODS')) : panel(name);
    assert.match(body, /mailto:support@opax\.com\.au/, name);
    assert.doesNotMatch(body, /does not yet have a private contact address|no dedicated inbox|which is in testing/, name);
  }
  assert.match(panel('privacy'), /mailto:privacy@opax\.com\.au/);
  assert.match(text(panel('privacy')), /Noice Pty Ltd publishes it, including the app on the App Store, and is responsible for this policy/);
});

test('support gives help, corrections, answers and the in-app deletion path', () => {
  const body = panel('support');
  for (const id of ['support-contact', 'support-report', 'support-answers', 'support-account', 'support-delete', 'support-record', 'support-record-link', 'support-issue-link'])
    assert.match(body, new RegExp(`id="${id}"`), id);
  const steps = [...body.match(/<h3>In the app<\/h3>\s*<ol class="about-list">([\s\S]*?)<\/ol>/)[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]).trim());
  assert.deepEqual(steps, ['Tap the person icon (Account and about).', 'Tap Delete account.',
    'Read what is deleted and what is not, then tap Delete account. OPAX emails a deletion code to the address on your account.',
    'Enter the 8-digit deletion code and tap Delete account.']);
  assert.match(text(body), /Accounts and voice are for people aged 16 and over/);
  assert.match(body, /href="\/privacy#privacy-deletion"/);
});

test('panelPrerender copies only the policy panels, whole and visible', () => {
  assert.deepEqual([...SERVER_PANELS], ['privacy', 'support']);
  for (const name of SERVER_PANELS) {
    const copy = panelPrerender(html, name);
    assert.ok(copy.startsWith(`<section id="prerender" class="wrap policy-page" data-panel-copy="${name}">`), name);
    assert.ok(copy.includes(panel(name)), name);
    assert.equal((copy.match(/<h1\b/g) || []).length, 1, name);
    assert.doesNotMatch(copy, new RegExp(`id="panel-${name}"`), name);
  }
  assert.equal(panelPrerender(html, 'about'), null);
  assert.equal(panelPrerender('<main></main>', 'privacy'), null);
  assert.equal(panelPrerender('<section id="panel-privacy"><section>x</section></section>', 'privacy'), null);
});
