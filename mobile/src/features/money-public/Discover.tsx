import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  AsAtLine,
  Button,
  Field,
  Group,
  KeyValueList,
  SourceLink,
  Text,
} from '../../design/primitives';
import {
  formatCount,
  formatMoneyCompact,
  formatPercent,
} from '../../design/format';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import {
  categoryOption,
  leadsFor,
  leadCategories,
  type LeadCategory,
} from '../leads/model';
import { publicSignal } from './discovery';
import { isOrganisation } from './privacy';
import {
  MoneyHeader,
  MoneyList,
  OrganisationWebLink,
  ResultCount,
  Title,
} from './parts';
export default function Discover() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<LeadCategory>(
    leadCategories.includes(params.category as LeadCategory)
      ? (params.category as LeadCategory)
      : 'procurement_concentration',
  );
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState<'value' | 'share'>('value');
  const load = useCallback(
      (refresh: boolean) => catalogs.discovery(refresh),
      [],
    ),
    status = useCatalogRecord(load),
    data = status.record?.data;
  const rows = useMemo(
    () =>
      data
        ? leadsFor(
            { ...data, signals: data.signals.map(publicSignal) },
            category,
            sort,
          ).filter((s) =>
            [s.title, s.summary]
              .join(' ')
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
          )
        : [],
    [data, category, query, sort],
  );
  return (
    <>
      <MoneyHeader title="Discover" path={`/discover?category=${category}`} />
      <MoneyList
        loaded={!!status.record}
        id="discover-list"
        rows={rows}
        rowKey={(s) => s.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="discover-title">Discover</Title>
            <RecordStatus
              {...status}
              label="Loading Discover"
              testID="discover-status"
            />
            {leadCategories.map((c) => (
              <Button
                key={c}
                label={categoryOption(c)}
                testID={`discover-${c}`}
                onPress={() => setCategory(c)}
              />
            ))}
            <Field
              label="Find in the available records"
              value={query}
              onChangeText={setQuery}
              testID="discover-search"
              returnKeyType="done"
            />
            <Button
              label={
                sort === 'value'
                  ? 'Sort by biggest share'
                  : 'Sort by largest totals'
              }
              onPress={() =>
                setSort((s) => (s === 'value' ? 'share' : 'value'))
              }
            />
            <ResultCount
              count={data ? rows.length : null}
              noun={categoryOption(category).toLowerCase()}
            />
            {data ? (
              <AsAtLine
                asOf={data.generated_at}
                citation="AEC annual returns; AusTender"
              />
            ) : null}
          </>
        }
        render={(s, i) => (
          <Group>
            <Text wordSafe variant="strong" testID={`discover-card-${i}`}>
              {s.title}
            </Text>
            <Text wordSafe>{s.summary}</Text>
            <KeyValueList
              items={s.metrics.map((m) => ({
                label: m.label,
                value:
                  m.format === 'currency'
                    ? formatMoneyCompact(m.value)
                    : m.format === 'percent'
                      ? formatPercent(m.value)
                      : formatCount(m.value),
              }))}
            />
            {s.comparison.type === 'concentration' ? (
              <Group>
                {s.comparison.rows.map((r, j) => (
                  <Text key={j} wordSafe>
                    {r.name} · {formatMoneyCompact(r.value)} ·{' '}
                    {formatPercent(r.share)}
                  </Text>
                ))}
              </Group>
            ) : null}
            {s.caveats.map((c, j) => (
              <Text key={j} wordSafe variant="fine">
                {c}
              </Text>
            ))}
            <AsAtLine asOf={data!.generated_at} citation={s.citation} />
            {s.category !== 'recipient_concentration' &&
            isOrganisation(s.entity) ? (
              <OrganisationWebLink
                name={s.entity}
                path={`/subject/supplier/${encodeURIComponent(s.entity)}`}
              />
            ) : null}
            {s.evidence.map((e, j) =>
              e.url ? (
                <SourceLink
                  key={j}
                  citation={e.register}
                  record={e.record ?? undefined}
                  url={e.url}
                  kind={e.kind}
                  testID={`discover-source-${i}-${j}`}
                />
              ) : null,
            )}
          </Group>
        )}
        footer={
          data ? (
            <Group>
              {data.methodology.map((m, i) => (
                <Text key={i} wordSafe variant="fine">
                  {m}
                </Text>
              ))}
            </Group>
          ) : null
        }
      />
    </>
  );
}
