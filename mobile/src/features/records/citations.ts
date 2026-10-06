import type { DocumentRecord } from './model';
// Ports of portal/public/app.js splitName, fmtDate, titleSubject, bibtexFor,
// risFor and citePanelHTML. Tests execute those web functions for parity.
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const STATE_NAMES: Record<string, string> = {
  federal: 'Federal',
  nsw: 'NSW',
  vic: 'VIC',
  sa: 'SA',
  qld: 'QLD',
  act: 'ACT',
};
export function citeDate(iso: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}
function splitName(full: string | null) {
  const parts = String(full || '')
    .trim()
    .split(/\s+/);
  if (parts.length < 2) return { family: full || '', given: '' };
  return {
    family: parts[parts.length - 1],
    given: parts.slice(0, -1).join(' '),
  };
}
const titleKey = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
export function titleSubject(rec: {
  title: string;
  speaker?: string | null;
  date?: string | null;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
}) {
  const parts = String(rec.title ?? '')
    .trim()
    .split(/(\s+—\s+)/);
  if (rec.speaker && titleKey(parts[0]) === titleKey(rec.speaker))
    parts.splice(0, 2);
  else if (
    rec.labels?.kind === 'press_release' &&
    rec.metadata?.role &&
    titleKey(parts[0]) === titleKey(rec.metadata.role)
  )
    parts.splice(0, 2);
  const iso = String(rec.date ?? rec.metadata?.date ?? '').slice(0, 10);
  const dates = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? [iso, titleKey(citeDate(iso))]
    : iso
      ? [titleKey(iso)]
      : [];
  if (parts.length && dates.includes(titleKey(parts[parts.length - 1])))
    parts.splice(-2);
  return parts.join('').trim();
}
export interface CitationSource {
  slug: string;
  title: string;
  speaker?: string | null;
  date?: string;
  sourceUrl?: string | null;
  url?: string | null;
}
export interface CitationContext {
  origin: string;
  corpusVersion: string;
  accessed: string;
}
export function bibtexFor(s: CitationSource, context: CitationContext) {
  const { family, given } = splitName(s.speaker ?? null),
    year = (s.date || '').slice(0, 4),
    month = Number((s.date || '').slice(5, 7)) || '';
  const fields = [
    s.speaker ? `  author = {${family}, ${given}}` : null,
    `  title = {${(s.title || s.slug).replace(/[{}]/g, '')}}`,
    year ? `  year = {${year}}` : null,
    month ? `  month = {${month}}` : null,
    `  howpublished = {Public record, via OPAX corpus v${context.corpusVersion}}`,
    `  url = {${context.origin}/doc/${s.slug}}`,
    `  urldate = {${context.accessed}}`,
    (s.sourceUrl ?? s.url)
      ? `  note = {Official record: ${s.sourceUrl ?? s.url}}`
      : null,
  ].filter(Boolean);
  return `@misc{opax-${s.slug},\n${fields.join(',\n')}\n}`;
}
export function risFor(s: CitationSource, context: CitationContext) {
  const { family, given } = splitName(s.speaker ?? null),
    lines = ['TY  - GOVDOC'];
  if (s.speaker) lines.push(`AU  - ${family}, ${given}`);
  lines.push(`TI  - ${s.title || s.slug}`);
  if (s.date)
    lines.push(
      `PY  - ${s.date.slice(0, 4)}`,
      `DA  - ${s.date.slice(0, 10).replace(/-/g, '/')}`,
    );
  lines.push(`UR  - ${context.origin}/doc/${s.slug}`);
  const official = s.sourceUrl ?? s.url;
  lines.push(
    `N1  - Via OPAX corpus v${context.corpusVersion}${official ? `; official record: ${official}` : ''}`,
    'ER  - ',
  );
  return lines.join('\n');
}
export function citationsFor(doc: DocumentRecord, context: CitationContext) {
  const d = typeof doc.metadata.date === 'string' ? doc.metadata.date : '',
    year = d.slice(0, 4),
    { family, given } = splitName(doc.speaker);
  const state = doc.labels.state,
    chamber =
      state && state !== 'federal'
        ? `Parliament of ${STATE_NAMES[state] || state}`
        : 'Commonwealth, Parliamentary Debates';
  const url = `${context.origin}/doc/${doc.slug}`;
  const src = {
    slug: doc.slug,
    title: doc.title,
    speaker: doc.speaker,
    date: d,
    sourceUrl: doc.url,
  };
  if (doc.labels.kind === 'bill_text')
    return [
      {
        id: 'source',
        label: 'Source citation',
        extension: 'txt',
        text: [doc.title, doc.metadata.stage, doc.metadata.date, doc.url || url]
          .filter(Boolean)
          .join('. '),
        note: 'Use the original bill document for authoritative wording and page or clause references.',
      },
    ];
  return [
    {
      id: 'aglc',
      label: 'AGLC-style',
      extension: 'txt',
      text: `${chamber}, ${citeDate(d)}${doc.speaker ? ` (${doc.speaker})` : ''} <${url}>.`,
      note: 'For AGLC-compliant page references, use the official record via the source link. OPAX never invents Hansard page numbers.',
    },
    {
      id: 'apa',
      label: 'APA 7',
      extension: 'txt',
      text: `${family}${given ? `, ${given[0]}.` : ''} (${year || 'n.d.'}). ${doc.title}. Parliamentary record, Australia. OPAX. ${url}`,
    },
    {
      id: 'bibtex',
      label: 'BibTeX',
      extension: 'bib',
      text: bibtexFor(src, context),
    },
    { id: 'ris', label: 'RIS', extension: 'ris', text: risFor(src, context) },
  ];
}
