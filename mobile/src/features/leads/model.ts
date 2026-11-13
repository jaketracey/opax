import type { Discovery, DiscoverySignal } from '../../api/catalog-decoders';
import {
  array,
  invalid,
  nonempty,
  object,
  optional,
} from '../../api/validation';
import {
  counted,
  formatCount,
  formatDate,
  formatMoneyCompact,
  formatPercent,
  moneyAccessibilityLabel,
} from '../../design/format';
import type { LeadEvidence } from '../../design/lead';
import {
  agencyListRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';
import { sourceUrl } from '../../navigation/external';
import { samePartyLabel } from '../../design/party';
import type { decodeAgency } from '../money-public/data';
import { normaliseOrganisation } from '../money/lookup';

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
  {
    label: string;
    one: string;
    many: string;
    /** "See all 28 government contract leads". */
    seeAll: string;
    /** The kind list's bar search. */
    search: string;
    /** Who publishes the records behind this kind. */
    source: string;
  }
> = {
  procurement_concentration: {
    label: 'Government contracts',
    one: 'agency',
    many: 'agencies',
    seeAll: 'government contract leads',
    search: 'Agencies',
    source: 'AusTender',
  },
  recipient_concentration: {
    label: 'Party funding',
    one: 'party',
    many: 'parties',
    seeAll: 'party funding leads',
    search: 'Parties',
    source: 'AEC',
  },
  donor_contract_overlap: {
    label: 'Companies in both',
    one: 'company',
    many: 'companies',
    seeAll: 'company leads',
    search: 'Companies',
    source: 'AEC and AusTender',
  },
};
export const categoryLabel = (category: LeadCategory) =>
  categoryWords[category].label;
export const isCategory = (value: unknown): value is LeadCategory =>
  typeof value === 'string' && isLeadCategory(value);
// Plain names a link may use for a kind ("opax://discover?category=party_funding").
const categoryAliases: Record<string, LeadCategory> = {
  government_contracts: 'procurement_concentration',
  contracts: 'procurement_concentration',
  party_funding: 'recipient_concentration',
  companies_in_both: 'donor_contract_overlap',
};
/** A link's kind, by the export's name or its plain name; null otherwise. */
export function categoryFrom(value: unknown): LeadCategory | null {
  if (isCategory(value)) return value;
  return typeof value === 'string' && Object.hasOwn(categoryAliases, value)
    ? categoryAliases[value]!
    : null;
}
export const categorySeeAll = (category: LeadCategory, count: number) =>
  `See all ${formatCount(count)} ${categoryWords[category].seeAll}`;
/** "No company leads yet": a kind the export has none of. */
export const categoryNone = (category: LeadCategory) =>
  `No ${categoryWords[category].seeAll} yet`;
export const categorySearch = (category: LeadCategory) =>
  categoryWords[category].search;
export const categorySource = (category: LeadCategory) =>
  categoryWords[category].source;

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
  const register = Object.hasOwn(registers, evidence.table)
    ? registers[evidence.table]
    : undefined;
  const host = hostOf(evidence.url);
  const known = !!register && (host === null || host === register.host);
  // Only the export's own word for a record page makes a record link.
  const kind = evidence.link_scope === 'record' ? 'record' : 'register';
  // A link the source guard refuses (not HTTPS, say) is shown unlinked.
  let url: string | null = null;
  try {
    url = evidence.url ? sourceUrl(evidence.url) : null;
  } catch {
    url = null;
  }
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
    url,
    kind,
  };
  if (!known) return base;
  const id = evidence.record_id;
  // The export ends a label with its record ID, or, since the web export
  // dropped OPAX's local row numbers (66d7bf45), a donation with no ID at
  // all. Any other ending is an unknown qualifier below and hides the label.
  const tail =
    [` · local record ${id}`, ` · record ${id}`].find((t) =>
      evidence.label.endsWith(t),
    ) ?? '';
  const [head, ...qualifiers] = evidence.label
    .slice(0, evidence.label.length - tail.length)
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

/** The directory entry is enough for the list; named rows need its profile. */
export type LeadAgency = Pick<ReturnType<typeof decodeAgency>, 'id' | 'name'> &
  Partial<Pick<ReturnType<typeof decodeAgency>, 'suppliers'>> & {
    aliases?: Record<string, string[]>;
  };

const supplierNameKey = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU');

/** Only supplier records actually held by this agency can be opened. */
export function leadSupplierRoute(row: ChartRow, agency: LeadAgency | null) {
  if (!agency) return null;
  if (row.other) return agencyListRoute(agency.id, 'suppliers', agency.name);
  if (!row.supplierPath) return null;
  // Preserve legal-name distinctions, while allowing the exports' casing
  // and whitespace to differ. An ambiguous name cannot identify a record.
  const matches = agency.suppliers?.filter((supplier) =>
    [supplier.name, ...(agency.aliases?.[supplier.id] ?? [])].some(
      (name) => supplierNameKey(name) === supplierNameKey(row.name),
    ),
  );
  const supplier = matches?.length === 1 ? matches[0] : null;
  return supplier?.organisation
    ? moneyRecordRoute({ rid: supplier.id, agency: agency.id }, supplier.name)
    : null;
}

/** Recorded aliases, keyed by the stable ids also held in the agency file. */
export function decodeLeadSupplierAliases(value: unknown) {
  const profiles = object(object(value).profiles);
  return Object.fromEntries(
    Object.entries(profiles).map(([id, value]) => {
      const profile = object(value);
      if (!/^s-[a-f0-9]{20}$/.test(id) || profile.id !== id) invalid();
      return [
        id,
        [
          ...array(nonempty)(profile.aliases),
          ...(optional(array(nonempty))(profile.lookup_names) ?? []),
        ],
      ];
    }),
  );
}

/**
 * Agency files omit source aliases. For an unresolved name, check a small
 * set of same-word candidates in the already allowed supplier shards.
 * This only chooses files to read; a recorded alias must still match in
 * full before a row gets a destination. Avoid a broad directory download.
 */
export function leadSupplierAliasPaths(lead: LeadView, agency: LeadAgency) {
  if (
    lead.category !== 'procurement_concentration' ||
    lead.comparison.type !== 'concentration'
  )
    return [];
  const paths = new Set<string>();
  for (const row of lead.comparison.rows) {
    if (row.other || !row.supplierPath || leadSupplierRoute(row, agency))
      continue;
    const firstWord = supplierNameKey(row.name).split(' ')[0];
    const candidates =
      agency.suppliers?.filter(
        (supplier) =>
          supplier.organisation &&
          supplierNameKey(supplier.name).split(' ')[0] === firstWord &&
          /^s-[a-f0-9]{20}$/.test(supplier.id),
      ) ?? [];
    if (candidates.length > 4) continue;
    for (const supplier of candidates)
      paths.add(`/suppliers/${supplier.id.slice(2, 4)}.json`);
  }
  return [...paths];
}

export type LeadComparison =
  | {
      type: 'concentration';
      heading: string;
      /** "38.7% of recorded contract value went to SECURE JOURNEYS PTY LTD." */
      takeaway: string;
      chartTitle: string;
      total: number;
      /** The figure's label: "in contracts from this agency, started 2015 to 2026". */
      figureLabel: string;
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

// The lead's own span in figure words: "started 2015 to 2026" for contract
// start years, "1998–99 to 2024–25" for financial years.
function spanText(chart: NonNullable<DiscoverySignal['chart']>) {
  const period = chart.period;
  if (!period?.from || !period.to) return 'all available years';
  if (period.kind === 'financial_year') {
    const from = period.from.replace('-', '–');
    const to = period.to.replace('-', '–');
    return from === to ? from : `${from} to ${to}`;
  }
  const from = period.from.slice(0, 4);
  const to = period.to.slice(0, 4);
  return from === to ? `started ${from}` : `started ${from} to ${to}`;
}

/**
 * The comparison for the signal's own family. A concentration without its
 * chart has nothing to compare and is null: the web would describe it as a
 * name found in both sets of records, which it is not.
 */
function comparisonFor(
  signal: DiscoverySignal,
  category: LeadCategory,
): LeadComparison | null {
  const chart = signal.chart;
  const contracts = category === 'procurement_concentration';
  if (category !== 'donor_contract_overlap') {
    if (!chart) return null;
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
        : 'Who gave to the party?',
      total: chart.group_total,
      figureLabel: `${contracts ? 'in contracts from this agency' : 'in party receipts'}, ${spanText(chart)}`,
      rows,
      note: `${formatCount(chart.record_count)} ${contracts ? 'contracts' : 'receipts'} · ${periodText(chart)}. ${contracts ? 'Recorded contract values, not the agency’s whole budget.' : 'Party receipts include more than gifts.'}${missing ? ` ${counted(missing, 'record', 'records')} ${missing === 1 ? 'has' : 'have'} no valid date.` : ''}`,
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

// Who publishes the records behind each kind of lead (coverage.receipt_scope;
// the contracts corpus is AusTender).
const citations: Record<LeadCategory, string[]> = {
  procurement_concentration: ['AusTender'],
  recipient_concentration: ['AEC annual returns'],
  donor_contract_overlap: ['AEC annual returns', 'AusTender'],
};

/**
 * A signal as a lead, or null when the app cannot show it faithfully: a
 * category it does not know, or a concentration without its chart.
 */
export function leadFor(signal: DiscoverySignal): LeadView | null {
  if (!isLeadCategory(signal.category)) return null;
  const category = signal.category;
  const comparison = comparisonFor(signal, category);
  if (!comparison) return null;
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
    comparison,
  };
}

/**
 * The one figure a lead's card shows (design pass 5, P2-13): the export's
 * first money figure, in its own words. A concentration's title and sentence
 * already state its share, so its card shows the largest value; a company in
 * both shows its first flow, and its sentence and comparison give the other.
 * Every figure is on the comparison.
 */
export function leadFigure(lead: Pick<LeadView, 'metrics'>) {
  return (
    lead.metrics.find((metric) => metric.format === 'currency') ??
    lead.metrics[0] ??
    null
  );
}

export type LeadFilter = 'all' | LeadCategory;
export type LeadSort = 'value' | 'share';
const shareOf = (signal: DiscoverySignal) =>
  Number(signal.chart?.participants[0]?.share ?? 0);
// A company in both sorts by its party receipts, the figure its card shows,
// so a list read top to bottom is largest first.
const totalOf = (signal: DiscoverySignal) =>
  Number(
    signal.chart?.group_total ?? metricValue(signal, 'Recorded party receipts'),
  );
const nameOf = (signal: DiscoverySignal) =>
  signal.chart?.group_label ?? signal.entity;

/**
 * The leads to show. "All" keeps the export's own order (its methodology:
 * "Cards alternate signal families and rank within each family by recorded
 * value"). A category sorts as the web does: by total (contract value for
 * companies in both) or, for concentrations, by the largest share; ties by
 * name. Signals the app cannot show faithfully (leadFor) are left out.
 */
export function leadsFor(
  discovery: Discovery,
  filter: LeadFilter = 'all',
  sort: LeadSort = 'value',
): LeadView[] {
  let pairs = discovery.signals.flatMap((signal) => {
    const lead = leadFor(signal);
    return lead ? [{ signal, lead }] : [];
  });
  if (filter !== 'all') {
    const byShare = sort === 'share' && filter !== 'donor_contract_overlap';
    pairs = pairs
      .filter(({ signal }) => signal.category === filter)
      .sort(
        ({ signal: a }, { signal: b }) =>
          (byShare ? shareOf(b) - shareOf(a) : totalOf(b) - totalOf(a)) ||
          nameOf(a).localeCompare(nameOf(b)),
      );
  }
  return pairs.map(({ lead }) => lead);
}

/** "60 leads", "28 agencies", "1 party". */
export function leadCount(count: number, filter: LeadFilter) {
  if (filter === 'all') return `${counted(count, 'lead', 'leads')}`;
  const words = categoryWords[filter];
  return `${formatCount(count)} ${count === 1 ? words.one : words.many}`;
}

/** The web's "About these numbers" lede (renderDiscoveryPage). */
export function aboutLede(discovery: Discovery) {
  return `A concentration is a reason to look closer, not proof of wrongdoing. This page covers ${counted(discovery.coverage.contracts, 'contract', 'contracts')} and ${formatCount(discovery.coverage.donations)} party receipts.`;
}
/** The export's calendar date, in UTC as the web reads it. */
export const discoveryAsOf = (discovery: Discovery) =>
  (discovery.coverage.snapshot_at ?? discovery.generated_at).slice(0, 10);

/** A chart row read aloud: "SECURE JOURNEYS PTY LTD, 2.3 billion dollars, 38.7 percent". */
export function chartRowLabel(row: ChartRow) {
  return `${row.name}, ${moneyAccessibilityLabel(row.value, true)}, ${formatPercent(row.share).slice(0, -1)} percent`;
}

/**
 * The leads whose subject is one organisation or party, for the "More"
 * rows on its money record: matched on the lead's entity or its chart's
 * group, never on words in the sentence.
 */
export function leadsAbout(
  discovery: Discovery,
  name: string,
): { id: string; title: string }[] {
  const wanted = normaliseOrganisation(name);
  if (!wanted) return [];
  return leadsFor(discovery)
    .filter((lead) => {
      const signal = discovery.signals.find((s) => s.id === lead.id);
      // A concentration's subject is its group (the agency or party); its
      // entity is the largest participant. A company in both is its entity.
      const subjects = [
        lead.category === 'donor_contract_overlap'
          ? lead.entity
          : signal?.chart?.group_label,
      ].filter((value): value is string => !!value);
      return subjects.some(
        (subject) =>
          normaliseOrganisation(subject) === wanted ||
          (lead.category === 'recipient_concentration' &&
            samePartyLabel(subject, name)),
      );
    })
    .map((lead) => ({ id: lead.id, title: lead.title }));
}

// The card's figure label, in plain words (specs/money.md 2.9).
const figureLabels: Record<string, string> = {
  'Recorded party receipts': 'in party receipts',
  'Largest supplier value': 'to the largest supplier',
  'Largest donor value': 'from the largest donor',
};
/** A lead card's one figure: "$2.3bn", "to the largest supplier". */
export function leadCardFigure(lead: Pick<LeadView, 'metrics'>) {
  const metric = leadFigure(lead);
  if (!metric) return null;
  const value = Number(metric.value);
  const money = metric.format === 'currency' && Number.isFinite(value);
  return {
    text: money ? formatMoneyCompact(value) : String(metric.value),
    spoken: money ? moneyAccessibilityLabel(value, true) : String(metric.value),
    label:
      figureLabels[metric.label] ??
      metric.label.charAt(0).toLocaleLowerCase('en-AU') + metric.label.slice(1),
  };
}

// Pipeline words in a caveat: an identifier with an underscore or "ingestion".
const pipeline = /\b\w+_\w+\b|ingestion/i;
const knownCaveats: Record<string, string> = {
  'Annual party receipts are not all verified gifts; source donation_type=direct is an ingestion classification. State, election and referendum disclosures are excluded.':
    'Annual party receipts include more than gifts. State, election and referendum disclosures are not included.',
};
/**
 * A caveat in plain language (specs/money.md 2.10): the known pipeline
 * strings replaced, any other clause naming a pipeline identifier dropped.
 */
export function plainCaveat(caveat: string): string {
  const known = knownCaveats[caveat];
  if (known) return known;
  if (!pipeline.test(caveat)) return caveat;
  return caveat
    .split(/(?<=\.)\s+/)
    .map((sentence) => {
      if (!pipeline.test(sentence)) return sentence;
      const at = sentence.search(/[;,]/);
      if (at < 0) return '';
      const head = sentence.slice(0, at).trim();
      return pipeline.test(head) ? '' : `${head}.`;
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * The root's three sections in their fixed order, each with its leads
 * largest total first. A kind with no leads is left out.
 */
export function leadSections(discovery: Discovery) {
  return leadCategories
    .map((category) => ({ category, leads: leadsFor(discovery, category) }))
    .filter((section) => section.leads.length);
}

/**
 * Leads matching a search, across kinds in the fixed order, largest total
 * first within each, matched on the subject's name, the chart's group and
 * the lead's own sentence.
 */
export function searchLeads(
  discovery: Discovery,
  query: string,
  category?: LeadCategory,
  sort: LeadSort = 'value',
) {
  const words = query
    .toLocaleLowerCase('en-AU')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const pool = category
    ? leadsFor(discovery, category, sort)
    : leadSections(discovery).flatMap((section) => section.leads);
  if (!words.length) return pool;
  return pool.filter((lead) => {
    const signal = discovery.signals.find((s) => s.id === lead.id);
    const text = [lead.entity, lead.title, signal?.chart?.group_label]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('en-AU');
    return words.every((word) => text.includes(word));
  });
}

/** The unreadable count, for a source sheet's notes. */
export function leadsHiddenNotes(discovery: Discovery): string[] {
  const unreadable =
    discovery.unreadable +
    discovery.signals.length -
    leadsFor(discovery).length;
  return unreadable
    ? [
        `${leadCount(unreadable, 'all')} could not be read and ${unreadable === 1 ? 'is' : 'are'} not shown.`,
      ]
    : [];
}
