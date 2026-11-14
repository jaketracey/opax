import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../design/layout';
import { Text } from '../../design/text';
import { LinkRow, ValueRow } from '../../design/rows';
import { Skeleton } from '../../design/states';
import { useOffline } from '../../api/useOffline';
import { RouteOptions } from '../../navigation/preview';
import { vicSeatRoute } from '../../navigation/routes/vic-election';
import { vicCopy as c } from './copy';
import { useElectionNow } from './clock';
import { ElectionUnavailable, useElectionSeat, useOverview } from './reads';
import {
  contestName,
  decimal,
  electionState,
  percentage,
  phase,
  seatContext,
} from './model';
import { VIC_ELECTION_INSTANTS } from './state';
import { ElectionStatus } from './Status';
import { ElectionResults } from './Results';
import { Candidates } from './Candidates';
import { KeyDates } from './KeyDates';
import { MemberRecord, MemberRow, MemberSource } from './MemberRecord';
import { SeatRow } from './rows';
import {
  About,
  Block,
  ElectionFoot,
  ElectionSource,
  ExternalRow,
  Unavailable,
  pageOptions,
  shortDate,
} from './shared';

export default function Seat() {
  const { district = '' } = useLocalSearchParams<{ district: string }>();
  const read = useElectionSeat(district);
  const overview = useOverview();
  const s = read.record?.data;
  const o = overview.record?.data;
  const now = useElectionNow(
    o
      ? [
          ...VIC_ELECTION_INSTANTS,
          o.polls_close,
          ...o.key_dates.flatMap((d) => (d.passes_at ? [d.passes_at] : [])),
        ]
      : VIC_ELECTION_INSTANTS,
  );
  const offline = useOffline();
  const title = s ? (s.kind === 'region' ? c.regionName(s.name) : s.name) : '';
  const contests = s?.result
    ? [...(s.result.since ? [s.result.since] : []), s.result.general]
    : [];
  const context = s ? seatContext(s, o) : {};
  const state = electionState(context, now);
  return (
    <>
      <RouteOptions options={pageOptions(title, s?.web_url)} />
      <Screen
        testID="vic-seat-screen"
        barTitle={title}
        offline={
          offline && read.record ? { savedAt: read.record.savedAt } : null
        }
      >
        {!s ||
        !read.record ||
        (!o && overview.loading) ||
        overview.error instanceof ElectionUnavailable ? (
          read.error || overview.error ? (
            <Unavailable
              seat
              error={read.error ?? overview.error}
              retry={() => {
                read.retry();
                void overview.retry();
              }}
            />
          ) : (
            <Skeleton shape="rows" count={9} label={c.loading} />
          )
        ) : (
          <>
            <Block>
              <Text wordSafe variant="pageTitle" accessibilityRole="header">
                {title}
              </Text>
              <Text wordSafe variant="secondary" tone="inkSoft">
                {s.kind === 'district'
                  ? s.region
                    ? c.districtHead(s.region.name)
                    : s.boundary_note
                  : c.regionHead(s.members.length, s.districts.length)}
              </Text>
              {s.formerly ? (
                <Text wordSafe variant="secondary" tone="inkSoft">
                  {c.formerly(
                    s.kind === 'region' ? c.regionName(s.formerly) : s.formerly,
                  )}
                </Text>
              ) : s.created ? (
                <Text wordSafe variant="secondary" tone="inkSoft">
                  {c.created}
                </Text>
              ) : null}
            </Block>
            <ElectionStatus
              context={context}
              now={now}
              electionURL={o?.sources.election}
              votingURL={o?.sources.voting}
              awaiting={
                s.kind === 'district' &&
                (state === 'results' || state === 'results_final') &&
                !context.current_result
              }
            />
            <ElectionResults o={o} seat={s} now={now} />
            {s.kind === 'district' ? (
              <Block title={c.lastResult} testID="vic-seat-result">
                {phase(context, now) === 'closed' ? (
                  <Text wordSafe variant="footnote" tone="inkSoft">
                    {c.beforeResult}
                  </Text>
                ) : null}
                <Text testID="vic-seat-held" variant="secondary" tone="inkSoft">
                  {c.lastHeld}
                </Text>
                <MemberRow member={s.members[0]!} />
                {contests.map((contest, index) => (
                  <Block
                    key={`${contest.kind}:${contest.date}`}
                    testID={`vic-seat-contest-${index}`}
                  >
                    <Text wordSafe variant="strong">
                      {contestName(contest)}
                    </Text>
                    <Text
                      wordSafe
                      variant="body"
                      accessibilityLabel={c.preferences(
                        contest.party,
                        c.perCent(decimal(contest.share)),
                        contest.against,
                        c.perCent(decimal(contest.against_share)),
                      )}
                    >
                      {c.preferences(
                        contest.party,
                        percentage(contest.share),
                        contest.against,
                        percentage(contest.against_share),
                      )}
                    </Text>
                    {index === 0 ? (
                      <ValueRow
                        testID="vic-seat-margin"
                        label={c.margin}
                        value={c.points(decimal(contest.margin))}
                      />
                    ) : null}
                  </Block>
                ))}
                <ElectionSource
                  record={read.record}
                  dateLabel={c.resultsAt(shortDate(s.results_fetched))}
                  citation={c.vecSource}
                  originals={contests.map((contest) => ({
                    label: c.vecResult(contestName(contest)),
                    url: contest.url,
                  }))}
                />
              </Block>
            ) : null}
            <Candidates record={read.record} o={o} now={now} />
            {s.kind === 'district' ? (
              <>
                <MemberRecord member={s.members[0]!} record={read.record} />
                {s.region ? (
                  <Block title={c.upper(s.region.name)}>
                    <Text wordSafe variant="footnote" tone="inkSoft">
                      {c.upperDetail(s.name, s.region.members.length)}
                    </Text>
                    <LinkRow
                      testID="vic-seat-region"
                      title={c.regionName(s.region.name)}
                      detail={c.records}
                      href={vicSeatRoute(s.region.slug)}
                    />
                  </Block>
                ) : null}
              </>
            ) : (
              <>
                <Block
                  title={
                    o
                      ? c.members(
                          o.term_start.slice(0, 4),
                          o.term_end.slice(0, 4),
                        )
                      : c.memberList
                  }
                >
                  {s.members.map((m) => (
                    <MemberRow
                      key={m.slug}
                      member={m}
                      detail={[
                        m.speeches
                          ? c.memberSpeeches(
                              m.speeches.count,
                              m.speeches.first,
                              m.speeches.last,
                            )
                          : null,
                        m.votes
                          ? c.memberVotes(
                              m.votes.count,
                              s.division_end.slice(0, 4),
                            )
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                  <MemberSource record={read.record} />
                </Block>
                <Block title={c.regionDistricts}>
                  <Text wordSafe variant="footnote" tone="inkSoft">
                    {c.districtNote}
                  </Text>
                  {s.districts.map((d) => (
                    <SeatRow key={d.slug} district={d} />
                  ))}
                </Block>
              </>
            )}
            {o ? <KeyDates o={o} context={context} now={now} /> : null}
            <ExternalRow
              testID="vic-seat-map"
              title={s.kind === 'district' ? c.districtMap : c.regionMap}
              url={s.source_url}
            />
            {o ? <About o={o} /> : null}
            <ElectionFoot o={o} testID="vic-seat-foot" />
          </>
        )}
      </Screen>
    </>
  );
}
