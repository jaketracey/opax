import { router } from 'expo-router';
import {
  BigFigure,
  Disclosure,
  Group,
  KeyValueList,
  LinkRow,
  OpaxWebLink,
  RowList,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatPercent,
  moneyAccessibilityLabel,
} from '../../design/format';
import { moneyRoute, partyRoute } from '../../navigation/routes';
import { RecordBlock } from '../your-mp/Evidence';
import type { ProfileView } from '../your-mp/model';

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
    <RecordBlock
      title="Pay for the posts held"
      id={id}
      block={block}
      retry={retry}
      accent="money"
      partialMissing="No readable record was found for this person. Some rows in the latest public export were unreadable."
      unlinked="This release does not link this person's salary entitlements. See the record on opax.com.au."
      missing="No covered federal salary entitlement is held for this person. State pay and service before 7 December 1999 are outside this series."
      info={(p) =>
        p
          ? {
              title: 'About these entitlements',
              notes: [p.method, ...p.notCovered.map((note) => note.text)],
            }
          : null
      }
    >
      {(p) => (
        <Group>
          {p.person.now ? (
            <>
              <BigFigure
                value={formatMoney(p.person.now.salary)}
                spoken={moneyAccessibilityLabel(p.person.now.salary)}
                label="a year"
                accent="money"
                testID={`${id}-salary`}
              />
              <Text wordSafe variant="strong">
                {p.person.now.post}
                {p.person.now.assumed
                  ? ' (if named in the Opposition Leader’s notice)'
                  : ''}
              </Text>
              <Text wordSafe variant="metadata">
                Base salary {formatMoney(p.base.amount)}
                {p.person.now.pct
                  ? ` plus a ${formatPercent(p.person.now.pct, Number.isInteger(p.person.now.pct) ? 0 : 1)} loading`
                  : ''}
                .
              </Text>
              <Text wordSafe variant="caption">
                Post held since {formatDate(p.person.now.since)}
              </Text>
            </>
          ) : (
            <Text wordSafe>
              No current pay rate is held. Historical entitlements are listed
              below.
            </Text>
          )}
          <Text wordSafe variant="caption">
            These are entitlements set by instrument, not payslips.
          </Text>
          <RowList>
            <Disclosure
              label="Salary by financial year"
              value={formatCount(p.person.by_year.length)}
              testID={`${id}-years`}
            >
              {() => (
                <KeyValueList
                  items={p.person.by_year.map(([year, amount]) => ({
                    label: formatFinancialYear(year),
                    value: formatMoney(amount),
                  }))}
                />
              )}
            </Disclosure>
            <Disclosure
              label="Posts held"
              value={formatCount(p.person.spells.length)}
              testID={`${id}-posts`}
            >
              {() => (
                <RowList>
                  {[...p.person.spells]
                    .reverse()
                    .map(([from, to, post, pct, salary], i) => (
                      <Group key={i} gap={rhythm.line}>
                        <Text wordSafe variant="strong">
                          {post}
                        </Text>
                        <Text wordSafe variant="caption">
                          {formatDate(from)} to{' '}
                          {to ? formatDate(to) : 'present'}
                        </Text>
                        <Text wordSafe variant="figureInline" tone="moneyInk">
                          {formatMoney(salary)} a year
                        </Text>
                        <Text wordSafe variant="metadata">
                          {formatPercent(pct, Number.isInteger(pct) ? 0 : 1)}{' '}
                          loading at the end of this spell
                        </Text>
                      </Group>
                    ))}
                </RowList>
              )}
            </Disclosure>
          </RowList>
        </Group>
      )}
    </RecordBlock>
  );
}

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
  const linkID =
    id === 'person-receipts' ? 'person-party-receipts' : `${id}-link`;
  return (
    <RecordBlock
      title="Party receipts"
      id={id}
      block={block}
      retry={retry}
      accent="money"
      partialMissing="No readable record was found for this person. Some rows in the latest public export were unreadable."
      missing="No receipts projection is linked for this person's party."
      unlinked="This release does not link party receipts for this person's party. See the record on opax.com.au."
    >
      {(p) => (
        <Group gap={rhythm.tight}>
          <Text wordSafe variant="metadata">
            {p.caption}
          </Text>
          <RowList>
            {p.party ? (
              <LinkRow
                title="Party receipts"
                detail={p.party}
                icon="banknote"
                accent="money"
                testID={linkID}
                onPress={() => router.push(partyRoute(p.party!))}
              />
            ) : (
              <OpaxWebLink
                label="Party receipts"
                path={p.url}
                testID={linkID}
              />
            )}
            <LinkRow
              title="Money map"
              icon="point.3.connected.trianglepath.dotted"
              accent="money"
              onPress={() => router.push(moneyRoute(p.party, jurisdiction))}
              testID={
                id === 'person-receipts'
                  ? 'person-money-map'
                  : `${id}-money-map`
              }
            />
          </RowList>
        </Group>
      )}
    </RecordBlock>
  );
}
