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

test('the privacy page lists exactly the nine App Store and Google Play label types, in label order', () => {
  const list = panel('privacy').match(/<ul class="about-list" id="privacy-app-data">([\s\S]*?)<\/ul>/)[1];
  const named = [...list.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  assert.deepEqual(named, ['Email Address', 'User ID', 'Audio Data', 'Other User Content',
    'Product Interaction', 'Search History', 'Other Diagnostic Data', 'Device ID', 'Crash Data']);
  // Each kind gives its Google Play Data safety name (docs/ANDROID-STORE.md, "Data safety").
  const play = [...text(list).matchAll(/Google Play: ([^)]+)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(play, ['Email address', 'User IDs', 'Voice or sound recordings', 'Other user-generated content',
    'App interactions', 'In-app search history', 'Diagnostics', 'Device or other IDs', 'Crash logs']);
  assert.doesNotMatch(list.replace(/<a [^>]*>[^<]*<\/a>/g, ''), /Emails or Text Messages|community|discussions|direct messages/i, 'Community data is web-only in the 1.0 app');
  const body = text(panel('privacy'));
  for (const fact of ['None of it is used to track you',
    'In the iPhone, iPad and Android app', 'The OPAX app for iPhone, iPad and Android needs no account',
    'It has no advertising and no tracking. It sends no advertising identifier and never reads your device\'s own identifier; it uses a random install ID that isn\'t linked to you. Through PostHog, it counts which screens and features are used and sends a report when the app crashes or hits an error. These go through opax.com.au, which passes your IP address on to PostHog in the United States, as it does for the website. They carry no account details or anything you type, are not linked to you, and cannot be turned off in the app.',
    'The app sends PostHog counts of how it is used and reports of crashes and errors, which are not linked to you. It sends no advertising identifier and never reads your device\'s own identifier; it uses a random install ID that isn\'t linked to you.',
    'The app\'s App Store privacy label and its Google Play Data safety section list nine kinds of data.',
    'App Store privacy label and Google Play Data safety',
    'The App Store label counts seven kinds as connected to your identity, and Device ID and Crash Data as not linked to you.',
    'Every kind below is collected, and none is shared',
    'deleting your account does not delete them',
    'your device asks for your permission',
    'no messages, contacts, photos, health, financial or purchase details. The app sends no advertising identifier and never reads your device\'s own identifier; it uses a random install ID that isn\'t linked to you. Source links',
    'Source links open in a Safari view on iPhone and iPad, or in a Custom Tab of your browser on Android, which the app cannot read',
    'in the Keychain on an iPhone or iPad, and encrypted with a key kept in the Android Keystore on Android',
    'then your device asks for microphone permission the first time you start a call (on Android, after the app explains why it needs it).',
    'Cloudflare, ElevenLabs, PostHog, Progress Agentic RAG and OpenRouter',
    'the app\'s counts and crash reports, and your IP address forwarded by OPAX\'s server with both',
    'An account holds up to 50', 'Your location is never sent', 'Last updated 16 November 2026',
    'Community is on the website only', 'Before your first question is sent, Ask asks your permission',
    'nothing is sent until you agree', 'After an answer, Report this answer opens the support page'])
    assert.ok(body.includes(fact), fact);
  // Jake's Device ID wording (15 Nov), the same in all three places.
  assert.equal(body.split("sends no advertising identifier and never reads your device's own identifier; it uses a random install ID that isn't linked to you.").length - 1, 3);
  // The app sends PostHog analytics (since 1.1.0) and crash and error reports (1.1.4), on
  // iPhone, iPad and Android; the page covers both stores.
  for (const stale of ['no analytics, no advertising', 'crash-reporting', 'crash reports or device identifiers',
    'The app has no analytics', 'lists seven kinds', 'the seven kinds', 'counts every kind as connected',
    'In the iPhone and iPad app', 'app for iPhone and iPad', 'iOS asks', "device's Keychain",
    'on the website only, in the United States', 'ElevenLabs, Progress Agentic RAG', 'Last updated 13 November 2026',
    'it counts which screens are used and', 'sends no device or advertising identifier', 'or device identifiers', 'carry no account details or anything you type, and are not linked to you.'])
    assert.ok(!body.includes(stale), stale);
});

test('the policy pages name the live contact addresses and the publisher, not an interim route', () => {
  for (const name of ['privacy', 'support', 'about']) {
    const body = name === 'about' ? html.slice(html.indexOf('id="about-contact"'), html.indexOf('<!-- ============================ METHODS')) : panel(name);
    assert.match(body, /mailto:support@opax\.com\.au/, name);
    assert.doesNotMatch(body, /does not yet have a private contact address|no dedicated inbox|which is in testing/, name);
  }
  assert.match(panel('privacy'), /mailto:privacy@opax\.com\.au/);
  assert.match(text(panel('privacy')), /Noice Pty Ltd publishes it, including the app on the App Store and Google Play, and is responsible for this policy/);
  // About and the /support lede name all three platforms.
  assert.ok(text(html).includes('Noice Pty Ltd publishes OPAX, including the iPhone, iPad and Android app.'));
  assert.ok(text(panel('support')).includes('Help with the OPAX website and the OPAX app for iPhone, iPad and Android: how to reach'));
  assert.doesNotMatch(text(html), /iPhone and iPad app|app for iPhone and iPad/);
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
  assert.match(text(body), /for the app, in your device's Settings app, under Apps, then OPAX\./);
  assert.doesNotMatch(text(body), /app in the Settings app/);
  assert.match(body, /href="\/privacy#privacy-deletion"/);
});

test('panelPrerender copies information and policy panels, whole and visible', () => {
  assert.deepEqual([...SERVER_PANELS], ['privacy', 'support', 'terms', 'security', 'methods', 'about', 'stats']);
  for (const name of SERVER_PANELS) {
    const copy = panelPrerender(html, name);
    assert.ok(copy.startsWith(`<section id="prerender" class="wrap policy-page" data-panel-copy="${name}">`), name);
    assert.ok(copy.includes(panel(name)), name);
    assert.equal((copy.match(/<h1\b/g) || []).length, 1, name);
    assert.doesNotMatch(copy, new RegExp(`id="panel-${name}"`), name);
  }
  assert.equal(panelPrerender(html, 'ask'), null);
  assert.equal(panelPrerender('<main></main>', 'privacy'), null);
  assert.match(panelPrerender('<section id="panel-stats"><section>x</section><p>last</p></section>', 'stats'), /<section>x<\/section><p>last<\/p><\/section>$/);
  assert.equal(panelPrerender('<section id="panel-stats"><section>x</section>', 'stats'), null);
});
