import type { Discovery, DiscoverySignal } from '../../api/catalog-decoders';
import {
  formatCount,
  formatDate,
  formatPercent,
  moneyAccessibilityLabel,
} from '../../design/format';
import type { LeadEvidence } from '../../design/lead';

// The leads on the web's /discover page (portal/public/app.js, "discovery"):
// the same signals, categories, comparisons, caveats and links, in the web's
// words. A lead is a reason to look closer, never a finding.

export const leadCategories = [
  'procurement_concentration',
  'recipient_concentration',
  'donor_contract_overlap',
] as const;
export type LeadCategory = (typeof leadCategories)[number];
const isLeadCategory = (value: string): value is LeadCategory =>
  (leadCategories as readonly string[]).includes(value);

// DISCOVERY_CATEGORIES (the card's kicker), the View options in index.html,
// and the count noun filterDiscoveries() writes.
const categoryWords: Record<
  LeadCategory,
  { label: string; option: string; one: string; many: string }
> = {
  procurement_concentration: {
    label: 'Government contracts',
    option: 'Contracts by agency',
    one: 'agency',
    many: 'agencies',
  },
  recipient_concentration: {
    label: 'Party funding',
    option: 'Party funding',
    one: 'party',
    many: 'parties',
  },
  donor_contract_overlap: {
    label: 'Companies in both',
    option: 'Companies in both',
    one: 'company',
    many: 'companies',
  },
};
export const categoryLabel = (category: LeadCategory) =>
  categoryWords[category].label;
export const categoryOption = (category: LeadCategory) =>
  categoryWords[category].option;

/** An example record as the reader sees it (design/lead.tsx). */
export type LeadEvidenceView = LeadEvidence;

type Evidence = DiscoverySignal['evidence'][number];
function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
// The two registers the export links to (scripts/export_discovery.py).
const registers: Record<string, { name: string; host: string; kind: string }> =
  {
    contracts: {
      name: 'AusTender register',
      host: 'tenders.gov.au',
      kind: 'Contract value',
    },
    donations: {
      name: 'AEC Transparency Register',
      host: 'transparency.aec.gov.au',
      kind: 'AEC annual receipt',
    },
  };
// The source tokens the export writes after the date: AusTender rows carry
// their ingest source, receipts the export's own words.
const sourceTokens: Record<string, string[]> = {
  contracts: ['austender'],
  donations: ['aec annual receipt'],
};

/**
 * The export's evidence label read into its parts: "Department of Home
 * Affairs → SECURE JOURNEYS PTY LTD: $2,343,038,544.00 · starts 2024-12-10 ·
 * austender · record CN4111897". The amount, names and dates are kept as
 * written; only the record number changes. A local row number is dropped,
 * and a label in any other shape keeps its register link but hides the
 * label, so no unread ID reaches the reader.
 */
export function leadEvidenceFor(evidence: Evidence): LeadEvidenceView {
  const register = registers[evidence.table];
  const host = hostOf(evidence.url);
  const known = !!register && (host === null || host === register.host);
  const kind =
    evidence.link_scope === 'source_register' ? 'register' : 'record';
  const base: LeadEvidenceView = {
    amount: null,
    amountSpoken: null,
    from: null,
    to: null,
    detail: null,
    register: known
      ? register.name
      : kind === 'register'
        ? 'Source register'
        : 'Source record',
    record: null,
    url: evidence.url,
    kind,
  };
  if (!known) return base;
  const id = evidence.record_id;
  const tail = [` · local record ${id}`, ` · record ${id}`].find((t) =>
    evidence.label.endsWith(t),
  );
  if (!tail) return base;
  const [head, ...qualifiers] = evidence.label
    .slice(0, -tail.length)
    .split(' · ');
  const colon = head!.lastIndexOf(': $');
  if (colon < 0) return base;
  const names = head!.slice(0, colon).split(' → ');
  const amount = head!.slice(colon + 2);
  if (
    names.length !== 2 ||
    !names.every((name) => name.trim()) ||
    !/^\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/.test(amount)
  )
    return base;
  let when: string | null = null;
  for (const qualifier of qualifiers) {
    const fy = /^FY (\d{4})-(\d{2})$/.exec(qualifier);
    const start = /^starts (\d{4}-\d{2}-\d{2})$/.exec(qualifier);
    if (fy && evidence.table === 'donations') when = `FY ${fy[1]}–${fy[2]}`;
    else if (qualifier === 'FY unknown' && evidence.table === 'donations')
      when = 'financial year not recorded';
    else if (start && evidence.table === 'contracts' && formatDate(start[1]!))
      when = `starts ${formatDate(start[1]!, 'short')}`;
    else if (
      !sourceTokens[evidence.table]!.includes(qualifier.toLocaleLowerCase())
    )
      return base;
  }
  const whole = amount.replace(/\.00$/, '');
  return {
    ...base,
    amount: whole,
    amountSpoken: `${whole.slice(1)} dollars`,
    from: names[0]!.trim(),
    to: names[1]!.trim(),
    detail: [register.kind, when].filter(Boolean).join(' · '),
    // AusTender contract notice IDs are the register's own; a donation's
    // record_id is OPAX's local row.
    record:
      tail.startsWith(' · record') &&
      evidence.table === 'contracts' &&
      /^CN\d+(?:-A\d+)?$/.test(id)
        ? `record ${id}`
        : null,
  };
}

export interface ChartRow {
  name: string;
  value: number;
  share: number;
  records: number | null;
  other: boolean;
  /** A supplier's profile on opax.com.au, as the web's chart links it. */
  supplierPath: string | null;
}
export type LeadComparison =
  | {
      type: 'concentration';
      heading: string;
      /** "38.7% of recorded contract value went to SECURE JOURNEYS PTY LTD." */
      takeaway: string;
      chartTitle: string;
      total: number;
      rows: ChartRow[];
      note: string;
    }
  | {
      type: 'overlap';
      heading: string;
      takeaway: string;
      receipts: { value: number; records: number };
      contracts: { value: number; records: number };
      note: string;
    };

export interface LeadLink {
  label: string;
  /** What VoiceOver says: the label in context. */
  accessibilityLabel: string;
  path: string;
  testID: string;
}

export interface LeadView {
  id: string;
  category: LeadCategory;
  categoryLabel: string;
  entity: string;
  title: string;
  summary: string;
  metrics: DiscoverySignal['metrics'];
  caveats: string[];
  evidence: LeadEvidenceView[];
  /** The as-at line's sources: who publishes the records behind the lead. */
  citation: string[];
  comparison: LeadComparison;
  links: LeadLink[];
}

const metricValue = (signal: DiscoverySignal, label: string) =>
  Number(signal.metrics.find((metric) => metric.label === label)?.value ?? 0);
export const supplierPath = (name: string) =>
  `/subject/supplier/${encodeURIComponent(name)}`;
/** The lead on the web's /discover page, where its comparison is drawn. */
export const discoverPath = (
  signal: Pick<DiscoverySignal, 'id' | 'category'>,
) =>
  `/discover?${new URLSearchParams({ category: signal.category, item: signal.id })}`;

// "FY 2007–08 to 2024–25", "Contract start years 2009–2026" (app.js
// discoveryDetailHTML, with the app's en dash in financial years).
function periodText(chart: NonNullable<DiscoverySignal['chart']>) {
  const period = chart.period;
  if (!period?.from || !period.to) return 'All available years';
  if (period.kind === 'financial_year')
    return `FY ${period.from.replace('-', '–')} to ${period.to.replace('-', '–')}`;
  return `Contract start years ${period.from.slice(0, 4)}–${period.to.slice(0, 4)}`;
}

function comparisonFor(signal: DiscoverySignal): LeadComparison {
  const chart = signal.chart;
  const contracts = signal.category === 'procurement_concentration';
  if (chart) {
    const lead = chart.participants[0]!;
    const missing =
      (chart.period?.undated_records ?? 0) +
      (chart.period?.invalid_date_records ?? 0);
    const rows: ChartRow[] = chart.participants.map((p) => ({
      name: p.name,
      value: p.value,
      share: p.share,
      records: p.record_count,
      other: false,
      supplierPath:
        chart.participant_label === 'supplier' ? supplierPath(p.name) : null,
    }));
    if (chart.other_total > 0)
      rows.push({
        name: `Other ${formatCount(chart.other_count)} ${chart.participant_label === 'supplier' ? 'suppliers' : 'contributors'}`,
        value: chart.other_total,
        share: chart.other_share,
        records: null,
        other: true,
        supplierPath: null,
      });
    return {
      type: 'concentration',
      heading: chart.group_label,
      takeaway: `${formatPercent(lead.share)} ${contracts ? 'of recorded contract value went to' : 'of recorded receipts came from'} ${lead.name}.`,
      chartTitle: contracts
        ? 'Who got the contracts?'
        : 'Where did the funding come from?',
      total: chart.group_total,
      rows,
      note: `${formatCount(chart.record_count)} ${contracts ? 'contracts' : 'receipts'} · ${periodText(chart)}. ${contracts ? 'Recorded contract values, not the agency’s whole budget.' : 'Party receipts include more than gifts.'}${missing ? ` ${formatCount(missing)} records have no valid date.` : ''}`,
    };
  }
  return {
    type: 'overlap',
    heading: signal.entity,
    takeaway: 'This name appears in both sets of records.',
    receipts: {
      value: metricValue(signal, 'Recorded party receipts'),
      records: metricValue(signal, 'Party receipt records'),
    },
    contracts: {
      value: metricValue(signal, 'Recorded contract value'),
      records: metricValue(signal, 'Contract records'),
    },
    note: 'Different money flows and reporting periods. A shared name doesn’t show that one led to the other.',
  };
}

// The web's actions (discoveryDetailHTML). "Find mentions in parliament"
// opens /search, which the Worker sends to Ask's model-backed search, so the
// app leaves it out (navigation/external.ts). The money map is drawn on the
// web's lead page, behind its "Explore connections on the money map" button.
function linksFor(signal: DiscoverySignal, category: LeadCategory): LeadLink[] {
  const links: LeadLink[] = [];
  if (category !== 'recipient_concentration')
    links.push({
      label: 'Explore supplier profile',
      accessibilityLabel: `Explore supplier profile, ${signal.entity}`,
      path: supplierPath(signal.entity),
      testID: 'supplier',
    });
  links.push(
    category === 'procurement_concentration'
      ? {
          label: 'Open this comparison on opax.com.au',
          accessibilityLabel: `Open the ${signal.chart?.group_label ?? signal.entity} comparison`,
          path: discoverPath(signal),
          testID: 'web',
        }
      : {
          label: 'Explore connections on the money map',
          accessibilityLabel: `Explore connections on the money map, ${signal.entity}`,
          path: discoverPath(signal),
          testID: 'money-map',
        },
  );
  return links;
}

// Who publishes the records behind each kind of lead (coverage.receipt_scope;
// the contracts corpus is AusTender).
const citations: Record<LeadCategory, string[]> = {
  procurement_concentration: ['AusTender'],
  recipient_concentration: ['AEC annual returns'],
  donor_contract_overlap: ['AEC annual returns', 'AusTender'],
};

export function leadFor(signal: DiscoverySignal): LeadView | null {
  if (!isLeadCategory(signal.category)) return null;
  const category = signal.category;
  return {
    id: signal.id,
    category,
    categoryLabel: categoryLabel(category),
    entity: signal.entity,
    title: signal.title,
    summary: signal.summary,
    metrics: signal.metrics,
    caveats: signal.caveats,
    evidence: signal.evidence.map(leadEvidenceFor),
    citation: citations[category],
    comparison: comparisonFor(signal),
    links: linksFor(signal, category),
  };
}

export type LeadFilter = 'all' | LeadCategory;
export type LeadSort = 'value' | 'share';
const shareOf = (signal: DiscoverySignal) =>
  Number(signal.chart?.participants[0]?.share ?? 0);
const totalOf = (signal: DiscoverySignal) =>
  Number(
    signal.chart?.group_total ?? metricValue(signal, 'Recorded contract value'),
  );
const nameOf = (signal: DiscoverySignal) =>
  signal.chart?.group_label ?? signal.entity;

/**
 * The leads to show. "All" keeps the export's own order (its methodology:
 * "Cards alternate signal families and rank within each family by recorded
 * value"). A category sorts as the web does: by total (contract value for
 * companies in both) or, for concentrations, by the largest share; ties by
 * name. Signals of a category the app does not know are left out.
 */
export function leadsFor(
  discovery: Discovery,
  filter: LeadFilter = 'all',
  sort: LeadSort = 'value',
): LeadView[] {
  let signals = discovery.signals.filter((signal) =>
    isLeadCategory(signal.category),
  );
  if (filter !== 'all') {
    signals = signals.filter((signal) => signal.category === filter);
    const byShare = sort === 'share' && filter !== 'donor_contract_overlap';
    signals = [...signals].sort(
      (a, b) =>
        (byShare ? shareOf(b) - shareOf(a) : totalOf(b) - totalOf(a)) ||
        nameOf(a).localeCompare(nameOf(b)),
    );
  }
  return signals.map((signal) => leadFor(signal)!);
}

/** "60 leads", "28 agencies", "1 party". */
export function leadCount(count: number, filter: LeadFilter) {
  if (filter === 'all')
    return `${formatCount(count)} ${count === 1 ? 'lead' : 'leads'}`;
  const words = categoryWords[filter];
  return `${formatCount(count)} ${count === 1 ? words.one : words.many}`;
}

/** The web's "About these numbers" lede (renderDiscoveryPage). */
export function aboutLede(discovery: Discovery) {
  return `A concentration is a reason to look closer, not proof of wrongdoing. This page covers ${formatCount(discovery.coverage.contracts)} contracts and ${formatCount(discovery.coverage.donations)} party receipts.`;
}
/** The export's calendar date, in UTC as the web reads it. */
export const discoveryAsOf = (discovery: Discovery) =>
  (discovery.coverage.snapshot_at ?? discovery.generated_at).slice(0, 10);

/** A chart row read aloud: "SECURE JOURNEYS PTY LTD, 2.3 billion dollars, 38.7 percent". */
export function chartRowLabel(row: ChartRow) {
  return `${row.name}, ${moneyAccessibilityLabel(row.value, true)}, ${formatPercent(row.share).slice(0, -1)} percent`;
}
