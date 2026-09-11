#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { FORMATS, validateScene, verifyEvidence, ease, subtitleFiles, installOverlay } from './lib.mjs';
import { startCapture, renderVideo } from './video.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({ options: {
  scene: { type: 'string', default: 'grant-place' }, format: { type: 'string', default: 'all' },
  'base-url': { type: 'string', default: 'https://opax.com.au' }, out: { type: 'string' },
  headed: { type: 'boolean', default: false }, 'no-captions': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
} });
if (args.help) {
  console.log(`Opax demo recorder
  npm run record -- --scene grant-place --format all
  npm run record -- --scene grant-timeline --format portrait

  --scene       Built-in name or path to a scene JSON file
  --format      landscape (1920×1080), portrait (1080×1920), or all
  --base-url    Site to record (default https://opax.com.au)
  --out         New output directory (existing directories are never overwritten)
  --headed      Show the isolated recording browser
  --no-captions Make a clean video; still export the SRT/VTT captions

Needs Node 22+, npm ci, npx playwright install chromium, and ffmpeg/ffprobe.
No login, model calls, microphone, scheduling or publishing is involved.`);
  process.exit(0);
}
const scenePath = args.scene.endsWith('.json') ? resolve(args.scene) : join(here, 'scenes', `${args.scene}.json`);
const scene = validateScene(JSON.parse(await readFile(scenePath, 'utf8')));
const base = new URL(args['base-url']);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw Error('Use an HTTP(S) base URL without credentials.');
const formats = args.format === 'all' ? Object.keys(FORMATS) : [args.format];
if (formats.some(f => !FORMATS[f])) throw Error('Choose landscape, portrait or all.');
for (const tool of ['ffmpeg', 'ffprobe']) {
  try { execFileSync(tool, ['-version'], { stdio: 'ignore' }); } catch { throw Error(`${tool} is required. See README.md for setup.`); }
}
const runDir = args.out ? resolve(args.out) : join(here, 'output', `${new Date().toISOString().replace(/[:.]/g, '-')}-${scene.id}`);
await mkdir(dirname(runDir), { recursive: true });
await mkdir(runDir); // Fail instead of overwriting an earlier recording.
await writeFile(join(runDir, 'scene.json'), JSON.stringify(scene, null, 2));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const revision = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(); } catch { return null; } })();

async function record(format) {
  const preset = FORMATS[format], directory = join(runDir, format);
  await mkdir(directory); await mkdir(join(directory, 'review')); await mkdir(join(directory, 'evidence'));
  const manifest = { status: 'recording', scene: scene.id, format, startedAt: new Date().toISOString(),
    url: new URL(scene.path, base).href, viewport: preset.viewport, output: preset.output,
    revision, nodeVersion: process.version,
    recorderSha256: createHash('sha256').update(await readFile(join(here, 'record.mjs'))).update(await readFile(join(here, 'lib.mjs'))).update(await readFile(join(here, 'video.mjs'))).digest('hex'),
    lockfileSha256: createHash('sha256').update(await readFile(join(here, 'package-lock.json'))).digest('hex'),
    playwrightVersion: JSON.parse(await readFile(join(here, 'node_modules/playwright/package.json'), 'utf8')).version,
    captionsBurnedIn: !args['no-captions'], audio: 'silent', presentation: { hidden: ['#opax-voice'], cursor: 'animated overlay', captions: 'separate footer' }, steps: [], sources: [], pageErrors: [],
    note: 'Live public site capture. Same actions and styling are repeatable; data, rendering and network timings may change.' };
  const browser = await chromium.launch({ headless: !args.headed });
  manifest.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: preset.viewport, deviceScaleFactor: preset.deviceScaleFactor,
    locale: 'en-AU', timezoneId: 'Australia/Melbourne', colorScheme: 'light', reducedMotion: 'no-preference', serviceWorkers: 'block' });
  const blockedWrites = [], evidenceJobs = [], datasets = new Map();
  // Keep demo traffic out of the site's analytics. No authenticated state is loaded.
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (/google-analytics\.com|googletagmanager\.com|posthog\.com|cloudflareinsights\.com/.test(url.hostname) || /^\/ingest(?:\/|$)/.test(url.pathname))
      return route.fulfill({ status: 204, body: '' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && ['http:', 'https:'].includes(url.protocol)) {
      blockedWrites.push({ method: request.method(), url: url.origin + url.pathname });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => manifest.pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== base.origin || !/^\/research\/[a-z-]+\.json$/.test(url.pathname)) return;
    evidenceJobs.push((async () => {
      const body = await response.body(), filename = url.pathname.split('/').pop();
      if (!response.ok()) throw Error(`Dataset returned ${response.status()}.`);
      datasets.set(url.pathname, JSON.parse(body.toString()));
      await writeFile(join(directory, 'evidence', filename), body);
      manifest.sources.push({ url: response.url(), status: response.status(), sha256: createHash('sha256').update(body).digest('hex'), file: `evidence/${filename}` });
    })().catch(error => { manifest.pageErrors.push(`Source snapshot failed: ${error.message}`); }));
  });
  let recorder = null;
  const cues = [];
  let pointer = { x: preset.viewport.width * .78, y: preset.viewport.height * .4 };
  async function target(selector) {
    const locator = page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    if (await locator.count() !== 1) throw Error(`Target must match exactly one element: ${selector}`);
    return locator;
  }
  async function move(x, y, duration = 650) {
    const from = { ...pointer }, start = performance.now();
    while (true) {
      const t = Math.min(1, (performance.now() - start) / duration), p = ease(t);
      await page.mouse.move(from.x + (x - from.x) * p, from.y + (y - from.y) * p);
      if (t >= 1) break;
      await sleep(16);
    }
    pointer = { x, y };
  }
  async function scrollTo(locator, force = false) {
    await locator.evaluate(async (element, force) => {
      const header = document.querySelector('header')?.getBoundingClientRect().height || 100;
      const safeTop = Math.min(header, 140) + 20, safeBottom = 24;
      // Source/detail panels scroll independently on desktop. Reveal a target
      // inside them before positioning the whole panel in the document.
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
          const panel = parent.getBoundingClientRect(), child = element.getBoundingClientRect();
          if (child.top < panel.top + 16 || child.bottom > panel.bottom - 16) {
            parent.scrollTo({ top: parent.scrollTop + child.top - panel.top - 20, behavior: 'smooth' });
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }
        parent = parent.parentElement;
      }
      const current = element.getBoundingClientRect();
      if (!force && current.top >= safeTop - 2 && current.bottom <= innerHeight - safeBottom + 2) return;
      const from = scrollY, to = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, scrollY + current.top - safeTop));
      if (Math.abs(from - to) < 3) return;
      await new Promise(resolve => {
        const started = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - started) / 650), p = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
          scrollTo({ top: from + (to - from) * p, behavior: 'instant' });
          if (t < 1) requestAnimationFrame(tick); else resolve();
        }
        requestAnimationFrame(tick);
      });
    }, force);
    await sleep(180);
  }
  async function pointAt(locator) {
    await scrollTo(locator);
    const box = await locator.boundingBox();
    if (!box) throw Error('Target disappeared before pointer movement.');
    await move(box.x + box.width / 2, box.y + box.height / 2);
    return box;
  }
  async function frameMapAndTimeline() {
    const map = await target('#allocation-map');
    await scrollTo(map, true);
    const fit = await page.evaluate(() => {
      const map = document.querySelector('#allocation-map').getBoundingClientRect();
      const timeline = document.querySelector('#allocation-timeline').getBoundingClientRect();
      return { mapTop: map.top, bottom: timeline.bottom, height: innerHeight };
    });
    if (fit.bottom > fit.height - 8) throw Error('Map and timeline do not fit together. Close the selected project or revise the scene framing.');
  }
  async function frame(step) {
    if (step.frame === 'map-and-timeline') await frameMapAndTimeline();
    else if (step.frameTarget) await scrollTo(await target(step.frameTarget));
  }
  async function performAction(step) {
    // Set the combined composition before dragging so the map remains visible.
    if (step.frame === 'map-and-timeline' && step.action !== 'click') await frame(step);
    const locator = step.target ? await target(step.target) : null;
    if (step.action === 'scroll' && !step.frame) await scrollTo(locator, true);
    if (['click', 'hover', 'type', 'select'].includes(step.action)) {
      await pointAt(locator);
      if (step.action === 'select') await locator.selectOption(String(step.value));
      else if (step.action !== 'hover') {
        await locator.click();
        if (step.action === 'type') {
          await locator.press('ControlOrMeta+A');
          await locator.pressSequentially(String(step.value), { delay: 75 });
        }
      }
    }
    if (step.action === 'range') {
      await scrollTo(locator);
      const values = await locator.evaluate(el => ({ min: Number(el.min), max: Number(el.max), value: Number(el.value) }));
      const value = Number(step.value);
      if (!(values.min < values.max) || !Number.isFinite(value) || value < values.min || value > values.max) throw Error('Range value is outside the current data. Update the scene.');
      const box = await locator.boundingBox(), x = v => box.x + 8 + (box.width - 16) * (v - values.min) / (values.max - values.min), y = box.y + box.height / 2;
      await move(x(values.value), y); await page.mouse.down(); await move(x(value), y, 1100); await page.mouse.up();
      if (Number(await locator.inputValue()) !== value) throw Error('Slider did not reach the requested year.');
    }
    if (step.waitFor) await page.locator(step.waitFor).waitFor({ state: 'visible' });
    if (step.action !== 'hold') await sleep(200);
    await frame(step);
  }
  try {
    console.log(`${format}: opening ${manifest.url}`);
    const response = await page.goto(manifest.url, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw Error(`Page returned ${response?.status()}.`);
    await page.locator(scene.ready).waitFor({ state: 'visible', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator('.leaflet-tile').count()) {
      await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].every(image => image.complete && image.naturalWidth > 0), undefined, { timeout: 20000 });
    }
    await Promise.all(evidenceJobs);
    manifest.evidenceChecks = (scene.evidence || []).map(guard => verifyEvidence(datasets.get(guard.path), guard));
    await page.evaluate(installOverlay);
    for (const step of scene.setup || []) await performAction(step);
    if (scene.initialTarget) await scrollTo(await target(scene.initialTarget), true);
    await frame(scene.steps[0]);
    // Start with a completed, legible composition, not page loading or setup.
    await page.mouse.move(pointer.x, pointer.y);
    await sleep(300);
    recorder = await startCapture(page, directory, { expectedSize: preset.contentSize });
    manifest.recordingEpoch = recorder.epoch;
    for (const [index, step] of scene.steps.entries()) {
      console.log(`${format}: ${index + 1}/${scene.steps.length} ${step.caption}`);
      const cueTime = index === 0 ? recorder.epoch : Date.now();
      if (cues.length) cues.at(-1).endAt = cueTime;
      cues.push({ text: step.caption, startAt: cueTime });
      const item = { ...step, startedAt: cueTime, beforeUrl: page.url() }; manifest.steps.push(item);
      await performAction(step);
      await sleep(step.holdMs ?? 2400);
      if (blockedWrites.length) throw Error('The demo attempted a write or model request. Recording stopped.');
      if (await page.locator('#allocation-map-status:not([hidden])').count()) throw Error('The map reported a loading problem.');
      item.afterUrl = page.url(); item.endedAt = Date.now();
      await page.screenshot({ path: join(directory, 'review', `${String(index + 1).padStart(2, '0')}.png`) });
    }
    cues.at(-1).endAt = Date.now();
    const capture = await recorder.stop();
    const captions = cues.map(c => ({ text: c.text, startMs: Math.max(0, c.startAt - capture.epoch), endMs: Math.max(1, c.endAt - capture.epoch) }));
    const subtitles = subtitleFiles(captions);
    await writeFile(join(directory, 'captions.json'), JSON.stringify(captions, null, 2));
    await writeFile(join(directory, 'captions.srt'), subtitles.srt);
    await writeFile(join(directory, 'captions.vtt'), subtitles.vtt);
    const rendered = await renderVideo({ browser, directory, capture, captions, preset, captionsEnabled: !args['no-captions'] });
    manifest.status = 'ready-for-review'; manifest.durationSeconds = Number(rendered.probe.format.duration);
    manifest.timing = rendered.timing; manifest.endedAt = new Date().toISOString();
    console.log(`${format}: ${manifest.durationSeconds.toFixed(1)}s → ${join(directory, 'opax.mp4')}`);
  } catch (error) {
    manifest.status = 'failed'; manifest.error = error.message;
    await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (recorder) await recorder.stop().catch(() => {});
    await Promise.all(evidenceJobs);
    manifest.blockedWrites = blockedWrites;
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await context.close(); await browser.close();
  }
}
for (const format of formats) await record(format);
console.log(`Done. Review the videos before sharing: ${runDir}`);
