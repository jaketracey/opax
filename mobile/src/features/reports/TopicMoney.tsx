import type { ComponentProps } from 'react';
import { FigureBlock } from '../../design/record';
import { InsetGroup, Section } from '../../design/layout';
import { LinkRow, ValueRow } from '../../design/rows';
import {
  formatMoney,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import { byPartyGroup } from '../../design/party-groups';
import { moneyRoute } from '../../navigation/routes/money-map';
import { moneyRows, topicMoneyTitles, type IndustryMoney } from './model';
import type { ReadMeta } from './parts';
import {
  AEC_FLOOR_NOTE,
  MONEY_CAVEAT,
  MONEY_CITATION,
  moneyYears,
} from './topic-copy';

/** The money graph's donor industries beside each topic that has one. */
export const topicIndustries: Readonly<Record<string, readonly string[]>> = {
  gambling: ['gambling'],
  'financial-services': ['finance'],
  'mining-energy': ['mining'],
  'property-construction': ['property'],
  'media-communications': ['media'],
  'hospitality-alcohol': ['alcohol'],
  agriculture: ['agriculture'],
  'unions-workplace': ['unions'],
};
export const hasTopicMoney = (slug: string) =>
  !!topicIndustries[slug] && !!topicMoneyTitles[slug];

/**
 * Donations beside the debate (specs/search.md 5.5): what the industry
 * disclosed to parties, as a comparison and never as a cause.
 */
export function TopicMoney({
  slug,
  money,
  meta,
}: {
  slug: string;
  money: IndustryMoney;
  meta: ReadMeta;
}) {
  const data = moneyRows(money, [...(topicIndustries[slug] ?? [])]);
  const total = data.donors.reduce((n, d) => n + d.total, 0);
  const rows = byPartyGroup(
    data.rows.filter((r) => r.money > 0),
    (r) => r.party,
    { context: 'money' },
  );
  if (!data.donors.length || total <= 0) return null;
  const years = moneyYears(money.meta.coverage);
  const label = `disclosed to political parties${years ? `, ${years}` : ''}`;
  const figure: ComponentProps<typeof FigureBlock> = {
    value: formatMoneyCompact(total),
    label,
    accessibilityLabel: `${moneyAccessibilityLabel(total, true)} ${label}`,
    caveat: MONEY_CAVEAT,
    source: {
      asOf: meta.asOf ?? money.meta.generated,
      savedAt: meta.savedAt,
      citation: MONEY_CITATION,
      notes: [AEC_FLOOR_NOTE, money.meta.methodology, ...money.meta.exclusions],
      testID: 'topic-money-source',
    },
    testID: 'topic-money-total',
  };
  return (
    <Section title={topicMoneyTitles[slug]} testID="topic-money-section">
      <FigureBlock {...figure} />
      {rows.length ? (
        <InsetGroup testID="topic-money-parties">
          {rows.map((row) => (
            <ValueRow
              key={row.party}
              label={row.party}
              value={formatMoney(row.money)}
              testID={`topic-money-party-${row.party}`}
            />
          ))}
        </InsetGroup>
      ) : null}
      <InsetGroup>
        <LinkRow
          title="Open the money map"
          symbol="dollarsign.circle"
          href={moneyRoute()}
          testID="topic-money-map"
        />
      </InsetGroup>
    </Section>
  );
}
