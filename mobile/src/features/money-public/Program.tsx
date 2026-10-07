import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AsAtLine,
  Button,
  Field,
  Group,
  KeyValueList,
  Section,
  SourceLink,
  Text,
} from '../../design/primitives';
import { formatCount, formatMoneyCompact } from '../../design/format';
import { ApiError } from '../../api/errors';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { programRecipients } from './data';
import { money } from './runtime';
import {
  MoneyHeader,
  MoneyList,
  OrganisationWebLink,
  Provenance,
  ResultCount,
  Title,
} from './parts';
export default function Program() {
  const {
    jur: input,
    id,
    key: inputKey,
    seat,
    state,
  } = useLocalSearchParams<{
    jur?: string;
    id?: string;
    key?: string;
    seat?: string;
    state?: string;
  }>();
  const jur = input === 'qld' ? 'qld' : 'federal';
  const load = useCallback(
    async (refresh: boolean) => {
      const index = await money.grants(jur, refresh);
      const entry = index.data.programs.find(
        (p) => p.id === id || p.key === inputKey || p.key === id,
      );
      if (!entry)
        throw new ApiError(
          'not-found',
          'Program not found in the available export.',
        );
      const [program, notes] = await Promise.all([
        money.program(jur, entry.key, refresh),
        money.notes(refresh),
      ]);
      return combine([index, program, notes], {
        index: index.data,
        program: program.data,
        notes: notes.data,
      });
    },
    [jur, id, inputKey],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data,
    program = data?.program;
  const [query, setQuery] = useState('');
  const [view, setView] = useState('recipients');
  const grants = useMemo(
    () =>
      (program?.grants ?? []).filter(
        (g) =>
          (!seat ||
            (g.seat.toLowerCase() === seat.toLowerCase() &&
              (!state || g.state.toLowerCase() === state.toLowerCase()))) &&
          [g.name, g.id, g.title]
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [program, query, seat, state],
  );
  const rows =
    view === 'recipients'
      ? programRecipients(grants).map((r) => ({
          kind: 'recipient' as const,
          ...r,
        }))
      : grants.map((g) => ({ kind: 'grant' as const, ...g }));
  const note = program ? data?.notes.programs[jur][program.id] : undefined;
  return (
    <>
      <MoneyHeader
        title="Grant program"
        path={`/money/grants?jur=${jur}&program=${encodeURIComponent(program?.id ?? id ?? '')}`}
      />
      <MoneyList
        loaded={!!status.record}
        id="program-list"
        rows={rows as (typeof rows)[number][]}
        rowKey={(g) => g.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="program-title">{program?.name ?? 'Grant program'}</Title>
            <RecordStatus
              {...status}
              label="Loading the program"
              testID="program-status"
            />
            <Button
              label="The month’s largest grants"
              testID="program-largest"
              onPress={() => router.push('/largest-grants')}
            />
            {program ? (
              <>
                <Text wordSafe>{program.agency}</Text>
                <KeyValueList
                  items={[
                    {
                      label:
                        jur === 'qld'
                          ? 'Recorded annual expenditure in this program'
                          : 'Awarded in this program',
                      value: formatMoneyCompact(program.total),
                    },
                    {
                      label: 'Grant records',
                      value: formatCount(program.count),
                    },
                  ]}
                />
                <AsAtLine
                  asOf={program.asOf}
                  citation={data?.index.meta.source}
                />
                <Text wordSafe>
                  {formatCount(program.listed)} of{' '}
                  {formatCount(program.available)} program grants listed in the
                  export.
                </Text>
                {seat ? (
                  <Text wordSafe>
                    Listed awards mapped to {seat}; not a complete total for
                    this seat.
                  </Text>
                ) : null}
              </>
            ) : null}
            {note ? (
              <Section title="Program notes">
                <Text wordSafe>{note.summary}</Text>
                {note.audits.map((a, i) => (
                  <Group key={i}>
                    <Text wordSafe variant="strong">
                      {a.title}
                    </Text>
                    <Text wordSafe>{a.finding}</Text>
                    <SourceLink citation={a.title} url={a.url} kind="record" />
                  </Group>
                ))}
                <AsAtLine
                  asOf={data!.notes.asOf}
                  citation="OPAX program notes; sources linked above"
                />
              </Section>
            ) : null}
            <Field
              label="Find a listed grant or organisation"
              value={query}
              onChangeText={setQuery}
              testID="program-search"
              returnKeyType="done"
            />
            <Button
              label="Recipients"
              testID="program-recipients"
              onPress={() => setView('recipients')}
            />
            <Button
              label="Grant records"
              testID="program-grants"
              onPress={() => setView('grants')}
            />
            <ResultCount
              count={data ? rows.length : null}
              noun={
                view === 'recipients'
                  ? 'recipients in the listed awards'
                  : 'listed grants'
              }
            />
          </>
        }
        render={(g) => (
          <Group>
            <Text
              wordSafe
              variant="strong"
              testID={`program-recipient-${g.id}`}
            >
              {g.name}
            </Text>
            <Text wordSafe variant="figureInline">
              {formatMoneyCompact(g.value)}
            </Text>
            {g.kind === 'grant' ? (
              <>
                {g.title ? <Text wordSafe>{g.title}</Text> : null}
                <Text wordSafe variant="metadata">
                  {[g.id, g.year, g.seat, g.selection]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {data!.notes.selection[g.selection] ? (
                  <Text wordSafe variant="fine">
                    {data!.notes.selection[g.selection]!.short}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text wordSafe>{formatCount(g.count)} listed grant records</Text>
            )}
            <AsAtLine asOf={program!.asOf} citation={data!.index.meta.source} />
            {g.organisation && g.recipientId ? (
              <OrganisationWebLink
                name={g.name}
                path={`/money/grants/${jur}/recipient/${encodeURIComponent(g.recipientId)}`}
              />
            ) : null}
            {g.kind === 'grant' && g.sourceUrl ? (
              <SourceLink
                citation="GrantConnect"
                record={g.id}
                url={g.sourceUrl}
                kind="record"
              />
            ) : null}
          </Group>
        )}
        footer={data ? <Provenance meta={data.index.meta} /> : null}
      />
    </>
  );
}
