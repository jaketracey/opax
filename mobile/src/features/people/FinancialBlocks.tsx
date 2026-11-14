import { StyleSheet, View } from 'react-native';
import { Disclosure } from '../../design/disclosure';
import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatPercent,
  formatYearRange,
  moneyAccessibilityLabel,
} from '../../design/format';
import { Group } from '../../design/layout';
import { isPartyLabel } from '../../design/party';
import { LinkRow, ValueRow } from '../../design/rows';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import {
  expenseGlossaryRoute,
  moneyRoute,
  partyRoute,
} from '../../navigation/routes';
import { NewDot } from '../follows/NewDot';
import type { ProfileView } from '../your-mp/model';
import { ProfileBlock } from './Block';
import { payRateLine } from './model';

/** "Labor's", "The Nationals'": the possessive follows the name. */
export const possessive = (name: string) =>
  /s$/i.test(name) ? `${name}’` : `${name}’s`;

/** A block's amount: `figure` role, money ink, its line under it. */
export function Amount({
  amount,
  line,
  testID,
}: {
  amount: number;
  line: string;
  testID?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${moneyAccessibilityLabel(amount)}, ${line}`}
      testID={testID}
    >
      <Text wordSafe variant="figure" tone="moneyInk" tabular>
        {formatMoney(amount)}
      </Text>
      <Text wordSafe variant="secondary">
        {line}
      </Text>
    </View>
  );
}

/**
 * Pay (people.md 2.1): the annual figure dated by the rate's own effective
 * date ("a year as Prime Minister, rate from 1 Jul 2026"), never the date
 * the post began; the one standing caveat; the years and the posts, each
 * post with its own dates. Arithmetic and qualifiers live in the sheet.
 */
export function PayBlock({
  block,
  retry,
  id,
}: {
  block: ProfileView['blocks']['pay'];
  retry: () => void;
  id: string;
}) {
  return (
    <ProfileBlock
      title="Pay"
      id={id}
      block={block}
      retry={retry}
      skeleton="figure"
      licenceDataset="pay"
      about={(p) =>
        p
          ? {
              title: 'Pay',
              notes: [
                p.person.now?.assumed
                  ? 'The post is shown as named in the Opposition Leader’s notice.'
                  : null,
                p.person.now
                  ? `Base salary ${formatMoney(p.base.amount)}${
                      p.person.now.pct
                        ? ` plus a ${formatPercent(p.person.now.pct, Number.isInteger(p.person.now.pct) ? 0 : 1)} loading`
                        : ''
                    }.`
                  : null,
                payRateLine(p).dated
                  ? null
                  : 'The date this rate took effect is not published in this record.',
                p.method,
                ...p.notCovered.map((note) => note.text),
              ],
            }
          : null
      }
    >
      {(p) => (
        <Group>
          {p.person.now ? (
            <Amount
              amount={p.person.now.salary}
              line={payRateLine(p).line}
              testID={`${id}-salary`}
            />
          ) : (
            <Text wordSafe variant="secondary">
              No current pay. Past entitlements below.
            </Text>
          )}
          <Text wordSafe variant="footnote" testID={`${id}-caveat`}>
            Entitlements set by instrument, not payslips.
          </Text>
          <View>
            <Disclosure
              label="By financial year"
              value={formatCount(p.person.by_year.length)}
              testID={`${id}-years`}
            >
              {() =>
                [...p.person.by_year]
                  .reverse()
                  .map(([year, amount]) => (
                    <ValueRow
                      key={year}
                      label={formatFinancialYear(year)}
                      value={formatMoney(amount)}
                    />
                  ))
              }
            </Disclosure>
            <Disclosure
              label="Posts held"
              value={formatCount(p.person.spells.length)}
              testID={`${id}-posts`}
            >
              {() =>
                [...p.person.spells]
                  .reverse()
                  .map(([from, to, post, , salary], i) => (
                    <LinkRow
                      key={`${from}-${i}`}
                      title={post}
                      detail={
                        to
                          ? `${formatDate(from, 'short')} to ${formatDate(to, 'short')}`
                          : `Since ${formatDate(from, 'short')}`
                      }
                      value={formatMoney(salary)}
                      accessory="none"
                    />
                  ))
              }
            </Disclosure>
          </View>
        </Group>
      )}
    </ProfileBlock>
  );
}

/**
 * Expenses (people.md 2.1, money.md 2.15): the claimed total and the yearly
 * average; no benchmark beside the member's figure (the median is in the
 * sheet's notes). Each category opens Expense categories at that category,
 * with the member's own amount.
 */
export function ExpensesBlock({
  block,
  retry,
  id,
  person,
  newYear = false,
}: {
  block: ProfileView['blocks']['expenses'];
  retry: () => void;
  id: string;
  /** The member's name, so the sheet can name their own amount. */
  person?: string;
  /** A newly published year since the reader last looked (the dot). */
  newYear?: boolean;
}) {
  return (
    <ProfileBlock
      title="Expenses"
      id={id}
      block={block}
      retry={retry}
      skeleton="figure"
      licenceDataset="ipea"
      about={(e) =>
        e
          ? {
              title: 'Expenses',
              notes: [
                `For reference, the median a year across all parliamentarians, ${formatYearRange(e.person.from, e.person.to)}, was ${formatMoney(e.benchmarks.totalMedian)}. Ministers’ and office holders’ claims include travel for that office.`,
                `IPEA coverage starts in April 2017. This record covers ${e.coverage.from} to ${e.coverage.to}.`,
                e.note,
                e.categories
                  ? `Category definitions: ${[
                      e.categories.meta.source,
                      e.categories.meta.updated
                        ? `as at ${formatDate(e.categories.meta.updated)}`
                        : null,
                      e.categories.meta.licence,
                    ]
                      .filter(Boolean)
                      .join(', ')}.`
                  : null,
              ],
            }
          : null
      }
    >
      {(e) => (
        <Group>
          <Amount
            amount={e.person.total}
            line={`claimed ${formatYearRange(e.person.from, e.person.to)}`}
            testID={`${id}-total`}
          />
          <View>
            <ValueRow label="Average a year" value={formatMoney(e.annual)} />
            <Disclosure
              label="By year"
              value={formatCount(e.person.by_year.length)}
              testID={`${id === 'person-expenses' ? 'person' : id}-expense-years`}
            >
              {() =>
                [...e.person.by_year].reverse().map(([year, amount], i) => (
                  <View key={year} style={styles.dotted}>
                    {newYear && i === 0 ? (
                      <NewDot testID={`${id}-new-year`} />
                    ) : null}
                    <View style={styles.grow}>
                      <ValueRow
                        label={String(year)}
                        value={formatMoney(amount)}
                      />
                    </View>
                  </View>
                ))
              }
            </Disclosure>
            <Disclosure
              label="By category"
              value={formatCount(e.person.by_category.length)}
              testID={`${id === 'person-expenses' ? 'person' : id}-expense-categories`}
            >
              {() =>
                e.person.by_category.map(([name, amount], i) => (
                  <ValueRow
                    key={name}
                    label={name}
                    value={formatMoney(amount)}
                    href={expenseGlossaryRoute({
                      category: name,
                      person,
                      amount,
                      years: formatYearRange(e.person.from, e.person.to),
                    })}
                    testID={`${id === 'person-expenses' ? 'person' : id}-expense-category-${i}`}
                  />
                ))
              }
            </Disclosure>
          </View>
        </Group>
      )}
    </ProfileBlock>
  );
}

/**
 * Party receipts (people.md 2.1): two rows, the standing caveat as the first
 * row's fact line, no figure and so no source line. Not drawn for an
 * independent or a label that is not a party; an unlinked party collapses
 * into the page's foot row.
 */
export function PartyReceiptsBlock({
  block,
  retry,
  id,
  jurisdiction,
}: {
  block: ProfileView['blocks']['partyReceipts'];
  jurisdiction?: string;
  retry: () => void;
  id: string;
}) {
  const party = block.data?.party;
  if (block.status !== 'error' && block.status !== 'loading')
    if (!party || !isPartyLabel(party)) return null;
  const prefix = id === 'person-receipts' ? 'person' : id;
  return (
    <ProfileBlock
      title="Party receipts"
      id={id}
      block={block}
      retry={retry}
      sourced={false}
    >
      {(p) =>
        p.party ? (
          <View>
            <LinkRow
              title={`${possessive(p.party)} disclosed receipts`}
              terms
              detail="Party disclosures, not this person’s finances"
              href={partyRoute(p.party, 'receipts')}
              accessibilityHint="Opens the party page"
              testID={`${prefix}-party-receipts`}
            />
            <LinkRow
              title="Money map"
              href={moneyRoute(p.party, jurisdiction)}
              testID={`${prefix}-money-map`}
            />
          </View>
        ) : null
      }
    </ProfileBlock>
  );
}

const styles = StyleSheet.create({
  dotted: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
});
