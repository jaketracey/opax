import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  AsAtLine,
  InfoButton,
  Disclosure,
  Field,
  Group,
  SourceLink,
  Text,
} from '../../design/primitives';
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
  OrganisationWebLink,
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
            {data ? (
              <>
                <AsAtLine
                  asOf={data.asOf}
                  citation="OPAX collected source corpus"
                />
                <InfoButton
                  title="About programs and places"
                  notes={[data.note]}
                />
              </>
            ) : null}
          </>
        }
        render={(r) => (
          <Group>
            <Text wordSafe variant="strong">
              {r.name}
            </Text>
            <Text wordSafe>
              {r.count.toLocaleString('en-AU')} records · {r.kind}
            </Text>
            <AsAtLine
              asOf={data!.asOf}
              citation="OPAX collected source corpus"
            />
            {r.kind === 'organisation' ? (
              <OrganisationWebLink
                name={r.name}
                path={`/connections?entity=${r.id}`}
              />
            ) : (
              <>
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
                            <Group key={i}>
                              {/* Static evidence shards keep the raw source
                                  window: entities and tags still in it. */}
                              <Text wordSafe>{passageText(e.text)}</Text>
                              <AsAtLine
                                asOf={e.date || data!.asOf}
                                citation={e.source}
                              />

                              {e.url ? (
                                <SourceLink
                                  citation={e.source}
                                  url={e.url}
                                  kind="record"
                                />
                              ) : null}
                            </Group>
                          ))
                        : null}
                    </Group>
                  ) : null}
                </Disclosure>
              </>
            )}
          </Group>
        )}
      />
    </>
  );
}
