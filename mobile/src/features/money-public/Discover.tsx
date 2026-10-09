import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { catalogs } from '../../api/runtime';
import {
  Field,
  Group,
  KeyValueList,
  SourceLine,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
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
            {data ? (
              <SourceLine
                title="About Discover"
                asOf={data.generated_at}
                citation={['AEC annual returns', 'AusTender']}
                savedAt={status.record?.stale ? status.record.savedAt : null}
                notes={data.methodology}
                testID="discover-sources"
              />
            ) : null}
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
            <MoneyChoices
              value={sort}
              onChange={setSort}
              options={[
                ['value', 'Largest totals', 'discover-sort-value'],
                ['share', 'Biggest share', 'discover-sort-share'],
              ]}
            />
            <ResultCount
              count={data ? rows.length : null}
              noun={categoryOption(category).toLowerCase()}
            />
          </>
        }
        render={(s, i) => {
          const evidence = s.evidence.flatMap((e) =>
            e.url
              ? [
                  {
                    label: e.register,
                    url: e.url,
                    record: e.record ?? undefined,
                  },
                ]
              : [],
          );
          const organisation =
            s.category !== 'recipient_concentration' &&
            isOrganisation(s.entity);
          return (
            // A lead: its title, one sentence, its figures, and its
            // evidence behind one source line (caveats and the comparison
            // in full in the sheet).
            <Group gap={rhythm.tight}>
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
              <SourceLine
                title="Evidence"
                dateLabel={null}
                asOf={data!.generated_at}
                citation={s.citation}
                coverage={`Evidence (${formatCount(evidence.length)})`}
                originals={[
                  ...evidence,
                  ...(organisation
                    ? [
                        {
                          label: 'opax.com.au',
                          url: `/subject/supplier/${encodeURIComponent(s.entity)}`,
                          record: s.entity,
                        },
                      ]
                    : []),
                ]}
                notes={[
                  ...s.caveats,
                  ...(s.comparison.type === 'concentration'
                    ? s.comparison.rows.map(
                        (r) =>
                          `${r.name}: ${formatMoneyCompact(r.value)}, ${formatPercent(r.share)}.`,
                      )
                    : []),
                ]}
                testID={`discover-source-${i}-0`}
              />
            </Group>
          );
        }}
      />
    </>
  );
}
