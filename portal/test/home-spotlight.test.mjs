import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountSpotlight, renderSpotlight } from '../public/home-spotlight.js';

const topics = [
  ['gambling', 'gambling'],
  ['housing', 'housing'],
  ['climate', 'climate-environment'],
];
const reports = Object.fromEntries(topics.map(([slug]) => [slug,
  JSON.parse(readFileSync(new URL(`../public/reports/${slug}.json`, import.meta.url), 'utf8')),
]));

function mountFixture(t, fetcher) {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const holder = { innerHTML: '', setAttribute(key, value) { this[key] = value; } };
  const select = { value: 'gambling', addEventListener(type, fn) { this.change = fn; } };
  const more = {};
  const status = {};
  const elements = { 'hp-gambling-content': holder, 'hp-spotlight-topic': select,
    'hp-spotlight-more': more, 'hp-spotlight-status': status };
  globalThis.document = { getElementById: id => elements[id] };
  globalThis.fetch = fetcher;
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  });
  return { holder, select, more, status };
}

// Test against the shipped exports, including Climate's distinct topic slug.
test('spotlight selections keep report figures, questions and topic destinations together', async t => {
  const fixture = mountFixture(t, async path => ({ ok: true,
    json: async () => reports[path.split('/').pop().replace('.json', '')] }));
  await mountSpotlight();
  for (const [slug, topic] of topics) {
    fixture.select.value = slug;
    await fixture.select.change();
    const html = fixture.holder.innerHTML;
    assert.ok(html.includes(reports[slug].stats.speech_count.toLocaleString()));
    assert.ok(html.includes(`Ask about ${slug}</p>`));
    assert.equal(fixture.more.href, `/subject/topic/${topic}`);
    assert.equal(fixture.more.textContent, `Learn more about ${slug} →`);
    assert.equal((html.match(/class="chart"/g) || []).length, 4);
    assert.equal((html.match(/<a href="\/ask\?q=/g) || []).length, 3);
    assert.ok(!html.includes('hp-spotlight-links'));
    if (slug !== 'gambling') assert.ok(!html.toLowerCase().includes('gambling'));
  }
  assert.throws(() => renderSpotlight(reports.gambling, 'unknown'));
});

test('a slower earlier selection cannot replace the selected topic', async t => {
  const pending = new Map();
  const fixture = mountFixture(t, path => new Promise(resolve => pending.set(path, resolve)));
  const first = mountSpotlight();
  fixture.select.value = 'climate';
  const second = fixture.select.change();
  pending.get('/reports/climate.json')({ ok: true, json: async () => reports.climate });
  await second;
  const expected = fixture.holder.innerHTML;
  pending.get('/reports/gambling.json')({ ok: true, json: async () => reports.gambling });
  await first;
  assert.equal(fixture.holder.innerHTML, expected);
  assert.equal(fixture.more.href, '/subject/topic/climate-environment');
  assert.equal(fixture.status.textContent, 'Climate spotlight loaded');
  assert.equal(fixture.holder['aria-busy'], 'false');
});

test('a failed topic load clears the previous figures and leaves a relevant recovery link', async t => {
  const fixture = mountFixture(t, async path => ({ ok: path.includes('gambling'),
    json: async () => reports.gambling }));
  await mountSpotlight();
  fixture.select.value = 'housing';
  await fixture.select.change();
  assert.ok(fixture.holder.innerHTML.includes('Housing figures could not load'));
  assert.ok(fixture.holder.innerHTML.includes('href="/reports/housing"'));
  assert.ok(!fixture.holder.innerHTML.includes('class="chart"'));
  assert.equal(fixture.more.href, '/subject/topic/housing');
  assert.equal(fixture.holder['aria-busy'], 'false');
});
