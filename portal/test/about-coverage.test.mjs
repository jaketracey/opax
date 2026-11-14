import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {coverageCollections, coverageHTML, renderCoverage, senateGapNote} from '../../scripts/build_coverage.mjs';
import {buildMethods} from '../../scripts/build_methods.mjs';
import {panelPrerender} from '../src/seo-content.ts';

const pub = new URL('../public/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, pub), 'utf8'));
const html = readFileSync(new URL('index.html', pub), 'utf8');
const rows = coverageCollections();

test('Senate gap stays visible per empty year and clears as publication fills each year', () => {
  const corpus = read('corpus.json');
  corpus.refresh.federal_hansard_coverage = {unpublished_senate_years: [2014, 2015, 2016, 2017, 2018]};
  delete corpus.refresh.senate_backfill_enabled;
  assert.equal(senateGapNote(corpus), 'Senate Hansard for 2014 to 2018 is not yet held.');
  corpus.refresh.senate_backfill_enabled = false;
  assert.equal(senateGapNote(corpus), 'Senate Hansard for 2014 to 2018 is not yet held.');
  const held = coverageCollections(path => path === 'corpus.json' ? corpus : read(path));
  assert.ok(coverageHTML(held).includes('Senate Hansard for 2014 to 2018 is not yet held.'));
  corpus.refresh.senate_backfill_enabled = true;
  assert.equal(senateGapNote(corpus), 'Senate Hansard for 2014 to 2018 is being added.');
  const gaps = coverageCollections(path => path === 'corpus.json' ? corpus : read(path));
  assert.ok(coverageHTML(gaps).includes(senateGapNote(corpus)));
  const coverage = corpus.refresh.federal_hansard_coverage;
  coverage.unpublished_senate_years = [2014, 2016, 2017, 2018];
  assert.equal(senateGapNote(corpus), 'Senate Hansard for 2014, 2016 to 2018 is being added.');
  coverage.unpublished_senate_years = [];
  assert.equal(senateGapNote(corpus), '');
  coverage.backfill_pending_days_by_year = {'2014': 62};
  assert.equal(senateGapNote(corpus), 'Senate Hansard for 2014 is being added.');
  corpus.refresh.senate_backfill_enabled = false;
  assert.equal(senateGapNote(corpus), 'Senate Hansard for 2014 is not yet held.');
  coverage.backfill_pending_days_by_year = {'2014': 0};
  assert.equal(senateGapNote(corpus), '');
});

test('published coverage counts follow each dataset, with distinct units and provenance', () => {
  const byId = new Map(rows.map(r => [r.id, r]));
  const count = (id, n) => assert.equal(byId.get(id)?.count, n, id);
  read('corpus.json').sources.forEach((s, i) => count(`corpus-${i}`, s.docs));
  const rc = read('royal-commissions/index.json'), ir = read('integrity-reports/index.json');
  count('royal-commissions', rc.meta.counts.commissions);
  count('integrity-reports', ir.meta.counts.records);
  count('hearing-transcripts', rc.meta.counts.transcripts + Object.values(ir.transcripts.counts).reduce((a, b) => a + b, 0));
  count('transcript-text', Object.values(read('transcripts/index.json').commissions).reduce((n, c) => n + c.counts.transcripts, 0));
  count('annual-reports', read('annual-reports/index.json').meta.counts.reports);
  count('agency-reports', read('agency-reports/index.json').meta.counts.documents);
  count('official-report-records', read('search-catalog/manifest.json').counts.report);
  count('qao', read('audit/manifest.json').count);
  count('federal-bills', read('bills/index.json').count);
  count('division-catalogue', read('divisions/index.json').count);
  count('instruments', read('instruments/manifest.json').exported);
  count('senate-video', read('video/senate.json').videos.length);
  count('bills-tas', read('bills-tas/data.json').counts.bills);
  count('bills-act', read('bills-act/data.json').counts.bills);
  count('contracts', read('suppliers.json').meta.contract_count);
  count('people', read('parliamentarians.json').meta.people);
  count('pay', read('pay.json').meta.people);
  count('diaries', read('access.json').meta.meetings_rows);
  count('lobbyists', read('corpus.json').refresh.structured_sources.lobbyist_firms);
  count('campaigners', read('graph/campaigners.json').meta.counts.entities);
  count('connections', read('evidence/stats.json').entities_with_connections);
  count('budget', read('budget/data.json').aggregates.length);
  const ec = Object.values(read('electorates/manifest.json').coverage.jurisdictions);
  count('electorates', ec.reduce((n, c) => n + c.electorates, 0));
  for (const [id, field] of [['aec-returns','ext_aec_returns'], ['aec-debts','ext_aec_debts'], ['aec-benefits','ext_aec_benefits']]) count(id, read('graph/aec-extras.json').meta.counts.rows[field]);
  for (const jur of ['federal','qld']) count(`grants-${jur}`, read(`graph/grants.${jur}.json`).meta.counts.grants);
  for (const jur of ['','qld','vic','tas']) count(`receipts-${jur || 'federal'}`, read(`graph/money${jur ? '.' + jur : ''}.json`).meta.rows_considered);
  const charity = read('entities/tax-charity/index.json').meta.counts;
  for (const [key, field] of [['register','charity'],['ais','ais'],['ato','ato']]) count(`tax-charity-${key}`, charity[field]);
  count('interests', read('interests/index.json')._meta.rows);
  count('expenses', read('expenses.json').meta.rows);
  count('fits', read('fits.json').meta.register_counts.registrants);
  for (const id of ['tax-expenditures', 'gov-advertising', 'sa-grants', 'sa-budget']) count(id, read(`${id}/data.json`).rows.length);
  const finance = read('government-finance/data.json');
  count('government-finance', finance.rows.length + finance.function_rows.length);
  count('vic-gifts', read('vic-gifts/data.json').promotion.counts.rows);
  count('act-invoices', JSON.parse(readFileSync(new URL('../../data/staged/act-invoices/reconciliation.json', import.meta.url))).rows);
  for (const r of rows) for (const key of ['publisher','scope','unit','reuse','refresh','snapshot','source']) assert.ok(r[key], `${r.id}: ${key}`);
  for (const id of ['federal-bills','hearing-transcripts','transcript-text','agency-reports']) assert.doesNotMatch(byId.get(id).scope, /Dates not recorded/);
  assert.match(byId.get('receipts-federal').unit, /source rows considered/);
  assert.match(byId.get('act-invoices').unit, /approved snapshot/);
  assert.match(byId.get('official-report-records').scope, /overlap/);
});

test('coverage generation responds to changed metadata rather than pinned counts', () => {
  const changed = coverageCollections(path => {
    const data = read(path);
    if (path === 'royal-commissions/index.json') data.meta.counts.commissions += 1;
    if (path === 'agency-reports/index.json') data.meta.counts.facts += 10;
    return data;
  });
  assert.equal(changed.find(r => r.id === 'royal-commissions').count, read('royal-commissions/index.json').meta.counts.commissions + 1);
  assert.notEqual(coverageHTML(changed), coverageHTML(rows));
  assert.throws(() => renderCoverage('<main/>'), /marker/);
  assert.doesNotThrow(() => buildMethods({check: true}));
});

test('every generated coverage entry is served whole and survives SPA hydration', () => {
  const server = panelPrerender(html, 'stats');
  const document = new JSDOM(server).window.document;
  assert.equal(document.querySelectorAll('[data-coverage]').length, rows.length);
  for (const row of rows) {
    const tr = document.querySelector(`[data-coverage="${row.id}"]`);
    assert.equal(Number(tr.querySelector('[data-count]').dataset.count), row.count, row.id);
    assert.equal(tr.querySelector('a').getAttribute('href'), row.href);
    assert.ok(tr.textContent.includes(row.publisher), row.id);
  }
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.ok(document.querySelector('[data-coverage="connections"]'), 'last nested section is preserved');
  const spa = readFileSync(new URL('spa-shell.js', pub), 'utf8');
  const shell = JSON.parse(spa.match(/main\.innerHTML=(.*?);if\(answer\)/s)[1]);
  assert.equal(panelPrerender(shell, 'stats'), server);
  assert.equal(panelPrerender(shell, 'about'), panelPrerender(html, 'about'));
});

test('About and Methods describe the new records and their evidence limits', () => {
  const about = panelPrerender(html, 'about'), methods = panelPrerender(html, 'methods');
  for (const phrase of ['Royal commissions', 'integrity body reports', 'Commonwealth annual report tables', 'agency annual reports', 'Senate video', 'ACT notifiable invoices', 'Treasury tax expenditures', 'ABS government finance']) assert.ok(about.includes(phrase), phrase);
  for (const phrase of ['Hearing transcripts are evidence', 'suppression or non-publication orders', 'pseudonymous witness', 'PDF page number', 'OCR', 'not an\n      annual salary', 'not currently offered to Ask', '/api/report/&lt;slug&gt;']) assert.ok(methods.includes(phrase), phrase);
  const copy = new JSDOM(about + methods).window.document.body.textContent;
  assert.doesNotMatch(copy, /—/);
  assert.ok(about.includes('href="/official-reports"'), 'About links the official reports pages');
  for (const href of ['/official-reports/royal-commissions','/official-reports/integrity','/official-reports/annual-reports','/official-reports/agency-reports']) assert.ok(coverageHTML(rows).includes(`href="${href}"`), href);
  for (const href of ['/video/senate','/register/state-bills','/register/act-invoices','/register/gov-advertising','/register/tax-expenditures','/register/government-finance','/audit']) assert.ok(about.includes(`href="${href}"`), href);
});
