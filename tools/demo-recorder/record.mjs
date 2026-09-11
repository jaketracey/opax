#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { FORMATS, validateScene, ease, subtitleFiles, installOverlay } from './lib.mjs';

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
const run = (command, argv) => new Promise((resolve, reject) => {
  const child = spawn(command, argv, { stdio: 'inherit' });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`${command} exited ${code}`)));
});
const revision = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(); } catch { return null; } })();

async function record(format) {
  const preset = FORMATS[format], directory = join(runDir, format);
  await mkdir(directory); await mkdir(join(directory, 'review')); await mkdir(join(directory, 'evidence'));
  const manifest = { status: 'recording', scene: scene.id, format, startedAt: new Date().toISOString(),
    url: new URL(scene.path, base).href, viewport: preset.viewport, output: preset.output,
    revision, nodeVersion: process.version,
    recorderSha256: createHash('sha256').update(await readFile(join(here, 'record.mjs'))).update(await readFile(join(here, 'lib.mjs'))).digest('hex'),
    lockfileSha256: createHash('sha256').update(await readFile(join(here, 'package-lock.json'))).digest('hex'),
    playwrightVersion: JSON.parse(await readFile(join(here, 'node_modules/playwright/package.json'), 'utf8')).version,
    captionsBurnedIn: !args['no-captions'], audio: 'silent', steps: [], sources: [], pageErrors: [],
    note: 'Live public site capture. Same actions and styling are repeatable; data, rendering and network timings may change.' };
  const browser = await chromium.launch({ headless: !args.headed });
  manifest.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: preset.viewport, deviceScaleFactor: preset.deviceScaleFactor,
    locale: 'en-AU', timezoneId: 'Australia/Melbourne', colorScheme: 'light', reducedMotion: 'no-preference', serviceWorkers: 'block' });
  const blockedWrites = [], evidenceJobs = [];
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
      await writeFile(join(directory, 'evidence', filename), body);
      manifest.sources.push({ url: response.url(), status: response.status(), sha256: createHash('sha256').update(body).digest('hex'), file: `evidence/${filename}` });
    })().catch(error => { manifest.pageErrors.push(`Source snapshot failed: ${error.message}`); }));
  });
  let recording = false, firstFrameAt = null, recordingStartedAt = null;
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
      const box = element.getBoundingClientRect();
      const header = document.querySelector('header')?.getBoundingClientRect().height || 100;
      const safeTop = Math.min(header, 140) + 28, safeBottom = innerWidth < 760 ? 240 : 170;
      if (!force && box.top >= safeTop && box.bottom <= innerHeight - safeBottom) return;
      const from = scrollY, to = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, scrollY + box.top - safeTop));
      await new Promise(resolve => {
        const started = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - started) / 800), p = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
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
  try {
    console.log(`${format}: opening ${manifest.url}`);
    const response = await page.goto(manifest.url, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw Error(`Page returned ${response?.status()}.`);
    await page.locator(scene.ready).waitFor({ state: 'visible', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator('.leaflet-tile').count()) {
      await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].every(image => image.complete && image.naturalWidth > 0), undefined, { timeout: 20000 });
    }
    await page.evaluate(installOverlay, { captionsEnabled: !args['no-captions'] });
    await page.mouse.move(pointer.x, pointer.y);
    await sleep(300);
    recordingStartedAt = Date.now();
    // Screencast frames use CSS pixels even at a higher deviceScaleFactor. Recording
    // at the export size pads the smaller frame with grey; scale only when encoding.
    await page.screencast.start({ path: join(directory, 'capture.webm'), size: preset.viewport, quality: 100,
      onFrame: frame => { firstFrameAt ??= frame.timestamp; } });
    recording = true;
    for (const [index, step] of scene.steps.entries()) {
      console.log(`${format}: ${index + 1}/${scene.steps.length} ${step.caption}`);
      const cueTime = await page.evaluate(text => window.__opaxRecording.caption(text), step.caption);
      if (cues.length) cues.at(-1).endAt = cueTime;
      cues.push({ text: step.caption, startAt: cueTime });
      const item = { ...step, startedAt: cueTime, beforeUrl: page.url() }; manifest.steps.push(item);
      const locator = step.target ? await target(step.target) : null;
      if (step.action === 'scroll') await scrollTo(locator, true);
      if (['click', 'hover', 'type', 'select'].includes(step.action)) {
        await pointAt(locator);
        if (step.action !== 'hover') {
          // Locator click retains hit-target checks, while the custom pointer travels visibly first.
          if (step.action === 'select') {
            await locator.selectOption(String(step.value));
          } else {
            await locator.click();
            if (step.action === 'type') {
              await locator.press('ControlOrMeta+A');
              await locator.pressSequentially(String(step.value), { delay: 95 });
            }
          }
        }
      }
      if (step.action === 'range') {
        await scrollTo(locator);
        const values = await locator.evaluate(el => ({ min: Number(el.min), max: Number(el.max), value: Number(el.value) }));
        const value = Number(step.value);
        if (!(values.min < values.max) || !Number.isFinite(value) || value < values.min || value > values.max) throw Error('Range value is outside the current data. Update the scene.');
        const box = await locator.boundingBox(), x = v => box.x + 8 + (box.width - 16) * (v - values.min) / (values.max - values.min), y = box.y + box.height / 2;
        await move(x(values.value), y); await page.mouse.down(); await move(x(value), y, 1400); await page.mouse.up();
        if (Number(await locator.inputValue()) !== value) throw Error('Slider did not reach the requested year.');
      }
      if (step.waitFor) await page.locator(step.waitFor).waitFor({ state: 'visible' });
      if (step.action !== 'hold') await sleep(350);
      await sleep(step.holdMs ?? 2400);
      if (blockedWrites.length) throw Error('The demo attempted a write or model request. Recording stopped.');
      if (await page.locator('#allocation-map-status:not([hidden])').count()) throw Error('The map reported a loading problem.');
      item.afterUrl = page.url(); item.endedAt = Date.now();
      await page.screenshot({ path: join(directory, 'review', `${String(index + 1).padStart(2, '0')}.png`) });
    }
    cues.at(-1).endAt = Date.now();
    await page.screencast.stop(); recording = false;
    const rawProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(directory, 'capture.webm')], { encoding: 'utf8' }));
    const epoch = Date.parse(rawProbe.format.tags?.creation_time) || recordingStartedAt;
    manifest.firstFrameAt = firstFrameAt;
    manifest.recordingEpoch = epoch;
    manifest.rawDurationSeconds = Number(rawProbe.format.duration);
    const rawStream = rawProbe.streams.find(s => s.codec_type === 'video');
    if (rawStream.width !== preset.viewport.width || rawStream.height !== preset.viewport.height) throw Error('Raw capture dimensions do not match the viewport.');
    const captions = cues.map(c => ({ text: c.text, startMs: Math.max(0, c.startAt - epoch), endMs: Math.max(1, c.endAt - epoch), timestampMs: null, confidence: null }));
    const subtitles = subtitleFiles(captions);
    await writeFile(join(directory, 'captions.json'), JSON.stringify(captions, null, 2));
    await writeFile(join(directory, 'captions.srt'), subtitles.srt);
    await writeFile(join(directory, 'captions.vtt'), subtitles.vtt);
    // Playwright appends at least one second of its last frame on stop. Trim that
    // recorder tail to the measured end of the last caption, without changing speed.
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', join(directory, 'capture.webm'), '-an', '-t', String(captions.at(-1).endMs / 1000),
      '-vf', `scale=${preset.output.width}:${preset.output.height}:flags=lanczos,setsar=1`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(directory, 'rendering.mp4')]);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(directory, 'rendering.mp4')], { encoding: 'utf8' }));
    const stream = probe.streams.find(s => s.codec_type === 'video');
    if (stream?.width !== preset.output.width || stream?.height !== preset.output.height || stream.codec_name !== 'h264') throw Error('Export dimensions or codec are incorrect.');
    const durationMs = Number(probe.format.duration) * 1000;
    if (Math.abs(durationMs - captions.at(-1).endMs) > 100) throw Error('Recording and caption timing diverged. Review capture.webm.');
    await rename(join(directory, 'rendering.mp4'), join(directory, 'opax.mp4'));
    manifest.status = 'ready-for-review'; manifest.durationSeconds = Number(probe.format.duration);
    manifest.endedAt = new Date().toISOString();
    await writeFile(join(directory, 'probe.json'), JSON.stringify(probe, null, 2));
    console.log(`${format}: ${manifest.durationSeconds.toFixed(1)}s → ${join(directory, 'opax.mp4')}`);
  } catch (error) {
    manifest.status = 'failed'; manifest.error = error.message;
    await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (recording) await page.screencast.stop().catch(() => {});
    await Promise.all(evidenceJobs);
    manifest.blockedWrites = blockedWrites;
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await context.close(); await browser.close();
  }
}
for (const format of formats) await record(format);
console.log(`Done. Review the videos before sharing: ${runDir}`);
