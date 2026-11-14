import { View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { InsetGroup } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { Skeleton } from '../../design/states';
import { rhythm } from '../../design/tokens';
import {
  vicElectionRoute,
  vicSeatRoute,
} from '../../navigation/routes/vic-election';
import type { SeatChoice } from '../your-mp/model';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';
import { vicCopy as c } from './copy';
import { useElectionNow } from './clock';
import { VIC_ELECTION_INSTANTS } from './state';
import {
  todayEligible,
  todayStatus,
  todayWindow,
  savedDistrict,
} from './model';
import { useOverview } from './reads';
import { OverviewSource, SectionTitle } from './shared';

export function TodayBlock({
  attempt = 0,
  choice,
  seats,
}: {
  attempt?: number;
  choice: SeatChoice | null;
  seats: readonly Electorate[];
}) {
  const clock = useElectionNow();
  const eligible =
    todayWindow(clock) &&
    todayEligible(
      choice,
      seats,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  const read = useOverview(eligible, attempt);
  const o = read.record?.data;
  const now = useElectionNow(VIC_ELECTION_INSTANTS);
  if (!eligible || !todayWindow(now) || (!o && (read.error || !read.loading)))
    return null;
  if (!o || !read.record)
    return (
      <View testID="today-vic-election">
        <SectionTitle>{c.bar}</SectionTitle>
        <InsetGroup>
          <Skeleton shape="rows" count={2} label={c.loading} />
        </InsetGroup>
        <Skeleton
          shape="text"
          count={1}
          label={c.loading}
          testID="today-vic-election-sources"
        />
      </View>
    );
  const district = savedDistrict(choice?.stateSeatIds ?? [], seats, o);
  const status = todayStatus(o, now);
  return (
    <View testID="today-vic-election" style={{ gap: rhythm.tight }}>
      <SectionTitle>{c.bar}</SectionTitle>
      <InsetGroup>
        <LinkRow
          title={status[0]}
          titleRole="strong"
          detail={status[1]}
          symbol="calendar"
          symbolInk="votes"
          href={vicElectionRoute()}
          testID="today-vic-election-status"
        />
        <LinkRow
          title={district?.name ?? c.findDistrict}
          titleRole="strong"
          detail={district ? c.stateDistrict : c.findDetail}
          symbol="building.columns"
          symbolInk="votes"
          href={district ? vicSeatRoute(district.slug) : vicElectionRoute()}
          testID="today-vic-election-seat"
        />
      </InsetGroup>
      <OverviewSource record={read.record} today />
    </View>
  );
}
export default function ConnectedTodayBlock({
  attempt = 0,
}: {
  attempt?: number;
}) {
  const seat = useSeat();
  const directory = savedSeatDirectory();
  if (seat.status === 'loading' || seat.status === 'error') return null;
  return (
    <TodayBlock
      choice={seat.status === 'chosen' ? seat.choice : null}
      seats={directory?.electorates.data.electorates ?? []}
      attempt={attempt}
    />
  );
}
