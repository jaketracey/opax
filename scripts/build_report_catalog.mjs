// Offline projection of the four published datasets. Never fetches source sites.
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const publicRoot = fileURLToPath(new URL('../portal/public/', import.meta.url));
const rows = value => Array.isArray(value) ? value : [];
const official = value => typeof value === 'string' && /^https:\/\//.test(value) ? value : null;
const apiUrl = codename => codename ? `https://previewapi.transparency.gov.au/delivery/items?system.codename=${codename}&depth=1` : null;
const slugPart = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const short = value => String(value).slice(0, 240); // A verbatim prefix, without an inserted ellipsis.
const codes = { Cth: 'federal', NSW: 'nsw', Vic: 'vic', Qld: 'qld', WA: 'wa', SA: 'sa', Tas: 'tas', ACT: 'act', NT: 'nt' };
const abbreviate = name => String(name).split(/\s+/).filter(w => !/^(of|and|the|for|new|south|wales)$/i.test(w)).map(w => w[0]).join('');
const cite = (url, document, extra = {}) => official(url) ? { url, document, ...extra } : null;

/** Shared page/API projection. `record`, `facts`, `headline` and each table's
 * `rows` retain the dataset's values, labels, units, citations and status fields.
 * One annual_report record is one Commonwealth body and reporting year. */
export async function projectReports(read) {
  const out = [];
  const add = (type, id, title, body, jurisdiction, date, dateBasis, year, snippet, citation, record, meta, publisher, extra = {}) => {
    if (!citation) throw new Error(`Report has no official citation: ${id}`);
    const slug = `${type.replace(/_/g, '-')}-${slugPart(id)}`;
    const detail = { schema: 1, kind: 'report', report_type: type, slug, title, body, jurisdiction,
      date: date || null, date_basis: dateBasis || null, year: year || null, snippet: short(snippet), citation,
      snapshot_at: meta.snapshot_at, caveats: rows(meta.caveats), publisher, record,
      facts: [], tables: [], headline: null, ...extra };
    const aliases = [body, publisher.short, publisher.acronyms, abbreviate(body), year, date, date?.slice(0, 4),
      String(id).replace(/[-_]/g, ' '), String(id).replace(/^[^-]+-/, '').replace(/[-_]/g, ' '),
      ...rows(record.reports).flatMap(r => [r.title, r.date?.slice(0, 4)]), record.operation].filter(Boolean);
    const row = { kind: 'report', report_type: type, title, body, jurisdiction, date: detail.date,
      year: detail.year, href: `/report/${slug}`, slug, snippet: detail.snippet, citation,
      source_url: citation.url, source: publisher.short || body, resource: '', ...(year ? { dateLabel: year } : {}) };
    out.push({ row, detail, aliases, state: codes[jurisdiction] || '', year: Number(String(year || date || '').slice(0, 4)) || 0 });
  };

  const royal = await read('/royal-commissions/index.json');
  for (const entry of royal.commissions) {
    const { commission: c } = await read(entry.file);
    const report = [...c.reports].reverse().find(r => r.kind === 'final_report') || c.reports.at(-1);
    add('royal_commission', c.id, c.name, c.name, c.jurisdiction, report?.date, report?.date_basis, null,
      report?.title || c.name, cite(report?.page_url || c.site, report?.title || c.name), c, royal.meta,
      { name: c.name, jurisdiction_name: c.jurisdiction_name });
  }

  const integrity = await read('/integrity-reports/index.json');
  for (const b of integrity.bodies.filter(b => b.status === 'loaded')) {
    const file = await read(b.file || `/integrity-reports/reports-${b.code.replace(/_/g, '-')}.json`);
    for (const r of file.records) add('integrity_report', r.id, r.title, b.name, r.jurisdiction, r.date, r.date_basis,
      r.period?.value || null, r.title, cite(r.pdf_url || r.page_url, r.title), r, integrity.meta, b);
  }

  const annual = await read('/annual-reports/index.json');
  const tables = new Map();
  for (const year of annual.meta.counts.years) {
    for (const kind of ['remuneration', 'suppliers']) {
      // Before supplier coverage starts there is no file, by design.
      if (kind === 'suppliers' && year < '2020-21') continue;
      const file = await read(`/annual-reports/${kind}-${year}.json`);
      const byTable = new Map();
      for (const r of file.rows) {
        if (!byTable.has(r.table_id)) byTable.set(r.table_id, []);
        byTable.get(r.table_id).push(r);
      }
      for (const [id, t] of Object.entries(file.tables)) {
        const key = `${t.body_id}/${year}`;
        if (!tables.has(key)) tables.set(key, []);
        const held = byTable.get(id) || [];
        const unit = kind === 'remuneration' ? 'dollars; band averages are per person in the band' :
          held.some(r => 'expenditure_dollars' in r) ? 'dollars GST inclusive' : "$'000 GST inclusive";
        tables.get(key).push({ ...t, unit, rows: held, source_url: t.source_url || apiUrl(t.codename) });
      }
    }
  }
  const headlines = new Map(annual.headline.map(h => [`${h.body_id}/${h.year}`, h]));
  for (const b of annual.bodies) for (const [year, r] of Object.entries(b.reports)) {
    const held = tables.get(`${b.id}/${year}`) || [], headline = headlines.get(`${b.id}/${year}`) || null;
    const h = Object.values(headline || {}).find(v => v && typeof v === 'object' && v.codename);
    const source = r.url || held[0]?.source_url || apiUrl(h?.codename);
    // Some historical body-years have only a title, with no report URL or
    // loaded disclosures. They cannot supply a row-level official citation.
    if (!source) continue;
    add('annual_report', `${b.id}-${year}`, r.title, b.name, 'Cth', r.published_on, r.published_on ? 'published' : null,
      year, r.title, cite(source, r.title), r, annual.meta,
      { id: b.id, name: b.name, acronyms: b.acronyms, type: b.type, type_as_published: b.type_as_published, portfolio: r.portfolio || b.portfolio },
      { tables: held, headline });
  }

  const agency = await read('/agency-reports/index.json'), facts = new Map();
  for (const file of new Set(agency.documents.map(d => d.facts_file).filter(Boolean))) {
    const data = await read(file);
    for (const f of data.facts) {
      if (!facts.has(f.report_id)) facts.set(f.report_id, []);
      facts.get(f.report_id).push(f);
    }
  }
  for (const d of agency.documents) {
    const held = facts.get(d.id) || [];
    const title = `${d.agency} ${d.reporting_year} ${d.kind}`;
    add('agency_report', d.id, title, d.agency, d.jurisdiction, d.tabled?.date, d.tabled?.basis, d.reporting_year,
      held[0]?.quote || d.agency, held[0] ? cite(held[0].source_url, title, { page: held[0].page }) : cite(d.source_url, title),
      d, agency.meta, { name: d.agency }, { facts: held, caveats: [
        'Each figure is quoted from the report with its page; units, labels and definitions differ between reports, so check the unit and label before comparing agencies. Nothing here is an allegation or a finding about any person.',
        'Coverage is the documents in OPAX\'s intake so far, not every agency in each jurisdiction.',
      ] });
  }
  if (new Set(out.map(r => r.row.slug)).size !== out.length) throw new Error('Duplicate report slug');
  return out;
}

export async function buildReportCatalog(root = publicRoot) {
  const read = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
  const reports = await projectReports(read);
  const dir = join(root, 'report-records');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const { row, detail } of reports) await writeFile(join(dir, row.slug + '.json'), JSON.stringify(detail));
  return reports;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built ${(await buildReportCatalog()).length} report records`);
}
