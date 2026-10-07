import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import {
  Button,
  Group,
  KeyValueList,
  OpaxWebLink,
  Text,
} from '../../design/primitives';
import {
  formatDate,
  formatFinancialYear,
  formatMoney,
  formatPercent,
} from '../../design/format';
import { partyRoute } from '../../navigation/routes';
import { RecordBlock } from '../your-mp/Evidence';
import type { ProfileView } from '../your-mp/model';
function Disclosure({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Group gap={8}>
      <Button
        label={open ? 'Hide ' + label.toLowerCase() : label}
        expanded={open}
        testID={id}
        onPress={() => setOpen((v) => !v)}
      />
      {open ? children() : null}
    </Group>
  );
}
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
      partialMissing="No readable record was found for this person. Some rows in the latest public export were unreadable."
      block={block}
      unlinked="This release does not link this person's salary entitlements. See the record on opax.com.au."
      missing="No covered federal salary entitlement is held for this person. State pay and service before 7 December 1999 are outside this series."
      retry={retry}
    >
      {(p) => (
        <Group>
          {p.person.now ? (
            <>
              <Text wordSafe variant="figureInline">
                {formatMoney(p.person.now.salary)} a year
              </Text>
              <Text wordSafe>
                {p.person.now.post}
                {p.person.now.assumed
                  ? ' (if named in the Opposition Leader’s notice)'
                  : ''}
              </Text>
              <Text wordSafe>
                Base salary {formatMoney(p.base.amount)}
                {p.person.now.pct
                  ? ` plus a ${formatPercent(p.person.now.pct, Number.isInteger(p.person.now.pct) ? 0 : 1)} loading`
                  : ''}
                .
              </Text>
              <Text wordSafe variant="metadata">
                Post held since {formatDate(p.person.now.since)}
              </Text>
            </>
          ) : (
            <Text wordSafe>
              No current pay rate is held. Historical entitlements are listed
              below.
            </Text>
          )}
          <Text wordSafe>
            These are entitlements set by instrument, not payslips.
          </Text>
          <Text wordSafe>{p.method}</Text>
          <Disclosure label="Salary by financial year" id={`${id}-years`}>
            {() => (
              <KeyValueList
                items={p.person.by_year.map(([year, amount]) => ({
                  label: formatFinancialYear(year),
                  value: formatMoney(amount),
                }))}
              />
            )}
          </Disclosure>
          <Disclosure label="Posts held" id={`${id}-posts`}>
            {() => (
              <Group>
                {[...p.person.spells]
                  .reverse()
                  .map(([from, to, post, pct, salary], i) => (
                    <Group key={i} gap={4}>
                      <Text wordSafe variant="strong">
                        {post}
                      </Text>
                      <Text wordSafe variant="metadata">
                        {formatDate(from)} to {to ? formatDate(to) : 'present'}
                      </Text>
                      <Text wordSafe>
                        {formatMoney(salary)} a year ·{' '}
                        {formatPercent(pct, Number.isInteger(pct) ? 0 : 1)}{' '}
                        loading at the end of this spell
                      </Text>
                    </Group>
                  ))}
              </Group>
            )}
          </Disclosure>
          <Disclosure label="Pay coverage" id={`${id}-coverage`}>
            {() => (
              <Group>
                {p.notCovered.map((note) => (
                  <Text wordSafe key={note.id}>
                    {note.text}
                  </Text>
                ))}
              </Group>
            )}
          </Disclosure>
        </Group>
      )}
    </RecordBlock>
  );
}
export function PartyReceiptsBlock({
  block,
  retry,
  id,
}: {
  block: ProfileView['blocks']['partyReceipts'];
  retry: () => void;
  id: string;
}) {
  return (
    <RecordBlock
      title="Party receipts"
      id={id}
      partialMissing="No readable record was found for this person. Some rows in the latest public export were unreadable."
      block={block}
      missing="No receipts projection is linked for this person's party."
      unlinked="This release does not link party receipts for this person's party. See the record on opax.com.au."
      retry={retry}
    >
      {(p) => (
        <Group>
          <Text wordSafe>{p.caption}</Text>
          {p.party ? (
            <Button
              label="Party receipts"
              onPress={() => router.push(partyRoute(p.party!))}
              testID={
                id === 'person-receipts'
                  ? 'person-party-receipts'
                  : `${id}-link`
              }
            />
          ) : (
            <OpaxWebLink
              label="Party receipts"
              path={p.url}
              testID={
                id === 'person-receipts'
                  ? 'person-party-receipts'
                  : `${id}-link`
              }
            />
          )}
        </Group>
      )}
    </RecordBlock>
  );
}
