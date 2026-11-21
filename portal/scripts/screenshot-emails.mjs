#!/usr/bin/env node
// Screenshots every page render-emails.mjs wrote, full height, at a phone
// width (390 px) and a desktop reading-pane width (700 px). Local files only:
// the browser is offline, so a page that asked for anything else would show it.
//
//   OPAX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//     node portal/scripts/screenshot-emails.mjs [html folder] [png folder]
//
// Defaults: portal/private/email-preview for both. OPAX_BROWSER_EXECUTABLE
// names a browser when Playwright's own is not installed.
import {mkdirSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const {chromium} = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const from = resolve(process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), 'private', 'email-preview'));
const to = resolve(process.argv[3] ?? from);
mkdirSync(to, {recursive: true});
const pages = readdirSync(from).filter((f) => /\.(before|after)\.(light|dark)\.html$/.test(f)).sort();
if (!pages.length) throw new Error(`No email pages in ${from}: run scripts/render-emails.mjs first`);

const browser = await chromium.launch({headless: true, ...(process.env.OPAX_BROWSER_EXECUTABLE ? {executablePath: process.env.OPAX_BROWSER_EXECUTABLE} : {})});
const outside = [];
try {
  for (const width of [390, 700]) {
    for (const file of pages) {
      const context = await browser.newContext({viewport: {width, height: 800}, deviceScaleFactor: 2, offline: true, colorScheme: file.includes('.dark.') ? 'dark' : 'light'});
      const page = await context.newPage();
      page.on('request', (r) => { if (!r.url().startsWith('file:')) outside.push(`${file}: ${r.url()}`); });
      await page.goto(pathToFileURL(join(from, file)).href);
      await page.screenshot({path: join(to, `${file.replace(/\.html$/, '')}.${width}.png`), fullPage: true});
      await context.close();
    }
  }
} finally { await browser.close(); }
if (outside.length) throw new Error(`An email asked for something outside the message:\n${outside.join('\n')}`);
console.log(`${pages.length * 2} screenshots written to ${to}`);
