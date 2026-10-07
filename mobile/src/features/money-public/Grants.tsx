import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AsAtLine,
  Button,
  Field,
  Group,
  KeyValueList,
  Section,
  Text,
} from '../../design/primitives';
import {
  formatCount,
  formatMoneyCompact,
  formatPercent,
} from '../../design/format';
import { RecordStatus } from '../RecordStatus';
import { RecordRow } from '../RecordRow';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import type { Jurisdiction } from './data';
import {
  MoneyHeader,
  MoneyList,
  Provenance,
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
  const [coverage, setCoverage] = useState(false);
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
            <Button
              label={
                jur === 'federal'
                  ? 'Switch to Queensland'
                  : 'Switch to Commonwealth'
              }
              onPress={() =>
                router.push({
                  pathname: '/grants',
                  params: { jur: jur === 'federal' ? 'qld' : 'federal' },
                })
              }
            />
            <Button
              label="Programs"
              testID="grants-programs"
              onPress={() => {
                setView('programs');
                setQuery('');
              }}
            />
            <Button
              label="Electorates"
              testID="grants-electorates"
              onPress={() => {
                setView('electorates');
                setQuery(seat ?? '');
              }}
            />
            <Button
              label="The month’s largest grants"
              testID="grants-largest"
              onPress={() => router.push('/largest-grants')}
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
            <RecordStatus
              {...status}
              label="Loading grants"
              testID="grants-status"
            />
            {data ? (
              <Group>
                <Text wordSafe testID="grants-donor-headline">
                  {formatCount(data.counts.donorRecipients)} recipients appear
                  in the donor registers ·{' '}
                  {formatPercent(data.counts.donorShare * 100)} of the money,{' '}
                  {formatMoneyCompact(data.counts.donorDollars)}, went to those
                  donors
                </Text>
                <Button
                  label={coverage ? 'Hide source caveats' : 'Source caveats'}
                  onPress={() => setCoverage((v) => !v)}
                  expanded={coverage}
                />
                {coverage ? <Provenance meta={data.meta} /> : null}
              </Group>
            ) : null}
            <ResultCount count={data ? rows.length : null} noun={view} />
            {data && view === 'programs' ? (
              <Text wordSafe variant="fine">
                {formatCount(data.programs.length)} programs in the available
                detail export; {formatCount(data.counts.programsTotal)} programs
                in the source totals.
              </Text>
            ) : null}
            {data ? (
              <AsAtLine asOf={data.meta.asOf} citation={data.meta.source} />
            ) : null}
          </>
        }
        render={(r, i) => (
          <>
            <RecordRow
              title={r.name}
              testID={`grants-row-${i}`}
              detail={`${formatMoneyCompact(r.total)} · ${formatCount(r.count)} grants`}
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
            <Text wordSafe variant="fine">
              {formatMoneyCompact(r.donorTotal)} to recipients in the donor
              registers
            </Text>
          </>
        )}
        footer={
          data ? (
            <>
              <Section title="Donor overlap">
                <KeyValueList
                  items={[
                    {
                      label:
                        jur === 'qld'
                          ? `recorded annual expenditure in ${formatCount(data.counts.grants)} lines`
                          : `awarded in ${formatCount(data.counts.grants)} grants`,
                      value: formatMoneyCompact(data.counts.dollars),
                    },
                    {
                      label: 'recipients resolved to entities',
                      value: formatCount(data.counts.recipients),
                    },
                    {
                      label: 'of them appear in the donor registers',
                      value: formatCount(data.counts.donorRecipients),
                    },
                    {
                      label: `of the money, ${formatMoneyCompact(data.counts.donorDollars)}, went to those donors`,
                      value: formatPercent(data.counts.donorShare * 100),
                    },
                  ]}
                />
                <Provenance meta={data.meta} />
              </Section>
            </>
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
    <Section title="Grants in this seat" testID="seat-grants">
      <RecordStatus
        {...status}
        label="Loading grants in this seat"
        testID="seat-grants-status"
      />
      {data ? (
        <Group>
          {seat ? (
            <Text wordSafe testID="seat-grants-total">
              {formatMoneyCompact(seat.total)} in {formatCount(seat.count)}{' '}
              Commonwealth grants
            </Text>
          ) : (
            <Text wordSafe>
              No matching federal division is recorded in the grant export. This
              is not a zero total.
            </Text>
          )}
          <Text wordSafe>
            Electorate mappings are approximate and use the award’s delivery or
            recipient postcode.
          </Text>
          <AsAtLine asOf={data.meta.asOf} citation={data.meta.source} />
          <Button
            label="See all"
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
        </Group>
      ) : null}
      <Button
        label="Public money"
        testID="seat-public-money"
        onPress={() => router.push('/public-money')}
      />
    </Section>
  );
}
