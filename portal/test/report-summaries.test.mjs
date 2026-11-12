import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { projectReports, projectSummary, NAMED_PERSON_QUOTES, SUMMARY_LEFT_OFF, SHOW_NAMED_PERSON_QUOTES } from '../../scripts/build_report_catalog.mjs';
import { renderReport, reportApiBody } from '../src/report-records.ts';

const publicRoot = new URL('../public/', import.meta.url);
const dataRoot = new URL('../../data/report-summaries/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path.replace(/^\//, ''), publicRoot), 'utf8'));
const projected = await projectReports(read);
const bySlug = new Map(projected.map(p => [p.detail.slug, p.detail]));
const files = await Promise.all((await readdir(dataRoot)).filter(n => n.endsWith('.json')).map(async n => JSON.parse(await readFile(new URL(n, dataRoot), 'utf8'))));
const LABEL = 'Generated summary: written by an AI model from the report text and checked against the cited pages.';

test('every ready summary lands on its record, except those left off', () => {
  const shown = files.filter(d => !SUMMARY_LEFT_OFF.has(d.slug));
  for (const d of shown) assert.ok(bySlug.get(d.slug)?.summary, d.slug);
  for (const slug of SUMMARY_LEFT_OFF) assert.equal(bySlug.get(slug)?.summary, undefined, slug);
  assert.equal(projected.filter(p => p.detail.summary).length, shown.length);
});

test('generated sentences are labelled and each cites the official pages it rests on', () => {
  for (const { detail } of projected.filter(p => p.detail.summary)) {
    const s = detail.summary;
    assert.equal(s.generated.label, LABEL);
    assert.ok(s.generated.sentences.length >= 2, detail.slug);
    for (const x of s.generated.sentences) {
      assert.ok(x.cites.length, detail.slug);
      for (const c of x.cites) { assert.match(c.url, /^https:\/\//); assert.ok(Number.isInteger(c.page)); }
      assert.doesNotMatch(x.text, /—/);
    }
    for (const q of s.quotes.items) assert.ok(q.cite && Number.isInteger(q.cite.page), detail.slug);
    if (s.own_summary) assert.match(s.own_summary.url, /^https:\/\//);
  }
});

test('quotes naming a person are shown word for word, with their pages, now the flag is on', () => {
  assert.equal(SHOW_NAMED_PERSON_QUOTES, true);
  const escHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  for (const slug of NAMED_PERSON_QUOTES) {
    const d = files.find(f => f.slug === slug);
    assert.ok(d, slug);
    assert.ok(d.findings.items.length, `${slug} has quotes`);
    if (SUMMARY_LEFT_OFF.has(slug)) continue;
    const detail = bySlug.get(slug);
    assert.ok(detail.summary.generated.sentences.length, slug);
    assert.deepEqual(detail.summary.quotes.items.map(q => [q.quote, q.cite.page]), d.findings.items.map(q => [q.quote, q.cite.page]), slug);
    const api = JSON.stringify(reportApiBody(detail));
    const html = renderReport(detail);
    for (const q of d.findings.items) {
      assert.ok(api.includes(JSON.stringify(q.quote).slice(1, -1)), `${slug} API carries the quote`);
      assert.ok(html.includes(escHtml(q.quote)), `${slug} page shows the quote`);
    }
  }
});

test('a summary that is not ready, or is left off, is not projected', () => {
  const d = files[0];
  assert.equal(projectSummary({ ...d, summary: { ...d.summary, status: 'withheld' } }), null);
  assert.equal(projectSummary({ ...d, slug: [...SUMMARY_LEFT_OFF][0] }), null);
});

test('the report page leads with the summary block, and the API carries the same projection', () => {
  const r = bySlug.get('royal-commission-cth-robodebt');
  const html = renderReport(r);
  assert.ok(html.indexOf('id="summary"') > 0 && html.indexOf('id="summary"') < html.indexOf('id="recommendations"'));
  assert.ok(html.includes(LABEL));
  assert.ok(html.includes('The report&#39;s own summary'));
  assert.ok(html.includes('In the body&#39;s own words'));
  assert.match(html, /<a href="#summary"><span>Summary<\/span>/);
  assert.deepEqual(reportApiBody(r).summary, r.summary);
  const plain = bySlug.get('royal-commission-cth-banking') || projected.find(p => !p.detail.summary)?.detail;
  if (plain && !plain.summary) assert.ok(!renderReport(plain).includes('id="summary"'));
});
