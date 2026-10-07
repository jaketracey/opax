import { useEffect, useState } from 'react';
import { peopleDepth } from '../../api/runtime';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LoadingState,
  Section,
  SourceLink,
  Text,
  errorMessage,
} from '../../design/primitives';
import { formatCount, formatDate, formatMoney } from '../../design/format';
import { ReadDate } from './Sections';
import { receiptsSeries } from './model';

export function PartyAccess({ name }: { name: string }) {
  const [record, setRecord] = useState<Awaited<
      ReturnType<typeof peopleDepth.access>
    > | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    peopleDepth
      .access()
      .then((r) => {
        if (active) {
          setRecord(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const d = record?.data.donors[name];
  return (
    <Section title="Meetings and lobbyists" testID="party-access">
      {error ? (
        <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
      ) : !record ? (
        <LoadingState label="Loading meetings and lobbyists" />
      ) : (
        <Group>
          <Heading level={3}>Who they met</Heading>
          {d?.meetings?.length ? (
            <Group>
              {d.meetings.map((m, i) => (
                <Group key={i} gap={4}>
                  <Text wordSafe variant="strong">
                    {m.minister}
                  </Text>
                  <Text wordSafe variant="metadata">
                    {m.jurisdiction}
                    {m.date ? ' · ' + formatDate(m.date) : ''}
                  </Text>
                  {m.purpose ? <Text wordSafe>{m.purpose}</Text> : null}
                </Group>
              ))}
              <Text wordSafe variant="fine">
                {formatCount(d.meetings_total ?? d.meetings.length)} disclosed
                meetings
                {(d.meetings_total ?? 0) > d.meetings.length
                  ? ', newest ' + d.meetings.length + ' shown'
                  : ''}
                .
              </Text>
            </Group>
          ) : (
            <EmptyState message="No disclosed meetings match this party in this export." />
          )}
          <Heading level={3}>Registered lobbying client of</Heading>
          {d?.lobbyists?.length ? (
            d.lobbyists.map((l, i) => (
              <Group key={i} gap={4}>
                <Text wordSafe variant="strong">
                  {l.firm}
                </Text>
                <Text wordSafe variant="metadata">
                  {l.jurisdiction}
                  {l.registered ? ' · from ' + formatDate(l.registered) : ''}
                  {l.ceased ? ' · ceased' : ''}
                </Text>
              </Group>
            ))
          ) : (
            <EmptyState message="No registered lobbying client match is held for this party in this export." />
          )}
          {(d?.lobbyists_total ?? 0) > (d?.lobbyists?.length ?? 0) ? (
            <Text wordSafe variant="fine">
              {d!.lobbyists_total} registered firms, {d!.lobbyists!.length}{' '}
              shown.
            </Text>
          ) : null}
          <Text wordSafe variant="fine">
            From NSW and QLD ministerial diary disclosures and the six lobbyist
            registers; name matching is exact after normalisation, so a company
            using several trading names may be under-counted.
          </Text>
          <ReadDate
            record={record}
            citation="NSW and QLD ministerial diary disclosures; six lobbyist registers"
          />
        </Group>
      )}
    </Section>
  );
}
export function PartyFunding({ name }: { name: string }) {
  const [record, setRecord] = useState<Awaited<
      ReturnType<typeof peopleDepth.funding>
    > | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [all, setAll] = useState(false);
  useEffect(() => {
    let active = true;
    peopleDepth
      .funding()
      .then((r) => {
        if (active) {
          setRecord(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const p = record?.data.parties[name],
    rows = receiptsSeries(p?.returns),
    d = p?.debts,
    b = p?.benefits;
  return (
    <Group>
      <Section title="Receipts on the return" testID="party-annual-returns">
        {error ? (
          <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
        ) : !record ? (
          <LoadingState label="Loading annual returns" />
        ) : (
          <Group>
            {!rows.length ? (
              <EmptyState message="No annual return receipts are held for this party." />
            ) : null}
            {rows.length > 10 ? (
              <Button
                label={
                  all
                    ? 'Show newest 10 years'
                    : 'Show all ' + rows.length + ' years'
                }
                expanded={all}
                testID="party-all-years"
                onPress={() => setAll((v) => !v)}
              />
            ) : null}
            {(all ? rows : rows.slice(0, 10)).map((r) => (
              <Group key={r.year} gap={8} testID={'party-return-' + r.year}>
                <Heading level={3}>{r.year}</Heading>
                <KeyValueList
                  items={[
                    { label: 'Receipts', value: formatMoney(r.receipts) },
                    {
                      label: 'Itemised donations',
                      value: formatMoney(r.donations),
                    },
                    {
                      label: 'Itemised other receipts',
                      value: formatMoney(r.other),
                    },
                    {
                      label: 'Not itemised',
                      value: formatMoney(r.notItemised),
                    },
                    {
                      label: 'Branches summed',
                      value: formatCount(r.branches),
                    },
                  ]}
                />
              </Group>
            ))}
            <Text wordSafe variant="fine">
              “Not itemised” is receipts minus the sums itemised as donations
              and as other receipts on the same return; the AEC does not require
              receipts under the disclosure threshold to be itemised. Public
              election funding is left where the return puts it.
            </Text>
            {rows.some((r) => r.clamped) ? (
              <Text wordSafe variant="fine">
                {rows.filter((r) => r.clamped).length} historic rows report
                itemised components above the headline receipts total; their
                components are clamped to that total.
              </Text>
            ) : null}
            <ReadDate
              record={record}
              citation={
                record.data.meta.source + ', ' + record.data.meta.licence
              }
            />
            <SourceLink
              citation="AEC annual returns"
              url={record.data.meta.register_url}
              kind="register"
            />
          </Group>
        )}
      </Section>
      <Section title="Debts and other funding" testID="party-debts">
        {record ? (
          <Group>
            {d ? (
              <Group>
                <KeyValueList
                  items={[
                    {
                      label:
                        'Owed at 30 June ' + (Number(d.year.slice(0, 4)) + 1),
                      value: formatMoney(d.total),
                    },
                    {
                      label: 'Of it to banks and other financial institutions',
                      value: formatMoney(d.financial_total),
                    },
                    {
                      label: 'Creditors listed',
                      value: formatCount(d.lenders),
                    },
                  ]}
                />
                <Heading level={3}>Largest creditors, {d.year}</Heading>
                {d.top.map((l, i) => (
                  <Group key={i} gap={4}>
                    <Text wordSafe variant="strong">
                      {l.name}
                      {l.type === 'Financial' ? ' (financial institution)' : ''}
                    </Text>
                    <Text wordSafe variant="figureInline">
                      {formatMoney(l.amount)}
                    </Text>
                  </Group>
                ))}
                <Heading level={3}>Owed at each 30 June</Heading>
                <KeyValueList
                  items={d.by_year.map(([year, total]) => ({
                    label: year,
                    value: formatMoney(total),
                  }))}
                />
                <Text wordSafe variant="fine">
                  Year-end balances, not new borrowing; a year with no debt
                  itemised shows nothing.
                </Text>
              </Group>
            ) : (
              <EmptyState message="No itemised debt record is held for this party." />
            )}
            {b ? (
              <Text wordSafe>
                {formatMoney(b.total)} in discretionary benefits in {b.year}
                {b.top.length
                  ? ': ' +
                    b.top
                      .slice(0, 3)
                      .map((t) => t.name + ' ' + formatMoney(t.amount))
                      .join(', ')
                  : ''}
                . These are government payments other than public election
                funding, as listed on the return.
              </Text>
            ) : null}
            <Text wordSafe variant="fine">
              Debts are the balances the party’s branches listed as owed at 30
              June on their own AEC annual returns, all branches summed: bank
              loans sit beside trade creditors and tax owed, and a balance is
              not new borrowing. Creditors under the disclosure threshold are
              not itemised. Source: AEC Transparency Register, CC BY 4.0.
            </Text>
            <ReadDate
              record={record}
              citation="AEC Transparency Register, CC BY 4.0"
            />
            <SourceLink
              citation="Open the register"
              url={record.data.meta.register_url}
              kind="register"
            />
          </Group>
        ) : error ? (
          <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
        ) : (
          <LoadingState label="Loading debts and creditors" />
        )}
      </Section>
    </Group>
  );
}
