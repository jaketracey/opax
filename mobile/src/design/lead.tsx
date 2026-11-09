import {
  formatCount,
  formatMoney,
  formatPercent,
  moneyAccessibilityLabel,
} from './format';

// The shape of one signal in /discovery.json.
export interface LeadMetric {
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent';
}
/**
 * One example record behind a lead, read from the export's evidence label
 * (features/leads/model.ts). A label that could not be read has no amount,
 * names or detail, and shows only its register link.
 */
export interface LeadEvidence {
  amount: string | null;
  amountSpoken: string | null;
  from: string | null;
  to: string | null;
  detail: string | null;
  /** Who holds the record: "AusTender register". */
  register: string;
  /** The register's own ID to look up: "record CN3407266". */
  record: string | null;
  url: string | null;
  kind: 'register' | 'record';
}
export interface Lead {
  id: string;
  title: string;
  summary?: string;
  metrics: LeadMetric[];
  evidence: LeadEvidence[];
  caveats: string[];
}

/** A metric as shown and as read: "$76,984,493", "76,984,493 dollars". */
export function leadMetricText(metric: LeadMetric): {
  text: string;
  spoken: string;
} {
  if (metric.format === 'currency')
    return {
      text: formatMoney(metric.value),
      spoken: moneyAccessibilityLabel(metric.value),
    };
  if (metric.format === 'percent') {
    const text = formatPercent(metric.value);
    return { text, spoken: `${text.slice(0, -1)} percent` };
  }
  const text = formatCount(metric.value);
  return { text, spoken: text };
}
