import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  LinkRow,
  BigFigure,
  Field,
  Group,
  RowList,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import {
  formatCount,
  formatMoneyCompact,
  moneyAccessibilityLabel,
  formatDate,
} from '../../design/format';
import { RecordRow } from '../RecordRow';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import {
  MetaSource,
  MoneyHeader,
  MoneyChoices,
  MoneyList,
  ResultCount,
  RowSource,
  Title,
} from './parts';

const AGENCY_NAMES =
  'Agency names appear as recorded. Renamed departments are separate entries; no succession or combined history is assumed.';
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
            <RecordStatus
              {...status}
              label="Loading government agencies"
              testID="agencies-status"
            />
            <Group gap={rhythm.tight}>
              <Text wordSafe variant="metadata">
                Who awards Commonwealth contracts, and which companies receive
                them.
              </Text>
              {data ? (
                <MetaSource
                  meta={data.meta}
                  record={status.record}
                  title="About agencies"
                  notes={[AGENCY_NAMES]}
                  testID="agencies-source"
                />
              ) : null}
            </Group>
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
          </>
        }
        render={(a, i) => (
          <RecordRow
            testID={`agency-row-${i}`}
            title={a.name}
            detail={`${formatMoneyCompact(a.total)} · ${formatCount(a.count)} contracts · ${formatCount(a.suppliers)} suppliers`}
            onPress={() =>
              router.push({ pathname: '/agency', params: { id: a.id } })
            }
          />
        )}
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
            {profile && data ? (
              <Group gap={rhythm.tight}>
                <BigFigure
                  value={formatMoneyCompact(profile.total)}
                  spoken={moneyAccessibilityLabel(profile.total, true)}
                  label="Recorded contract value"
                  detail={`${formatCount(profile.count)} contracts`}
                  accent="money"
                  testID="agency-total"
                />
                <MetaSource
                  meta={data.meta}
                  record={status.record}
                  title="About this agency"
                  notes={[
                    `${formatMoneyCompact(data.profile.undated)} in recorded contracts has no start date, so it is in no year.`,
                    AGENCY_NAMES,
                  ]}
                  testID="agency-sources"
                />
              </Group>
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
              detail={
                data && view === 'years' && data.profile.undated
                  ? `${formatMoneyCompact(data.profile.undated)} undated`
                  : null
              }
            />
          </>
        }
        render={(r, i) =>
          r.kind === 'year' ? (
            <Group gap={rhythm.line}>
              <Text wordSafe variant="strong">
                {r.year}
              </Text>
              <Text wordSafe variant="metadata">
                {formatMoneyCompact(r.total)} · {formatCount(r.count)} contracts
              </Text>
            </Group>
          ) : r.kind === 'supplier' ? (
            r.organisation ? (
              // A company is a way onward: its page on opax.com.au.
              <LinkRow
                title={r.name}
                detail={`${formatMoneyCompact(r.total)} · ${formatCount(r.count)} contracts`}
                external
                accessibilityHint="Opens on opax.com.au"
                onPress={() =>
                  void openOnWeb(`/subject/supplier/${r.id}`, r.name)
                }
              />
            ) : (
              <Group gap={rhythm.line}>
                <Text wordSafe variant="strong">
                  {r.name}
                </Text>
                <Text wordSafe variant="metadata">
                  {formatMoneyCompact(r.total)} · {formatCount(r.count)}{' '}
                  contracts
                </Text>
              </Group>
            )
          ) : (
            <Group gap={rhythm.line}>
              <Text wordSafe variant="strong" testID={`agency-contract-${i}`}>
                {r.supplier}
              </Text>
              {r.title ? <Text wordSafe>{r.title}</Text> : null}
              <Text wordSafe variant="strong" tabular>
                {formatMoneyCompact(r.value)}
              </Text>
              <Text wordSafe variant="metadata">
                {r.method} · Starts{' '}
                {r.start ? formatDate(r.start) : 'not recorded'} · Ends{' '}
                {r.end ? formatDate(r.end) : 'not recorded'}
              </Text>
              <RowSource
                register="AusTender"
                record={r.id}
                url={r.url}
                asOf={data!.meta.asOf}
                testID={`agency-source-${i}`}
              />
            </Group>
          )
        }
        footer={
          data ? (
            <RowList>
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
            </RowList>
          ) : null
        }
      />
    </>
  );
}
