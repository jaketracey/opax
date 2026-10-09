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
import {
  formatCount,
  formatDate,
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../design/format';
import { rhythm } from '../../design/tokens';
import { ApiError } from '../../api/errors';
import { openOnWeb } from '../../navigation/external';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { programRecipients } from './data';
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
            {program && data ? (
              // One meta line, the figure, the one caveat it needs, and one
              // source line whose sheet holds the program notes and audits.
              <Group gap={rhythm.tight}>
                <Text wordSafe variant="metadata">
                  {program.agency}
                </Text>
                <BigFigure
                  value={formatMoneyCompact(program.total)}
                  spoken={moneyAccessibilityLabel(program.total, true)}
                  label={
                    jur === 'qld'
                      ? 'Recorded annual expenditure in this program'
                      : 'Awarded in this program'
                  }
                  detail={`${formatCount(program.count)} grant records`}
                  accent="money"
                  testID="program-total"
                />
                <Text wordSafe variant="fine" testID="program-caveat">
                  {seat
                    ? `Listed awards mapped to ${seat}; not a complete total for this seat.`
                    : `${formatCount(program.listed)} of ${formatCount(program.available)} program grants listed in the export.`}
                </Text>
                <MetaSource
                  meta={{ ...data.index.meta, asOf: program.asOf }}
                  record={status.record}
                  title="Program notes"
                  originals={[
                    ...(data.index.meta.sourceUrl
                      ? [
                          {
                            label: data.index.meta.source,
                            url: data.index.meta.sourceUrl,
                          },
                        ]
                      : []),
                    ...(note?.audits ?? []).map((a) => ({
                      label: a.title,
                      url: a.url,
                    })),
                    ...(note?.sources ?? []).map((s) => ({
                      label: s.title,
                      url: s.url,
                    })),
                  ]}
                  notes={[
                    note?.summary,
                    ...(note?.audits ?? []).map(
                      (a) => `${a.title}: ${a.finding}`,
                    ),
                    note
                      ? `Program notes by OPAX, as at ${formatDate(data.notes.asOf)}.`
                      : null,
                    seat
                      ? `${formatCount(program.listed)} of ${formatCount(program.available)} program grants listed in the export.`
                      : null,
                  ]}
                  testID="program-notes"
                />
              </Group>
            ) : null}
            <Field
              label="Find a listed grant or organisation"
              value={query}
              onChangeText={setQuery}
              testID="program-search"
              returnKeyType="done"
            />
            <MoneyChoices
              value={view}
              onChange={setView}
              options={[
                ['recipients', 'Recipients', 'program-recipients'],
                ['grants', 'Grant records', 'program-grants'],
              ]}
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
        render={(g, i) =>
          g.kind === 'recipient' && g.organisation && g.recipientId ? (
            // A recipient is a way onward: its page on opax.com.au.
            <LinkRow
              title={g.name}
              titleTestID={`program-recipient-${g.id}`}
              value={formatMoneyCompact(g.value)}
              detail={`${formatCount(g.count)} listed grant records`}
              external
              accessibilityHint="Opens on opax.com.au"
              onPress={() =>
                void openOnWeb(
                  `/money/grants/${jur}/recipient/${encodeURIComponent(g.recipientId!)}`,
                  g.name,
                )
              }
            />
          ) : (
            <Group gap={rhythm.line}>
              <Text
                wordSafe
                variant="strong"
                testID={`program-recipient-${g.id}`}
              >
                {g.name}
              </Text>
              <Text wordSafe variant="strong" tabular>
                {formatMoneyCompact(g.value)}
              </Text>
              {g.kind === 'grant' ? (
                <>
                  {g.title ? <Text wordSafe>{g.title}</Text> : null}
                  <Text wordSafe variant="metadata">
                    {[g.year, g.seat, g.selection].filter(Boolean).join(' · ')}
                  </Text>
                  <RowSource
                    register={data!.index.meta.source}
                    record={g.id}
                    url={g.sourceUrl}
                    asOf={program!.asOf}
                    notes={[data!.notes.selection[g.selection]?.short]}
                    organisation={
                      g.organisation && g.recipientId
                        ? {
                            name: g.name,
                            path: `/money/grants/${jur}/recipient/${encodeURIComponent(g.recipientId)}`,
                          }
                        : null
                    }
                    testID={`program-source-${i}`}
                  />
                </>
              ) : (
                <Text wordSafe variant="metadata">
                  {formatCount(g.count)} listed grant records
                </Text>
              )}
            </Group>
          )
        }
        footer={
          data ? (
            <RowList>
              <LinkRow
                title="The month’s largest grants"
                testID="program-largest"
                onPress={() => router.push('/largest-grants')}
              />
            </RowList>
          ) : null
        }
      />
    </>
  );
}
