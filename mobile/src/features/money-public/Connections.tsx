import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  Disclosure,
  Field,
  Group,
  LinkRow,
  SourceLine,
  Text,
} from '../../design/primitives';
import { formatCount } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { openOnWeb } from '../../navigation/external';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { money } from './runtime';
import { passageText } from '../../api/passage-text';
import type { decodeEvidence } from './data';
import type { RecordResult } from '../../api/client';
import {
  MoneyHeader,
  MoneyChoices,
  MoneyList,
  ResultCount,
  Title,
} from './parts';
export default function Connections() {
  const load = useCallback(
      (refresh: boolean) => money.connections(refresh),
      [],
    ),
    status = useCatalogRecord(load),
    data = status.record?.data;
  const [query, setQuery] = useState(''),
    deferred = useDeferredValue(query),
    [kind, setKind] = useState('');
  const [selected, setSelected] = useState<{
    id: string;
    excerpts?: ReturnType<typeof decodeEvidence>[string]['excerpts'];
    error?: unknown;
    record?: Pick<RecordResult<unknown>, 'stale' | 'savedAt' | 'staleReason'>;
  }>();
  const rows = useMemo(
    () =>
      (data?.entities ?? [])
        .filter(
          (e) =>
            (!kind || e.kind === kind) &&
            e.name.toLowerCase().includes(deferred.trim().toLowerCase()),
        )
        .sort((a, b) => b.count - a.count),
    [data, deferred, kind],
  );
  async function open(id: string, refresh = false) {
    setSelected({ id });
    try {
      const r = await money.evidence(id, refresh);
      setSelected((current) =>
        current?.id === id
          ? { id, excerpts: r.data[id]?.excerpts ?? [], record: r }
          : current,
      );
    } catch (e) {
      setSelected((current) =>
        current?.id === id ? { id, error: e } : current,
      );
    }
  }
  return (
    <>
      <MoneyHeader title="Programs & places" path="/connections" />
      <MoneyList
        loaded={!!status.record}
        id="connections-list"
        rows={rows}
        rowKey={(r) => r.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="connections-title">Programs & places</Title>
            <RecordStatus
              {...status}
              label="Loading programs and places"
              testID="connections-status"
            />
            {data ? (
              <SourceLine
                title="About programs and places"
                asOf={data.asOf}
                citation="OPAX collected source corpus"
                savedAt={status.record?.stale ? status.record.savedAt : null}
                notes={[data.note]}
                testID="connections-source"
              />
            ) : null}
            <Field
              label="Find a program, place or organisation"
              testID="connections-search"
              value={query}
              onChangeText={setQuery}
              returnKeyType="done"
            />
            <MoneyChoices
              value={kind}
              onChange={setKind}
              options={[
                ['', 'All kinds'],
                ['program', 'Programs'],
                ['place', 'Places'],
                ['electorate', 'Electorates'],
                ['organisation', 'Organisations'],
              ]}
            />
            <ResultCount count={data ? rows.length : null} noun="connections" />
          </>
        }
        render={(r) =>
          r.kind === 'organisation' ? (
            // An organisation is a way onward: its page on opax.com.au.
            <LinkRow
              title={r.name}
              detail={`${formatCount(r.count)} records · ${r.kind}`}
              external
              accessibilityHint="Opens on opax.com.au"
              onPress={() =>
                void openOnWeb(`/connections?entity=${r.id}`, r.name)
              }
            />
          ) : (
            <Group gap={rhythm.line}>
              <Text wordSafe variant="strong">
                {r.name}
              </Text>
              <Text wordSafe variant="metadata">
                {formatCount(r.count)} records · {r.kind}
              </Text>
              <Disclosure
                label="Source excerpts"
                testID={`connection-open-${r.id}`}
                open={selected?.id === r.id}
                onToggle={(expanded) =>
                  expanded ? void open(r.id) : setSelected(undefined)
                }
              >
                {selected?.id === r.id ? (
                  <Group>
                    <RecordStatus
                      record={selected.record ?? null}
                      error={selected.error}
                      refreshing={false}
                      refresh={() => open(r.id, true)}
                      retry={() => open(r.id)}
                      label="Opening source excerpts"
                      testID={`connection-evidence-${r.id}`}
                    />
                    {selected.excerpts
                      ? selected.excerpts.map((e, i) => (
                          <Group key={i} gap={rhythm.line}>
                            {/* Static evidence shards keep the raw source
                                window: entities and tags still in it. */}
                            <Text wordSafe>{passageText(e.text)}</Text>
                            <SourceLine
                              title="This excerpt"
                              asOf={e.date || data!.asOf}
                              citation={e.source}
                              originals={
                                e.url ? [{ label: e.source, url: e.url }] : []
                              }
                            />
                          </Group>
                        ))
                      : null}
                  </Group>
                ) : null}
              </Disclosure>
            </Group>
          )
        }
      />
    </>
  );
}
