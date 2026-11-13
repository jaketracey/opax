import { throwIfAborted } from '../../api/abort';
import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ApiError } from '../../api/errors';
import { Button, SegmentedPicker } from '../../design/controls';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
} from '../../design/format';
import { FigureBlock } from '../../design/record';
import { LinkRow, MoneyRow } from '../../design/rows';
import { EmptyState } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import {
  agencyRoute,
  grantProgramRoute,
  grantsRoute,
  largestGrantsRoute,
} from '../../navigation/routes/public-money';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { shareRecord } from '../../navigation/share';
import { useOpenAsk } from '../ask/open';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { combine } from './catalog';
import { programRecipients, type Program as ProgramData } from './data';
import { GRANTS_CAVEAT } from './HubCards';
import {
  askAbout,
  counted,
  fy,
  fyRange,
  ListCaption,
  matches,
  moneyBar,
  moneyCitation,
  MoneyList,
  MoneyStatus,
  readableDates,
  recordSource,
  useMoneySearch,
} from './parts';
import { moneyItemHref, organisationHref } from './routes';
import { money } from './runtime';
import { SEAT_CAVEAT, SEAT_RULE } from './SeatGrants';

const lower = (v: string) => v.toLocaleLowerCase('en-AU');

/**
 * The program's figure for one seat (specs/money.md 2.4): the program file's
 * `electorates` list counts every grant with a recorded postcode, not only
 * the listed ones. A cached file without it falls back to the listed grants.
 */
export function programSeatFigure(
  program: ProgramData,
  seat: string,
  state?: string,
) {
  const inSeat = (name: string, st: string) =>
    lower(name) === lower(seat) &&
    (!state || !st || lower(st) === lower(state));
  const listed = program.grants.filter((g) => inSeat(g.seat, g.state));
  if (program.electorates) {
    const row = program.electorates.find((e) => inSeat(e.name, e.state));
    return row
      ? {
          value: row.total,
          count: row.count,
          listed: listed.length,
          line: `in ${counted(row.count, 'grant')} in ${seat}`,
          caveat: SEAT_CAVEAT,
        }
      : { value: 0, count: 0, listed: listed.length, line: '', caveat: '' };
  }
  const value = listed.reduce((sum, g) => sum + g.value, 0);
  const partial = program.listed < program.available;
  return {
    value,
    count: listed.length,
    listed: listed.length,
    line: partial
      ? `in ${listed.length.toLocaleString('en-AU')} of the ${program.listed.toLocaleString('en-AU')} listed grants`
      : `in ${counted(listed.length, 'grant')} in ${seat}`,
    caveat: partial
      ? `Only the ${program.listed.toLocaleString('en-AU')} largest grants are listed, so this is a minimum.`
      : SEAT_CAVEAT,
  };
}

type ProgramParams = {
  jur?: string;
  id?: string;
  key?: string;
  seat?: string;
  state?: string;
  name?: string;
};

export default function Program() {
  const params = useLocalSearchParams<ProgramParams>();
  return (
    <ProgramRecord
      key={JSON.stringify([params.jur, params.id, params.key])}
      params={params}
    />
  );
}

function ProgramRecord({ params }: { params: ProgramParams }) {
  const {
    jur: input,
    id,
    key: inputKey,
    seat,
    state,
    name: routeName,
  } = params;
  const jur = input === 'qld' ? 'qld' : 'federal';
  const load = useCallback(
    async (refresh: boolean, _publish: unknown, signal?: AbortSignal) => {
      const index = await money.grants(jur, refresh, signal);
      const entry = index.data.programs.find(
        (p) =>
          p.id === id ||
          p.key === inputKey ||
          p.key === id ||
          lower(p.id) === lower(id ?? ''),
      );
      if (!entry) throw new ApiError('not-found', 'Program not found.');
      const [program, notes] = await Promise.all([
        money.program(jur, entry.key, refresh, signal),
        money.notes(refresh, signal).catch(() => {
          throwIfAborted(signal);
          return null;
        }),
      ]);
      return combine(notes ? [index, program, notes] : [index, program], {
        index: index.data,
        program: program.data,
        notes: notes?.data ?? null,
      });
    },
    [jur, id, inputKey],
  );
  const status = useCatalogRecord(load),
    data = status.record?.data,
    program = data?.program;
  // The agency link resolves after content, so nothing shifts: drawn as
  // text first, then in the tint once the directory names it.
  const [agencyId, setAgencyId] = useState<string | null>(null);
  useEffect(() => {
    if (!program) return;
    let active = true;
    const controller = new AbortController();
    money
      .agencies(false, controller.signal)
      .then((r) => {
        const match = r.data.agencies.find(
          (a) => lower(a.name) === lower(program.agency),
        );
        if (active) setAgencyId(match?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      controller.abort();
    };
  }, [program]);
  const [view, setView] = useState<'recipients' | 'grants'>('recipients');
  const search = useMoneySearch(
    view === 'recipients' ? 'Recipients' : 'Grants',
    'button',
  );
  const titleRef = useRef<View>(null);
  const name = program?.name ?? routeName ?? '';
  const title = useTitleOnScroll(titleRef, name, { trailing: 1 });
  const openAsk = useOpenAsk();
  const seatGrants = useMemo(
    () =>
      (program?.grants ?? []).filter(
        (g) =>
          !seat ||
          (lower(g.seat) === lower(seat) &&
            (!state || !g.state || lower(g.state) === lower(state))),
      ),
    [program, seat, state],
  );
  const shown = seatGrants.filter((g) =>
    matches(search.query, g.name, g.id, g.title),
  );
  // Individuals are never a row (journeys/money.md 4.5): Recipients lists
  // organisations, and the grants to individuals are a footnote.
  const organisations = programRecipients(seatGrants).filter(
    (r) => r.organisation,
  );
  const recipients = organisations.filter((r) => matches(search.query, r.name));
  const individualGrants = seatGrants.filter((g) => !g.organisation);
  const individuals = {
    count: individualGrants.length,
    total: individualGrants.reduce((sum, g) => sum + g.value, 0),
  };
  type Row =
    | ({ kind: 'recipient'; i: number } & (typeof recipients)[number])
    | ({ kind: 'grant'; i: number } & (typeof shown)[number]);
  const rows: Row[] =
    view === 'recipients'
      ? recipients.map((r, i) => ({ kind: 'recipient' as const, i, ...r }))
      : shown.map((g, i) => ({ kind: 'grant' as const, i, ...g }));
  const seatFigure =
    program && seat ? programSeatFigure(program, seat, state) : null;
  const note = program ? data?.notes?.programs[jur][program.id] : undefined;
  const saved = recordSource(status.record);
  const register = moneyCitation(data?.index.meta.source ?? 'GrantConnect');
  const searching = !!search.query.trim();
  const caption = !program
    ? ''
    : searching
      ? `${rows.length.toLocaleString('en-AU')} of ${
          view === 'recipients'
            ? counted(organisations.length, 'recipient')
            : counted(seatGrants.length, 'grant')
        }`
      : seat && seatFigure
        ? view === 'grants'
          ? seatFigure.count && !seatGrants.length
            ? `None of the ${counted(seatFigure.count, 'grant')} in ${seat} is in the listed grants`
            : seatGrants.length < seatFigure.count
              ? `${seatGrants.length.toLocaleString('en-AU')} of the ${counted(seatFigure.count, 'grant')} in ${seat} ${seatGrants.length === 1 ? 'is' : 'are'} listed, largest first`
              : `${counted(seatGrants.length, 'grant')} in ${seat}, largest first`
          : `${counted(recipients.length, 'recipient')} in the listed grants in ${seat}, largest first`
        : view === 'recipients'
          ? `${counted(recipients.length, 'recipient')}, largest first`
          : `${counted(seatGrants.length, 'grant')}, largest first`;
  const path = `/money/grants?jur=${jur}&program=${encodeURIComponent(program?.id ?? id ?? '')}`;
  const otherGrants =
    jur === 'qld' ? 'Queensland grants' : 'Commonwealth grants';
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title: name,
          headerSearchBarOptions: search.options,
          ...moneyBar({
            name,
            path: program ? path : null,
            share: false,
            // Keep a named back item and a readable program name together.
            extra: program
              ? [
                  {
                    title: 'Share',
                    symbol: 'square.and.arrow.up',
                    onPress: () => void shareRecord({ path, title: name }),
                  },
                ]
              : [],
            ask: program
              ? () => openAsk({ question: askAbout(program.name) }, name)
              : null,
          }),
        }}
      />
      <MoneyList
        loaded={!!program}
        id="program-list"
        rows={rows}
        rowKey={(r) => `${r.kind}-${r.id}`}
        refreshing={status.refreshing}
        refresh={status.refresh}
        onScroll={title.onScroll}
        header={
          <>
            <View
              ref={titleRef}
              collapsable={false}
              onLayout={title.onTitleLayout}
            >
              <Heading level={1} testID="program-title">
                {name}
              </Heading>
            </View>
            <MoneyStatus
              status={status}
              name={name}
              notFound={{
                title: "This program isn't in the latest grant records",
                action: {
                  label: `See all ${otherGrants}`,
                  onPress: () => router.push(grantsRoute({ jur })),
                },
              }}
              testID="program"
            />
            {program && data ? (
              <>
                <AgencyLine
                  agency={program.agency}
                  agencyId={agencyId}
                  seat={seat}
                />
                {seatFigure && !seatFigure.line ? (
                  <Text wordSafe testID="program-seat-unmatched">
                    No grants in this program are matched to {seat}. This is not
                    a zero total.
                  </Text>
                ) : null}
                {seat && !seatFigure?.line ? null : (
                  <FigureBlock
                    value={formatMoneyCompact(
                      seatFigure?.line ? seatFigure.value : program.total,
                    )}
                    ink="money"
                    label={
                      seatFigure?.line
                        ? seatFigure.line
                        : `in ${counted(program.count, 'grant')}${program.years[0] ? `, ${fyRange(...program.years)}` : ''}`
                    }
                    caveat={
                      seatFigure?.line
                        ? seatFigure.caveat
                        : program.listed < program.available
                          ? `${program.listed.toLocaleString('en-AU')} of the ${counted(program.available, 'grant')} ${program.listed === 1 ? 'is' : 'are'} listed below.`
                          : undefined
                    }
                    citation={{
                      asOf: program.asOf,
                      citation: [register],
                      savedAt: saved.savedAt,
                      state: saved.state,
                      originals: [
                        ...(data.index.meta.sourceUrl
                          ? [
                              {
                                label: register.label,
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
                      ],
                      notes: [
                        jur === 'federal' ? GRANTS_CAVEAT : null,
                        ...data.index.meta.caveats,
                        seat
                          ? `The program's total is ${formatMoneyCompact(program.total)} in ${counted(program.count, 'grant')}.`
                          : null,
                        seat ? SEAT_RULE : null,
                        note?.summary,
                        ...(note?.audits ?? []).map(
                          (a) => `${a.title}: ${a.finding}`,
                        ),
                        note && data.notes
                          ? `Program notes by OPAX, as at ${formatDate(data.notes.asOf)}.`
                          : null,
                        ...saved.stateNotes,
                      ].map(readableDates),
                      licence: data.index.meta.licence,
                      testID: 'program-source',
                    }}
                    testID="program-total"
                  />
                )}
                <SegmentedPicker
                  accessibilityLabel="Show"
                  value={view}
                  onChange={(next) => {
                    setView(next);
                    search.clear();
                  }}
                  options={[
                    {
                      value: 'recipients',
                      label: 'Recipients',
                      testID: 'program-recipients',
                    },
                    {
                      value: 'grants',
                      label: 'Grants',
                      testID: 'program-grants',
                    },
                  ]}
                  testID="program-view"
                />
                <ListCaption announce={searching} testID="program-caption">
                  {caption}
                </ListCaption>
              </>
            ) : null}
          </>
        }
        empty={
          searching ? (
            <EmptyState
              message={`No ${view} match “${search.query.trim()}”.`}
              testID="program-empty"
            />
          ) : seat ? (
            <View style={{ gap: rhythm.tight }}>
              <EmptyState
                message={`No listed grants in ${seat}.`}
                testID="program-seat-empty"
              />
              <Button
                label="Show all recipients"
                variant="plain"
                onPress={() =>
                  router.setParams({ seat: undefined, state: undefined })
                }
                testID="program-show-all"
              />
            </View>
          ) : null
        }
        render={(r) =>
          r.kind === 'recipient' ? (
            <MoneyRow
              name={r.name}
              detail={counted(r.count, 'grant')}
              amount={r.value}
              href={
                r.recipientId
                  ? organisationHref(r.recipientId, r.name, jur)
                  : moneyItemHref(
                      {
                        kind: 'recipient',
                        jur,
                        program: program!.key,
                        recipient: r.name,
                      },
                      { name: r.name },
                    )
              }
              testID={`program-recipient-${r.id}`}
            />
          ) : (
            <MoneyRow
              name={r.name}
              detail={[fy(r.year), r.seat, r.selection]
                .filter(Boolean)
                .join(' · ')}
              amount={r.value}
              href={moneyItemHref(
                { kind: 'grant', jur, program: program!.key, id: r.id },
                { name: r.name },
              )}
              testID={`program-grant-${r.i}`}
            />
          )
        }
        footer={
          program ? (
            <>
              {view === 'recipients' && individuals.count ? (
                <Text wordSafe variant="footnote" testID="program-individuals">
                  {`${counted(individuals.count, 'grant')} to individual recipients, ${formatMoney(individuals.total)}, not named.`}
                </Text>
              ) : null}
              {seat ? (
                // The whole program, with no figure: nothing national is
                // drawn on the seat view (journeys/money.md 4.5, 12.4).
                <LinkRow
                  title="All of this program"
                  testID="program-national"
                  href={grantProgramRoute(program.id, jur, program.name)}
                />
              ) : null}
              <LinkRow
                title="Largest grants"
                testID="program-largest"
                href={largestGrantsRoute()}
              />
            </>
          ) : null
        }
      />
    </>
  );
}

/** The agency as a tint link where the agencies directory has it. */
function AgencyLine({
  agency,
  agencyId,
  seat,
}: {
  agency: string;
  agencyId: string | null;
  seat?: string;
}) {
  const label = (
    <Text wordSafe variant="secondary" tone={agencyId ? 'navy' : undefined}>
      {agency}
    </Text>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {agencyId ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={agency}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          onPress={() => router.push(agencyRoute(agencyId, agency))}
          testID="program-agency"
        >
          {label}
        </Pressable>
      ) : (
        <View testID="program-agency">{label}</View>
      )}
      {seat ? (
        <Text wordSafe variant="secondary">
          {` · in ${seat}`}
        </Text>
      ) : null}
    </View>
  );
}
