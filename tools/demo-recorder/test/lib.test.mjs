import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FORMATS, validateScene, subtitleFiles, ease } from '../lib.mjs';

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

test('capture and export aspect ratios match, with even H264 dimensions', () => {
  for (const { viewport, output } of Object.values(FORMATS)) {
    assert.equal(viewport.width / viewport.height, output.width / output.height);
    assert.equal(output.width % 2, 0); assert.equal(output.height % 2, 0);
  }
});

test('pointer easing reaches its target without overshooting', () => {
  assert.equal(ease(0), 0); assert.equal(ease(1), 1);
  for (let i = 1; i <= 100; i++) assert.ok(ease(i / 100) >= ease((i - 1) / 100));
});
