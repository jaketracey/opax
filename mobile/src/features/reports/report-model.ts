import type { OfficialReport, PublishedValue } from '../../api/report-decoders';
import { formatCount, formatDate } from '../../design/format';
import { reportDate, reportTypeLabel } from './report-present';

export type Citation = OfficialReport['citation'];
export type ReportDocument = NonNullable<
  OfficialReport['record']['documents']
>[number];
export type Fact = OfficialReport['facts'][number];
export type Section = {
  id: string;
  title: string;
  count?: number;
  documents?: ReportDocument[];
  facts?: Fact[];
  rows?: InfoRow[];
};
export type InfoRow = { label: string; value: string; cite?: Citation };
export type Figure = {
  label: string;
  value: string;
  spoken: string;
  note?: string;
  cite?: Citation;
};
export const words = (key: string) =>
  key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
export const splitRuns = (text: string) => text.split(/(?= [•◦▪●] )/);
export const host = (url: string) =>
  new URL(url).hostname.replace(/^www\./, '');
export const isPdf = (url: string) => /\.pdf\b/i.test(url);
export const pageTarget = (cite: Citation) =>
  cite.page && isPdf(cite.url) && !cite.url.includes('#')
    ? `${cite.url}#page=${cite.page}`
    : cite.url;
export function citationLabel(cite: Citation, mainDocument = '') {
  const name = same(cite.document, mainDocument) ? 'Report' : cite.document;
  return [name, cite.page ? `page ${formatCount(cite.page)}` : '', cite.section]
    .filter(Boolean)
    .join(', ');
}
export const asObject = (
  value: PublishedValue | undefined,
): Record<string, PublishedValue> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const rightsText = (value: PublishedValue | undefined): string =>
  typeof value === 'string'
    ? value
    : Object.values(asObject(value))
        .filter((v) => typeof v === 'string')
        .join(' ');
const finite = (value: PublishedValue | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export function dollars(value: number) {
  const amount = Math.abs(value),
    sign = value < 0 ? '-' : '';
  if (amount >= 1e9)
    return `${sign}$${(amount / 1e9).toFixed(2).replace(/\.?0+$/, '')} billion`;
  if (amount >= 1e6)
    return `${sign}$${(amount / 1e6).toFixed(1).replace(/\.0$/, '')} million`;
  return `${sign}$${formatCount(Math.round(amount))}`;
}
const jurisdictions: Record<string, string> = {
  Cth: 'Commonwealth',
  NSW: 'New South Wales',
  Vic: 'Victoria',
  Qld: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  Tas: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
};
export function metaLine(r: OfficialReport) {
  const c = r.record;
  const titled =
    ['annual_report', 'agency_report'].includes(r.report_type) &&
    r.title.toLowerCase().includes(r.body.toLowerCase());
  const named = titled || same(r.body, r.title);
  const kind =
    titled && r.publisher.type_as_published
      ? r.publisher.type_as_published
      : r.report_type === 'royal_commission'
        ? words(c.inquiry_type || 'royal_commission')
        : r.report_type === 'integrity_report'
          ? c.type_as_published || words(c.report_type || 'integrity_report')
          : r.report_type === 'agency_report'
            ? `${words(c.kind || 'report')}${r.year ? ` ${r.year}` : ''}`
            : `${reportTypeLabel(r.report_type)}${r.year ? ` ${r.year}` : ''}`;
  const who =
    r.publisher.short && r.publisher.short !== r.body
      ? `${r.body} (${r.publisher.short})`
      : r.body;
  return [
    kind,
    named ? '' : who,
    r.publisher.jurisdiction_name ||
      jurisdictions[r.jurisdiction] ||
      r.jurisdiction,
    r.date
      ? reportDate(r.date, r.date_basis).replace(
          formatDate(r.date, 'short'),
          formatDate(r.date),
        )
      : reportDate(r.date, r.date_basis),
  ]
    .filter(Boolean)
    .join(' · ');
}
export function findingsTitle(r: OfficialReport) {
  const kinds = new Set(r.record.findings?.map((item) => item.kind));
  return kinds.size === 1 && kinds.has('finding')
    ? 'Findings'
    : kinds.size === 1 && kinds.has('opinion')
      ? 'Opinions'
      : 'Findings, opinions and statements';
}
export function statusCounts(r: OfficialReport) {
  const counts = new Map<string, number>();
  for (const item of r.record.recommendations ?? []) {
    const label = item.status?.as_published;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}
export function recommendationIndex(r: OfficialReport) {
  const items = r.record.recommendations ?? [];
  return {
    items:
      items.length > 12 && items.every((item) => item.number != null)
        ? items
        : [],
    folded: items.length > 60,
  };
}
export function source(r: OfficialReport) {
  const c = r.record;
  const final =
    c.reports?.find((d) => d.kind === 'final_report') || c.reports?.[0];
  const file =
    final?.files?.find((f) => f.url === r.citation.url) || final?.files?.[0];
  const doc =
    c.documents?.find((d) => d.url === r.citation.url) ||
    c.documents?.find((d) => ['report', 'tabled_paper'].includes(d.role || ''));
  const pages =
    r.report_type === 'royal_commission'
      ? file?.pages
      : r.report_type === 'integrity_report'
        ? doc?.pages
        : c.pages;
  const bytes =
    r.report_type === 'royal_commission'
      ? file?.bytes
      : r.report_type === 'integrity_report'
        ? doc?.bytes
        : c.bytes;
  const url =
    r.report_type === 'agency_report'
      ? c.source_url || r.citation.url
      : r.citation.url;
  const label =
    r.report_type === 'annual_report' && host(url).startsWith('previewapi.')
      ? 'Transparency Portal data for this report (JSON)'
      : r.citation.document;
  const meta = [
    isPdf(url)
      ? 'PDF'
      : host(url).startsWith('previewapi.')
        ? 'JSON'
        : 'Web page',
    pages != null ? `${formatCount(pages)} pages` : '',
    bytes
      ? bytes >= 1048576
        ? `${(bytes / 1048576).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`
      : '',
    host(url),
  ]
    .filter(Boolean)
    .join(' · ');
  const more: { url: string; label: string }[] = [];
  const add = (url: string | undefined, label: string) => {
    if (url && !same(url, r.citation.url) && !more.some((x) => x.url === url))
      more.push({ url, label });
  };
  add(
    c.page_url,
    c.page_url && isPdf(c.page_url)
      ? 'Report PDF'
      : `Report page on ${c.page_url ? host(c.page_url) : ''}`,
  );
  add(c.url, 'Annual report on the Transparency Portal');
  for (const d of c.reports ?? [])
    add(d.page_url, d.title || 'Publisher’s report page');
  add(c.pdf_url, 'Report PDF');
  add(c.site, 'Inquiry website');
  add(c.catalogue_url, 'Tabled document record');
  add(c.corrigendum_url, 'Corrigendum');
  add(c.reuse_terms_url, 'Reuse terms');
  return { url: pageTarget({ ...r.citation, url }), label, meta, more, pages };
}
export function factPrinted(f: Fact) {
  const v = f.value_as_published;
  const money = v.includes('$') ? v : `$${v}`;
  return (
    {
      millions_of_dollars: `${money} million`,
      thousands_of_dollars: `${money} thousand`,
      dollars: money,
      percent: v.endsWith('%') ? v : `${v}%`,
      fte: `${v} FTE`,
      people: `${v} people`,
      days: `${v} days`,
      count: v,
    }[f.unit] || `${v} ${words(f.unit).toLowerCase()}`
  );
}
export function factReadable(f: Fact) {
  const scale = {
    millions_of_dollars: 1e6,
    thousands_of_dollars: 1e3,
    dollars: 1,
  }[f.unit];
  return scale && f.value != null ? dollars(f.value * scale) : factPrinted(f);
}
export function figures(r: OfficialReport): Figure[] {
  const out: Figure[] = [];
  const addCount = (
    label: string,
    count: number | undefined,
    suffix = label.toLowerCase(),
  ) => {
    if (count != null && count > 0)
      out.push({
        label,
        value: formatCount(count),
        spoken: `${formatCount(count)} ${suffix}`,
      });
  };
  if (['royal_commission', 'integrity_report'].includes(r.report_type)) {
    if (r.report_type === 'integrity_report')
      addCount(findingsTitle(r), r.record.findings?.length);
    addCount(
      r.record.recommendations_status === 'partial'
        ? 'Recommendations reproduced'
        : 'Recommendations',
      r.record.recommendations?.length,
    );
    if (r.report_type === 'integrity_report')
      addCount('Published responses', r.record.responses?.length);
    const pages = source(r).pages;
    if (pages)
      out.push({
        label: 'Report length',
        value: `${formatCount(pages)} pages`,
        spoken: `${formatCount(pages)} pages, report length`,
      });
  }
  if (r.report_type === 'annual_report') {
    const h = r.headline || {};
    const inc = asObject(h.income_statement);
    if (finite(inc.total_expenses)) {
      const value =
        inc.unit === "$'000"
          ? dollars(inc.total_expenses * 1000)
          : formatCount(inc.total_expenses);
      out.push({
        label: 'Total expenses',
        value,
        spoken: `${value}, total expenses`,
      });
    }
    for (const [key, label] of [
      ['ongoing_staff', 'Ongoing staff'],
      ['non_ongoing_staff', 'Non-ongoing staff'],
    ] as const) {
      const value = asObject(h[key]).headcount;
      if (finite(value))
        out.push({
          label,
          value: formatCount(value),
          spoken: `${formatCount(value)} people, ${label.toLowerCase()}`,
        });
    }
    for (const [key, label] of [
      ['consultancy', 'Consultancy contracts'],
      ['non_consultancy', 'Non-consultancy contracts'],
    ] as const) {
      const v = asObject(h[key]);
      if (finite(v.expenditure_thousands)) {
        const value = dollars(v.expenditure_thousands * 1000);
        out.push({
          label,
          value,
          spoken: `${value}, ${label.toLowerCase()}`,
          note: finite(v.contracts)
            ? `${formatCount(v.contracts)} contracts`
            : undefined,
        });
      }
    }
  }
  if (r.report_type === 'agency_report')
    for (const metric of [
      'total_expenses',
      'total_income',
      'staff_headcount',
      'staff_fte',
    ]) {
      const f = r.facts.find((item) => item.metric === metric);
      if (f)
        out.push({
          label: f.label,
          value: factReadable(f),
          spoken: `${factReadable(f)}, ${f.label}`,
          note:
            factReadable(f) !== factPrinted(f)
              ? `Printed as ${factPrinted(f)}`
              : undefined,
          cite: {
            url: f.source_url,
            document: r.citation.document,
            page: f.page,
          },
        });
    }
  return out;
}
const families: [string, string, string[]][] = [
  [
    'finances',
    'Finances',
    ['total_income', 'total_expenses', 'employee_expenses', 'net_result'],
  ],
  ['staff', 'Staff', ['staff_headcount', 'staff_fte']],
  [
    'executives',
    'Executives and remuneration',
    [
      'head_remuneration',
      'named_remuneration',
      'executive_count',
      'executive_band',
      'executive_remuneration_total',
      'executive_average_remuneration',
    ],
  ],
  ['consultancies', 'Consultancies', ['consultancy_total', 'consultancy']],
  [
    'activity',
    'Complaints and investigations',
    [
      'matters_received',
      'investigations_commenced',
      'investigations_finalised',
      'referrals_to_prosecution',
      'recommendations_made',
      'public_hearings',
    ],
  ],
];
export function sections(r: OfficialReport): Section[] {
  const c = r.record,
    out: Section[] = [];
  const addRows = (
    id: string,
    title: string,
    rows: (InfoRow | undefined)[],
  ) => {
    const held = rows.filter((x): x is InfoRow => !!x?.value);
    if (held.length) out.push({ id, title, rows: held });
  };
  const row = (
    label: string,
    value: string | undefined,
    cite?: Citation,
  ): InfoRow | undefined => (value ? { label, value, cite } : undefined);
  if (r.report_type === 'royal_commission') {
    out.push({
      id: 'recommendations',
      title: 'Recommendations',
      count: c.recommendations?.length || undefined,
    });
    addRows('commission', 'About the inquiry', [
      row('Type of inquiry', c.inquiry_type && words(c.inquiry_type)),
      row(
        'Established',
        c.established?.quote ||
          (c.established?.date && formatDate(c.established.date, 'short')),
        c.established?.cite,
      ),
      ...(c.commissioners || []).map((p) =>
        row(p.role || 'Commissioner', p.quote || p.name, p.cite),
      ),
      row(
        'Interim report',
        c.interim_report_date && formatDate(c.interim_report_date, 'short'),
      ),
      row(
        'Final report',
        c.final_report_date && formatDate(c.final_report_date, 'short'),
      ),
      row('Status as published', c.status_as_published),
    ]);
    const docs = [
      ...(c.reports || []),
      ...(c.responses || []),
      ...(c.transcripts || []),
    ];
    if (docs.length)
      out.push({
        id: 'documents',
        title: 'Official documents',
        count: docs.length,
        documents: docs,
      });
    if (c.status_source)
      out.push({ id: 'status-source', title: 'Where the status comes from' });
  } else if (r.report_type === 'integrity_report') {
    const unread = (part: 'findings' | 'recommendations') =>
      !c[part]?.length && c[`${part}_status`] !== 'stated_none';
    if (unread('findings') && unread('recommendations'))
      out.push({ id: 'unextracted', title: 'Findings and recommendations' });
    else
      out.push(
        {
          id: 'findings',
          title: findingsTitle(r),
          count: c.findings?.length || undefined,
        },
        {
          id: 'recommendations',
          title: 'Recommendations',
          count: c.recommendations?.length || undefined,
        },
      );
    if (
      c.responses?.length ||
      ['none_found', 'not_checked'].includes(c.responses_status || '')
    )
      out.push({
        id: 'responses',
        title: 'Published responses',
        count: c.responses?.length || undefined,
        documents: c.responses,
      });
    const docs = c.documents || [];
    const lone =
      docs.length === 1 &&
      docs[0]?.url === r.citation.url &&
      !docs[0]?.acquisition &&
      !docs[0]?.note &&
      !docs[0]?.rights;
    if (docs.length && !lone)
      out.push({
        id: 'documents',
        title: 'Official documents',
        count: docs.length,
        documents: docs,
      });
    addRows('about', 'About the report', [
      row('Period', c.period),
      row('How OPAX got it', c.acquisition),
      row(
        'Rights',
        typeof c.rights === 'string'
          ? c.rights
          : String(asObject(c.rights).statement || ''),
      ),
    ]);
  } else if (r.report_type === 'annual_report') {
    if (
      r.headline &&
      Object.values(r.headline).some((v) => Object.keys(asObject(v)).length)
    )
      out.push({ id: 'figures', title: 'Published headline figures' });
    out.push({
      id: 'tables',
      title: 'Published disclosure tables',
      count: r.tables.length || undefined,
    });
  } else {
    const used = new Set<Fact>();
    for (const [id, title, metrics] of families) {
      const facts = r.facts.filter((f) => metrics.includes(f.metric || ''));
      facts.forEach((f) => used.add(f));
      if (facts.length) out.push({ id, title, count: facts.length, facts });
    }
    const rest = r.facts.filter((f) => !used.has(f));
    if (rest.length)
      out.push({
        id: 'other-figures',
        title: 'Other figures',
        count: rest.length,
        facts: rest,
      });
    if (!r.facts.length)
      out.push({ id: 'figures', title: 'Figures as published', facts: [] });
    const edition: Record<string, string> = {
      current: 'Current edition',
      current_corrected: 'Current edition, corrected copy',
      prior_edition: 'Earlier edition (latest verified)',
      statutory_companion: 'Statutory companion document',
      statutory_return: 'Statutory return',
    };
    const reading: Record<string, string> = {
      read: 'Read by OPAX',
      not_read: 'Not read by OPAX',
      not_read_no_text: 'Not read: the file is a scan without a text layer',
    };
    addRows('document', 'About the document', [
      row('Edition', c.edition && (edition[c.edition] || words(c.edition))),
      row('Edition note', c.edition_note),
      row('Reading status', c.status && (reading[c.status] || words(c.status))),
      row('Pages', c.pages ? formatCount(c.pages) : undefined),
      row(
        'Figures not found in the report',
        c.not_found?.map(words).join('; '),
      ),
      row('Rights', c.rights_note),
      row('Attribution', c.attribution),
      row('File note', c.file_note),
    ]);
  }
  if (r.transcripts?.count) {
    const before = out.findIndex((part) =>
      ['status-source', 'about'].includes(part.id),
    );
    const part = {
      id: 'transcripts',
      title: 'Hearing transcripts: evidence, not findings',
      count: r.transcripts.count,
    };
    if (before < 0) out.push(part);
    else out.splice(before, 0, part);
  }
  if (c.notes?.length) out.push({ id: 'notes', title: 'Notes on this record' });
  if (c.gaps?.length || r.publisher.gaps?.length || c.reference_pages?.length)
    out.push({ id: 'coverage', title: 'Coverage' });
  return out;
}
