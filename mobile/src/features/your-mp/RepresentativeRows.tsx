import { CachedPortrait } from '../CachedPortrait';
import { formatDate } from '../../design/format';
import { router } from 'expo-router';
import type { Electorate } from '../../api/catalogs';
import { PersonRow, RowList } from '../../design/primitives';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../../design/parliament';
import { personRoute } from '../../navigation/routes';
import { representativeProfile, type Directory } from './model';
export function RepresentativeRows({
  rows,
  directory,
  asAt,
  id,
}: {
  rows: Electorate['representatives'];
  directory: Directory;
  asAt: string | null;
  id: string;
}) {
  return (
    <RowList>
      {rows.map((r) => {
        const profile = representativeProfile(r.person_id, directory);
        const observations =
          directory.people.data.people
            .find((p) => p.person_id === r.person_id)
            ?.electorates.filter((s) => s.current) ?? [];
        const seat = profile?.seats[0] ?? observations[0];
        const state = seat
          ? directory.electorates.data.electorates.find(
              (s) => s.electorate_id === seat.electorate_id,
            )?.state_code
          : undefined;
        return (
          <PersonRow
            key={r.person_id}
            testDrawnName
            testID={`${id}-${profile?.slug ?? r.person_id}`}
            name={r.person.name}
            portrait={
              <CachedPortrait name={r.person.name} slug={profile?.slug} />
            }
            party={profile?.party ?? r.party}
            partyCurrent={profile?.partyCurrent ?? observations.length > 0}
            formerly={profile?.formerly}
            place={
              seat
                ? `${seat.chamber === 'senate' ? 'Senator for' : 'Member for'} ${seat.name} · ${chamberName(seat.chamber, seat.jurisdiction) ?? CHAMBER_NOT_RECORDED} · ${jurisdictionName(state ?? seat.jurisdiction) ?? 'Jurisdiction not recorded'}`
                : undefined
            }
            detail={asAt ? `As at ${formatDate(asAt)}` : 'Date not published'}
            onPress={
              profile ? () => router.push(personRoute(profile.slug)) : undefined
            }
          />
        );
      })}
    </RowList>
  );
}
