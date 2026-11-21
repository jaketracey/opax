#!/usr/bin/env node
// Writes every email OPAX sends (and the digest example) to one folder, before
// and after, in light and dark, so they can be opened and screenshotted. It
// sends nothing and reads no network.
//
//   node portal/scripts/render-emails.mjs [folder] [--before=<git ref>]
//     folder     default: portal/private/email-preview (not committed)
//     --before   default: origin/main; the emails as that commit drew them
//
// Files: <email>.<before|after>.<light|dark>.html, <email>.after.txt (the
// plain-text part), opax.png and index.html. An email with no "before" (the
// digest, which is new) has only "after" files. Before this layout the
// account-deletion email was plain text only: its "before" page is that text,
// set as a mailbox sets a text-only message.
//
// Two things differ from the message a mailbox gets, and nothing else:
// - the mark is embedded in the message (cid:opax-brand-mark); a browser cannot
//   read that, so the image points at opax.png beside the page;
// - each file is fixed to one theme, so a screenshot does not depend on the
//   browser's setting: the email's own prefers-color-scheme rules are switched
//   to always (dark) or never (light).
// Then screenshot the folder with scripts/screenshot-emails.mjs.
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {emailSamples, sampleArgs} from './email-samples.mjs';

const args = process.argv.slice(2);
const ref = args.find((a) => a.startsWith('--before='))?.slice('--before='.length) ?? 'origin/main';
const portal = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(args.find((a) => !a.startsWith('--')) ?? join(portal, 'private', 'email-preview'));
mkdirSync(out, {recursive: true});

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
/** One theme, whatever the browser prefers. */
const themed = (html, theme) => html
  .replaceAll('cid:opax-brand-mark', 'opax.png')
  .replaceAll('@media (prefers-color-scheme:dark)', theme === 'dark' ? '@media all' : '@media not all')
  .replaceAll('color-scheme:light dark', `color-scheme:${theme}`)
  .replace('<meta name="color-scheme" content="light dark">', `<meta name="color-scheme" content="${theme}">`);
/** A text-only message, as a mailbox shows one. */
const textPage = (mail) => `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(mail.subject)}</title><style>:root{color-scheme:light dark}body{margin:0;padding:20px;background:#FFFFFF;color:#000000;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}pre{margin:0;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}@media (prefers-color-scheme:dark){body{background:#1C1C1E;color:#FFFFFF}}</style></head><body><pre>${escape(mail.text)}</pre></body></html>`;

/** The emails as `ref` drew them: its community-email.ts, run on the same samples. */
async function before() {
  const dir = mkdtempSync(join(tmpdir(), 'opax-email-before-'));
  try {
    const show = (file) => execFileSync('git', ['show', `${ref}:portal/src/${file}`], {cwd: portal, encoding: 'utf8', maxBuffer: 64 << 20});
    // Node resolves no bare './name': give the one import its extension.
    writeFileSync(join(dir, 'community-email.ts'), show('community-email.ts').replace("from './community-email-mark'", "from './community-email-mark.ts'"));
    writeFileSync(join(dir, 'community-email-mark.ts'), show('community-email-mark.ts'));
    const old = await import(pathToFileURL(join(dir, 'community-email.ts')).href);
    const a = sampleArgs();
    return {
      'sign-in': old.signInEmail(...a.signIn),
      'sign-in-app-code': old.signInEmail(...a.signInAppCode),
      'reply': old.replyEmail(...a.reply),
      // Its text was written where it was sent (community-deletion.ts).
      'account-deletion': old.deletionEmail ? old.deletionEmail(...a.deletion) : {subject: 'Confirm your Opax account deletion', text: `Your Opax account deletion code: ${a.deletion[1]}\n\nIt expires in 15 minutes. Enter it only if you requested permanent account deletion. Never share this code. If you did not request deletion, ignore this email.`},
    };
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

const samples = emailSamples();
const was = await before();
writeFileSync(join(out, 'opax.png'), samples[0].mail.attachments[0].content);
const rows = [];
for (const {name, mail, sent} of samples) {
  const files = [];
  for (const [stage, m] of [['before', was[name]], ['after', mail]]) {
    if (!m) continue;
    for (const theme of ['light', 'dark']) {
      const file = `${name}.${stage}.${theme}.html`;
      writeFileSync(join(out, file), themed(m.html ?? textPage(m), theme));
      files.push(`<a href="${file}">${stage}, ${theme}</a>`);
    }
  }
  writeFileSync(join(out, `${name}.after.txt`), `Subject: ${mail.subject}\n\n${mail.text}\n`);
  rows.push(`<li><strong>${escape(mail.subject)}</strong> (${name}${sent ? '' : ', an example: not sent'})<br>${files.join(' · ')} · <a href="${name}.after.txt">text part</a></li>`);
}
writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="en-AU"><meta charset="utf-8"><title>OPAX emails</title><body style="font:16px/1.6 sans-serif;margin:24px"><h1>OPAX emails, before and after</h1><p>Before is ${escape(ref)}. Each page is one column, 600 px at most, and is fixed to the theme in its name.</p><ul>${rows.join('')}</ul></body></html>\n`);
console.log(`${samples.length} emails written to ${out} (before: ${ref})`);
