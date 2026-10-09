import { useCallback, useMemo, useState } from 'react';
import {
  AsAtLine,
  Disclosure,
  InfoButton,
  Field,
  Group,
  KeyValueList,
  Section,
  SourceLink,
  Text,
} from '../../design/primitives';
import {
  formatDate,
  formatMoneyCompact,
  formatPercent,
} from '../../design/format';
import { RecordStatus } from '../RecordStatus';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { money } from './runtime';
import {
  MoneyHeader,
  MoneyChoices,
  MoneyList,
  ResultCount,
  Title,
} from './parts';
export default function Allocation() {
  const load = useCallback(async (refresh: boolean) => {
    const [report, allocation, history, locations] = await Promise.all([
      money.report(refresh),
      money.allocation(refresh),
      money.history(refresh),
      money.locations(refresh),
    ]);
    return combine([report, allocation, history, locations], {
      report: report.data,
      allocation: allocation.data,
      history: history.data,
      locations: locations.data,
    });
  }, []);
  const status = useCatalogRecord(load),
    data = status.record?.data;
  const [stage, setStage] = useState('awards'),
    [query, setQuery] = useState(''),
    [state, setState] = useState(''),
    [through, setThrough] = useState(''),
    [seat, setSeat] = useState(''),
    [comparison, setComparison] = useState(false),
    [marginOpen, setMarginOpen] = useState(false);
  const rows = useMemo(
    () =>
      (stage === 'history'
        ? (data?.history.records ?? [])
        : stage === 'invitations'
          ? (data?.allocation.projects ?? [])
          : (data?.allocation.awards ?? [])
      ).filter(
        (p) =>
          (!state || p.state.toLowerCase() === state.trim().toLowerCase()) &&
          [p.id, p.title]
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (stage !== 'history' ||
            !/^\d{4}$/.test(through) ||
            p.date.slice(0, 4) <= through),
      ),
    [data, stage, query, state, through],
  );
  const seats =
    data?.allocation.seats
      .filter(
        (s) =>
          seat.trim() &&
          s.name.toLowerCase().includes(seat.trim().toLowerCase()),
      )
      .slice(0, 10) ?? [];
  const date =
    stage === 'history'
      ? data?.history.asOf
      : stage === 'invitations'
        ? data?.allocation.invitationsAsOf
        : data?.allocation.asOf;
  const source =
    stage === 'history'
      ? 'GrantConnect; verified historical grant venues'
      : stage === 'invitations'
        ? 'Departmental invitation list'
        : 'GrantConnect';
  return (
    <>
      <MoneyHeader
        title="Where community funding goes"
        path="/reports/grants-allocation"
      />
      <MoneyList
        loaded={!!status.record}
        id="allocation-list"
        rows={rows}
        rowKey={(r) => r.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <Title id="allocation-title">Where community funding goes</Title>
            <Text wordSafe>
              See what a grant was for, who it was awarded to and where the
              project is.
            </Text>
            <RecordStatus
              {...status}
              label="Loading community funding"
              testID="allocation-status"
            />
            <MoneyChoices
              value={stage}
              onChange={setStage}
              options={[
                ['awards', 'Published awards', 'allocation-awards'],
                ['invitations', 'Invitations', 'allocation-invitations'],
                ['history', 'Earlier grants', 'allocation-history'],
              ]}
            />
            {data ? (
              <>
                <Text wordSafe>
                  They are separate snapshots: invitations and awards must not
                  be added together.
                </Text>
                <AsAtLine asOf={date ?? null} citation={source} />
              </>
            ) : null}
            <Field
              label="Find a project"
              testID="allocation-search"
              value={query}
              onChangeText={setQuery}
              returnKeyType="done"
            />
            <Field
              label="State or territory code (blank for all)"
              value={state}
              onChangeText={setState}
              returnKeyType="done"
            />
            {stage === 'history' ? (
              <>
                <Field
                  label="Show grants published by the end of year (blank for all years)"
                  value={through}
                  onChangeText={setThrough}
                  keyboardType="number-pad"
                />
                <Text wordSafe>
                  These are selected examples. Amounts are the latest recorded
                  award values, including any later updates; they do not show
                  payments made that year.
                </Text>
              </>
            ) : null}
            <Disclosure
              label="Compare the wider picture"
              testID="allocation-comparison"
              open={comparison}
              onToggle={setComparison}
            >
              {data ? (
                <Section
                  title="How invitations were shared"
                  accent="money"
                  info={{
                    title: 'About the seat comparison',
                    notes: [
                      data.allocation.provenance,
                      'The seat comparison reproduces the Centre for Public Integrity’s published Table 3, including its by-election adjustments and Brisbane exception. Opax has not independently reproduced it from every project’s location. The electorate picker uses the AEC’s unadjusted 2025 baseline.',
                    ],
                  }}
                >
                  <Text wordSafe>
                    These comparisons use the department’s November 2025
                    invitation list.
                  </Text>
                  {data.allocation.comparison.map((r) => (
                    <Group key={r.name}>
                      <Text wordSafe variant="strong">
                        {r.name}
                      </Text>
                      <KeyValueList
                        items={[
                          {
                            label: 'Published comparison',
                            value: formatMoneyCompact(r.actual),
                          },
                          {
                            label: 'if shared in proportion to seat numbers',
                            value: formatMoneyCompact(r.expected),
                          },
                        ]}
                      />
                    </Group>
                  ))}
                  <AsAtLine
                    asOf={data.allocation.asOf}
                    citation="Centre for Public Integrity, Table 3"
                  />
                  <SourceLink
                    citation="Centre for Public Integrity report"
                    url={data.allocation.sources.cpi!}
                    kind="record"
                  />
                </Section>
              ) : null}
            </Disclosure>
            <Disclosure
              label="Look up an electorate’s election margin"
              testID="allocation-margin"
              open={marginOpen}
              onToggle={setMarginOpen}
            >
              <Section
                title="Election margin"
                accent="money"
                info={{
                  title: 'About election margins',
                  notes: [
                    'These margins describe seats before the 2025 federal election.',
                  ],
                }}
              >
                <Field
                  label="Electorate"
                  value={seat}
                  onChangeText={setSeat}
                  testID="allocation-margin-search"
                  returnKeyType="done"
                />
                {seats.map((s) => (
                  <Group key={`${s.name}-${s.state}`}>
                    <Text wordSafe variant="strong">
                      {s.name} · {s.state}
                    </Text>
                    <Text wordSafe>
                      {s.party} · {formatPercent(s.margin)} · {s.baseline}
                    </Text>
                    <AsAtLine
                      asOf={data!.allocation.asOf}
                      citation="AEC seat status, 2025 election"
                    />
                  </Group>
                ))}
                {seat && !seats.length ? (
                  <Text wordSafe>
                    No electorate matches the available AEC baseline.
                  </Text>
                ) : null}
                {data ? (
                  <SourceLink
                    citation="AEC seat status, 2025 election"
                    url={data.allocation.sources.aec!}
                    kind="record"
                  />
                ) : null}
              </Section>
            </Disclosure>
            <ResultCount
              count={data ? rows.length : null}
              noun="project records"
            />
          </>
        }
        render={(r, i) => {
          const location =
            stage === 'history'
              ? undefined
              : data!.locations.records.find(
                  (l) =>
                    l.id === r.id &&
                    l.kind ===
                      (stage === 'invitations' ? 'invitation' : 'award'),
                );
          return (
            <Group>
              <Text
                wordSafe
                variant="strong"
                testID={`allocation-project-${i}`}
              >
                {location?.title ?? r.title}
              </Text>
              <Text wordSafe variant="strong" tabular>
                {formatMoneyCompact(r.value)}
              </Text>
              <Text wordSafe variant="metadata">
                {r.id} · {r.state || 'Delivery state not recorded'} ·{' '}
                {'status' in r ? r.status : r.program}
                {r.date ? ` · Published ${formatDate(r.date)}` : ''}
              </Text>
              {location?.sites.map((site, j) => (
                <Group key={j}>
                  <Text wordSafe>
                    {site.name} · {site.address}
                  </Text>
                  <AsAtLine
                    asOf={data!.locations.asOf}
                    citation="Verified project venue sources"
                  />
                  <SourceLink
                    citation="Project location evidence"
                    url={site.sourceUrl}
                    kind="record"
                  />
                </Group>
              ))}
              <AsAtLine asOf={date ?? null} citation={source} />
              <SourceLink
                citation={source}
                record={r.id}
                url={r.sourceUrl}
                kind="record"
              />
            </Group>
          );
        }}
        footer={
          data ? (
            <InfoButton
              title="About community funding"
              notes={[
                'A difference in funding does not establish that a project lacked merit. The government describes this program as delivering election commitments. Assessment scores and unsuccessful applications would be needed to test merit.',
                'The earlier-grants view is a selection of sourced project examples from other programs, not a complete national or state total. Its year slider uses each notice’s original publication year, with the latest known award value. It does not reconstruct the record as it stood that year.',
                ...data.locations.methodology,
                ...(stage === 'history'
                  ? data.history.methodology.filter(
                      (m) => !m.includes('© OpenStreetMap'),
                    )
                  : []),
              ]}
            />
          ) : null
        }
      />
    </>
  );
}
