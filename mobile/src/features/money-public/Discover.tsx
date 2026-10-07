import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  AsAtLine,
  Button,
  InfoButton,
  ViewOriginal,
  Field,
  Group,
  KeyValueList,
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
  MoneyChoices,
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
            <MoneyChoices
              value={category}
              onChange={setCategory}
              options={leadCategories.map(
                (c) => [c, categoryOption(c), `discover-${c}`] as const,
              )}
            />
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
            <InfoButton
              title="About this lead"
              testID={`discover-notes-${i}`}
              notes={s.caveats}
            />
            <AsAtLine asOf={data!.generated_at} citation={s.citation} />
            {s.category !== 'recipient_concentration' &&
            isOrganisation(s.entity) ? (
              <OrganisationWebLink
                name={s.entity}
                path={`/subject/supplier/${encodeURIComponent(s.entity)}`}
              />
            ) : null}
            <ViewOriginal
              testID={`discover-source-${i}-0`}
              sources={s.evidence.flatMap((e) =>
                e.url
                  ? [
                      {
                        label: `${e.register}${e.record ? ` · ${e.record}` : ''}`,
                        url: e.url,
                      },
                    ]
                  : [],
              )}
            />
          </Group>
        )}
        footer={
          data ? (
            <InfoButton title="About Discover" notes={data.methodology} />
          ) : null
        }
      />
    </>
  );
}
