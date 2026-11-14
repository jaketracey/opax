import { projectTitle } from './project-title';
import { throwIfAborted } from '../../api/abort';
import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, SegmentedPicker } from '../../design/controls';
import { formatDate, formatMoneyCompact } from '../../design/format';
import { FigureBlock } from '../../design/record';
import { LinkRow, MoneyRow } from '../../design/rows';
import { EmptyState } from '../../design/states';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { filtersRoute } from '../../navigation/routes/filters';
import { fundingBySeatTypeRoute } from '../../navigation/routes/public-money';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { registerFilterModel } from '../sheets/filter-model';
import { allocationFilterModel, stateChoices } from '../sheets/filter-models';
import { combine } from './catalog';
import {
  counted,
  ListCaption,
  matches,
  moneyBar,
  moneyCitation,
  MoneyList,
  MoneyStatus,
  readableDates,
  recordSource,
  TitleAlias,
  useMoneySearch,
  yearRange,
} from './parts';
import { moneyItemHref } from './routes';
import { unnamedRecipient } from './privacy';
import { money } from './runtime';

const MERIT =
  'A difference in funding does not establish that a project lacked merit. The government describes this program as delivering election commitments. Assessment scores and unsuccessful applications would be needed to test merit.';
const EARLIER =
  'The earlier-grants view is a selection of sourced project examples from other programs, not a complete national or state total. Its year field uses each notice’s original publication year, with the latest known award value. It does not reconstruct the record as it stood that year.';
const INVITATIONS = {
  label: 'Departmental invitation list',
  title: 'The department’s invitation list, November 2025',
};
export const SEPARATE_LISTS =
  'Invitations and awards are separate lists. Don’t add them together.';
export const LATEST_VALUES =
  'Latest award values, not payments made that year.';

export type Stage = 'awards' | 'invitations' | 'history';
/** A record in the chosen state ('' for all), matched on the export's code. */
export const inState = (record: string | null | undefined, state: string) =>
  !state || (record ?? '').trim().toLowerCase() === state.toLowerCase();
/** "New South Wales" for a state code. */
const stateLabel = (code: string) =>
  stateChoices.find((s) => s.value === code.toLowerCase())?.label ?? '';
const monthYear = (date: string) =>
  formatDate(date, 'short').replace(/^\d{1,2} /, '');
/** The financial year a date falls in: "2024–25". */
const financialYear = (date: string) => {
  const year = Number(date.slice(0, 4)),
    month = Number(date.slice(5, 7));
  const start = month >= 7 ? year : year - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
};
function span(dates: string[], format: (d: string) => string) {
  const sorted = dates.filter(Boolean).sort();
  if (!sorted.length) return '';
  const a = format(sorted[0]!),
    b = format(sorted.at(-1)!);
  return a === b ? a : `${a} to ${b}`;
}

/**
 * Community funding (specs/money.md 2.6): large title and bar search, the
 * stage's figure block, "Awards | Invitations | Earlier grants", a caption,
 * project rows that push their money item, and "Funding by seat type". The
 * state and year live in the filter sheet (`/filters/allocation`) and in the
 * route's params, so they survive Share and back. The election-margin
 * lookup is gone and `mlci.json` `seats` is no longer read.
 */
export default function Allocation() {
  const params = useLocalSearchParams<{
    state?: string;
    through?: string;
    stage?: string;
  }>();
  const state = (params.state ?? '').toLowerCase(),
    through = /^\d{4}$/.test(params.through ?? '') ? params.through! : '';
  const load = useCallback(
    async (refresh: boolean, _publish: unknown, signal?: AbortSignal) => {
      // The report is still read (next-app-build item 1) but never gates the
      // page: a failure leaves the list drawn.
      void money.report(refresh, signal).catch(() => {
        throwIfAborted(signal);
        return undefined;
      });
      const [allocation, history, locations] = await Promise.all([
        money.allocation(refresh, signal),
        money.history(refresh, signal),
        money.locations(refresh, signal).catch(() => {
          throwIfAborted(signal);
          return null;
        }),
      ]);
      return combine(
        locations ? [allocation, history, locations] : [allocation, history],
        {
          allocation: allocation.data,
          history: history.data,
          locations: locations?.data ?? null,
        },
      );
    },
    [],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data;
  const [stage, setStage] = useState<Stage>(
    params.stage === 'invitations' || params.stage === 'history'
      ? params.stage
      : 'awards',
  );
  const search = useMoneySearch('Projects');
  const years = useMemo(
    () => [
      ...new Set(
        (data?.history.records ?? []).map((r) => Number(r.date.slice(0, 4))),
      ),
    ],
    [data],
  );
  useEffect(() => {
    registerFilterModel(
      allocationFilterModel({
        years,
        earlier: stage === 'history',
        loaded: !!data,
      }),
      {
        value: { state, year: through ? Number(through) : '' },
        onChange: (next) =>
          router.setParams({
            state: next.state ? String(next.state) : undefined,
            through: next.year ? String(next.year) : undefined,
          }),
      },
    );
  }, [years, stage, data, state, through]);
  const all = useMemo(
    () =>
      stage === 'history'
        ? (data?.history.records ?? [])
        : stage === 'invitations'
          ? (data?.allocation.projects ?? [])
          : (data?.allocation.awards ?? []),
    [data, stage],
  );
  const resolvedTitleOf = useCallback(
    (r: (typeof all)[number]) =>
      (stage === 'history' ||
      ('recipient' in r && r.recipient === unnamedRecipient)
        ? undefined
        : data?.locations?.records.find(
            (l) =>
              l.id === r.id &&
              l.kind === (stage === 'invitations' ? 'invitation' : 'award'),
          )?.title) ?? r.title,
    [data, stage],
  );
  const titleOf = (r: (typeof all)[number]) => projectTitle(resolvedTitleOf(r));
  const filtered = all.filter(
    (p) =>
      inState(p.state, state) &&
      (stage !== 'history' || !through || p.date.slice(0, 4) <= through),
  );
  const rows = filtered
    .filter((p) => matches(search.query, p.id, p.title, resolvedTitleOf(p)))
    .sort((a, b) => b.value - a.value);
  const noun =
    stage === 'awards'
      ? ['award', 'awards']
      : stage === 'invitations'
        ? ['invitation', 'invitations']
        : ['earlier grant', 'earlier grants'];
  const where = state ? ` in ${stateLabel(state)}` : '';
  const searching = !!search.query.trim();
  const caption = searching
    ? `${rows.length.toLocaleString('en-AU')} of ${counted(filtered.length, noun[0]!, noun[1])}`
    : `${counted(filtered.length, noun[0]!, noun[1])}${where}, largest first`;
  const total = all.reduce((sum, p) => sum + p.value, 0);
  const line =
    stage === 'awards'
      ? `in ${counted(all.length, 'published award')}, ${span(
          all.map((p) => p.date),
          monthYear,
        )}`
      : stage === 'invitations'
        ? `in ${counted(all.length, 'invitation to apply', 'invitations to apply')}, in the ${data ? formatDate(data.allocation.invitationsAsOf, 'long').replace(/^\d{1,2} /, '') : ''} list`
        : `in ${counted(all.length, 'earlier grant')}, ${span(
            all.map((p) => p.date),
            financialYear,
          )}`;
  const saved = recordSource(status.record);
  const name = 'Community funding';
  const filtersActive = !!state || (stage === 'history' && !!through);
  return (
    <>
      <RouteOptions
        options={{
          title: name,
          headerLargeTitleEnabled: true,
          headerLargeTitleShadowVisible: false,
          headerSearchBarOptions: search.options,
          ...moneyBar({
            name,
            path: '/money/grants?jur=federal&program=GO7867',
            filters: {
              active: filtersActive,
              href: filtersRoute('allocation'),
            },
            extra: [
              {
                title: 'Funding by seat type',
                symbol: 'chart.bar.doc.horizontal',
                onPress: () => router.push(fundingBySeatTypeRoute),
              },
            ],
          }),
        }}
      />
      <MoneyList
        loaded={!!data}
        id="allocation-list"
        rows={rows}
        rowKey={(r) => r.id}
        refreshing={status.refreshing}
        refresh={status.refresh}
        header={
          <>
            <TitleAlias title={name} testID="allocation-title" />
            <Text wordSafe variant="secondary">
              Election commitment grants: what each project is for, who received
              it and where.
            </Text>
            <MoneyStatus
              status={status}
              name={name}
              testID="allocation-status"
            />
            {data ? (
              <>
                <FigureBlock
                  value={formatMoneyCompact(total)}
                  ink="money"
                  label={line}
                  caveat={stage === 'history' ? LATEST_VALUES : SEPARATE_LISTS}
                  citation={{
                    asOf:
                      stage === 'history'
                        ? data.history.asOf
                        : stage === 'invitations'
                          ? data.allocation.invitationsAsOf
                          : data.allocation.asOf,
                    citation: [
                      stage === 'invitations'
                        ? INVITATIONS
                        : moneyCitation('GrantConnect'),
                    ],
                    savedAt: saved.savedAt,
                    state: saved.state,
                    originals:
                      stage === 'invitations' &&
                      data.allocation.sources.department
                        ? [
                            {
                              label: INVITATIONS.label,
                              url: data.allocation.sources.department,
                            },
                          ]
                        : [
                            {
                              label: 'GrantConnect',
                              url: 'https://www.grants.gov.au/Ga/List',
                            },
                          ],
                    notes: [
                      MERIT,
                      EARLIER,
                      ...(data.locations?.methodology ?? []),
                      ...(stage === 'history'
                        ? data.history.methodology.filter(
                            (m) => !m.includes('© OpenStreetMap'),
                          )
                        : []),
                      ...saved.stateNotes,
                    ].map(readableDates),
                    testID: 'allocation-source',
                  }}
                  testID="allocation-figure"
                />
                <SegmentedPicker
                  accessibilityLabel="Show"
                  value={stage}
                  onChange={(next) => {
                    setStage(next);
                    router.setParams({ stage: next });
                  }}
                  options={[
                    {
                      value: 'awards',
                      label: 'Awards',
                      testID: 'allocation-awards',
                    },
                    {
                      value: 'invitations',
                      label: 'Invitations',
                      testID: 'allocation-invitations',
                    },
                    {
                      value: 'history',
                      label: 'Earlier grants',
                      testID: 'allocation-history',
                    },
                  ]}
                  testID="allocation-stage"
                />
                <ListCaption announce={searching} testID="allocation-caption">
                  {caption}
                </ListCaption>
              </>
            ) : null}
          </>
        }
        empty={
          searching ? (
            <EmptyState
              message={`No projects match “${search.query.trim()}”.`}
              testID="allocation-empty"
            />
          ) : state ? (
            <View style={{ gap: rhythm.tight }}>
              <EmptyState
                message={`No ${noun[1]} in ${stateLabel(state)}.`}
                testID="allocation-empty"
              />
              <Button
                label="Show all states"
                variant="plain"
                onPress={() => router.setParams({ state: undefined })}
                testID="allocation-all-states"
              />
            </View>
          ) : null
        }
        render={(r, i) => (
          <MoneyRow
            name={titleOf(r)}
            nameLines={2}
            detail={[
              stateLabel(r.state),
              r.date ? formatDate(r.date, 'short') : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            amount={r.value}
            href={moneyItemHref(
              {
                kind:
                  stage === 'history'
                    ? 'earlier'
                    : stage === 'invitations'
                      ? 'project'
                      : 'award',
                id: r.id,
              },
              { name: titleOf(r) },
            )}
            testID={`allocation-project-${i}`}
          />
        )}
        footer={
          data ? (
            <LinkRow
              title="Funding by seat type"
              testID="allocation-seat-type"
              href={fundingBySeatTypeRoute}
            />
          ) : null
        }
      />
    </>
  );
}

export { yearRange };
