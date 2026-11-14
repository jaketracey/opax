import {readFileSync} from 'node:fs';

const publicRoot = new URL('../portal/public/', import.meta.url);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const number = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid coverage count: ${value}`);
  return value.toLocaleString('en-AU');
};
const range = values => {
  const sorted = [...new Set(values.filter(Boolean).map(String))].sort();
  return sorted.length ? sorted[0] === sorted.at(-1) ? sorted[0] : `${sorted[0]} to ${sorted.at(-1)}` : 'Dates not recorded';
};
const years = (rows, field) => range(rows.map(row => row[field]?.slice(0, 4)));
const sum = values => values.reduce((a, b) => a + b, 0);
const search = kind => `/ask?view=search&kind=${kind}`;
// The one coverage input the release build regenerates (build:search) rather than the nightly
// publishing it: stamp_assets.mjs --files lists it, so the restamp commits it with the table.
export const SEARCH_CATALOG_MANIFEST = 'search-catalog/manifest.json';

export function senateGapNote(corpus) {
  const coverage = corpus.refresh?.federal_hansard_coverage;
  const pending = coverage?.backfill_pending_days_by_year;
  const gap = (pending ? Object.entries(pending).filter(([, n]) => n > 0).map(([y]) => Number(y))
    : coverage?.unpublished_senate_years || [])
    .filter(year => year >= 2014 && year <= 2019).sort((a, b) => a - b);
  const runs = [];
  for (const year of new Set(gap)) {
    const last = runs.at(-1);
    if (last && last[1] + 1 === year) last[1] = year;
    else runs.push([year, year]);
  }
  return runs.length ? `Senate Hansard for ${runs.map(([a, b]) => a === b ? a : `${a} to ${b}`).join(', ')} is being added.` : '';
}

/** Read published snapshots, never fetch publishers or open private build inputs.
 * Counts below name their units: corpus resources, catalogue rows and register
 * totals are different populations. Stamping regenerates this alongside Methods.
 */
export function coverageCollections(read = path => JSON.parse(readFileSync(new URL(path, publicRoot), 'utf8'))) {
  const rows = [];
  const add = (id, group, name, href, publisher, scope, count, unit, reuse, refresh, snapshot, source, note = '') => {
    number(count);
    rows.push({id, group, name, href, publisher, scope, count, unit, reuse, refresh, snapshot, source, note});
  };
  const manual = 'Reviewed snapshot; updated by manual intake or promotion.';
  const weekly = 'Weekly checks; last good snapshot kept when acquisition is held.';
  const corpus = read('corpus.json');
  const corpusNotes = source => {
    const name = source.name;
    if (/AEC donations/.test(name)) return ['Australian Electoral Commission', 'Commonwealth', 'CC BY 4.0. Classified corpus records; current map rows are counted separately.', '/money', 'Reviewed AEC export; amended source rows await reconciliation.'];
    if (/Federal bill|Original federal bill/.test(name)) return ['Parliament of Australia', 'Commonwealth', 'Source document terms; text and metadata are separate records.', '/bills', 'Nightly pipeline; automatic bill acquisition currently paused.'];
    if (/MLCI|GrantConnect|Grant research/.test(name)) return ['Department of Infrastructure; Department of Finance (GrantConnect); attributed research sources', 'Commonwealth', 'GrantConnect CC BY 3.0 AU; other source terms and attributed notes.', search('all'), 'Dated research intake and manual supplements; GrantConnect acquisition currently paused.'];
    if (/notional/.test(name)) return ['Australian Electoral Commission', 'Commonwealth', 'CC BY 4.0; notional baseline, not an election result.', '/subject/electorate', manual];
    if (/representation/.test(name)) return ['Parliamentary rosters', 'Federal and state', 'Source terms; historical observations, not current tenure.', '/subject/person', manual];
    if (/Prime Minister|Government.*(releases|statements)|Premier releases|Treasury/.test(name)) {
      const publisher = /Prime Minister/.test(name) ? 'Department of the Prime Minister and Cabinet' : /NSW/.test(name) ? 'NSW Government' : /Queensland/.test(name) ? 'Queensland Government' : /Victorian/.test(name) ? 'Premier of Victoria' : 'Australian Treasury';
      return [publisher, /NSW/.test(name) ? 'NSW' : /Queensland/.test(name) ? 'Queensland' : /Victorian/.test(name) ? 'Victoria' : 'Commonwealth', 'Open source grants recorded with each release; check its citation.', search('press_release'), 'Nightly where permitted; dated supplement windows remain as listed.'];
    }
    if (/divisions/.test(name)) return ['They Vote For You and the publishing parliaments', 'Federal, NSW, Victoria, Queensland', 'TVFY database: ODbL; parliamentary source terms also apply.', '/sitting', 'Nightly checks; state coverage differs.'];
    if (/committee/.test(name)) return ['Parliament of Australia', 'Commonwealth', 'Parliamentary copyright; CC BY-NC-ND 4.0, with source exceptions.', '/estimates', 'Automatic source paused; local Proof PDF supplements included.'];
    const jurisdiction = /NSW/.test(name) ? 'NSW' : /Victorian/.test(name) ? 'Victoria' : /QLD/.test(name) ? 'Queensland' : /SA Parliament/.test(name) ? 'South Australia' : /ACT/.test(name) ? 'ACT' : 'Commonwealth';
    const publisher = {NSW:'Parliament of New South Wales', Victoria:'Parliament of Victoria', Queensland:'Queensland Parliament', 'South Australia':'Parliament of South Australia', ACT:'ACT Legislative Assembly', Commonwealth:'Parliament of Australia'}[jurisdiction];
    const reuse = jurisdiction === 'Victoria' ? 'Parliamentary copyright; specific permission for fair, accurate and free reuse.' : ['Commonwealth', 'ACT'].includes(jurisdiction) ? 'CC BY-NC-ND 4.0; source exceptions apply.' : 'Parliamentary copyright; consult the source terms.';
    return [publisher, jurisdiction, reuse, search('speech'), ['Queensland','South Australia'].includes(jurisdiction) ? 'Automatic acquisition paused; stored coverage retained.' : 'Nightly checks where permitted.'];
  };
  corpus.sources.forEach((source, i) => {
    const [publisher, jurisdiction, reuse, href, refresh] = corpusNotes(source);
    add(`corpus-${i}`, 'Search corpus', source.name, href, publisher, `${jurisdiction}; ${source.coverage}`, source.docs, 'source records', reuse, refresh, corpus.version, '/corpus.json', /Senate.*openaustralia/i.test(source.name) ? senateGapNote(corpus) : '');
  });

  const bills = read('bills/index.json');
  add('federal-bills', 'Parliament', 'Federal bill registry', '/bills', 'Parliament of Australia', `Commonwealth; ${years(bills.bills, 'introduced')}. Registry entries, distinct from corpus text versions.`, bills.count, 'bills', 'Source document terms; model summaries labelled.', 'Nightly pipeline; acquisition currently paused.', bills.generated_at, '/bills/index.json');
  const divisions = read('divisions/index.json');
  add('division-catalogue', 'Parliament', 'Recorded division catalogue', '/sitting', 'They Vote For You; Parliament of New South Wales; Parliament of Victoria; Queensland Parliament', `Federal, NSW, Victoria, Queensland; ${years(divisions.divisions, 'date')}. Individual records available through bills and member pages.`, divisions.count, 'division records', 'ODbL for TVFY database; parliamentary source terms.', 'Nightly checks; last good records retained.', corpus.version, '/divisions/index.json');
  for (const [jur, name] of [['tas','Parliament of Tasmania'], ['act','ACT Legislative Assembly']]) {
    const d = read(`bills-${jur}/data.json`);
    add(`bills-${jur}`, 'Parliament', `${jur === 'tas' ? 'Tasmanian' : 'ACT'} bill register`, '/register/state-bills', name, `${jur === 'tas' ? 'Tasmania' : 'ACT'}; ${years(d.bills, 'introduced_date')}. ${d.scope}`, d.counts.bills, 'bill metadata records', `${d.licence.name}. Registry facts and original links only; document bodies withheld.`, manual, d.generated_at, `/bills-${jur}/data.json`);
  }
  const instruments = read('instruments/manifest.json');
  add('instruments', 'Parliament', 'Federal legislative instruments', search('instrument'), 'Office of Parliamentary Counsel, Federal Register of Legislation', 'Commonwealth; in-force title listing at the snapshot, with bounded version dates. This is not a historical series.', instruments.exported, 'exported titles', 'CC BY 4.0, with FRL exceptions; metadata only.', 'Thursday checks with completeness guards.', instruments.generated_at, '/instruments/manifest.json', `${number(instruments.count)} titles listed by FRL; ${number(instruments.unresolved_gap)} unresolved at export.`);
  const video = read('video/senate.json');
  add('senate-video', 'Parliament', 'Senate video', '/video/senate', video.meta.channel.title, `Commonwealth; ${years(video.videos, 'date')}`, video.videos.length, 'video links', video.meta.use, 'Nightly feed checks; back catalogue supplement.', video.meta.updated, '/video/senate.json', `${number(video.meta.counts.question_time)} Question Time; ${number(video.meta.counts.first_speech)} first speeches; ${number(video.meta.counts.other)} other.`);

  const rc = read('royal-commissions/index.json'), integrity = read('integrity-reports/index.json');
  const commissions = rc.commissions.map(c => read(c.file.slice(1)).commission);
  add('royal-commissions', 'Official reports and inquiries', 'Royal commissions and comparable public inquiries', '/official-reports/royal-commissions', 'The named commissions; government response publishers; Parliament of Victoria tabled copies', `All nine jurisdictions; loaded report dates ${years(rc.commissions.flatMap(c => c.reports), 'date')}. Some inquiries are listed by transcripts only.`, rc.meta.counts.commissions, 'inquiries', 'Document-specific copyright and reuse terms; citations retain publisher links.', `${weekly} Manual publisher supplements included.`, rc.meta.snapshot_at, '/royal-commissions/index.json', `${number(rc.meta.counts.recommendations)} recommendations; ${number(rc.meta.counts.with_status)} have a published government status. Inquiry types are retained.`);
  add('integrity-reports', 'Official reports and inquiries', 'Integrity body reports', '/official-reports/integrity', integrity.bodies.map(b => b.name).join('; '), `Commonwealth and all states and territories; ${years(integrity.reports, 'date')}`, integrity.meta.counts.records, `reports from ${number(integrity.meta.counts.bodies_loaded)} bodies`, 'Terms differ by body: NACC and Queensland CCC CC BY 4.0; other copyright and tabled-copy terms recorded per body/document.', `${weekly} Manual publisher supplements included.`, integrity.meta.snapshot_at, '/integrity-reports/index.json', `${number(integrity.meta.counts.findings)} quoted findings or opinions; ${number(integrity.meta.counts.recommendations)} recommendations. Allegations are not findings.`);
  const integrityTranscripts = Object.values(integrity.transcripts.files).flatMap(file => read(file.slice(1)).transcripts);
  const inquiryTranscripts = commissions.flatMap(c => c.transcripts);
  const transcripts = [...inquiryTranscripts, ...integrityTranscripts];
  add('hearing-transcripts', 'Official reports and inquiries', 'Commission hearing transcripts', search('report'), 'The listed inquiry and integrity commissions, including the Law Enforcement Conduct Commission', `All nine jurisdictions; ${years(transcripts, 'date')}. Selected hearings, not a complete hearing record.`, rc.meta.counts.transcripts + sum(Object.values(integrity.transcripts.counts)), 'transcripts listed', 'Publisher copyright, redactions and suppression orders retained. Integrity transcripts are linked, not republished.', 'Manual publisher intake.', integrity.transcripts.intake.snapshot_at, '/integrity-reports/index.json', `${number(rc.meta.counts.transcripts)} inquiry and ${number(sum(Object.values(integrity.transcripts.counts)))} integrity transcript listings. Evidence, not findings; open the hearing section of a report record.`);
  const text = read('transcripts/index.json'), textCounts = Object.values(text.commissions).map(c => c.counts);
  add('transcript-text', 'Official reports and inquiries', 'Licensed hearing transcript text', search('report'), Object.values(text.commissions).map(c => c.name).join('; '), `Commonwealth and NSW; ${years(inquiryTranscripts.filter(t => t.full_text), 'date')}`, sum(textCounts.map(c => c.transcripts)), 'licensed transcript records', 'CC BY 4.0. Transcripts recording publication orders or pseudonymous witnesses are not quoted.', 'Manual publisher intake and checked text export.', text.built_at, '/transcripts/index.json', `${number(sum(textCounts.map(c => c.quote)))} may be quoted; ${number(sum(textCounts.map(c => c.no_quotes)))} remain page pointers without quotations.`);
  const annual = read('annual-reports/index.json'), ac = annual.meta.counts;
  add('annual-reports', 'Official reports and inquiries', 'Commonwealth annual report tables', '/official-reports/annual-reports', annual.meta.source, `Commonwealth; ${range(ac.years)}. Remuneration and bands from ${ac.coverage.remuneration[0]}; suppliers from ${ac.coverage.suppliers[0]}; headline figures from ${ac.coverage.headline[0]}. Latest year still being tabled.`, ac.reports, `body-year report entries across ${number(ac.bodies)} bodies`, 'Non-corporate Commonwealth entities CC BY 4.0; corporate entities and companies retain their copyright.', weekly, annual.meta.legacy_files.built_at, '/annual-reports/index.json', `${number(ac.kmp_rows)} named remuneration rows; ${number(ac.band_rows)} band rows; ${number(ac.supplier_rows)} supplier rows; ${number(ac.headline_rows)} headline rows.`);
  const agency = read('agency-reports/index.json');
  add('agency-reports', 'Official reports and inquiries', 'Agency annual reports and quoted figures', '/official-reports/agency-reports', 'The named Commonwealth, state and territory agencies; Parliament of Victoria tabled copies', `All nine jurisdictions; ${range(agency.documents.map(d => d.reporting_year))}. Selected intake, mainly Victoria and NSW.`, agency.meta.counts.documents, `documents from ${number(agency.meta.counts.agencies)} agencies`, 'Document-specific terms; verbatim figures and source page links. OCR is marked.', 'Manual publisher PDFs checked by SHA-256; dedicated figures tool available through MCP.', agency.meta.snapshot_at, '/agency-reports/index.json', `${number(agency.meta.counts.facts)} quoted figures; ${number(agency.documents.filter(d => d.text_source === 'ocr').length)} documents read with OCR.`);
  const audit = read('audit/manifest.json');
  add('qao', 'Official reports and inquiries', 'Queensland audit reports', '/audit', 'Queensland Audit Office', `Queensland; ${range(audit.facets.year)}`, audit.count, 'report records', 'CC BY 4.0 with per-report exceptions. PDF bodies and responses remain held under document terms.', weekly, audit.generated_at, '/audit/manifest.json', `${number(audit.html_recommendations)} HTML recommendations.`);
  const catalog = read(SEARCH_CATALOG_MANIFEST);
  add('official-report-records', 'Official reports and inquiries', 'Official report record pages and JSON', '/official-reports', 'Publishers of the four official-report collections above', 'Coverage follows the inquiry, integrity, Commonwealth annual-report and agency-report collections. These records overlap those totals.', catalog.counts.report, 'searchable report records', 'Source-cited records at /report/<slug>; JSON at /api/report/<slug>. Original document terms apply.', 'Rebuilt from the published collections at release.', corpus.version, '/search-catalog/manifest.json', 'One record per integrity report or agency document, per Commonwealth body-year, or per inquiry grouping its documents. Uncitable body-year stubs are excluded.');

  for (const [jur, title] of [['','Commonwealth'], ['qld','Queensland'], ['vic','Victoria'], ['tas','Tasmania']]) {
    const path = `graph/money${jur ? '.' + jur : ''}.json`, d = read(path), m = d.meta;
    add(`receipts-${jur || 'federal'}`, 'Money', `${title} political receipts`, `/money/receipts${jur ? '?jur=' + jur : ''}`, m.commission || 'Australian Electoral Commission', `${title}; ${m.coverage}. Map and ledger are selected projections.`, m.rows_considered, 'source rows considered for the map', m.licence || 'CC BY 4.0 (Australian Electoral Commission).', jur ? weekly : 'Reviewed AEC export; amended source rows await reconciliation.', m.generated, '/' + path, 'Disclosed receipts include categories other than donations. State and federal totals are never added.');
  }
  const extra = read('graph/aec-extras.json'), campaigners = read('graph/campaigners.json');
  for (const [id, title, field, scope] of [['aec-returns','AEC annual return totals','ext_aec_returns',extra.meta.coverage.returns], ['aec-debts','AEC disclosed debts','ext_aec_debts',extra.meta.coverage.debts], ['aec-benefits','AEC benefits and capital contributions','ext_aec_benefits',`Benefits ${extra.meta.coverage.discretionary_benefits}; capital contributions ${extra.meta.coverage.capital_contributions}`]]) {
    add(id, 'Money', title, '/subject/party', 'Australian Electoral Commission', `Commonwealth; ${scope}. Party pages show their published slices.`, extra.meta.counts.rows[field], 'source rows', extra.meta.licence, 'Reviewed source snapshot and derived export.', extra.meta.generated, '/graph/aec-extras.json');
  }
  add('campaigners', 'Money', 'Campaigners, associated entities and third parties', '/subject/campaigner', 'Australian Electoral Commission', `Commonwealth; annual returns to ${campaigners.meta.latest_year}. Roster requires at least $${number(campaigners.meta.floor)} in a reported year.`, campaigners.meta.counts.entities, 'entities in the roster', campaigners.meta.licence, 'Reviewed source snapshot and derived export.', campaigners.meta.generated, '/graph/campaigners.json');
  for (const jur of ['federal','qld']) {
    const d = read(`graph/grants.${jur}.json`), m = d.meta;
    add(`grants-${jur}`, 'Money', `${m.label} grants`, `/money/grants?jur=${jur}`, jur === 'federal' ? 'Department of Finance, GrantConnect' : 'Queensland Government Investment Portal', `${m.label}; ${range(m.years)} (source-record years). ${m.threshold}`, m.counts.grants, jur === 'federal' ? 'award records' : 'annual funding lines', m.licence, jur === 'federal' ? 'Scheduled checks; automatic acquisition paused, manual GrantConnect supplement included.' : 'Retained source snapshot; guarded export.', m.generated, `/graph/grants.${jur}.json`, 'Awards and annual funding lines are different measures; an award is not a payment. Source date anomalies remain visible.');
  }
  const suppliers = read('suppliers.json'), sm = suppliers.meta;
  add('contracts', 'Money', 'Commonwealth contracts', '/money/contracts', 'Department of Finance, AusTender', `Commonwealth; notice dates ${sm.published_from} to ${sm.published_to}. Current collection window starts ${sm.publication_window_start}; older records supplement missing notices.`, sm.contract_count, 'contracts at latest recorded value', sm.licence, 'Nightly acquisition; monthly guarded supplier and agency exports.', sm.generated_at, '/suppliers.json', `${number(sm.supplier_count)} suppliers; ${number(read('agencies.json').meta.agency_count)} agencies. Awards, not verified expenditure; amendments are not added together.`);

  const register = (id, title, href, publisher, jurisdiction, scopeField, unit, count) => {
    const d = read(`${id}/data.json`);
    const recordRows = d.rows || d.aggregates;
    const scope = scopeField ? range(recordRows.map(r => r[scopeField])) : d.scope;
    add(id, 'Registers and public finance', title, href, publisher, `${jurisdiction}; ${scope}`, count ? count(d) : recordRows.length, unit, d.licence?.name || 'CC BY 4.0, as recorded with each source document or row; exceptions retained.', manual, d.promotion.snapshot_date, `/${id}/data.json`);
  };
  register('budget', 'Federal Budget papers and figures', '/budget', 'Australian Treasury; Department of Finance; publishing portfolios', 'Commonwealth', null, 'published fiscal aggregate cells', d => d.aggregates.length);
  rows.at(-1).note = `${number(read('budget/data.json').measure_count)} measure records; source document and portfolio indexes also listed. Estimates, projections and actuals retain their labels.`;
  register('sa-budget', 'South Australian historical budget tables', '/budget', 'Department of Treasury and Finance, Government of South Australia', 'South Australia; 2015-16 Budget vintage', 'fiscal_year', 'published cells');
  register('sa-grants', 'Grants SA historical funded projects', '/register/sa-grants', 'Department of Human Services, Government of South Australia', 'South Australia', 'year', 'project rows');
  register('tax-expenditures', 'Tax expenditures', '/register/tax-expenditures', 'Australian Treasury', 'Commonwealth; 2025-26 statement', 'measure_year', 'published estimate cells');
  rows.at(-1).note = 'Revenue forgone estimates against tax benchmarks; publisher-withheld cells are excluded. Estimates are not cash payments and must not be added as a spending total.';
  register('gov-advertising', 'Government advertising expenditure', '/register/gov-advertising', 'Department of Premier and Cabinet, Victoria', 'Victoria only', 'financial_year', 'published table cells');
  register('government-finance', 'Government finance statistics', '/register/government-finance', 'Australian Bureau of Statistics', 'Australia; national, state and territory, local and consolidated government sectors as published', 'reference_year', 'financial and function cells', d => d.rows.length + d.function_rows.length);
  rows.at(-1).note = 'Published sector totals and spending by function are kept separately; OPAX does not add government levels together.';
  const gifts = read('vic-gifts/data.json');
  add('vic-gifts', 'Registers and public finance', 'Ministerial gifts, benefits and hospitality', '/register/vic-gifts', 'Department of Premier and Cabinet, Victoria', `Victoria; ${range(gifts.registers.flatMap(r => [r.document.period.start, r.document.period.end]))}. Ministers and parliamentary secretaries, not ordinary members\' returns.`, gifts.promotion.counts.rows, 'register rows', 'CC BY 4.0, with website exceptions and attribution.', manual, gifts.promotion.snapshot_date, '/vic-gifts/data.json');
  // ACT invoices live in D1, not public JSON. Pin the approved source snapshot's
  // own reconciliation, never a private table dump or an unreviewed staged row.
  const invoice = JSON.parse(readFileSync(new URL('../data/staged/act-invoices/hub.json', import.meta.url), 'utf8'));
  const invoiceCount = JSON.parse(readFileSync(new URL('../data/staged/act-invoices/reconciliation.json', import.meta.url), 'utf8'));
  add('act-invoices', 'Registers and public finance', 'ACT notifiable invoices', '/register/act-invoices', invoice.publisher, `ACT; ${invoice.catalogued_period}. Some payment dates predate the stated register start.`, invoiceCount.rows, 'records in the approved snapshot', invoice.licence, 'Manual reviewed snapshot; not acquired nightly.', invoice.snapshot, '/register/act-invoices', 'Invoices valued at $25,000 or more; individual payments can be smaller. Source rows are not a unique invoice count or all ACT spending.');

  const people = read('parliamentarians.json'), interests = read('interests/index.json'), pay = read('pay.json'), expenses = read('expenses.json'), fits = read('fits.json'), access = read('access.json');
  add('people', 'People and interests', 'Parliamentarian profiles', '/subject/person', 'Publishing parliaments; OpenAustralia; verified roster sources', `Federal and state speech record since ${people.meta.since}; roster dates differ.`, people.meta.people, 'profiles', 'Source-specific terms; portraits individually credited.', 'Guarded exports from speech and roster records.', people.meta.generated, '/parliamentarians.json');
  add('interests', 'People and interests', 'Members\' and senators\' interests', '/declared', 'Parliament of Australia; Queensland Parliament', 'House and Senate, 48th Parliament; Queensland, 58th Parliament. Entries as declared, not verified by OPAX.', interests._meta.rows, `declared entries across ${number(interests._meta.people)} people`, 'Federal registers CC BY-NC-ND; Queensland reuse not verified. Source facts and page links, not rewritten declarations.', 'Federal acquisition paused; retained reviewed register snapshots.', interests._meta.generated, '/interests/index.json');
  add('pay', 'People and interests', 'Parliamentary pay', '/subject/person', pay.meta.sources.map(s => s.publisher).filter((v, i, a) => a.indexOf(v) === i).join('; '), `Commonwealth; ${pay.meta.from} to ${pay.meta.as_of}. Calculated pay for recorded posts, not payslips.`, pay.meta.people, 'people with pay records', 'Published determinations and source terms; calculations identified.', 'Monthly checks and guarded export.', pay.meta.generated, '/pay.json');
  add('expenses', 'People and interests', 'Parliamentarians\' work expenses', '/subject/person', 'Independent Parliamentary Expenses Authority', `Commonwealth; ${expenses.meta.from} to ${expenses.meta.to}. Profile summaries retain adjustments.`, expenses.meta.rows, `source lines; ${number(expenses.meta.people)} linked profiles`, expenses.meta.licence, 'Monthly checks for new quarterly releases; guarded export.', expenses.meta.generated, '/expenses.json');
  add('diaries', 'People and interests', 'Ministerial diaries', '/subject/donor', 'The Cabinet Office, NSW; Queensland Cabinet Office', 'NSW and Queensland; dated meetings in retained diaries, including NSW from 2019 and the current Queensland government from November 2024. Profiles show matched slices.', access.meta.meetings_rows, 'source meeting rows', 'Source-specific terms; matched names and meetings do not establish influence.', 'NSW checked weekly; Queensland monthly. Matched slices exported weekly.', access.meta.generated, '/access.json');
  add('lobbyists', 'People and interests', 'Lobbyist registers and Queensland contacts', '/subject/donor', 'Attorney-General\'s Department; NSW Electoral Commission; Queensland Integrity Commission; Victorian Public Sector Commission; Department of the Premier and Cabinet, South Australia; Public Sector Commission, Western Australia', 'Commonwealth, NSW, Queensland, Victoria, South Australia, Western Australia; register snapshots. Queensland contact disclosures from 2016. Profiles show matched slices.', corpus.refresh.structured_sources.lobbyist_firms, 'source firms', 'Per-register terms; registration is a disclosure, not a finding.', weekly, corpus.version, '/corpus.json', `${number(corpus.refresh.structured_sources.lobbyist_client_links)} client links; ${number(corpus.refresh.structured_sources.lobbyist_people)} people; ${number(corpus.refresh.structured_sources.lobbyist_contact_disclosures)} Queensland contact disclosures.`);
  add('fits', 'People and interests', 'Foreign Influence Transparency Scheme', '/subject/donor', 'Attorney-General\'s Department', 'Commonwealth public-register snapshot; current and ceased relationships. Entity profiles show matched slices.', fits.meta.register_counts.registrants, 'registrants in the source snapshot', fits.meta.licence, weekly, fits.meta.register_loaded, '/fits.json', `${number(fits.meta.register_counts.activities)} activities. Registration is not a finding of wrongdoing.`);
  const tax = read('entities/tax-charity/index.json'), tc = tax.meta;
  for (const [key, title, count, scope, reuse] of [['register','Registered charity status',tc.counts.charity,tc.sources.register.snapshot_date,tc.sources.register.licence], ['ais','Charity Annual Information Statements',tc.counts.ais,range(Object.keys(tc.sources.ais.years)), 'CC BY 2.5 AU (2022); CC BY 3.0 AU (2023 and 2024).'], ['ato','Corporate Tax Transparency',tc.counts.ato,range(Object.keys(tc.sources.ato.years)), 'CC BY 3.0 AU. Tax payable is not tax paid.']]) {
    add(`tax-charity-${key}`, 'People and interests', title, '/subject/supplier', tc.sources[key].publisher, `Australia; ${scope}. Matched by ABN to existing organisation profiles, not the whole source register.`, count, 'matched ABNs with data', reuse, 'Weekly source checks; derived export after matching.', tc.data_as_of, '/entities/tax-charity/index.json');
  }
  const electorates = read('electorates/manifest.json'), ec = Object.values(electorates.coverage.jurisdictions);
  add('electorates', 'People and interests', 'Electorates, elections and Census context', '/subject/electorate', 'Australian Electoral Commission; Australian Bureau of Statistics; publishing parliaments', 'All nine jurisdictions for seat geography; federal results from 2019 and 2021 Census profiles. State results and verified roster coverage differ.', sum(ec.map(c => c.electorates)), 'electorate records', 'Per-source terms; ABS data CC BY 4.0. Statistical geography is not exact address allocation.', 'Reviewed releases and roster corrections.', electorates.generated, '/electorates/manifest.json', `${number(sum(ec.map(c => c.contests)))} federal contests; ${number(sum(ec.map(c => c.demographic_profiles)))} federal demographic profiles.`);
  const evidence = read('evidence/stats.json');
  add('connections', 'Derived collections', 'Programs and places connections', '/connections', 'The publishers of speeches, official releases and grant records', 'Collected source corpus; coverage differs from searchable records. Names and structured locations link to excerpts.', evidence.entities_with_connections, 'entities with connections', 'Original source terms. Name or location links do not establish influence.', 'Rebuilt when reviewed evidence inputs are available.', evidence.generated_at, '/evidence/stats.json');
  return rows;
}

export function coverageHTML(rows = coverageCollections()) {
  const groups = [...new Set(rows.map(r => r.group))];
  return groups.map(group => `<h3>${esc(group)}</h3>\n<div class="table-scroll"><table class="about-table coverage-table" role="table">\n<caption class="visually-hidden">${esc(group)} sources and coverage</caption>\n<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Collection and publisher</th><th role="columnheader" scope="col">Jurisdictions and years</th><th role="columnheader" scope="col">Records</th><th role="columnheader" scope="col">Reuse and refresh</th></tr></thead>\n<tbody role="rowgroup">\n${rows.filter(r => r.group === group).map(r => `<tr data-coverage="${esc(r.id)}" role="row"><th scope="row" role="rowheader"><a href="${esc(r.href)}">${esc(r.name)}</a><p class="fineprint">${esc(r.publisher)}</p></th><td role="cell"><span class="coverage-label" aria-hidden="true">Jurisdictions and years</span>${esc(r.scope)}</td><td role="cell" data-count="${r.count}"><span class="coverage-label" aria-hidden="true">Records</span>${number(r.count)} ${esc(r.unit)}${r.note ? `<p class="fineprint">${esc(r.note)}</p>` : ''}</td><td role="cell"><span class="coverage-label" aria-hidden="true">Reuse and refresh</span>${esc(r.reuse)}<p>${esc(r.refresh)}</p><p class="fineprint">Snapshot: ${esc(r.snapshot.slice(0, 10))}. <a href="${esc(r.source)}">Dataset and provenance</a>.</p></td></tr>`).join('\n')}\n</tbody></table></div>`).join('\n');
}

export function renderCoverage(html, rows = coverageCollections()) {
  const pattern = /(<!-- coverage:begin -->)[\s\S]*?(<!-- coverage:end -->)/g;
  if ([...html.matchAll(pattern)].length !== 1) throw Error('Coverage marker missing or duplicated');
  return html.replace(pattern, (_, open, close) => `${open}\n${coverageHTML(rows)}\n${close}`);
}
