import { useEffect, useState } from 'react';
import { peopleDepth } from '../../api/runtime';
import {
  BigFigure,
  Disclosure,
  EmptyState,
  ErrorState,
  Group,
  Heading,
  KeyValueList,
  LoadingState,
  RowList,
  Section,
  Text,
  errorMessage,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import {
  formatCount,
  formatDate,
  formatFinancialYear,
  formatMoney,
  moneyAccessibilityLabel,
} from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { ReadDate } from './Sections';
import { receiptsSeries } from './model';

function useStatic<T>(load: () => Promise<T>) {
  const [record, setRecord] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    load()
      .then((next) => {
        if (active) {
          setRecord(next);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [attempt, load]);
  return { record, error, retry: () => setAttempt((n) => n + 1) };
}
const readAccess = () => peopleDepth.access();
const readFunding = () => peopleDepth.funding();

export function PartyAccess({ name }: { name: string }) {
  const { record, error, retry } = useStatic(readAccess);
  const d = record?.data.donors[name];
  return (
    <Section
      title="Meetings and lobbyists"
      accent="people"
      testID="party-access"
    >
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !record ? (
        <LoadingState label="Loading meetings and lobbyists" />
      ) : (
        <Group>
          <Heading level={3}>Who they met</Heading>
          {d?.meetings?.length ? (
            <RowList>
              {d.meetings.map((m, i) => (
                <Group key={i} gap={rhythm.line}>
                  <Text wordSafe variant="strong">
                    {m.minister}
                  </Text>
                  <Text wordSafe variant="fine">
                    {jurisdictionName(m.jurisdiction.toLowerCase()) ??
                      'Jurisdiction not recorded'}
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
            </RowList>
          ) : (
            <EmptyState message="No disclosed meetings match this party in this export." />
          )}
          <Heading level={3}>Registered lobbying client of</Heading>
          {d?.lobbyists?.length ? (
            <RowList>
              {d.lobbyists.map((l, i) => (
                <Group key={i} gap={rhythm.line}>
                  <Text wordSafe variant="strong">
                    {l.firm}
                  </Text>
                  <Text wordSafe variant="fine">
                    {jurisdictionName(l.jurisdiction.toLowerCase()) ??
                      'Jurisdiction not recorded'}
                    {l.registered ? ' · from ' + formatDate(l.registered) : ''}
                    {l.ceased ? ' · ceased' : ''}
                  </Text>
                </Group>
              ))}
            </RowList>
          ) : (
            <EmptyState message="No registered lobbying client match is held for this party in this export." />
          )}
          {(d?.lobbyists_total ?? 0) > (d?.lobbyists?.length ?? 0) ? (
            <Text wordSafe variant="fine">
              {formatCount(d!.lobbyists_total!)} registered firms,{' '}
              {formatCount(d!.lobbyists!.length)} shown.
            </Text>
          ) : null}
          <ReadDate
            record={record}
            citation="NSW and QLD ministerial diary disclosures; six lobbyist registers"
            about={{
              title: 'About these disclosures',
              notes: [
                'From NSW and QLD ministerial diary disclosures and the six lobbyist registers; name matching is exact after normalisation, so a company using several trading names may be under-counted.',
              ],
            }}
            testID="party-access-source"
          />
        </Group>
      )}
    </Section>
  );
}

function ReturnRows({ rows }: { rows: ReturnType<typeof receiptsSeries> }) {
  return (
    <RowList>
      {rows.map((r) => (
        <Disclosure
          key={r.year}
          label={formatFinancialYear(Number(r.year.slice(0, 4)))}
          value={formatMoney(r.receipts)}
          testID={'party-return-' + r.year}
        >
          {() => (
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
                { label: 'Not itemised', value: formatMoney(r.notItemised) },
                { label: 'Branches summed', value: formatCount(r.branches) },
              ]}
            />
          )}
        </Disclosure>
      ))}
    </RowList>
  );
}

export function PartyFunding({ name }: { name: string }) {
  const { record, error, retry } = useStatic(readFunding);
  const p = record?.data.parties[name];
  const rows = receiptsSeries(p?.returns),
    latest = rows[0],
    d = p?.debts,
    b = p?.benefits;
  return (
    <>
      <Section
        title="Receipts on the return"
        accent="money"
        testID="party-annual-returns"
      >
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : !record ? (
          <LoadingState label="Loading annual returns" />
        ) : (
          <Group>
            {latest ? (
              <BigFigure
                value={formatMoney(latest.receipts)}
                spoken={moneyAccessibilityLabel(latest.receipts)}
                label={`receipts on the ${formatFinancialYear(Number(latest.year.slice(0, 4)))} return${latest.branches > 1 ? ', ' + formatCount(latest.branches) + ' branches summed' : ''}`}
              />
            ) : (
              <EmptyState message="No annual return receipts are held for this party." />
            )}
            <ReturnRows rows={rows.slice(0, 10)} />
            {rows.length > 10 ? (
              <RowList>
                <Disclosure
                  label={'All ' + rows.length + ' years'}
                  testID="party-all-years"
                >
                  {() => <ReturnRows rows={rows.slice(10)} />}
                </Disclosure>
              </RowList>
            ) : null}
            <ReadDate
              record={record}
              citation={record.data.meta.source}
              originals={[
                {
                  label: 'AEC annual returns',
                  url: record.data.meta.register_url,
                },
              ]}
              about={{
                title: 'About receipts on the return',
                notes: [
                  '“Not itemised” is receipts minus the sums itemised as donations and as other receipts on the same return; the AEC does not require receipts under the disclosure threshold to be itemised. Public election funding is left where the return puts it.',
                  rows.some((r) => r.clamped)
                    ? `${rows.filter((r) => r.clamped).length} historic rows report itemised components above the headline receipts total; their components are clamped to that total.`
                    : null,
                ],
              }}
              testID="party-annual-returns-source"
            />
          </Group>
        )}
      </Section>
      <Section
        title="Debts and other funding"
        accent="money"
        testID="party-debts"
      >
        {record ? (
          <Group>
            {d ? (
              <>
                <BigFigure
                  value={formatMoney(d.total)}
                  spoken={moneyAccessibilityLabel(d.total)}
                  label={'owed at 30 June ' + (Number(d.year.slice(0, 4)) + 1)}
                />
                <KeyValueList
                  items={[
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
                <Heading level={3}>
                  Largest creditors,{' '}
                  {formatFinancialYear(Number(d.year.slice(0, 4)))}
                </Heading>
                <KeyValueList
                  items={d.top.map((l) => ({
                    label:
                      l.name +
                      (l.type === 'Financial'
                        ? ' (financial institution)'
                        : ''),
                    value: formatMoney(l.amount),
                  }))}
                />
                <RowList>
                  <Disclosure
                    label="Owed at each 30 June"
                    testID="party-debt-years"
                  >
                    {() => (
                      <KeyValueList
                        items={d.by_year.map(([year, total]) => ({
                          label: formatFinancialYear(Number(year.slice(0, 4))),
                          value: formatMoney(total),
                        }))}
                      />
                    )}
                  </Disclosure>
                </RowList>
              </>
            ) : (
              <EmptyState message="No itemised debt record is held for this party." />
            )}
            {b ? (
              <Group gap={rhythm.tight}>
                <Text wordSafe variant="strong" tabular>
                  {formatMoney(b.total)}
                </Text>
                <Text wordSafe>
                  in discretionary benefits in{' '}
                  {formatFinancialYear(Number(b.year.slice(0, 4)))}
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
              </Group>
            ) : null}
            <ReadDate
              record={record}
              citation="AEC Transparency Register"
              originals={[
                {
                  label: 'AEC Transparency Register',
                  url: record.data.meta.register_url,
                },
              ]}
              about={{
                title: 'About debts and other funding',
                notes: [
                  'Debts are the balances the party’s branches listed as owed at 30 June on their own AEC annual returns, all branches summed: bank loans sit beside trade creditors and tax owed, and a balance is not new borrowing. Creditors under the disclosure threshold are not itemised.',
                  'Year-end balances, not new borrowing; a year with no debt itemised shows nothing.',
                ],
              }}
              testID="party-debts-source"
            />
          </Group>
        ) : error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <LoadingState label="Loading debts and creditors" />
        )}
      </Section>
    </>
  );
}
