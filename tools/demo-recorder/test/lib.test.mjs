import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FORMATS, validateScene, verifyEvidence, subtitleFiles, ease } from '../lib.mjs';
import { captureQuality } from '../video.mjs';

test('built-in scenes have valid actions, targets and editorial captions', async () => {
  for (const name of ['grant-place', 'grant-timeline']) {
    const scene = JSON.parse(await readFile(new URL(`../scenes/${name}.json`, import.meta.url), 'utf8'));
    assert.equal(validateScene(scene).id, name);
  }
});

test('rejects incomplete or unbounded recording scripts before launching a browser', () => {
  const good = { id: 'demo', path: '/', ready: 'h1', steps: [{ action: 'hold', caption: 'Hello', holdMs: 1000 }] };
  for (const bad of [
    { ...good, path: '//other.example/' },
    { ...good, id: '../escape' },
    { ...good, steps: [{ action: 'click', caption: 'Hello' }] },
    { ...good, steps: [{ action: 'type', target: 'input', caption: 'Hello' }] },
    { ...good, steps: [{ action: 'hold', caption: '', holdMs: 1000 }] },
    { ...good, steps: [{ action: 'hold', caption: 'Hello', holdMs: -5 }] },
  ]) assert.throws(() => validateScene(bad));
});

test('caption timestamps round correctly across minute and hour boundaries', () => {
  const result = subtitleFiles([
    { text: 'A → B', startMs: -10, endMs: 59999.9 },
    { text: 'Check <the source> & dates', startMs: 60000, endMs: 3600000 },
  ]);
  assert.match(result.srt, /00:00:00,000 --> 00:01:00,000/);
  assert.match(result.srt, /00:01:00,000 --> 01:00:00,000/);
  assert.match(result.vtt, /^WEBVTT\n\n/);
  assert.match(result.vtt, /Check &lt;the source&gt; &amp; dates/);
  assert.match(result.srt, /Check &lt;the source&gt; &amp; dates/);
});

test('subtitle text stays text, including comments and cue-like delimiters', () => {
  const result = subtitleFiles([{text: '<!-- note --!><img src=x> -->', startMs: 0, endMs: 1000}]);
  for (const file of [result.srt, result.vtt]) {
    assert.ok(!file.includes('<'));
    assert.ok(file.includes('&lt;!-- note --!&gt;&lt;img src=x&gt; --&gt;'));
  }
});

test('native pixels fill the export width with a reserved subtitle footer', () => {
  for (const { viewport, deviceScaleFactor, contentSize, output } of Object.values(FORMATS)) {
    assert.equal(viewport.width * deviceScaleFactor, contentSize.width);
    assert.equal(viewport.height * deviceScaleFactor, contentSize.height);
    assert.equal(contentSize.width, output.width);
    assert.ok(output.height > contentSize.height);
    assert.equal(output.width % 2, 0); assert.equal(output.height % 2, 0);
  }
});

test('caption evidence fails closed when a record, amount or excerpt changes', () => {
  const record = { id: 'GA1', value: 500, publish_date: '2019-02-22', activity: 'A roof over four aircraft' };
  const dataset = { as_of: '2026-09-09', records: [record] };
  const guard = { path: '/research/grants-history.json', recordId: 'GA1', equals: { value: 500, publish_date: '2019-02-22' }, includes: { activity: ['four aircraft'] } };
  assert.equal(verifyEvidence(dataset, guard).recordId, 'GA1');
  assert.throws(() => verifyEvidence(undefined, guard));
  assert.throws(() => verifyEvidence({ records: [] }, guard));
  assert.throws(() => verifyEvidence({ records: [record, record] }, guard));
  for (const changed of [{ value: 501 }, { publish_date: '2020-01-01' }, { activity: 'A roof over three aircraft' }]) {
    assert.throws(() => verifyEvidence({ records: [{ ...record, ...changed }] }, guard));
  }
});

test('pointer easing reaches its target without overshooting', () => {
  assert.equal(ease(0), 0); assert.equal(ease(1), 1);
  for (let i = 1; i <= 100; i++) assert.ok(ease(i / 100) >= ease((i - 1) / 100));
});

test('capture quality rejects slow or stalled frames even if export would say 30fps', () => {
  const sample = (interval, count = 120) => ({ durationMs: count * interval, frameCount: count, frames: Array.from({ length: count }, (_, i) => ({ timestampMs: i * interval })) });
  assert.ok(captureQuality(sample(34)).capturedFramesPerSecond > 29);
  assert.throws(() => captureQuality(sample(120)), /too choppy/);
  const stalled = sample(34);
  for (let i = 60; i < stalled.frames.length; i++) stalled.frames[i].timestampMs += 500;
  stalled.durationMs += 500;
  assert.throws(() => captureQuality(stalled), /too choppy/);
  assert.throws(() => captureQuality(sample(0)), /invalid/);
});
