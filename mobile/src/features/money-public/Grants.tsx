import { throwIfAborted } from '../../api/abort';
import { RouteOptions } from '../../navigation/preview';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View as NativeView } from 'react-native';
import { catalogs } from '../../api/runtime';
import { Button, SegmentedPicker } from '../../design/controls';
import { formatMoney, formatMoneyCompact } from '../../design/format';
import { Section } from '../../design/layout';
import { FigureBlock } from '../../design/record';
import { LinkRow, MoneyRow, ValueRow } from '../../design/rows';
import { EmptyState } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import {
  grantProgramRoute,
  grantsRoute,
  largestGrantsRoute,
} from '../../navigation/routes/public-money';
import { electorateRoute } from '../../navigation/routes/your-mp';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useNamedBackTitle } from '../../navigation/useNamedBackOptions';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { stateChoices } from '../sheets/filter-models';
import type { GrantIndex, Jurisdiction } from './data';
import { FUTURE_YEARS_NOTE, GRANTS_CAVEAT, grantsFigure } from './HubCards';
import {
  ListCaption,
  MoneyList,
  MoneyStatus,
  counted,
  fy,
  fyRange,
  matches,
  moneyBar,
  moneyCitation,
  readableDates,
  recordSource,
  useMoneySearch,
} from './parts';
import { organisationHref } from './routes';
import { money } from './runtime';
import { combine } from './catalog';
import { SeatFigure, seatRow } from './SeatGrants';
import { useSeatGrants } from './useSeatGrants';

/** "New South Wales" for "nsw". */
export const stateName = (code: string) =>
  stateChoices.find((s) => s.value === code.toLowerCase())?.label ??
  code.toUpperCase();

type View = 'programs' | 'recipients' | 'electorates';
export default function Grants() {
  const params = useLocalSearchParams<{
    jur?: string;
    seat?: string;
    state?: string;
    view?: string;
  }>();
  const jur: Jurisdiction = params.jur === 'qld' ? 'qld' : 'federal';
  // A seat is always a federal division; Queensland has no seat view, so a
  // seat with jur=qld opens the Commonwealth seat view (specs/money.md 2.2).
  if (params.seat && params.view !== 'electorates')
    return (
      <SeatView
        key={`seat-${params.seat}-${params.state ?? ''}`}
        seat={params.seat}
        state={params.state}
      />
    );
  return (
    <GrantList
      key={jur}
      jur={jur}
      initialView={
        params.view === 'electorates' && jur === 'federal'
          ? params.seat
            ? 'seat'
            : 'electorates'
          : params.view === 'recipients' && jur === 'federal'
            ? 'recipients'
            : 'programs'
      }
      seat={params.seat}
      state={params.state}
    />
  );
}

function useGrantIndex(jur: Jurisdiction) {
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      money.grants(jur, refresh, signal),
    [jur],
  );
  return useCatalogRecord(load);
}

/** The grants sheet's Notes (specs/money.md 2.2, journeys/money.md 4.5). */
function grantNotes(index: GrantIndex) {
  const c = index.counts;
  return [
    index.meta.coverage,
    index.jur === 'federal' && c.recipients
      ? `${c.donorRecipients.toLocaleString('en-AU')} of ${c.recipients.toLocaleString('en-AU')} recipients also appear in political donation records. They received ${formatMoneyCompact(c.donorDollars)}, ${(c.donorShare * 100).toFixed(1)}% of the total.`
      : null,
    c.programsTotal > index.programs.length
      ? `The list shows the ${index.programs.length.toLocaleString('en-AU')} largest of ${c.programsTotal.toLocaleString('en-AU')} programs.`
      : null,
    c.undisclosedDollars
      ? `${formatMoneyCompact(c.undisclosedDollars)} went to recipients the register doesn't name.`
      : null,
    index.jur === 'federal' ? FUTURE_YEARS_NOTE : null,
    index.meta.threshold,
    ...index.meta.caveats,
  ];
}

function GrantList({
  jur,
  initialView,
  seat,
  state,
}: {
  jur: Jurisdiction;
  initialView: View | 'seat';
  seat?: string;
  state?: string;
}) {
  const status = useGrantIndex(jur),
    data = status.record?.data;
  const [view, setView] = useState<View>(
    initialView === 'seat' ? 'electorates' : initialView,
  );
  const title = jur === 'federal' ? 'Commonwealth grants' : 'Queensland grants';
  const backTitle = useNamedBackTitle();
  const titleRef = useRef<NativeView>(null);
  const scrollTitle = useTitleOnScroll(titleRef, title, {
    routeTitle: title,
    backTitle,
  });
  const search = useMoneySearch(
    view === 'programs'
      ? 'Grant programs'
      : view === 'recipients'
        ? 'Recipients'
        : 'Electorates',
  );
  // A seat in the link seeds the electorates search once; typing or another
  // view drops it, so cancelling the search shows the full list again.
  const [seeded, setSeeded] = useState(initialView === 'seat');
  if (seeded && search.query) setSeeded(false);
  const query = search.query || (seeded ? (seat ?? '') : '');
  const organisations = useMemo(
    () =>
      (data?.recipients ?? [])
        .filter((r) => r.organisation)
        .sort((a, b) => b.total - a.total),
    [data],
  );
  const individuals = useMemo(() => {
    const people = (data?.recipients ?? []).filter((r) => !r.organisation);
    return {
      count: people.length,
      total: people.reduce((sum, r) => sum + r.total, 0),
    };
  }, [data]);
  const all = useMemo(
    () =>
      view === 'programs'
        ? (data?.programs ?? [])
        : view === 'recipients'
          ? organisations
          : (data?.seats ?? []),
    [view, data, organisations],
  );
  const rows = useMemo(
    () =>
      [...all]
        .filter((r) =>
          matches(query, r.name, 'state' in r ? stateName(r.state) : ''),
        )
        .sort((a, b) => b.total - a.total),
    [all, query],
  );
  const noun =
    view === 'programs'
      ? ['program', 'programs']
      : view === 'recipients'
        ? ['recipient', 'recipients']
        : ['electorate', 'electorates'];
  const caption = !data
    ? ''
    : query.trim()
      ? `${rows.length.toLocaleString('en-AU')} of ${counted(all.length, noun[0]!, noun[1])}`
      : view === 'recipients'
        ? `The ${counted(all.length, 'largest recipient', 'largest recipients')}, largest first`
        : `${counted(all.length, noun[0]!, noun[1])}, largest first`;
  const figure = data ? grantsFigure(data, 'grants') : null;
  const saved = recordSource(status.record);
  const path = `/money/grants?jur=${jur}${view === 'electorates' ? '&view=electorates' : ''}`;
  return (
    <>
      <RouteOptions
        options={{
          title,
          // One title size across the public money pages, wrapping at any
          // size: the in-content page title Public money and Largest grants
          // use. A system large title cut "Commonwealth grants" to
          // "Commonweal…" at AX3 (sweep 2 item 11).
          headerSearchBarOptions: search.options,
          ...moneyBar({ name: title, path }),
        }}
      />
      <MoneyList
        loaded={!!data}
        id="grants-list"
        rows={rows}
        rowKey={(r) => ('id' in r ? r.id : `${r.name}-${r.state}`)}
        refreshing={status.refreshing}
        refresh={status.refresh}
        onScroll={scrollTitle.onScroll}
        header={
          <>
            <NativeView
              ref={titleRef}
              collapsable={false}
              onLayout={scrollTitle.onTitleLayout}
            >
              <Heading level={1} kind="page" testID="grants-title">
                {title}
              </Heading>
            </NativeView>
            <NativeView style={{ gap: rhythm.block }}>
              <MoneyStatus
                status={status}
                name={title}
                testID="grants-status"
              />
              {data && figure ? (
                <FigureBlock
                  value={formatMoneyCompact(figure.value)}
                  ink="money"
                  caveat={jur === 'federal' ? GRANTS_CAVEAT : undefined}
                  label={
                    jur === 'qld'
                      ? `recorded annual spending, ${fyRange(data.meta.years[0] ?? '', data.meta.years.at(-1) ?? '')}`
                      : figure.line
                  }
                  citation={{
                    asOf: data.meta.asOf,
                    citation: [moneyCitation(data.meta.source)],
                    savedAt: saved.savedAt,
                    state: saved.state,
                    originals: data.meta.sourceUrl
                      ? [
                          {
                            label: moneyCitation(data.meta.source).label,
                            url: data.meta.sourceUrl,
                          },
                        ]
                      : [],
                    notes: [...grantNotes(data), ...saved.stateNotes].map(
                      readableDates,
                    ),
                    licence: data.meta.licence,
                    testID: 'grants-total-source',
                  }}
                  testID="grants-total"
                />
              ) : null}
            </NativeView>
            {data && figure ? (
              <>
                {figure.allYears ? (
                  <ValueRow
                    label={figure.allYears.label}
                    value={formatMoney(figure.allYears.value)}
                    testID="grants-all-years"
                  />
                ) : null}
                {jur === 'federal' ? (
                  <SegmentedPicker
                    accessibilityLabel="Show"
                    value={view}
                    onChange={(next) => {
                      setView(next);
                      setSeeded(false);
                      search.clear();
                    }}
                    options={[
                      {
                        value: 'programs',
                        label: 'Programs',
                        testID: 'grants-programs',
                      },
                      {
                        value: 'recipients',
                        label: 'Recipients',
                        testID: 'grants-recipients',
                      },
                      {
                        value: 'electorates',
                        label: 'Electorates',
                        testID: 'grants-electorates',
                      },
                    ]}
                    testID="grants-view"
                  />
                ) : null}
                <ListCaption announce={!!query.trim()} testID="grants-caption">
                  {caption}
                </ListCaption>
              </>
            ) : null}
          </>
        }
        empty={
          query.trim() ? (
            <EmptyState
              message={`No ${noun[1]} match “${query.trim()}”.`}
              testID="grants-empty"
            />
          ) : null
        }
        render={(r, i) =>
          'id' in r && 'key' in r ? (
            <MoneyRow
              name={r.name}
              detail={counted(r.count, 'grant')}
              amount={r.total}
              href={grantProgramRoute(r.id, jur, r.name)}
              testID={`grants-row-${i}`}
            />
          ) : 'state' in r ? (
            <MoneyRow
              name={r.name}
              detail={`${stateName(r.state)} · ${counted(r.count, 'grant')}`}
              amount={r.total}
              href={grantsRoute({
                jur: 'federal',
                seat: r.name,
                state: r.state,
              })}
              testID={`grants-row-${i}`}
            />
          ) : (
            <MoneyRow
              name={r.name}
              detail={counted(r.count, 'grant')}
              amount={r.total}
              href={organisationHref(r.id, r.name, jur)}
              testID={`grants-recipient-${i}`}
            />
          )
        }
        footer={
          data ? (
            <>
              {view === 'recipients' && individuals.count ? (
                <Text wordSafe variant="footnote" testID="grants-individuals">
                  {`${counted(individuals.count, 'individual recipient')}, ${formatMoney(individuals.total)}, not named.`}
                </Text>
              ) : null}
              {jur === 'federal' ? (
                <LinkRow
                  title="Largest grants"
                  testID="grants-largest"
                  href={largestGrantsRoute()}
                />
              ) : null}
            </>
          ) : null
        }
      />
    </>
  );
}

/**
 * Grants in one seat (specs/money.md 2.2, journeys/money.md 12.2 item 5):
 * the index supplies the figure; the seat slice supplies the grant rows.
 */
function SeatView({ seat, state }: { seat: string; state?: string }) {
  const load = useCallback(
    async (refresh: boolean, _publish: unknown, signal?: AbortSignal) => {
      const index = await money.grants('federal', refresh, signal);
      // The electorate page's id, from the shared directory; the row is left
      // out if the directory can't be read.
      const directory = await Promise.resolve()
        .then(() => catalogs.directory(undefined, signal))
        .catch(() => {
          throwIfAborted(signal);
          return null;
        });
      return { ...index, directory };
    },
    [],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data;
  const entry = data ? seatRow(data, seat, state) : undefined;
  const recipients = useMemo(
    () =>
      new Set(data?.recipients.filter((r) => r.organisation).map((r) => r.id)),
    [data],
  );
  const grants = useSeatGrants(entry?.key);
  const saved =
    status.record && grants.record && !grants.record.data.missing
      ? combine([status.record, grants.record], status.record.data)
      : status.record;
  const title = `Grants in ${seat}`;
  const electorate =
    status.record?.directory?.electorates.data.electorates.find(
      (e) =>
        e.jurisdiction === 'federal' &&
        e.chamber === 'representatives' &&
        e.status !== 'historical' &&
        e.name.toLocaleLowerCase('en-AU') === seat.toLocaleLowerCase('en-AU') &&
        (!state || e.state_code.toLowerCase() === state.toLowerCase()),
    );
  // Keep the constrained title laid out while hidden at rest.
  const barTitleRef = useRef<NativeView>(null);
  const barTitle = useTitleOnScroll(barTitleRef, title || undefined);
  return (
    <>
      <RouteOptions options={{ title, ...moneyBar({ name: title }) }} />
      <MoneyList
        onScroll={barTitle.onScroll}
        id="grants-seat"
        loaded={!!data}
        rows={grants.grants}
        rowKey={(r) => r.id}
        refreshing={status.refreshing || grants.refreshing}
        refresh={() => {
          status.refresh();
          grants.refresh();
        }}
        header={
          <>
            <NativeView
              ref={barTitleRef}
              collapsable={false}
              onLayout={barTitle.onTitleLayout}
            >
              <Heading level={1} kind="page" testID="grants-title">
                {title}
              </Heading>
            </NativeView>
            {state ? (
              <Text wordSafe variant="secondary" testID="grants-seat-state">
                {stateName(state)}
              </Text>
            ) : null}
            <MoneyStatus
              status={{ ...status, record: saved }}
              name={title}
              rows={1}
              testID="grants-status"
            />
            {data ? (
              <SeatFigure
                index={data}
                record={saved}
                name={seat}
                state={state}
                testID="grants-seat"
              />
            ) : null}
            {data ? (
              <>
                <Text
                  wordSafe
                  variant="footnote"
                  testID="grants-seat-award-note"
                >
                  An award is not a payment.
                </Text>
                <MoneyStatus
                  status={{
                    ...grants,
                    record: grants.record
                      ? { ...grants.record, stale: false }
                      : null,
                  }}
                  name="Grants"
                  figure={false}
                  testID="grants-seat-records"
                />
                {grants.record &&
                !grants.record.data.missing &&
                grants.grants.length ? (
                  <ListCaption testID="grants-seat-caption">
                    {`${grants.grants.length < (entry?.count ?? 0) ? `${grants.grants.length.toLocaleString('en-AU')} of ` : ''}${counted(entry?.count ?? grants.grants.length, 'grant')}, largest first`}
                  </ListCaption>
                ) : null}
              </>
            ) : null}
          </>
        }
        render={(r, i) => {
          // Only the index can back a named organisation's record page.
          // Program files contain a sample and cannot back a fallback link.
          const listed =
            r.organisation && !!r.recipientId && recipients.has(r.recipientId);
          return (
            <MoneyRow
              name={r.name}
              detail={[r.program, fy(r.year)].filter(Boolean).join(' · ')}
              amount={r.value}
              href={
                listed
                  ? organisationHref(r.recipientId, r.name, 'federal')
                  : undefined
              }
              testID={`grants-seat-grant-${i}`}
            />
          );
        }}
        empty={
          // A seat with no index row already says it has no matched grants
          // in its figure; a listed seat whose file is missing says only
          // that the list isn't published, never a zero.
          !!entry?.count &&
          (grants.record?.data.missing ||
            (grants.record && !grants.grants.length)) ? (
            <EmptyState
              message={`The individual grants for ${seat} aren't listed yet.`}
              testID="grants-seat-empty"
            />
          ) : null
        }
        footer={
          <>
            {grants.record &&
            (grants.record.data.next ||
              grants.record.data.grants.length > grants.grants.length) ? (
              <Button
                label={`Show all ${(entry?.count ?? 0).toLocaleString('en-AU')}`}
                variant="plain"
                loading={grants.loadingMore}
                onPress={grants.showAll}
                testID="grants-seat-show-all"
              />
            ) : null}
            {grants.record?.data.moreError ? (
              <MoneyStatus
                status={{
                  record: null,
                  error: grants.record.data.moreError,
                  retry: grants.showAll,
                }}
                name="Remaining grants"
                figure={false}
                testID="grants-seat-more"
              />
            ) : null}
            {data && electorate ? (
              <LinkRow
                title={electorate.name}
                symbol="map"
                testID="grants-seat-electorate"
                href={electorateRoute(
                  electorate.electorate_id,
                  undefined,
                  electorate.name,
                )}
              />
            ) : null}
            {data?.meta.sourceUrl ? (
              <Section title="Originals" testID="grants-seat-originals">
                <LinkRow
                  title={moneyCitation(data.meta.source).label}
                  external={{
                    url: data.meta.sourceUrl,
                    label: moneyCitation(data.meta.source).label,
                  }}
                  testID="grants-seat-original"
                />
              </Section>
            ) : null}
          </>
        }
      />
    </>
  );
}
