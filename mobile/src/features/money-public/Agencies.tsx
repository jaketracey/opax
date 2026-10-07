import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AsAtLine,
  LinkRow,
  BigFigure,
  InfoButton,
  Field,
  Group,
  SourceLink,
  Text,
} from '../../design/primitives';
import {
  formatCount,
  formatMoneyCompact,
  formatDate,
} from '../../design/format';
import { RecordRow } from '../RecordRow';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import {
  MoneyHeader,
  MoneyChoices,
  MoneyList,
  OrganisationWebLink,
  Provenance,
  ResultCount,
  Title,
} from './parts';
export default function Agencies() {
  const load = useCallback((refresh: boolean) => money.agencies(refresh), []),
    status = useCatalogRecord(load),
    data = status.record?.data;
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState<'total' | 'count' | 'suppliers' | 'name'>(
      'total',
    );
  const rows = useMemo(
    () =>
      (data?.agencies ?? [])
        .filter((a) =>
          a.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort],
        ),
    [data, query, sort],
  );
  return (
    <>
      <MoneyHeader title="Government agencies" path="/subject/agency" />
      <MoneyList
        loaded={!!status.record}
        id="agencies-list"
        rows={rows}
        rowKey={(a) => a.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="agencies-title">Government agencies</Title>
            <Text wordSafe>
              Who awards Commonwealth contracts, and which companies receive
              them.
            </Text>
            <RecordStatus
              {...status}
              label="Loading government agencies"
              testID="agencies-status"
            />
            <Field
              label="Find an agency"
              value={query}
              onChangeText={setQuery}
              testID="agencies-search"
              returnKeyType="done"
            />
            <MoneyChoices
              value={sort}
              onChange={setSort}
              options={[
                ['total', 'Contract value'],
                ['count', 'Contracts'],
                ['suppliers', 'Suppliers'],
                ['name', 'Name'],
              ]}
            />
            <ResultCount
              count={data ? rows.length : null}
              noun="agencies in the available records"
            />
            {data ? (
              <AsAtLine asOf={data.meta.asOf} citation={data.meta.source} />
            ) : null}
          </>
        }
        render={(a, i) => (
          <>
            <RecordRow
              testID={`agency-row-${i}`}
              title={a.name}
              detail={`${formatMoneyCompact(a.total)} · ${formatCount(a.count)} contracts · ${formatCount(a.suppliers)} suppliers`}
              onPress={() =>
                router.push({ pathname: '/agency', params: { id: a.id } })
              }
            />
            <AsAtLine asOf={data!.meta.asOf} citation="AusTender" />
          </>
        )}
        footer={
          data ? (
            <Group>
              <InfoButton
                title="About agency names"
                notes={[
                  'Agency names appear as recorded. Renamed departments are separate entries; no succession or combined history is assumed.',
                ]}
              />
              <Provenance meta={data.meta} />
            </Group>
          ) : null
        }
      />
    </>
  );
}
export function Agency() {
  const { id, section } = useLocalSearchParams<{
    id: string;
    section?: string;
  }>();
  const load = useCallback(
      (refresh: boolean) => money.agency(id, refresh),
      [id],
    ),
    status = useCatalogRecord(load),
    data = status.record?.data,
    profile = data?.profile;
  const [view, setView] = useState(
      section === 'contracts' ? 'contracts' : 'years',
    ),
    [query, setQuery] = useState('');
  const rows = useMemo(() => {
    if (!profile) return [];
    if (view === 'years')
      return profile.years.map((r) => ({
        kind: 'year' as const,
        ...r,
        key: String(r.year),
      }));
    if (view === 'suppliers')
      return profile.suppliers
        .filter((s) =>
          s.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) => b.total - a.total)
        .map((s) => ({ kind: 'supplier' as const, ...s, key: s.id }));
    return profile.contracts
      .filter((c) =>
        [c.supplier, c.title, c.id]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
      .map((c) => ({ kind: 'contract' as const, ...c, key: c.id }));
  }, [profile, view, query]);
  return (
    <>
      <MoneyHeader
        title="Agency"
        path={`/subject/agency/${encodeURIComponent(profile?.id ?? id)}`}
      />
      <MoneyList
        loaded={!!status.record}
        id="agency-list"
        rows={rows as (typeof rows)[number][]}
        rowKey={(r) => r.key}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="agency-title">
              {profile?.name ?? 'Government agency'}
            </Title>
            <RecordStatus
              {...status}
              label="Loading agency records"
              testID="agency-status"
            />
            {profile ? (
              <>
                <BigFigure
                  value={formatMoneyCompact(profile.total)}
                  label="Recorded contract value"
                  detail={`${formatCount(profile.count)} contracts`}
                  accent="money"
                />
                <AsAtLine asOf={data!.meta.asOf} citation="AusTender" />
              </>
            ) : null}
            <MoneyChoices
              value={view}
              onChange={(v) => {
                setView(v);
                setQuery('');
              }}
              options={[
                ['years', 'Value over time', 'agency-years'],
                ['suppliers', 'Suppliers', 'agency-suppliers'],
                ['contracts', 'Contracts', 'agency-contracts'],
              ]}
            />
            <LinkRow
              title="Discover: companies in both"
              testID="agency-discover-both"
              onPress={() =>
                router.push({
                  pathname: '/discover',
                  params: { category: 'donor_contract_overlap' },
                })
              }
            />
            {view !== 'years' ? (
              <Field
                label={
                  view === 'suppliers' ? 'Find a supplier' : 'Find a contract'
                }
                value={query}
                onChangeText={setQuery}
                testID="agency-search"
                returnKeyType="done"
              />
            ) : null}
            <ResultCount
              count={data ? rows.length : null}
              noun={
                view === 'years' ? 'years of recorded contract starts' : view
              }
            />
          </>
        }
        render={(r, i) => (
          <Group>
            {r.kind === 'year' ? (
              <>
                <Text wordSafe variant="strong">
                  {r.year}
                </Text>
                <Text wordSafe>
                  {formatMoneyCompact(r.total)} · {formatCount(r.count)}{' '}
                  contracts
                </Text>
              </>
            ) : r.kind === 'supplier' ? (
              <>
                <Text wordSafe variant="strong">
                  {r.name}
                </Text>
                <Text wordSafe>
                  {formatMoneyCompact(r.total)} · {formatCount(r.count)}{' '}
                  contracts
                </Text>
                {r.organisation ? (
                  <OrganisationWebLink
                    name={r.name}
                    path={`/subject/supplier/${r.id}`}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text wordSafe variant="strong" testID={`agency-contract-${i}`}>
                  {r.id}
                </Text>
                <Text wordSafe>{r.supplier}</Text>
                {r.title ? <Text wordSafe>{r.title}</Text> : null}
                <Text wordSafe variant="figureInline">
                  {formatMoneyCompact(r.value)}
                </Text>
                <Text wordSafe variant="metadata">
                  {r.method} · Starts{' '}
                  {r.start ? formatDate(r.start) : 'not recorded'} · Ends{' '}
                  {r.end ? formatDate(r.end) : 'not recorded'}
                </Text>
                <SourceLink
                  citation="AusTender register"
                  record={r.id}
                  url={r.url}
                  kind={r.sourceKind}
                  testID={`agency-source-${i}`}
                />
              </>
            )}
            <AsAtLine asOf={data!.meta.asOf} citation="AusTender" />
          </Group>
        )}
        footer={
          data ? (
            <>
              <Text wordSafe>
                {formatMoneyCompact(data.profile.undated)} in undated recorded
                contract starts
              </Text>
              <Provenance meta={data.meta} />
            </>
          ) : null
        }
      />
    </>
  );
}
