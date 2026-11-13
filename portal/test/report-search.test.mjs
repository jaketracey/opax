import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectReports } from '../../scripts/build_report_catalog.mjs';
import { searchCatalog, searchCatalogPaged } from '../src/catalog-search.ts';
import { renderReport, readReport } from '../src/report-records.ts';
import { escapeHtml } from '../src/seo-content.ts';

const read = async path => JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8'));
const projected = await projectReports(read);
const requests = [];
const assets = { async fetch(request) {
  const path = new URL(request.url).pathname;
  requests.push(path);
  try { return new Response(await readFile(new URL('../public' + path, import.meta.url))); }
  catch { return new Response('Missing', { status: 404 }); }
} };
const url = (q, params = {}) => new URL('https://opax.com.au/api/search-all?' + new URLSearchParams({ q, kind: 'report', ...params }));
const find = (q, params) => searchCatalog(url(q, params), assets);

test('robodebt names the Royal Commission first in the report group, including paged searches', async () => {
  for (const q of ['robodebt', 'Royal Commission into the Robodebt Scheme']) {
    const found = await find(q);
    assert.equal(found.results[0].title, 'Royal Commission into the Robodebt Scheme');
    assert.equal(found.results[0].report_type, 'royal_commission');
    assert.equal(found.results[0].href, '/report/royal-commission-cth-robodebt');
    const page = await searchCatalogPaged(url(q), assets);
    const rows = await page.records([page.stubs[0].id]);
    assert.equal(rows.get(page.stubs[0].id).href, found.results[0].href);
  }
  assert.match((await find('banking royal commission')).results[0].title, /Banking/);
});
test('IBAC matches the publisher short name and a named integrity report beats mentions', async () => {
  const result = await find('IBAC');
  assert.ok(result.total > 10);
  assert.ok(result.results.slice(0, 5).every(r => r.body === 'Independent Broad-based Anti-corruption Commission'));
  assert.ok(result.results.some(r => r.report_type === 'agency_report' && r.body === 'Independent Broad-based Anti-corruption Commission'));
  const expected = projected.find(r => r.row.report_type === 'integrity_report' && r.row.title === 'Special report on Operation Harmonia');
  assert.ok(expected);
  assert.equal((await find(expected.row.title)).results[0].href, expected.row.href);
  assert.ok((await find('IBAC 2026')).results.every(r => r.date?.startsWith('2026') || r.year?.startsWith('2026')));
});
test('Department of Defence returns annual report rows, one per body and year', async () => {
  const result = await find('Department of Defence');
  const defence = result.results.filter(r => r.report_type === 'annual_report' && r.body === 'Department of Defence');
  assert.equal(defence.length, 7);
  assert.equal(new Set(defence.map(r => r.year)).size, 7);
  const year = await find('Department of Defence 2024-25');
  assert.ok(year.results.some(r => r.body === 'Department of Defence' && r.year === '2024-25'));
});
test('every official report search row has its own citation and a verbatim snippet', async () => {
  assert.ok(projected.length > 2000);
  assert.deepEqual([...new Set(projected.map(r => r.row.report_type))].sort(), ['agency_report', 'annual_report', 'integrity_report', 'royal_commission']);
  const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
  for (const { row, detail } of projected) {
    assert.match(row.kind, /^[a-z][a-z_]*$/);
    assert.equal(row.kind, 'report');
    assert.match(row.citation.url, /^https:\/\//);
    assert.ok(strings([detail.record, detail.facts]).some(s => s.includes(row.snippet)), row.slug);
    assert.deepEqual(await read('/report-records/' + row.slug + '.json'), detail);
    assert.equal(row.date, detail.date);
  }
});
test('warm searches read catalogue assets only, with no report detail or dataset scans', async () => {
  requests.length = 0;
  await find('robodebt'); await find('IBAC'); await find('zzznomatchingreport');
  assert.ok(requests.every(p => p.startsWith('/search-catalog/')));
  assert.ok(requests.filter(p => p.endsWith('/report-names.json')).length <= 1);
  assert.ok(Array.isArray((await find('constructor', {kind:'all'})).results));
});
// The body's words stay verbatim in the page's text; inline list runs are only set one to a line.
// Visible text for assertions: strip tags until none remain (a single pass can leave a rebuilt tag).
const stripTags = html => { let prev; do { prev = html; html = html.replace(/<[^<>]*>/g, ''); } while (html !== prev); return html; };
const visible = html => stripTags(html);
test('integrity report periods retain their date precision and source basis', () => {
  const periods = projected.filter(r => r.detail.report_type === 'integrity_report' && typeof r.detail.record.period === 'object' && r.detail.record.period);
  assert.equal(periods.length, 72);
  for (const {detail} of periods) {
    const html = renderReport(detail);
    assert.doesNotMatch(html, /\[object Object\]/, detail.slug);
    assert.ok(html.includes(escapeHtml(detail.record.period.basis)), detail.slug);
  }
  const sample = structuredClone(periods[0].detail);
  for (const [period, expected] of [
    [{value:'2004', precision:'year', basis:'Listed under this year.'}, '2004. Listed under this year.'],
    [{value:'1999-06', precision:'month', basis:'Published in this month.'}, 'June 1999. Published in this month.'],
    [{value:'2026-09-04', precision:'day', basis:'Dated by the publisher.'}, '4 September 2026. Dated by the publisher.'],
    [{value:'2020-21', precision:'financial_year', basis:'Reporting period.'}, '2020-21. Reporting period.'],
    [{value:'<script>', precision:'year', basis:'<img src=x>'}, '&lt;script&gt;. &lt;img src=x&gt;'],
  ]) {
    sample.record.period = period;
    assert.ok(renderReport(sample).includes(expected), expected);
  }
});
test('record pages retain full numbered recommendations, findings labels, court context and source pages', () => {
  const royal = projected.find(r => r.detail.slug === 'royal-commission-cth-robodebt').detail;
  let html = renderReport(royal);
  for (const rec of royal.record.recommendations) {
    assert.ok(visible(html).includes(escapeHtml(rec.text)));
    assert.ok(rec.number != null ? html.includes('Recommendation ' + rec.number) : html.includes(escapeHtml(rec.label)));
    assert.ok(html.includes('page ' + rec.cite.page));
  }
  assert.match(html, /not findings of criminal or civil liability/);
  // The report states 57; 56 are numbered and one, in its closing observations, is printed under its own heading.
  assert.equal(royal.record.recommendations.length, 57);
  const unnumbered = royal.record.recommendations.filter(r => r.number == null);
  assert.deepEqual(unnumbered.map(r => [r.label, r.cite.page]), [['Section 34 of the Cth FOI Act should be repealed', 27]]);
  assert.ok(html.includes('page 27, Closing observations'));
  assert.ok(!html.includes('Recommendation null') && !html.includes('recommendation-null'));
  for (const { detail } of projected.filter(r => r.detail.report_type === 'integrity_report' && r.detail.record.findings?.length)) {
    html = renderReport(detail);
    assert.match(html, /Allegations are not findings/);
    assert.match(html, /not a finding that a person is guilty of a criminal offence/);
    for (const item of detail.record.findings) {
      assert.ok(visible(html).includes(escapeHtml(item.text)));
      assert.ok(html.includes(escapeHtml(item.label)));
    }
  }
  const court = projected.find(r => r.detail.record.court_context?.length).detail;
  html = renderReport(court);
  for (const item of court.record.court_context) assert.ok(html.includes(escapeHtml(item.text)));
});
test('inline list runs are set one to a line without changing a character', () => {
  const royal = structuredClone(projected.find(r => r.detail.slug === 'royal-commission-cth-robodebt').detail);
  const words = 'Services Australia should: • avoid stigma • explain processes ◦ in plain language';
  royal.record.recommendations = [{ number: '1.1', text: words, cite: { url: 'https://example.gov.au/r.pdf', page: 3 } }];
  const html = renderReport(royal);
  assert.equal((html.match(/class="rr-line"/g) || []).length, 2);
  assert.equal((html.match(/class="rr-line rr-line-sub"/g) || []).length, 1);
  assert.ok(visible(html).includes(escapeHtml(words)));
  assert.match(html, /href="https:\/\/example\.gov\.au\/r\.pdf#page=3"[^>]*>Report, page 3</);
});
test('government statuses are counted in their own words and each keeps its lead, date and source', () => {
  const royal = structuredClone(projected.find(r => r.detail.slug === 'royal-commission-cth-robodebt').detail);
  const status = as_published => ({ as_published, lead: 'Lead agency', updated: '2026-09-07', cite: { url: 'https://example.gov.au/status', document: 'Status page' } });
  royal.record.recommendations = Array.from({ length: 61 }, (_, i) => ({ number: String(i + 1), text: 'Do thing ' + (i + 1), status: status(i < 40 ? 'In progress' : 'Complete') }));
  const html = renderReport(royal);
  assert.match(visible(html), /In progress 40/);
  assert.match(visible(html), /Complete 21/);
  assert.ok(html.indexOf('In progress') < html.indexOf('Complete'), 'labels keep the order they first appear in');
  assert.equal((html.match(/Lead: Lead agency · Updated <time datetime="2026-09-07">/g) || []).length, 61);
  assert.equal((html.match(/href="https:\/\/example\.gov\.au\/status"/g) || []).length, 61);
  assert.match(html, /<summary>Go to a recommendation \(1 to 61\)<\/summary>/);
});
test('a list of one kind is titled by that kind; a mixed list keeps the full title', () => {
  const report = structuredClone(projected.find(r => r.detail.slug === 'integrity-report-nsw-icac-2023-03-07-operation-paragon').detail);
  report.record.findings = [{ kind: 'finding', label: 'x', text: 'a' }, { kind: 'finding', label: 'y', text: 'b' }];
  assert.match(renderReport(report), /<h2 class="ui-section-title" id="findings-title">Findings <span class="rr-count">2<\/span>/);
  report.record.findings.push({ kind: 'no_finding', label: 'z', text: 'c' });
  assert.match(renderReport(report), /<h2 class="ui-section-title" id="findings-title">Findings, opinions and statements <span class="rr-count">3<\/span>/);
});
test('annual report source links each name their table', () => {
  const annual = projected.find(r => r.row.body === 'Department of Defence' && r.row.year === '2024-25').detail;
  const texts = [...renderReport(annual).matchAll(/<a [^>]*href="https:\/\/previewapi[^"]*"[^>]*>(.*?)<\/a>/g)].map(m => visible(m[1]));
  assert.ok(texts.length > 1);
  assert.equal(new Set(texts).size, texts.length, texts.join(' | '));
});
test('agency facts and annual disclosures retain labels, units and per-row official sources', () => {
  const agency = projected.find(r => r.detail.facts.length).detail;
  const html = renderReport(agency);
  for (const f of agency.facts) {
    assert.ok(html.includes(escapeHtml(f.quote)));
    assert.ok(html.includes(escapeHtml(f.label)));
    assert.ok(html.includes(escapeHtml(f.source_url)));
    assert.ok(html.includes('page ' + f.page));
  }
  const annual = projected.find(r => r.row.body === 'Department of Defence' && r.row.year === '2024-25').detail;
  const body = renderReport(annual);
  for (const table of annual.tables) {
    assert.ok(body.includes(escapeHtml(table.title)));
    assert.ok(body.includes(escapeHtml(table.unit)));
    assert.ok(body.includes(escapeHtml(table.source_url)));
  }
});
test('invalid slugs never become asset paths, missing records are null, transient failures propagate', async () => {
  for (const slug of ['../../index', 'constructor', 'annual-report-a/b', 'royal-commission-<script>']) {
    assert.equal(await readReport({ fetch() { throw Error('must not fetch'); } }, slug), null);
  }
  assert.equal(await readReport(assets, 'royal-commission-not-loaded'), null);
  await assert.rejects(readReport({ fetch: async () => new Response('', { status: 503 }) }, 'royal-commission-cth-robodebt'));
});
test('rendering escapes source text and rejects unsafe links', () => {
  const d = structuredClone(projected[0].detail);
  d.record.recommendations = [{ number: '1', text: '<script>alert(1)</script>', cite: { url: 'javascript:alert(1)', page: 1 } }];
  const html = renderReport(d);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
});

test('no page draws the "How to read this record" box; a caveat that qualifies a table sits with it, and the record keeps them all', () => {
  for (const { detail } of projected) {
    const html = renderReport(detail);
    assert.doesNotMatch(html, /How to read this record|rr-caveats/, detail.slug);
    assert.ok(detail.caveats.length, detail.slug);
  }
  const annual = projected.find(r => r.row.body === 'Department of Defence' && r.row.year === '2024-25').detail;
  const block = title => (new RegExp(`<details class="ui-disclosure rr-table-block"[^>]*><summary><span>${title}[\\s\\S]*?</details>`).exec(renderReport(annual)) || [''])[0];
  assert.match(block('Information about remuneration for senior executives'), /Never multiply or add averages across bands/);
  assert.match(block('Information about remuneration for key management personnel'), /part-year amounts are not annual salaries/);
});
test('a commission with no report held says so with the inquiry, not as an empty Recommendations section', () => {
  const nt = projected.find(p => p.detail.slug === 'royal-commission-nt-hydraulic-fracturing').detail;
  const html = renderReport(nt);
  assert.doesNotMatch(html, /id="recommendations"/);
  assert.match(html, /<dt>Report<\/dt><dd>No report is held for this inquiry, so no recommendations are reproduced\.<\/dd>/);
  assert.doesNotMatch(html, /Type of inquiry/);
  assert.match(html, /<p class="ui-page-meta">Commission of inquiry · Northern Territory · No report date recorded<\/p>/);
});
test('transcript rows are one compact line each; what every transcript shares is said once', () => {
  const section = html => (/<section[^>]*id="transcripts"[\s\S]*?<\/section>/.exec(html) || [''])[0];
  const belcarra = projected.find(p => p.detail.slug.startsWith('integrity-report-qld-ccc-2017-10-04-operation-belcarra')).detail;
  const tx = section(renderReport(belcarra)), items = belcarra.record.transcripts.items, kase = items[0].case;
  assert.equal((tx.match(new RegExp(escapeHtml(kase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1, 'the case is named once');
  assert.equal((tx.match(/About these copies/g) || []).length, 1);
  assert.equal((tx.match(/Document details/g) || []).length, 0);
  const sixes = [...tx.matchAll(/\(part (\d) of 6\)/g)].map(m => m[1]).slice(0, 6);
  assert.deepEqual(sixes, ['1', '2', '3', '4', '5', '6']);
  const robodebt = projected.find(p => p.detail.slug === 'royal-commission-cth-robodebt').detail;
  const rtx = section(renderReport(robodebt));
  for (const t of robodebt.record.transcripts) {
    assert.ok(rtx.includes(`href="${escapeHtml(t.files[0].url)}"`), t.key);
    assert.ok(rtx.includes(`href="${escapeHtml(t.page_url)}"`), t.key);
  }
  assert.doesNotMatch(rtx, /PDF: [^<]*\.pdf/);
});
test('report documents with one file link the title to it, then pages, type and size, with no raw file labels', async () => {
  let seen = 0;
  for (const { detail } of projected.filter(p => p.detail.report_type === 'royal_commission')) {
    const html = renderReport(detail);
    assert.doesNotMatch(html, />(?:PDF|File): /, detail.slug);
    for (const d of [...(detail.record.reports || []), ...(detail.record.responses || [])].filter(d => d.files?.length === 1)) {
      assert.ok(html.includes(`href="${escapeHtml(d.files[0].url)}"`), d.title);
      if (d.page_url) assert.ok(html.includes(`href="${escapeHtml(d.page_url)}"`), d.title);
      seen++;
    }
  }
  assert.ok(seen >= 20, `${seen} single-file documents`);
  const robodebt = renderReport(projected.find(p => p.detail.slug === 'royal-commission-cth-robodebt').detail);
  assert.match(robodebt, /<h3 class="rr-doc-title"><a href="https:\/\/www\.royalcommission\.gov\.au\/system\/files\/2023-09\/robodebt-accessible-full-report\.PDF"[^>]*>Report of the Royal Commission into the Robodebt Scheme<\/a><\/h3>/);
  assert.match(robodebt, /1,052 pages · PDF, 20\.2 MB/);
});
test('hearing transcripts get their own section, grouped by month newest first, and leave Official documents', async () => {
  const section = (html, id) => (new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`).exec(html) || [''])[0];
  const rc = projected.find(p => p.detail.slug === 'royal-commission-cth-robodebt').detail;
  const html = renderReport(rc), tx = section(html, 'transcripts');
  assert.match(tx, /<h2 class="ui-section-title" id="transcripts-title">Hearing transcripts: evidence, not findings <span class="rr-count">47<\/span>/);
  const months = [...tx.matchAll(/<details class="ui-disclosure rr-month"( open)?><summary><span>([^<]+)</g)];
  assert.equal(months[0][2], 'March 2023'); assert.equal(months[0][1], ' open'); assert.ok(months.slice(1).every(m => !m[1]));
  assert.equal((tx.match(/<li class="rr-doc">/g) || []).length, 47); assert.doesNotMatch(tx, /rr-doc-flag/);
  assert.doesNotMatch(section(html, 'documents'), /Hearing transcript|transcript-hearing/i);
  assert.match(html, /<a href="#transcripts"><span>Hearing transcripts: evidence, not findings<\/span><span class="rr-toc-count">47/);
  const belcarra = projected.find(p => p.detail.report_type === 'integrity_report' && p.detail.record.transcripts?.items).detail;
  const itx = section(renderReport(belcarra), 'transcripts');
  assert.equal((itx.match(/<li class="rr-doc">/g) || []).length, belcarra.record.transcripts.count);
  for (const t of belcarra.record.transcripts.items) assert.ok(itx.includes(escapeHtml(t.url)), t.id);
  const plain = projected.find(p => p.detail.report_type === 'integrity_report' && !p.detail.record.transcripts).detail;
  assert.doesNotMatch(renderReport(plain), /id="transcripts"/);
});

test('SA DFSV: the final report and its 136 recommendations, cited to the report pages', async () => {
  const c = JSON.parse(await readFile(new URL('../public/royal-commissions/commission-sa-domestic-family-sexual-violence.json', import.meta.url), 'utf8')).commission;
  assert.equal(c.recommendations_status, 'extracted');
  assert.equal(c.recommendations.length, 136);
  assert.deepEqual(c.recommendations.map(r => r.number), Array.from({ length: 136 }, (_, i) => String(i + 1)));
  assert.ok(c.recommendations.every(r => r.cite.page >= 31 && r.cite.page <= 62 && /royalcommissiondfsv\.sa\.gov\.au/.test(r.cite.url)));
  assert.match(c.reports[0].rights, /Creative Commons Attribution 4\.0 Australia/);
  assert.equal(c.commissioners[0].name, 'Natasha Stott Despoja AO');
});
