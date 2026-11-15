// Every email OPAX sends is drawn with one layout (src/email-layout.ts,
// docs/EMAIL-STYLE.md). These tests hold each email to it: the shared frame,
// a plain-text part, no outside resource, nothing that tracks, no placeholder
// left unfilled, and the design tokens' own values. They need no dependencies:
// the sources are read by Node directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {emailLayout, emailText, emailTokens, emailScale} from '../src/email-layout.ts';
import {emailSamples, digestSpec, ORIGIN} from '../scripts/email-samples.mjs';

const samples = emailSamples();
const tokens = JSON.parse(readFileSync(new URL('../../docs/design/design-tokens.json', import.meta.url), 'utf8'));
const decode = (s) => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => decode(m[1]));
/** The body as a reader meets it: no head, no Outlook-only comments. */
const body = (html) => html.slice(html.indexOf('<body')).replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '');
const words = (html) => decode(body(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&zwnj;|&#847;|&middot;/g, ' ')).replace(/\s+/g, ' ').trim();

test('there is a sample of every email the Worker sends, and each send uses one', () => {
  const src = new URL('../src/', import.meta.url);
  const sends = [];
  for (const name of readdirSync(src)) {
    if (!name.endsWith('.ts')) continue;
    for (const m of readFileSync(new URL(name, src), 'utf8').matchAll(/COMMUNITY_EMAIL\.send\(\{([\s\S]{0,260})/g)) sends.push(`${name}: ${m[1].replace(/\s+/g, ' ')}`);
  }
  assert.equal(sends.length, 3, 'a new sender needs a sample here and a row in docs/EMAIL-STYLE.md');
  // No send writes its own subject or body: each spreads an email built by the layout.
  for (const send of sends) {
    assert.match(send, /\.\.\.(signInEmail|replyEmail|deletionEmail)\(/, send);
    assert.doesNotMatch(send, /subject:|html:|text:/, send);
  }
  assert.deepEqual(samples.filter((s) => s.sent).map((s) => s.name), ['sign-in', 'sign-in-app-code', 'reply', 'account-deletion']);
});

for (const {name, mail, title, button, hrefs: allowed} of samples) {
  test(`${name}: drawn with the shared layout`, () => {
    assert.match(mail.html, /^<!doctype html>\n<html lang="en-AU"/);
    assert.match(mail.html, /<meta name="color-scheme" content="light dark">/);
    assert.match(mail.html, /<meta name="supported-color-schemes" content="light dark">/);
    assert.match(mail.html, /@media \(prefers-color-scheme:dark\)\{\.e-ground\{/);
    // One column, 600 px at most, on tables.
    assert.equal(body(mail.html).match(/max-width:600px/g).length, 3, 'brand row, card and footer share the column');
    assert.match(mail.html, /<table role="presentation" width="100%"[^>]*class="e-card"/);
    // (The one div is the hidden preheader.)
    assert.doesNotMatch(body(mail.html).replace(/<div style="display:none[^>]*>[^<]*<\/div>/, ''), /<div|display:flex|display:grid|position:/);
    // One h1: the email's title, as given.
    assert.deepEqual([...mail.html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => decode(m[1])), [title]);
    // The footer says who sent it; the brand row names OPAX.
    assert.match(words(mail.html), /Sent by OPAX, the Open Parliamentary Accountability Exchange\./);
    assert.match(words(mail.html), /The public record belongs to everyone\./);
  });

  test(`${name}: a subject, a preheader and a text part`, () => {
    assert.ok(mail.subject.length > 0 && mail.subject.length < 50, `${mail.subject.length} characters`);
    assert.equal(decode(mail.html.match(/<title>([^<]*)<\/title>/)[1]), mail.subject);
    const preheader = mail.html.match(/<div style="display:none[^"]*">([^<&]+)/);
    assert.ok(preheader && preheader[1].length > 20, 'a preheader that says something');
    assert.equal(typeof mail.text, 'string');
    assert.ok(mail.text.length > 80);
    assert.doesNotMatch(mail.text, /<[a-z/][^>]*>/i, 'the text part holds no markup');
  });

  test(`${name}: at most one button, and it is the email's action`, () => {
    const buttons = [...body(mail.html).matchAll(/<a class="e-button" href="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
    assert.deepEqual(buttons.map((m) => decode(m[2])), button ? [button] : []);
    if (!button) return;
    // The same address in the Outlook button, the button and the copyable line.
    const target = decode(buttons[0][1]);
    assert.equal(hrefs(mail.html).filter((h) => h === target).length >= 3, true);
    assert.ok(mail.text.includes(target), 'and in the text part');
    // 24 px line + 12 px above and below + 1 px borders: at least 44.
    const style = body(mail.html).match(/<a class="e-button"[^>]*style="([^"]*)"/)[1];
    const px = (prop) => Number(style.match(new RegExp(`${prop}:(\\d+)px`))[1]);
    assert.ok(px('line-height') + 2 * px('padding') >= emailScale.target);
  });

  test(`${name}: no outside resource, no script, nothing that tracks`, () => {
    // The only image is the mark, embedded in the message itself.
    const images = [...mail.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(images.length, 1);
    assert.match(images[0], /src="cid:opax-brand-mark"/);
    assert.match(images[0], /width="40" height="40"/);
    assert.match(images[0], /alt=""/, 'decorative: the wordmark beside it is text');
    assert.deepEqual(mail.attachments.map((a) => [a.contentId, a.disposition, a.type]), [['opax-brand-mark', 'inline', 'image/png']]);
    assert.doesNotMatch(mail.html, /<script|<link\b|<iframe|<form|<video|<object|@import|@font-face|url\(|background(?:-image)?\s*[:=]\s*["']?(?:url|https?)/i);
    assert.doesNotMatch(mail.html, /\bsrc="(?!cid:opax-brand-mark")/);
    // Every link is one the email is meant to carry, written as it is in the
    // text part: no redirect through a click counter.
    for (const href of hrefs(mail.html)) {
      assert.ok(allowed.includes(href), `${href} is not one of this email's links`);
      // (The footer's home and privacy links are the layout's; an email's own
      // text part, kept as it was, may not repeat them.)
      assert.ok(mail.text.includes(href) || href === ORIGIN || href === `${ORIGIN}/community?view=privacy`, `${href} is in the text part too`);
      assert.doesNotMatch(href, /utm_|[?&](?:mc_|ref=|trk)/);
    }
  });

  test(`${name}: nothing left unfilled`, () => {
    for (const part of [mail.html, mail.text, mail.subject]) {
      assert.doesNotMatch(part, /\$\{|\{\{|%[sd]\b|\[object |\bundefined\b|\bNaN\b|\bnull\b/);
    }
    // No empty paragraph, heading or link.
    assert.doesNotMatch(body(mail.html), /<(p|h1|h2|a)\b[^>]*>\s*<\/\1>/);
  });

  test(`${name}: light colours are inline, so a client without dark mode still reads`, () => {
    assert.match(mail.html, new RegExp(`<body class="e-ground" style="[^"]*background-color:${emailTokens.paper[0]};[^"]*color:${emailTokens.ink[0]};`));
    // Every element a dark rule recolours carries its light colour inline.
    for (const m of body(mail.html).matchAll(/<(\w+)[^>]*class="[^"]*\be-(ink|soft|link)\b[^"]*"[^>]*>/g)) assert.match(m[0], /style="[^"]*(?<![-\w])color:#[0-9A-F]{6}/, m[0].slice(0, 120));
    for (const m of body(mail.html).matchAll(/<(\w+)[^>]*class="[^"]*\be-(card|panel|button|ground)\b[^"]*"[^>]*>/g)) assert.match(m[0], /bgcolor="#[0-9A-F]{6}"|background-color:#[0-9A-F]{6}/, m[0].slice(0, 120));
  });
}

test('the layout draws with the design tokens’ own values', () => {
  const groups = Object.values(tokens.color).filter((g) => typeof g === 'object');
  const token = (name) => groups.find((g) => g[name])[name];
  for (const [name, [light, dark]] of Object.entries(emailTokens)) {
    assert.equal(light, token(name).$value, `${name}, light`);
    assert.equal(dark, token(name).dark, `${name}, dark`);
  }
  assert.equal(emailScale.target, tokens.size.target.$value);
  for (const step of ['line', 'tight', 'block', 'group', 'screen']) assert.equal(emailScale[step], tokens.space[step].$value, step);
  assert.equal(emailScale.section_gap, tokens.space.section.$value);
  assert.equal(emailScale.body[0], tokens.type.body.size);
  // The app's roles (mobile/src/design/tokens.ts): recordTitle 28/36,
  // recordHeading 22/30, rowRecord 17/23, secondary 15, footnote 13; the
  // container and tile corners.
  assert.deepEqual([emailScale.heading, emailScale.section, emailScale.subheading], [[28, 36], [22, 30], [17, 23]]);
  assert.deepEqual([emailScale.metadata[0], emailScale.fine[0]], [15, 13]);
  assert.deepEqual([emailScale.radiusCard, emailScale.radiusTile], [22, 18]);
  // Navy is the one tint: no bronze anywhere but the mark itself.
  for (const {name, mail} of samples) assert.doesNotMatch(mail.html, /#A0761B|#A87D2A|#8A5A12|#D9A84A/i, name);
  // The action is a pill, as every pressed thing in the app is.
  assert.match(samples[0].mail.html, new RegExp(`class="e-button"[^>]*border-radius:${tokens.radius.pill.$value}px`));
});

test('each email keeps its own facts', () => {
  const by = Object.fromEntries(samples.map((s) => [s.name, s.mail]));
  assert.equal(by['sign-in'].subject, 'Your sign-in link for Opax');
  assert.equal(by['reply'].subject, 'New reply to your Opax discussion');
  assert.equal(by['account-deletion'].subject, 'Confirm your Opax account deletion');
  for (const part of [words(by['sign-in'].html), by['sign-in'].text]) {
    assert.match(part, /15 minutes/); assert.match(part, /can only be used once/); assert.match(part, /safely ignore/);
  }
  assert.doesNotMatch(by['sign-in'].html, /app sign-in code/);
  for (const part of [words(by['sign-in-app-code'].html), by['sign-in-app-code'].text]) {
    assert.match(part, /Your Opax app sign-in code:? 12345678/);
    assert.match(part, /Never share this code/);
    assert.match(part, /The link signs you in through your browser, not the app/);
    assert.match(part, /Using the link also uses up this code/);
  }
  for (const part of [words(by['reply'].html), by['reply'].text]) {
    assert.match(part, /Invented Reader replied to your discussion:/);
    assert.match(part, /What does the record show on housing\?/);
    assert.match(part, /The second reading speech is on the record\./);
    assert.match(part, /because you started this discussion/);
    assert.match(part, /Manage email notifications/); assert.match(part, /Unsubscribe from reply emails/);
  }
  assert.equal(by['reply'].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  for (const part of [words(by['account-deletion'].html), by['account-deletion'].text]) {
    assert.match(part, /Your Opax account deletion code:? 87654321/);
    assert.match(part, /It expires in 15 minutes/);
    assert.match(part, /only if you requested permanent account deletion/);
    assert.match(part, /Never share this code/);
    assert.match(part, /If you did not request deletion, ignore this email/);
  }
  // The deletion email carries a code to type and no way to sign in.
  assert.doesNotMatch(by['account-deletion'].html + by['account-deletion'].text, /#token=|view=signin/);
});

test('the outline of each email', () => {
  const outline = (html) => [...body(html).matchAll(/<(h1|h2|p|a|td)\b[^>]*class="[^"]*\be-(button|panel|quote)\b|<(h1|h2)\b/g)].map((m) => m[2] ?? m[3]).join(' ');
  assert.deepEqual(Object.fromEntries(samples.map((s) => [s.name, outline(s.mail.html)])), {
    'sign-in': 'h1 button',
    'sign-in-app-code': 'h1 panel button',
    'reply': 'h1 quote button',
    'account-deletion': 'h1 panel',
    'digest-example': 'h1 h2 h2 button',
  });
});

test('every value is escaped: a member’s words cannot add markup', () => {
  const mail = emailLayout({origin: ORIGIN, subject: 'A <b>subject</b>', preheader: 'Pre <i>header</i>', title: 'T <script>x</script>',
    blocks: [{kind: 'text', text: ['a <u>b</u> ', {strong: '<em>c</em>'}]}, {kind: 'quote', title: '<img src=x>', text: 'one\n<two>'}, {kind: 'code', label: '<l>', code: '<1>', note: '<n>'},
      {kind: 'items', heading: '<h>', items: [{title: '<t>', href: 'https://opax.example/?a=1&b="2"', summary: '<s>', source: '<src>', sourceHref: 'https://source.example/?x=<y>', date: '<d>'}]}],
    action: {href: 'https://opax.example/?q=<a>&r=1', label: '<go>'}, note: '<note>', reason: '<why>', links: [{href: 'https://opax.example/u?t="x"', label: '<unsub>'}]});
  const tags = new Set([...body(mail.html).matchAll(/<\/?([a-z0-9]+)/g)].map((m) => m[1]));
  assert.deepEqual([...tags].sort(), ['a', 'body', 'br', 'div', 'h1', 'h2', 'html', 'img', 'p', 'strong', 'table', 'td', 'tr']);
  assert.equal(body(mail.html).match(/<img/g).length, 1);
  assert.match(mail.html, /one<br>&lt;two&gt;/);
  assert.match(mail.html, /href="https:\/\/opax\.example\/\?a=1&amp;b=&quot;2&quot;"/);
});

test('a digest plugs in: a heading, sourced items and an unsubscribe, with its text written for it', () => {
  const mail = emailLayout(digestSpec);
  const text = emailText(digestSpec);
  assert.equal(mail.text, text, 'with no text given, the layout writes one from the same fields');
  const items = digestSpec.blocks.flatMap((b) => b.items ?? []);
  assert.equal(items.length, 3);
  for (const item of items) {
    for (const part of [words(mail.html), text]) { assert.ok(part.includes(item.title)); assert.ok(part.includes(`Source: ${item.source}`)); }
    assert.ok(hrefs(mail.html).includes(item.href)); assert.ok(text.includes(item.href));
    if (item.sourceHref) { assert.ok(hrefs(mail.html).includes(item.sourceHref)); assert.ok(text.includes(item.sourceHref)); }
  }
  assert.deepEqual([...mail.html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]), ['Bills', 'Votes']);
  const unsubscribe = digestSpec.links[0];
  assert.ok(hrefs(mail.html).includes(unsubscribe.href));
  assert.match(text, new RegExp(`${unsubscribe.label}: ${unsubscribe.href.replace(/[?.]/g, '\\$&')}`));
  // Item titles and footer links are each a line of their own, 44 px tall.
  for (const m of body(mail.html).matchAll(/<a class="e-link" href="[^"]*" style="display:inline-block;([^"]*)"/g)) {
    const padding = [...m[1].matchAll(/padding:(\d+)px 0/g)].map((p) => Number(p[1])).at(-1);
    const line = Number([...m[1].matchAll(/line-height:(\d+)px/g)].map((p) => p[1]).at(-1) ?? emailScale.metadata[1]);
    assert.ok(2 * padding + line >= emailScale.target, m[0].slice(0, 160));
  }
});
