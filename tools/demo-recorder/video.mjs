import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const FPS = 30;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function captureQuality(capture) {
  const gaps = capture.frames.slice(1).map((frame, index) => frame.timestampMs - capture.frames[index].timestampMs).sort((a, b) => a - b);
  if (!gaps.length || !Number.isFinite(capture.durationMs) || capture.durationMs <= 0 || gaps.some(gap => !Number.isFinite(gap) || gap <= 0)) throw Error('Capture has invalid frame timing.');
  const timing = { capturedFramesPerSecond: capture.frameCount / (capture.durationMs / 1000), frameIntervalMedianMs: gaps[Math.floor(gaps.length / 2)], frameIntervalP95Ms: gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * .95))], frameIntervalMaxMs: gaps.at(-1) };
  if (timing.capturedFramesPerSecond < 18 || timing.frameIntervalP95Ms > 100 || timing.frameIntervalMaxMs > 350) throw Error('Capture was too choppy for export. Close other heavy tasks and record again; original frames have been kept.');
  return timing;
}

function command(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-20000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(Error(`${program} exited ${code}: ${stderr.trim()}`)));
  });
}

function sizeOfJpeg(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw Error('Capture did not produce a JPEG.');
  for (let offset = 2; offset + 9 < buffer.length;) {
    if (buffer[offset] !== 0xff) throw Error('Invalid JPEG marker in capture.');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw Error('Incomplete JPEG capture.');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    offset += length;
  }
  throw Error('JPEG capture has no supported size marker.');
}

function sameSize(actual, expected, label) {
  if (!expected || actual.width !== expected.width || actual.height !== expected.height)
    throw Error(`${label}: expected ${expected?.width}×${expected?.height}, got ${actual.width}×${actual.height}.`);
}

function validSize(size, label) {
  if (!size || !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width < 2 || size.height < 2 || size.width % 2 || size.height % 2)
    throw Error(`${label} must have positive, even pixel dimensions.`);
}

/**
 * Begin a native-device-pixel screenshot capture. The first completed screenshot
 * establishes epoch (Date.now at the midpoint of the screenshot operation).
 *
 * const recorder = await startCapture(page, directory, { expectedSize });
 * // Record actions/caption events as Date.now() - recorder.epoch.
 * const capture = await recorder.stop();
 *
 * stop() is idempotent and returns {epoch, frames, timelinePath, durationMs,
 * width, height, frameCount}. Screenshot delays are represented by actual frame
 * durations, never by compressing the recording into a nominal frame rate.
 */
export async function startCapture(page, directory, { expectedSize, minFrameMs = 1000 / FPS } = {}) {
  const root = resolve(directory), frameDirectory = join(root, 'capture-frames');
  await mkdir(frameDirectory); // An existing capture must never be overwritten.
  if (!expectedSize) expectedSize = await page.evaluate(() => ({ width: Math.round(innerWidth * devicePixelRatio), height: Math.round(innerHeight * devicePixelRatio) }));
  validSize(expectedSize, 'Capture size');
  if (!Number.isFinite(minFrameMs) || minFrameMs < 0 || minFrameMs > 1000) throw Error('Invalid minimum frame interval.');
  const frames = [];
  let stopping = false, failure = null, stopPromise;

  async function takeFrame() {
    const startedAt = Date.now();
    const buffer = await page.screenshot({ type: 'jpeg', quality: 96, scale: 'device', animations: 'allow', caret: 'initial', timeout: 15000 });
    const endedAt = Date.now(), timestampMs = (startedAt + endedAt) / 2;
    if (endedAt < startedAt || (frames.length && timestampMs <= frames.at(-1).timestampMs)) throw Error('Capture clock moved backwards; timestamps are unsafe.');
    sameSize(sizeOfJpeg(buffer), expectedSize, 'Native screenshot size');
    const filename = `frame-${String(frames.length).padStart(6, '0')}.jpg`;
    await writeFile(join(frameDirectory, filename), buffer, { flag: 'wx' });
    frames.push({ path: join(frameDirectory, filename), relativePath: `capture-frames/${filename}`, timestampMs, captureMs: endedAt - startedAt });
    return startedAt;
  }

  await takeFrame();
  const epoch = frames[0].timestampMs;
  const loop = (async () => {
    try {
      while (!stopping) {
        const startedAt = await takeFrame();
        const wait = minFrameMs - (Date.now() - startedAt);
        if (wait > 0 && !stopping) await sleep(wait);
      }
    } catch (error) { failure = error; stopping = true; }
  })();

  async function finish() {
    stopping = true;
    await loop;
    if (failure) throw failure;
    const stoppedAt = Date.now(), durationMs = stoppedAt - epoch;
    if (frames.length < 2 || durationMs <= 0 || stoppedAt < frames.at(-1).timestampMs) throw Error('Capture has insufficient frames or invalid timing.');
    const rows = ['ffconcat version 1.0'];
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index], end = frames[index + 1]?.timestampMs ?? stoppedAt;
      frame.durationMs = end - frame.timestampMs;
      if (!(frame.durationMs > 0)) throw Error('Capture has a non-positive frame duration.');
      // Generated relative names contain no quotes or special characters. The
      // image demuxer timebase is 1 ms, so concat does not quantize to 25 fps.
      rows.push(`file '${frame.relativePath}'`, 'option framerate 1000', `duration ${(frame.durationMs / 1000).toFixed(6)}`);
    }
    // The demuxer needs one final sample for the last duration to take effect.
    rows.push(`file '${frames.at(-1).relativePath}'`, 'option framerate 1000');
    const timelinePath = join(root, 'capture.ffconcat');
    await writeFile(timelinePath, rows.join('\n') + '\n', { flag: 'wx' });
    const capture = { epoch, stoppedAt, durationMs, frames, timelinePath, frameDirectory, ...expectedSize, frameCount: frames.length };
    await writeFile(join(root, 'capture-timing.json'), JSON.stringify(capture, null, 2), { flag: 'wx' });
    return capture;
  }

  return { epoch, stop: () => stopPromise ??= finish() };
}

async function probe(path) {
  return JSON.parse(await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]));
}

function validateVideo(info, size, expectedMs, label) {
  const streams = info.streams.filter(stream => stream.codec_type === 'video'), video = streams[0];
  if (streams.length !== 1 || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p') throw Error(`${label}: expected one H264 yuv420p video stream.`);
  sameSize(video, size, label);
  const [num, den] = video.avg_frame_rate.split('/').map(Number);
  if (Math.abs(num / den - FPS) > 0.01) throw Error(`${label}: expected ${FPS} fps.`);
  const durationMs = Number(info.format.duration) * 1000;
  if (!Number.isFinite(durationMs) || Math.abs(durationMs - expectedMs) > 100) throw Error(`${label}: duration ${durationMs} ms does not match measured ${expectedMs} ms.`);
  if (!(Number(video.nb_frames) > 0)) throw Error(`${label}: no encoded frames.`);
  return durationMs;
}

async function captionImages(browser, directory, captions, size, footerHeight) {
  const captionDirectory = join(directory, 'caption-plates');
  await mkdir(captionDirectory);
  const context = await browser.newContext({ viewport: { width: size.width, height: footerHeight }, deviceScaleFactor: 1, colorScheme: 'light' });
  const images = [];
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#142a43}
      #footer{height:100%;width:100%;border-top:3px solid #c69a3e;display:flex;align-items:center;justify-content:center;padding:18px 72px;color:#fff}
      #caption{margin:0;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-weight:600;line-height:1.2;text-align:center;text-wrap:balance;overflow-wrap:normal}
    </style></head><body><div id="footer"><p id="caption"></p></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const portrait = size.height > size.width, baseFont = portrait ? 48 : 44, minFont = portrait ? 40 : 36;
    for (let index = 0; index < captions.length; index++) {
      const measurements = await page.evaluate(({ text, baseFont, minFont, portrait }) => {
        const el = document.getElementById('caption'), footer = document.getElementById('footer');
        footer.style.padding = portrait ? '28px 56px' : '16px 72px';
        el.textContent = text;
        let font = baseFont, lines;
        do {
          el.style.fontSize = `${font}px`;
          lines = Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
          if (lines <= 2 && el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().height <= footer.clientHeight - (portrait ? 56 : 32)) break;
          font -= 1;
        } while (font >= minFont);
        return { font, lines, overflow: el.scrollWidth > el.clientWidth, height: el.getBoundingClientRect().height };
      }, { text: captions[index].text, baseFont, minFont, portrait });
      if (measurements.font < minFont || measurements.lines > 2 || measurements.overflow) throw Error(`Caption ${index + 1} does not fit two readable lines; shorten the scene copy.`);
      const path = join(captionDirectory, `caption-${String(index).padStart(3, '0')}.png`);
      await page.screenshot({ path, type: 'png', scale: 'device' });
      images.push({ path, ...measurements });
    }
  } finally { await context.close(); }
  return images;
}

/**
 * Preserve a native-resolution capture.mp4, then compose opax.mp4 with captions
 * in the reserved footer, never over the application. captions are measured
 * {text,startMs,endMs} cues relative to capture.epoch. preset.contentSize must
 * equal the screenshot dimensions; preset.output supplies the taller canvas.
 * Returns {path,capturePath,probe,timing}. Neither video is published under its
 * final name until its codec, dimensions, frame rate and duration are validated.
 */
export async function renderVideo({ browser, directory, capture, captions, preset, captionsEnabled = true }) {
  const measuredQuality = captureQuality(capture);
  // A stable ~20fps native capture is acceptable for these paced demos.
  // Preserve its measured cadence in the manifest; 30fps is the export rate.
  const root = resolve(directory), content = preset.contentSize, output = preset.output;
  validSize(content, 'Content size'); validSize(output, 'Output size');
  sameSize(capture, content, 'Capture/content size');
  if (output.width !== content.width || output.height <= content.height) throw Error('Output must reserve a footer below native-size content.');
  if (!Array.isArray(captions) || !captions.length) throw Error('Measured caption timings are required, including for a clean export.');
  for (let index = 0; index < captions.length; index++) {
    const cue = captions[index];
    if (typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 240 || !Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) || cue.startMs < 0 || cue.endMs <= cue.startMs)
      throw Error(`Caption ${index + 1} has invalid text or timing.`);
    if (index && cue.startMs < captions[index - 1].endMs) throw Error('Caption intervals overlap.');
  }
  const durationMs = captions.at(-1).endMs;
  if (durationMs > capture.durationMs + 100) throw Error('Captions extend beyond the measured capture.');
  const footerHeight = output.height - content.height, capturePath = join(root, 'capture.mp4'), temporaryCapture = join(root, 'capture-rendering.mp4');
  const encode = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-threads', '4', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart'];
  await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'concat', '-safe', '0', '-i', capture.timelinePath,
    '-t', (capture.durationMs / 1000).toFixed(6), '-vf', `tpad=stop_mode=clone:stop_duration=1,fps=${FPS}:round=near,scale=in_range=full:out_range=tv:out_color_matrix=bt709,setsar=1`, ...encode, temporaryCapture]);
  const captureProbe = await probe(temporaryCapture);
  validateVideo(captureProbe, content, capture.durationMs, 'Native capture');
  await rename(temporaryCapture, capturePath);
  await writeFile(join(root, 'capture-probe.json'), JSON.stringify(captureProbe, null, 2), { flag: 'wx' });

  const plates = captionsEnabled ? await captionImages(browser, root, captions, output, footerHeight) : [];
  const args = ['-hide_banner', '-loglevel', 'error', '-n', '-i', capturePath];
  for (const plate of plates) args.push('-loop', '1', '-framerate', String(FPS), '-i', plate.path);
  const filters = [`[0:v]tpad=stop_mode=clone:stop_duration=1,pad=${output.width}:${output.height}:0:0:color=0x142a43,drawbox=x=0:y=${content.height}:w=iw:h=3:color=0xc69a3e:t=fill[base]`];
  let previous = 'base';
  for (let index = 0; index < plates.length; index++) {
    const cue = captions[index], next = `captioned${index}`;
    filters.push(`[${previous}][${index + 1}:v]overlay=x=0:y=${content.height}:shortest=1:format=auto:enable='gte(t,${(cue.startMs / 1000).toFixed(6)})*lt(t,${(cue.endMs / 1000).toFixed(6)})'[${next}]`);
    previous = next;
  }
  filters.push(`[${previous}]format=yuv420p,setsar=1[final]`);
  const temporaryFinal = join(root, 'rendering.mp4'), finalPath = join(root, 'opax.mp4');
  args.push('-filter_complex_threads', '2', '-filter_complex', filters.join(';'), '-map', '[final]', '-t', (durationMs / 1000).toFixed(6), ...encode, temporaryFinal);
  await command('ffmpeg', args);
  const finalProbe = await probe(temporaryFinal), actualDurationMs = validateVideo(finalProbe, output, durationMs, 'Composed video');
  const timing = { epoch: capture.epoch, capturedDurationMs: capture.durationMs, intendedDurationMs: durationMs, renderedDurationMs: actualDurationMs,
    frameCount: capture.frameCount, encodedFrameCount: Number(finalProbe.streams[0].nb_frames), ...measuredQuality, outputFramesPerSecond: FPS,
    contentSize: content, outputSize: output,
    footerHeight, captionsBurnedIn: captionsEnabled, captionPlates: plates, nativeCapture: true, sourceFramesRetained: true,
    note: 'Frame timestamps are screenshot-operation midpoints. 30 fps encoding duplicates frames as needed; elapsed time is preserved.' };
  await writeFile(join(root, 'probe.json'), JSON.stringify(finalProbe, null, 2), { flag: 'wx' });
  await writeFile(join(root, 'video-timing.json'), JSON.stringify(timing, null, 2), { flag: 'wx' });
  await rename(temporaryFinal, finalPath);
  // Keep original JPEGs with the concat recipe for source inspection and
  // recomposition. capture.mp4 is a convenient derivative, not the master.
  return { path: finalPath, capturePath, probe: finalProbe, timing };
}
