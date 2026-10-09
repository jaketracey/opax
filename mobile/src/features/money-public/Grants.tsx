import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  LinkRow,
  BigFigure,
  Field,
  Group,
  RowList,
  Section,
  Text,
} from '../../design/primitives';
import {
  formatCount,
  formatMoneyCompact,
  moneyAccessibilityLabel,
  formatPercent,
} from '../../design/format';
import { RecordStatus } from '../RecordStatus';
import { RecordRow } from '../RecordRow';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import type { Jurisdiction } from './data';
import { rhythm } from '../../design/tokens';
import {
  MetaSource,
  MoneyHeader,
  MoneyChoices,
  MoneyList,
  ResultCount,
  Title,
} from './parts';
export default function Grants() {
  const params = useLocalSearchParams<{
    jur?: string;
    seat?: string;
    state?: string;
    view?: string;
  }>();
  const jur: Jurisdiction = params.jur === 'qld' ? 'qld' : 'federal';
  return (
    <GrantList
      key={`${jur}-${params.seat ?? ''}`}
      jur={jur}
      seat={params.seat}
      state={params.state}
      initialView={params.view}
    />
  );
}
function GrantList({
  jur,
  seat,
  state,
  initialView,
}: {
  jur: Jurisdiction;
  seat?: string;
  state?: string;
  initialView?: string;
}) {
  const load = useCallback(
    (refresh: boolean) => money.grants(jur, refresh),
    [jur],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data;
  const [view, setView] = useState(
    initialView === 'electorates' ? 'electorates' : 'programs',
  );
  const [query, setQuery] = useState(
    initialView === 'electorates' ? (seat ?? '') : '',
  );
  const rows = useMemo(
    () =>
      (view === 'programs' ? (data?.programs ?? []) : (data?.seats ?? []))
        .filter((r) =>
          r.name
            .toLocaleLowerCase('en-AU')
            .includes(query.trim().toLocaleLowerCase('en-AU')),
        )
        .sort((a, b) => b.total - a.total),
    [data, view, query],
  );
  const path = `/money/grants?jur=${jur}${view === 'electorates' ? '&view=electorates' : ''}${seat ? `&q=${encodeURIComponent(seat)}` : ''}`;
  return (
    <>
      <MoneyHeader title="Grants" path={path} />
      <MoneyList
        loaded={!!status.record}
        id="grants-list"
        rows={rows}
        rowKey={(r) => ('key' in r ? r.key : `${r.name}-${r.state}`)}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="grants-title">
              {jur === 'federal' ? 'Commonwealth' : 'Queensland'} grants
            </Title>
            <RecordStatus
              {...status}
              label="Loading grants"
              testID="grants-status"
            />
            {data ? (
              // The figure the screen is about, the donor overlap in one
              // sentence, and one source line.
              <Group gap={rhythm.tight}>
                <BigFigure
                  value={formatMoneyCompact(data.counts.dollars)}
                  spoken={moneyAccessibilityLabel(data.counts.dollars, true)}
                  label={
                    jur === 'qld'
                      ? `Recorded annual expenditure in ${formatCount(data.counts.grants)} lines`
                      : `Awarded in ${formatCount(data.counts.grants)} grants`
                  }
                  accent="money"
                  testID="grants-total"
                />
                <Text wordSafe testID="grants-donor-headline">
                  Of {formatCount(data.counts.recipients)} recipients resolved
                  to entities, {formatCount(data.counts.donorRecipients)} appear
                  in the donor registers;{' '}
                  {formatPercent(data.counts.donorShare * 100)} of the money,{' '}
                  {formatMoneyCompact(data.counts.donorDollars)}, went to them.
                </Text>
                <MetaSource
                  meta={data.meta}
                  record={status.record}
                  title="About these grants"
                  testID="grants-source"
                />
              </Group>
            ) : null}
            <MoneyChoices
              value={view}
              onChange={(v) => {
                setView(v);
                setQuery(v === 'electorates' ? (seat ?? '') : '');
              }}
              options={[
                ['programs', 'Programs', 'grants-programs'],
                ['electorates', 'Electorates', 'grants-electorates'],
              ]}
            />
            {seat && view === 'programs' ? (
              <Text wordSafe>
                Programs in the available export. Open a program to see its
                listed awards for {seat}.
              </Text>
            ) : null}
            <Field
              label={
                view === 'programs' ? 'Find a program' : 'Find an electorate'
              }
              value={query}
              onChangeText={setQuery}
              testID="grants-search"
              returnKeyType="done"
            />
            <ResultCount
              count={data ? rows.length : null}
              noun={view}
              detail={
                data && view === 'programs'
                  ? `${formatCount(data.counts.programsTotal)} in the source totals`
                  : null
              }
            />
          </>
        }
        render={(r, i) => (
          <RecordRow
            title={r.name}
            testID={`grants-row-${i}`}
            detail={`${formatMoneyCompact(r.total)} · ${formatCount(r.count)} grants · ${formatMoneyCompact(r.donorTotal)} to recipients in the donor registers`}
            onPress={() =>
              'key' in r
                ? router.push({
                    pathname: '/grant-program',
                    params: {
                      jur,
                      id: r.id,
                      key: r.key,
                      ...(seat ? { seat, state } : {}),
                    },
                  })
                : router.push({
                    pathname: '/grants',
                    params: {
                      jur,
                      seat: r.name,
                      state: r.state,
                      view: 'programs',
                    },
                  })
            }
          />
        )}
        footer={
          data ? (
            <RowList>
              <LinkRow
                title={
                  jur === 'federal'
                    ? 'Queensland grants'
                    : 'Commonwealth grants'
                }
                testID="grants-switch"
                onPress={() =>
                  router.push({
                    pathname: '/grants',
                    params: { jur: jur === 'federal' ? 'qld' : 'federal' },
                  })
                }
              />
              <LinkRow
                title="The month’s largest grants"
                testID="grants-largest"
                onPress={() => router.push('/largest-grants')}
              />
            </RowList>
          ) : null
        }
      />
    </>
  );
}
export function SeatGrants({
  name,
  state,
  eligible = true,
}: {
  name: string;
  state: string;
  eligible?: boolean;
}) {
  const load = useCallback(
    (refresh: boolean) => money.grants('federal', refresh),
    [],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data;
  const seat = eligible
    ? data?.seats.find(
        (s) =>
          s.name.toLowerCase() === name.toLowerCase() &&
          s.state.toLowerCase() === state.toLowerCase(),
      )
    : undefined;
  return (
    <Section title="Grants in this seat" accent="money" testID="seat-grants">
      <RecordStatus
        {...status}
        label="Loading grants in this seat"
        testID="seat-grants-status"
      />
      {data ? (
        <Group gap={rhythm.tight}>
          {seat ? (
            <BigFigure
              value={formatMoneyCompact(seat.total)}
              spoken={moneyAccessibilityLabel(seat.total, true)}
              label={`In ${formatCount(seat.count)} Commonwealth grants`}
              accent="money"
              testID="seat-grants-total"
            />
          ) : (
            <Text wordSafe>
              No matching federal division is recorded in the grant export. This
              is not a zero total.
            </Text>
          )}
          <MetaSource
            meta={data.meta}
            record={status.record}
            title="About grants in this seat"
            notes={[
              'Electorate mappings are approximate and use the award’s delivery or recipient postcode.',
            ]}
            testID="seat-grants-source"
          />
        </Group>
      ) : null}
      <RowList>
        {data ? (
          <LinkRow
            title="See all"
            testID="seat-grants-all"
            onPress={() =>
              router.push({
                pathname: '/grants',
                params: {
                  jur: 'federal',
                  seat: name,
                  state,
                  view: 'electorates',
                },
              })
            }
          />
        ) : null}
        <LinkRow
          title="Public money"
          testID="seat-public-money"
          onPress={() => router.push('/public-money')}
        />
      </RowList>
    </Section>
  );
}
